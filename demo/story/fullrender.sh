#!/bin/sh
# Полный рендер: каждый браузер снимает кусок по 40 кадров (холодный старт
# амортизируется), 3 куска параллельно; повторные проходы добивают пропуски.
cd "$(dirname "$0")"
N=1860
for pass in 1 2 3 4; do
  seq 0 40 $((N-1)) | xargs -P 3 -I{} sh -c '
    e=$(({}+40)); [ $e -gt '$N' ] && e='$N'
    need=0; f={}; while [ $f -lt $e ]; do [ -f frames/f$(printf %04d $f).jpg ] || { need=1; break; }; f=$((f+1)); done
    [ $need -eq 1 ] && node render.mjs frames {},$e || true'
  M=$(for f in $(seq 0 $((N-1))); do [ -f frames/f$(printf %04d $f).jpg ] || echo x; done | wc -l)
  echo "pass $pass: missing $M"
  [ "$M" -eq 0 ] && break
done
mkdir -p renders
ffmpeg -y -loglevel error -framerate 30 -i frames/f%04d.jpg -i assets/track.mp3 -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart renders/mintly-story.mp4 && echo MUXED
