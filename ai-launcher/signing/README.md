# Sideload signing key

`ailauncher.keystore` (password `android`, alias `ailauncher`) signs every build of the app,
both from `build.sh` and from Gradle/CI. Using one key means a new APK installs over the
previous one instead of failing with "App not installed".

This key is deliberately public, like Android's standard debug key. It is fine for personal
sideloading. Before publishing anywhere (e.g. Play Store), create a private release key and
keep it out of the repository.
