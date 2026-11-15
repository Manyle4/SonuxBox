# SonuxBox: an Earth Jukebox

**Hear NASA's views of our changing planet.** SonuxBox turns Earth-science imagery into music: carbon monoxide plumes, lightning, ocean currents, night lights. You can listen to the data, not just look at it.

Built by **team SonuX** (Jonathan Mensah, Eyram Afi Kudzawu-D'Pherdd and Elynam Yawah Kudzawu-D'Pherdd; Accra, Ghana) for the **NASA Space Apps Challenge 2026**, challenge
[*The Earth Information Jukebox*](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/).

- **Live site:** https://sonuxbox.vercel.app
- **API:** https://sonuxbox-api-285f8ea04b1d.herokuapp.com/api/health

## Why sound?

NASA's Earth Information Center (EIC) makes stunning visualisations, but a picture only reaches people who can see it. Sonification, turning data into sound, opens that science up to blind and low-vision people. It also gives everyone else another way in: your ears pick up patterns, like a sudden burst of storms or a region going dark, that are easy to miss on a busy map.

## What it does

- **An Earth Jukebox** of 12 tracks made from NASA EIC / Scientific Visualization Studio frames. Each track comes with what the data shows, what to listen for, and a link to its source.
- **Live from NASA:** pick a layer (sea temperature, rain and snow, plant greenness, land temperature, or haze and smoke) and any day, and hear that day's whole planet, fetched straight from [NASA GIBS](https://earthdata.nasa.gov/gibs). Tick "an earlier day" to hear two days back to back. Values come from NASA's own colour table for the layer, pixel by pixel ("about 32 °C over the Sahara"). Links like `?live=sst&date=2026-11-12` open straight to a day.
- **A time-lapse:** Ukraine's night lights in 2012, then 2023. You can hear the melody thin out as the lights go dark.
- **A guided tour:** a narrated walk through carbon monoxide, aerosols, lightning and Ukraine, with a fact from each track's own data.
- **Every colour gets an instrument:** on data maps, each distinct colour of the data plays its own line. In Aerosols, sulfate plays a soft pluck and dust plays bells, named from NASA's own legend.
- **Real values:** where NASA publishes a colour scale, readings come off it. Ocean currents reads sea temperature: "about 26 °C".
- **Compare mode:** two tracks at once, one per ear, kept in step, so on two world maps you hear the same longitude in both ears. Where smoke and pollution overlap, both ears get loud together.
- **Bring your own image:** upload any PNG or JPEG map and hear it.
- **Live controls:** switch each layer on and off (melody, bass, pad, drums, colour layers), change the speed, turn reverb on and off, and download what you hear as a WAV.
- **Follow along:** a playhead sweeps the image, the slice being heard is highlighted, and a piano roll lights up as notes play.
- **Share and install:** links like `?track=co&compare=aerosol` open straight to a track. The site can be installed, and the jukebox works offline after one visit.

### Accessibility

- **A sound key:** like a map's colour bar, but for your ears. It plays what low and high, soft and loud, the drums and each colour's instrument mean in this piece, using notes from the piece itself. **Hear the key** speaks each entry first.
- **Written description, with places:** "What you're hearing" explains each piece in plain words. On world maps it names places: "busiest over Alaska and northern Canada, South America and Central Africa… strongest over Central Africa". For a time-lapse, it compares the frames.
- **A real voice:** **Read aloud** and the tour use narration recorded with the open [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) voice model. Each recording carries a fingerprint of its text, and if the text changes the page falls back to the browser's voice rather than play something out of date.
- **Live captions:** a caption line says what's under the playhead ("Now: Central Africa, strong signal, note G5"). Screen readers can follow it with "Announce while playing".
- **Explore mode:** hover, drag a finger, or use the arrow keys across the image to hear it one slice at a time. To a screen reader the image is a slider ("Central Africa, slice 18 of 32: strong signal, near the top, note G4"). Phones vibrate harder over stronger slices (Android).
- **Themes and motion:** dark, light and high-contrast themes, chosen from your system settings to start with. Reduced motion turns off animation.
- **Stereo:** the sound moves from your left ear to your right as the scan crosses the image.
- **About this data:** each piece lists the instrument or model, the date, the units and what part of the image was ignored, with a link to the source.
- **Phones:** bigger buttons on touch screens, and a small player stays at the bottom of the screen while you read.
- **Keyboard:** everything works from the keyboard. Space plays and pauses, and status changes are announced.

## How an image becomes music

