#pragma once

#include "earth_pipeline.h"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdio>
#include <string>
#include <vector>

// The "signal" of an image: how much each pixel differs from the image's own background.
struct SignalMap {
    cv::Mat intensity;             // CV_32F, values 0..1, same size as the analysed map
    cv::Mat preview;               // the cropped colour map, for debug pictures
    cv::Vec3b backgroundBgr;       // colour of the background cluster
    double backgroundShare = 0.0;  // how much of the image the background covers (0..1)
    double meanIntensity = 0.0;    // average signal over the whole map (0..1)
    cv::Mat labels;                       // CV_32S: which colour cluster each pixel is in
    std::vector<cv::Vec3b> clusterBgr;    // colour of each cluster
    std::vector<double> clusterShare;     // how much of the image each cluster covers
    int background = 0;                   // index of the background cluster
};

// Learn the image's palette with K-means and measure every pixel against the background.
inline SignalMap computeSignalMap(const cv::Mat& image, int k = 4, double cropBottom = kCropBottom,
                                  double cropTop = 0.0) {
    SignalMap out;

    // 256-pixel-wide copy, legend strip cut off, lightly blurred to calm noise and thin text.
    const double scale = 256.0 / image.cols;
    cv::Mat mid;
    cv::resize(image, mid, cv::Size(), scale, scale, cv::INTER_AREA);
    cv::Mat map = cropRows(mid, cropTop, cropBottom).clone();
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
    out.background = bg;
    out.labels = labels.reshape(1, lab.rows);
    for (int i = 0; i < k; ++i) {
        const cv::Mat px(1, 1, CV_8UC3, cv::Scalar(centers.at<float>(i, 0), centers.at<float>(i, 1), centers.at<float>(i, 2)));
        cv::Mat c;
        cv::cvtColor(px, c, cv::COLOR_Lab2BGR);
        out.clusterBgr.push_back(c.at<cv::Vec3b>(0, 0));
        out.clusterShare.push_back(static_cast<double>(counts[i]) / labels.rows);
    }

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
        std::vector<double> rowSignal(I.rows, 0.0);
        for (int y = 0; y < I.rows; ++y) {
            for (int x = x0; x < x1; ++x) {
                const double v = I.at<float>(y, x);
                sum += v;
                rowSignal[y] += v;
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
        col.peakPos = peakHeight(rowSignal, col.landPos);
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

// ---- Colour layers: each non-background colour gets its own instrument ----

// Plain-English name for a colour, for the page and the narration.
inline std::string colourName(const cv::Vec3b& bgr) {
    const cv::Mat px(1, 1, CV_8UC3, cv::Scalar(bgr[0], bgr[1], bgr[2]));
    cv::Mat hsv;
    cv::cvtColor(px, hsv, cv::COLOR_BGR2HSV_FULL);  // hue 0..255 for the full circle
    const cv::Vec3b c = hsv.at<cv::Vec3b>(0, 0);
    const double h = c[0] * 360.0 / 256.0, s = c[1] / 255.0, v = c[2] / 255.0;
    if (v < 0.2) return "black";
    if (s < 0.2) return v > 0.75 ? "white" : "grey";
    const std::string dark = v < 0.45 ? "dark " : "";
    if (h < 15 || h >= 345) return dark + "red";
    if (h < 40) return dark + "orange";
    if (h < 68) return dark + "yellow";
    if (h < 160) return dark + "green";
    if (h < 200) return dark + "cyan";
    if (h < 255) return dark + "blue";
    if (h < 290) return dark + "purple";
    return dark + "pink";
}

inline std::string hexColour(const cv::Vec3b& bgr) {
    char buf[8];
    std::snprintf(buf, sizeof buf, "#%02x%02x%02x", bgr[2], bgr[1], bgr[0]);
    return buf;
}

struct ColourLayer {
    LayerInfo info;
    std::vector<double> strength;  // per column: this colour's signal / column size
    std::vector<double> pos;       // per column: height of this colour (0 bottom .. 1 top)
};

// The data's own colour families: cluster just the clearly-signal pixels by colour, and
// keep up to two families (biggest first) as layers. Purple dust vs green sea salt, say.
inline std::vector<ColourLayer> findLayers(const SignalMap& sig) {
    const cv::Mat& I = sig.intensity;
    cv::Mat lab;
    cv::cvtColor(sig.preview, lab, cv::COLOR_BGR2Lab);

    std::vector<cv::Point> where;
    cv::Mat samples(0, 3, CV_32F);
    for (int y = 0; y < I.rows; ++y) {
        for (int x = 0; x < I.cols; ++x) {
            if (I.at<float>(y, x) < 0.3f) continue;
            const cv::Vec3b p = lab.at<cv::Vec3b>(y, x);
            cv::Mat row(1, 3, CV_32F);
            for (int ch = 0; ch < 3; ++ch) row.at<float>(0, ch) = p[ch];
            samples.push_back(row);
            where.emplace_back(x, y);
        }
    }
    std::vector<ColourLayer> layers;
    if (samples.rows < 0.02 * I.rows * I.cols || samples.rows < 50) return layers;  // too little signal

    constexpr int kFamilies = 5;
    cv::setRNGSeed(7);
    cv::Mat labels, centers;
    cv::kmeans(samples, kFamilies, labels, cv::TermCriteria(cv::TermCriteria::EPS + cv::TermCriteria::COUNT, 20, 1.0),
               3, cv::KMEANS_PP_CENTERS, centers);

    std::vector<int> counts(kFamilies, 0);
    for (int i = 0; i < labels.rows; ++i) counts[labels.at<int>(i)] += 1;
    std::vector<int> order(kFamilies);
    for (int i = 0; i < kFamilies; ++i) order[i] = i;
    std::sort(order.begin(), order.end(), [&](int a, int b) { return counts[a] > counts[b]; });

    for (int k : order) {
        if (layers.size() == 2) break;
        const double share = static_cast<double>(counts[k]) / samples.rows;
        if (share < 0.04) continue;  // a minor shade, not a layer

        // Name it first: skip near-black/grey families (shadows of the background), and
        // a second shade of a colour we already have (two greens sound like one).
        const cv::Mat px(1, 1, CV_8UC3, cv::Scalar(centers.at<float>(k, 0), centers.at<float>(k, 1), centers.at<float>(k, 2)));
        cv::Mat bgr;
        cv::cvtColor(px, bgr, cv::COLOR_Lab2BGR);
        const std::string name = colourName(bgr.at<cv::Vec3b>(0, 0));
        const std::string hue = name.rfind("dark ", 0) == 0 ? name.substr(5) : name;
        if (hue == "black" || hue == "grey") continue;
        bool repeat = false;
        for (const ColourLayer& other : layers) {
            const std::string& n = other.info.name;
            repeat = repeat || (n.rfind("dark ", 0) == 0 ? n.substr(5) : n) == hue;
        }
        if (repeat) continue;

        ColourLayer L;
        L.strength.assign(kColumns, 0.0);
        L.pos.assign(kColumns, 0.5);
        std::vector<double> sum(kColumns, 0.0), rowWeighted(kColumns, 0.0);
        for (int i = 0; i < labels.rows; ++i) {
            if (labels.at<int>(i) != k) continue;
            const cv::Point pt = where[i];
            const int c = std::min(pt.x * kColumns / I.cols, kColumns - 1);
            const double v = I.at<float>(pt.y, pt.x);
            sum[c] += v;
            rowWeighted[c] += v * pt.y;
        }
        for (int c = 0; c < kColumns; ++c) {
            const int x0 = c * I.cols / kColumns, x1 = (c + 1) * I.cols / kColumns;
            L.strength[c] = sum[c] / ((x1 - x0) * static_cast<double>(I.rows));
            if (sum[c] > 1e-6) L.pos[c] = 1.0 - (rowWeighted[c] / sum[c]) / (I.rows - 1);
        }

        L.info.name = name;
        L.info.hex = hexColour(bgr.at<cv::Vec3b>(0, 0));
        L.info.share = share;  // of the signal, not the whole image
        L.info.voice = layers.empty() ? 4 : 5;  // biggest = pluck, next = bell
        layers.push_back(L);
    }
    return layers;
}
