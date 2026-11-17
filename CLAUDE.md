# CLAUDE.md

## Repository Overview

**Project**: template-test
**Remote**: `mikenickles/template-test`

The repo holds an Astro + Tailwind blog (`src/`, `astro.config.mjs`) and a standalone browser game in `public/regolith/`.

## REGOLITH (Mars FPS) — `public/regolith/index.html`

- Single self-contained HTML file: inline CSS/HUD markup plus one ES module. three.js **0.160.0** (core + `examples/jsm` addons) loads from jsDelivr through an import map; Google Fonts is optional (system fallback).
- Run: open the file in a desktop Chromium/Firefox, or `npm run dev` and visit `/regolith/` (Astro serves `public/` as-is).
- The module is split into numbered sections (search for `// 0. CONFIG` … `// 17. MAIN LOOP`): config, utilities, renderer/sky, procedural textures, collision world, map builder, map layout, navigation, input, character physics, models, weapons, FX, audio, bots, game rules, HUD, main loop. Gameplay tuning lives in `CFG` (section 0) and `WDEF` (weapons).
- Physics is custom: vertical-cylinder characters vs AABB/OBB/cylinder/dome/ramp colliders in a spatial grid, 120 Hz sub-steps. All geometry and textures are procedural; static geometry is merged per material and props are instanced.
- Soldiers, guns and first-person arms/gloves are modelled in Blender by the scripts in `tools/regolith-blender/` (`pip install bpy`, then `python build_assets.py`). They bake ambient occlusion into vertex colours and emit a gzip+base64 blob; that blob is the `ASSET_B64` constant in `index.html` (replace that line to update models). `loadAssets()` unpacks it; soldiers are skinned to the procedural rig in `buildSoldier`.
- Debug/test hooks: `?debug` skips pointer lock, `?noloop` disables the render loop, and `window.__regolith` exposes `start()`, `step()`, `render()`, `tp()` etc. for headless (Playwright) testing.

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
