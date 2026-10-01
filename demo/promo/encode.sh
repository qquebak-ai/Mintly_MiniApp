#!/bin/sh
# Кадры кусками по 90 в три потока (новый браузер на кусок), потом сборка.
set -e
cd "$(dirname "$0")"
seq 0 90 1649 | xargs -P 3 -I{} sh -c 'e=$(({}+89)); [ -f frames/f$(printf %04d $e).jpg ] || node render.mjs frames {},$(({}+90))'
mkdir -p renders
ffmpeg -y -loglevel error -framerate 30 -i frames/f%04d.jpg -i assets/track.mp3 -vf scale=1920:1080:flags=lanczos -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart renders/mintly-promo.mp4
echo encoded
