#!/usr/bin/env bash
# Builds an installable debug APK of the game.
#   bash build-apk.sh [path/to/index.html]     (default: ../index.html)
# Needs: Node 20+, JDK 21, ANDROID_HOME pointing at an SDK with platforms;android-36 and build-tools;36.0.0.
# The game loads three.js from a CDN; the APK carries its own copy so it works offline.
set -euo pipefail
cd "$(dirname "$0")"
SRC="${1:-../index.html}"
THREE=../tests/node_modules/three
export ANDROID_HOME="${ANDROID_HOME:-/root/android-sdk}"
[ -d node_modules ] || npm install --no-audit --no-fund
[ -d "$THREE" ] || (cd ../tests && npm install --no-audit --no-fund)

rm -rf www && mkdir -p www/vendor/three/build www/vendor/three/examples/jsm
cp "$THREE/build/three.module.js" www/vendor/three/build/
for f in postprocessing/EffectComposer.js postprocessing/Pass.js postprocessing/ShaderPass.js postprocessing/MaskPass.js \
         postprocessing/OutputPass.js postprocessing/UnrealBloomPass.js postprocessing/GTAOPass.js postprocessing/SMAAPass.js \
         postprocessing/BokehPass.js postprocessing/RenderPass.js shaders/CopyShader.js shaders/OutputShader.js \
         shaders/LuminosityHighPassShader.js shaders/GTAOShader.js shaders/PoissonDenoiseShader.js shaders/SMAAShader.js \
         shaders/BokehShader.js shaders/FXAAShader.js math/SimplexNoise.js; do
  [ -f "$THREE/examples/jsm/$f" ] || continue
  mkdir -p "www/vendor/three/examples/jsm/$(dirname "$f")"; cp "$THREE/examples/jsm/$f" "www/vendor/three/examples/jsm/$f"
done
# point every CDN three.js URL at the bundled copy
sed 's#https://cdn.jsdelivr.net/npm/three@0\.170\.0/#./vendor/three/#g' "$SRC" > www/index.html
if grep -q 'cdn.jsdelivr.net' www/index.html; then echo "warning: index.html still references the CDN" >&2; fi

python3 make-icons.py
npx cap sync android
(cd android && ./gradlew --no-daemon -q :app:assembleDebug)
mkdir -p ../dist
cp android/app/build/outputs/apk/debug/app-debug.apk ../dist/BedroomBattalion.apk
echo "APK: $(cd ../dist && pwd)/BedroomBattalion.apk"
