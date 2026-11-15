#pragma once

#include "terrain.h"
#include "notes.h"
#include "synth.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

// ---- Settings you can tweak ----
constexpr int kColumns = 32;             // time steps across the map
constexpr int kBarColumns = 4;           // columns per bar (one bass note each)
constexpr int kScaleDegrees = 10;        // melody range: 10 pentatonic notes = 2 octaves
constexpr int kMaxLeap = 3;              // biggest jump between neighbouring melody notes
constexpr int kRootMidi = 57;            // A3: the home note of the piece
constexpr double kCropBottom = 0.12;     // default: ignore the bottom 12% (legend + timestamp)
constexpr double kMaxCrop = 0.3;         // never throw away more than this

// What we learned about one column of the map.
struct ColumnStats {
    std::array<double, kTerrainCount> fraction{};  // share of each terrain type, 0..1
    double landFraction = 0.0;                     // vegetation + land + ice together
    double landPos = 0.5;                          // vertical centre of the land: 0 = bottom, 1 = top
    double peakPos = 0.5;                          // height of the strongest band (for naming places)
    double value = -1.0;                           // median value read off a colour scale; -1 = none
};

// Height (0 bottom .. 1 top) of the strongest band in a column's per-row totals.
// Smoothed over a few rows so one noisy pixel row can't win. Falls back if empty.
inline double peakHeight(const std::vector<double>& rows, double fallback) {
    const int n = static_cast<int>(rows.size());
    if (n < 2) return fallback;
    constexpr int kHalf = 4;
    double best = 0.0;
    int bestY = -1;
    for (int y = 0; y < n; ++y) {
        double s = 0.0;
        for (int k = std::max(0, y - kHalf); k <= std::min(n - 1, y + kHalf); ++k) s += rows[k];
        if (s > best) { best = s; bestY = y; }
    }
    return bestY < 0 ? fallback : 1.0 - static_cast<double>(bestY) / (n - 1);
}

// What we learned about the whole map.
struct EarthAnalysis {
    std::vector<ColumnStats> columns;
    std::array<double, kTerrainCount> overall{};   // share of each terrain type over the whole map
};

// The musical decisions that apply to the entire piece.
struct EarthMood {
    bool major = true;
    double bpm = 90.0;
    int rootMidi = kRootMidi;   // the piece's home note (reported in the JSON)
    std::string scaleName;      // e.g. "D lydian". Empty = just use major/minor.
};

// A colour layer that got its own instrument (adaptive mode).
struct LayerInfo {
    std::string name;  // e.g. "purple"
    std::string hex;   // e.g. "#b070e0"
    double share = 0.0;
    int voice = 4;     // 4 = pluck, 5 = bell
};

// Everything the pipeline produces, bundled together.
struct EarthResult {
    EarthAnalysis analysis;
    EarthMood mood;
    std::vector<NoteEvent> notes;
    std::vector<float> audio;   // mono samples, -1..1
    int sampleRate = 44100;
    double durationSec = 0.0;   // full audio length, including the fade-out tail
    double musicSec = 0.0;      // when the last note lets go (the playhead can stop here)
    int imageWidth = 0;
    int imageHeight = 0;
    double cropBottom = kCropBottom;  // share of the bottom that was ignored
    double cropTop = 0.0;             // share of the top that was ignored (logos)
    std::string analysisMode;   // "terrain" or "adaptive"
    std::vector<LayerInfo> layers;  // colour layers with their own instrument (adaptive only)
};

inline bool isActiveData(Terrain t, bool isDarkMap) {
    if (t == Terrain::Vegetation || t == Terrain::Land || t == Terrain::IceCloud) return true;
    // On dark-background maps (Night Lights / Lightning), any colored 'Other' pixel is valid data
    if (isDarkMap && t == Terrain::Other) return true;
    return false;
}

