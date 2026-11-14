#include "adaptive.h"

#include <filesystem>
#include <iostream>
#include <string>

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <image> [more images...]\n";
        return 1;
    }
    std::filesystem::create_directories("imdebug");

    for (int a = 1; a < argc; ++a) {
        const std::string path = argv[a];
        std::cout << "=== " << path << "\n";

        const cv::Mat image = cv::imread(path, cv::IMREAD_COLOR);
        if (image.empty()) {
            std::cout << "  could not load this file\n";
            continue;  // go on to the next image
        }

        const SignalMap sig = computeSignalMap(image);
        const EarthAnalysis analysis = analyzeAdaptive(sig);
        const EarthMood mood = decideMoodAdaptive(sig);

        std::cout << "  background covers " << 100.0 * sig.backgroundShare << "% of the map, colour (B,G,R) = "
                  << static_cast<int>(sig.backgroundBgr[0]) << ", "
                  << static_cast<int>(sig.backgroundBgr[1]) << ", "
                  << static_cast<int>(sig.backgroundBgr[2]) << "\n";
        std::cout << "  average signal: " << sig.meanIntensity << "\n";
        std::cout << "  => " << (mood.major ? "major" : "minor") << ", " << mood.bpm << " BPM\n";

        // Two compact strips, one digit per column.
        double maxSignal = 0.0;
        for (const ColumnStats& col : analysis.columns) maxSignal = std::max(maxSignal, col.landFraction);

        std::cout << "  signal strength per column (0-9): ";
        for (const ColumnStats& col : analysis.columns) {
            const int digit = (maxSignal > 0.0) ? std::min(9, static_cast<int>(9.0 * col.landFraction / maxSignal + 0.5)) : 0;
            std::cout << digit << ' ';
        }
        std::cout << "\n  height of the signal (0 = bottom, 9 = top): ";
        for (const ColumnStats& col : analysis.columns) {
            std::cout << static_cast<int>(col.landPos * 9.0 + 0.5) << ' ';
        }
        std::cout << "\n";

        // Heatmap next to the original: bright = far from the background = strong signal.
        cv::Mat level8;
        sig.intensity.convertTo(level8, CV_8U, 255.0);
        cv::Mat heat;
        cv::applyColorMap(level8, heat, cv::COLORMAP_INFERNO);
        cv::Mat both;
        cv::hconcat(sig.preview, heat, both);

        const std::string outPath = "imdebug/" + std::filesystem::path(path).stem().string() + "_signal.png";
        cv::imwrite(outPath, both);
        std::cout << "  saved " << outPath << "\n";
    }
    return 0;
}