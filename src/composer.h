#pragma once

#include "adaptive.h"
#include "notes.h"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <string>
#include <vector>

// ---- What we measure about an image ----
struct ImageTraits {
    double meanIntensity = 0.0;         // how much signal there is overall (0..1)
    double backgroundBrightness = 0.5;  // 0 = black background, 1 = bright background
    double signalHueDeg = 0.0;          // average colour of the signal on the colour wheel (0..360)
    double signalSat = 0.0;             // how colourful the signal is (0..1)
    double activity = 0.0;              // how much the signal varies from column to column (0..1)
};

inline ImageTraits measureTraits(const SignalMap& sig, const EarthAnalysis& analysis) {
    ImageTraits t;
    t.meanIntensity = sig.meanIntensity;
    t.backgroundBrightness =
        std::max({sig.backgroundBgr[0], sig.backgroundBgr[1], sig.backgroundBgr[2]}) / 255.0;

    // Average colour of the signal pixels (circular average, because hue is a circle).
    cv::Mat hsv;
    cv::cvtColor(sig.preview, hsv, cv::COLOR_BGR2HSV);
    double weightSum = 0.0, satSum = 0.0, cosSum = 0.0, sinSum = 0.0;
    for (int y = 0; y < hsv.rows; ++y) {
        for (int x = 0; x < hsv.cols; ++x) {
            const double w = sig.intensity.at<float>(y, x);
            if (w < 0.3) continue;  // only pixels with a clear signal count
            const cv::Vec3b px = hsv.at<cv::Vec3b>(y, x);
            const double h = px[0] * 2.0 * CV_PI / 180.0;
            const double s = px[1] / 255.0;
            weightSum += w;
            satSum += w * s;
            cosSum += w * s * std::cos(h);
            sinSum += w * s * std::sin(h);
        }
    }
    if (weightSum > 0.0) {
        t.signalSat = satSum / weightSum;
        double deg = std::atan2(sinSum, cosSum) * 180.0 / CV_PI;
        if (deg < 0.0) deg += 360.0;
        t.signalHueDeg = deg;
    }

    // Activity = how uneven the signal is across the map (spread divided by average).
    double mean = 0.0;
    for (const ColumnStats& c : analysis.columns) mean += c.landFraction;
    mean /= static_cast<double>(analysis.columns.size());
    double var = 0.0;
    for (const ColumnStats& c : analysis.columns) {
        var += (c.landFraction - mean) * (c.landFraction - mean);
    }
    var /= static_cast<double>(analysis.columns.size());
    if (mean > 1e-9) t.activity = std::clamp(std::sqrt(var) / mean, 0.0, 1.0);
    return t;
}

// ---- The musical decisions, all derived from the traits ----
struct MusicProfile {
    int rootPc = 9;                       // key as a pitch class: 0 = C, 1 = C#, ... 9 = A
    ScaleType scale = ScaleType::Minor;
    double bpm = 80.0;
    int melodyBase = 57;                  // MIDI note that melody degree 0 is built on
    int bassRoot = 45;                    // MIDI note the bass sits on
};

inline const char* keyName(int pc) {
    static const char* names[12] = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
    return names[((pc % 12) + 12) % 12];
}

inline MusicProfile chooseProfile(const ImageTraits& t) {
    MusicProfile p;

    // Key: the colour wheel has 360 degrees and music has 12 keys, so 30 degrees per key.
    // A grey, colourless signal has no meaningful hue, so it gets the default key (A).
    const bool hueKnown = t.signalSat >= 0.15;
    p.rootPc = hueKnown ? static_cast<int>(std::lround(t.signalHueDeg / 30.0)) % 12 : 9;
    const bool warm = hueKnown && (t.signalHueDeg < 75.0 || t.signalHueDeg >= 330.0);

    // Scale: how much is going on, how dark the background is, and how warm the colour is.
    if (t.meanIntensity < 0.10) {
        p.scale = (t.backgroundBrightness < 0.35) ? ScaleType::Lydian : ScaleType::Major;
    } else if (t.meanIntensity < 0.30) {
        p.scale = warm ? ScaleType::Mixolydian : ScaleType::Dorian;
    } else {
        p.scale = ScaleType::Minor;
    }

    // Tempo: more signal and more variation = faster. Never faster than 110 (majestic = unhurried).
    p.bpm = std::clamp(54.0 + 90.0 * t.meanIntensity + 30.0 * t.activity, 54.0, 110.0);

    // Register: keep the melody roughly between F#3 and F#4, and the bass between F#2 and F3.
    p.melodyBase = (p.rootPc <= 6) ? 60 + p.rootPc : 48 + p.rootPc;
    p.bassRoot = (p.rootPc <= 5) ? 48 + p.rootPc : 36 + p.rootPc;
    return p;
}

