#!/bin/bash
# Runs earth_story on every image in images/ and prints a short summary of each.

mkdir -p test_out

found=0
for f in images/*.png images/*.jpg images/*.jpeg; do
  [ -e "$f" ] || continue          # skip patterns that matched no file
  found=1
  name=$(basename "${f%.*}")       # file name without folder or extension
  echo "=== $f"
  ./build/earth_story "$f" "test_out/$name.wav" > "test_out/$name.log" 2>&1
  grep -E "Dark|Ocean|Vegetation|Land|Ice/cloud|Other|=>|Failed|Could not" "test_out/$name.log"
  grep -A1 "^melody" "test_out/$name.log"
done

if [ "$found" -eq 0 ]; then
  echo "No images found in images/ (looking for .png, .jpg, .jpeg)"
fi