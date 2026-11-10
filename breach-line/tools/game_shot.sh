#!/usr/bin/env bash
# Runs the game scene on a virtual display and saves one screenshot.
# Usage: tools/game_shot.sh <out.png> [frames=30] [extra game args...]
set -uo pipefail
cd "$(dirname "$0")/.."
OUT="$(realpath -m "${1:?out png}")"; FRAMES="${2:-30}"; shift 2 || true
LOG="${OUT%.png}.log"
xvfb-run -a -s "-screen 0 1280x720x24" "${GODOT:-godot}" --path . --rendering-method forward_plus \
  --resolution 1280x720 res://scenes/game.tscn -- --shot="$OUT" --shot-frames="$FRAMES" "$@" >"$LOG" 2>&1
STATUS=$?
grep -E "SCRIPT ERROR|^ERROR: Failed|saved " "$LOG"
exit $STATUS
