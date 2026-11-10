class_name MapMaterials
extends RefCounted
## Registry of world materials used by the map builder.
##
## Each entry names a texture set in res://assets/textures/<tex>/ and the
## real-world size (meters) one texture tile covers. Map meshes carry UVs in
## meters, so `uv1_scale = 1 / tile` gives consistent texel density. When a
## texture set is missing the material falls back to a flat colour so the map
## still builds (useful in CI and while assets are regenerated).

const TEX_ROOT := "res://assets/textures/"

## id -> definition. Keys: tex, tile, tint, rough, metal, normal, surface,
## emission, emission_energy, transparent.
const DEFS := {
	"concrete_floor": {"tex": "concrete_floor", "tile": 4.0, "tint": Color(0.92, 0.91, 0.89), "surface": "concrete"},
	"concrete_wall": {"tex": "concrete_wall", "tile": 4.0, "tint": Color(0.9, 0.9, 0.88), "surface": "concrete"},
	"concrete_top": {"tex": "concrete_wall", "tile": 4.0, "tint": Color(0.62, 0.62, 0.6), "surface": "concrete"},
	"concrete_dark": {"tex": "concrete_wall", "tile": 4.0, "tint": Color(0.55, 0.55, 0.54), "surface": "concrete"},
	"brick_red": {"tex": "brick_red", "tile": 3.0, "tint": Color(1, 1, 1), "surface": "brick"},
	"brick_dark": {"tex": "brick_dark", "tile": 3.0, "tint": Color(1, 1, 1), "surface": "brick"},
	"asphalt": {"tex": "asphalt", "tile": 5.0, "tint": Color(0.95, 0.95, 0.95), "surface": "concrete"},
	"corrugated": {"tex": "metal_corrugated", "tile": 2.0, "tint": Color(1, 1, 1), "metal": 0.35, "surface": "metal_thin"},
	"corrugated_rust": {"tex": "metal_corrugated", "tile": 2.0, "tint": Color(0.85, 0.62, 0.48), "metal": 0.3, "surface": "metal_thin"},
	"tread": {"tex": "metal_tread", "tile": 1.5, "tint": Color(0.85, 0.85, 0.85), "metal": 0.75, "surface": "metal"},
	"steel": {"tex": "metal_painted", "tile": 2.0, "tint": Color(0.36, 0.38, 0.4), "metal": 0.55, "surface": "metal"},
	"steel_yellow": {"tex": "metal_painted", "tile": 2.0, "tint": Color(0.95, 0.7, 0.18), "metal": 0.3, "surface": "metal"},
	"container_red": {"tex": "metal_painted", "tile": 2.0, "tint": Color(0.62, 0.17, 0.12), "metal": 0.35, "surface": "metal"},
	"container_blue": {"tex": "metal_painted", "tile": 2.0, "tint": Color(0.16, 0.32, 0.55), "metal": 0.35, "surface": "metal"},
	"container_green": {"tex": "metal_painted", "tile": 2.0, "tint": Color(0.2, 0.4, 0.27), "metal": 0.35, "surface": "metal"},
	"container_orange": {"tex": "metal_painted", "tile": 2.0, "tint": Color(0.85, 0.42, 0.12), "metal": 0.35, "surface": "metal"},
	"paint_white": {"tex": "metal_painted", "tile": 2.0, "tint": Color(0.92, 0.92, 0.9), "metal": 0.2, "surface": "metal"},
	"rust": {"tex": "rust", "tile": 2.0, "tint": Color(1, 1, 1), "metal": 0.4, "surface": "metal"},
	"wood": {"tex": "wood_crate", "tile": 1.2, "tint": Color(1, 1, 1), "surface": "wood"},
	"wood_dark": {"tex": "wood_crate", "tile": 1.2, "tint": Color(0.62, 0.55, 0.48), "surface": "wood"},
	"plaster": {"tex": "plaster_wall", "tile": 3.0, "tint": Color(1, 1, 1), "surface": "concrete"},
	"plaster_warm": {"tex": "plaster_wall", "tile": 3.0, "tint": Color(1.0, 0.93, 0.82), "surface": "concrete"},
	"tiles": {"tex": "tiles_floor", "tile": 2.0, "tint": Color(1, 1, 1), "surface": "concrete"},
	"gravel": {"tex": "gravel", "tile": 3.0, "tint": Color(1, 1, 1), "surface": "gravel"},
	"hazard": {"tex": "hazard_stripes", "tile": 1.0, "tint": Color(1, 1, 1), "surface": "metal"},
	"dirt": {"tex": "dirt_ground", "tile": 4.0, "tint": Color(1, 1, 1), "surface": "dirt"},
	"roof": {"tex": "roof_tar", "tile": 4.0, "tint": Color(1, 1, 1), "surface": "concrete"},
	"rail": {"tex": "metal_painted", "tile": 2.0, "tint": Color(0.22, 0.2, 0.19), "metal": 0.85, "rough": 0.45, "surface": "metal"},
	"rubber": {"color": Color(0.05, 0.05, 0.055), "rough": 0.9, "surface": "wood"},
	"glass": {"color": Color(0.08, 0.1, 0.11), "rough": 0.06, "metal": 0.6, "surface": "metal_thin"},
	"glass_lit": {"color": Color(0.5, 0.45, 0.32), "rough": 0.2, "emission": Color(1.0, 0.82, 0.55), "emission_energy": 1.2, "surface": "metal_thin"},
	"lamp_warm": {"color": Color(1, 0.9, 0.75), "emission": Color(1.0, 0.78, 0.5), "emission_energy": 6.0, "surface": "metal_thin"},
	"lamp_cool": {"color": Color(0.9, 0.95, 1.0), "emission": Color(0.82, 0.9, 1.0), "emission_energy": 5.0, "surface": "metal_thin"},
	"lamp_red": {"color": Color(1, 0.3, 0.2), "emission": Color(1.0, 0.18, 0.08), "emission_energy": 4.0, "surface": "metal_thin"},
	"coal": {"tex": "gravel", "tile": 1.5, "tint": Color(0.16, 0.15, 0.15), "rough": 0.8, "surface": "gravel"},
	"site_paint": {"color": Color(0.9, 0.62, 0.12), "rough": 0.8, "surface": "concrete"},
}

