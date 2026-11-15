#include "music_engine.h"
#include "wav_writer.h"

#include <cstddef>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

int main(int argc, char** argv) {
    // Separate the --adaptive flag from the normal arguments, wherever it appears.
    AnalysisMode mode = AnalysisMode::Terrain;
    double crop = kCropBottom, cropTop = 0.0;
    std::vector<std::string> args;
    for (int i = 1; i < argc; ++i) {
        const std::string a = argv[i];
        if (a == "--adaptive") {
            mode = AnalysisMode::Adaptive;
        } else if (a.rfind("--crop=", 0) == 0) {
            crop = std::stod(a.substr(7));  // share of the bottom to ignore, 0..0.3
        } else if (a.rfind("--crop-top=", 0) == 0) {
            cropTop = std::stod(a.substr(11));  // share of the top to ignore (logos)
        } else {
            args.push_back(a);
        }
    }
    if (args.empty()) {
        std::cerr << "Usage: " << argv[0] << " <image> [output.wav] [--adaptive] [--crop=0..0.3] [--crop-top=0..0.3]\n";
        return 1;
    }
    const std::string inPath = args[0];
    const std::string outPath = (args.size() >= 2) ? args[1] : "earth_story.wav";

    // The JSON file shares the WAV's name: "earth_story.wav" -> "earth_story.json".
    std::string jsonPath = outPath;
    const std::size_t dot = jsonPath.rfind('.');
    if (dot != std::string::npos) jsonPath.erase(dot);
    jsonPath += ".json";

    const cv::Mat image = cv::imread(inPath, cv::IMREAD_COLOR);
    if (image.empty()) {
        std::cerr << "Could not load image: " << inPath << "\n";
        return 1;
    }

    EarthResult result;
    std::string error;
    if (!generateMusic(image, 44100, mode, result, error, /*verbose=*/true, crop, cropTop)) {
        std::cerr << "Failed: " << error << "\n";
        return 1;
    }

    std::cout << "analysis mode: " << modeName(mode) << "\n";
    if (mode == AnalysisMode::Terrain) {
        std::cout << "share of the map:\n";
        for (int i = 0; i < kTerrainCount; ++i) {
            std::cout << "  " << terrainName(static_cast<Terrain>(i)) << ": "
                      << 100.0 * result.analysis.overall[i] << "%\n";
        }
    }
    std::cout << "=> " << result.mood.scaleName << ", " << result.mood.bpm << " BPM\n";
    std::cout << "Generated " << result.notes.size() << " notes.\n";

    if (!writeWav16(outPath, result.audio, result.sampleRate)) {
        std::cerr << "Failed to write " << outPath << "\n";
        return 1;
    }
    std::ofstream jsonFile(jsonPath);
    if (!jsonFile) {
        std::cerr << "Failed to write " << jsonPath << "\n";
        return 1;
    }
    jsonFile << buildJson(inPath, outPath, result);

    std::cout << "Wrote " << outPath << " and " << jsonPath << "\n";
    return 0;
}

