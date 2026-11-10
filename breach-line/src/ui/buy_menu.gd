class_name BuyMenu
extends Control
## Buy menu (B): categorised weapons and gear with prices; greys out items
## you can't afford or can't buy on your side; closes automatically when
## buying is no longer possible.

signal closed

const CATEGORIES := [
	["PISTOLS", [&"p9", &"hand_cannon"]],
	["SMG / SHOTGUN", [&"vx9", &"breacher12"]],
	["RIFLES", [&"ravager", &"sentinel"]],
	["SNIPER", [&"longbow"]],
	["GEAR", [&"kevlar", &"kevlar_helmet", &"defuse_kit"]],
]

var mm: MatchManager
var record: PlayerRecord
var _buttons: Dictionary = {}
var _money: Label
var _status: Label

func setup(p_match: MatchManager, p_record: PlayerRecord) -> void:
	mm = p_match
	record = p_record

func _ready() -> void:
	theme = UIStyle.theme()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.35)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(1080, 560)
	panel.position = Vector2(-540, -280)
	add_child(panel)
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 14)
	panel.add_child(root)
	var head := HBoxContainer.new()
	root.add_child(head)
	head.add_child(UIStyle.label("BUY", 34, UIStyle.ACCENT))
	var sp := Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(sp)
	_money = UIStyle.label("$0", 30, Color(0.55, 0.95, 0.5))
	head.add_child(_money)
	var cols := HBoxContainer.new()
	cols.add_theme_constant_override("separation", 14)
	cols.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(cols)
	for cat in CATEGORIES:
		var col := VBoxContainer.new()
		col.add_theme_constant_override("separation", 8)
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cols.add_child(col)
		col.add_child(UIStyle.label(cat[0], 16, UIStyle.DIM))
		for item: StringName in cat[1]:
			var b := UIStyle.button("", func(): _buy(item), Vector2(196, 62))
			b.alignment = HORIZONTAL_ALIGNMENT_LEFT
			col.add_child(b)
			_buttons[item] = b
	_status = UIStyle.label("", 18, UIStyle.DIM)
	root.add_child(_status)
	var close := UIStyle.button("CLOSE  (B / Esc)", func(): closed.emit())
	root.add_child(close)
	_refresh()

func _buy(item: StringName) -> void:
	var why := mm.try_buy(record, item)
	if why == "":
		Audio.play_2d("ui/buy_confirm", -6.0)
		_status.text = "Bought %s" % BuySystem.display_name(item)
	else:
		Audio.play_2d("ui/buy_deny", -6.0)
		_status.text = "Can't buy: %s" % why
	_refresh()

func _refresh() -> void:
	if record == null:
		return
	_money.text = "$ %d" % record.money
	for item in _buttons:
		var b: Button = _buttons[item]
		var price := BuySystem.price_of(item, record.combatant)
		var why := BuySystem.check(record, item)
		var team_lock := ""
		var d := WeaponDB.get_data(item)
		if d and d.team != 0 and d.team != record.team:
			team_lock = "  (%s)" % GameConst.team_name(d.team)
		elif BuySystem.GEAR.has(item) and BuySystem.GEAR[item].has("team") and BuySystem.GEAR[item].team != record.team:
			team_lock = "  (%s)" % GameConst.team_name(BuySystem.GEAR[item].team)
		b.text = "%s%s\n$%d%s" % [BuySystem.display_name(item), team_lock, price, "   ✓" if why == "already owned" else ""]
		b.disabled = why != ""

func _process(_delta: float) -> void:
	if mm and record:
		_refresh()
		var why := mm.can_buy(record)
		if why != "":
			closed.emit()
