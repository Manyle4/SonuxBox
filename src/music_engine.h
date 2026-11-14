#pragma once

#include "earth_pipeline.h"
#include "adaptive.h"
#include "composer.h"

#include <algorithm>
#include <iostream>
#include <string>

// Two ways of understanding an image:
//   Terrain  - fixed colour rules for natural-colour Earth maps (ocean / vegetation / land / ice)
//   Adaptive - learns each image's own palette with K-means and measures every pixel against
//              its background; the image then chooses key, scale, tempo and register
enum class AnalysisMode { Terrain, Adaptive };

inline const char* modeName(AnalysisMode m) {
    return (m == AnalysisMode::Adaptive) ? "adaptive" : "terrain";
}

// The whole pipeline, with a choice of analysis mode.
// Returns true on success; on failure returns false with a message in 'error'.
inline bool generateMusic(const cv::Mat& image, int sampleRate, AnalysisMode mode,
                          EarthResult& out, std::string& error, bool verbose = false) {
    if (image.empty()) {
        error = "image is empty or could not be decoded";
        return false;
    }
    if (image.cols < 16 || image.rows < 16) {
        error = "image is too small (needs at least 16x16 pixels)";
        return false;
    }

    if (mode == AnalysisMode::Adaptive) {
        const SignalMap sig = computeSignalMap(image);
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
        out.notes = composeNotes(out.analysis, profile, verbose);
    } else {
        out.analysis = analyzeEarth(image);
        out.mood = decideMood(out.analysis.overall);
        out.mood.scaleName = out.mood.major ? "major pentatonic" : "minor pentatonic";
        out.notes = buildNotes(out.analysis, out.mood, verbose);
    }

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
    return true;
}