class_name MatchHUD
extends Control
## Match-level HUD layered over PlayerHUD: round timer and scores, alive
## indicators, money (+ change popups), charge status and plant/defuse
## progress, kill feed, centre announcements, hints, MVP line and a radar.

const FEED_TIME := 6.0

var mm: MatchManager
var record: PlayerRecord
var _font: Font
var _feed: Array = [] # [{text parts..., time}]
var _announce := ""
var _announce_color := Color.WHITE
var _announce_t := 0.0
var _money_pops: Array = [] # [{amount, t}]
var _radar_tex: ImageTexture
var _hint := ""
var spectating: Combatant = null

func setup(p_match: MatchManager, p_record: PlayerRecord) -> void:
	mm = p_match
	record = p_record
	mm.kill_feed.connect(_on_kill)
	Events.announcement.connect(func(text: String, col: Color, dur: float): _announce = text; _announce_color = col; _announce_t = dur)
	Events.money_changed.connect(_on_money)
	Events.round_started.connect(func(n: int): _round_start_sound(n))
	Events.round_ended.connect(func(w: int, _r: int): _round_end_sound(w))
	Events.bomb_planted.connect(func(_p, _s, _pos): Audio.play_2d("ui/round_start", -10.0))
	_build_radar()

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sys := SystemFont.new()
	sys.font_names = PackedStringArray(["DejaVu Sans", "Noto Sans", "Arial", "sans-serif"])
	sys.font_weight = 700
	_font = sys

func _round_start_sound(_n: int) -> void:
	Audio.play_2d("ui/round_start", -6.0)

func _round_end_sound(winner: int) -> void:
	if record:
		Audio.play_2d("ui/round_win" if winner == record.team else "ui/round_lose", -4.0)

func _on_kill(killer: PlayerRecord, victim: PlayerRecord, weapon_id: StringName, headshot: bool, penetrated: bool) -> void:
	var w := WeaponDB.get_data(weapon_id)
	var wname := w.short_name if w else ("Charge" if weapon_id == &"bomb" else ("Fall" if weapon_id == &"fall" else str(weapon_id)))
	_feed.append({"killer": killer, "victim": victim, "weapon": wname, "hs": headshot, "pen": penetrated, "t": FEED_TIME})
	if _feed.size() > 6:
		_feed.pop_front()

func _on_money(r: RefCounted, _amount: int, delta: int, _reason: String) -> void:
	if r == record and delta != 0:
		_money_pops.append({"amount": delta, "t": 1.6})
		if delta > 0 and _reason != "buy":
			pass

func set_hint(text: String) -> void:
	_hint = text

func _process(delta: float) -> void:
	_announce_t = maxf(_announce_t - delta, 0.0)
	for f in _feed:
		f.t -= delta
	_feed = _feed.filter(func(f): return f.t > 0.0)
	for p in _money_pops:
		p.t -= delta
	_money_pops = _money_pops.filter(func(p): return p.t > 0.0)
	queue_redraw()

func _text(pos: Vector2, s: String, size_px: int, col: Color, align: int = HORIZONTAL_ALIGNMENT_LEFT, width: float = -1.0) -> void:
	draw_string(_font, pos + Vector2(2, 2), s, align, width, size_px, Color(0, 0, 0, 0.65 * col.a))
	draw_string(_font, pos, s, align, width, size_px, col)

