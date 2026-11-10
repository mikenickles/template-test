class_name EndScreen
extends Control
## Match result: winner, final score, top players, play again / menu.

signal play_again
signal to_menu

var mm: MatchManager
var record: PlayerRecord
var winner := 0

func setup(p_match: MatchManager, p_record: PlayerRecord, p_winner: int) -> void:
	mm = p_match
	record = p_record
	winner = p_winner

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	theme = UIStyle.theme()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.6)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(720, 360)
	panel.position = Vector2(-360, -220)
	add_child(panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	panel.add_child(v)
	var won := record != null and winner == record.team
	var title := "DRAW" if winner == 0 else ("VICTORY" if won else "DEFEAT") if record else "%s WIN" % GameConst.team_name(winner).to_upper()
	v.add_child(UIStyle.label(title, 48, UIStyle.ACCENT if won or winner == 0 else Color(0.9, 0.35, 0.3)))
	var T := GameConst.Team.ATTACKERS
	var CT := GameConst.Team.DEFENDERS
	v.add_child(UIStyle.label("%s  %d  —  %d  %s" % [GameConst.team_name(T), mm.score[T], mm.score[CT], GameConst.team_name(CT)], 26))
	var best: PlayerRecord = null
	for r in mm.records:
		if best == null or r.score > best.score:
			best = r
	if best:
		v.add_child(UIStyle.label("Match MVP: %s — %d kills, %d deaths" % [best.name, best.kills, best.deaths], 20, UIStyle.DIM))
	if record:
		v.add_child(UIStyle.label("You: %d kills, %d assists, %d deaths, %d MVPs" % [record.kills, record.assists, record.deaths, record.mvps], 20, UIStyle.DIM))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	row.add_child(UIStyle.button("PLAY AGAIN", func(): play_again.emit()))
	row.add_child(UIStyle.button("MAIN MENU", func(): to_menu.emit()))
	v.add_child(row)
	Audio.play_2d("ui/match_win" if won else "ui/match_lose", -4.0)
