#include "notes.h"
#include "synth.h"
#include "wav_writer.h"

#include <opencv2/opencv.hpp>

#include <iostream>
#include <string>
#include <vector>

// Settings you can tweak. 'constexpr' = a constant fixed at compile time.
constexpr int kColumns = 32;          // number of time steps (columns)
constexpr int kRows = 20;             // vertical resolution of the working grid
constexpr int kScaleDegrees = 10;     // pitch range: 10 pentatonic notes = 2 octaves
constexpr int kRootMidi = 60;         // middle C
constexpr double kBpm = 110.0;
constexpr double kRestThreshold = 30; // brightest pixel below this (0-255) = silence

// Turn an image into a list of notes.
std::vector<NoteEvent> imageToNotes(const cv::Mat& image) {
    // 1. Colour -> greyscale (brightness only, one number per pixel).
    cv::Mat gray;
    cv::cvtColor(image, gray, cv::COLOR_BGR2GRAY);

    // 2. Shrink to the working grid. Each cell is now the average of a block of pixels.
    cv::Mat grid;
    cv::resize(gray, grid, cv::Size(kColumns, kRows), 0, 0, cv::INTER_AREA);

    const double stepSec = 60.0 / kBpm / 2.0;  // eighth notes

    std::vector<NoteEvent> notes;
    std::cout << "column -> scale degree (. = rest)\n";

    for (int x = 0; x < kColumns; ++x) {
        // 3. Find the brightest pixel in this column.
        double minVal = 0.0, maxVal = 0.0;
        cv::Point minLoc, maxLoc;
        cv::minMaxLoc(grid.col(x), &minVal, &maxVal, &minLoc, &maxLoc);

        if (maxVal < kRestThreshold) {
            std::cout << ". ";
            continue;  // skip: no note for this column
        }

        // 4. Row 0 is the TOP of the image, but we want the top to be the HIGH note,
        //    so flip it: (kRows - 1 - y). Then scale 0..19 down to 0..9.
        const int y = maxLoc.y;  // cv::Point has .x (column) and .y (row)
        const int degree = (kRows - 1 - y) * kScaleDegrees / kRows;

        NoteEvent n;
        n.startSec = x * stepSec;
        n.durationSec = stepSec * 0.9;
        n.midiNote = scaleDegreeToMidi(kRootMidi, degree);
        n.velocity = static_cast<float>(0.4 + 0.6 * (maxVal / 255.0));  // 0.4 .. 1.0
        notes.push_back(n);

        std::cout << degree << " ";
    }
    std::cout << "\n";
    return notes;
}

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <image> [output.wav]\n";
        return 1;
    }
    const std::string inPath = argv[1];
    const std::string outPath = (argc >= 3) ? argv[2] : "image_melody.wav";

    cv::Mat image = cv::imread(inPath, cv::IMREAD_COLOR);
    if (image.empty()) {
        std::cerr << "Could not load image: " << inPath << "\n";
        return 1;
    }

    const std::vector<NoteEvent> notes = imageToNotes(image);
    std::cout << "Generated " << notes.size() << " notes.\n";
    if (notes.empty()) {
        std::cerr << "No notes (image too dark?). Try lowering kRestThreshold.\n";
        return 1;
    }

    const int sampleRate = 44100;
    const std::vector<float> audio = renderNotes(notes, sampleRate);
    if (!writeWav16(outPath, audio, sampleRate)) {
        std::cerr << "Failed to write " << outPath << "\n";
        return 1;
    }
    std::cout << "Wrote " << outPath << "\n";
    return 0;
}