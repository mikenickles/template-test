# CLAUDE.md

## Repository Overview

**Project**: template-test
**Status**: New/empty repository — no application code has been added yet.
**Remote**: `mikenickles/template-test`

## Lyra (`lyra/`)

Lyra is a personal AI chief-of-staff Android app, built in phases (see `lyra/README.md` for the phase table).
The repo root also holds an Astro blog; Lyra is self-contained in `lyra/`.

- Phone-only: a Capacitor 8 Android app (`lyra/android`, package `app.lyra.chief`); there is no server.
- TypeScript. Logic in `lyra/core` (shared by the app and tests); screens in `lyra/web/src` (React + Vite).
- Storage: SQLite via sql.js saved to app storage; API keys in Android Keystore (`@aparajita/capacitor-secure-storage`).
- Channels (Phase 2): `channels` table, per-channel messages, and a notebook per channel (`core/memory.ts` `Notebook`, scopes "main" / "channel:<id>").
- Tasks (Phase 3): `core/tasks.ts` (tasks, task_steps, task_log tables); Lyra tools create_task / update_task / list_tasks, refused in email-tainted turns.
- Workers (Phase 4): `core/workers.ts` (worker_runs table, transcript per run); in-app agent loops, max 2 at once, 20 steps; read-only connector tools + log_progress/update_steps/ask_user/finish; resume interrupted runs on start.
- Reactions: the `react` tool puts one emoji (fixed set, `REACTIONS` in `core/chat.ts`) on the user's message (`meta.reaction`); a reaction alone is a full reply.
- Routines (Phase 6): `core/routines.ts` (routines, routine_runs); `tickRoutines()` every minute while open + on resume, 12h catch-up; post / nothing_new tools; local-notification reminders (`web/src/platform.ts` notifier).
- Backups (Phase 7): `core/backup.ts` (AES-256-GCM, PBKDF2 passphrase; DB + notebooks + soul, no keys or Google links); `Lyra.backup()/restore()`, restore detaches the DB and the app reloads. App lock: setting "appLock", `appLock` in `web/src/platform.ts` (biometric plugin), `LockScreen` in App.tsx. Message actions: long-press sheet in Chat.tsx, `meta.pinned`, `PinnedList`.
- Attachments (Phase 8): `core/attachments.ts` (photos/PDF/text, max 4; `file` Part sent for one turn, `meta.attachments` keeps a note + thumbnail; later turns get an "attached earlier" reminder), `web/src/attach.ts` (resize, share inbox), composer in Chat.tsx (attach sheet, paste, drop). Live voice: GPT-Live (`gpt-live-1`) over WebRTC via POST /v1/live/sessions (`Lyra.startLive`, key stays in core); `core/live.ts` `LiveCall` (captions, client delegations run `Lyra.liveDelegate` and reply with session.instructions.append, exchanges saved with `meta.voice`, seconds into `usage` source "voice"); `web/src/voiceCall.ts`, `VoiceOverlay.tsx`; needs RECORD_AUDIO on Android and desktop SHELL_VERSION >= 2. Share target: `ShareTargetPlugin.java` + SEND intent filters.
- Proactive (step 1): `core/reminders.ts` (table `reminders`, kinds remind | follow_up, `localToDate` tz conversion); chat tools set_reminder / follow_up / cancel_reminder / suggest_replies (all refused in tainted turns); due reminders posted on the routine tick (`Lyra.tickReminders`), follow-ups run through `Routines.followUp` (shared `execute`); phone notifications scheduled ahead (`notifier.oneOffs`, ids 300000+); `meta.reminder`, `meta.suggestions`.
- Proactive (step 2): heads-ups, setting "proactive" {level off|light|active, quietStart, quietEnd}; `Lyra.tickHeadsUp` (on the routine tick, 4h/1h, quiet hours via `inQuietHours`, skipped on practice model / busy) runs `Routines.headsUp` (post_mode news, `meta.headsUp`); usage source "proactive" (heads-ups + follow-ups); UI `HeadsUps` in Settings.tsx.
- Proactive (step 3): phone "Keep watch" (`KeepWatchService.java` specialUse foreground service + `BackgroundPlugin.java` "LyraBackground": 15-min setAndAllowWhileIdle alarm, ≤3-min wake lock, JS event `lyraBackgroundTick` handled in `runRoutines` via `background.onTick` in platform.ts, pref in native SharedPreferences); desktop tray (main.cjs SHELL_VERSION 3, `shell.json` prefs tray/openAtLogin, `--hidden`, preload `shell`); "While you were away" (`core/away.ts` `awaySince`, `Lyra.away`, `web/src/Away.tsx`, localStorage `lyra.leftAt`, 20 min); Android widget (`LyraWidget.java` + nested `WidgetPlugin` "LyraWidget", `web/src/widget.ts`, `widgetWords` in statusText.ts). UI `BackgroundSection` in Settings.tsx.
- Settings: home + sub-pages (`#/settings/<model|you|alerts|sync|about>`, `web/src/screens/Settings.tsx`); model picker in `ModelSettings.tsx` lists models via `core/providers/models.ts` (`Lyra.models()`).
- Usage: providers return `usage` {input, output}; `metered()` in `core/usage.ts` records per local day/provider/model/source into table `usage` (migration 7); page `web/src/screens/Usage.tsx` (SVG stacked bars, series colors `--series-1..5`), data shaping in `web/src/usageData.ts` (tested).
- Updates: `core/updates.ts` (Drive folder "Lyra Updates", files you own, names Lyra-<v>.apk / Lyra-app-<v>.lyrapack / Lyra-<v>-win-arm64.zip), `web/src/updater.ts` (daily check, notify once per version), phone install via `ApkInstallerPlugin.java`, desktop packs in main.cjs (`SHELL_VERSION`, trial + rollback). `npm run release` builds them into build/release.
- Status line: `web/src/StatusLine.tsx` (live/idle items, chat status via `setChatStatus`), wording in `web/src/statusText.ts` (STATUS_MAX 24, `fit()` fallbacks, tested), weather in `web/src/weather.ts` (Open-Meteo; setting "weatherPlace").
- Desktop layout: `.app.desk` when a computer window is ≥860px (`useWide()` in App.tsx): docked `Drawer` (prop `docked`), `DeskBar` title bar (WCO drag region, `titleBarOverlay` in main.cjs), no tab bar.
- Desktop (Phase 7b): Electron shell in `desktop/` (main.cjs: app:// protocol + CSP, files in userData, secrets via safeStorage, Google OAuth loopback+PKCE with a user-supplied Desktop client; preload.cjs bridge `window.lyraDesktop`). `npm run desktop` packages win32-arm64 (`scripts/desktop.mjs`); `npm run desktop:smoke` and `scripts/desktop-sync-smoke.mjs` test it under xvfb.
- Sync: `core/sync.ts` (snapshot rev/base/dirty, conflict, keep 10), `core/sync-drive.ts` (drive.appdata), wiring in `web/src/api.ts` (`syncApi`, debounce 4s, poll 60s, reload after pull, routines only on phone when synced). Sync state is `sync.json` (device-local, not in backups).
- Notifications: `web/src/api.ts` `watchForNotices()` sends a notice only while the app is in the background (finished reply, routine post, task turning Ready); routine reminders are rescheduled on routine events; setting "notifications"; status icon `ic_stat_lyra`.
- Google sign-in: `android/.../GoogleAuthPlugin.java` (Play services Authorization API). Gmail, Calendar, Drive connectors each request only their .readonly scope; `grantIsReadOnly()` rejects any grant with other scopes.
- Model-agnostic: `core/providers/` (Claude, OpenAI, Gemini, and a `fake` practice provider used by tests).
- Web search: each provider's built-in search (Anthropic web_search tool, OpenAI Responses web_search, Gemini googleSearch); results mark the turn tainted; sources saved in message meta; Settings toggle.
- Connectors are MCP servers run in-process over `InMemoryTransport`; tool names are allowlisted in `core/connectors/registry.ts`.
- Outside content (email, web) is always wrapped with `wrapUntrusted()`; memory writes after reading it become suggestions.
- Commands (run in `lyra/`): `npm test`, `npm run typecheck`, `npm run build`, `npm run dev`, `npm run smoke` (needs Playwright), `npm run android:apk` (needs Android SDK).
- This repo is public: never commit signing keys (`*.keystore`, `*.jks` are gitignored). The user keeps the key; bump `versionCode` in `android/app/build.gradle` for each release.
- UI follows the design tokens in `lyra/web/src/styles.css`. Accent colors: `ACCENTS` in `core/lyra.ts` (setting "accent"), palettes as `[data-accent]` blocks in styles.css, picked in Settings. Lyra's character is `lyra/core/soul.md` (user-editable in app, stored as soul.md); message format rules are `lyra/core/voice.md`. Both go into chat, worker and routine prompts.

## Getting Started

This repository is freshly initialized. When project code is added, update this file with:

- Language, framework, and runtime versions
- Directory structure overview
- Setup instructions (`install`, `build`, etc.)
- How to run tests and linters
- Key architectural decisions and conventions

## Development Workflow

### Branching

- Feature branches should be created from the default branch.
- Use descriptive branch names (e.g., `feature/add-auth`, `fix/login-bug`).

### Commits

- Write clear, concise commit messages describing **why** the change was made.
- Keep commits focused on a single logical change.

### Code Quality

When tooling is added, document the commands here:

```
# Build:    (e.g., npm run build)
# Test:     (e.g., npm test)
# Lint:     (e.g., npm run lint)
# Format:   (e.g., npm run format)
```

## Conventions for AI Assistants

- Read existing code before proposing changes.
- Keep changes minimal and focused on the task at hand.
- Do not add features, abstractions, or refactors beyond what is requested.
- Run tests and linters after making changes (once configured).
- Do not commit secrets, credentials, or `.env` files.