func _draw() -> void:
	if mm == null:
		return
	var s := size
	var cx := s.x * 0.5
	_draw_top_bar(cx)
	_draw_feed(s)
	_draw_radar()
	# Money (bottom-left above the health panel).
	if record:
		var money_col := Color(0.55, 0.95, 0.5)
		_text(Vector2(28, s.y - 120), "$ %d" % record.money, 30, money_col)
		var y := s.y - 156.0
		for p in _money_pops:
			var a := clampf(p.t, 0.0, 1.0)
			var txt := ("+$%d" if p.amount > 0 else "-$%d") % absi(p.amount)
			_text(Vector2(28, y), txt, 22, Color(0.55, 0.95, 0.5, a) if p.amount > 0 else Color(1.0, 0.45, 0.35, a))
			y -= 26.0
	# Charge carrier / planted indicator.
	var bomb := mm.bomb
	if record and bomb.carrier and bomb.carrier == record.combatant:
		_text(Vector2(28, s.y - 190), "◆ YOU HAVE THE CHARGE", 18, GameConst.team_color(GameConst.Team.ATTACKERS))
	if bomb.is_planted():
		var frac := clampf(bomb.time_left / mm.cfg.bomb_timer, 0.0, 1.0)
		var bw := 260.0
		var r := Rect2(Vector2(cx - bw * 0.5, 74), Vector2(bw, 8))
		draw_rect(r, Color(0, 0, 0, 0.6))
		draw_rect(Rect2(r.position, Vector2(bw * frac, 8)), Color(1.0, 0.25, 0.15))
		_text(Vector2(cx - bw * 0.5, 104), "CHARGE PLANTED — SITE %s" % bomb.site, 16, Color(1.0, 0.45, 0.35), HORIZONTAL_ALIGNMENT_CENTER, bw)
	# Plant / defuse progress (centre).
	var prog := -1.0
	var label := ""
	if record and bomb.planter == record.combatant:
		prog = bomb.plant_progress / mm.cfg.plant_time
		label = "PLANTING"
	elif record and bomb.defuser == record.combatant:
		prog = bomb.defuse_fraction()
		label = "DEFUSING" + (" (KIT)" if record.combatant.has_defuse_kit else "")
	if prog >= 0.0:
		var pw := 320.0
		var pr := Rect2(Vector2(cx - pw * 0.5, s.y * 0.62), Vector2(pw, 10))
		draw_rect(pr.grow(3), Color(0, 0, 0, 0.6))
		draw_rect(Rect2(pr.position, Vector2(pw * clampf(prog, 0, 1), 10)), Color(0.95, 0.85, 0.4))
		_text(Vector2(cx - pw * 0.5, s.y * 0.62 - 10), label, 18, Color(0.95, 0.94, 0.9), HORIZONTAL_ALIGNMENT_CENTER, pw)
	# Announcement.
	if _announce_t > 0.0:
		var a := clampf(_announce_t * 2.0, 0.0, 1.0)
		var c := Color(_announce_color.r, _announce_color.g, _announce_color.b, a)
		draw_rect(Rect2(Vector2(0, s.y * 0.28 - 44), Vector2(s.x, 64)), Color(0, 0, 0, 0.45 * a))
		_text(Vector2(0, s.y * 0.28), _announce, 38, c, HORIZONTAL_ALIGNMENT_CENTER, s.x)
		if mm.phase == MatchManager.Phase.ROUND_END and mm.round_mvp:
			_text(Vector2(0, s.y * 0.28 + 40), "MVP: %s (%d kills)" % [mm.round_mvp.name, mm.round_mvp.round_kills], 20, Color(0.95, 0.9, 0.7, a), HORIZONTAL_ALIGNMENT_CENTER, s.x)
	# Hints and buy-time indicator.
	if _hint != "":
		_text(Vector2(0, s.y * 0.7), _hint, 20, Color(0.95, 0.94, 0.9), HORIZONTAL_ALIGNMENT_CENTER, s.x)
	if record and mm.can_buy(record) == "":
		_text(Vector2(28, s.y - 220), "B  BUY  (%ds)" % ceili(mm.buy_time_left()), 16, Color(0.9, 0.85, 0.6))
	if spectating and is_instance_valid(spectating):
		draw_rect(Rect2(Vector2(cx - 220, s.y - 150), Vector2(440, 50)), Color(0, 0, 0, 0.55))
		_text(Vector2(cx - 220, s.y - 116), "SPECTATING  %s   (%d HP)" % [spectating.display_name, ceili(spectating.health)], 20, GameConst.team_color(spectating.team), HORIZONTAL_ALIGNMENT_CENTER, 440)
	if mm.phase == MatchManager.Phase.FREEZE:
		_text(Vector2(0, s.y * 0.2), "ROUND %d — %s" % [mm.round_number, "PISTOL ROUND" if mm.is_pistol_round() else "BUY PHASE"], 26, Color(0.95, 0.94, 0.9), HORIZONTAL_ALIGNMENT_CENTER, s.x)

