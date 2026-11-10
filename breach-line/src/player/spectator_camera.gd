class_name SpectatorCamera
extends Camera3D
## Third-person follow camera for spectating living teammates after death.
## Left click cycles targets; the mouse orbits.

var targets: Callable # -> Array[Combatant]
var target: Combatant
var _orbit_yaw := 0.0
var _orbit_pitch := -0.25

func _ready() -> void:
	fov = GameSettings.fov
	near = 0.05
	far = 400.0

func pick_next(step: int = 1) -> void:
	var list: Array = targets.call() if targets.is_valid() else []
	if list.is_empty():
		target = null
		return
	var i := list.find(target)
	target = list[posmod(i + step, list.size())]
	_orbit_yaw = target.yaw

func _unhandled_input(event: InputEvent) -> void:
	if not current:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		_orbit_yaw -= event.screen_relative.x * GameSettings.mouse_sensitivity
		_orbit_pitch = clampf(_orbit_pitch - event.screen_relative.y * GameSettings.mouse_sensitivity, -1.2, 0.5)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		pick_next(1)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT:
		pick_next(-1)

func _process(_delta: float) -> void:
	if target == null or not is_instance_valid(target) or not target.alive:
		pick_next(1)
		if target == null:
			return
	var focus := target.get_global_transform_interpolated().origin + Vector3(0, 1.6, 0)
	var dir := Combatant.dir_from_angles(_orbit_yaw, _orbit_pitch)
	var want := focus - dir * 2.8
	var space := get_world_3d().direct_space_state
	var hit := space.intersect_ray(PhysicsRayQueryParameters3D.create(focus, want, GameConst.LAYER_WORLD))
	if not hit.is_empty():
		want = hit.position + (focus - hit.position).normalized() * 0.25
	global_position = want
	look_at(focus, Vector3.UP)
