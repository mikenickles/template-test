class_name WeaponInstance
extends RefCounted
## Runtime state of one weapon owned by a combatant (ammo, timers, recoil
## and accuracy accumulators). Pure state + timers: no scene access, so the
## rules are unit-testable.

enum State { IDLE, DRAWING, RELOADING }

var data: WeaponData
var mag := 0
var reserve := 0
var state := State.IDLE
## Seconds left in the current DRAWING / RELOADING state.
var state_time := 0.0
## Seconds until the next shot may fire.
var cooldown := 0.0
## Accumulated (shot-induced) inaccuracy in degrees.
var inaccuracy_accum := 0.0
## Index into the recoil pattern (shots in the current spray).
var spray_index := 0
var since_last_shot := 99.0
var zoom_level := 0
## Elapsed time in the current reload (for sound cues / animation).
var reload_elapsed := 0.0
var _reload_cue := 0
## Seconds until the post-shot pump/bolt sound (pump & bolt actions).
var _action_cue := -1.0

func _init(p_data: WeaponData) -> void:
	data = p_data
	mag = p_data.mag_size
	reserve = p_data.reserve_max

func begin_draw() -> void:
	state = State.DRAWING
	state_time = data.draw_time
	zoom_level = 0
	reload_elapsed = 0.0

func is_ready() -> bool:
	return state == State.IDLE and cooldown <= 0.0

func needs_reload() -> bool:
	return data.is_gun() and mag < data.mag_size and reserve > 0

func start_reload() -> bool:
	if state != State.IDLE or not needs_reload():
		return false
	state = State.RELOADING
	reload_elapsed = 0.0
	_reload_cue = 0
	zoom_level = 0
	state_time = data.shell_reload_time if data.shell_reload else data.reload_time
	return true

## Consumes one round and starts the cooldown. Returns false if empty.
func consume_shot() -> bool:
	if data.is_gun():
		if mag <= 0:
			return false
		mag -= 1
	cooldown = data.fire_interval
	since_last_shot = 0.0
	inaccuracy_accum = minf(inaccuracy_accum + data.inaccuracy_per_shot, data.inaccuracy_max)
	spray_index += 1
	if data.bolt_action:
		_action_cue = 0.32
		if data.has_scope():
			zoom_level = 0 # re-scope after the bolt cycles
	return true

## Advances timers. Returns a list of sound cue ids reached this tick.
func tick(delta: float) -> Array[String]:
	var cues: Array[String] = []
	cooldown = maxf(cooldown - delta, 0.0)
	if _action_cue > 0.0:
		_action_cue -= delta
		if _action_cue <= 0.0 and mag > 0:
			cues.append("weapons/pump_action" if data.category == "shotgun" else "weapons/bolt_cycle")
	since_last_shot += delta
	# Accuracy recovers linearly; recoil index resets after a pause.
	var rec := data.inaccuracy_max / maxf(data.inaccuracy_recovery, 0.01)
	inaccuracy_accum = maxf(inaccuracy_accum - rec * delta, 0.0)
	if since_last_shot > data.recoil_reset_time:
		spray_index = 0
	elif since_last_shot > data.fire_interval * 1.5:
		# Partial recovery while tapping slowly.
		var frac := (since_last_shot - data.fire_interval) / maxf(data.recoil_reset_time, 0.01)
		spray_index = mini(spray_index, int(ceil(spray_index * (1.0 - frac))))
	match state:
		State.DRAWING:
			state_time -= delta
			if state_time <= 0.0:
				state = State.IDLE
		State.RELOADING:
			reload_elapsed += delta
			while _reload_cue < data.reload_sounds.size() and reload_elapsed >= float(data.reload_sounds[_reload_cue][0]):
				cues.append(str(data.reload_sounds[_reload_cue][1]))
				_reload_cue += 1
			state_time -= delta
			if state_time <= 0.0:
				_finish_reload_step()
	return cues

func _finish_reload_step() -> void:
	if data.shell_reload:
		if mag < data.mag_size and reserve > 0:
			mag += 1
			reserve -= 1
		if mag < data.mag_size and reserve > 0:
			state_time = data.shell_reload_time
			reload_elapsed = 0.0
			_reload_cue = 0
			return
		state = State.IDLE
		return
	var need := data.mag_size - mag
	var take := mini(need, reserve)
	mag += take
	reserve -= take
	state = State.IDLE

## Interrupts a shell-by-shell reload (firing a shotgun mid-reload).
func interrupt_reload() -> void:
	if state == State.RELOADING and data.shell_reload:
		state = State.IDLE

func reload_progress() -> float:
	if state != State.RELOADING:
		return 0.0
	var total := data.shell_reload_time if data.shell_reload else data.reload_time
	return clampf(1.0 - state_time / maxf(total, 0.001), 0.0, 1.0)

func is_scoped() -> bool:
	return zoom_level > 0

## Current inaccuracy cone (degrees) for a shooter with the given movement
## state. `speed_frac` is horizontal speed / weapon move speed.
func current_inaccuracy(speed_frac: float, airborne: bool, crouched: bool) -> float:
	var base := data.inaccuracy_crouch if crouched else data.inaccuracy_stand
	if is_scoped() and data.scoped_inaccuracy > 0.0:
		base = data.scoped_inaccuracy
	var moving := data.inaccuracy_move * clampf((speed_frac - 0.34) / 0.66, 0.0, 1.0)
	var air := data.inaccuracy_air if airborne else 0.0
	return base + moving + air + inaccuracy_accum
