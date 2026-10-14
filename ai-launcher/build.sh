#!/usr/bin/env bash
# Builds a signed debug APK without Gradle, using only the SDK command-line tools
# (aapt2, javac, dx, zipalign, apksigner). Output: build/ai-launcher.apk
#
# Needs: JDK 8+, an Android platform jar (API 23+) and build-tools. On Ubuntu/Debian:
#   sudo apt-get install android-sdk-platform-23 android-sdk-build-tools dalvik-exchange
# Override locations with ANDROID_JAR / BUILD_TOOLS if your SDK lives elsewhere.
set -euo pipefail

cd "$(dirname "$0")"
SRC=app/src/main
OUT=build
PACKAGE=com.mikenickles.ailauncher
ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
BUILD_TOOLS=${BUILD_TOOLS:-/usr/lib/android-sdk/build-tools/debian}
MIN_SDK=23
TARGET_SDK=23   # Matches the platform jar this script compiles against.

DX=$(command -v dx || command -v dalvik-exchange || echo "$BUILD_TOOLS/dx")
AAPT2=${AAPT2:-$BUILD_TOOLS/aapt2}

rm -rf "$OUT"
mkdir -p "$OUT/res" "$OUT/gen" "$OUT/classes" "$OUT/dex"

# The Gradle build sets the package via `namespace`; aapt2 needs it in the manifest.
sed "s|<manifest |<manifest package=\"$PACKAGE\" android:versionCode=\"1\" android:versionName=\"1.0\" |" \
    "$SRC/AndroidManifest.xml" > "$OUT/AndroidManifest.xml"

echo "==> Compiling resources"
"$AAPT2" compile --dir "$SRC/res" -o "$OUT/res/compiled.zip"
"$AAPT2" link -o "$OUT/unsigned.apk" -I "$ANDROID_JAR" \
    --manifest "$OUT/AndroidManifest.xml" --java "$OUT/gen" \
    --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
    "$OUT/res/compiled.zip"

echo "==> Compiling Java"
find "$SRC/java" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -Xlint:-options --release 8 -encoding UTF-8 -classpath "$ANDROID_JAR" \
    -d "$OUT/classes" @"$OUT/sources.txt"

echo "==> Dexing"
"$DX" --dex --min-sdk-version="$MIN_SDK" --output="$OUT/dex/classes.dex" "$OUT/classes"
(cd "$OUT/dex" && zip -q -u ../unsigned.apk classes.dex)

echo "==> Aligning and signing"
KEYSTORE=${KEYSTORE:-$OUT/../debug.keystore}
if [ ! -f "$KEYSTORE" ]; then
    keytool -genkeypair -keystore "$KEYSTORE" -storepass android -keypass android \
        -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi
"$BUILD_TOOLS/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$BUILD_TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
    --out "$OUT/ai-launcher.apk" "$OUT/aligned.apk"
"$BUILD_TOOLS/apksigner" verify "$OUT/ai-launcher.apk"

echo "==> Built $OUT/ai-launcher.apk"
