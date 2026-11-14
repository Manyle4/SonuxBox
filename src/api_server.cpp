#include "httplib.h"
#include "earth_pipeline.h"
#include "wav_writer.h"

#include <atomic>
#include <chrono>
#include <cstddef>
#include <exception>
#include <filesystem>
#include <iostream>
#include <string>
#include <vector>

#include <cstdlib>

constexpr int kPort = 8080;
constexpr int kSampleRate = 44100;
constexpr std::size_t kMaxUploadBytes = 20 * 1024 * 1024;  // refuse uploads over 20 MB

// Reply with an error as JSON, so the web team's code can read the message.
void sendError(httplib::Response& res, int status, const std::string& message) {
    res.status = status;
    res.set_content("{\"error\": \"" + jsonEscape(message) + "\"}", "application/json");
}

int main() {
    // Generated WAV files go in ./output, which the server also serves under /audio.
    const std::string outputDir = "output";
    std::filesystem::create_directories(outputDir);  // does nothing if it already exists

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

    svr.Get("/api/health", [](const httplib::Request& /*req*/, httplib::Response& res) {
        res.set_content("{\"status\": \"ok\"}", "application/json");
    });

    // Every result gets a unique id: start time + a counter that goes up by one per request.
    // std::atomic makes the counter safe when several requests arrive at once (each on its own thread).
    std::atomic<unsigned> counter{0};
    const long long startTime = std::chrono::duration_cast<std::chrono::seconds>(
                                    std::chrono::system_clock::now().time_since_epoch())
                                    .count();

    // [&] = this lambda may use the variables around it (counter, startTime, outputDir).
    svr.Post("/api/analyze", [&](const httplib::Request& req, httplib::Response& res) {
        // 1. The request body must contain image bytes.
        if (req.body.empty()) {
            sendError(res, 400, "empty request body: send the image file's bytes as the POST body");
            return;
        }

        try {
            // 2. Turn the raw bytes into an OpenCV image (PNG, JPEG, etc. are detected automatically).
            const std::vector<unsigned char> bytes(req.body.begin(), req.body.end());
            const cv::Mat image = cv::imdecode(bytes, cv::IMREAD_COLOR);
            if (image.empty()) {
                sendError(res, 400, "could not decode the image: send a PNG or JPEG as the raw POST body");
                return;
            }

            // 3. Run the pipeline you already built.
            EarthResult result;
            std::string error;
            if (!generateEarthMusic(image, kSampleRate, result, error)) {
                sendError(res, 422, error);
                return;
            }

            // 4. Save the audio and answer with the JSON.
            const std::string id = "map_" + std::to_string(startTime) + "_" + std::to_string(counter++);
            const std::string wavPath = outputDir + "/" + id + ".wav";
            if (!writeWav16(wavPath, result.audio, result.sampleRate)) {
                sendError(res, 500, "could not write the audio file");
                return;
            }

            res.set_content(buildJson("upload", "/audio/" + id + ".wav", result), "application/json");
            std::cout << "analyze: " << req.body.size() << " bytes -> " << id << " ("
                      << result.notes.size() << " notes, " << result.durationSec << " s)\n";
        } catch (const std::exception& e) {
            // Any unexpected failure becomes a clean 500 reply instead of crashing the server.
            sendError(res, 500, e.what());
        }
    });

    std::cout << "Server running on port " << port << ".\n"
              << "  GET  http://localhost:" << port << "/api/health\n"
              << "  POST http://localhost:" << port << "/api/analyze   (body = image bytes)\n"
              << "  GET  http://localhost:" << port << "/audio/<id>.wav\n"
              << "Press Ctrl+C to stop.\n";

    if (!svr.listen("0.0.0.0", port)) {
        std::cerr << "Could not start the server. Is port " << port << " already in use?\n";
        return 1;
    }
    return 0;
}