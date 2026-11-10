class_name MapProps
## Reusable prefab props assembled from MapBuilder primitives.
## Positions are the centre of the prop's footprint at its base height.
## `yaw` is in degrees around +Y.

static func _xf(base: Vector3, yaw: float, local: Vector3) -> Transform3D:
	var basis := Basis(Vector3.UP, deg_to_rad(yaw))
	return Transform3D(basis, base + basis * local)

## Wooden shipping crate (cube by default).
static func crate(b: MapBuilder, base: Vector3, size: Vector3 = Vector3(1.15, 1.15, 1.15), yaw: float = 0.0, mat: String = "wood") -> void:
	b.box_xf(_xf(base, yaw, Vector3(0, size.y * 0.5, 0)), size, mat, {"uv": "local", "tint_var": 0.1})
	# Darker frame battens on the vertical edges add silhouette detail.
	var t := 0.06
	for sx: float in [-1, 1]:
		for sz: float in [-1, 1]:
			var p := Vector3(sx * (size.x * 0.5 - t * 0.5 + 0.01), size.y * 0.5, sz * (size.z * 0.5 - t * 0.5 + 0.01))
			b.box_xf(_xf(base, yaw, p), Vector3(t + 0.02, size.y, t + 0.02), "wood_dark", {"collide": false, "uv": "local"})

## Two-high crate stack with a small offset for a hand-placed look.
static func crate_stack(b: MapBuilder, base: Vector3, yaw: float = 0.0, top_offset: Vector2 = Vector2(0.05, -0.04)) -> void:
	crate(b, base, Vector3(1.15, 1.1, 1.15), yaw)
	crate(b, base + Vector3(top_offset.x, 1.1, top_offset.y), Vector3(1.1, 1.1, 1.1), yaw + 4.0)

## Standard 20 ft (6.06 m) or 40 ft (12.19 m) shipping container.
static func container(b: MapBuilder, base: Vector3, yaw: float, mat: String, length: float = 6.06) -> void:
	var w := 2.44
	var h := 2.59
	b.box_xf(_xf(base, yaw, Vector3(0, h * 0.5, 0)), Vector3(w, h, length), mat, {"uv": "local", "tint_var": 0.06})
	# Ribs along the long sides (corrugation silhouette).
	var ribs := int(length / 0.6)
	for i in ribs:
		var z := -length * 0.5 + 0.35 + i * (length - 0.7) / maxf(ribs - 1, 1)
		for sx: float in [-1, 1]:
			b.box_xf(_xf(base, yaw, Vector3(sx * (w * 0.5 + 0.02), h * 0.5, z)), Vector3(0.05, h - 0.3, 0.12), mat, {"collide": false, "ao": false, "uv": "local"})
	# Corner posts / castings and door locking bars.
	for sx: float in [-1, 1]:
		for sz: float in [-1, 1]:
			b.box_xf(_xf(base, yaw, Vector3(sx * (w * 0.5 - 0.06), h * 0.5, sz * (length * 0.5 - 0.06))), Vector3(0.16, h + 0.02, 0.16), "steel", {"collide": false})
	for i in 4:
		var x := -0.8 + i * 0.53
		b.box_xf(_xf(base, yaw, Vector3(x, h * 0.5, length * 0.5 + 0.04)), Vector3(0.05, h - 0.25, 0.05), "steel", {"collide": false, "ao": false})

static func barrel(b: MapBuilder, base: Vector3, mat: String = "rust") -> void:
	b.cylinder(Transform3D(Basis(), base + Vector3(0, 0.45, 0)), 0.3, 0.9, mat, {"segments": 14})
	for y: float in [0.18, 0.72]:
		b.cylinder(Transform3D(Basis(), base + Vector3(0, y, 0)), 0.315, 0.04, mat, {"segments": 14, "collide": false})

static func barrel_group(b: MapBuilder, base: Vector3, count: int, mat: String = "rust") -> void:
	var offs := [Vector3(0, 0, 0), Vector3(0.66, 0, 0.1), Vector3(0.3, 0, 0.62), Vector3(-0.4, 0, 0.55)]
	for i in mini(count, offs.size()):
		barrel(b, base + offs[i], mat if i % 2 == 0 else "steel_yellow" if mat == "rust" else mat)

