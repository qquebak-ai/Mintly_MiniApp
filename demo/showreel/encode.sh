#!/bin/sh
# Кадры 3840×2160 кусками по 60 (новый браузер на кусок — иначе кончается память),
# затем два файла: 4K и 1080p, уменьшенный из 4K (суперсэмплинг).
set -e
cd "$(dirname "$0")"
for s in $(seq 0 60 839); do
  [ -f "frames/f$(printf %04d $((s+59)))".jpg ] || node render.mjs frames $s,$((s+60))
done
mkdir -p renders
ffmpeg -y -loglevel error -framerate 30 -i frames/f%04d.jpg -i assets/track.mp3 -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart renders/mintly-showreel-4k.mp4
ffmpeg -y -loglevel error -framerate 30 -i frames/f%04d.jpg -i assets/track.mp3 -vf scale=1920:1080:flags=lanczos -c:v libx264 -preset slow -crf 15 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart renders/mintly-showreel.mp4
echo encoded
