#!/bin/sh
# Полный рендер промо: 2 потока (на 4 ядрах 3 потока молотили CPU), DPR 1.5.
# Несколько проходов добивают кадры, упавшие по памяти/таймауту, затем сборка.
cd "$(dirname "$0")"
for pass in 1 2 3 4 5; do
  seq 0 30 1649 | xargs -P 2 -I{} sh -c 'for f in $(seq {} $(({}+29))); do [ $f -le 1649 ] && [ ! -f frames/f$(printf %04d $f).jpg ] && node render.mjs frames $f,$((f+1)) || true; done'
  M=$(for f in $(seq 0 1649); do [ -f frames/f$(printf %04d $f).jpg ] || echo x; done | wc -l)
  [ "$M" -eq 0 ] && break
done
echo "missing $(for f in $(seq 0 1649); do [ -f frames/f$(printf %04d $f).jpg ] || echo x; done | wc -l)"
mkdir -p renders
ffmpeg -y -loglevel error -framerate 30 -i frames/f%04d.jpg -i assets/track.mp3 -vf scale=1920:1080:flags=lanczos -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart renders/mintly-promo.mp4 && echo MUXED
