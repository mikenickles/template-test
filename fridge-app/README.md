# Family Fridge (Android)

The phone version of the Family Fridge design: Home, Stock, Calendar, Tasks and Food
(Meals + Groceries), with a voice assistant that's always one tap away.

Built with React + TypeScript + Vite, animated with Framer Motion, and packaged for
Android with Capacitor 8. Everything is stored on the phone (no account or server).

## What works

- **Home** – greeting by time of day, live weather for your location (Open-Meteo, no key),
  a one-line summary of the day, today/tomorrow events, task progress ring, stock counts,
  tonight's dinner and the grocery list. Every card opens its section.
- **Stock** – fridge / freezer / pantry, quantities with + / −, "Low" and "Out" badges,
  remove at zero, and new items sort themselves into the right place and category.
- **Calendar** – month (swipe to change month), week and day timeline views, weekly routines,
  add events, tap an event to delete it (or skip one week of a routine).
- **Tasks** – per person, add / complete / delete, hide completed, progress bars.
- **Food → Meals** – a 7-day dinner plan, ideas ranked by what's actually in stock,
  filters, "New ideas", and "Add N to groceries" for missing ingredients.
- **Food → Groceries** – by store, check off, "Put away" moves checked items into Stock (with Undo).
- **Voice** – the floating button listens (Android speech recognition) and acts on requests like
  "Add milk and eggs to the shopping list, and put the dentist on Friday at 10",
  "We're out of coffee", "I just bought a dozen eggs", "Remind Dad to fix the sink tomorrow",
  "Mark finish homework done", "Plan tacos for dinner on Sunday", "Open the calendar".
  You can also type requests.
- Android back button closes the open sheet, then returns Home, then exits.

## Develop

```bash
npm install
npm run dev          # browser preview
npm test             # Playwright end-to-end tests (needs `npm run build` first)
```

## Build the APK

Requires JDK 21 and the Android SDK (platform 36, build-tools 36) with `ANDROID_HOME` set.

```bash
npm run android:apk
```

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`. It is signed with a
debug key: fine for installing on your own phone, but a Play Store release needs your own
signing key (`./gradlew assembleRelease` with a keystore).

## Regenerate the icon and splash

```bash
node resources/make-icons.mjs
```