static func pallet(b: MapBuilder, base: Vector3, yaw: float = 0.0, stacked: int = 1) -> void:
	for i in stacked:
		var y := i * 0.15
		b.box_xf(_xf(base, yaw, Vector3(0, y + 0.13, 0)), Vector3(1.2, 0.03, 1.0), "wood", {"uv": "local", "collide": false})
		for z: float in [-0.42, 0.0, 0.42]:
			b.box_xf(_xf(base, yaw, Vector3(0, y + 0.06, z)), Vector3(1.2, 0.1, 0.1), "wood_dark", {"uv": "local", "collide": false})
	b.box_xf(_xf(base, yaw, Vector3(0, stacked * 0.075, 0)), Vector3(1.2, stacked * 0.15, 1.0), "wood", {"visible": false})

## Pallet loaded with sacks / ingots: low cover (~0.95 m).
static func loaded_pallet(b: MapBuilder, base: Vector3, yaw: float = 0.0, mat: String = "steel") -> void:
	pallet(b, base, yaw)
	b.box_xf(_xf(base, yaw, Vector3(0, 0.15 + 0.4, 0)), Vector3(1.1, 0.8, 0.92), mat, {"uv": "local", "tint_var": 0.08})

static func jersey_barrier(b: MapBuilder, base: Vector3, yaw: float, length: float = 2.0) -> void:
	b.box_xf(_xf(base, yaw, Vector3(0, 0.2, 0)), Vector3(length, 0.4, 0.6), "concrete_wall", {"uv": "local"})
	b.box_xf(_xf(base, yaw, Vector3(0, 0.6, 0)), Vector3(length, 0.4, 0.32), "concrete_wall", {"uv": "local"})

static func dumpster(b: MapBuilder, base: Vector3, yaw: float) -> void:
	b.box_xf(_xf(base, yaw, Vector3(0, 0.75, 0)), Vector3(1.9, 1.3, 1.2), "container_green", {"uv": "local"})
	b.box_xf(_xf(base, yaw, Vector3(0, 1.43, -0.05)), Vector3(1.95, 0.06, 1.3), "rubber", {"collide": false})
	for sx: float in [-0.8, 0.8]:
		for sz: float in [-0.45, 0.45]:
			b.box_xf(_xf(base, yaw, Vector3(sx, 0.05, sz)), Vector3(0.12, 0.1, 0.12), "rubber", {"collide": false})

## Freight boxcar sitting on rails. Body floor at 1.05 m.
static func boxcar(b: MapBuilder, base: Vector3, yaw: float, length: float = 14.0, mat: String = "container_red") -> void:
	var w := 2.9
	var floor_y := 1.05
	var h := 3.0
	b.box_xf(_xf(base, yaw, Vector3(0, floor_y + h * 0.5, 0)), Vector3(w, h, length), mat, {"uv": "local", "tint_var": 0.04})
	b.box_xf(_xf(base, yaw, Vector3(0, floor_y + h + 0.08, 0)), Vector3(w + 0.1, 0.16, length + 0.1), "rust", {"uv": "local", "collide": false})
	# Underframe and bogies (block bullets/movement under the car).
	b.box_xf(_xf(base, yaw, Vector3(0, floor_y * 0.55, 0)), Vector3(w - 0.6, floor_y * 0.5, length - 1.0), "rail", {"uv": "local"})
	for sz: float in [-1, 1]:
		var z := sz * (length * 0.5 - 2.0)
		b.box_xf(_xf(base, yaw, Vector3(0, 0.5, z)), Vector3(w - 0.4, 0.6, 2.6), "rail", {"uv": "local"})
		for wz: float in [-0.75, 0.75]:
			for sx: float in [-1, 1]:
				b.cylinder(_xf(base, yaw, Vector3(sx * 0.78, 0.42, z + wz)) * Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3.ZERO), 0.42, 0.14, "rail", {"collide": false, "segments": 12})
	# Sliding door with rails and ribs.
	for sx: float in [-1, 1]:
		b.box_xf(_xf(base, yaw, Vector3(sx * (w * 0.5 + 0.04), floor_y + h * 0.48, 0.0)), Vector3(0.06, h * 0.85, 3.0), "rust", {"collide": false, "uv": "local"})
		for i in 7:
			var z := -length * 0.5 + 0.6 + i * (length - 1.2) / 6.0
			b.box_xf(_xf(base, yaw, Vector3(sx * (w * 0.5 + 0.03), floor_y + h * 0.5, z)), Vector3(0.05, h - 0.1, 0.1), mat, {"collide": false, "ao": false, "uv": "local"})