inline EarthMood moodFromProfile(const MusicProfile& p) {
    EarthMood m;
    m.major = (p.scale == ScaleType::MajorPent || p.scale == ScaleType::Major ||
               p.scale == ScaleType::Lydian || p.scale == ScaleType::Mixolydian);
    m.bpm = p.bpm;
    m.rootMidi = p.melodyBase;
    m.scaleName = std::string(keyName(p.rootPc)) + " " + scaleInfo(p.scale).name;
    return m;
}

// Four chords (as scale degrees) that sound good together in each scale.
// A chord stacks every other scale note: degree, degree+2, degree+4.
inline std::array<int, 4> chordProgression(ScaleType s) {
    switch (s) {
        case ScaleType::Major:      return {0, 4, 5, 3};  // I - V - vi - IV      (the "pop" progression)
        case ScaleType::Lydian:     return {0, 1, 5, 4};  // I - II - vi - V      (floating, wondrous)
        case ScaleType::Mixolydian: return {0, 6, 3, 0};  // I - bVII - IV - I    (heroic)
        case ScaleType::Dorian:     return {0, 3, 6, 0};  // i - IV - bVII - i    (epic)
        case ScaleType::Minor:      return {0, 5, 2, 6};  // i - VI - III - VII   (cinematic)
        default:                    return {0, 3, 4, 0};  // pentatonic scales: simple I - IV - V - I
    }
}

// ---- The composer: melody that follows the signal, plus a bass ----
// Each colour layer plays its own line where that colour is strong: a pluck an octave
// below the melody off the beat, and bells an octave above on it.
inline void addLayerNotes(std::vector<NoteEvent>& notes, const std::vector<ColourLayer>& layers,
                          const MusicProfile& p, double stepSec) {
    const int degrees = scaleInfo(p.scale).size;  // one octave of the scale
    for (const ColourLayer& L : layers) {
        const double maxS = *std::max_element(L.strength.begin(), L.strength.end());
        if (maxS <= 0.0) continue;
        const bool bell = L.info.voice == 5;
        for (int c = 0; c < static_cast<int>(L.strength.size()); ++c) {
            const double rel = L.strength[c] / maxS;
            if (rel < 0.5) continue;
            if (c % 2 != (bell ? 0 : 1)) continue;  // bells on the beat, plucks off it
            const int degree = static_cast<int>(std::lround(std::clamp(L.pos[c], 0.0, 1.0) * degrees));
            NoteEvent n;
            n.startSec = c * stepSec;
            n.durationSec = (bell ? 2.0 : 0.8) * stepSec;
            n.midiNote = scaleNote(p.melodyBase + (bell ? 12 : -12), degree, p.scale);
            n.velocity = static_cast<float>((bell ? 0.25 : 0.3) + 0.35 * rel);
            n.voice = L.info.voice;
            notes.push_back(n);
        }
    }
}

