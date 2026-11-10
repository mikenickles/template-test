class_name DebugOverlay
extends Control
## Developer readout: FPS, speed, position, callout and crosshair.
## Toggled with F3 (always shown when GameSettings.show_fps).

var target: Combatant
var _label: Label
var _visible_stats := true

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label = Label.new()
	_label.position = Vector2(16, 12)
	_label.add_theme_font_size_override("font_size", 18)
	_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	_label.add_theme_constant_override("shadow_offset_x", 1)
	_label.add_theme_constant_override("shadow_offset_y", 1)
	add_child(_label)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.physical_keycode == KEY_F3:
		_visible_stats = not _visible_stats

func _process(_delta: float) -> void:
	queue_redraw()
	if not _visible_stats or target == null:
		_label.text = ""
		return
	var p := target.global_position
	var callout := target.map_info.callout_at(p) if target.map_info else ""
	_label.text = "%d fps   speed %.2f m/s   %s\npos (%.1f, %.1f, %.1f)   crouch %.2f   fatigue %.2f   %s" % [
		Engine.get_frames_per_second(), target.horizontal_speed(), "AIR" if target.is_airborne() else "",
		p.x, p.y, p.z, target.crouch_amount, target.fatigue, callout]

func _draw() -> void:
	var c := size * 0.5
	var col := GameSettings.crosshair_color
	for d: Vector2 in [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]:
		draw_line(c + d * 4.0, c + d * 11.0, Color(0, 0, 0, 0.6), 4.0)
		draw_line(c + d * 4.0, c + d * 11.0, col, 2.0)