static func rails(b: MapBuilder, start: Vector3, end: Vector3, gauge: float = 1.45) -> void:
	var dir := (end - start)
	var length := dir.length()
	var yaw := atan2(dir.x, dir.z)
	var basis := Basis(Vector3.UP, yaw)
	var mid := (start + end) * 0.5
	for s: float in [-1, 1]:
		b.box_xf(Transform3D(basis, mid + basis * Vector3(s * gauge * 0.5, 0.07, 0)), Vector3(0.08, 0.14, length), "rail", {"collide": false, "ao": false})
	var n := int(length / 0.65)
	for i in n:
		var z := -length * 0.5 + 0.3 + i * 0.65
		b.box_xf(Transform3D(basis, mid + basis * Vector3(0, 0.02, z)), Vector3(gauge + 0.7, 0.05, 0.24), "wood_dark", {"collide": false, "ao": false, "uv": "local"})

## Flatbed semi trailer: deck at ~1.3 m with open underside.
static func flatbed(b: MapBuilder, base: Vector3, yaw: float, length: float = 9.0) -> void:
	b.box_xf(_xf(base, yaw, Vector3(0, 1.12, 0)), Vector3(2.5, 0.32, length), "steel", {"uv": "local"})
	b.box_xf(_xf(base, yaw, Vector3(0, 1.3, 0)), Vector3(2.45, 0.05, length - 0.1), "wood_dark", {"uv": "local", "collide": false})
	for sz in [length * 0.5 - 1.0, length * 0.5 - 2.2]:
		for sx: float in [-0.95, 0.95]:
			b.cylinder(_xf(base, yaw, Vector3(sx, 0.48, sz)) * Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3.ZERO), 0.48, 0.36, "rubber", {"segments": 14})
	for sx: float in [-0.7, 0.7]:
		b.box_xf(_xf(base, yaw, Vector3(sx, 0.48, -length * 0.5 + 2.0)), Vector3(0.12, 0.96, 0.12), "steel", {"collide": false})
	# Cargo: strapped steel plate stack and a crate on the deck.
	b.box_xf(_xf(base, yaw, Vector3(0, 1.55, length * 0.18)), Vector3(2.1, 0.45, 2.6), "rust", {"uv": "local"})
	b.box_xf(_xf(base, yaw, Vector3(0.05, 1.86, length * 0.18 + 0.1)), Vector3(1.9, 0.18, 2.3), "steel", {"uv": "local"})
	for sz: float in [-0.7, 0.7]:
		b.box_xf(_xf(base, yaw, Vector3(0, 1.62, length * 0.18 + sz)), Vector3(2.14, 0.6, 0.05), "steel_yellow", {"collide": false, "ao": false})
	crate(b, base + Basis(Vector3.UP, deg_to_rad(yaw)) * Vector3(0.2, 1.33, -length * 0.25), Vector3(1.6, 1.2, 1.4), yaw + 3)

