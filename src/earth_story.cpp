#include "earth_pipeline.h"
#include "wav_writer.h"

#include <cstddef>
#include <fstream>
#include <iostream>
#include <string>

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <earth_map> [output.wav]\n";
        return 1;
    }
    const std::string inPath = argv[1];
    const std::string outPath = (argc >= 3) ? argv[2] : "earth_story.wav";

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
    if (!generateEarthMusic(image, 44100, result, error, /*verbose=*/true)) {
        std::cerr << "Failed: " << error << "\n";
        return 1;
    }

    std::cout << "share of the map:\n";
    for (int i = 0; i < kTerrainCount; ++i) {
        std::cout << "  " << terrainName(static_cast<Terrain>(i)) << ": "
                  << 100.0 * result.analysis.overall[i] << "%\n";
    }
    std::cout << "=> " << (result.mood.major ? "major" : "minor") << " pentatonic, "
              << result.mood.bpm << " BPM\n";
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