class_name UIStyle
## Shared look for menus: dark translucent panels, amber accent, bold font.

const ACCENT := Color(0.93, 0.62, 0.22)
const TEXT := Color(0.95, 0.94, 0.9)
const DIM := Color(0.6, 0.6, 0.58)
const PANEL := Color(0.05, 0.055, 0.06, 0.88)

static var _font: Font
static var _theme: Theme

static func font() -> Font:
	if _font == null:
		var f := SystemFont.new()
		f.font_names = PackedStringArray(["DejaVu Sans", "Noto Sans", "Arial", "sans-serif"])
		f.font_weight = 700
		_font = f
	return _font

static func panel_box(col: Color = PANEL, radius: int = 6, border: Color = Color(1, 1, 1, 0.06)) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = col
	sb.set_corner_radius_all(radius)
	sb.border_color = border
	sb.set_border_width_all(1)
	sb.set_content_margin_all(12)
	return sb

static func theme() -> Theme:
	if _theme:
		return _theme
	var t := Theme.new()
	t.default_font = font()
	t.default_font_size = 18
	t.set_color("font_color", "Label", TEXT)
	t.set_color("font_color", "Button", TEXT)
	t.set_color("font_hover_color", "Button", Color(1, 1, 1))
	t.set_color("font_disabled_color", "Button", Color(0.45, 0.45, 0.43))
	t.set_stylebox("normal", "Button", panel_box(Color(0.12, 0.13, 0.14, 0.92), 4))
	t.set_stylebox("hover", "Button", panel_box(Color(0.2, 0.17, 0.12, 0.95), 4, ACCENT))
	t.set_stylebox("pressed", "Button", panel_box(Color(0.3, 0.2, 0.08, 0.95), 4, ACCENT))
	t.set_stylebox("disabled", "Button", panel_box(Color(0.08, 0.08, 0.09, 0.8), 4))
	t.set_stylebox("focus", "Button", panel_box(Color(0, 0, 0, 0), 4, ACCENT))
	t.set_stylebox("panel", "PanelContainer", panel_box())
	t.set_color("font_color", "CheckButton", TEXT)
	t.set_color("font_color", "OptionButton", TEXT)
	t.set_stylebox("normal", "OptionButton", panel_box(Color(0.12, 0.13, 0.14, 0.92), 4))
	t.set_stylebox("hover", "OptionButton", panel_box(Color(0.2, 0.17, 0.12, 0.95), 4, ACCENT))
	_theme = t
	return t

static func label(text: String, size_px: int = 18, col: Color = TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size_px)
	l.add_theme_color_override("font_color", col)
	return l

static func button(text: String, cb: Callable, min_size: Vector2 = Vector2(220, 44)) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = min_size
	b.pressed.connect(func(): Audio.play_2d("ui/click", -6.0); cb.call())
	b.mouse_entered.connect(func(): Audio.play_2d("ui/hover", -14.0))
	return b
