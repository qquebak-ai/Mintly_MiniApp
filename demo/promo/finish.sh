#!/bin/sh
cd "$(dirname "$0")"
# дорендер пропущенных кадров по одному, последовательно — финал тяжёлый, параллель роняет браузер по памяти
for f in $(seq 0 1649); do
  [ -f "frames/f$(printf %04d $f).jpg" ] || node render.mjs frames $f,$((f+1)) || true
done
# добиваем всё, что осталось пустым после сбоев
for p in 1 2 3; do
  for f in $(seq 0 1649); do
    [ -f "frames/f$(printf %04d $f).jpg" ] || node render.mjs frames $f,$((f+1)) || true
  done
done
MISS=$(for f in $(seq 0 1649); do [ -f "frames/f$(printf %04d $f).jpg" ] || echo x; done | wc -l)
echo "still-missing $MISS"
mkdir -p renders
ffmpeg -y -loglevel error -framerate 30 -i frames/f%04d.jpg -i assets/track.mp3 -vf scale=1920:1080:flags=lanczos -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart renders/mintly-promo.mp4 && echo MUXED