// The part of the (resized) image that gets analysed: drops the top and bottom strips.
inline cv::Mat cropRows(const cv::Mat& img, double cropTop, double cropBottom) {
    const int top = static_cast<int>(img.rows * cropTop);
    const int keep = std::max(1, static_cast<int>(img.rows * (1.0 - cropTop - cropBottom)));
    return img(cv::Rect(0, top, img.cols, std::min(keep, img.rows - top)));
}

inline EarthAnalysis analyzeEarth(const cv::Mat& image, double cropBottom = kCropBottom, double cropTop = 0.0) {
    // 256-pixel-wide copy, with the legend strip cut off the bottom.
    const double scale = 256.0 / image.cols;
    cv::Mat mid;
    cv::resize(image, mid, cv::Size(), scale, scale, cv::INTER_AREA);
    const cv::Mat map = cropRows(mid, cropTop, cropBottom);

    cv::Mat hsv;
    cv::cvtColor(map, hsv, cv::COLOR_BGR2HSV);

    EarthAnalysis result;
    result.columns.resize(kColumns);
    std::array<double, kTerrainCount> overallCounts{};
    double overallTotal = 0.0;

    // Store row sums for each terrain type per column so we can compute landPos afterward
    std::vector<std::array<double, kTerrainCount>> colRowSums(kColumns);
    // Per-row counts too, to find each column's strongest band.
    std::vector<std::vector<std::array<float, kTerrainCount>>> rowCounts(
        kColumns, std::vector<std::array<float, kTerrainCount>>(hsv.rows));

    for (int c = 0; c < kColumns; ++c) {
        const int x0 = c * hsv.cols / kColumns;
        const int x1 = (c + 1) * hsv.cols / kColumns;

        std::array<double, kTerrainCount> counts{};
        double total = 0.0;

        for (int y = 0; y < hsv.rows; ++y) {
            for (int x = x0; x < x1; ++x) {
                const Terrain t = classifyPixel(hsv.at<cv::Vec3b>(y, x));
                const int i = static_cast<int>(t);
                counts[i] += 1.0;
                overallCounts[i] += 1.0;
                colRowSums[c][i] += y;
                rowCounts[c][y][i] += 1.0f;
                total += 1.0;
            }
        }

        ColumnStats& col = result.columns[c];
        for (int i = 0; i < kTerrainCount; ++i) {
            col.fraction[i] = counts[i] / total;
        }
        overallTotal += total;
    }

    for (int i = 0; i < kTerrainCount; ++i) {
        result.overall[i] = overallCounts[i] / overallTotal;
    }

    // 1. Declare isDarkMap: true if more than 50% of the image is dark/black
    const bool isDarkMap = result.overall[static_cast<int>(Terrain::Dark)] > 0.50;

    // 2. Compute landFraction and landPos for each column using isDarkMap
    for (int c = 0; c < kColumns; ++c) {
        ColumnStats& col = result.columns[c];
        double activeShare = 0.0;
        double activeRowSum = 0.0;

        for (int i = 0; i < kTerrainCount; ++i) {
            const Terrain t = static_cast<Terrain>(i);
            if (isActiveData(t, isDarkMap)) {
                activeShare += col.fraction[i];
                activeRowSum += colRowSums[c][i];
            }
        }

        col.landFraction = activeShare;
        const double totalColPixels = (hsv.cols / kColumns) * hsv.rows;
        const double activePixels = activeShare * totalColPixels;

        if (activePixels > 0.0 && hsv.rows > 1) {
            col.landPos = 1.0 - (activeRowSum / activePixels) / (hsv.rows - 1);
        }

        std::vector<double> active(hsv.rows, 0.0);
        for (int y = 0; y < hsv.rows; ++y) {
            for (int i = 0; i < kTerrainCount; ++i) {
                if (isActiveData(static_cast<Terrain>(i), isDarkMap)) active[y] += rowCounts[c][y][i];
            }
        }
        col.peakPos = peakHeight(active, col.landPos);
    }

    return result;
}