const FALLBACK_COLORS := {
	"concrete": Color(0.55, 0.55, 0.53),
	"brick": Color(0.5, 0.27, 0.2),
	"metal": Color(0.45, 0.46, 0.47),
	"metal_thin": Color(0.5, 0.52, 0.5),
	"wood": Color(0.55, 0.42, 0.28),
	"gravel": Color(0.45, 0.44, 0.42),
	"dirt": Color(0.4, 0.33, 0.25),
}

var _cache: Dictionary = {}
var _tex_cache: Dictionary = {}

func has(id: String) -> bool:
	return DEFS.has(id)

func surface_of(id: String) -> String:
	return DEFS.get(id, {}).get("surface", "concrete")

func get_material(id: String) -> Material:
	if _cache.has(id):
		return _cache[id]
	var def: Dictionary = DEFS.get(id, {})
	if def.is_empty():
		push_warning("MapMaterials: unknown material '%s'" % id)
		def = {"color": Color.MAGENTA}
	var m := StandardMaterial3D.new()
	m.resource_name = id
	m.vertex_color_use_as_albedo = true
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	var tint: Color = def.get("tint", Color.WHITE)
	var tex_name: String = def.get("tex", "")
	var albedo: Texture2D = _tex(tex_name, "albedo") if tex_name != "" else null
	if albedo:
		m.albedo_texture = albedo
		m.albedo_color = tint
		var tile: float = def.get("tile", 2.0)
		m.uv1_scale = Vector3(1.0 / tile, 1.0 / tile, 1.0)
		var nrm := _tex(tex_name, "normal")
		if nrm:
			m.normal_enabled = true
			m.normal_texture = nrm
			m.normal_scale = def.get("normal", 1.0)
		var rough := _tex(tex_name, "rough")
		if rough:
			m.roughness_texture = rough
			m.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_RED
		m.roughness = def.get("rough", 1.0)
	else:
		var base: Color = def.get("color", FALLBACK_COLORS.get(def.get("surface", "concrete"), Color.GRAY))
		if def.has("tex"):
			base = FALLBACK_COLORS.get(def.get("surface", "concrete"), Color.GRAY) * tint
		m.albedo_color = base
		m.roughness = def.get("rough", 0.85)
	m.metallic = def.get("metal", 0.0)
	m.metallic_specular = 0.45
	if def.has("emission"):
		m.emission_enabled = true
		m.emission = def["emission"]
		m.emission_energy_multiplier = def.get("emission_energy", 1.0)
	_cache[id] = m
	return m

func _tex(tex_name: String, kind: String) -> Texture2D:
	var key := tex_name + "/" + kind
	if _tex_cache.has(key):
		return _tex_cache[key]
	var t: Texture2D = null
	for ext in ["jpg", "png"]:
		var path := "%s%s/%s_%s.%s" % [TEX_ROOT, tex_name, tex_name, kind, ext]
		if ResourceLoader.exists(path):
			t = load(path)
			break
	_tex_cache[key] = t
	return t