static func forklift(b: MapBuilder, base: Vector3, yaw: float) -> void:
	b.box_xf(_xf(base, yaw, Vector3(0, 0.75, 0.2)), Vector3(1.15, 1.0, 2.0), "steel_yellow", {"uv": "local"})
	b.box_xf(_xf(base, yaw, Vector3(0, 1.75, 0.35)), Vector3(1.1, 0.06, 1.2), "steel", {"collide": false})
	for sx: float in [-0.5, 0.5]:
		for sz: float in [-0.2, 0.75]:
			b.box_xf(_xf(base, yaw, Vector3(sx, 1.25, sz)), Vector3(0.06, 1.0, 0.06), "steel", {"collide": false})
	b.box_xf(_xf(base, yaw, Vector3(0, 1.3, -0.95)), Vector3(0.9, 2.6, 0.12), "steel", {"uv": "local"})
	for sx: float in [-0.3, 0.3]:
		b.box_xf(_xf(base, yaw, Vector3(sx, 0.08, -1.55)), Vector3(0.12, 0.05, 1.1), "steel", {"collide": false})
	for sx: float in [-0.62, 0.62]:
		for sz: float in [-0.4, 0.85]:
			b.cylinder(_xf(base, yaw, Vector3(sx, 0.3, sz)) * Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3.ZERO), 0.3, 0.22, "rubber", {"collide": false, "segments": 12})

static func pipe(b: MapBuilder, a: Vector3, c: Vector3, radius: float, mat: String = "rust", collide: bool = false) -> void:
	var d := c - a
	var length := d.length()
	var y := d.normalized()
	var x := y.cross(Vector3.UP if absf(y.y) < 0.9 else Vector3.RIGHT).normalized()
	var z := x.cross(y).normalized()
	b.cylinder(Transform3D(Basis(x, y, z), (a + c) * 0.5), radius, length, mat, {"collide": collide, "segments": 10})

## Ceiling fluorescent fixture with a light. `along_x` sets orientation.
static func tube_light(b: MapBuilder, pos: Vector3, along_x: bool, color: Color = Color(0.85, 0.92, 1.0), energy: float = 1.1, light_range: float = 8.0, mat: String = "lamp_cool") -> void:
	var size := Vector3(1.3, 0.06, 0.18) if along_x else Vector3(0.18, 0.06, 1.3)
	b.box_xf(Transform3D(Basis(), pos + Vector3(0, 0.05, 0)), size + Vector3(0.06, 0.04, 0.06), "steel", {"collide": false, "ao": false})
	b.box_xf(Transform3D(Basis(), pos), size, mat, {"collide": false, "ao": false})
	b.omni(pos + Vector3(0, -0.25, 0), color, energy, light_range, {"attenuation": 1.4})

## Wall-mounted lamp casting light downward/outward.
static func wall_lamp(b: MapBuilder, pos: Vector3, facing: Vector3, color: Color = Color(1.0, 0.8, 0.55), energy: float = 2.0, shadow: bool = false) -> void:
	var yaw := atan2(facing.x, facing.z)
	var basis := Basis(Vector3.UP, yaw)
	b.box_xf(Transform3D(basis, pos + basis * Vector3(0, 0.1, -0.12)), Vector3(0.35, 0.12, 0.3), "steel", {"collide": false, "ao": false})
	b.box_xf(Transform3D(basis, pos + basis * Vector3(0, 0.02, -0.12)), Vector3(0.28, 0.04, 0.22), "lamp_warm", {"collide": false, "ao": false})
	b.spot(pos + facing * 0.1, (facing * 0.6 + Vector3.DOWN).normalized(), color, energy, 11.0, 55.0, {"shadow": shadow})

