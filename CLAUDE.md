# CLAUDE.md

## Repository Overview

**Project**: template-test
**Status**: New/empty repository — no application code has been added yet.
**Remote**: `mikenickles/template-test`

## Projects in this repo

- Root: Astro + Tailwind blog (`npm run dev`, `npm run build`).
- `ai-keyboard/`: Android keyboard (Kotlin, AGP 8.11, compileSdk 35, minSdk 26) that uses the
  Claude API (official `com.anthropic:anthropic-java` SDK) to fix typing mistakes. Build with
  `cd ai-keyboard && ./gradlew assembleDebug` (needs JDK 17+ and the Android SDK). See
  `ai-keyboard/README.md`.

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
