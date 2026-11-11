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
- Gmail sign-in: `android/.../GoogleAuthPlugin.java` (Play services Authorization API, gmail.readonly only).
- Model-agnostic: `core/providers/` (Claude, OpenAI, Gemini, and a `fake` practice provider used by tests).
- Connectors are MCP servers run in-process over `InMemoryTransport`; tool names are allowlisted in `core/connectors/registry.ts`.
- Outside content (email, web) is always wrapped with `wrapUntrusted()`; memory writes after reading it become suggestions.
- Commands (run in `lyra/`): `npm test`, `npm run typecheck`, `npm run build`, `npm run dev`, `npm run smoke` (needs Playwright), `npm run android:apk` (needs Android SDK).
- This repo is public: never commit signing keys (`*.keystore`, `*.jks` are gitignored). The user keeps the key; bump `versionCode` in `android/app/build.gradle` for each release.
- UI follows the design tokens in `lyra/web/src/styles.css`; voice rules live in `lyra/core/voice.md`.

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
