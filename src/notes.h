#pragma once

#include <cmath>

// One note in the piece. This is the "contract" between the image-analysis side
// and the sound side: the mapper produces these, the synth consumes them.
struct NoteEvent {
    double startSec;     // when the note begins
    double durationSec;  // how long it is held
    int midiNote;        // pitch as a MIDI number (60 = middle C, 69 = A440)
    float velocity;      // loudness from 0.0 to 1.0
    int voice = 0;       // 0 = melody, 1 = bass, 2 = pad, 3 = percussion
};

// Convert a MIDI note number to a frequency in Hz.
inline double midiToFreq(int midiNote) {
    return 440.0 * std::pow(2.0, (midiNote - 69) / 12.0);
}

// ---- Scales ----
// A scale is a set of "allowed" notes, written as semitone distances above the root.
enum class ScaleType { MajorPent, MinorPent, Major, Dorian, Lydian, Mixolydian, Minor };

struct ScaleInfo {
    const char* name;
    int size;         // how many notes per octave (5 or 7)
    int offsets[7];   // semitones above the root (unused slots are 0)
};

inline const ScaleInfo& scaleInfo(ScaleType t) {
    // The order matches the enum above.
    static const ScaleInfo table[] = {
        {"major pentatonic", 5, {0, 2, 4, 7, 9, 0, 0}},
        {"minor pentatonic", 5, {0, 3, 5, 7, 10, 0, 0}},
        {"major",            7, {0, 2, 4, 5, 7, 9, 11}},   // bright, open
        {"dorian",           7, {0, 2, 3, 5, 7, 9, 10}},   // minor, but hopeful: epic
        {"lydian",           7, {0, 2, 4, 6, 7, 9, 11}},   // bright with a floating, wondrous feel
        {"mixolydian",       7, {0, 2, 4, 5, 7, 9, 10}},   // major with a heroic, adventurous edge
        {"minor",            7, {0, 2, 3, 5, 7, 8, 10}},   // serious, weighty
    };
    return table[static_cast<int>(t)];
}

// Scale degree -> MIDI note, for any of the scales above.
// degree 0 = the root, 1 = next scale note, and so on; negative degrees go below the root.
inline int scaleNote(int rootMidi, int degree, ScaleType t) {
    const ScaleInfo& s = scaleInfo(t);
    int octave = degree / s.size;
    int index = degree % s.size;
    if (index < 0) {      // integer division rounds toward zero, so fix negatives
        index += s.size;
        octave -= 1;
    }
    return rootMidi + 12 * octave + s.offsets[index];
}

// Pentatonic scale degree -> MIDI note, in a major or minor flavour (older helper, still used by terrain mode).
//   major pentatonic: root, +2, +4, +7, +9  (bright, open)
//   minor pentatonic: root, +3, +5, +7, +10 (darker, moodier)
inline int scaleDegreeToMidiMode(int rootMidi, int degree, bool major) {
    return scaleNote(rootMidi, degree, major ? ScaleType::MajorPent : ScaleType::MinorPent);
}

// Older version, always major (kept so earlier test programs still build).
inline int scaleDegreeToMidi(int rootMidi, int degree) {
    return scaleDegreeToMidiMode(rootMidi, degree, true);
}