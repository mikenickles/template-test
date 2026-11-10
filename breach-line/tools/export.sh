#!/usr/bin/env bash
# Exports release builds (needs Godot 4.7.2 export templates installed).
# Usage: tools/export.sh [linux|windows|all]
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"
"$GODOT" --headless --path . --import >/dev/null 2>&1 || true
case "${1:-all}" in
  linux) targets=("Linux") ;;
  windows) targets=("Windows") ;;
  *) targets=("Linux" "Windows") ;;
esac
for t in "${targets[@]}"; do
  dir="export/$(echo "$t" | tr 'A-Z' 'a-z')"
  mkdir -p "$dir"
  echo "Exporting $t -> $dir"
  "$GODOT" --headless --path . --export-release "$t" 2>&1 | grep -vE "ALSA|audio" | tail -3
done
