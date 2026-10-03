#!/bin/sh
# Полный рендер промо: КАЖДЫЙ БРАУЗЕР рендерит чанк по 30 кадров (холодный старт
# ~12с амортизируется на 30 кадров), 2 чанка параллельно. Несколько проходов
# добивают кадры, упавшие по памяти/таймауту, затем сборка.
cd "$(dirname "$0")"
for pass in 1 2 3 4 5 6; do
  seq 0 30 1649 | xargs -P 2 -I{} sh -c '
    need=0; e=$(({}+30)); [ $e -gt 1650 ] && e=1650
    f={}; while [ $f -lt $e ]; do [ -f frames/f$(printf %04d $f).jpg ] || need=1; f=$((f+1)); done
    [ $need -eq 1 ] && node render.mjs frames {},$e || true'
  M=$(for f in $(seq 0 1649); do [ -f frames/f$(printf %04d $f).jpg ] || echo x; done | wc -l)
  echo "pass $pass: missing $M"
  [ "$M" -eq 0 ] && break
done
mkdir -p renders
ffmpeg -y -loglevel error -framerate 30 -i frames/f%04d.jpg -i assets/track.mp3 -vf scale=1920:1080:flags=lanczos -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart renders/mintly-promo.mp4 && echo MUXED
