# Release signing key

Every build of the app is signed with one private release key, so a new APK installs over
the previous one. **The key is never committed.** `*.keystore`, `*.jks` and
`keystore.properties` are git-ignored.

> The key that used to be committed here (`ailauncher.keystore`) is public forever in git
> history. Builds signed with it are not trusted any more. The app is now signed with a new
> key, so a phone that has an old build must **uninstall AI Launcher once** and then install
> the new APK. After that, updates install over each other as before.

## Local builds (Gradle and `build.sh`)

Put the keystore somewhere outside git (for example `signing/ailauncher-release.keystore`,
which is ignored), then create `ai-launcher/keystore.properties`:

```properties
storeFile=signing/ailauncher-release.keystore
storePassword=<keystore password>
keyAlias=ailauncher
keyPassword=<keystore password>
```

`storeFile` is relative to `ai-launcher/`. The `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`,
`KEY_ALIAS` and `KEY_PASSWORD` environment variables work instead of the file.

Without a key, Gradle debug builds fall back to Android's local debug key (which won't install
over the published APK), and `build.sh` stops with an error.

## CI (GitHub Actions)

The `AI Launcher APK` workflow reads two repository secrets
(*Settings → Secrets and variables → Actions → New repository secret*):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the keystore file, base64-encoded (`base64 -w0 ailauncher-release.keystore`) |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password (also the key password) |

If either is missing or wrong, the workflow fails before building and says which. After the
build it checks that the APK is signed with that key before publishing it.

## Making a new key

```
keytool -genkeypair -keystore ailauncher-release.keystore -storetype PKCS12 \
  -alias ailauncher -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=AI Launcher"
```

Changing the key again means every phone has to uninstall once more, so keep a backup of the
keystore and its password somewhere safe (a password manager). If the key is lost, no future
build can update installed copies.
