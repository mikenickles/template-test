# CLAUDE.md

## Repository Overview

**Remote**: `mikenickles/template-test`

Two independent projects live here:

- **Blog** (repo root): Astro 5 + Tailwind. `npm run dev`, `npm run build`.
- **Treehouse** (`orbit/`, code name Orbit, which internal names keep): multi-agent Android app plus the PC hub it pairs with. See `orbit/README.md`.
  - `orbit/hub/`: Node 20+ ESM server, plain JavaScript. Calls Claude through `@anthropic-ai/sdk`; other
    providers through their OpenAI-compatible HTTP APIs. State is a JSON file in `~/.orbit-hub`.
    The desktop app is `orbit/hub/web/`: plain ES modules with Preact and htm served from the hub's own
    `node_modules` (no build step, nothing from a CDN), styled to match the phone's design system. It signs in
    with an HttpOnly SameSite=Strict cookie; on the PC itself through `/local/token`, elsewhere with the code.
    The user's profile (`state.profile`: name and notes) goes into every agent's prompt; Claude agents add to it with
    `remember_about_user`. The intro room (`room.intro`) is one guide getting to know the user, ending in
    `create_crew` (`src/intro.js`). Rooms have a `description` that goes into every member's prompt, and a `mode`:
    `auto` (best fit: `Orchestrator#pick` asks Claude Haiku, or the first agent's model, who answers), `lead` or
    `roundtable`. @mentions always decide who answers; a reply to a message (`replyTo`) goes to that message's agent. Agents with the `crew` ability hire new agents with
    `create_agent` (`src/recruit.js`), offered the configured providers' models and the free characters.
    Agent abilities (web search, code execution, read-only shared folders) are Claude-only: the tool loop is
    `src/anthropic.js`, folder access is `src/folders.js`. Folders are shared only from the PC's own page
    (`localhost`), never from a phone.
    Proactive agents (`agent.proactive`: `off`, `gentle`, `active`) speak first through `src/proactive.js`: check-ins
    (a cheap model decides whether anything is worth saying), `follow_up` and `watch` tools, and the morning brief,
    within quiet hours and a daily limit. What they write becomes a Home card (`state.nudges`) and a phone notice.
    The `google` ability gives Claude agents Gmail (search, read, drafts only, never send), Calendar and Drive through
    `src/google.js`; the user's own OAuth client and the sign-in are set up only on the PC (`/local/google`).
  - `orbit/android/`: Kotlin + Jetpack Compose (Material 3), single `app` module, package `dev.orbit.app`.
    Screens are stateless composables in `ui/screens`; `AppViewModel` and `RoomViewModel` hold state.
    Design system: colors, type and spacing come only from `ui/theme/Theme.kt` (`Orbit.colors`, `OrbitType`,
    `OrbitDimens`); controls, icons and avatars from `ui/components`. The interface stays neutral so avatars are
    the only color: washes and tints in a screen come from the agents' `tint()` colors, never new ones. The one exception is
    the treehouse illustration (`TreehouseScene`; `res/drawable-nodpi/treehouse.webp` and `hub/web/images/treehouse.webp`),
    shown when pairing and in empty states. Don't add one-off sizes, Material icons, or new colors in a screen.
    Avatars are 25 character pictures (`res/drawable-nodpi/avatar_NN.webp` and `hub/web/avatars/NN.webp`), in the
    order of `Characters` in `ui/components/Avatar.kt` and `web/js/avatar.js`; the hub stores only `{ character: n }`.
    Motion comes from `ui/theme/Motion.kt` (`OrbitMotion` easings and springs, `pressScale`, `entrance`,
    haptics); shared-element keys live in `ui/Shared.kt`. Entrances are off in screenshot tests. Ambient
    motion (loops, idle life) must stop when `LocalReducedMotion` is true, i.e. system animations are off.

## Development Workflow

### Branching

- Feature branches should be created from the default branch.
- Use descriptive branch names (e.g., `feature/add-auth`, `fix/login-bug`).

### Commits

- Write clear, concise commit messages describing **why** the change was made.
- Keep commits focused on a single logical change.

### Code Quality

```
# Blog build:        npm run build
# Hub tests:         cd orbit/hub && npm test
# Android build:     cd orbit/android && ./gradlew :app:assembleDebug
# Android release:   cd orbit/android && ./gradlew :app:assembleRelease   (signed only if a release key is configured)
# Android tests:     cd orbit/android && ./gradlew :app:testDebugUnitTest
# Screen snapshots:  cd orbit/android && ./gradlew :app:recordPaparazziDebug   (after UI changes; review the PNGs,
#                    including the animated ones in app/src/test/snapshots/videos)
```

The hub's HTTP API, the app's `HubClient`/`Models.kt`, and the desktop app's `web/js/api.js` are one contract:
change them together.

Releases: the app and hub share one version (`versionName` in `android/app/build.gradle.kts`, `version` in
`hub/package.json` and the lock file). A release is two files: `orbit-hub-X.Y.Z.zip` and the signed release APK
renamed `orbit-X.Y.Z.apk`. They're published to the user's Google Drive, where the hub picks them up
(`hub/src/feed.js`), and the user installs from the phone (Update PC, then Update); see `hub/src/updates.js`. To
publish with the Google Drive and Docs connectors:
1. Find the **Treehouse update feed** Doc and the link-shared **Treehouse updates** folder (in "Treehouse") in the user's Drive.
2. `cd orbit/hub && npm run package -- <dir> --feed https://docs.google.com/document/d/<doc id>/export?format=txt`,
   copy the APK in as `orbit-X.Y.Z.apk`, then `node scripts/release.js <dir>` (splits the app into parts under
   3 MB, the connector's limit per upload, and writes `release.json` with sizes and SHA-256s).
3. Upload the hub zip and every part into the folder (they inherit its link sharing).
4. Replace the Doc's JSON line with `release.json` plus each file's `url`:
   `https://drive.usercontent.google.com/download?id=<file id>&export=download&confirm=t` (`file` keys dropped).
The updater only installs `src/`, `web/`, `package.json` and `package-lock.json`, and never `Start Orbit.bat`, so
changes to the start script need a manual install. Files saved by hand in `~/.orbit-hub/updates` also work.

Release signing: the key lives outside the repo (`orbit/android/keystore.properties` locally, or the
`ORBIT_KEYSTORE_BASE64`/`ORBIT_KEYSTORE_PASSWORD` secrets for the GitHub workflow). Never commit a keystore
or its passwords, and never generate a new key for an existing app: phones only accept updates signed with
the same key. Bump `versionCode` for every APK handed out.

## Conventions for AI Assistants

- Read existing code before proposing changes.
- Keep changes minimal and focused on the task at hand.
- Do not add features, abstractions, or refactors beyond what is requested.
- Run tests and linters after making changes (once configured).
- Do not commit secrets, credentials, or `.env` files.
