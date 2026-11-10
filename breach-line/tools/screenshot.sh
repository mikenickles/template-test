#!/usr/bin/env bash
# Renders map screenshots with the Forward+ renderer on a virtual display.
# Usage: tools/screenshot.sh <out_dir> [shots=all] [quality=2] [frames=45]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(realpath -m "${1:?out dir}")"; mkdir -p "$OUT"
SHOTS="${2:-all}"; QUALITY="${3:-2}"; FRAMES="${4:-45}"
GODOT="${GODOT:-godot}"
xvfb-run -a -s "-screen 0 1280x720x24" "$GODOT" --path . --rendering-method forward_plus \
  res://scenes/dev/map_preview.tscn -- --shots="$SHOTS" --out="$OUT" --quality="$QUALITY" --frames="$FRAMES" 2>&1 \
  | grep -vE "ALSA|audio_driver|dummy driver|audio_server.cpp|init_output_device|^\s+at: initialize"
