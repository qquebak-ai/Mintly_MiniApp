#!/bin/sh
# Кадры кусками по 90, потом склейка со звуком.
set -e
cd "$(dirname "$0")"
for s in $(seq 0 90 719); do
  [ -f "frames/f$(printf %04d $((s+89)))".jpg ] || node render.mjs frames $s,$((s+90))
done
mkdir -p renders
ffmpeg -y -loglevel error -framerate 30 -i frames/f%04d.jpg -i assets/track.mp3 -c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart renders/mintly-showreel.mp4
echo encoded
