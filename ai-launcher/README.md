# AI Launcher

An Android home-screen launcher built around a single prompt bar.

- **Type** an app name and it's filtered instantly; press Enter to open a clear match.
- **Ask anything** (type, tap the mic, or tap a suggestion chip). Claude's reply streams in
  live. It can search the web, open apps, open maps/dialer/SMS/email/links, and set timers
  and alarms.
- **Dock** of your pinned and most-used apps; long-press any app to pin, view info, or uninstall.
- **Apps button** (left of the prompt) shows the full app drawer.
- **Press Home** to clear the screen and start a fresh conversation.
- **Settings** (top right): API key, model, and optionally your name (for the greeting) and
  city (for weather and "near me").

Claude is called directly from the phone with your own Anthropic API key, entered via the
gear icon. The key is stored in the app's private storage on the device.

## Install

1. On your phone, open the repo's **Releases → AI Launcher (latest build)** and download
   `ai-launcher.apk`, then open it; allow "install unknown apps" if asked. Every build is
   signed with the same key (see `signing/`), so new versions install over old ones.
2. Press Home and choose **AI Launcher**, or set it under
   *Settings → Apps → Default apps → Home app*.
3. Tap the gear icon and paste your API key from <https://console.anthropic.com>.

## Build

**Android Studio / Gradle** (targets API 35):

```
./gradlew assembleDebug        # → app/build/outputs/apk/debug/app-debug.apk
```

The `AI Launcher APK` GitHub Actions workflow runs this on every push that touches
`ai-launcher/` and publishes the APK to the `launcher-latest` release.

**Without Gradle** (Linux; compiles against API 23, declares target 35): `./build.sh` uses aapt2, javac, dx and apksigner
directly and writes `build/ai-launcher.apk`. On Ubuntu the tools come from
`apt-get install android-sdk-platform-23 android-sdk-build-tools dalvik-exchange`.

## Layout

| File | Purpose |
|---|---|
| `LauncherActivity.java` | Home screen, app list, settings dialog, and the device actions Claude can call |
| `ClaudeClient.java` | Messages API client (raw HTTPS, no dependencies) with tool handling |
| `AppStore.java` | Loads apps, tracks usage, manages pinned dock apps |
| `AppAdapter.java` | App grid with type-to-filter |
