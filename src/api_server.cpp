// httplib caps form-urlencoded bodies at 8 KB, and curl sends raw bytes with that
// type by default. Give them the same 20 MB limit as everything else.
#define CPPHTTPLIB_FORM_URL_ENCODED_PAYLOAD_MAX_LENGTH (20 * 1024 * 1024)
#include "httplib.h"
#include "music_engine.h"
#include "wav_writer.h"

#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <iostream>
#include <mutex>
#include <random>
#include <stdexcept>
#include <string>

constexpr int kPort = 8080;
constexpr int kSampleRate = 44100;
constexpr std::size_t kMaxUploadBytes = 20 * 1024 * 1024;  // 20 MB
constexpr long long kMaxPixels = 40'000'000;  // a 20 MB PNG can still decode to gigabytes
constexpr int kMaxJobs = 2;                   // images processed at once; the rest wait

std::string errorJson(const std::string& message) {
    return "{\"error\": \"" + jsonEscape(message) + "\"}";
}

void sendError(httplib::Response& res, int status, const std::string& message) {
    res.status = status;
    res.set_content(errorJson(message), "application/json");
}

// 16 random hex chars, so nobody can guess other people's audio URLs.
std::string randomId() {
    thread_local std::random_device rd;
    std::uint64_t v = (static_cast<std::uint64_t>(rd()) << 32) | rd();
    static const char* hex = "0123456789abcdef";
    std::string id;
    for (int i = 0; i < 16; ++i) {
        id += hex[v & 0xf];
        v >>= 4;
    }
    return id;
}

// Width/height straight from a PNG or JPEG header, without decoding the image.
// Returns false for anything else (OpenCV still gets a go at it).
bool peekSize(const std::string& b, long long& w, long long& h) {
    auto u8 = [&](std::size_t i) { return static_cast<unsigned char>(b[i]); };
    if (b.size() >= 24 && b.compare(0, 8, "\x89PNG\r\n\x1a\n") == 0) {
        w = (u8(16) << 24) | (u8(17) << 16) | (u8(18) << 8) | u8(19);
        h = (u8(20) << 24) | (u8(21) << 16) | (u8(22) << 8) | u8(23);
        return true;
    }
    if (b.size() >= 4 && u8(0) == 0xFF && u8(1) == 0xD8) {
        std::size_t i = 2;
        while (i + 9 < b.size()) {
            if (u8(i) != 0xFF) { ++i; continue; }
            const int marker = u8(i + 1);
            const std::size_t len = (u8(i + 2) << 8) | u8(i + 3);
            // SOF0..SOF15 hold the size (C4, C8 and CC are something else).
            if (marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC) {
                h = (u8(i + 5) << 8) | u8(i + 6);
                w = (u8(i + 7) << 8) | u8(i + 8);
                return true;
            }
            i += 2 + len;
        }
    }
    return false;
}

// Lets at most kMaxJobs requests run the (CPU-heavy) pipeline at the same time.
class JobSlots {
public:
    explicit JobSlots(int n) : free_(n) {}
    void take() {
        std::unique_lock<std::mutex> lock(m_);
        cv_.wait(lock, [&] { return free_ > 0; });
        --free_;
    }
    void give() {
        { std::lock_guard<std::mutex> lock(m_); ++free_; }
        cv_.notify_one();
    }
private:
    std::mutex m_;
    std::condition_variable cv_;
    int free_;
};

// Empty means "use the default" (adaptive, since most uploads are data maps).
bool parseMode(const std::string& text, AnalysisMode& mode) {
    if (text.empty() || text == "adaptive") {
        mode = AnalysisMode::Adaptive;
        return true;
    }
    if (text == "terrain") {
        mode = AnalysisMode::Terrain;
        return true;
    }
    return false;
}

