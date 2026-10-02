#!/bin/sh
cd "$(dirname "$0")"
seq 1460 30 1649 | xargs -P 3 -I{} sh -c 'for f in $(seq {} $(({}+29))); do [ $f -le 1649 ] && [ ! -f frames/f$(printf %04d $f).jpg ] && node render.mjs frames $f,$((f+1)) || true; done'
for pass in 1 2 3; do
  M=$(for f in $(seq 1460 1649); do [ -f frames/f$(printf %04d $f).jpg ] || echo $f; done)
  [ -z "$M" ] && break
  for f in $M; do node render.mjs frames $f,$((f+1)) || true; done
done
echo "still $(for f in $(seq 0 1649); do [ -f frames/f$(printf %04d $f).jpg ] || echo x; done | wc -l)"
ffmpeg -y -loglevel error -framerate 30 -i frames/f%04d.jpg -i assets/track.mp3 -vf scale=1920:1080:flags=lanczos -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart renders/mintly-promo.mp4 && echo MUXED
