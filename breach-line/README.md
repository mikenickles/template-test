# Breach Line

An original round-based tactical first-person shooter made with Godot 4.7.
Two teams — the **Breachers** (attack) and the **Wardens** (defend) — fight
5v5 over **Sawtooth**, a decommissioned rail yard and foundry. Plant the
breach charge at site A or B, or stop it. Buy weapons and armor with the
money you earn each round. First to 7 rounds wins; sides swap at halftime.

## Play

1. Install [Godot 4.7.2](https://godotengine.org/download) (standard build).
2. Open `breach-line/project.godot` and press **F5** — or from a terminal:
   `godot --path breach-line`.
3. Choose a side and bot difficulty in the main menu.

To build a standalone game: install the 4.7.2 export templates (Editor →
Manage Export Templates), then **Project → Export** (Linux and Windows
presets are included) or run `tools/export.sh`.

## Controls

| Action | Key |
|---|---|
| Move / walk (silent) | WASD / Shift |
| Jump / crouch | Space / Ctrl or C |
| Fire / scope | Left / right mouse |
| Reload / use (plant, defuse, swap weapon) | R / E |
| Weapons | 1–5, mouse wheel, Q (last) |
| Drop weapon or charge | G |
| Buy menu (in spawn, first 20 s) | B |
| Scoreboard | Tab |
| Pause & settings | Esc |

Tips: rifles are accurate only when you stand still or walk; crouch for
long-range fights; recoil patterns are fixed, so pull down while spraying.
The charge carrier plants by selecting slot 5 and holding fire inside a
site. A defuse kit halves defuse time.

## For developers

See [DEVELOPMENT.md](DEVELOPMENT.md) for architecture, systems, tests,
balance/performance data, decisions and the roadmap.
