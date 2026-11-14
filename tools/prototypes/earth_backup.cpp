#include "terrain.h"
#include "notes.h"
#include "synth.h"
#include "wav_writer.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <iostream>
#include <string>
#include <vector>

// ---- Settings you can tweak ----
constexpr int kColumns = 32;             // time steps across the map
constexpr int kBarColumns = 4;           // columns per bar (one bass note each)
constexpr int kScaleDegrees = 10;        // melody range: 10 pentatonic notes = 2 octaves
constexpr int kMaxLeap = 3;              // biggest jump between neighbouring melody notes
constexpr int kRootMidi = 57;            // A3: the home note of the piece
constexpr double kCropBottom = 0.12;     // ignore the bottom 12% (legend + timestamp)
constexpr double kRestLandFraction = 0.04;  // columns with less land than this have no melody note

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
};

bool isLand(Terrain t) {
    return t == Terrain::Vegetation || t == Terrain::Land || t == Terrain::IceCloud;
}

EarthAnalysis analyzeEarth(const cv::Mat& image) {
    // 256-pixel-wide copy, with the legend strip cut off the bottom.
    const double scale = 256.0 / image.cols;
    cv::Mat mid;
    cv::resize(image, mid, cv::Size(), scale, scale, cv::INTER_AREA);
    const int keepRows = static_cast<int>(mid.rows * (1.0 - kCropBottom));
    const cv::Mat map = mid(cv::Rect(0, 0, mid.cols, keepRows));  // a view: no pixels are copied

    cv::Mat hsv;
    cv::cvtColor(map, hsv, cv::COLOR_BGR2HSV);

    EarthAnalysis result;
    result.columns.resize(kColumns);
    std::array<double, kTerrainCount> overallCounts{};  // {} = all zeros
    double overallTotal = 0.0;

    for (int c = 0; c < kColumns; ++c) {
        // Pixel range of this column. Multiply first, then divide, so no pixels are lost.
        const int x0 = c * hsv.cols / kColumns;
        const int x1 = (c + 1) * hsv.cols / kColumns;

        std::array<double, kTerrainCount> counts{};
        double total = 0.0, landCount = 0.0, landRowSum = 0.0;

        for (int y = 0; y < hsv.rows; ++y) {
            for (int x = x0; x < x1; ++x) {
                const Terrain t = classifyPixel(hsv.at<cv::Vec3b>(y, x));
                const int i = static_cast<int>(t);
                counts[i] += 1.0;
                overallCounts[i] += 1.0;
                total += 1.0;
                if (isLand(t)) {
                    landCount += 1.0;
                    landRowSum += y;
                }
            }
        }

        ColumnStats& col = result.columns[c];  // a reference: edits change the vector's element
        for (int i = 0; i < kTerrainCount; ++i) {
            col.fraction[i] = counts[i] / total;
        }
        col.landFraction = landCount / total;
        if (landCount > 0.0) {
            // Row 0 is the top of the image, so flip it: top of map = high pitch.
            col.landPos = 1.0 - (landRowSum / landCount) / (hsv.rows - 1);
        }
        overallTotal += total;
    }

    for (int i = 0; i < kTerrainCount; ++i) {
        result.overall[i] = overallCounts[i] / overallTotal;
    }
    return result;
}

EarthMood decideMood(const std::array<double, kTerrainCount>& overall) {
    const double veg = overall[static_cast<int>(Terrain::Vegetation)];
    const double land = overall[static_cast<int>(Terrain::Land)];
    const double ice = overall[static_cast<int>(Terrain::IceCloud)];
    const double landTotal = veg + land + ice;

    EarthMood mood;
    // Lush (lots of vegetation compared to bare land and ice) = major. Barren = minor.
    mood.major = landTotal > 0.0 && (veg / landTotal) >= 0.4;
    // More land = a busier world = faster.
    mood.bpm = std::clamp(60.0 + 100.0 * landTotal, 60.0, 110.0);
    return mood;
}

