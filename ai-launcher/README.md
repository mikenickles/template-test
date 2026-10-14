# AI Launcher

An Android home-screen launcher built around a single prompt bar.

- **Type** to filter your apps instantly; tap one to open it (long-press for app info).
- **Hit send** to ask Claude. It can answer questions (with web search for current info),
  open apps, open links/maps/dialer/SMS/email, and start timers.
- **Press Home** to clear the screen and start a fresh conversation.

Claude is called directly from the phone with your own Anthropic API key, entered via the
gear icon. The key is stored in the app's private storage on the device.

## Install

1. Get an APK (see below) onto your phone and open it; allow "install unknown apps" if asked.
2. Press Home and choose **AI Launcher**, or set it under
   *Settings → Apps → Default apps → Home app*.
3. Tap the gear icon and paste your API key from <https://console.anthropic.com>.

## Build

**Android Studio / Gradle** (targets API 35):

```
./gradlew assembleDebug        # → app/build/outputs/apk/debug/app-debug.apk
```

The `AI Launcher APK` GitHub Actions workflow runs this on every push that touches
`ai-launcher/` and uploads the APK as a build artifact.

**Without Gradle** (Linux, targets API 23): `./build.sh` uses aapt2, javac, dx and apksigner
directly and writes `build/ai-launcher.apk`. On Ubuntu the tools come from
`apt-get install android-sdk-platform-23 android-sdk-build-tools dalvik-exchange`.

## Layout

| File | Purpose |
|---|---|
| `LauncherActivity.java` | Home screen, app list, settings dialog, and the device actions Claude can call |
| `ClaudeClient.java` | Messages API client (raw HTTPS, no dependencies) with tool handling |
| `AppAdapter.java` | App grid with type-to-filter |
