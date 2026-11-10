class_name SettingsPanel
extends VBoxContainer
## Settings controls shared by the main menu and the pause menu.

signal done

func _ready() -> void:
	add_theme_constant_override("separation", 10)
	add_child(UIStyle.label("SETTINGS", 30, UIStyle.ACCENT))
	_slider("Mouse sensitivity", 0.0003, 0.006, 0.0001, GameSettings.mouse_sensitivity, func(v): GameSettings.mouse_sensitivity = v, func(v): return "%.2f" % (v * 1000.0))
	_slider("Field of view", 60.0, 90.0, 1.0, GameSettings.fov, func(v): GameSettings.fov = v, func(v): return "%d°" % int(v))
	_slider("Master volume", 0.0, 1.0, 0.01, GameSettings.master_volume, func(v): GameSettings.master_volume = v; GameSettings.apply(), func(v): return "%d%%" % int(v * 100))
	_slider("Effects volume", 0.0, 1.0, 0.01, GameSettings.sfx_volume, func(v): GameSettings.sfx_volume = v; GameSettings.apply(), func(v): return "%d%%" % int(v * 100))
	_slider("Ambience volume", 0.0, 1.0, 0.01, GameSettings.ambience_volume, func(v): GameSettings.ambience_volume = v; GameSettings.apply(), func(v): return "%d%%" % int(v * 100))
	var row := HBoxContainer.new()
	row.add_child(_fixed(UIStyle.label("Graphics quality", 18), 260))
	var q := OptionButton.new()
	for n in ["Low", "Medium", "High", "Ultra"]:
		q.add_item(n)
	q.select(GameSettings.quality)
	q.item_selected.connect(func(i): GameSettings.quality = i)
	row.add_child(q)
	row.add_child(UIStyle.label("  (applies on next map load)", 14, UIStyle.DIM))
	add_child(row)
	var row2 := HBoxContainer.new()
	row2.add_child(_fixed(UIStyle.label("Bot difficulty", 18), 260))
	var d := OptionButton.new()
	for n in ["Easy", "Normal", "Hard", "Expert"]:
		d.add_item(n)
	d.select(GameSettings.bot_difficulty)
	d.item_selected.connect(func(i): GameSettings.bot_difficulty = i)
	row2.add_child(d)
	add_child(row2)
	var fs := CheckButton.new()
	fs.text = "Fullscreen"
	fs.button_pressed = GameSettings.fullscreen
	fs.toggled.connect(func(on): GameSettings.fullscreen = on; GameSettings.apply())
	add_child(fs)
	var inv := CheckButton.new()
	inv.text = "Invert mouse Y"
	inv.button_pressed = GameSettings.invert_y
	inv.toggled.connect(func(on): GameSettings.invert_y = on)
	add_child(inv)
	add_child(UIStyle.button("BACK", func(): GameSettings.save_settings(); done.emit()))

func _fixed(c: Control, w: float) -> Control:
	c.custom_minimum_size.x = w
	return c

func _slider(title: String, lo: float, hi: float, step: float, value: float, on_change: Callable, fmt: Callable) -> void:
	var row := HBoxContainer.new()
	row.add_child(_fixed(UIStyle.label(title, 18), 260))
	var s := HSlider.new()
	s.min_value = lo
	s.max_value = hi
	s.step = step
	s.value = value
	s.custom_minimum_size = Vector2(320, 24)
	var v := UIStyle.label(fmt.call(value), 18, UIStyle.DIM)
	s.value_changed.connect(func(x): on_change.call(x); v.text = fmt.call(x))
	row.add_child(s)
	row.add_child(v)
	add_child(row)
