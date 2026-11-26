#!/usr/bin/env bash
# Packages www/ into a debug-signed APK using only the Android SDK command-line tools (no Gradle needed).
#   ANDROID_SDK_ROOT=/path/to/sdk bash android/build-apk.sh
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/opt/android-sdk}}"
BT="$SDK/build-tools/${BUILD_TOOLS:-34.0.0}"
JAR="$SDK/platforms/${PLATFORM:-android-34}/android.jar"
[ -f ../www/game.js ] || { echo "run 'npm run build' first"; exit 1; }
rm -rf build && mkdir -p build/classes build/assets ../dist
cp -r ../www build/assets/www
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/base.apk -I "$JAR" --manifest AndroidManifest.xml -A build/assets build/res.zip
javac -nowarn -source 8 -target 8 -bootclasspath "$JAR" -d build/classes $(find src -name '*.java') 2>&1 | grep -v 'bootstrap class path\|^Picked up\|warning' || true
"$BT/d8" --release --min-api 24 --lib "$JAR" --output build $(find build/classes -name '*.class')
(cd build && zip -q -j base.apk classes.dex)
"$BT/zipalign" -f 4 build/base.apk build/aligned.apk
[ -f debug.keystore ] || keytool -genkeypair -keystore debug.keystore -storepass android -keypass android -alias androiddebugkey \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
"$BT/apksigner" sign --ks debug.keystore --ks-pass pass:android --key-pass pass:android --out ../dist/BackyardAirRescue.apk build/aligned.apk
rm -f ../dist/*.idsig
"$BT/apksigner" verify --verbose ../dist/BackyardAirRescue.apk | grep -E "^Verif" | head -4
ls -lh ../dist/BackyardAirRescue.apk
