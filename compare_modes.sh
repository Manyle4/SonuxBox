#!/bin/bash
# Renders every image in both modes so you can listen and compare.
mkdir -p test_out
for f in images/*.png images/*.jpg; do
  [ -e "$f" ] || continue
  name=$(basename "${f%.*}")
  echo "=== $f"
  ./build/earth_story "$f" "test_out/${name}_adaptive.wav" --adaptive > "test_out/${name}_adaptive.log" 2>&1 \
    || { echo "  adaptive mode failed:"; tail -n 2 "test_out/${name}_adaptive.log"; }
  grep -A1 "^melody" "test_out/${name}_adaptive.log"
done