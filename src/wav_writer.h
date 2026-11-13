#pragma once

#include <algorithm>
#include <cstdint>
#include <fstream>
#include <string>
#include <vector>

inline void write16(std::ofstream& f, std::uint16_t v) {
    f.write(reinterpret_cast<const char*>(&v), sizeof v);
}
inline void write32(std::ofstream& f, std::uint32_t v) {
    f.write(reinterpret_cast<const char*>(&v), sizeof v);
}

inline bool writeWav16(const std::string& path, const std::vector<float>& samples, int sampleRate) {
    std::ofstream f(path, std::ios::binary);
    if (!f) return false;

    const std::uint16_t channels = 1;
    const std::uint16_t bitsPerSample = 16;
    const std::uint16_t blockAlign = channels * bitsPerSample / 8;  // bytes per sample frame
    const std::uint32_t byteRate = static_cast<std::uint32_t>(sampleRate) * blockAlign;
    const std::uint32_t dataBytes = static_cast<std::uint32_t>(samples.size()) * blockAlign;

    f.write("RIFF", 4);
    write32(f, 36 + dataBytes);
    f.write("WAVE", 4);
    f.write("fmt ", 4);
    write32(f, 16);
    write16(f, 1);
    write16(f, channels);
    write32(f, static_cast<std::uint32_t>(sampleRate));
    write32(f, byteRate);
    write16(f, blockAlign);
    write16(f, bitsPerSample);
    f.write("data", 4);
    write32(f, dataBytes);

    for (float s : samples) {
        const float clamped = std::clamp(s, -1.0f, 1.0f);
        const std::int16_t v = static_cast<std::int16_t>(clamped * 32767.0f);
        f.write(reinterpret_cast<const char*>(&v), sizeof v);
    }
    return static_cast<bool>(f);
}