inline std::vector<NoteEvent> composeNotes(const EarthAnalysis& analysis, const MusicProfile& p,
                                           bool verbose, const std::vector<ColourLayer>& layers = {}) {
    const double stepSec = 60.0 / p.bpm / 2.0;  // eighth notes
    const std::vector<ColumnStats>& cols = analysis.columns;
    std::vector<NoteEvent> notes;

    constexpr double kRestRelative = 0.35;  // rest if a column has < 35% of the strongest column's signal

    double maxSignal = 0.0, minPos = 1.0, maxPos = 0.0;
    for (const ColumnStats& c : cols) {
        maxSignal = std::max(maxSignal, c.landFraction);
        minPos = std::min(minPos, c.landPos);
        maxPos = std::max(maxPos, c.landPos);
    }
    if (maxSignal <= 0.0) return notes;  // no signal anywhere: nothing to play

    // Centre the pitch range, but never stretch a tiny variation into a wild one.
    const double midPos = 0.5 * (minPos + maxPos);
    const double posRange = std::max(maxPos - minPos, 0.15);

    std::vector<double> stretched(kColumns);
    for (int x = 0; x < kColumns; ++x) {
        stretched[x] = std::clamp(0.5 + (cols[x].landPos - midPos) / posRange, 0.0, 1.0);
    }
    std::vector<double> smooth(kColumns);
    for (int x = 0; x < kColumns; ++x) {
        const double left = stretched[std::max(x - 1, 0)];
        const double right = stretched[std::min(x + 1, kColumns - 1)];
        smooth[x] = 0.25 * left + 0.5 * stretched[x] + 0.25 * right;
    }

    const int degreeCount = scaleInfo(p.scale).size * 2 + 1;  // two octaves, plus the top note
    int prevDegree = -1;
    int lastIndex = -1;    // position in 'notes' of the previous melody note
    int lastColumn = -10;  // column where the previous melody note was played

    if (verbose) std::cout << "melody (scale degree per column, . = rest, - = held):\n";
    for (int x = 0; x < kColumns; ++x) {
        const double rel = cols[x].landFraction / maxSignal;  // 0..1, relative to the strongest column
        if (rel < kRestRelative) {
            if (verbose) std::cout << ". ";
            continue;
        }

        int degree = static_cast<int>(std::lround(smooth[x] * (degreeCount - 1)));
        if (prevDegree >= 0) {
            degree = std::clamp(degree, prevDegree - kMaxLeap, prevDegree + kMaxLeap);
        }
        const float velocity = static_cast<float>(0.45 + 0.5 * rel);

        if (lastIndex >= 0 && degree == prevDegree && lastColumn == x - 1) {
            // Same pitch as the column before: hold the note longer instead of striking it again.
            notes[lastIndex].durationSec += stepSec;
            notes[lastIndex].velocity = std::max(notes[lastIndex].velocity, velocity);
            if (verbose) std::cout << "- ";
        } else {
            NoteEvent note;
            note.startSec = x * stepSec;
            note.durationSec = stepSec * 0.9;
            note.midiNote = scaleNote(p.melodyBase, degree, p.scale);
            note.velocity = velocity;
            note.voice = 0;  // melody
            lastIndex = static_cast<int>(notes.size());
            notes.push_back(note);
            if (verbose) std::cout << degree << " ";
        }
        prevDegree = degree;
        lastColumn = x;
    }
    if (verbose) std::cout << "\n";

    // ---- Bass: one slow note per bar. Quiet bars rest on the root, busy bars lift to the fifth. ----
    for (int bar = 0; bar < kColumns / kBarColumns; ++bar) {
        double quiet = 0.0;
        for (int c = bar * kBarColumns; c < (bar + 1) * kBarColumns; ++c) {
            quiet += cols[c].fraction[static_cast<int>(Terrain::Ocean)];
        }
        quiet /= kBarColumns;

        NoteEvent bass;
        bass.startSec = bar * kBarColumns * stepSec;
        bass.durationSec = kBarColumns * stepSec * 0.95;
        bass.midiNote = p.bassRoot + ((quiet > 0.5) ? 0 : 7);
        bass.velocity = static_cast<float>(0.45 + 0.3 * quiet);
        bass.voice = 1;  // bass
        notes.push_back(bass);
    }

        // ---- Pad: a slow chord under each bar, like a string section ----
    const std::array<int, 4> progression = chordProgression(p.scale);
    const int padBase = p.bassRoot + 7;  // sits just above the bass, below the melody
    for (int bar = 0; bar < kColumns / kBarColumns; ++bar) {
        double busy = 0.0;
        for (int c = bar * kBarColumns; c < (bar + 1) * kBarColumns; ++c) {
            busy += cols[c].landFraction / maxSignal;
        }
        busy /= kBarColumns;  // how much is going on in this bar, 0..1

        const int rootDegree = progression[bar % 4];
        for (int k = 0; k < 3; ++k) {  // the three notes of the chord
            int midi = scaleNote(padBase, rootDegree + 2 * k, p.scale);
            midi = padBase + (((midi - padBase) % 12) + 12) % 12;  // fold into one octave: a tight, close chord

            NoteEvent pad;
            pad.startSec = bar * kBarColumns * stepSec;
            pad.durationSec = kBarColumns * stepSec;
            pad.midiNote = midi;
            pad.velocity = static_cast<float>(0.55 + 0.35 * busy);  // busier bar = fuller pad
            pad.voice = 2;  // pad
            notes.push_back(pad);
        }
    }

    addPercussion(notes, cols, stepSec);
    addLayerNotes(notes, layers, p, stepSec);
    
    return notes;
}