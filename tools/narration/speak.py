"""Records the site's narration with the Kokoro voice model.

Reads {key: text} JSON on stdin and writes frontend/public/narration/<key>.mp3, plus
index.json mapping each key to a hash of its text. Only changed texts are re-recorded.
Run it through `npm run narration` in frontend/.
"""
import json
import sys
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

HERE = Path(__file__).parent
OUT = HERE.parent.parent / "frontend" / "public" / "narration"
VOICE = "af_heart"  # warm US English; see Kokoro's voice list for others


def text_hash(text: str) -> str:
    """FNV-1a, same as textHash() in src/narration.ts."""
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def main() -> None:
    texts: dict[str, str] = json.load(sys.stdin)
    OUT.mkdir(parents=True, exist_ok=True)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}

    kokoro = None
    for key, text in texts.items():
        h = text_hash(text)
        if index.get(key) == h and (OUT / f"{key}.mp3").exists():
            print(f"  same   {key}", flush=True)
            continue
        kokoro = kokoro or Kokoro(str(HERE / "models" / "kokoro-v1.0.onnx"), str(HERE / "models" / "voices-v1.0.bin"))
        samples, rate = kokoro.create(text, voice=VOICE, speed=1.0, lang="en-us")
        sf.write(OUT / f"{key}.mp3", samples, rate, format="MP3", compression_level=0.75)
        index[key] = h
        index_path.write_text(json.dumps(index, indent=2, sort_keys=True) + "\n")  # save as we go
        print(f"  voiced {key} ({len(samples) / rate:.0f} s)", flush=True)

    for stale in set(index) - set(texts):  # tracks that no longer exist
        (OUT / f"{stale}.mp3").unlink(missing_ok=True)
        del index[stale]
    index_path.write_text(json.dumps(index, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
