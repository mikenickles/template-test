class_name PlayerHUD
extends Control
## In-game HUD for the local player. Phase 4 scope: dynamic crosshair,
## hit markers, health/armor, ammo, reload bar, scope overlay and damage
## flash. Match information (money, timer, scores, kill feed, radar) is added
## by MatchHUD in Phase 6. Layout uses anchors so it scales to any screen.

var combatant: Combatant
var weapons: WeaponController
var camera: PlayerCamera

var _hit_t := 0.0
var _hit_kill := false
var _hit_head := false
var _damage_t := 0.0
var _crosshair_gap := 6.0
## Recent hits: [{angle (rad, relative to view), t}]
var _hit_dirs: Array = []
var _heartbeat_t := 0.0

var _hp_label: Label
var _armor_label: Label
var _ammo_label: Label
var _reserve_label: Label
var _weapon_label: Label
var _font_bold: Font

func setup(c: Combatant, cam: PlayerCamera) -> void:
	combatant = c
	weapons = c.weapons
	camera = cam
	weapons.hit_confirmed.connect(_on_hit)
	c.damaged.connect(_on_damaged)

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sys := SystemFont.new()
	sys.font_names = PackedStringArray(["DejaVu Sans", "Noto Sans", "Arial", "sans-serif"])
	sys.font_weight = 700
	_font_bold = sys
	_hp_label = _label(52, HORIZONTAL_ALIGNMENT_LEFT)
	_armor_label = _label(30, HORIZONTAL_ALIGNMENT_LEFT)
	_ammo_label = _label(56, HORIZONTAL_ALIGNMENT_RIGHT)
	_reserve_label = _label(28, HORIZONTAL_ALIGNMENT_LEFT)
	_weapon_label = _label(20, HORIZONTAL_ALIGNMENT_RIGHT)

func _label(font_size: int, align: HorizontalAlignment) -> Label:
	var l := Label.new()
	l.add_theme_font_override("font", _font_bold)
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", Color(0.95, 0.94, 0.9))
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.7))
	l.add_theme_constant_override("shadow_offset_x", 2)
	l.add_theme_constant_override("shadow_offset_y", 2)
	l.horizontal_alignment = align
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(l)
	return l

func _on_damaged(amount: float, attacker: Node, _group: int) -> void:
	_damage_t = clampf(amount / 40.0, 0.25, 1.0)
	if attacker is Node3D and attacker != combatant:
		var to := (attacker as Node3D).global_position - combatant.global_position
		var world_angle := atan2(-to.x, -to.z)
		_hit_dirs.append({"angle": world_angle, "t": 1.6})
		if _hit_dirs.size() > 4:
			_hit_dirs.pop_front()

func _on_hit(_victim: Combatant, _dmg: float, hitgroup: int, killed: bool) -> void:
	_hit_t = 0.25 if not killed else 0.45
	_hit_kill = killed
	_hit_head = hitgroup == GameConst.HitGroup.HEAD
	Audio.play_2d("ui/kill_ping" if killed else "ui/hitmarker", -6.0 if killed else -10.0)
	if _hit_head:
		Audio.play_2d("impacts/helmet_ping", -14.0)

func _process(delta: float) -> void:
	_hit_t = maxf(_hit_t - delta, 0.0)
	_damage_t = maxf(_damage_t - delta * 1.6, 0.0)
	for h in _hit_dirs:
		h.t -= delta
	_hit_dirs = _hit_dirs.filter(func(h): return h.t > 0.0)
	if combatant and combatant.alive and combatant.health <= 25.0:
		_heartbeat_t -= delta
		if _heartbeat_t <= 0.0:
			_heartbeat_t = 1.0
			Audio.play_2d("player/heartbeat", -10.0)
	else:
		_heartbeat_t = 0.0
	if combatant == null:
		return
	var s := size
	var w := weapons.active
	_hp_label.text = "%d" % ceili(combatant.health)
	_hp_label.position = Vector2(84, s.y - 92)
	_hp_label.add_theme_color_override("font_color", Color(1.0, 0.35, 0.3) if combatant.health <= 25 else Color(0.95, 0.94, 0.9))
	_armor_label.text = ("%d" % ceili(combatant.armor)) + (" +H" if combatant.has_helmet else "")
	_armor_label.position = Vector2(270, s.y - 78)
	_armor_label.visible = combatant.armor > 0
	if w and w.data.is_gun():
		_ammo_label.text = "%d" % w.mag
		_reserve_label.text = "/ %d" % w.reserve
		_ammo_label.add_theme_color_override("font_color", Color(1.0, 0.4, 0.3) if w.mag <= w.data.mag_size / 5 else Color(0.95, 0.94, 0.9))
	else:
		_ammo_label.text = ""
		_reserve_label.text = ""
	_ammo_label.size = Vector2(200, 70)
	_ammo_label.position = Vector2(s.x - 330, s.y - 98)
	_reserve_label.position = Vector2(s.x - 120, s.y - 78)
	_weapon_label.text = w.data.display_name.to_upper() if w else ""
	_weapon_label.size = Vector2(400, 30)
	_weapon_label.position = Vector2(s.x - 440, s.y - 128)
	# Crosshair gap follows actual weapon inaccuracy (degrees -> pixels).
	var inacc := weapons.current_inaccuracy()
	var vfov := deg_to_rad(camera.fov if camera else 74.0)
	var px := tan(deg_to_rad(inacc)) / tan(vfov * 0.5) * (s.y * 0.5)
	_crosshair_gap = lerpf(_crosshair_gap, clampf(4.0 + px, 4.0, 90.0), 1.0 - exp(-20.0 * delta))
	queue_redraw()