std::vector<NoteEvent> buildNotes(const EarthAnalysis& analysis, const EarthMood& mood) {
    const double stepSec = 60.0 / mood.bpm / 2.0;  // eighth notes
    const std::vector<ColumnStats>& cols = analysis.columns;
    std::vector<NoteEvent> notes;

    constexpr double kRestRelative = 0.35;  // rest if a column has < 35% of the busiest column's land

    // ---- Print what each column looks like, so we can SEE why the music does what it does ----
    std::cout << "col  land%  ocean%  landPos(0=bottom,1=top)\n";
    for (int x = 0; x < kColumns; ++x) {
        std::cout << x << "    "
                  << static_cast<int>(100.0 * cols[x].landFraction) << "     "
                  << static_cast<int>(100.0 * cols[x].fraction[static_cast<int>(Terrain::Ocean)])
                  << "      " << cols[x].landPos << "\n";
    }

    // ---- Find the extremes, so we can stretch values to use the full range ----
    double maxLand = 0.0, minPos = 1.0, maxPos = 0.0;
    for (const ColumnStats& c : cols) {  // 'const &': look at each column without copying it
        maxLand = std::max(maxLand, c.landFraction);
        minPos = std::min(minPos, c.landPos);
        maxPos = std::max(maxPos, c.landPos);
    }
    const double posRange = std::max(maxPos - minPos, 1e-6);  // never divide by zero
    if (maxLand <= 0.0) return notes;                          // no land anywhere: no melody

    // ---- Melody: follows the land ----
    std::vector<double> stretched(kColumns);
    for (int x = 0; x < kColumns; ++x) {
        stretched[x] = (cols[x].landPos - minPos) / posRange;  // lowest column -> 0, highest -> 1
    }
    std::vector<double> smooth(kColumns);
    for (int x = 0; x < kColumns; ++x) {
        const double left = stretched[std::max(x - 1, 0)];
        const double right = stretched[std::min(x + 1, kColumns - 1)];
        smooth[x] = 0.25 * left + 0.5 * stretched[x] + 0.25 * right;
    }

    int prevDegree = -1;
    std::cout << "melody (scale degree per column, . = ocean/rest):\n";
    for (int x = 0; x < kColumns; ++x) {
        const double relLand = cols[x].landFraction / maxLand;  // 0..1, relative to the landiest column
        if (relLand < kRestRelative) {
            std::cout << ". ";
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
        notes.push_back(note);
        std::cout << degree << " ";
    }
    std::cout << "\n";

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
        notes.push_back(bass);
    }
    return notes;
}

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <earth_map> [output.wav]\n";
        return 1;
    }
    const std::string outPath = (argc >= 3) ? argv[2] : "earth_story.wav";

    const cv::Mat image = cv::imread(argv[1], cv::IMREAD_COLOR);
    if (image.empty()) {
        std::cerr << "Could not load image: " << argv[1] << "\n";
        return 1;
    }

    const EarthAnalysis analysis = analyzeEarth(image);
    const EarthMood mood = decideMood(analysis.overall);

    std::cout << "share of the map:\n";
    for (int i = 0; i < kTerrainCount; ++i) {
        std::cout << "  " << terrainName(static_cast<Terrain>(i)) << ": "
                  << 100.0 * analysis.overall[i] << "%\n";
    }
    std::cout << "=> " << (mood.major ? "major" : "minor") << " pentatonic, "
              << mood.bpm << " BPM\n";

    const std::vector<NoteEvent> notes = buildNotes(analysis, mood);
    std::cout << "Generated " << notes.size() << " notes.\n";

    const int sampleRate = 44100;
    if (!writeWav16(outPath, renderNotes(notes, sampleRate), sampleRate)) {
        std::cerr << "Failed to write " << outPath << "\n";
        return 1;
    }
    std::cout << "Wrote " << outPath << "\n";
    return 0;
}