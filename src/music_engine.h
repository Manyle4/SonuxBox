#pragma once

#include "earth_pipeline.h"
#include "adaptive.h"
#include "composer.h"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <sstream>
#include <string>

// Two ways of understanding an image:
//   Terrain  - fixed colour rules for natural-colour Earth maps (ocean / vegetation / land / ice)
//   Adaptive - learns each image's own palette with K-means and measures every pixel against
//              its background; the image then chooses key, scale, tempo and register
enum class AnalysisMode { Terrain, Adaptive };

inline const char* modeName(AnalysisMode m) {
    return (m == AnalysisMode::Adaptive) ? "adaptive" : "terrain";
}

// One colour on a published colour bar and the value it stands for.
struct ScaleStop {
    double hue;  // 0..360
    double value;
};

inline double hueOf(const cv::Vec3b& bgr, double* sat = nullptr, double* val = nullptr) {
    const cv::Mat px(1, 1, CV_8UC3, cv::Scalar(bgr[0], bgr[1], bgr[2]));
    cv::Mat hsv;
    cv::cvtColor(px, hsv, cv::COLOR_BGR2HSV_FULL);
    const cv::Vec3b h = hsv.at<cv::Vec3b>(0, 0);
    if (sat) *sat = h[1] / 255.0;
    if (val) *val = h[2] / 255.0;
    return h[0] * 360.0 / 256.0;
}

// "#rrggbb:value;#rrggbb:value;..." -> stops. Returns false if it can't be read.
inline bool parseScale(const std::string& text, std::vector<ScaleStop>& out) {
    std::stringstream ss(text);
    std::string item;
    while (std::getline(ss, item, ';')) {
        if (item.size() < 9 || item[0] != '#' || item.find(':') != 7) return false;
        try {
            const int rgb = std::stoi(item.substr(1, 6), nullptr, 16);
            out.push_back({hueOf(cv::Vec3b(rgb & 0xff, (rgb >> 8) & 0xff, (rgb >> 16) & 0xff)), std::stod(item.substr(8))});
        } catch (const std::exception&) {
            return false;
        }
    }
    return out.size() >= 2 && out.size() <= 256;
}

// Reads each column's median value off a rainbow-style colour scale, by hue: thin or
// shaded features keep their hue even when they're darker than the bar. Greyish or very
// dark pixels (land, background, labels) are skipped.
inline void measureScale(const cv::Mat& image, double cropTop, double cropBottom,
                         const std::vector<ScaleStop>& stops, EarthAnalysis& analysis) {
    const double scale = 256.0 / image.cols;
    cv::Mat mid, hsv;
    cv::resize(image, mid, cv::Size(), scale, scale, cv::INTER_AREA);
    cv::cvtColor(cropRows(mid, cropTop, cropBottom), hsv, cv::COLOR_BGR2HSV_FULL);
    constexpr double kMaxHueGap = 12.0;  // degrees

    for (int c = 0; c < kColumns; ++c) {
        const int x0 = c * hsv.cols / kColumns, x1 = (c + 1) * hsv.cols / kColumns;
        std::vector<double> values;
        for (int y = 0; y < hsv.rows; ++y) {
            for (int x = x0; x < x1; ++x) {
                const cv::Vec3b p = hsv.at<cv::Vec3b>(y, x);
                if (p[1] < 90 || p[2] < 50) continue;  // not clearly coloured
                const double h = p[0] * 360.0 / 256.0;
                double best = kMaxHueGap, v = -1.0;
                for (const ScaleStop& st : stops) {
                    double d = std::fabs(h - st.hue);
                    d = std::min(d, 360.0 - d);
                    if (d < best) { best = d; v = st.value; }
                }
                if (v >= 0.0) values.push_back(v);
            }
        }
        // Need a fair number of matching pixels before trusting a reading.
        if (values.size() < 0.03 * (x1 - x0) * hsv.rows) continue;
        std::nth_element(values.begin(), values.begin() + values.size() / 2, values.end());
        analysis.columns[c].value = values[values.size() / 2];
    }
}

// The whole pipeline, with a choice of analysis mode.
// Returns true on success; on failure returns false with a message in 'error'.
inline bool generateMusic(const cv::Mat& image, int sampleRate, AnalysisMode mode,
                          EarthResult& out, std::string& error, bool verbose = false,
                          double cropBottom = kCropBottom, double cropTop = 0.0,
                          const std::vector<ScaleStop>& scaleStops = {}) {
    if (image.empty()) {
        error = "image is empty or could not be decoded";
        return false;
    }
    if (cropBottom < 0.0 || cropBottom > kMaxCrop || cropTop < 0.0 || cropTop > kMaxCrop) {
        error = "crop and cropTop must be between 0 and 0.3";
        return false;
    }
    if (image.cols < 16 || image.rows < 16) {
        error = "image is too small (needs at least 16x16 pixels)";
        return false;
    }

    if (mode == AnalysisMode::Adaptive) {
        const SignalMap sig = computeSignalMap(image, 4, cropBottom, cropTop);
        out.analysis = analyzeAdaptive(sig);
        const ImageTraits traits = measureTraits(sig, out.analysis);
        const MusicProfile profile = chooseProfile(traits);
        out.mood = moodFromProfile(profile);
        if (verbose) {
            std::cout << "traits: signal " << traits.meanIntensity
                      << ", background brightness " << traits.backgroundBrightness
                      << ", signal hue " << traits.signalHueDeg << " deg (colourfulness "
                      << traits.signalSat << "), activity " << traits.activity << "\n";
        }
        const std::vector<ColourLayer> layers = findLayers(sig);
        out.layers.clear();
        for (const ColourLayer& L : layers) out.layers.push_back(L.info);
        if (verbose) {
            for (const LayerInfo& L : out.layers) std::cout << "layer: " << L.name << " " << L.hex << " -> " << voiceName(L.voice) << "\n";
        }
        out.notes = composeNotes(out.analysis, profile, verbose, layers);
    } else {
        out.analysis = analyzeEarth(image, cropBottom, cropTop);
        out.mood = decideMood(out.analysis.overall);
        out.mood.scaleName = out.mood.major ? "major pentatonic" : "minor pentatonic";
        out.notes = buildNotes(out.analysis, out.mood, verbose);
    }

    if (!scaleStops.empty()) measureScale(image, cropTop, cropBottom, scaleStops, out.analysis);

    if (out.notes.empty()) {
        error = (mode == AnalysisMode::Adaptive) ? "no signal found: the image looks uniform"
                                                 : "no land found in the image";
        return false;
    }

    out.sampleRate = sampleRate;
    out.audio = renderNotes(out.notes, sampleRate);
    out.durationSec = static_cast<double>(out.audio.size()) / sampleRate;
    out.musicSec = 0.0;
    for (const NoteEvent& n : out.notes) {
        out.musicSec = std::max(out.musicSec, n.startSec + n.durationSec);
    }
    out.imageWidth = image.cols;
    out.imageHeight = image.rows;
    out.analysisMode = modeName(mode);
    out.cropBottom = cropBottom;
    out.cropTop = cropTop;
    return true;
}