func _draw() -> void:
	if combatant == null:
		return
	var s := size
	var c := s * 0.5
	var w := weapons.active
	# Damage vignette.
	if _damage_t > 0.0:
		var a := _damage_t * 0.35
		for i in 6:
			var inset := i * 18.0
			draw_rect(Rect2(Vector2(inset, inset), s - Vector2(inset, inset) * 2.0), Color(0.7, 0.0, 0.0, a * (1.0 - i / 6.0) * 0.4), false, 18.0)
	var scoped := w != null and w.is_scoped()
	if scoped:
		_draw_scope(s, c)
	elif combatant.alive and w and not (w.data.category == "sniper"):
		_draw_crosshair(c)
	# Damage direction arcs around the crosshair.
	for h in _hit_dirs:
		var rel: float = wrapf(h.angle - (camera.rotation.y if camera else combatant.yaw), -PI, PI)
		var screen_angle := -rel - PI * 0.5
		var a := clampf(h.t, 0.0, 1.0)
		draw_arc(c, 120.0, screen_angle - 0.35, screen_angle + 0.35, 24, Color(1.0, 0.15, 0.1, 0.75 * a), 7.0, true)
	# Hit marker.
	if _hit_t > 0.0:
		var col := Color(1.0, 0.25, 0.2, minf(_hit_t * 5.0, 1.0)) if _hit_kill else Color(1, 1, 1, minf(_hit_t * 5.0, 1.0))
		var r0 := 7.0
		var r1 := 15.0 if not _hit_head else 19.0
		for d: Vector2 in [Vector2(1, 1), Vector2(-1, 1), Vector2(1, -1), Vector2(-1, -1)]:
			var n := d.normalized()
			draw_line(c + n * r0, c + n * r1, col, 2.5)
	# Reload progress.
	if w and w.state == WeaponInstance.State.RELOADING and not w.data.shell_reload:
		var p := w.reload_progress()
		var bar := Rect2(c + Vector2(-50, 38), Vector2(100, 5))
		draw_rect(bar, Color(0, 0, 0, 0.55))
		draw_rect(Rect2(bar.position, Vector2(bar.size.x * p, bar.size.y)), Color(0.95, 0.94, 0.9, 0.9))
	# Bottom panels.
	var panel := Color(0.04, 0.045, 0.05, 0.55)
	draw_rect(Rect2(Vector2(24, s.y - 104), Vector2(330, 80)), panel)
	draw_rect(Rect2(Vector2(24, s.y - 104), Vector2(5, 80)), GameConst.team_color(combatant.team))
	_draw_cross_icon(Vector2(56, s.y - 64), 15.0, Color(0.95, 0.94, 0.9))
	if combatant.armor > 0:
		_draw_shield_icon(Vector2(248, s.y - 62), 13.0, Color(0.85, 0.85, 0.82))
	draw_rect(Rect2(Vector2(s.x - 354, s.y - 104), Vector2(330, 80)), panel)
	if w and w.data.is_gun() and w.data.mag_size > 0:
		var frac := float(w.mag) / w.data.mag_size
		draw_rect(Rect2(Vector2(s.x - 354, s.y - 28), Vector2(330 * frac, 4)), Color(0.95, 0.94, 0.9, 0.7))

func _draw_crosshair(c: Vector2) -> void:
	var col := GameSettings.crosshair_color
	var k := GameSettings.crosshair_size
	var length := 9.0 * k
	var g := _crosshair_gap
	for d: Vector2 in [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]:
		draw_line(c + d * g, c + d * (g + length), Color(0, 0, 0, 0.55), 4.0)
		draw_line(c + d * g, c + d * (g + length), col, 2.0)
	draw_rect(Rect2(c - Vector2(1, 1), Vector2(2, 2)), col)

func _draw_scope(s: Vector2, c: Vector2) -> void:
	var r := s.y * 0.48
	var black := Color(0, 0, 0, 1)
	draw_rect(Rect2(Vector2.ZERO, Vector2(c.x - r, s.y)), black)
	draw_rect(Rect2(Vector2(c.x + r, 0), Vector2(s.x - c.x - r, s.y)), black)
	# Ring of thick arcs fakes the circular mask edge.
	draw_arc(c, r + s.y * 0.25, 0, TAU, 96, black, s.y * 0.5, true)
	draw_arc(c, r, 0, TAU, 96, Color(0, 0, 0, 0.8), 6.0, true)
	draw_line(Vector2(c.x - r, c.y), Vector2(c.x + r, c.y), Color(0, 0, 0, 0.95), 1.5)
	draw_line(Vector2(c.x, c.y - r), Vector2(c.x, c.y + r), Color(0, 0, 0, 0.95), 1.5)
	draw_line(Vector2(c.x - r, c.y), Vector2(c.x - r * 0.08, c.y), black, 4.0)
	draw_line(Vector2(c.x + r * 0.08, c.y), Vector2(c.x + r, c.y), black, 4.0)
	draw_line(Vector2(c.x, c.y + r * 0.08), Vector2(c.x, c.y + r), black, 4.0)

func _draw_cross_icon(p: Vector2, r: float, col: Color) -> void:
	draw_rect(Rect2(p - Vector2(r * 0.35, r), Vector2(r * 0.7, r * 2)), col)
	draw_rect(Rect2(p - Vector2(r, r * 0.35), Vector2(r * 2, r * 0.7)), col)

func _draw_shield_icon(p: Vector2, r: float, col: Color) -> void:
	var pts := PackedVector2Array([p + Vector2(-r, -r), p + Vector2(r, -r), p + Vector2(r, 0.1 * r), p + Vector2(0, r * 1.2), p + Vector2(-r, 0.1 * r)])
	draw_colored_polygon(pts, col)
