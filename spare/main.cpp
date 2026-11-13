#include <opencv2/opencv.hpp>
#include <iostream>
#include <string>

int main(int argc, char** argv) {

    if (argc < 2) {
        std::cerr <<"Usage: "<<argv[0]<<" <path-to-image>\n";
        return 1;
    }

    const std::string path = argv[1];

    cv::Mat image = cv::imread(path, cv::IMREAD_COLOR);
    if (image.empty()) {
        std::cerr << "Could not load image: " << path << "\n";
        return 1;
    }

    std::cout << "Loaded " << path << "\n"<< "  width:    " << image.cols << "\n"<< "  height:   " << image.rows << "\n"<< "  channels: " << image.channels() << "\n";

    cv::Scalar avg = cv::mean(image);
    std::cout << "  average B,G,R: "
              << avg[0] << ", " << avg[1] << ", " << avg[2] << "\n";

    cv::Mat small;
    cv::resize(image, small, cv::Size(64, 64), 0, 0, cv::INTER_AREA);
    cv::imwrite("small_64x64.png", small);
    std::cout << "Saved small_64x64.png\n";

    cv::imshow("Original", image);
    cv::waitKey(0);

    return 0;
}