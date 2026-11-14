#pragma once

#include "notes.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <vector>

constexpr double kTwoPi = 6.283185307179586;
constexpr double kVibratoRate = 5.5;  // pitch wobbles per second

// Everything that defines how one "instrument" sounds.
struct Instrument {
    double attack;                    // seconds to fade in
    double decay;                     // seconds to settle from the peak down to the sustain level
    double sustain;                   // held loudness level, 0..1
    double release;                   // seconds to fade out after the note ends
    std::array<double, 6> harmonics;  // loudness of the 1st..6th overtone (0 = unused)
    int unison;                       // how many slightly detuned copies are layered (1 = none)
    double detuneCents;               // spread between those copies (100 cents = one semitone)
    double vibrato;                   // pitch wobble depth as a fraction of the frequency (0 = none)
    double gain;                      // overall loudness of this instrument
};

// One instrument per voice. 'static const' means each is created once and shared.
inline const Instrument& instrumentFor(int voice) {
    //                              att    dec   sus   rel   harmonics                        uni  cents vib    gain
    static const Instrument melody = {0.015, 0.10, 0.75, 0.30, {1.0, 0.30, 0.12, 0.0, 0.0, 0.0},  1, 0.0, 0.004, 0.30};
    static const Instrument bass   = {0.040, 0.10, 0.85, 0.50, {1.0, 0.50, 0.25, 0.10, 0.0, 0.0}, 1, 0.0, 0.0,   0.32};
    static const Instrument pad    = {0.700, 0.30, 0.85, 1.40, {1.0, 0.50, 0.33, 0.25, 0.0, 0.0}, 3, 7.0, 0.0,   0.09};
    static const Instrument perc   = {0.001, 0.0,  1.0,  0.0,  {0.0, 0.0, 0.0, 0.0, 0.0, 0.0},  1, 0.0, 0.0,   0.22};
    if (voice == 1) return bass;
    if (voice == 2) return pad;
    if (voice == 3) return perc;
    return melody;
}

// ADSR envelope: the loudness shape of a note.
// t = seconds since the note started, noteDur = how long the key is held.
inline double adsr(double t, double noteDur, const Instrument& in) {
    if (t < 0.0) return 0.0;
    if (t < noteDur) {
        if (t < in.attack) return t / in.attack;
        if (t < in.attack + in.decay) return 1.0 - (1.0 - in.sustain) * ((t - in.attack) / in.decay);
        return in.sustain;
    }
    const double r = t - noteDur;  // time since release started
    if (r >= in.release) return 0.0;
    const double levelAtRelease = adsr(noteDur * 0.999999, noteDur, in);  // loudness just before release
    return levelAtRelease * (1.0 - r / in.release);
}

// A drum-like hit: noise that dies away fast, plus a short low sine "thump".
// The noise uses a fixed seed so the same image always sounds the same.
inline void renderHit(std::vector<float>& out, const NoteEvent& n, const Instrument& in, int sampleRate) {
    const std::size_t first = static_cast<std::size_t>(n.startSec * sampleRate);
    const std::size_t count = static_cast<std::size_t>(n.durationSec * sampleRate);
    std::uint32_t seed = 12345u + static_cast<std::uint32_t>(first);
    for (std::size_t i = 0; i < count && first + i < out.size(); ++i) {
        const double t = static_cast<double>(i) / sampleRate;
        seed = seed * 1664525u + 1013904223u;  // cheap random numbers
        const double noise = (seed >> 8) / 8388608.0 - 1.0;  // -1..1
        const double thump = std::sin(kTwoPi * (55.0 + 60.0 * std::exp(-t * 40.0)) * t);
        const double sample = 0.35 * noise * std::exp(-t * 60.0) + thump * std::exp(-t * 18.0);
        out[first + i] += static_cast<float>(sample * in.gain * n.velocity);
    }
}

// Turn a list of notes into audio samples (floats between -1 and 1), mono.
inline std::vector<float> renderNotes(const std::vector<NoteEvent>& notes, int sampleRate) {
    // 1. Work out how long the whole piece is (each instrument has its own release time).
    double endSec = 0.0;
    for (const NoteEvent& n : notes) {
        endSec = std::max(endSec, n.startSec + n.durationSec + instrumentFor(n.voice).release);
    }

    // 2. A buffer of silence that we add every note into.
    std::vector<float> out(static_cast<std::size_t>(endSec * sampleRate) + 1, 0.0f);

    for (const NoteEvent& n : notes) {
        const Instrument& in = instrumentFor(n.voice);
        if (n.voice == 3) {  // percussion: a soft noise click over a low thump
            renderHit(out, n, in, sampleRate);
            continue;
        }
        const double baseFreq = midiToFreq(n.midiNote);
        const std::size_t first = static_cast<std::size_t>(n.startSec * sampleRate);
        const std::size_t count = static_cast<std::size_t>((n.durationSec + in.release) * sampleRate);

        // Frequencies of the detuned copies, spread evenly from -detune to +detune.
        // Several copies a few cents apart slowly drift in and out of phase: a "chorus" or "string section" effect.
        std::vector<double> freqs;
        for (int u = 0; u < in.unison; ++u) {
            const double pos = (in.unison == 1) ? 0.0 : (2.0 * u / (in.unison - 1) - 1.0);  // -1 .. +1
            freqs.push_back(baseFreq * std::pow(2.0, pos * in.detuneCents / 1200.0));
        }
        const double perCopy = in.gain * n.velocity / in.unison;

        for (std::size_t i = 0; i < count && first + i < out.size(); ++i) {
            const double t = static_cast<double>(i) / sampleRate;
            const double env = adsr(t, n.durationSec, in);
            if (env <= 0.0) continue;

            // Vibrato fades in over the first 0.4 s, so short notes stay clean.
            const double wobble = std::sin(kTwoPi * kVibratoRate * t) * std::min(1.0, t / 0.4);

            double sample = 0.0;
            for (const double f : freqs) {
                const double phase = kTwoPi * f * t + in.vibrato * f / kVibratoRate * wobble;
                for (std::size_t h = 0; h < in.harmonics.size(); ++h) {
                    if (in.harmonics[h] == 0.0) continue;
                    sample += in.harmonics[h] * std::sin((h + 1) * phase);
                }
            }
            out[first + i] += static_cast<float>(sample * perCopy * env);
        }
    }

    // 3. Bring the whole piece to a consistent loudness (peak = 0.9), so every image is equally loud.
    float peak = 0.0f;
    for (float s : out) peak = std::max(peak, std::fabs(s));
    if (peak > 0.0f) {
        const float gain = 0.9f / peak;
        for (float& s : out) s *= gain;  // 'float&' = edit the original element, not a copy
    }
    return out;
}
