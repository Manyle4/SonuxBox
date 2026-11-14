#pragma once

#include "earth_pipeline.h"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <vector>

// The "signal" of an image: how much each pixel differs from the image's own background.
struct SignalMap {
    cv::Mat intensity;             // CV_32F, values 0..1, same size as the analysed map
    cv::Mat preview;               // the cropped colour map, for debug pictures
    cv::Vec3b backgroundBgr;       // colour of the background cluster
    double backgroundShare = 0.0;  // how much of the image the background covers (0..1)
    double meanIntensity = 0.0;    // average signal over the whole map (0..1)
};

// Learn the image's palette with K-means and measure every pixel against the background.
inline SignalMap computeSignalMap(const cv::Mat& image, int k = 4) {
    SignalMap out;

    // 256-pixel-wide copy, legend strip cut off, lightly blurred to calm noise and thin text.
    const double scale = 256.0 / image.cols;
    cv::Mat mid;
    cv::resize(image, mid, cv::Size(), scale, scale, cv::INTER_AREA);
    const int keepRows = static_cast<int>(mid.rows * (1.0 - kCropBottom));
    cv::Mat map = mid(cv::Rect(0, 0, mid.cols, keepRows)).clone();
    cv::GaussianBlur(map, map, cv::Size(3, 3), 0);
    out.preview = map;

    // Lab colour space, then one row per pixel for K-means.
    cv::Mat lab;
    cv::cvtColor(map, lab, cv::COLOR_BGR2Lab);
    cv::Mat samples = lab.reshape(1, lab.rows * lab.cols);
    samples.convertTo(samples, CV_32F);

    cv::setRNGSeed(42);  // same image -> same clusters, every run
    cv::Mat labels, centers;
    cv::kmeans(samples, k, labels,
               cv::TermCriteria(cv::TermCriteria::EPS + cv::TermCriteria::COUNT, 20, 1.0),
               3, cv::KMEANS_PP_CENTERS, centers);

    // The biggest cluster is the background.
    std::vector<int> counts(k, 0);
    for (int i = 0; i < labels.rows; ++i) counts[labels.at<int>(i)] += 1;
    // max_element gives an iterator (a pointer-like position); subtracting begin() turns it into an index.
    const int bg = static_cast<int>(std::max_element(counts.begin(), counts.end()) - counts.begin());
    out.backgroundShare = static_cast<double>(counts[bg]) / labels.rows;

    const float bgL = centers.at<float>(bg, 0);
    const float bgA = centers.at<float>(bg, 1);
    const float bgB = centers.at<float>(bg, 2);
    const cv::Mat px(1, 1, CV_8UC3, cv::Scalar(bgL, bgA, bgB));
    cv::Mat bgr;
    cv::cvtColor(px, bgr, cv::COLOR_Lab2BGR);
    out.backgroundBgr = bgr.at<cv::Vec3b>(0, 0);

    // Distance of every pixel's colour from the background colour.
    cv::Mat dist(lab.size(), CV_32F);
    std::vector<float> all;
    all.reserve(static_cast<std::size_t>(lab.rows) * lab.cols);
    for (int y = 0; y < lab.rows; ++y) {
        for (int x = 0; x < lab.cols; ++x) {
            const cv::Vec3b p = lab.at<cv::Vec3b>(y, x);
            const float dl = p[0] - bgL, da = p[1] - bgA, db = p[2] - bgB;
            const float d = std::sqrt(dl * dl + da * da + db * db);
            dist.at<float>(y, x) = d;
            all.push_back(d);
        }
    }

    // Scale by the 99th-percentile distance, so one bright speck can't squash everything else.
    // The floor of 20 stops a nearly-uniform image from being blown up into fake signal.
    const std::size_t idx = static_cast<std::size_t>(all.size() * 0.99);
    std::nth_element(all.begin(), all.begin() + idx, all.end());
    const float scaleD = std::max(all[idx], 20.0f);

    out.intensity = cv::Mat(lab.size(), CV_32F);
    double sum = 0.0;
    for (int y = 0; y < lab.rows; ++y) {
        for (int x = 0; x < lab.cols; ++x) {
            const float v = std::min(dist.at<float>(y, x) / scaleD, 1.0f);
            out.intensity.at<float>(y, x) = v;
            sum += v;
        }
    }
    out.meanIntensity = sum / (static_cast<double>(lab.rows) * lab.cols);
    return out;
}

// Turn the signal map into the same per-column numbers the melody code already understands.
// (Field names still say "land" because buildNotes reads them: here
//  landFraction = signal strength, landPos = height of the signal, fraction[Ocean] = quiet share.)
inline EarthAnalysis analyzeAdaptive(const SignalMap& sig) {
    const cv::Mat& I = sig.intensity;  // a reference: no copying
    EarthAnalysis result;
    result.columns.resize(kColumns);
    result.overall[static_cast<int>(Terrain::Ocean)] = sig.backgroundShare;

    for (int c = 0; c < kColumns; ++c) {
        const int x0 = c * I.cols / kColumns;
        const int x1 = (c + 1) * I.cols / kColumns;

        double sum = 0.0, rowWeighted = 0.0, total = 0.0, quiet = 0.0;
        for (int y = 0; y < I.rows; ++y) {
            for (int x = x0; x < x1; ++x) {
                const double v = I.at<float>(y, x);
                sum += v;
                rowWeighted += v * y;
                total += 1.0;
                if (v < 0.15) quiet += 1.0;
            }
        }

        ColumnStats& col = result.columns[c];
        col.landFraction = sum / total;  // average signal in this column
        col.fraction[static_cast<int>(Terrain::Ocean)] = quiet / total;
        if (sum > 1e-6) {
            // Signal-weighted vertical centre; flip so the top of the map = high pitch.
            col.landPos = 1.0 - (rowWeighted / sum) / (I.rows - 1);
        }
    }
    return result;
}

// Mood from the data: a lot of signal = heavy (minor, faster); little signal = light (major).
inline EarthMood decideMoodAdaptive(const SignalMap& sig) {
    EarthMood mood;
    mood.major = sig.meanIntensity < 0.25;
    mood.bpm = std::clamp(70.0 + 100.0 * sig.meanIntensity, 60.0, 120.0);
    return mood;
}