class_name PlayerBrain
extends Node
## Converts human input into the Combatant's CombatIntent and owns the
## first-person camera. This is the only gameplay class that reads `Input`;
## a touch-controls source for mobile can replace it by writing the same
## intent fields.

signal look_changed(yaw: float, pitch: float)

var combatant: Combatant
var camera: PlayerCamera
var look_yaw := 0.0
var look_pitch := 0.0
## False while a menu (buy, pause) owns the mouse/keyboard.
var input_enabled := true
## Extra multiplier on look sensitivity (e.g. while scoped).
var sensitivity_scale := 1.0
## Dev/test: holds fire for this many ticks regardless of input.
var debug_fire_frames := 0

var _pending_reload := false
var _pending_drop := false
var _pending_slot := -1
var _pending_cycle := 0
var _pending_last := false

func attach(c: Combatant) -> void:
	combatant = c
	c.brain = self
	camera = PlayerCamera.new()
	camera.name = "PlayerCamera"
	camera.combatant = c
	camera.brain = self
	add_child(camera)
	camera.current = true

func on_spawned(c: Combatant) -> void:
	look_yaw = c.yaw
	look_pitch = c.pitch
	if camera:
		camera.snap()

func _captured() -> bool:
	return Input.mouse_mode == Input.MOUSE_MODE_CAPTURED

func _unhandled_input(event: InputEvent) -> void:
	if not input_enabled or combatant == null:
		return
	if event is InputEventMouseMotion:
		if _captured():
			var m := event as InputEventMouseMotion
			var sens := GameSettings.mouse_sensitivity * sensitivity_scale
			look_yaw = wrapf(look_yaw - m.screen_relative.x * sens, -PI, PI)
			var dy := m.screen_relative.y * sens * (-1.0 if GameSettings.invert_y else 1.0)
			look_pitch = clampf(look_pitch - dy, deg_to_rad(-89.0), deg_to_rad(89.0))
			look_changed.emit(look_yaw, look_pitch)
		return
	if not _captured():
		return
	if event.is_action_pressed("reload"):
		_pending_reload = true
	elif event.is_action_pressed("drop"):
		_pending_drop = true
	elif event.is_action_pressed("last_weapon"):
		_pending_last = true
	elif event.is_action_pressed("next_weapon"):
		_pending_cycle = 1
	elif event.is_action_pressed("prev_weapon"):
		_pending_cycle = -1
	else:
		for i in 5:
			if event.is_action_pressed("slot_%d" % (i + 1)):
				_pending_slot = i
				break

## Called by the Combatant at the start of each physics tick.
func update_intent(_c: Combatant, intent: CombatIntent, _delta: float) -> void:
	var active := input_enabled and _captured()
	if active:
		intent.move = Input.get_vector("move_left", "move_right", "move_back", "move_forward")
		intent.jump = Input.is_action_pressed("jump")
		intent.crouch = Input.is_action_pressed("crouch")
		intent.walk = Input.is_action_pressed("walk")
		intent.fire = Input.is_action_pressed("fire")
		intent.alt_fire = Input.is_action_pressed("alt_fire")
		intent.use = Input.is_action_pressed("use")
	else:
		intent.move = Vector2.ZERO
		intent.jump = false
		intent.walk = false
		intent.fire = false
		intent.alt_fire = false
		intent.use = false
		# Keep crouch state while a menu is open so you don't pop up.
	if debug_fire_frames > 0:
		debug_fire_frames -= 1
		intent.fire = true
	intent.yaw = look_yaw
	intent.pitch = look_pitch
	intent.reload = _pending_reload
	intent.drop = _pending_drop
	intent.switch_slot = _pending_slot
	intent.cycle = _pending_cycle
	intent.last_weapon = _pending_last
	_pending_reload = false
	_pending_drop = false
	_pending_slot = -1
	_pending_cycle = 0
	_pending_last = false

## Applies a view kick (recoil) directly to the look angles.
func add_look(d_yaw: float, d_pitch: float) -> void:
	look_yaw = wrapf(look_yaw + d_yaw, -PI, PI)
	look_pitch = clampf(look_pitch + d_pitch, deg_to_rad(-89.0), deg_to_rad(89.0))
