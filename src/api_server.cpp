#include "httplib.h"
#include "music_engine.h"
#include "wav_writer.h"

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <iostream>
#include <random>
#include <string>

constexpr int kPort = 8080;
constexpr int kSampleRate = 44100;
constexpr std::size_t kMaxUploadBytes = 20 * 1024 * 1024;  // 20 MB

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

    // Takes either FormData (file field "image") or the raw image bytes as the body.
    // Mode: ?mode=adaptive|terrain, or a "mode" form field. Defaults to adaptive.
    svr.Post("/api/analyze", [&](const httplib::Request& req, httplib::Response& res) {
        std::string modeText = req.get_param_value("mode");
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
        }

        AnalysisMode mode;
        if (!parseMode(modeText, mode)) {
            sendError(res, 400, "mode must be \"adaptive\" or \"terrain\"");
            return;
        }
        if (bytes->empty()) {
            sendError(res, 400, "no image: send FormData with an \"image\" file, or the raw image bytes");
            return;
        }

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
            if (!generateMusic(image, kSampleRate, mode, result, error)) {
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
              << "  POST http://localhost:" << port << "/api/analyze?mode=adaptive|terrain\n"
              << "  GET  http://localhost:" << port << "/audio/<id>.wav\n";

    if (!svr.listen("0.0.0.0", port)) {
        std::cerr << "Could not start the server. Is port " << port << " already in use?\n";
        return 1;
    }
    return 0;
}
