class_name CombatIntent
extends RefCounted
## Device-independent per-tick command for a Combatant.
##
## Human input (keyboard/mouse today, touch later) and bot AI both write into
## this structure; the Combatant only ever reads it. That keeps movement,
## weapon handling and rules identical for players and bots and makes the
## simulation testable without input devices.

## x = strafe right, y = forward. Length is clamped to 1 by the consumer.
var move := Vector2.ZERO
## Absolute view angles in radians. Pitch is positive when looking up.
var yaw := 0.0
var pitch := 0.0

var jump := false
var crouch := false
var walk := false
var fire := false
var alt_fire := false
var reload := false
var use := false
var drop := false
## Requested inventory slot (GameConst.Slot) or -1 for none this tick.
var switch_slot := -1
## +1 / -1 to cycle weapons, 0 for none.
var cycle := 0
var last_weapon := false

func clear_triggers() -> void:
	## Clears one-shot requests after the Combatant consumed them.
	reload = false
	drop = false
	switch_slot = -1
	cycle = 0
	last_weapon = false

func copy_from(other: CombatIntent) -> void:
	move = other.move
	yaw = other.yaw
	pitch = other.pitch
	jump = other.jump
	crouch = other.crouch
	walk = other.walk
	fire = other.fire
	alt_fire = other.alt_fire
	reload = other.reload
	use = other.use
	drop = other.drop
	switch_slot = other.switch_slot
	cycle = other.cycle
	last_weapon = other.last_weapon
