#include "notes.h"
#include "synth.h"
#include "wav_writer.h"

#include <opencv2/opencv.hpp>

#include <algorithm>
#include <cmath>
#include <iostream>
#include <string>
#include <vector>

// ---- Settings you can tweak ----
constexpr int kColumns = 32;            // time steps
constexpr int kRows = 24;               // vertical resolution of the analysis grid
constexpr int kScaleDegrees = 10;       // pitch range: 10 pentatonic notes = 2 octaves
constexpr int kMaxLeap = 3;             // biggest jump between neighbouring notes (in scale steps)
constexpr double kRestFraction = 0.12;  // columns with less than 12% of peak detail = rest

// Everything we learn about the image as a whole.
struct ImageMood {
    double brightness = 0.0;   // 0..1
    double saturation = 0.0;   // 0..1 (0 = grey, 1 = vivid)
    double hueDeg = 0.0;       // average colour on the colour wheel, 0..360
    double edgeDensity = 0.0;  // fraction of pixels that are edges (how "busy")

    double warmPercent = 0.0;
    double coolPercent = 0.0;

    double redPercent = 0.0;
    double bluePercent = 0.0;
    double greenPercent = 0.0;
    
    bool major = true;
    int rootMidi = 60;
    double bpm = 100.0;
};

// Shrink an image so it is 256 pixels wide (keeping its shape). Analysis on a
// mid-size image is fast, but it keeps far more detail than a tiny 32x24 grid.
cv::Mat toMidSize(const cv::Mat& image) {
    const double scale = 256.0 / image.cols;
    cv::Mat mid;
    cv::resize(image, mid, cv::Size(), scale, scale, cv::INTER_AREA);
    return mid;
}

ImageMood analyzeMood(const cv::Mat& image) {
    ImageMood mood;
    const cv::Mat mid = toMidSize(image);

    // --- Colour statistics, via HSV (Hue, Saturation, Value=brightness) ---
    cv::Mat hsv;
    cv::cvtColor(mid, hsv, cv::COLOR_BGR2HSV);

    double sumV = 0.0, sumS = 0.0, sumCos = 0.0, sumSin = 0.0;
    for (int y = 0; y < hsv.rows; ++y) {
        for (int x = 0; x < hsv.cols; ++x) {
            const cv::Vec3b px = hsv.at<cv::Vec3b>(y, x);  // 3 bytes: H, S, V
            const double h = px[0] * 2.0 * CV_PI / 180.0;  // OpenCV hue is 0..179 -> radians
            const double s = px[1] / 255.0;
            const double v = px[2] / 255.0;
            sumV += v;
            sumS += s;
            // Hue is a circle (359 degrees is next to 0), so we average it as a direction,
            // weighted so vivid, bright pixels count more than dull ones.
            sumCos += s * v * std::cos(h);
            sumSin += s * v * std::sin(h);
        }
    }
    const double n = static_cast<double>(hsv.rows) * hsv.cols;
    mood.brightness = sumV / n;
    mood.saturation = sumS / n;
    mood.hueDeg = std::atan2(sumSin, sumCos) * 180.0 / CV_PI;
    if (mood.hueDeg < 0.0) mood.hueDeg += 360.0;

    // --- Edge density: how busy is the picture? ---
    cv::Mat gray, edges;
    cv::cvtColor(mid, gray, cv::COLOR_BGR2GRAY);
    cv::Canny(gray, edges, 80, 160);
    mood.edgeDensity = static_cast<double>(cv::countNonZero(edges)) / n;

    //Warmth of the image
    cv::Mat warmMask;
    cv::inRange(hsv, cv::Scalar(0, 50, 50), cv::Scalar(30, 255, 255), warmMask);
    mood.warmPercent = static_cast<double>(cv::countNonZero(warmMask)) / n * 100.0;

    //Cool of the image
    cv::Mat coolMask;
    cv::inRange(hsv, cv::Scalar(60, 50, 50), cv::Scalar(130, 255, 255), coolMask);
    mood.coolPercent = static_cast<double>(cv::countNonZero(coolMask)) / n * 100.0;

    cv::Mat mask1, mask2, redMask;
    cv::inRange(hsv, cv::Scalar(0, 70, 50), cv::Scalar(10, 255, 255), mask1);
    cv::inRange(hsv, cv::Scalar(160, 70, 50), cv::Scalar(179, 255, 255), mask2);
    cv::bitwise_or(mask1, mask2, redMask);
    mood.redPercent = static_cast<double>(cv::countNonZero(redMask)) / n * 100.0;

    cv::Mat blueMask;
    cv::inRange(hsv, cv::Scalar(100, 50, 50), cv::Scalar(130, 255, 255), blueMask);
    mood.bluePercent = static_cast<double>(cv::countNonZero(blueMask)) / n * 100.0;

    cv::Mat greenMask;
    cv::inRange(hsv, cv::Scalar(35, 50, 50), cv::Scalar(85, 255, 255), greenMask);
    mood.greenPercent = static_cast<double>(cv::countNonZero(greenMask)) / n * 100.0;


    // --- Decisions ---
    const bool warm = (mood.hueDeg < 75.0 || mood.hueDeg >= 330.0) && mood.saturation > 0.15;
    const bool cool = (mood.hueDeg >= 170.0 && mood.hueDeg < 290.0) && mood.saturation > 0.15;
    double moodScore = mood.brightness;
    if (warm) moodScore -= 0.12;
    if (cool) moodScore += 0.12;
    mood.major = moodScore > 0.42;

    // 12 keys around the colour wheel: every 30 degrees of hue = one semitone.
    const int keyIndex = static_cast<int>(std::lround(mood.hueDeg / 30.0)) % 12;
    mood.rootMidi = 57 + keyIndex;  // A3 .. G#4

    mood.bpm = std::clamp(60.0 + mood.edgeDensity * 600.0, 60.0, 140.0);
    std::cout << "The images mood: \n";
    std::cout << "Warm: "<< mood.warmPercent << '\n';
    std::cout << "Cool: "<< mood.coolPercent << '\n';
    std::cout << "Red: "<< mood.redPercent << '\n';
    std::cout << "Blue: "<< mood.bluePercent << '\n';
    std::cout << "Green: "<< mood.greenPercent << '\n';
    return mood;
}

