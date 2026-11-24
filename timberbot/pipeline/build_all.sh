#!/usr/bin/env bash
# Regenerates every shipped asset from source. Requires: python3 with numpy, Pillow and bpy (pip install bpy).
set -euo pipefail
cd "$(dirname "$0")"
export TIMBERBOT_TMP="${TIMBERBOT_TMP:-$(mktemp -d)}"
python3 textures.py            # tileable PBR sets (numpy)
python3 build_foliage.py       # leaf / needle / fern atlases (Cycles ortho renders)
python3 build_trees.py         # conifers, broadleaf, birch, bush, fern, log
python3 build_rocks.py         # boulders: sculpt -> decimate -> bake
python3 build_structures.py    # palisade, campfire, beacon (needs the boulder GLBs)
python3 build_robot.py         # Timberbot: model -> UV atlas -> bake
echo "Assets written to ../assets (scratch files in $TIMBERBOT_TMP)"
