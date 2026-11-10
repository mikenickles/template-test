class_name WeaponModels
## Procedural weapon meshes built from primitives (original designs).
## Convention: meters, forward = -Z, up = +Y, origin at the firing-hand
## grip. Each model exposes child nodes:
##   Muzzle (Marker3D), Eject (Marker3D), Fore (Marker3D, support hand),
##   optional Mag / Bolt / Pump / Slide nodes used by reload animations.

static var _mats: Dictionary = {}
static var _wear: NoiseTexture2D
static var _wear_rough: NoiseTexture2D

## Shared seamless noise used as a subtle worn finish (albedo variation +
## roughness breakup) on weapon materials.
static func _wear_tex(rough: bool) -> NoiseTexture2D:
	if rough and _wear_rough:
		return _wear_rough
	if not rough and _wear:
		return _wear
	var n := FastNoiseLite.new()
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.frequency = 0.035
	n.fractal_octaves = 5
	n.seed = 7 if rough else 3
	var t := NoiseTexture2D.new()
	t.width = 256
	t.height = 256
	t.seamless = true
	t.noise = n
	var g := Gradient.new()
	if rough:
		g.set_color(0, Color(0.55, 0.55, 0.55))
		g.set_color(1, Color(1.0, 1.0, 1.0))
	else:
		g.set_color(0, Color(0.78, 0.78, 0.78))
		g.set_color(1, Color(1.0, 1.0, 1.0))
	t.color_ramp = g
	if rough:
		_wear_rough = t
	else:
		_wear = t
	return t

static func mat(id: String) -> StandardMaterial3D:
	if _mats.has(id):
		return _mats[id]
	var m := StandardMaterial3D.new()
	match id:
		"gunmetal":
			m.albedo_color = Color(0.17, 0.175, 0.18)
			m.metallic = 0.8
			m.roughness = 0.38
		"blued":
			m.albedo_color = Color(0.08, 0.085, 0.095)
			m.metallic = 0.85
			m.roughness = 0.3
		"polymer":
			m.albedo_color = Color(0.055, 0.055, 0.06)
			m.roughness = 0.62
		"tan":
			m.albedo_color = Color(0.52, 0.43, 0.3)
			m.roughness = 0.68
		"olive":
			m.albedo_color = Color(0.24, 0.27, 0.19)
			m.roughness = 0.6
		"wood":
			m.albedo_color = Color(0.36, 0.21, 0.11)
			m.roughness = 0.5
			m.clearcoat_enabled = true
			m.clearcoat = 0.3
		"steel":
			m.albedo_color = Color(0.62, 0.63, 0.65)
			m.metallic = 0.95
			m.roughness = 0.22
		"brass":
			m.albedo_color = Color(0.78, 0.6, 0.28)
			m.metallic = 0.95
			m.roughness = 0.3
		"lens":
			m.albedo_color = Color(0.05, 0.12, 0.2)
			m.metallic = 0.6
			m.roughness = 0.05
		"red_dot":
			m.albedo_color = Color(1, 0.1, 0.05)
			m.emission_enabled = true
			m.emission = Color(1, 0.1, 0.05)
			m.emission_energy_multiplier = 4.0
		"led":
			m.albedo_color = Color(1, 0.15, 0.1)
			m.emission_enabled = true
			m.emission = Color(1, 0.12, 0.05)
			m.emission_energy_multiplier = 3.0
		"charge":
			m.albedo_color = Color(0.72, 0.68, 0.55)
			m.roughness = 0.8
		"tape":
			m.albedo_color = Color(0.15, 0.15, 0.16)
			m.roughness = 0.5
		_:
			m.albedo_color = Color.MAGENTA
	if id in ["gunmetal", "blued", "polymer", "tan", "olive", "wood", "steel", "charge"]:
		m.albedo_texture = _wear_tex(false)
		m.roughness_texture = _wear_tex(true)
		m.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_RED
		m.uv1_triplanar = true
		m.uv1_scale = Vector3(9, 9, 9)
		m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_mats[id] = m
	return m