func _draw_top_bar(cx: float) -> void:
	var t := 0.0
	match mm.phase:
		MatchManager.Phase.FREEZE, MatchManager.Phase.LIVE, MatchManager.Phase.ROUND_END, MatchManager.Phase.HALFTIME:
			t = maxf(mm.phase_time, 0.0)
		MatchManager.Phase.PLANTED:
			t = maxf(mm.bomb.time_left, 0.0)
	var timer := "%d:%02d" % [int(t) / 60, int(t) % 60]
	var timer_col := Color(1.0, 0.35, 0.3) if mm.phase == MatchManager.Phase.PLANTED or (mm.phase == MatchManager.Phase.LIVE and t < 10.0) else Color(0.95, 0.94, 0.9)
	draw_rect(Rect2(Vector2(cx - 70, 12), Vector2(140, 50)), Color(0.04, 0.045, 0.05, 0.7))
	_text(Vector2(cx - 70, 50), timer if mm.phase != MatchManager.Phase.PLANTED else "◆ " + timer, 30, timer_col, HORIZONTAL_ALIGNMENT_CENTER, 140)
	var T := GameConst.Team.ATTACKERS
	var CT := GameConst.Team.DEFENDERS
	for side in [[T, -1], [CT, 1]]:
		var team: int = side[0]
		var dir: int = side[1]
		var col := GameConst.team_color(team)
		var box := Rect2(Vector2(cx + (80 if dir > 0 else -150), 12), Vector2(70, 50))
		draw_rect(box, Color(col.r * 0.25, col.g * 0.25, col.b * 0.25, 0.75))
		draw_rect(Rect2(box.position + Vector2(0, 46), Vector2(70, 4)), col)
		_text(Vector2(box.position.x, 50), str(mm.score[team]), 32, col, HORIZONTAL_ALIGNMENT_CENTER, 70)
		# Alive pips.
		var recs := mm.team_records(team)
		for i in recs.size():
			var alive: bool = recs[i].combatant.alive
			var x := cx + dir * (165 + i * 18) - (12 if dir < 0 else 0)
			var pip := Rect2(Vector2(x, 24), Vector2(12, 26))
			draw_rect(pip, col if alive else Color(0.2, 0.2, 0.2, 0.6))
			if recs[i] == record:
				draw_rect(pip.grow(2), Color(1, 1, 1, 0.8), false, 2.0)

