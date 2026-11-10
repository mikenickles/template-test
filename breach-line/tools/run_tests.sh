#!/usr/bin/env bash
# Runs the headless test-suite. Fails on test failures or engine script errors.
# Usage: tools/run_tests.sh [filter]
set -uo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"
"$GODOT" --headless --path . --import >/dev/null 2>&1 || true
ARGS=()
if [[ $# -gt 0 ]]; then ARGS=(-- "--filter=$1"); fi
LOG="$(mktemp)"
"$GODOT" --headless --fixed-fps 60 --path . res://tests/test_runner.tscn "${ARGS[@]}" 2>&1 | tee "$LOG" | grep -vE "ALSA|audio_driver|dummy driver|audio_server.cpp|^\s+at: (init_output_device|initialize)"
STATUS=${PIPESTATUS[0]}
if grep -qE "SCRIPT ERROR|Parse Error|Failed to load script" "$LOG"; then
  echo "Engine reported script errors (see above)."; STATUS=1
fi
rm -f "$LOG"
exit $STATUS
