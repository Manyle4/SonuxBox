#define MINIAUDIO_IMPLEMENTATION
#include "miniaudio.h"

#include <cmath>
#include <iostream>

struct ToneState {
    double phase = 0.0;
    double frequency = 440.0;
    double sampleRate = 44100.0;
    float amplitude = 0.2f;
};


void dataCallback(ma_device* device, void* output, const void* /*input*/, ma_uint32 frameCount) {
    ToneState* state = static_cast<ToneState*>(device->pUserData);
    float* out = static_cast<float*>(output);

    const double twoPi = 6.283185307179586;
    const double phaseStep = twoPi * state->frequency / state->sampleRate;

    for (ma_uint32 i = 0; i < frameCount; ++i) {
        out[i] = state->amplitude * static_cast<float>(std::sin(state->phase));
        state->phase += phaseStep;
        if (state->phase >= twoPi) {
            state->phase -= twoPi;
        }
    }
}

int main() {
    ToneState state;

    ma_device_config config = ma_device_config_init(ma_device_type_playback);
    config.playback.format = ma_format_f32;  // 32-bit float samples in the range -1..1
    config.playback.channels = 1;            // mono
    config.sampleRate = 44100;
    config.dataCallback = dataCallback;      // our function, passed by name
    config.pUserData = &state;               // & = "address of": hands the callback our state

    ma_device device;
    if (ma_device_init(nullptr, &config, &device) != MA_SUCCESS) {
        std::cerr << "Failed to open the audio device.\n";
        return 1;
    }
    state.sampleRate = device.sampleRate;  // use the rate the device really gave us

    if (ma_device_start(&device) != MA_SUCCESS) {
        std::cerr << "Failed to start the audio device.\n";
        ma_device_uninit(&device);
        return 1;
    }

    std::cout << "Playing " << state.frequency << " Hz. Press Enter to stop.\n";
    std::cin.get();  // main thread waits here while the audio thread plays

    ma_device_uninit(&device);  // always close what you opened
    return 0;
}