static func _box(parent: Node3D, size: Vector3, pos: Vector3, material: String, rot_deg: Vector3 = Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = mat(material)
	mi.position = pos
	mi.rotation_degrees = rot_deg
	parent.add_child(mi)
	return mi

## Cylinder along local Z (barrels, tubes).
static func _tube(parent: Node3D, radius: float, length: float, center: Vector3, material: String, top_radius: float = -1.0, seg: int = 12) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.bottom_radius = radius
	cm.top_radius = radius if top_radius < 0.0 else top_radius
	cm.height = length
	cm.radial_segments = seg
	cm.rings = 1
	mi.mesh = cm
	mi.material_override = mat(material)
	mi.position = center
	mi.rotation_degrees = Vector3(90, 0, 0)
	parent.add_child(mi)
	return mi

static func _marker(parent: Node3D, n: String, pos: Vector3) -> Marker3D:
	var m := Marker3D.new()
	m.name = n
	m.position = pos
	parent.add_child(m)
	return m

static func _part(parent: Node3D, n: String, pos: Vector3 = Vector3.ZERO) -> Node3D:
	var p := Node3D.new()
	p.name = n
	p.position = pos
	parent.add_child(p)
	return p

static func build(model_id: StringName) -> Node3D:
	var root := Node3D.new()
	root.name = "Weapon_" + str(model_id)
	match model_id:
		&"ravager": _ravager(root)
		&"sentinel": _sentinel(root)
		&"vx9": _vx9(root)
		&"breacher12": _breacher(root)
		&"longbow": _longbow(root)
		&"p9": _pistol(root, false)
		&"hand_cannon": _pistol(root, true)
		&"knife": _knife(root)
		&"bomb": _bomb(root)
		_: _box(root, Vector3(0.05, 0.08, 0.4), Vector3(0, 0.03, -0.15), "polymer")
	return root

static func _ar_grip(root: Node3D, material: String) -> void:
	_box(root, Vector3(0.032, 0.11, 0.045), Vector3(0, -0.055, 0.005), material, Vector3(-16, 0, 0))
	# Trigger guard + trigger.
	_box(root, Vector3(0.012, 0.006, 0.07), Vector3(0, -0.035, -0.045), "gunmetal")
	_box(root, Vector3(0.006, 0.03, 0.006), Vector3(0, -0.02, -0.035), "steel", Vector3(15, 0, 0))

static func _ravager(root: Node3D) -> void:
	_box(root, Vector3(0.058, 0.085, 0.34), Vector3(0, 0.03, -0.1), "gunmetal")
	_box(root, Vector3(0.05, 0.022, 0.3), Vector3(0, 0.083, -0.1), "blued")
	_tube(root, 0.0125, 0.36, Vector3(0, 0.05, -0.45), "blued")
	_tube(root, 0.009, 0.24, Vector3(0, 0.083, -0.38), "gunmetal")
	_box(root, Vector3(0.062, 0.062, 0.22), Vector3(0, 0.042, -0.37), "tan")
	for i in 4:
		_box(root, Vector3(0.064, 0.008, 0.012), Vector3(0, 0.074, -0.29 - i * 0.05), "polymer")
	_tube(root, 0.02, 0.07, Vector3(0, 0.05, -0.665), "gunmetal")
	_box(root, Vector3(0.006, 0.035, 0.012), Vector3(0, 0.09, -0.6), "gunmetal")
	_box(root, Vector3(0.03, 0.02, 0.05), Vector3(0, 0.1, -0.03), "gunmetal")
	_ar_grip(root, "tan")
	_box(root, Vector3(0.045, 0.075, 0.27), Vector3(0, 0.005, 0.2), "tan", Vector3(4, 0, 0))
	_box(root, Vector3(0.048, 0.1, 0.03), Vector3(0, -0.005, 0.33), "polymer", Vector3(4, 0, 0))
	# Curved magazine built from three angled segments.
	var mag := _part(root, "Mag", Vector3(0, -0.01, -0.12))
	_box(mag, Vector3(0.03, 0.085, 0.07), Vector3(0, -0.04, 0.0), "polymer", Vector3(-8, 0, 0))
	_box(mag, Vector3(0.03, 0.08, 0.068), Vector3(0, -0.11, -0.022), "polymer", Vector3(-22, 0, 0))
	_box(mag, Vector3(0.03, 0.07, 0.064), Vector3(0, -0.17, -0.06), "polymer", Vector3(-36, 0, 0))
	var bolt := _part(root, "Bolt", Vector3(0.033, 0.055, -0.06))
	_box(bolt, Vector3(0.025, 0.012, 0.012), Vector3(0.012, 0, 0), "steel")
	_marker(root, "Muzzle", Vector3(0, 0.05, -0.71))
	_marker(root, "Eject", Vector3(0.035, 0.06, -0.08))
	_marker(root, "Fore", Vector3(0, 0.02, -0.36))

static func _sentinel(root: Node3D) -> void:
	_box(root, Vector3(0.055, 0.075, 0.3), Vector3(0, 0.03, -0.08), "polymer")
	_box(root, Vector3(0.024, 0.012, 0.42), Vector3(0, 0.074, -0.17), "gunmetal")
	for i in 14:
		_box(root, Vector3(0.026, 0.006, 0.008), Vector3(0, 0.083, 0.02 - i * 0.03), "gunmetal")
	_box(root, Vector3(0.06, 0.06, 0.25), Vector3(0, 0.038, -0.355), "polymer")
	for side in [-1.0, 1.0]:
		_box(root, Vector3(0.01, 0.012, 0.23), Vector3(side * 0.031, 0.038, -0.355), "gunmetal")
	_tube(root, 0.011, 0.2, Vector3(0, 0.04, -0.57), "blued")
	_tube(root, 0.017, 0.055, Vector3(0, 0.04, -0.69), "gunmetal")
	# Red-dot sight.
	_box(root, Vector3(0.034, 0.016, 0.06), Vector3(0, 0.088, -0.07), "gunmetal")
	_tube(root, 0.02, 0.045, Vector3(0, 0.112, -0.07), "polymer", -1.0, 14)
	_box(root, Vector3(0.004, 0.004, 0.002), Vector3(0, 0.112, -0.05), "red_dot")
	_ar_grip(root, "polymer")
	_tube(root, 0.013, 0.2, Vector3(0, 0.035, 0.15), "gunmetal")
	_box(root, Vector3(0.044, 0.085, 0.13), Vector3(0, 0.01, 0.24), "polymer")
	var mag := _part(root, "Mag", Vector3(0, -0.01, -0.11))
	_box(mag, Vector3(0.028, 0.17, 0.065), Vector3(0, -0.08, -0.008), "gunmetal", Vector3(-6, 0, 0))
	var bolt := _part(root, "Bolt", Vector3(0, 0.07, 0.07))
	_box(bolt, Vector3(0.04, 0.01, 0.02), Vector3.ZERO, "gunmetal")
	_marker(root, "Muzzle", Vector3(0, 0.04, -0.72))
	_marker(root, "Eject", Vector3(0.032, 0.05, -0.07))
	_marker(root, "Fore", Vector3(0, 0.0, -0.36))

static func _vx9(root: Node3D) -> void:
	_box(root, Vector3(0.05, 0.075, 0.27), Vector3(0, 0.035, -0.09), "polymer")
	_box(root, Vector3(0.044, 0.02, 0.24), Vector3(0, 0.08, -0.09), "gunmetal")
	_tube(root, 0.02, 0.12, Vector3(0, 0.045, -0.28), "gunmetal", -1.0, 10)
	_tube(root, 0.01, 0.06, Vector3(0, 0.045, -0.36), "blued")
	_box(root, Vector3(0.006, 0.02, 0.01), Vector3(0, 0.1, -0.2), "gunmetal")
	_box(root, Vector3(0.03, 0.025, 0.02), Vector3(0, 0.1, 0.02), "gunmetal")
	_ar_grip(root, "polymer")
	_box(root, Vector3(0.028, 0.06, 0.04), Vector3(0, -0.02, -0.22), "polymer", Vector3(-8, 0, 0))
	for side in [-1.0, 1.0]:
		_box(root, Vector3(0.006, 0.006, 0.2), Vector3(side * 0.02, 0.03, 0.13), "gunmetal")
	_box(root, Vector3(0.05, 0.05, 0.012), Vector3(0, 0.02, 0.23), "gunmetal")
	var mag := _part(root, "Mag", Vector3(0, -0.005, -0.12))
	_box(mag, Vector3(0.024, 0.2, 0.04), Vector3(0, -0.1, 0), "gunmetal", Vector3(-4, 0, 0))
	var bolt := _part(root, "Bolt", Vector3(-0.03, 0.06, -0.12))
	_box(bolt, Vector3(0.02, 0.012, 0.012), Vector3.ZERO, "steel")
	_marker(root, "Muzzle", Vector3(0, 0.045, -0.4))
	_marker(root, "Eject", Vector3(0.03, 0.06, -0.08))
	_marker(root, "Fore", Vector3(0, 0.0, -0.22))

static func _breacher(root: Node3D) -> void:
	_box(root, Vector3(0.055, 0.085, 0.22), Vector3(0, 0.03, -0.06), "gunmetal")
	_tube(root, 0.0135, 0.5, Vector3(0, 0.06, -0.42), "blued")
	_tube(root, 0.013, 0.42, Vector3(0, 0.025, -0.38), "blued")
	_box(root, Vector3(0.012, 0.03, 0.02), Vector3(0, 0.035, -0.62), "gunmetal")
	_box(root, Vector3(0.006, 0.012, 0.006), Vector3(0, 0.082, -0.66), "steel")
	_ar_grip(root, "wood")
	_box(root, Vector3(0.045, 0.085, 0.3), Vector3(0, 0.0, 0.2), "wood", Vector3(6, 0, 0))
	_box(root, Vector3(0.048, 0.1, 0.025), Vector3(0, -0.01, 0.36), "polymer", Vector3(6, 0, 0))
	var pump := _part(root, "Pump", Vector3(0, 0.025, -0.33))
	_box(pump, Vector3(0.05, 0.05, 0.15), Vector3.ZERO, "wood")
	for i in 5:
		_box(pump, Vector3(0.052, 0.006, 0.008), Vector3(0, 0.024, -0.06 + i * 0.03), "polymer")
	_marker(root, "Muzzle", Vector3(0, 0.06, -0.68))
	_marker(root, "Eject", Vector3(0.03, 0.055, -0.04))
	_marker(root, "Fore", Vector3(0, -0.005, -0.33))
	var mag := _part(root, "Mag", Vector3(0, -0.02, -0.08))
	_tube(mag, 0.011, 0.06, Vector3.ZERO, "brass")
	mag.visible = false

static func _longbow(root: Node3D) -> void:
	_box(root, Vector3(0.06, 0.08, 0.34), Vector3(0, 0.02, -0.12), "olive")
	_box(root, Vector3(0.05, 0.05, 0.2), Vector3(0, 0.055, -0.08), "gunmetal")
	_tube(root, 0.015, 0.62, Vector3(0, 0.055, -0.5), "blued", 0.012)
	_tube(root, 0.021, 0.08, Vector3(0, 0.055, -0.84), "gunmetal")
	_box(root, Vector3(0.062, 0.06, 0.28), Vector3(0, 0.035, -0.38), "olive")
	# Scope with rings.
	_tube(root, 0.019, 0.3, Vector3(0, 0.125, -0.1), "polymer", -1.0, 16)
	_tube(root, 0.028, 0.07, Vector3(0, 0.125, -0.27), "polymer", 0.019, 16)
	_tube(root, 0.024, 0.06, Vector3(0, 0.125, 0.07), "polymer", 0.019, 16)
	_tube(root, 0.026, 0.004, Vector3(0, 0.125, -0.305), "lens", -1.0, 16)
	_tube(root, 0.022, 0.004, Vector3(0, 0.125, 0.1), "lens", -1.0, 16)
	for z in [-0.17, 0.0]:
		_box(root, Vector3(0.03, 0.045, 0.02), Vector3(0, 0.095, z), "gunmetal")
	_box(root, Vector3(0.022, 0.03, 0.03), Vector3(0, 0.155, -0.11), "polymer")
	_ar_grip(root, "olive")
	_box(root, Vector3(0.05, 0.1, 0.32), Vector3(0, 0.0, 0.2), "olive", Vector3(3, 0, 0))
	_box(root, Vector3(0.045, 0.03, 0.14), Vector3(0, 0.065, 0.17), "polymer")
	_box(root, Vector3(0.052, 0.12, 0.025), Vector3(0, -0.005, 0.37), "polymer")
	var bolt := _part(root, "Bolt", Vector3(0.035, 0.06, 0.02))
	_box(bolt, Vector3(0.04, 0.012, 0.012), Vector3(0.02, 0, 0), "steel")
	_tube(bolt, 0.012, 0.02, Vector3(0.045, 0, 0), "polymer")
	var mag := _part(root, "Mag", Vector3(0, -0.02, -0.12))
	_box(mag, Vector3(0.03, 0.07, 0.08), Vector3(0, -0.03, 0), "gunmetal")
	_marker(root, "Muzzle", Vector3(0, 0.055, -0.89))
	_marker(root, "Eject", Vector3(0.035, 0.06, -0.06))
	_marker(root, "Fore", Vector3(0, 0.0, -0.38))

static func _pistol(root: Node3D, heavy: bool) -> void:
	var k := 1.25 if heavy else 1.0
	var slide := _part(root, "Slide", Vector3(0, 0.045 * k, -0.07 * k))
	_box(slide, Vector3(0.03 * k, 0.034 * k, 0.19 * k), Vector3.ZERO, "blued" if heavy else "polymer")
	for i in 6:
		_box(slide, Vector3(0.032 * k, 0.025 * k, 0.003), Vector3(0, 0, 0.075 * k - i * 0.007), "gunmetal")
	_box(slide, Vector3(0.006, 0.008, 0.008), Vector3(0, 0.021 * k, -0.088 * k), "steel")
	_box(slide, Vector3(0.016, 0.008, 0.008), Vector3(0, 0.021 * k, 0.085 * k), "steel")
	if heavy:
		_box(slide, Vector3(0.02, 0.012, 0.16), Vector3(0, 0.022, 0.0), "gunmetal")
	_box(root, Vector3(0.028 * k, 0.026 * k, 0.15 * k), Vector3(0, 0.018 * k, -0.06 * k), "polymer" if not heavy else "gunmetal")
	_box(root, Vector3(0.03 * k, 0.11 * k, 0.05 * k), Vector3(0, -0.035 * k, 0.0), "polymer", Vector3(-18, 0, 0))
	_box(root, Vector3(0.012, 0.006, 0.05 * k), Vector3(0, -0.005, -0.045 * k), "polymer")
	var mag := _part(root, "Mag", Vector3(0, -0.03 * k, 0.005))
	_box(mag, Vector3(0.024 * k, 0.1 * k, 0.04 * k), Vector3(0, -0.02, 0), "gunmetal", Vector3(-18, 0, 0))
	mag.visible = false
	_marker(root, "Muzzle", Vector3(0, 0.045 * k, -0.17 * k))
	_marker(root, "Eject", Vector3(0.02, 0.06 * k, -0.06))
	_marker(root, "Fore", Vector3(-0.01, -0.04, 0.01))

static func _knife(root: Node3D) -> void:
	_box(root, Vector3(0.026, 0.032, 0.11), Vector3(0, 0, 0.02), "polymer")
	for i in 5:
		_box(root, Vector3(0.028, 0.034, 0.004), Vector3(0, 0, -0.02 + i * 0.02), "tape")
	_box(root, Vector3(0.03, 0.06, 0.01), Vector3(0, 0.005, -0.04), "gunmetal")
	var blade := _part(root, "Blade", Vector3(0, 0.008, -0.13))
	_box(blade, Vector3(0.004, 0.032, 0.16), Vector3.ZERO, "steel")
	var tip := MeshInstance3D.new()
	var pm := PrismMesh.new()
	pm.size = Vector3(0.032, 0.05, 0.004)
	pm.left_to_right = 0.0
	tip.mesh = pm
	tip.material_override = mat("steel")
	tip.rotation_degrees = Vector3(-90, 0, 90)
	tip.position = Vector3(0, 0.0, -0.105)
	blade.add_child(tip)
	_marker(root, "Muzzle", Vector3(0, 0.01, -0.3))
	_marker(root, "Eject", Vector3.ZERO)
	_marker(root, "Fore", Vector3(-0.05, -0.05, 0.05))

static func _bomb(root: Node3D) -> void:
	_box(root, Vector3(0.17, 0.075, 0.12), Vector3(0, 0.0, -0.05), "charge")
	for z in [-0.08, -0.02]:
		_box(root, Vector3(0.175, 0.078, 0.02), Vector3(0, 0.0, z), "tape")
	_box(root, Vector3(0.07, 0.012, 0.06), Vector3(0.03, 0.043, -0.05), "polymer")
	_box(root, Vector3(0.05, 0.004, 0.02), Vector3(0.03, 0.05, -0.065), "lens")
	for i in 3:
		for j in 3:
			_box(root, Vector3(0.01, 0.004, 0.008), Vector3(0.015 + i * 0.014, 0.05, -0.045 + j * 0.011), "gunmetal")
	_box(root, Vector3(0.008, 0.006, 0.008), Vector3(-0.05, 0.043, -0.08), "led")
	for x in [-0.06, -0.04]:
		_tube(root, 0.004, 0.13, Vector3(x, 0.045, -0.05), "tape")
	_marker(root, "Muzzle", Vector3(0, 0, -0.15))
	_marker(root, "Eject", Vector3.ZERO)
	_marker(root, "Fore", Vector3(-0.06, -0.03, -0.05))