inline EarthMood decideMood(const std::array<double, kTerrainCount>& overall) {
    const double veg = overall[static_cast<int>(Terrain::Vegetation)];
    const double land = overall[static_cast<int>(Terrain::Land)];
    const double ice = overall[static_cast<int>(Terrain::IceCloud)];
    const double landTotal = veg + land + ice;

    const bool isDarkMap = overall[static_cast<int>(Terrain::Dark)] > 0.50;

    EarthMood mood;
    if (isDarkMap) {
        mood.major = false; // Night lights / cosmic / lightning maps sound best in minor
    } else {
        mood.major = landTotal > 0.0 && (veg / landTotal) >= 0.4;
    }
    mood.bpm = std::clamp(60.0 + 100.0 * landTotal, 60.0, 110.0);
    return mood;
}

inline const char* voiceName(int voice) {
    switch (voice) {
        case 1: return "bass";
        case 2: return "pad";
        case 3: return "perc";
        case 4: return "pluck";
        case 5: return "bell";
        default: return "melody";
    }
}

// Percussion: a hit wherever the signal jumps up from one column to the next,
// so sudden features (lightning, city clusters, plume edges) land on the beat.
inline void addPercussion(std::vector<NoteEvent>& notes, const std::vector<ColumnStats>& cols,
                          double stepSec) {
    double maxSignal = 0.0;
    for (const ColumnStats& c : cols) maxSignal = std::max(maxSignal, c.landFraction);
    if (maxSignal <= 0.0) return;

    constexpr double kJump = 0.25;  // rise of at least 25% of the strongest column
    for (std::size_t x = 1; x < cols.size(); ++x) {
        const double rise = (cols[x].landFraction - cols[x - 1].landFraction) / maxSignal;
        if (rise < kJump) continue;
        NoteEvent hit;
        hit.startSec = x * stepSec;
        hit.durationSec = 0.12;
        hit.midiNote = 0;  // unpitched
        hit.velocity = static_cast<float>(std::min(0.4 + rise, 1.0));
        hit.voice = 3;
        notes.push_back(hit);
    }
}

