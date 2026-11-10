class_name GameMap
extends Node3D
## Builds a map from its layout script, sets up lighting/environment and
## bakes the navigation mesh. Emits `built` when ready for play.

signal built

@export var layout_id := "sawtooth"
@export var bake_navigation := true
@export var build_on_ready := true
@export var apply_environment := true

var info: MapInfo
var nav_region: NavigationRegion3D
var world_env: WorldEnvironment
var sun: DirectionalLight3D
var build_stats: Dictionary = {}
var env_def: Dictionary = {}

func _ready() -> void:
	if build_on_ready:
		build()

static func layout_script(id: String) -> GDScript:
	match id:
		"sawtooth":
			return SawtoothLayout
	push_error("Unknown map layout '%s'" % id)
	return SawtoothLayout

func build() -> void:
	var t0 := Time.get_ticks_usec()
	var layout := layout_script(layout_id)
	nav_region = NavigationRegion3D.new()
	nav_region.name = "Navigation"
	add_child(nav_region)
	nav_region.navigation_mesh = make_navmesh()
	var b := MapBuilder.new(nav_region, self, layout.GRID)
	layout.build(b)
	info = b.build()
	var t1 := Time.get_ticks_usec()
	env_def = layout.environment()
	if apply_environment:
		setup_environment(env_def)
	if bake_navigation:
		nav_region.bake_navigation_mesh(false)
	var t2 := Time.get_ticks_usec()
	build_stats = b.stats.duplicate()
	build_stats["build_ms"] = (t1 - t0) / 1000.0
	build_stats["nav_ms"] = (t2 - t1) / 1000.0
	built.emit()

## Waits until the navigation server has synchronised the baked region
## (region updates are processed asynchronously). Returns true when ready.
func await_navigation_ready(timeout_ms: int = 15000) -> bool:
	var rid := get_world_3d().navigation_map
	var probe: Vector3 = info.spawns[GameConst.Team.ATTACKERS][0].origin if info and not info.spawns[GameConst.Team.ATTACKERS].is_empty() else Vector3.ZERO
	# Real-time limit: region iteration runs on worker threads, so frame
	# counts are meaningless under --fixed-fps.
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline:
		if NavigationServer3D.map_get_iteration_id(rid) > 0:
			var c := NavigationServer3D.map_get_closest_point(rid, probe)
			if c.distance_to(probe) < 2.0:
				return true
		await get_tree().physics_frame
	return false

static func make_navmesh() -> NavigationMesh:
	var nm := NavigationMesh.new()
	nm.agent_radius = 0.4
	nm.agent_height = 1.7
	nm.agent_max_climb = 0.3
	nm.agent_max_slope = 46.0
	nm.cell_size = 0.2
	nm.cell_height = 0.1
	nm.region_min_size = 8.0
	nm.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_STATIC_COLLIDERS
	nm.geometry_collision_mask = GameConst.LAYER_WORLD | GameConst.LAYER_CLIP
	# Clip below roof slabs and wall tops so only reachable floors are baked.
	nm.filter_baking_aabb = AABB(Vector3(-60, -1.0, -60), Vector3(120, 4.6, 120))
	return nm

func setup_environment(e: Dictionary) -> void:
	var q := GameSettings.quality_profile()
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	add_child(sun)
	var dir: Vector3 = e.get("sun_direction", Vector3(0.5, -0.6, -0.6)).normalized()
	sun.look_at_from_position(Vector3.ZERO, dir, Vector3.UP)
	sun.light_color = e.get("sun_color", Color.WHITE)
	sun.light_energy = e.get("sun_energy", 2.0)
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = q.shadow_distance
	sun.directional_shadow_blend_splits = true
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.2
	sun.light_angular_distance = 0.4
	sun.light_volumetric_fog_energy = 1.4
	RenderingServer.directional_shadow_atlas_set_size(q.shadow_size, true)

	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = e.get("sky_top", Color(0.3, 0.45, 0.7))
	sm.sky_horizon_color = e.get("sky_horizon", Color(0.75, 0.72, 0.65))
	sm.ground_horizon_color = e.get("sky_horizon", Color(0.75, 0.72, 0.65))
	sm.ground_bottom_color = e.get("ground", Color(0.25, 0.24, 0.22))
	sm.sun_angle_max = 25.0
	sm.sky_curve = 0.12
	var sky := Sky.new()
	sky.sky_material = sm
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = e.get("ambient_energy", 0.5)
	env.ambient_light_sky_contribution = 0.85
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_exposure = 1.05
	env.ssao_enabled = q.ssao
	env.ssao_radius = 1.4
	env.ssao_intensity = 2.2
	env.ssao_power = 1.6
	env.ssil_enabled = q.ssil
	env.sdfgi_enabled = q.sdfgi
	env.sdfgi_use_occlusion = true
	env.sdfgi_min_cell_size = 0.25
	env.sdfgi_cascades = 4
	env.sdfgi_energy = 0.9
	env.sdfgi_bounce_feedback = 0.4
	env.glow_enabled = q.glow
	env.glow_intensity = 0.35
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.3
	env.fog_enabled = q.fog
	env.fog_light_color = e.get("fog_color", Color(0.7, 0.7, 0.68))
	env.fog_density = e.get("fog_density", 0.003)
	env.fog_aerial_perspective = 0.35
	env.fog_sky_affect = 0.15
	# Volumetric fog makes the sun shafts through the foundry glazing and
	# lamp cones visible (Forward+ desktop presets only).
	env.volumetric_fog_enabled = q.get("volumetric", false)
	env.volumetric_fog_density = e.get("volumetric_density", 0.0035)
	env.volumetric_fog_albedo = Color(0.9, 0.86, 0.8)
	env.volumetric_fog_anisotropy = 0.55
	env.volumetric_fog_length = 48.0
	env.volumetric_fog_ambient_inject = 0.15
	env.volumetric_fog_sky_affect = 0.0
	env.adjustment_enabled = true
	env.adjustment_contrast = 1.06
	env.adjustment_saturation = 1.08
	world_env = WorldEnvironment.new()
	world_env.name = "WorldEnvironment"
	world_env.environment = env
	add_child(world_env)
