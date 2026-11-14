# SonuxBox: an Earth Jukebox

**Hear NASA's views of our changing planet.** SonuxBox turns Earth-science imagery into music: carbon monoxide plumes, lightning, ocean currents, night lights. You can listen to the data, not just look at it.

Built by **team SonuX** (Accra, Ghana) for the **NASA Space Apps Challenge 2026**, challenge
[*The Earth Information Jukebox*](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/).

- **Live site:** https://sonuxbox.vercel.app
- **API:** https://sonuxbox-api-285f8ea04b1d.herokuapp.com/api/health

## Why sound?

NASA's Earth Information Center (EIC) makes stunning visualisations, but a picture only reaches people who can see it. Sonification, turning data into sound, opens that science up to blind and low-vision people. It also gives everyone else another way in: your ears pick up patterns, like a sudden burst of storms or a region going dark, that are easy to miss on a busy map.

## What it does

- **An Earth Jukebox** of 12 tracks made from NASA EIC / Scientific Visualization Studio frames. Each track comes with what the data shows, what to listen for, and a link to its source.
- **A time-lapse:** Ukraine's night lights in 2012, then 2023. You can hear the melody thin out as the lights go dark.
- **Bring your own image:** upload any PNG or JPEG map and hear it.
- **Live controls:** switch the melody, bass, pad and drums on and off, change the speed, and download what you hear as a WAV.
- **Follow along:** a playhead sweeps the image, the slice being heard is highlighted, and a piano roll lights up as notes play.

### Accessibility

- **Written description:** "What you're hearing" explains each piece in plain words: where the melody is busiest, where the signal is strongest, the highest note, and how much is quiet. For a time-lapse, it compares the frames. A **Read aloud** button speaks it for people who don't use a screen reader.
- **Explore mode:** hover, drag a finger, or use the arrow keys across the image to hear it one slice at a time. To a screen reader the image is a slider ("Column 12 of 32: strong signal, near the top, note G4"). Phones vibrate harder over stronger slices (Android).
- **Stereo:** the sound moves from your left ear to your right as the scan crosses the image.
- **Keyboard:** everything works from the keyboard. Space plays and pauses, and status changes are announced.

## How an image becomes music

1. **Read the image.** It's cut into 32 vertical slices, one per beat, read left to right. Most NASA frames have a legend strip along the bottom, which is ignored (the crop is set per image).
2. **Measure each slice.** There are two ways to read an image:
   - **Adaptive** (for data maps) uses K-means to learn the image's own colours and treats the most common one as the background. Each pixel's *signal* is how far its colour is from that background.
   - **Terrain** (for real-colour Earth images) sorts pixels into ocean, vegetation, land, ice/cloud and dark, using fixed colour rules.
3. **Compose.**
   - **Melody:** follows the height of the signal in each slice. Higher in the image means a higher note. Stronger signal plays louder, and weak slices rest. Notes are smoothed and kept to small steps, so the melody stays musical.
   - **Bass:** one note per bar. It rests on the home note in quiet bars and lifts to the fifth in busy ones.
   - **Pad:** soft chords from a progression that suits the scale.
   - **Drums:** a hit wherever the signal suddenly jumps up, such as lightning, city clusters or the edge of a plume.
   - **Key, scale and tempo** come from the image: its main colour picks the key (30° of hue per key), and how much is going on picks the scale and tempo.
4. **Play.** A small additive synthesizer renders the sound, with ADSR envelopes, overtones, detuned pad voices and vibrato. The C++ engine writes it as a WAV. The website renders the same synth in the browser, matching the engine sample for sample, so it can mute layers, change speed and pan in stereo instantly.

## NASA data

All images are frames from NASA visualisations listed in the challenge resources:

| Track | Source |
|---|---|
| Carbon monoxide, Ozone, Nitrogen oxides | [Air Quality Model Runs (GEOS-CF, GMAO)](https://svs.gsfc.nasa.gov/5533/) |
| Aerosols | [GEOS Aerosols](https://svs.gsfc.nasa.gov/5669/) |
| Ocean currents | [Global Sea Surface Currents and Temperature](https://svs.gsfc.nasa.gov/3912/) |
| Night lights | [Change in Night Lights 2012–2023 (EIC)](https://svs.gsfc.nasa.gov/5313/) |
| Ukraine lights, 2012 → 2023 | [Change in Night Lights between 2012 and 2023](https://svs.gsfc.nasa.gov/5276/) |
| Atmospheric river | [A 3D View of an Atmospheric River](https://svs.gsfc.nasa.gov/4960/) |
| Forest height | [GEDI Forest Height](https://svs.gsfc.nasa.gov/4950/) |
| Lightning | [Lightning Events Detected from the ISS 2017–2023](https://svs.gsfc.nasa.gov/5011/) |
| Carbon dioxide | [DYAMOND Global Carbon Dioxide](https://svs.gsfc.nasa.gov/5196/) |
| Perpetual Ocean | [Perpetual Ocean 2](https://svs.gsfc.nasa.gov/5425/) |

Inspiration: NASA's own sonification of [Caldwell 73](https://svs.gsfc.nasa.gov/13786/), which maps brightness and position to volume and pitch.

## How it fits together

```
frontend/  (React + Vite, hosted on Vercel)
  ├─ jukebox tracks: pre-rendered results in public/tracks, so they play with no server
  ├─ your uploads ──POST image──▶ engine API (C++, Docker on Heroku) ──▶ notes as JSON
  └─ in-browser synth turns the notes into sound
```

## API

`POST /api/analyze` takes an image (FormData field `image`, or the raw bytes as the body) and returns the notes.

| Option (query or form field) | Values | Default |
|---|---|---|
| `mode` | `adaptive` or `terrain` | `adaptive` |
| `crop` | share of the bottom to ignore, `0`–`0.3` | `0.12` |

The response includes `scale`, `bpm`, `columns`, `stepSec`, `musicSec`, `imageWidth`/`imageHeight`, `cropBottom`, per-column `columnStats`, and `notes` (each with `start`, `dur`, `midi`, `vel` and `voice`: `melody`, `bass`, `pad` or `perc`). It also gives an `audioUrl` for a WAV the server rendered. Those files are temporary.

Errors are always `{"error": "..."}`:
- 400: bad input
- 404: unknown route
- 413: over 20 MB or 40 megapixels
- 422: nothing to play

`GET /api/health` returns `{"status": "ok"}`.

## Running it yourself

**Engine** (needs OpenCV 4+ and CMake):

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target api_server earth_story
./build/api_server                                        # API on :8080 (or $PORT)
./build/earth_story images/co.png out.wav --adaptive      # one image -> out.wav + out.json
```

**Website:**

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (uses the Heroku API unless VITE_API_URL is set)
npm run prerender    # after changing src/tracks.json or the engine
```

**Tests:** `tools/test_api.sh [api-url]` runs every jukebox image through the API in both modes, and checks the error replies.

**Deploy:** `git push heroku main` builds the engine's Docker image on Heroku (`heroku.yml`). The site deploys on Vercel with `frontend` as the root directory.

## Repo layout

| Path | What's there |
|---|---|
| `src/` | the engine: analysis (`terrain.h`, `adaptive.h`), composition (`earth_pipeline.h`, `composer.h`), synth (`synth.h`), API server and CLI |
| `frontend/` | the website |
| `images/` | source images |
| `tools/` | API test, earlier prototypes and debug tools (`-DSONUX_TOOLS=OFF` skips them) |
| `third_party/` | cpp-httplib, miniaudio |