// 'verbose' = print the per-column table and melody to the terminal (handy for the
// command-line tool, noisy for a server).
inline std::vector<NoteEvent> buildNotes(const EarthAnalysis& analysis, const EarthMood& mood,
                                         bool verbose) {
    const double stepSec = 60.0 / mood.bpm / 2.0;  // eighth notes
    const std::vector<ColumnStats>& cols = analysis.columns;
    std::vector<NoteEvent> notes;

    constexpr double kRestRelative = 0.35;  // rest if a column has < 35% of the busiest column's land

    if (verbose) {
        std::cout << "col  land%  ocean%  landPos(0=bottom,1=top)\n";
        for (int x = 0; x < kColumns; ++x) {
            std::cout << x << "    "
                      << static_cast<int>(100.0 * cols[x].landFraction) << "     "
                      << static_cast<int>(100.0 * cols[x].fraction[static_cast<int>(Terrain::Ocean)])
                      << "      " << cols[x].landPos << "\n";
        }
    }

    // ---- Find the extremes, so we can stretch values to use the full range ----
    double maxLand = 0.0, minPos = 1.0, maxPos = 0.0;
    for (const ColumnStats& c : cols) {  // 'const &': look at each column without copying it
        maxLand = std::max(maxLand, c.landFraction);
        minPos = std::min(minPos, c.landPos);
        maxPos = std::max(maxPos, c.landPos);
    }
    const double midPos = 0.5 * (minPos + maxPos);
    const double posRange = std::max(maxPos - minPos, 0.15); // never divide by zero
    if (maxLand <= 0.0) return notes;                          // no land anywhere: no melody

    // ---- Melody: follows the land ----
    std::vector<double> stretched(kColumns);
    for (int x = 0; x < kColumns; ++x) {
        stretched[x] = std::clamp(0.5 + (cols[x].landPos - midPos) / posRange, 0.0, 1.0);  // lowest column -> 0, highest -> 1
    }
    std::vector<double> smooth(kColumns);
    for (int x = 0; x < kColumns; ++x) {
        const double left = stretched[std::max(x - 1, 0)];
        const double right = stretched[std::min(x + 1, kColumns - 1)];
        smooth[x] = 0.25 * left + 0.5 * stretched[x] + 0.25 * right;
    }

    int prevDegree = -1;
    if (verbose) std::cout << "melody (scale degree per column, . = ocean/rest):\n";
    for (int x = 0; x < kColumns; ++x) {
        const double relLand = cols[x].landFraction / maxLand;  // 0..1, relative to the landiest column
        if (relLand < kRestRelative) {
            if (verbose) std::cout << ". ";
            continue;
        }
        int degree = static_cast<int>(std::lround(smooth[x] * (kScaleDegrees - 1)));
        if (prevDegree >= 0) {
            degree = std::clamp(degree, prevDegree - kMaxLeap, prevDegree + kMaxLeap);
        }
        prevDegree = degree;

        NoteEvent note;
        note.startSec = x * stepSec;
        note.durationSec = stepSec * 0.9;
        note.midiNote = scaleDegreeToMidiMode(kRootMidi + 12, degree, mood.major);
        note.velocity = static_cast<float>(0.45 + 0.5 * relLand);
        note.voice = 0;  // melody
        notes.push_back(note);
        if (verbose) std::cout << degree << " ";
    }
    if (verbose) std::cout << "\n";

    // ---- Bass: one slow note per bar, from the ocean ----
    for (int bar = 0; bar < kColumns / kBarColumns; ++bar) {
        double ocean = 0.0;
        for (int c = bar * kBarColumns; c < (bar + 1) * kBarColumns; ++c) {
            ocean += cols[c].fraction[static_cast<int>(Terrain::Ocean)];
        }
        ocean /= kBarColumns;  // average ocean share in this bar

        NoteEvent bass;
        bass.startSec = bar * kBarColumns * stepSec;
        bass.durationSec = kBarColumns * stepSec * 0.95;
        // Mostly ocean: settle on the home note. Otherwise lift to the fifth (7 semitones up).
        bass.midiNote = (ocean > 0.5) ? kRootMidi : (kRootMidi + 7);
        bass.velocity = static_cast<float>(0.45 + 0.3 * ocean);
        bass.voice = 1;  // bass
        notes.push_back(bass);
    }

    addPercussion(notes, cols, stepSec);

    /// ---- Harmony Pad: warm open acoustic voicing per bar ----
    for (int bar = 0; bar < kColumns / kBarColumns; ++bar) {
        double ocean = 0.0;
        for (int c = bar * kBarColumns; c < (bar + 1) * kBarColumns; ++c) {
            ocean += cols[c].fraction[static_cast<int>(Terrain::Ocean)];
        }
        ocean /= kBarColumns;

        // Match the bass movement: home chord (0) on ocean, fifth chord (3 in pentatonic = G/E) on land
        int baseDegree = (ocean > 0.5) ? 0 : 3;

        // Open voicing: Root (0), Fifth (3), and Octave+Third (7)
        // Spreading them across octaves eliminates muddiness!
        int chordOffsets[3] = {0, 3, 7};
        for (int offset : chordOffsets) {
            NoteEvent pad;
            pad.startSec = bar * kBarColumns * stepSec;
            pad.durationSec = kBarColumns * stepSec * 0.98;
            pad.midiNote = scaleDegreeToMidiMode(kRootMidi + 12, baseDegree + offset, mood.major);
            pad.velocity = 0.14f; // Softer background bed so the melody shines
            pad.voice = 2;
            notes.push_back(pad);
        }
    }

    return notes;
}