func _draw_feed(s: Vector2) -> void:
	var y := 90.0
	for f in _feed:
		var a := clampf(f.t, 0.0, 1.0)
		var k: PlayerRecord = f.killer
		var v: PlayerRecord = f.victim
		var parts: Array = []
		if k and k != v:
			parts.append([k.name, GameConst.team_color(k.team)])
		parts.append(["  [%s%s%s]  " % [f.weapon, " ⊙" if f.hs else "", " ⇥" if f.pen else ""], Color(0.9, 0.9, 0.88)])
		parts.append([v.name if v else "?", GameConst.team_color(v.team) if v else Color.WHITE])
		var total := 0.0
		for p in parts:
			total += _font.get_string_size(p[0], HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
		var x := s.x - 24 - total
		var mine := record != null and (k == record or v == record)
		draw_rect(Rect2(Vector2(x - 10, y - 20), Vector2(total + 20, 27)), Color(0.6, 0.1, 0.1, 0.45 * a) if mine else Color(0, 0, 0, 0.45 * a))
		for p in parts:
			var col: Color = p[1]
			_text(Vector2(x, y), p[0], 17, Color(col.r, col.g, col.b, a))
			x += _font.get_string_size(p[0], HORIZONTAL_ALIGNMENT_LEFT, -1, 17).x
		y += 31.0

# ---------------------------------------------------------------------------
# Radar
# ---------------------------------------------------------------------------

const RADAR_SIZE := 230.0

func _build_radar() -> void:
	var info := mm.map.info
	var w := info.grid_size.x
	var h := info.grid_size.y
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for z in h:
		for x in w:
			var i := z * w + x
			if info.walkable[i] == 1:
				img.set_pixel(x, z, Color(0.36, 0.38, 0.38, 0.85))
			else:
				# Outline walls next to walkable space.
				var edge := false
				for d: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
					var nx := x + d.x
					var nz := z + d.y
					if nx >= 0 and nz >= 0 and nx < w and nz < h and info.walkable[nz * w + nx] == 1:
						edge = true
				if edge:
					img.set_pixel(x, z, Color(0.08, 0.08, 0.09, 0.9))
	for r: Rect2 in info.radar_raised:
		for z in range(int(r.position.y), int(r.end.y)):
			for x in range(int(r.position.x), int(r.end.x)):
				var px := x - info.grid_origin.x
				var pz := z - info.grid_origin.y
				if px >= 0 and pz >= 0 and px < w and pz < h:
					img.set_pixel(px, pz, Color(0.48, 0.5, 0.5, 0.9))
	for site in info.bombsites:
		var a: AABB = info.bombsites[site]
		for z in range(int(a.position.z), int(a.end.z)):
			for x in range(int(a.position.x), int(a.end.x)):
				var px := x - info.grid_origin.x
				var pz := z - info.grid_origin.y
				if px >= 0 and pz >= 0 and px < w and pz < h:
					var c := img.get_pixel(px, pz)
					img.set_pixel(px, pz, c.lerp(Color(0.85, 0.55, 0.15, 0.9), 0.35))
	_radar_tex = ImageTexture.create_from_image(img)

func _world_to_radar(p: Vector3, origin: Vector2, scale_k: float) -> Vector2:
	var info := mm.map.info
	return origin + Vector2(p.x - info.grid_origin.x, p.z - info.grid_origin.y) * scale_k

func _draw_radar() -> void:
	if _radar_tex == null:
		return
	var info := mm.map.info
	var scale_k := RADAR_SIZE / float(maxi(info.grid_size.x, info.grid_size.y))
	var origin := Vector2(16, 16)
	var rsz := Vector2(info.grid_size) * scale_k
	draw_rect(Rect2(origin - Vector2(4, 4), rsz + Vector2(8, 8)), Color(0, 0, 0, 0.45))
	draw_texture_rect(_radar_tex, Rect2(origin, rsz), false)
	for site in info.bombsites:
		var c := info.site_center(site)
		_text(_world_to_radar(c, origin, scale_k) + Vector2(-6, 6), String(site), 16, Color(0.95, 0.75, 0.3))
	var my_team := record.team if record else GameConst.Team.ATTACKERS
	var tactics: TeamTactics = mm.tactics.get(my_team)
	# Enemies spotted by the team in the last second.
	if tactics:
		for sg in tactics.recent_sightings(1.2):
			var e: Combatant = sg.enemy
			if is_instance_valid(e) and e.alive:
				draw_circle(_world_to_radar(e.global_position, origin, scale_k), 4.0, Color(1.0, 0.25, 0.2))
	for r in mm.team_records(my_team):
		var c := r.combatant
		if not c.alive:
			continue
		var p := _world_to_radar(c.global_position, origin, scale_k)
		var col := Color(1, 1, 1) if r == record else GameConst.team_color(my_team)
		draw_circle(p, 4.5 if r == record else 3.5, col)
		var f := Vector2(-sin(c.yaw), -cos(c.yaw))
		draw_line(p, p + f * 9.0, col, 2.0)
	var bomb := mm.bomb
	var show_bomb := my_team == GameConst.Team.ATTACKERS or bomb.is_planted()
	if show_bomb and bomb.state in [Bomb.State.DROPPED, Bomb.State.PLANTED, Bomb.State.CARRIED]:
		var bp := _world_to_radar(bomb.position_now(), origin, scale_k)
		var blink := bomb.state != Bomb.State.PLANTED or int(Time.get_ticks_msec() / 300) % 2 == 0
		if blink:
			draw_rect(Rect2(bp - Vector2(4, 4), Vector2(8, 8)), Color(1.0, 0.3, 0.15))
	if record:
		var callout := info.callout_at(record.combatant.global_position)
		_text(origin + Vector2(0, rsz.y + 22), callout, 16, Color(0.9, 0.9, 0.85))
