#include "terrain.h"

#include <iostream>
#include <string>

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <image>\n";
        return 1;
    }
    const cv::Mat image = cv::imread(argv[1], cv::IMREAD_COLOR);
    if (image.empty()) {
        std::cerr << "Could not load image: " << argv[1] << "\n";
        return 1;
    }

    // Work on a 256-pixel-wide copy, as before.
    const double scale = 256.0 / image.cols;
    cv::Mat mid;
    cv::resize(image, mid, cv::Size(), scale, scale, cv::INTER_AREA);

    cv::Mat hsv;
    cv::cvtColor(mid, hsv, cv::COLOR_BGR2HSV);

    cv::Mat classes(mid.size(), CV_8UC3);
    int counts[kTerrainCount] = {0, 0, 0, 0, 0, 0};

    for (int y = 0; y < hsv.rows; ++y) {
        for (int x = 0; x < hsv.cols; ++x) {
            const Terrain t = classifyPixel(hsv.at<cv::Vec3b>(y, x));
            counts[static_cast<int>(t)] += 1;
            classes.at<cv::Vec3b>(y, x) = terrainDebugColor(t);
        }
    }

    const double total = static_cast<double>(hsv.rows) * hsv.cols;
    std::cout << "class         % of image\n";
    for (int i = 0; i < kTerrainCount; ++i) {
        std::cout << terrainName(static_cast<Terrain>(i)) << ":  "
                  << 100.0 * counts[i] / total << "\n";
    }

    // Original on the left, classified version on the right.
    cv::Mat both;
    cv::hconcat(mid, classes, both);
    cv::imwrite("compare.png", both);
    std::cout << "Saved compare.png (left = original, right = classified)\n";

    cv::imshow("original | classified", both);
    cv::waitKey(0);
    return 0;
}