#include <opencv2/opencv.hpp>

#include <algorithm>
#include <cstdlib>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>

constexpr double kDebugCropBottom = 0.12;  // skip the legend strip at the bottom

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <image> [number of clusters, 2-8, default 4]\n";
        return 1;
    }
    const int k = (argc >= 3) ? std::atoi(argv[2]) : 4;
    if (k < 2 || k > 8) {
        std::cerr << "Number of clusters must be between 2 and 8.\n";
        return 1;
    }
    const cv::Mat image = cv::imread(argv[1], cv::IMREAD_COLOR);
    if (image.empty()) {
        std::cerr << "Could not load image: " << argv[1] << "\n";
        return 1;
    }

    // 256-pixel-wide copy, legend strip cut off. clone() makes a real, separate copy of the
    // cropped pixels, because reshape() below needs the data in one continuous block.
    const double scale = 256.0 / image.cols;
    cv::Mat mid;
    cv::resize(image, mid, cv::Size(), scale, scale, cv::INTER_AREA);
    const int keepRows = static_cast<int>(mid.rows * (1.0 - kDebugCropBottom));
    const cv::Mat map = mid(cv::Rect(0, 0, mid.cols, keepRows)).clone();

    // Lab colour space: distances between colours match what the eye sees.
    cv::Mat lab;
    cv::cvtColor(map, lab, cv::COLOR_BGR2Lab);

    // K-means wants a list of samples: one row per pixel, one column per channel (L, a, b).
    cv::Mat samples = lab.reshape(1, lab.rows * lab.cols);
    samples.convertTo(samples, CV_32F);

    // K-means starts from random guesses. A fixed seed means the same image gives the same
    // clusters every run, which matters for a demo.
    cv::setRNGSeed(42);
    cv::Mat labels, centers;
    cv::kmeans(samples, k, labels,
               cv::TermCriteria(cv::TermCriteria::EPS + cv::TermCriteria::COUNT, 20, 1.0),
               3, cv::KMEANS_PP_CENTERS, centers);

    // Cluster numbers are arbitrary, so sort them by brightness (the L value of the centre).
    // rank 0 = darkest cluster ... rank k-1 = brightest. Ranks mean the same on every image.
    std::vector<int> order(k);
    std::iota(order.begin(), order.end(), 0);  // fills 0, 1, 2, ... k-1
    std::sort(order.begin(), order.end(), [&](int a, int b) {
        return centers.at<float>(a, 0) < centers.at<float>(b, 0);
    });
    std::vector<int> rankOf(k);
    for (int r = 0; r < k; ++r) rankOf[order[r]] = r;

    // A display colour for each rank: its centre, converted from Lab back to BGR.
    std::vector<cv::Vec3b> rankColor(k);
    std::vector<double> rankL(k, 0.0);
    for (int r = 0; r < k; ++r) {
        const int c = order[r];
        const cv::Mat px(1, 1, CV_8UC3, cv::Scalar(centers.at<float>(c, 0),
                                                    centers.at<float>(c, 1),
                                                    centers.at<float>(c, 2)));
        cv::Mat bgr;
        cv::cvtColor(px, bgr, cv::COLOR_Lab2BGR);
        rankColor[r] = bgr.at<cv::Vec3b>(0, 0);
        rankL[r] = centers.at<float>(c, 0) / 255.0 * 100.0;  // OpenCV scales L to 0..255
    }

    // Paint every pixel with its cluster's colour, and count how big each cluster is.
    cv::Mat segmented(map.size(), CV_8UC3);
    std::vector<int> counts(k, 0);
    for (int y = 0; y < map.rows; ++y) {
        for (int x = 0; x < map.cols; ++x) {
            const int original = labels.at<int>(y * map.cols + x);  // labels is one long column
            const int rank = rankOf[original];
            counts[rank] += 1;
            segmented.at<cv::Vec3b>(y, x) = rankColor[rank];
        }
    }

    const double total = static_cast<double>(map.rows) * map.cols;
    std::cout << "clusters, darkest to brightest:\n";
    for (int r = 0; r < k; ++r) {
        std::cout << "  rank " << r << ": " << 100.0 * counts[r] / total << "% of the map, brightness "
                  << rankL[r] << "/100, colour (B,G,R) = " << static_cast<int>(rankColor[r][0]) << ", "
                  << static_cast<int>(rankColor[r][1]) << ", " << static_cast<int>(rankColor[r][2]) << "\n";
    }

    cv::Mat both;
    cv::hconcat(map, segmented, both);
    cv::imwrite("cluster_debug.png", both);
    std::cout << "Saved cluster_debug.png (left = original, right = clusters)\n";

    cv::imshow("original | clusters", both);
    cv::waitKey(0);
    return 0;
}