## Window decal-like inset on a wall face. `normal` points out of the wall.
static func window(b: MapBuilder, center: Vector3, normal: Vector3, w: float, h: float, lit: bool = false) -> void:
	var yaw := atan2(normal.x, normal.z)
	var basis := Basis(Vector3.UP, yaw)
	var depth := 0.06
	b.box_xf(Transform3D(basis, center + normal * 0.005), Vector3(w, h, 0.02), "glass_lit" if lit else "glass", {"collide": false, "ao": false})
	var f := 0.08
	b.box_xf(Transform3D(basis, center + basis * Vector3(0, h * 0.5 + f * 0.5, depth * 0.5)), Vector3(w + f * 2, f, depth), "steel", {"collide": false, "ao": false})
	b.box_xf(Transform3D(basis, center + basis * Vector3(0, -h * 0.5 - f * 0.5, depth)), Vector3(w + f * 2, f, depth * 2.5), "concrete_wall", {"collide": false, "ao": false})
	for sx: float in [-1, 1]:
		b.box_xf(Transform3D(basis, center + basis * Vector3(sx * (w * 0.5 + f * 0.5), 0, depth * 0.5)), Vector3(f, h, depth), "steel", {"collide": false, "ao": false})
	b.box_xf(Transform3D(basis, center + basis * Vector3(0, 0, depth * 0.5)), Vector3(0.04, h, depth * 0.6), "steel", {"collide": false, "ao": false})
	b.box_xf(Transform3D(basis, center + basis * Vector3(0, h * 0.15, depth * 0.5)), Vector3(w, 0.04, depth * 0.6), "steel", {"collide": false, "ao": false})

## Row of windows along a wall line from a to c (y = window centre).
static func window_row(b: MapBuilder, a: Vector3, c: Vector3, normal: Vector3, count: int, w: float, h: float, lit_every: int = 0) -> void:
	for i in count:
		var t := (i + 0.5) / count
		window(b, a.lerp(c, t), normal, w, h, lit_every > 0 and i % lit_every == 1)

## Closed (decorative) door on a wall: `normal` points out of the wall.
static func wall_door(b: MapBuilder, base: Vector3, normal: Vector3, w: float = 1.1, h: float = 2.2, mat: String = "steel") -> void:
	var yaw := atan2(normal.x, normal.z)
	var basis := Basis(Vector3.UP, yaw)
	b.box_xf(Transform3D(basis, base + Vector3(0, h * 0.5, 0) + normal * 0.03), Vector3(w, h, 0.06), mat, {"collide": false, "uv": "local", "ao": false})
	b.box_xf(Transform3D(basis, base + Vector3(0, h + 0.06, 0) + normal * 0.05), Vector3(w + 0.2, 0.12, 0.1), "concrete_wall", {"collide": false, "ao": false})
	b.box_xf(Transform3D(basis, base + basis * Vector3(w * 0.35, h * 0.48, 0) + normal * 0.08), Vector3(0.05, 0.18, 0.04), "steel", {"collide": false, "ao": false})

## Steel railing (visual) with a player-clip blocker.
static func railing(b: MapBuilder, a: Vector3, c: Vector3, height: float = 1.05) -> void:
	var d := c - a
	var length := d.length()
	var yaw := atan2(d.x, d.z)
	var basis := Basis(Vector3.UP, yaw)
	var mid := (a + c) * 0.5
	b.box_xf(Transform3D(basis, mid + Vector3(0, height, 0)), Vector3(0.06, 0.06, length), "steel_yellow", {"collide": false, "ao": false})
	b.box_xf(Transform3D(basis, mid + Vector3(0, height * 0.5, 0)), Vector3(0.04, 0.04, length), "steel_yellow", {"collide": false, "ao": false})
	var posts := int(length / 1.5) + 1
	for i in posts + 1:
		var p := a.lerp(c, float(i) / posts)
		b.box_xf(Transform3D(basis, p + Vector3(0, height * 0.5, 0)), Vector3(0.06, height, 0.06), "steel_yellow", {"collide": false, "ao": false})
	var n := Vector3(d.z, 0, -d.x).normalized() * 0.12
	b.clip(a - n + Vector3(0, 0, 0), c + n + Vector3(0, height + 0.6, 0))

static func i_beam(b: MapBuilder, a: Vector3, c: Vector3, depth: float = 0.4, mat: String = "steel") -> void:
	var d := c - a
	var length := d.length()
	var y := d.normalized()
	var up := Vector3.UP if absf(y.y) < 0.9 else Vector3.FORWARD
	var x := up.cross(y).normalized()
	var z := y.cross(x).normalized()
	# Local Z = beam length axis for box_xf convenience.
	var basis := Basis(x, z, y)
	var mid := (a + c) * 0.5
	b.box_xf(Transform3D(basis, mid), Vector3(0.05, depth, length), mat, {"collide": false, "ao": false})
	for s: float in [-1, 1]:
		b.box_xf(Transform3D(basis, mid + basis.y * (s * depth * 0.5)), Vector3(depth * 0.55, 0.04, length), mat, {"collide": false, "ao": false})