// Make a string safe to place inside JSON quotes.
inline std::string jsonEscape(const std::string& s) {
    std::string out;
    for (const char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof buf, "\\u%04x", c);
                    out += buf;
                } else {
                    out += c;
                }
        }
    }
    return out;
}

// Build the JSON text for the web page. 'audioUrl' is where the page can fetch the WAV.
// std::ostringstream works like std::cout, but collects the text in a string instead.
inline std::string buildJson(const std::string& imageName, const std::string& audioUrl,
                             const EarthResult& r) {
    std::ostringstream f;
    // 6 decimals: times get multiplied up on the page, so 3 drifted by a few ms.
    f << std::fixed << std::setprecision(6);

    const double stepSec = 60.0 / r.mood.bpm / 2.0;

    f << "{\n";
    f << "  \"image\": \"" << jsonEscape(imageName) << "\",\n";
    f << "  \"audioUrl\": \"" << jsonEscape(audioUrl) << "\",\n";
    
    f << "  \"analysisMode\": \"" << jsonEscape(r.analysisMode) << "\",\n";

    const std::string scaleText = r.mood.scaleName.empty()
                                      ? std::string(r.mood.major ? "major" : "minor")
                                      : r.mood.scaleName;
    f << "  \"scale\": \"" << jsonEscape(scaleText) << "\",\n";

    f << "  \"bpm\": " << r.mood.bpm << ",\n";
    f << "  \"rootMidi\": " << r.mood.rootMidi << ",\n";
    // Image size + bottom crop let the page line column c up with the picture.
    f << "  \"imageWidth\": " << r.imageWidth << ",\n";
    f << "  \"imageHeight\": " << r.imageHeight << ",\n";
    f << "  \"cropBottom\": " << r.cropBottom << ",\n";
    f << "  \"cropTop\": " << r.cropTop << ",\n";
    f << "  \"columns\": " << kColumns << ",\n";
    f << "  \"stepSec\": " << stepSec << ",\n";
    f << "  \"musicSec\": " << r.musicSec << ",\n";
    f << "  \"durationSec\": " << r.durationSec << ",\n";

    f << "  \"share\": {";
    for (int i = 0; i < kTerrainCount; ++i) {
        f << "\"" << terrainName(static_cast<Terrain>(i)) << "\": " << r.analysis.overall[i]
          << (i + 1 < kTerrainCount ? ", " : "");
    }
    f << "},\n";

    f << "  \"layers\": [";
    for (std::size_t i = 0; i < r.layers.size(); ++i) {
        const LayerInfo& L = r.layers[i];
        f << (i ? ", " : "") << "{\"color\": \"" << jsonEscape(L.name) << "\", \"hex\": \"" << L.hex
          << "\", \"share\": " << L.share << ", \"voice\": \"" << voiceName(L.voice) << "\"}";
    }
    f << "],\n";

    f << "  \"columnStats\": [\n";
    for (int c = 0; c < kColumns; ++c) {
        const ColumnStats& col = r.analysis.columns[c];
        f << "    {\"land\": " << col.landFraction
          << ", \"ocean\": " << col.fraction[static_cast<int>(Terrain::Ocean)]
          << ", \"landPos\": " << col.landPos << ", \"peakPos\": " << col.peakPos;
        if (col.value >= 0.0) f << ", \"value\": " << col.value;
        f << "}" << (c + 1 < kColumns ? "," : "") << "\n";
    }
    f << "  ],\n";

    f << "  \"notes\": [\n";
    for (std::size_t i = 0; i < r.notes.size(); ++i) {
        const NoteEvent& n = r.notes[i];
        f << "    {\"start\": " << n.startSec << ", \"dur\": " << n.durationSec
          << ", \"midi\": " << n.midiNote << ", \"vel\": " << n.velocity
          << ", \"voice\": \"" << voiceName(n.voice) << "\"}"
          << (i + 1 < r.notes.size() ? "," : "") << "\n";
    }
    f << "  ]\n";
    f << "}\n";
    return f.str();
}