std::vector<NoteEvent> imageToNotes(const cv::Mat& image, const ImageMood& mood) {
    // 1. Detail map: where is there contrast? Sobel measures how fast brightness
    //    changes in x and y; 'magnitude' combines them into one edge-strength value.
    cv::Mat gray;
    cv::cvtColor(toMidSize(image), gray, cv::COLOR_BGR2GRAY);
    cv::GaussianBlur(gray, gray, cv::Size(3, 3), 0);  // soften noise first

    cv::Mat gx, gy, mag;
    cv::Sobel(gray, gx, CV_32F, 1, 0);
    cv::Sobel(gray, gy, CV_32F, 0, 1);
    cv::magnitude(gx, gy, mag);

    // 2. Shrink the detail map to our analysis grid (averaging, so detail is kept).
    cv::Mat grid;
    cv::resize(mag, grid, cv::Size(kColumns, kRows), 0, 0, cv::INTER_AREA);

    // 3. Per column: total detail ("energy") and its vertical centre of mass.
    std::vector<double> energy(kColumns, 0.0);
    std::vector<double> pos(kColumns, 0.5);  // 0 = bottom, 1 = top
    for (int x = 0; x < kColumns; ++x) {
        double sum = 0.0, weighted = 0.0;
        for (int y = 0; y < kRows; ++y) {
            const float m = grid.at<float>(y, x);
            sum += m;
            weighted += m * y;
        }
        energy[x] = sum;
        if (sum > 1e-6) {
            pos[x] = 1.0 - (weighted / sum) / (kRows - 1);  // flip: top of image = high pitch
        }
    }
    const double maxEnergy = *std::max_element(energy.begin(), energy.end());
    if (maxEnergy <= 0.0) return {};  // totally flat image: nothing to play

    // 4. Smooth the contour so it moves like a phrase, not like noise.
    std::vector<double> smooth(kColumns);
    for (int x = 0; x < kColumns; ++x) {
        const double left = pos[std::max(x - 1, 0)];
        const double right = pos[std::min(x + 1, kColumns - 1)];
        smooth[x] = 0.25 * left + 0.5 * pos[x] + 0.25 * right;
    }

    // 5. Build the notes.
    const double stepSec = 60.0 / mood.bpm / 2.0;  // eighth notes
    std::vector<NoteEvent> notes;
    int prevDegree = -1;

    std::cout << "melody (scale degree per column, . = rest):\n";
    for (int x = 0; x < kColumns; ++x) {
        const double e = energy[x] / maxEnergy;  // 0..1, relative to the busiest column
        if (e < kRestFraction) {
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
        note.midiNote = scaleDegreeToMidiMode(mood.rootMidi, degree, mood.major);
        note.velocity = static_cast<float>(0.45 + 0.5 * e);  // more detail = louder
        notes.push_back(note);

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
    const std::string outPath = (argc >= 3) ? argv[2] : "image_story.wav";

    const cv::Mat image = cv::imread(inPath, cv::IMREAD_COLOR);
    if (image.empty()) {
        std::cerr << "Could not load image: " << inPath << "\n";
        return 1;
    }

    const ImageMood mood = analyzeMood(image);
    static const char* noteNames[12] = {"C", "C#", "D", "D#", "E", "F",
                                        "F#", "G", "G#", "A", "A#", "B"};
    std::cout << "brightness:   " << mood.brightness << "\n"
              << "saturation:   " << mood.saturation << "\n"
              << "average hue:  " << mood.hueDeg << " deg\n"
              << "edge density: " << mood.edgeDensity << "\n"
              << "=> key: " << noteNames[mood.rootMidi % 12]
              << (mood.major ? " major" : " minor") << " pentatonic, "
              << mood.bpm << " BPM\n";

    const std::vector<NoteEvent> notes = imageToNotes(image, mood);
    std::cout << "Generated " << notes.size() << " notes.\n";
    if (notes.empty()) {
        std::cerr << "No notes: the image has too little detail.\n";
        return 1;
    }

    const int sampleRate = 44100;
    if (!writeWav16(outPath, renderNotes(notes, sampleRate), sampleRate)) {
        std::cerr << "Failed to write " << outPath << "\n";
        return 1;
    }
    std::cout << "Wrote " << outPath << "\n";
    return 0;
}