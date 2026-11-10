class_name Scoreboard
extends Control
## Tab scoreboard: both teams with K/A/D/score/MVPs, money for your team,
## alive state, round and score header.

var mm: MatchManager
var record: PlayerRecord

func setup(p_match: MatchManager, p_record: PlayerRecord) -> void:
	mm = p_match
	record = p_record

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func _process(_d: float) -> void:
	if visible:
		queue_redraw()

func _draw() -> void:
	if mm == null:
		return
	var f := UIStyle.font()
	var s := size
	var w := 900.0
	var x0 := (s.x - w) * 0.5
	var y := s.y * 0.14
	draw_rect(Rect2(Vector2(x0 - 16, y - 50), Vector2(w + 32, 600)), Color(0.04, 0.045, 0.05, 0.9))
	var T := GameConst.Team.ATTACKERS
	var CT := GameConst.Team.DEFENDERS
	draw_string(f, Vector2(x0, y - 12), "ROUND %d / %d   •   FIRST TO %d   •   %s" % [mm.round_number, mm.cfg.max_rounds, mm.cfg.rounds_to_win, map_name()], HORIZONTAL_ALIGNMENT_LEFT, -1, 18, UIStyle.DIM)
	for team in [CT, T]:
		var col := GameConst.team_color(team)
		draw_rect(Rect2(Vector2(x0, y), Vector2(w, 34)), Color(col.r * 0.3, col.g * 0.3, col.b * 0.3, 0.9))
		draw_string(f, Vector2(x0 + 10, y + 25), "%s   %d" % [GameConst.team_name(team).to_upper(), mm.score[team]], HORIZONTAL_ALIGNMENT_LEFT, -1, 22, col)
		var heads := ["MONEY", "K", "A", "D", "SCORE", "MVP"]
		var hx := [520.0, 640.0, 690.0, 740.0, 790.0, 860.0]
		for i in heads.size():
			draw_string(f, Vector2(x0 + hx[i], y + 24), heads[i], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, UIStyle.DIM)
		y += 40.0
		var recs := mm.team_records(team)
		recs.sort_custom(func(a: PlayerRecord, b: PlayerRecord): return a.score > b.score)
		for r in recs:
			var alive := r.combatant.alive
			var row_col := UIStyle.TEXT if alive else Color(0.55, 0.55, 0.53)
			if r == record:
				draw_rect(Rect2(Vector2(x0, y - 2), Vector2(w, 32)), Color(1, 1, 1, 0.06))
			var name_txt := r.name + ("" if r.is_bot else "  (you)")
			if mm.bomb.carrier == r.combatant and record and record.team == T:
				name_txt += "  ◆"
			draw_string(f, Vector2(x0 + 12, y + 22), name_txt if alive else "✕ " + name_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 19, row_col)
			var money_txt := ("$%d" % r.money) if record and r.team == record.team else ""
			var vals := [money_txt, str(r.kills), str(r.assists), str(r.deaths), str(r.score), "★%d" % r.mvps if r.mvps > 0 else ""]
			var vx := [520.0, 640.0, 690.0, 740.0, 790.0, 860.0]
			for i in vals.size():
				draw_string(f, Vector2(x0 + vx[i], y + 22), vals[i], HORIZONTAL_ALIGNMENT_LEFT, -1, 18, row_col)
			y += 34.0
		y += 16.0

func map_name() -> String:
	return mm.map.info.map_name.to_upper() if mm.map and mm.map.info else ""
