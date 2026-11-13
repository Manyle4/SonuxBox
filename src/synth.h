#pragma once

#include "notes.h"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <vector>

constexpr double kTwoPi = 6.283185307179586;    //2pi
constexpr double kRelease = 0.20;   //How long the sound continues fading out after the note ends

inline double adsr(double t, double noteDur) {
    const double attack = 0.01; //How fast it goes from silence to the highest volume
    const double decay = 0.08;  //Like it should go down a bit to a level volume
    const double sustain = 0.70;//How long it holds the level volume

    if (t < 0.0) return 0.0;
    if (t < noteDur) {  //How to apply the attack, delay and sustain to each note based on the time
        if (t < attack) return t / attack;
        if (t < attack + decay) return 1.0 - (1.0 - sustain) * ((t - attack) / decay);
        return sustain;
    }
    const double r = t - noteDur; //Once the note duration is done how long it is fading out
    if (r >= kRelease) return 0.0;  //Sound should stop if the fading time is done
    return sustain * (1.0 - r / kRelease);
}

inline std::vector<float> renderNotes(const std::vector<NoteEvent>& notes, int sampleRate) {
    double endSec = 0.0;    //Length of the longest note
    for (const NoteEvent& n : notes) {
        endSec = std::max(endSec, n.startSec + n.durationSec + kRelease);
    }

    //Total audio length in samples
    std::vector<float> out(static_cast<std::size_t>(endSec * sampleRate) + 1, 0.0f);

    for (const NoteEvent& n : notes) {
        const double freq = midiToFreq(n.midiNote);
        const std::size_t first = static_cast<std::size_t>(n.startSec * sampleRate);
        const std::size_t count = static_cast<std::size_t>((n.durationSec + kRelease) * sampleRate);

        for (std::size_t i = 0; i < count && first + i < out.size(); ++i) {
            const double t = static_cast<double>(i) / sampleRate;

            const double wave = std::sin(kTwoPi * freq * t)
                              + 0.30 * std::sin(kTwoPi * 2.0 * freq * t)
                              + 0.12 * std::sin(kTwoPi * 3.0 * freq * t);

            out[first + i] += static_cast<float>(wave * adsr(t, n.durationSec) * n.velocity * 0.25);
        }
    }

    float peak = 0.0f;
    for (float s : out) peak = std::max(peak, std::fabs(s));
    if (peak > 0.9f) {
        const float gain = 0.9f / peak;
        for (float& s : out) s *= gain;
    }
    return out;
}