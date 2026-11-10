class_name WeaponData
extends Resource
## Static definition of a weapon. All tuning lives in data/weapons/*.tres.
## Angles are in degrees, distances in meters, times in seconds.

@export var id: StringName
@export var display_name := ""
@export var short_name := ""
@export_enum("melee", "pistol", "smg", "shotgun", "rifle", "sniper", "bomb") var category := "rifle"
@export var slot := GameConst.Slot.PRIMARY
## 0 = both teams, otherwise GameConst.Team restriction for buying.
@export var team := 0
@export var price := 0
@export var kill_reward := 300

@export_group("Damage")
@export var damage := 30.0
## Fraction of damage that reaches health through armor.
@export var armor_penetration := 0.5
## Damage multiplier per 10 m travelled.
@export var range_modifier := 0.9
@export var max_range := 250.0
## Wall penetration budget (meters of a fully penetrable material).
@export var penetration_power := 1.0
@export var pellets := 1

@export_group("Handling")
@export var fire_interval := 0.1
@export var automatic := false
@export var mag_size := 30
@export var reserve_max := 90
@export var reload_time := 2.5
@export var shell_reload := false
@export var shell_reload_time := 0.5
## Time after each shot before the next can fire for pump/bolt actions is
## covered by fire_interval; this flags the visual bolt cycle.
@export var bolt_action := false
@export var draw_time := 1.0
@export var move_speed := 5.7
@export var scoped_speed_factor := 1.0

@export_group("Accuracy")
@export var inaccuracy_stand := 0.4
@export var inaccuracy_crouch := 0.3
## Added at full run speed (scaled by speed fraction).
@export var inaccuracy_move := 3.0
@export var inaccuracy_air := 8.0
@export var inaccuracy_per_shot := 0.6
@export var inaccuracy_max := 6.0
## Seconds to fully recover from inaccuracy_max.
@export var inaccuracy_recovery := 0.35
## Base inaccuracy while scoped (snipers); unscoped uses the values above.
@export var scoped_inaccuracy := 0.0
## Fixed pellet cone half-angle for shotguns.
@export var pellet_spread := 0.0

@export_group("Recoil")
## Pitch climb per shot during the climb phase.
@export var recoil_vertical := 0.8
@export var recoil_climb_shots := 8
## Pitch per shot after the climb phase (fraction of recoil_vertical).
@export var recoil_plateau := 0.2
## Horizontal sway amplitude per shot.
@export var recoil_horizontal := 0.5
## Shots per full left-right sway cycle.
@export var recoil_sway_period := 10.0
@export var recoil_jitter := 0.08
@export var recoil_seed := 1
## Seconds without firing before the pattern fully resets.
@export var recoil_reset_time := 0.45
## Fraction of the aim punch shown on the camera (the rest must be
## compensated by the player).
@export var view_punch := 0.5
## Extra purely visual kick per shot (degrees, decays quickly).
@export var view_kick := 0.6

@export_group("Zoom")
## Vertical FOVs for successive zoom levels (empty = no scope).
@export var zoom_fovs := PackedFloat32Array()

@export_group("Melee")
@export var melee_range := 1.7
@export var alt_damage := 0.0
@export var alt_interval := 1.0

@export_group("Presentation")
@export var model: StringName
@export var fire_sound := ""
@export var fire_volume_db := 0.0
## [[time, sound_id], ...] played during a reload.
@export var reload_sounds: Array = []
@export var draw_sound := "weapons/weapon_draw"
@export var tracer_every := 3
@export var muzzle_flash_scale := 1.0
@export var shell_eject := true

var _pattern := PackedVector2Array()

func is_melee() -> bool:
	return category == "melee"

func is_gun() -> bool:
	return category != "melee" and category != "bomb"

func has_scope() -> bool:
	return zoom_fovs.size() > 0

## Cumulative recoil offset (x = yaw right, y = pitch up) in degrees for the
## given shot index (0 = first shot, always zero). Deterministic per weapon
## so players can learn to control the spray.
func recoil_offset(index: int) -> Vector2:
	if _pattern.is_empty():
		_build_pattern()
	return _pattern[clampi(index, 0, _pattern.size() - 1)]

func _build_pattern() -> void:
	var n := maxi(mag_size, 1) + 1
	_pattern.resize(n)
	var rng := RandomNumberGenerator.new()
	rng.seed = recoil_seed * 7919 + 13
	var acc := Vector2.ZERO
	_pattern[0] = acc
	for i in range(1, n):
		var k := i - 1
		var v := recoil_vertical if k < recoil_climb_shots else recoil_vertical * recoil_plateau
		# Horizontal sway kicks in once the climb is underway.
		var sway_phase := maxf(float(k) - recoil_climb_shots * 0.5, 0.0)
		var ramp := clampf(sway_phase / maxf(recoil_climb_shots * 0.5, 1.0), 0.0, 1.0)
		var h := recoil_horizontal * ramp * cos(TAU * sway_phase / maxf(recoil_sway_period, 1.0))
		h += rng.randf_range(-recoil_jitter, recoil_jitter)
		v += rng.randf_range(-recoil_jitter, recoil_jitter) * 0.5
		acc += Vector2(h, v)
		_pattern[i] = acc
