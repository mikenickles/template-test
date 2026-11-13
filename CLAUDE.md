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
- Reactions: the `react` tool puts one emoji (fixed set, `REACTIONS` in `core/chat.ts`) on the user's message (`meta.reaction`); a reaction alone is a full reply. Lyra reacts often and uses an emoji here and there (soul.md "Expressive", voice.md emoji rule); a step that wrote text and only reacted ends the turn without another model call.
- Routines (Phase 6): `core/routines.ts` (routines, routine_runs); `tickRoutines()` every minute while open + on resume, 12h catch-up; post / nothing_new tools; local-notification reminders (`web/src/platform.ts` notifier).
- Backups (Phase 7): `core/backup.ts` (AES-256-GCM, PBKDF2 passphrase; DB + notebooks + soul, no keys or Google links); `Lyra.backup()/restore()`, restore detaches the DB and the app reloads. App lock: setting "appLock", `appLock` in `web/src/platform.ts` (biometric plugin), `LockScreen` in App.tsx. Message actions: long-press sheet in Chat.tsx, `meta.pinned`, `PinnedList`.
- Attachments (Phase 8): `core/attachments.ts` (photos/PDF/text, max 4; `file` Part sent for one turn, `meta.attachments` keeps a note + thumbnail; later turns get an "attached earlier" reminder), `web/src/attach.ts` (resize, share inbox), composer in Chat.tsx (attach sheet, paste, drop). Live voice: GPT-Live (`gpt-live-1`) over WebRTC via POST /v1/live/sessions (`Lyra.startLive`, key stays in core); `core/live.ts` `LiveCall` (captions, client delegations run `Lyra.liveDelegate` and reply with session.instructions.append, exchanges saved with `meta.voice`, seconds into `usage` source "voice"); `web/src/voiceCall.ts`, `VoiceOverlay.tsx`; needs RECORD_AUDIO on Android and desktop SHELL_VERSION >= 2. Share target: `ShareTargetPlugin.java` + SEND intent filters.
- Proactive (step 1): `core/reminders.ts` (table `reminders`, kinds remind | follow_up, `localToDate` tz conversion); chat tools set_reminder / follow_up / cancel_reminder / suggest_replies (all refused in tainted turns); due reminders posted on the routine tick (`Lyra.tickReminders`), follow-ups run through `Routines.followUp` (shared `execute`); phone notifications scheduled ahead (`notifier.oneOffs`, ids 300000+); `meta.reminder`, `meta.suggestions`.
- Proactive (step 2): heads-ups, setting "proactive" {level off|light|active, quietStart, quietEnd}; `Lyra.tickHeadsUp` (on the routine tick, 4h/1h, quiet hours via `inQuietHours`, skipped on practice model / busy) runs `Routines.headsUp` (post_mode news, `meta.headsUp`); usage source "proactive" (heads-ups + follow-ups); UI `HeadsUps` in Settings.tsx.
- Check-ins: `Lyra.tickCheckIn` (after tickHeadsUp on the routine tick; proactive.checkIns, 24h light / 8h active, 9:00-20:00, idle 2h, nothing needing the user, last one answered) runs `Routines.headsUp(job, done, "checkIn")` (post tool gets `options` → `meta.suggestions`, dropped if the run read connectors/web), `meta.checkIn`.
- Proactive (step 3): phone "Keep watch" (`KeepWatchService.java` specialUse foreground service + `BackgroundPlugin.java` "LyraBackground": 15-min setAndAllowWhileIdle alarm, ≤3-min wake lock, JS event `lyraBackgroundTick` handled in `runRoutines` via `background.onTick` in platform.ts, pref in native SharedPreferences); desktop tray (main.cjs SHELL_VERSION 3, `shell.json` prefs tray/openAtLogin, `--hidden`, preload `shell`); "While you were away" (`core/away.ts` `awaySince`, `Lyra.away`, `web/src/Away.tsx`, localStorage `lyra.leftAt`, 20 min); Android widget (`LyraWidget.java` + nested `WidgetPlugin` "LyraWidget", `web/src/widget.ts`, `widgetWords` in statusText.ts). UI `BackgroundSection` in Settings.tsx.
- Phase 10: `core/people.ts` (table `people`, rememberPerson merges by name/alias/email, describePeople directory in the prompt), chat tools remember_person (refused when tainted) / look_up_person / find_contact (Platform `contacts`, `ContactsPlugin.java` "LyraContacts", device setting "contacts", `Lyra.allowContacts`), `meta.people`; `core/tidy.ts` (`applyTidy` validates per-section lists, `runTidy`), `Lyra.tickTidy` weekly after check-ins (setting "tidy", "tidyAt"), `Notebook.tidy`, `meta.tidy` {snapshotId, undone}, `Lyra.undoTidy`. UI: Memory.tsx People tab + PersonSheet, Access.tsx PhoneContacts.
- Phase 13: `core/docs.ts` (table `docs` with tainted, gdoc_id/gdoc_link; `saveToGoogleDocs` multipart to Drive with drive.file, markdown→Google Doc, PATCH to update), chat tools write_doc / update_doc / read_doc (read of a tainted doc wraps + taints), `meta.docs`, `Lyra.saveDocToGoogle` (asks for DRIVE_FILE on first use); screens `web/src/screens/Docs.tsx` (#/docs, #/d/<id>), `DocMarkdown` renderer; Docs in the menu sections.
- Phase 14 (Spotify): `core/connectors/spotify/auth.ts` (`SpotifyAuth`: PKCE with the user's Client ID in secrets "spotify.client", refresh token "spotify.refresh", scope allowlist), `server.ts` (read tools), Platform `oauth` (phone: `LinksPlugin.java` "LyraLinks" + app.lyra.chief://spotify intent filter + appUrlOpen; desktop: main.cjs `oauth:loopback`, SHELL_VERSION 4), settings "spotify"/"spotify.playback"/"spotify.playlists" (device-local), chat tools control_music (direct) and propose_playlist (approval card, action kind "playlist", `doPlaylist`); UI `SpotifySection` in Access.tsx, `PlaylistCard` in ActionCard.tsx.
- Phase 15: providers read whole pages when webSearch is on (Anthropic `webFetchTool(model)` + `noFetch` fallback, Gemini `urlContext` + `noUrl` fallback; page reads become sources, mark searched); tasks.kind "research" (migration with docs.task_id), create_task `research` (refused without web search), worker `researchSection` + `write_report` tool (createDoc with task_id, appends Sources from collected provider sources), `reportFor` / `Lyra.taskReport`, Research tag + report link in Tasks.tsx, "Research it" in NewTaskDialog.
- Phase 16 (inbox triage, on request only): `core/triage.ts` (`checkTriage`, `TRIAGE_SCHEMA`, `TRIAGE_GUIDE`), chat tool show_triage (only with Gmail connected; allowed when tainted) → `meta.triage`; routine `post` gets `triage` when Gmail is connected (`execute(..., canTriage)`); card `web/src/TriageCard.tsx` ("Draft a reply" sends "Draft a reply to thread <id>").
- Phase 17 (Skills): `core/skills.ts` (table `skills`, `saveSkill` replaces by name/id, `describeSkills` index); chat tools use_skill (only when skills exist; allowed when tainted, `markUsed`) / save_skill (refused when tainted), prompt "## Skills" section (`skillsSection`); workers and routines get `skillsBrief` + use_skill only (`skillTools(ws, false)`, shared `useSkill` in chat.ts); `meta.skills` {id, name, kind used|saved} chips; UI Memory.tsx Skills tab (`SkillList`, `SkillSheet`, `#/memory?skills`).
- Phase 18 (life admin): `core/lifeadmin.ts` (table `admin_items` kinds bill|subscription|package|trip|return, `key` merges updates, `checkItem` only accepts thread ids seen in that scan's search results, `scanInbox` model loop with gmail__search_mail/read_thread + save_items, `tidyItems` rolls subscriptions and closes old items, `dueNotices`/`milestone` heads-ups with no model call, `describeItem` code-written lines, `monthlyTotal`); `Lyra.tickLifeAdmin` on the routine tick (notices 8-21 outside quiet hours; scan once/20h 6-22, not on practice model; settings "lifeAdmin", "lifeAdminAt", "lifeAdminTriedAt"), `scanLifeAdmin`/`lifeAdmin()`/`setAdminStatus`, event `{type:"admin"}`; chat tools life_admin (wrapped untrusted, taints) / update_life_admin (when tainted, only an item whose `who` the user named), prompt `lifeAdminSection`; Today items kind "admin"; UI `web/src/screens/LifeAdmin.tsx` as the Tasks page's third tab (`#/tasks?admin`). Practice model saves a sample bill from a search during a scan.
- Back to back: while a reply runs, `Lyra.chat` in the same chat (no attachments) saves the message and pushes it into the turn's inbox (`TurnInbox` in chat.ts: take/listen/close), resolving with the shared reply and `queued: true`; another chat throws, after the inbox closes it waits and runs its own turn. `runTurn` takes new messages before each step (appended to the user turn as "<name> added, while you were working:" or as a new user turn after a finished answer, then continues the same reply); a message arriving before any text this step aborts and restarts the step (max 5). UI: Send stays available while pending (Stop only with an empty box); practice rule "take your time…" waits 2.5s.
- Talk like me: `core/style.ts` (setting "mirror" default on, setting "style" {notes ≤8, updatedAt, basedOn}; `styleSamples` = user's own messages ≤400 chars, `learnStyle` via save_style / not_enough tools, `styleSection` prompt text); Workspace `talk()` → chat prompt (after the split) and routine prompts; `Lyra.tickStyle` after tickTidy (mirror on, 20+ new user messages, 3 days since last, 1 try a day, idle 15 min, not on practice model), `learnStyleNow`/`forgetStyle`/`talkStyle`; UI `TalkLikeMe` in Settings You. voice.md lets emoji/casing follow the user when mirroring.
- Redesign: `core/today.ts` (todayView, searchMessages, unreadCounts/latestIds); `web/src/Today.tsx` (Today view in main chat, toggled by window event "lyra:today", auto after 30 min idle), `Drawer.tsx` constellation (stars measured into an SVG polyline, SWAY zigzag) + search + bottom sections, `web/src/seen.ts` (localStorage "lyra.seen"), chat route `?m=<id>` focus, Tasks `SwipeRow` (Later = `snoozeTask`, column tasks.snoozed_until) and `TopSlot` portals into the top bar, icon `Star`.
- Settings: home + sub-pages (`#/settings/<model|you|alerts|sync|about>`, `web/src/screens/Settings.tsx`); model picker in `ModelSettings.tsx` lists models via `core/providers/models.ts` (`Lyra.models()`).
- Usage: providers return `usage` {input, output}; `metered()` in `core/usage.ts` records per local day/provider/model/source into table `usage` (migration 7); page `web/src/screens/Usage.tsx` (SVG stacked bars, series colors `--series-1..5`), data shaping in `web/src/usageData.ts` (tested).
- Updates: `core/updates.ts` (Drive folder "Lyra Updates", files you own, names Lyra-<v>.apk / Lyra-app-<v>.lyrapack / Lyra-<v>-win-arm64.zip), `web/src/updater.ts` (daily check, notify once per version), phone install via `ApkInstallerPlugin.java`, desktop packs in main.cjs (`SHELL_VERSION`, trial + rollback). `npm run release` builds them into build/release.
- Status line: `web/src/StatusLine.tsx` (live/idle items, chat status via `setChatStatus`), wording in `web/src/statusText.ts` (STATUS_MAX 24, `fit()` fallbacks, tested), weather in `web/src/weather.ts` (Open-Meteo; setting "weatherPlace").
- Desktop layout: `.app.desk` when a computer window is ≥860px (`useWide()` in App.tsx): docked `Drawer` (prop `docked`), `DeskBar` title bar (WCO drag region, `titleBarOverlay` in main.cjs), no tab bar.
- Desktop (Phase 7b): Electron shell in `desktop/` (main.cjs: app:// protocol + CSP, files in userData, secrets via safeStorage, Google OAuth loopback+PKCE with a user-supplied Desktop client; preload.cjs bridge `window.lyraDesktop`). `npm run desktop` packages win32-arm64 (`scripts/desktop.mjs`); `npm run desktop:smoke` and `scripts/desktop-sync-smoke.mjs` test it under xvfb.
- Sync: `core/sync.ts` (snapshot rev/base/dirty, conflict, keep 10), `core/sync-drive.ts` (drive.appdata), wiring in `web/src/api.ts` (`syncApi`, debounce 4s, poll 60s, reload after pull, routines only on phone when synced). Sync state is `sync.json` (device-local, not in backups).
- Notifications: `web/src/api.ts` `watchForNotices()` sends a notice only while the app is in the background (finished reply, routine post, task turning Ready); routine reminders are rescheduled on routine events; setting "notifications"; status icon `ic_stat_lyra`.
- Google sign-in: `android/.../GoogleAuthPlugin.java` (Play services Authorization API). Gmail, Calendar, Drive connectors each request only their .readonly scope; `grantIsAllowed()` rejects any grant with scopes beyond read-only + drive.appdata + gmail.compose + calendar.events.
- Actions (Phase 9): `core/actions.ts` (table `actions`, checkEmail/checkEvent, claim-once, doEmail/doEvent); opt-in per device (settings "actions.gmail"/"actions.calendar", `Lyra.allowActions`); chat tools propose_email / propose_event only create proposals (`meta.actions`), done only via `Lyra.decideAction` from the card (`web/src/ActionCard.tsx`); switches in Access.tsx `WithYourOk`.
- Model-agnostic: `core/providers/` (Claude, OpenAI, Gemini, and a `fake` practice provider used by tests).
- Web search: each provider's built-in search (Anthropic web_search tool, OpenAI Responses web_search, Gemini googleSearch); results mark the turn tainted; sources saved in message meta; Settings toggle.
- Connectors are MCP servers run in-process over `InMemoryTransport`; tool names are allowlisted in `core/connectors/registry.ts`.
- Outside content (email, web) is always wrapped with `wrapUntrusted()`; memory writes after reading it become suggestions.
- Commands (run in `lyra/`): `npm test`, `npm run typecheck`, `npm run build`, `npm run dev`, `npm run smoke` (needs Playwright), `npm run android:apk` (needs Android SDK).
- This repo is public: never commit signing keys (`*.keystore`, `*.jks` are gitignored). The user keeps the key; bump `versionCode` in `android/app/build.gradle` for each release.
- UI follows the design tokens in `lyra/web/src/styles.css`. Accent colors: `ACCENTS` in `core/lyra.ts` (setting "accent"), palettes as `[data-accent]` blocks in styles.css, picked in Settings. Your-message bubbles: `BUBBLES` in core/lyra.ts (setting "bubbles": softer default | accent | neutral | classic), `[data-bubbles]` on <html> (App.tsx + main.tsx first paint, localStorage "lyra.bubbles") setting --me/--me-text at the end of styles.css; picker in Settings You (`BUBBLE_CHOICES`). Lyra's character is `lyra/core/soul.md` (user-editable in app, stored as soul.md); message format rules are `lyra/core/voice.md`; fixed ground rules (who Lyra works for, discretion, grounding, asking first, distress, hard limits) are `lyra/core/principles.md`, not user-editable. `character()` in `core/soul.ts` joins all three for chat, worker and routine prompts; live voice gets `groundRules(user, ["When", "Hard limits"])`. Prompts also carry `calendarAhead()` (14 days with weekdays) and, in chat, the model name. Caching: chat, worker and routine prompts put the intro + `character()` first, then `SYSTEM_SPLIT` (core/providers/types.ts), then time/tasks/memory; Anthropic sends two cached system blocks (`systemBlocks`) and marks the last message (`cacheLast`), other providers get `plainSystem()`. Keep anything that changes per message after the split.

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
