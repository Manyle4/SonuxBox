#include "notes.h"
#include "synth.h"
#include "wav_writer.h"

#include <iostream>
#include <random>
#include <vector>

std::vector<NoteEvent> buildMelody(const std::vector<double>& shape, bool useScale) {
    const double bpm = 110.0;
    const double stepSec = 60.0 / bpm / 2.0;
    const int rootMidi = 60;

    std::vector<NoteEvent> notes;
    for (std::size_t i = 0; i < shape.size(); ++i) {
        NoteEvent n;
        n.startSec = i * stepSec;
        n.durationSec = stepSec * 0.9;
        if (useScale){
            n.midiNote = scaleDegreeToMidi(rootMidi, static_cast<int>(shape[i] * 10.0));
        } 
        else{
            n.midiNote = rootMidi + static_cast<int>(shape[i] * 25.0);
        }
        n.velocity = 0.8f;
        notes.push_back(n);
    }
    return notes;
}

int main() {
    const int sampleRate = 44100;

    std::mt19937 rng(42);
    std::uniform_real_distribution<double> dist(0.0, 0.999);

    std::vector<double> shape;
    for (int i=0; i<32; i++){
        shape.push_back(dist(rng));
    }

    const std::vector<float> scaled = renderNotes(buildMelody(shape, true), sampleRate);
    const std::vector<float> chromatic = renderNotes(buildMelody(shape, false), sampleRate);

    if (!writeWav16("random_pentatonic.wav", scaled, sampleRate) ||
        !writeWav16("random_chromatic.wav", chromatic, sampleRate)) {
        std::cerr << "Failed to write WAV files.\n";
        return 1;
    }
    std::cout << "Wrote random_pentatonic.wav and random_chromatic.wav\n";
    return 0;
}