## Electrical cabinet / AC unit clutter on walls or floors.
static func cabinet(b: MapBuilder, base: Vector3, yaw: float, size: Vector3 = Vector3(0.9, 1.6, 0.45), mat: String = "paint_white") -> void:
	b.box_xf(_xf(base, yaw, Vector3(0, size.y * 0.5, 0)), size, mat, {"uv": "local"})
	b.box_xf(_xf(base, yaw, Vector3(0, size.y * 0.5, size.z * 0.5 + 0.01)), Vector3(size.x * 0.02, size.y * 0.9, 0.02), "steel", {"collide": false, "ao": false})

static func shelf(b: MapBuilder, base: Vector3, yaw: float, length: float = 2.4, height: float = 2.2) -> void:
	var depth := 0.6
	for sx: float in [-1, 1]:
		for sz: float in [-1, 1]:
			b.box_xf(_xf(base, yaw, Vector3(sx * (length * 0.5 - 0.04), height * 0.5, sz * (depth * 0.5 - 0.04))), Vector3(0.06, height, 0.06), "steel_yellow", {"collide": false})
	for i in 4:
		var y := 0.15 + i * (height - 0.2) / 3.0
		b.box_xf(_xf(base, yaw, Vector3(0, y, 0)), Vector3(length, 0.04, depth), "steel", {"collide": false, "ao": false})
		if i < 3:
			for k in 3:
				var bx := -length * 0.33 + k * length * 0.33 + (0.1 if i % 2 == 0 else -0.1)
				b.box_xf(_xf(base, yaw, Vector3(bx, y + 0.2, 0)), Vector3(0.45, 0.38, 0.45), "wood" if (i + k) % 2 == 0 else "paint_white", {"collide": false, "uv": "local", "ao": false, "tint_var": 0.15})
	b.box_xf(_xf(base, yaw, Vector3(0, height * 0.5, 0)), Vector3(length, height, depth), "steel", {"visible": false})

static func workbench(b: MapBuilder, base: Vector3, yaw: float, length: float = 2.0) -> void:
	b.box_xf(_xf(base, yaw, Vector3(0, 0.88, 0)), Vector3(length, 0.08, 0.8), "wood_dark", {"uv": "local"})
	for sx: float in [-1, 1]:
		b.box_xf(_xf(base, yaw, Vector3(sx * (length * 0.5 - 0.1), 0.42, 0)), Vector3(0.1, 0.84, 0.7), "steel", {"uv": "local"})
	b.box_xf(_xf(base, yaw, Vector3(0, 1.1, -0.1)), Vector3(0.5, 0.35, 0.35), "paint_white", {"collide": false, "uv": "local"})

## Big machine block (press / lathe) with a hazard-striped base.
static func machine(b: MapBuilder, base: Vector3, size: Vector3, yaw: float, mat: String = "container_green") -> void:
	b.box_xf(_xf(base, yaw, Vector3(0, 0.12, 0)), Vector3(size.x + 0.3, 0.24, size.z + 0.3), "hazard", {"uv": "local"})
	b.box_xf(_xf(base, yaw, Vector3(0, 0.24 + (size.y - 0.24) * 0.5, 0)), Vector3(size.x, size.y - 0.24, size.z), mat, {"uv": "local"})
	b.box_xf(_xf(base, yaw, Vector3(0, size.y + 0.3, -size.z * 0.2)), Vector3(size.x * 0.6, 0.6, size.z * 0.4), "steel", {"uv": "local"})
	b.box_xf(_xf(base, yaw, Vector3(size.x * 0.3, size.y * 0.6, size.z * 0.5 + 0.03)), Vector3(0.4, 0.5, 0.06), "paint_white", {"collide": false})