int main() {
    const std::string outputDir = "output";  // WAVs go here, served under /audio
    std::filesystem::create_directories(outputDir);

    int port = kPort;
    if (const char* envPort = std::getenv("PORT")) {
        port = std::stoi(envPort);
    }

    httplib::Server svr;
    svr.set_default_headers({
        {"Access-Control-Allow-Origin", "*"},
        {"Access-Control-Allow-Methods", "GET, POST, OPTIONS"},
        {"Access-Control-Allow-Headers", "Content-Type"}
    });
    svr.Options(".*", [](const httplib::Request&, httplib::Response& res) {
        res.status = 204;
    });

    svr.set_payload_max_length(kMaxUploadBytes);
    svr.set_file_extension_and_mimetype_mapping("wav", "audio/wav");
    if (!svr.set_mount_point("/audio", outputDir)) {
        std::cerr << "Could not serve the '" << outputDir << "' folder.\n";
        return 1;
    }

    // Any error httplib produces itself (404, 413, ...) also comes back as {"error": "..."}.
    svr.set_error_handler([](const httplib::Request&, httplib::Response& res) {
        if (!res.body.empty()) return httplib::Server::HandlerResponse::Unhandled;  // already ours
        const std::string message = (res.status == 413)
                                        ? "image is too big (max 20 MB)"
                                        : httplib::status_message(res.status);
        res.set_content(errorJson(message), "application/json");
        return httplib::Server::HandlerResponse::Handled;
    });

    svr.Get("/api/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"status\": \"ok\"}", "application/json");
    });

    JobSlots slots(kMaxJobs);

    // Takes either FormData (file field "image") or the raw image bytes as the body.
    // Mode: ?mode=adaptive|terrain, or a "mode" form field. Defaults to adaptive.
    // Crop: ?crop=0..0.3 (or a form field), the share of the bottom to ignore. Defaults to 0.12.
    svr.Post("/api/analyze", [&](const httplib::Request& req, httplib::Response& res) {
        std::string modeText = req.get_param_value("mode");
        std::string cropText = req.get_param_value("crop");
        std::string imageName = "upload";
        std::string formBytes;
        const std::string* bytes = &req.body;

        if (req.is_multipart_form_data()) {
            if (!req.form.has_file("image")) {
                sendError(res, 400, "FormData needs a file field called \"image\"");
                return;
            }
            const httplib::FormData file = req.form.get_file("image");
            formBytes = file.content;
            bytes = &formBytes;
            if (!file.filename.empty()) imageName = file.filename;
            if (modeText.empty() && req.form.has_field("mode")) {
                modeText = req.form.get_field("mode");
            }
            if (cropText.empty() && req.form.has_field("crop")) {
                cropText = req.form.get_field("crop");
            }
        }

        AnalysisMode mode;
        if (!parseMode(modeText, mode)) {
            sendError(res, 400, "mode must be \"adaptive\" or \"terrain\"");
            return;
        }
        // crop = share of the bottom to ignore (legends, timestamps). 0 for clean images.
        double crop = kCropBottom;
        if (!cropText.empty()) {
            try {
                std::size_t used = 0;
                crop = std::stod(cropText, &used);
                if (used != cropText.size() || crop < 0.0 || crop > kMaxCrop) throw std::invalid_argument("");
            } catch (const std::exception&) {
                sendError(res, 400, "crop must be a number from 0 to 0.3");
                return;
            }
        }
        if (bytes->empty()) {
            sendError(res, 400, "no image: send FormData with an \"image\" file, or the raw image bytes");
            return;
        }

        long long w = 0, h = 0;
        if (peekSize(*bytes, w, h) && w * h > kMaxPixels) {
            sendError(res, 413, "image is too large: " + std::to_string(w) + "x" + std::to_string(h) +
                                    " (max 40 megapixels)");
            return;
        }

        slots.take();
        struct Release { JobSlots& s; ~Release() { s.give(); } } release{slots};  // frees the slot however we leave

        try {
            // Wraps the bytes without copying them; imdecode spots PNG/JPEG/etc by itself.
            const cv::Mat raw(1, static_cast<int>(bytes->size()), CV_8UC1,
                              const_cast<char*>(bytes->data()));
            const cv::Mat image = cv::imdecode(raw, cv::IMREAD_COLOR);
            if (image.empty()) {
                sendError(res, 400, "could not decode the image (PNG or JPEG please)");
                return;
            }

            EarthResult result;
            std::string error;
            if (!generateMusic(image, kSampleRate, mode, result, error, false, crop)) {
                sendError(res, 422, error);
                return;
            }

            const std::string id = randomId();
            if (!writeWav16(outputDir + "/" + id + ".wav", result.audio, result.sampleRate)) {
                sendError(res, 500, "could not write the audio file");
                return;
            }

            res.set_content(buildJson(imageName, "/audio/" + id + ".wav", result), "application/json");
            std::cout << "analyze: " << bytes->size() << " bytes, " << modeName(mode) << " -> " << id
                      << " (" << result.notes.size() << " notes, " << result.durationSec << " s)\n";
        } catch (const std::exception& e) {
            sendError(res, 500, e.what());  // don't let one bad image take the server down
        }
    });

    std::cout << "Server running on port " << port << ".\n"
              << "  GET  http://localhost:" << port << "/api/health\n"
              << "  POST http://localhost:" << port << "/api/analyze?mode=adaptive|terrain&crop=0..0.3\n"
              << "  GET  http://localhost:" << port << "/audio/<id>.wav\n";

    if (!svr.listen("0.0.0.0", port)) {
        std::cerr << "Could not start the server. Is port " << port << " already in use?\n";
        return 1;
    }
    return 0;
}
