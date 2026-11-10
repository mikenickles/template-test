class_name PauseMenu
extends Control
## Esc menu: pauses the match (single player), resume / settings / quit.

signal resume_requested
signal quit_requested

var _main: VBoxContainer
var _settings: SettingsPanel

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	theme = UIStyle.theme()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.55)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(760, 420)
	panel.position = Vector2(-380, -260)
	add_child(panel)
	var stack := VBoxContainer.new()
	panel.add_child(stack)
	_main = VBoxContainer.new()
	_main.add_theme_constant_override("separation", 12)
	_main.add_child(UIStyle.label("PAUSED", 34, UIStyle.ACCENT))
	_main.add_child(UIStyle.button("RESUME", func(): resume_requested.emit()))
	_main.add_child(UIStyle.button("SETTINGS", func(): _main.visible = false; _settings.visible = true))
	_main.add_child(UIStyle.button("QUIT TO MENU", func(): quit_requested.emit()))
	stack.add_child(_main)
	_settings = SettingsPanel.new()
	_settings.visible = false
	_settings.done.connect(func(): _settings.visible = false; _main.visible = true)
	stack.add_child(_settings)
