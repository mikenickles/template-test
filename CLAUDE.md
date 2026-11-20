# CLAUDE.md

## Repository Overview

**Remote**: `mikenickles/template-test`

Two independent projects live here:

- **Blog** (repo root): Astro 5 + Tailwind. `npm run dev`, `npm run build`.
- **Orbit** (`orbit/`): multi-agent Android app plus the PC hub it pairs with. See `orbit/README.md`.
  - `orbit/hub/`: Node 20+ ESM server, plain JavaScript. Calls Claude through `@anthropic-ai/sdk`; other
    providers through their OpenAI-compatible HTTP APIs. State is a JSON file in `~/.orbit-hub`.
  - `orbit/android/`: Kotlin + Jetpack Compose (Material 3), single `app` module, package `dev.orbit.app`.
    Screens are stateless composables in `ui/screens`; `AppViewModel` and `RoomViewModel` hold state.
    Design system: colors, type and spacing come only from `ui/theme/Theme.kt` (`Orbit.colors`, `OrbitType`,
    `OrbitDimens`); controls, icons and avatars from `ui/components`. The interface stays neutral so avatars are
    the only color. Don't add one-off sizes, Material icons, or new colors in a screen.
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
# Android tests:     cd orbit/android && ./gradlew :app:testDebugUnitTest
# Screen snapshots:  cd orbit/android && ./gradlew :app:recordPaparazziDebug   (after UI changes; review the PNGs,
#                    including the animated ones in app/src/test/snapshots/videos)
```

The hub's HTTP API and the app's `HubClient`/`Models.kt` are one contract: change them together.

## Conventions for AI Assistants

- Read existing code before proposing changes.
- Keep changes minimal and focused on the task at hand.
- Do not add features, abstractions, or refactors beyond what is requested.
- Run tests and linters after making changes (once configured).
- Do not commit secrets, credentials, or `.env` files.
