#pragma once

#include <cmath>

struct NoteEvent {
    double startSec;     // when the note begins
    double durationSec;  // how long it is held
    int midiNote;        // pitch as a MIDI number (60 = middle C, 69 = A440)
    float velocity;      // loudness from 0.0 to 1.0
    int voice = 0;       // which part plays it: 0 = melody, 1 = bass
};

inline double midiToFreq(int midiNote) {    //Converts the MIDI note pitch to a frequency
    return 440.0 * std::pow(2.0, (midiNote - 69) / 12.0);
}


inline int scaleDegreeToMidiMode(int rootMidi, int degree, bool major){
    //rootMidi = Where the scale starts
    static const int majorOffsets[5] = {0, 2, 4, 7, 9};  //The steps for a 5-note scale
    static const int minorOffsets[5] = {0, 3, 5, 7, 10};
    const int* offsets = major ? majorOffsets : minorOffsets;

    int octave = degree / 5;
    int index = degree % 5;
    if (index < 0) {
        index += 5;
        octave -= 1;
    }
    return rootMidi + 12 * octave + offsets[index]; //Returns the final piano key note as a number
}

inline int scaleDegreeToMidi(int rootMidi, int degree) {
    return scaleDegreeToMidiMode(rootMidi, degree, true);
}