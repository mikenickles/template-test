extends Node
## Global event bus. Systems emit here instead of holding references to each
## other (HUD, audio, AI hearing and stats all listen independently).

# --- Combat -----------------------------------------------------------------
signal combatant_spawned(combatant: Node)
signal combatant_damaged(victim: Node, attacker: Node, health_damage: float, hitgroup: int)
signal combatant_killed(victim: Node, killer: Node, weapon_id: StringName, headshot: bool, penetrated: bool)
## Emitted for every shot so AI can hear gunfire and HUD can react.
signal weapon_fired(shooter: Node, weapon_id: StringName, origin: Vector3)
## Generic noise for AI hearing: footsteps, reloads, bomb beeps, etc.
signal noise_emitted(source: Node, position: Vector3, radius: float, kind: StringName)

# --- Round / match ------------------------------------------------------------
signal match_started()
signal round_phase_changed(phase: int, time_left: float)
signal round_started(round_number: int)
signal round_ended(winner: int, reason: int)
signal halftime()
signal match_ended(winner: int)
signal money_changed(record: RefCounted, amount: int, delta: int, reason: String)

# --- Objective ------------------------------------------------------------------
signal bomb_picked_up(carrier: Node)
signal bomb_dropped(position: Vector3)
signal bomb_plant_started(planter: Node, site: StringName)
signal bomb_plant_aborted(planter: Node)
signal bomb_planted(planter: Node, site: StringName, position: Vector3)
signal bomb_defuse_started(defuser: Node, with_kit: bool)
signal bomb_defuse_aborted(defuser: Node)
signal bomb_defused(defuser: Node)
signal bomb_exploded(position: Vector3)

# --- UI -------------------------------------------------------------------------
## Large centred announcement ("Bomb planted", "Wardens win").
signal announcement(text: String, color: Color, duration: float)
## Small hint line near the crosshair ("Press E to defuse").
signal hint(text: String)
signal settings_changed()
