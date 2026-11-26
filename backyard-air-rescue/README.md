# Backyard Air Rescue

A gentle, wordless 3D game for small kids. Fly a tiny cherry-red rescue helicopter around an
oversized backyard and winch three stranded toys back to the landing pad: a teddy in the flower
bed, a rubber duck on the pond and a tin robot on top of the play structure. No crashes, timers,
fuel or reading. After all three are safe it turns into free flight, and the toys can be picked
up again for joyrides.

![gameplay](media/gameplay.png)

Clip of the winch: [`media/winch-teddy.mp4`](media/winch-teddy.mp4)

## Install on an Android phone or tablet

1. Copy [`dist/BackyardAirRescue.apk`](dist/BackyardAirRescue.apk) to the device (or download it there).
2. Open it and allow "install unknown apps" for the app you opened it with.
3. Launch **Backyard Air Rescue**. It runs full-screen in landscape and never uses the network
   (the app does not even request the internet permission).

Needs Android 7.0+ with a reasonably current Android System WebView / Chrome (WebGL).
The APK is debug-signed: fine for sideloading, not for the Play Store.

## How it plays

| | |
|---|---|
| Drag anywhere on the left side | A floating joystick appears under the thumb. The helicopter leans first, then goes; let go and it brakes into a hover. |
| Big yellow button | Near a toy: steadies the helicopter and lowers the hook. Carrying a toy: sets it down (on the pad = rescued). It pulses when it will do something. |
| Bouncing arrows | Orange = a toy to rescue, green = bring it here. An arrow at the screen edge points to the next one when it is out of view. |

## Build it yourself

```sh
npm install
npm run build          # bundles src/ + three.js into www/ (open www/index.html in a browser to play; WASD/arrows + space)
npm run apk            # www/ -> dist/BackyardAirRescue.apk   (needs JDK 17+ and ANDROID_SDK_ROOT with platforms;android-34 + build-tools;34.0.0)
npm run playtest       # automated phone-size run-through (needs Playwright + Chromium)
node tools/capture.mjs # re-records media/winch-teddy.mp4 from real gameplay
```

- `src/main.js` – flight model, winch + cable physics, camera, HUD (tuning constants at the top)
- `src/world.js` – the yard: tree, pond, slide, shed, pad, flowers, grass
- `src/models.js` – helicopter and the three toys
- `src/life.js` – leaves, beach ball, pinwheels, butterflies, confetti
- `src/audio.js` – all sound is synthesised at runtime (no audio files)
- `android/` – a ~60-line full-screen WebView shell and a Gradle-free build script

Everything is generated in code: there are no downloaded models, textures or sounds.
