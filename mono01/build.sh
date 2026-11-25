#!/usr/bin/env bash
# MONO-01 teaser — full rebuild: soundtrack -> 900 frames -> mono01-v1.mp4
# Needs: python3 (numpy, scipy), node + playwright (Chromium), ffmpeg.
# Fonts: Inter, Inter Display, JetBrains Mono installed system-wide.
set -euo pipefail
cd "$(dirname "$0")"
FRAMES="${FRAMES_DIR:-build/frames}"
OUT="mono01-v1.mp4"

python3 audio/make_audio.py build src           # WAV + src/audio-data.js (drives the reactive waveform)
node render.cjs --audit                         # every text box must sit inside 10 % title-safe
rm -rf "$FRAMES"
node render.cjs "$FRAMES"

ffmpeg -hide_banner -loglevel error -y \
  -framerate 60 -i "$FRAMES/f_%04d.png" -i build/mono01-audio.wav \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf ${CRF:-17} -profile:v high -level 4.2 -pix_fmt yuv420p \
  -r 60 -g 60 -bf 2 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 320k -ar 48000 -ac 2 \
  -t 15 -movflags +faststart "$OUT"
echo "wrote $(pwd)/$OUT"