1. **Read the image.** It's cut into 32 vertical slices, one per beat, read left to right. Legend strips and logos along the bottom or top are ignored (the crop is set per image).
2. **Measure each slice.** There are two ways to read an image:
   - **Adaptive** (for data maps) uses K-means to learn the image's own colours and treats the most common one as the background. Each pixel's *signal* is how far its colour is from that background.
   - **Terrain** (for real-colour Earth images) sorts pixels into ocean, vegetation, land, ice/cloud and dark, using fixed colour rules.
3. **Compose.**
   - **Melody:** follows the height of the signal in each slice. Higher in the image means a higher note. Stronger signal plays louder, and weak slices rest. Notes are smoothed and kept to small steps, so the melody stays musical.
   - **Bass:** one note per bar. It rests on the home note in quiet bars and lifts to the fifth in busy ones.
   - **Pad:** soft chords from a progression that suits the scale.
   - **Drums:** a hit wherever the signal suddenly jumps up, such as lightning, city clusters or the edge of a plume.
   - **Colour layers** (adaptive mode): the clearly-signal pixels are grouped into colour families. Up to two distinct colours each get an instrument: a soft pluck an octave below the melody off the beat, and bells an octave above on the beat.
   - **Key, scale and tempo** come from the image: its main colour picks the key (30° of hue per key), and how much is going on picks the scale and tempo.
4. **Play.** A small additive synthesizer renders the sound, with ADSR envelopes, overtones, detuned pad voices and vibrato. The C++ engine writes it as a WAV. The website runs the same synth in the browser (it matches the engine's WAV to within a sample of timing), so it can mute layers, change speed, add reverb and pan in stereo instantly.

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

Colour scales come from SVS too: the [sea surface temperature bar](https://svs.gsfc.nasa.gov/3912/) and the [aerosol type legend](https://svs.gsfc.nasa.gov/5669/) (copies in `images/legends`).

Inspiration: NASA's own sonification of [Caldwell 73](https://svs.gsfc.nasa.gov/13786/), which maps brightness and position to volume and pitch.

Live maps come from [NASA GIBS](https://earthdata.nasa.gov/gibs) (the imagery behind [Worldview](https://worldview.earthdata.nasa.gov/)): MUR sea surface temperature, IMERG precipitation, MODIS NDVI, MODIS land surface temperature and MODIS aerosol optical depth, with their published colour tables.

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
| `cropTop` | share of the top to ignore (logos), `0`–`0.3` | `0` |
| `scale` | a colour bar as `#rrggbb:value;#rrggbb:value;…`, matched by hue | none |

The response includes:
- **Piece:** `scale`, `bpm`, `columns`, `stepSec`, `musicSec`.
- **Image:** `imageWidth`/`imageHeight`, `cropBottom`/`cropTop`.
- **`layers`:** colour, hex and which voice plays it.
- **Per column, `columnStats`:** signal, height, `peakPos` (height of the strongest band), and `value` when a scale was given.
- **`notes`:** each with `start`, `dur`, `midi`, `vel` and `voice`: `melody`, `bass`, `pad`, `perc`, `pluck` or `bell`. It also gives an `audioUrl` for a WAV the server rendered. Those files are temporary.

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
npm run narration    # re-record changed narration with Kokoro (needs tools/narration set up, below)
npm test             # unit tests
```

**Narration** needs Python 3.10–3.13 and the Kokoro model files:
- **Packages:** run `pip install kokoro-onnx soundfile` into `tools/narration/.venv`.
- **Model files:** put `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the [kokoro-onnx releases](https://github.com/thewh1teagle/kokoro-onnx/releases) in `tools/narration/models/`.

**Tests:**
- **Website:** `npm test` runs the unit tests: places, descriptions against the real tracks, time-lapses, narration fingerprints, the synth, the sound key, and reading live values from NASA colour tables.
- **API:** `tools/test_api.sh [api-url]` runs every jukebox image through the API in both modes, and checks the error replies.
- **CI:** GitHub Actions runs both on every push.

**Deploy:** `git push heroku main` builds the engine's Docker image on Heroku (`heroku.yml`). The site deploys on Vercel with `frontend` as the root directory.

## Repo layout

| Path | What's there |
|---|---|
| `src/` | the engine: analysis (`terrain.h`, `adaptive.h`), composition (`earth_pipeline.h`, `composer.h`), synth (`synth.h`), API server and CLI |
| `frontend/` | the website |
| `images/` | source images |
| `tools/` | API test, Kokoro narration recorder, earlier prototypes and debug tools (`-DSONUX_TOOLS=OFF` skips them) |
| `third_party/` | cpp-httplib, miniaudio |
