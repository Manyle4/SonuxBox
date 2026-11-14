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
constexpr double kCropBottom = 0.12;     // ignore the bottom 12% (legend + timestamp)

// What we learned about one column of the map.
struct ColumnStats {
    std::array<double, kTerrainCount> fraction{};  // share of each terrain type, 0..1
    double landFraction = 0.0;                     // vegetation + land + ice together
    double landPos = 0.5;                          // vertical centre of the land: 0 = bottom, 1 = top
};

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
    std::string analysisMode;   // "terrain" or "adaptive"
};

inline bool isActiveData(Terrain t, bool isDarkMap) {
    if (t == Terrain::Vegetation || t == Terrain::Land || t == Terrain::IceCloud) return true;
    // On dark-background maps (Night Lights / Lightning), any colored 'Other' pixel is valid data
    if (isDarkMap && t == Terrain::Other) return true;
    return false;
}

inline EarthAnalysis analyzeEarth(const cv::Mat& image) {
    // 256-pixel-wide copy, with the legend strip cut off the bottom.
    const double scale = 256.0 / image.cols;
    cv::Mat mid;
    cv::resize(image, mid, cv::Size(), scale, scale, cv::INTER_AREA);
    const int keepRows = static_cast<int>(mid.rows * (1.0 - kCropBottom));
    const cv::Mat map = mid(cv::Rect(0, 0, mid.cols, keepRows));

    cv::Mat hsv;
    cv::cvtColor(map, hsv, cv::COLOR_BGR2HSV);

    EarthAnalysis result;
    result.columns.resize(kColumns);
    std::array<double, kTerrainCount> overallCounts{};
    double overallTotal = 0.0;

    // Store row sums for each terrain type per column so we can compute landPos afterward
    std::vector<std::array<double, kTerrainCount>> colRowSums(kColumns);

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
    f << std::fixed << std::setprecision(3);  // print decimals with 3 digits

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
    f << "  \"cropBottom\": " << kCropBottom << ",\n";
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

    f << "  \"columnStats\": [\n";
    for (int c = 0; c < kColumns; ++c) {
        const ColumnStats& col = r.analysis.columns[c];
        f << "    {\"land\": " << col.landFraction
          << ", \"ocean\": " << col.fraction[static_cast<int>(Terrain::Ocean)]
          << ", \"landPos\": " << col.landPos << "}" << (c + 1 < kColumns ? "," : "") << "\n";
    }
    f << "  ],\n";

    f << "  \"notes\": [\n";
    for (std::size_t i = 0; i < r.notes.size(); ++i) {
        const NoteEvent& n = r.notes[i];
        f << "    {\"start\": " << n.startSec << ", \"dur\": " << n.durationSec
          << ", \"midi\": " << n.midiNote << ", \"vel\": " << n.velocity
          << ", \"voice\": \"" << (n.voice == 1 ? "bass" : (n.voice == 2 ? "pad" : "melody")) << "\"}"
          << (i + 1 < r.notes.size() ? "," : "") << "\n";
    }
    f << "  ]\n";
    f << "}\n";
    return f.str();
}
