# Android app (APK)

The game is one HTML file. This folder wraps it in a small Android app (Capacitor 8 WebView), with its own copy of three.js so it runs offline.

The app is landscape-only and full-screen, keeps the screen awake, and is allowed to vibrate.

## Build

```
bash build-apk.sh                 # builds ../index.html
bash build-apk.sh path/to/x.html  # or any other copy of the game
```

The APK lands in `../dist/BedroomBattalion.apk` (gitignored).

Needs Node 20+, JDK 21 and an Android SDK with `platforms;android-36` and `build-tools;36.0.0`. Point `ANDROID_HOME` at the SDK (default `/root/android-sdk`).

Icons and splash screens are drawn by `make-icons.py` during each build.

## Install on a phone

The APK is debug-signed, so it installs by sideloading, not from the Play Store:

1. Copy the APK to the phone and tap it.
2. Allow "install unknown apps" for the app you opened it with.

If an update is built on a different machine, its debug key differs. Uninstall the old version first.

A Play Store release would need a private release key and a Play Console account; neither is set up here.
