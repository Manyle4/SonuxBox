#pragma once

#include <opencv2/opencv.hpp>

// What a pixel represents. 'enum class' = a named list of choices.
enum class Terrain { Dark, Ocean, Vegetation, Land, IceCloud, Other };
constexpr int kTerrainCount = 6;

// ---- Thresholds (OpenCV HSV: H 0-179, S 0-255, V 0-255). Tweak these! ----
constexpr int kBlackV = 12;       // brightness below this = truly black (nothing there)
constexpr int kDeepWaterV = 90;   // dark AND bluish below this brightness = deep water
constexpr int kGreySat = 40;      // saturation below this = grey/white (no real colour)
constexpr int kIceV = 150;        // low-saturation AND at least this bright = ice or cloud

// Decide what one pixel is. The order of the checks matters: the first match wins.
inline Terrain classifyPixel(const cv::Vec3b& hsvPx) {
    const int h = hsvPx[0];
    const int s = hsvPx[1];
    const int v = hsvPx[2];

    if (v < kBlackV) return Terrain::Dark;

    if (v > 200 && s >= 40) {
        // Warm bright glow (yellow/orange/red) -> Land/Energy
        if (h < 45 || h >= 150) return Terrain::Land;
        // Cool bright glow (cyan/blue/white-blue) -> IceCloud/Lightning
        return Terrain::IceCloud;
    }

    // Deep water is dark and bluish. This check MUST come before the grey check below,
    // because very dark ocean has low saturation and would otherwise count as "Other".
    if (v < kDeepWaterV && h >= 85 && h <= 140 && s >= 20) return Terrain::Ocean;

    if (s < kGreySat) return (v >= kIceV) ? Terrain::IceCloud : Terrain::Other;
    if (h >= 90 && h <= 135) return Terrain::Ocean;
    if (h >= 35 && h < 90) return Terrain::Vegetation;
    if (h < 35 || h >= 160) return Terrain::Land;
    return Terrain::Other;
}

// Colour (B, G, R) used when drawing the debug picture.
inline cv::Vec3b terrainDebugColor(Terrain t) {
    switch (t) {
        case Terrain::Dark:       return cv::Vec3b(0, 0, 0);        // black
        case Terrain::Ocean:      return cv::Vec3b(200, 90, 20);    // blue
        case Terrain::Vegetation: return cv::Vec3b(60, 180, 60);    // green
        case Terrain::Land:       return cv::Vec3b(60, 150, 210);   // tan/orange
        case Terrain::IceCloud:   return cv::Vec3b(255, 255, 255);  // white
        case Terrain::Other:      return cv::Vec3b(200, 0, 200);    // magenta
    }
    return cv::Vec3b(200, 0, 200);  // never reached, but keeps the compiler happy
}

inline const char* terrainName(Terrain t) {
    switch (t) {
        case Terrain::Dark:       return "Dark";
        case Terrain::Ocean:      return "Ocean";
        case Terrain::Vegetation: return "Vegetation";
        case Terrain::Land:       return "Land";
        case Terrain::IceCloud:   return "Ice/cloud";
        case Terrain::Other:      return "Other";
    }
    return "Other";
}