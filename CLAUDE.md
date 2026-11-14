# CLAUDE.md

## Repository Overview

**Project**: template-test
**Remote**: `mikenickles/template-test`

Two independent projects live here:

| Path | What it is |
|---|---|
| `/` (root: `src/`, `public/`, `astro.config.mjs`) | A small Astro + Tailwind blog. |
| `arlo/` | Arlo, a self-hosted personal agent: a Node hub, a web interface, and an Android companion app. See `arlo/README.md`. |

### Arlo (`arlo/`)

- **Runtime**: Node.js 22.18+ (24 or newer recommended). The hub is TypeScript run directly by Node, with no build step, so use erasable syntax only (no enums, parameter properties or namespaces) and write `.ts` extensions in imports.
- **No native dependencies**: the hub must run on Windows ARM64. Storage is the built-in `node:sqlite`. Do not add packages that need a compiler or prebuilt binaries.
- **Layout**: `hub/agent/` (turn loop, approvals, memory, routines), `hub/providers/` (Claude, OpenAI, Gemini behind one interface), `hub/tools/` (Gmail, Calendar, Drive, Spotify, wallet), `web/` (plain ES modules served by the hub), `android/` (Kotlin WebView shell), `test/`.
- **Safety rules are code, not prompt**: every tool declares a risk (`read`, `act`, `confirm`, `money`) and `hub/tools/execute.ts` decides when the owner must approve. New tools that reach other people, delete, or spend must be `confirm` or `money` and provide a `card`. Tools returning other people's text must set `untrusted: true`.
- **Design**: the interface follows the house tokens in `web/styles.css`. Use only those variables; check phone width (380px) and dark mode.

```
# from arlo/
# Run:        npm start          (npm run demo for pretend accounts, no keys)
# Test:       npm test
# Typecheck:  npm run typecheck
# Android:    cd android && ./gradlew assembleDebug   (compileSdk 37, JDK 17+)
```

## Development Workflow

### Branching

- Feature branches should be created from the default branch.
- Use descriptive branch names (e.g., `feature/add-auth`, `fix/login-bug`).

### Commits

- Write clear, concise commit messages describing **why** the change was made.
- Keep commits focused on a single logical change.

### Code Quality

Commands for Arlo are listed above. The blog uses `npm run dev` and `npm run build` from the repository root.

## Conventions for AI Assistants

- Read existing code before proposing changes.
- Keep changes minimal and focused on the task at hand.
- Do not add features, abstractions, or refactors beyond what is requested.
- Run tests and linters after making changes (once configured).
- Do not commit secrets, credentials, or `.env` files.
