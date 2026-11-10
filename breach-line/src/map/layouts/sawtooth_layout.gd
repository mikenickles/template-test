class_name SawtoothLayout
## "Sawtooth" — an original urban-industrial map: a decommissioned rail
## freight yard and foundry. North is -Z, east is +X, units are meters.
##
##   Breachers (attackers) spawn in the south loading yard; Wardens
##   (defenders) spawn in the north office court between the sites.
##
##   Site A "Rail Platform" (north-east): raised loading platform with a
##     dispatcher hut, boxcar on the rails, walkway from the pump house.
##     Approaches: Long Rail (via Truck Lane + Long Doors), Short (Pump House
##     stairs from mid), defender A Gate.
##   Site B "Foundry Hall" (north-west): sawtooth-roofed hall with furnace,
##     ladle, press and a mezzanine. Approaches: Tunnels + Coal Yard (B Main),
##     Workshop (B Short) from mid, defender Back Hall.
##   Mid: long street with a gatehouse choke; side doors to Short A and
##     Workshop; Mid Gate into the defender court.
##
## Approximate run times at rifle speed (5.7 m/s): attackers 13-17 s to a
## site, defenders 6 s, defender rotation through spawn ~12 s.

const NAME := "Sawtooth"
const GRID := Rect2i(-48, -46, 96, 90)

const T := GameConst.Team.ATTACKERS
const CT := GameConst.Team.DEFENDERS

static func environment() -> Dictionary:
	return {
		# Late-afternoon sun from the south-west; sawtooth glazing faces south.
		"sun_direction": Vector3(0.52, -0.62, -0.58).normalized(),
		"sun_color": Color(1.0, 0.86, 0.68),
		"sun_energy": 2.2,
		"sky_top": Color(0.32, 0.47, 0.68),
		"sky_horizon": Color(0.78, 0.74, 0.66),
		"ground": Color(0.28, 0.26, 0.24),
		"ambient_energy": 0.55,
		"fog_color": Color(0.7, 0.68, 0.62),
		"fog_density": 0.0035,
		"ambience": "ambience/industrial_loop",
	}

static func build(b: MapBuilder) -> void:
	b.info.map_name = NAME
	_zones(b)
	_t_spawn(b)
	_truck_lane_and_long(b)
	_a_site(b)
	_mid(b)
	_pump_house(b)
	_ct_spawn(b)
	_b_hall(b)
	_tunnels_and_coal(b)
	_workshop(b)
	_skyline(b)
	_markers(b)
	_callouts(b)

# ---------------------------------------------------------------------------

static func _zones(b: MapBuilder) -> void:
	# Attacker side
	b.zone("t_spawn", "Breacher Yard", MapBuilder.R(-16, 27, 16, 40), {"floor": "asphalt", "wall": "brick_red", "wall_h": 8.0})
	b.door("t_east", MapBuilder.R(16, 30, 17, 35), {"top": 4.2, "floor": "asphalt"})
	b.zone("truck_lane", "Truck Lane", MapBuilder.R(17, 28, 30, 37), {"floor": "asphalt", "wall": "concrete_wall", "wall_h": 6.5})
	b.zone("rail_cut", "Long Rail", MapBuilder.R(30, -11, 40, 37), {"floor": "gravel", "wall": "concrete_wall", "wall_h": 5.5})
	b.door("long_gate", MapBuilder.R(32, -12, 38, -11), {"top": 4.6, "floor": "gravel", "lintel": "steel"})
	# Site A
	b.zone("a_yard", "A Yard", MapBuilder.R(14, -41, 44, -12), {"floor": "concrete_floor", "wall": "brick_dark", "wall_h": 9.0})
	b.zone("a_rails", "A Rails", MapBuilder.R(40, -41, 44, -12), {"floor": "gravel", "wall": "brick_dark", "wall_h": 9.0})
	# Mid and short routes
	b.zone("mid", "Mid", MapBuilder.R(-4, -29, 4, 27), {"floor": "asphalt", "wall": "brick_red", "wall_h": 10.0})
	b.door("short_door", MapBuilder.R(4, 5, 5, 8), {"top": 3.0})
	b.zone("pump_house", "Pump House", MapBuilder.R(5, 4, 21, 11), {"wall": "concrete_wall", "roof": 4.5})
	b.zone("pump_stairs", "Short Stairs", MapBuilder.R(15, -11, 22, 4), {"wall": "concrete_wall", "roof": 5.2})
	b.door("short_exit", MapBuilder.R(16, -12, 21, -11), {"top": 4.3})
	# Defender side
	b.zone("ct_spawn", "Warden Court", MapBuilder.R(-10, -41, 10, -30), {"floor": "tiles", "wall": "plaster_warm", "wall_h": 8.0})
	b.zone("a_gate_hall", "A Gate", MapBuilder.R(10, -39, 13, -33), {"wall": "plaster", "roof": 3.8})
	b.door("a_gate", MapBuilder.R(13, -38, 14, -34), {"top": 3.2})
	b.zone("b_back_hall", "Back Hall", MapBuilder.R(-14, -39, -10, -33), {"wall": "plaster", "roof": 3.8})
	b.door("b_back", MapBuilder.R(-15, -38, -14, -34), {"top": 3.2})
	b.door("mid_gate", MapBuilder.R(-3, -30, 3, -29), {"top": 4.6, "floor": "asphalt"})
	# Site B
	b.zone("b_hall", "B Foundry", MapBuilder.R(-44, -41, -15, -11), {"floor": "concrete_floor", "wall": "brick_dark", "wall_h": 9.0})
	b.door("scrap_door", MapBuilder.R(-17, 30, -16, 35), {"top": 4.2, "floor": "dirt"})
	b.zone("scrap_lane", "Scrap Lane", MapBuilder.R(-31, 28, -17, 37), {"floor": "dirt", "wall": "corrugated_rust", "wall_h": 5.0})
	b.door("tunnel_door", MapBuilder.R(-32, 30, -31, 35), {"top": 3.6, "floor": "dirt"})
	b.zone("tunnels", "B Tunnels", MapBuilder.R(-40, 10, -32, 36), {"wall": "concrete_wall", "roof": 4.0})
	b.zone("coal_yard", "Coal Yard", MapBuilder.R(-42, -10, -30, 10), {"floor": "dirt", "wall": "brick_red", "wall_h": 7.0})
	b.door("b_main", MapBuilder.R(-38, -11, -33, -10), {"top": 4.6})
	b.door("ws_door", MapBuilder.R(-5, 1, -4, 4), {"top": 3.0})
	b.zone("workshop", "Workshop", MapBuilder.R(-21, -1, -5, 7), {"wall": "plaster", "roof": 4.2})
	b.zone("ws_north", "Workshop Hall", MapBuilder.R(-21, -10, -15, -1), {"wall": "plaster", "roof": 4.2})
	b.door("b_short", MapBuilder.R(-20, -11, -17, -10), {"top": 3.2})
	# Facade variation.
	b.override_wall_material(MapBuilder.R(0, -29, 4, 27), "brick_dark")
	b.override_wall_material(MapBuilder.R(-16, 37, 16, 40), "corrugated")
	b.override_wall_material(MapBuilder.R(17, 28, 30, 30), "corrugated")
	b.override_wall_height(MapBuilder.R(-18, 40, 18, 42), 11.0)
	b.override_wall_height(MapBuilder.R(-12, -43, 12, -41), 12.0)
	b.override_wall_height(MapBuilder.R(-5, -30, 5, 28), 10.0)

# ---------------------------------------------------------------------------

static func _t_spawn(b: MapBuilder) -> void:
	# Container across the mid sightline shields the spawn.
	MapProps.container(b, Vector3(0, 0, 31.8), 90, "container_blue")
	MapProps.container(b, Vector3(-12.8, 0, 38.4), 90, "container_red")
	MapProps.container(b, Vector3(-12.6, 2.59, 38.3), 92, "container_green")
	MapProps.flatbed(b, Vector3(11.5, 0, 38.3), 90, 8.0)
	MapProps.crate_stack(b, Vector3(14.6, 0, 28.6), 6)
	MapProps.crate(b, Vector3(13.3, 0, 28.3), Vector3(1.15, 1.15, 1.15), -8)
	MapProps.forklift(b, Vector3(-9.5, 0, 29.8), 35)
	MapProps.pallet(b, Vector3(-14.6, 0, 29.0), 0, 3)
	MapProps.pallet(b, Vector3(-14.4, 0, 30.4), 8, 2)
	MapProps.barrel_group(b, Vector3(7.0, 0, 28.4), 3)
	# Loading dock doors on the south warehouse facade.
	for x: float in [-6.0, 0.0, 6.0]:
		MapProps.wall_door(b, Vector3(x, 0, 39.98), Vector3(0, 0, -1), 3.2, 3.6, "corrugated")
		MapProps.wall_lamp(b, Vector3(x, 4.2, 39.9), Vector3(0, 0, -1), Color(1.0, 0.82, 0.6), 1.2)
	MapProps.window_row(b, Vector3(-15, 6.6, 39.95), Vector3(15, 6.6, 39.95), Vector3(0, 0, -1), 6, 2.0, 1.2, 0)
	MapProps.pipe(b, Vector3(-15.9, 5.2, 27.2), Vector3(-15.9, 5.2, 39.8), 0.16, "rust")
	b.label("A LONG  >", Vector3(15.95, 3.2, 28.8), -90, 96, Color(0.95, 0.9, 0.8, 0.85), {"pixel": 0.008})
	b.label("<  B", Vector3(-15.95, 3.2, 28.8), 90, 96, Color(0.95, 0.9, 0.8, 0.85), {"pixel": 0.008})

static func _truck_lane_and_long(b: MapBuilder) -> void:
	MapProps.container(b, Vector3(21.5, 0, 35.5), 90, "container_orange")
	MapProps.barrel_group(b, Vector3(27.6, 0, 29.0), 4)
	MapProps.pallet(b, Vector3(18.4, 0, 29.2), 0, 4)
	MapProps.window_row(b, Vector3(17.5, 4.0, 27.95), Vector3(29.5, 4.0, 27.95), Vector3(0, 0, 1), 4, 1.6, 1.1)
	# Long Rail: two tracks, derailed boxcar, Long Doors choke.
	MapProps.rails(b, Vector3(33, 0, -11), Vector3(33, 0, 37))
	MapProps.rails(b, Vector3(37.2, 0, -11), Vector3(37.2, 0, 9.5))
	MapProps.boxcar(b, Vector3(32.6, 0, 26.5), 4, 12.0, "container_blue")
	# Long Doors: walls with a 4 m opening, one leaf swung open, one half shut.
	b.box(Vector3(30, 0, 9.6), Vector3(33, 4.2, 10.4), "concrete_wall", {"occluder": true})
	b.box(Vector3(37, 0, 9.6), Vector3(40, 4.2, 10.4), "concrete_wall", {"occluder": true})
	b.box(Vector3(33, 3.5, 9.7), Vector3(37, 4.2, 10.3), "steel")
	b.box_xf(Transform3D(Basis(Vector3.UP, deg_to_rad(-78)), Vector3(33.0, 1.7, 10.4) + Vector3(cos(deg_to_rad(78)), 0, sin(deg_to_rad(78))) * 0.95), Vector3(1.9, 3.3, 0.08), "corrugated_rust", {"uv": "local"})
	b.box(Vector3(35.6, 0.05, 9.94), Vector3(37.0, 3.3, 10.06), "corrugated_rust", {"uv": "local"})
	b.label("LONG", Vector3(31.5, 2.6, 10.42), 0, 96, Color(0.9, 0.86, 0.75, 0.8), {"pixel": 0.008})
	b.box(Vector3(36.5, 0, -6.2), Vector3(38.6, 1.0, -4.6), "concrete_wall")
	b.box(Vector3(30.9, 0, -4.2), Vector3(32.6, 1.65, -2.4), "concrete_wall")
	MapProps.cabinet(b, Vector3(39.6, 0, 1.0), -90, Vector3(1.0, 1.7, 0.6), "steel")
	MapProps.barrel_group(b, Vector3(38.9, 0, 21.5), 2)
	MapProps.crate_stack(b, Vector3(38.9, 0, 33.5), -5)
	MapProps.pallet(b, Vector3(37.4, 0, 35.2), 10, 2)
	# Signal gantry over the tracks.
	b.box(Vector3(30.2, 0, -1.3), Vector3(30.7, 6.0, -0.8), "steel", {"collide": false})
	b.box(Vector3(30.2, 5.6, -1.3), Vector3(39.8, 6.0, -0.8), "steel", {"collide": false})
	b.box(Vector3(34.6, 4.8, -1.2), Vector3(35.4, 5.6, -0.9), "rubber", {"collide": false})
	b.box(Vector3(34.85, 5.05, -0.9), Vector3(35.15, 5.35, -0.86), "lamp_red", {"collide": false, "ao": false})

static func _a_site(b: MapBuilder) -> void:
	# Raised loading platform (top 1.2 m) holds the bombsite.
	b.box(Vector3(21, 0, -36), Vector3(39.5, 1.12, -19), "concrete_wall", {"uv": "world"})
	b.box(Vector3(20.95, 1.12, -36.05), Vector3(39.55, 1.2, -18.95), "concrete_floor", {"surface": "concrete"})
	b.box(Vector3(21, 0.9, -18.96), Vector3(33, 1.12, -18.9), "hazard", {"collide": false, "ao": false})
	# Walkway from the Short exit joins the platform from the west.
	b.box(Vector3(14, 0, -24), Vector3(21, 1.12, -12), "concrete_wall")
	b.box(Vector3(14, 1.12, -24.05), Vector3(21, 1.2, -12), "tread", {"surface": "metal"})
	b.box(Vector3(14, 0.9, -24.07), Vector3(21, 1.12, -24.01), "hazard", {"collide": false, "ao": false})
	# Ramp up from Long, stairs up from the defender lane.
	b.ramp(33, -19, 39.5, -13, 0.0, 1.2, "-z", "concrete_floor")
	b.stairs(17, -33, 21, -29, 0.0, 1.2, "+x", 4, "concrete_wall")
	# Dispatcher hut on the platform.
	b.box(Vector3(34.5, 1.2, -35.6), Vector3(38.8, 4.0, -32.0), "plaster_warm", {"occluder": true})
	b.box(Vector3(34.3, 4.0, -35.8), Vector3(39.0, 4.18, -31.8), "roof", {"collide": false})
	MapProps.window(b, Vector3(36.6, 2.7, -31.98), Vector3(0, 0, 1), 2.0, 1.1, true)
	MapProps.wall_door(b, Vector3(34.48, 1.2, -33.8), Vector3(-1, 0, 0), 0.9, 2.1, "steel")
	MapProps.wall_lamp(b, Vector3(36.6, 3.8, -31.9), Vector3(0, 0, 1), Color(1.0, 0.85, 0.65), 1.6)
	# Site cover.
	MapProps.crate_stack(b, Vector3(28.4, 1.2, -27.8), 3)
	MapProps.crate(b, Vector3(29.75, 1.2, -27.5), Vector3(1.15, 1.15, 1.15), -6)
	MapProps.crate(b, Vector3(27.2, 1.2, -26.6), Vector3(1.0, 0.95, 1.0), 12)
	MapProps.loaded_pallet(b, Vector3(23.6, 1.2, -21.4), 0, "container_blue")
	MapProps.crate(b, Vector3(37.6, 1.2, -21.6), Vector3(1.15, 1.15, 1.15), 4)
	MapProps.crate(b, Vector3(37.4, 1.2, -22.9), Vector3(1.1, 1.1, 1.1), -9)
	MapProps.loaded_pallet(b, Vector3(31.5, 1.2, -34.6), 90, "rust")
	b.label("A", Vector3(30.0, 0.62, -18.86), 0, 128, Color(0.95, 0.75, 0.2), {"pixel": 0.006})
	b.label("A", Vector3(30.0, 5.8, -40.95), 0, 320, Color(0.95, 0.78, 0.25, 0.9), {"pixel": 0.01})
	# Boxcar on the east rails, a narrow gap behind the platform.
	MapProps.rails(b, Vector3(42.3, 0, -41), Vector3(42.3, 0, -12))
	MapProps.boxcar(b, Vector3(42.3, 0, -30.0), 0, 15.0, "container_red")
	# Ground clutter.
	MapProps.barrel_group(b, Vector3(24.8, 0, -14.6), 2)
	MapProps.crate(b, Vector3(28.6, 0, -15.4), Vector3(1.15, 1.15, 1.15), 15)
	MapProps.pallet(b, Vector3(42.4, 0, -14.4), 0, 5)
	MapProps.crate(b, Vector3(15.4, 0, -26.6), Vector3(1.15, 1.15, 1.15), 4)
	MapProps.barrel_group(b, Vector3(15.2, 0, -40.0), 3)
	MapProps.cabinet(b, Vector3(26.0, 0, -40.65), 0, Vector3(1.6, 1.9, 0.6), "steel")
	# Gantry crane spanning the yard (decorative, legs are solid).
	b.box(Vector3(15.0, 0, -40.4), Vector3(15.8, 8.0, -39.4), "steel_yellow")
	b.box(Vector3(42.9, 0, -40.4), Vector3(43.7, 8.0, -39.4), "steel_yellow")
	b.box(Vector3(14.8, 8.0, -40.6), Vector3(43.9, 9.0, -39.2), "steel_yellow", {"collide": false})
	b.box(Vector3(28.6, 7.0, -40.7), Vector3(31.2, 8.0, -38.6), "steel", {"collide": false})
	MapProps.pipe(b, Vector3(30.0, 4.6, -39.6), Vector3(30.0, 7.0, -39.6), 0.03, "rail")
	b.box(Vector3(29.75, 4.2, -39.85), Vector3(30.25, 4.6, -39.35), "steel_yellow", {"collide": false})
	# Facades.
	MapProps.window_row(b, Vector3(15, 6.0, -40.95), Vector3(26, 6.0, -40.95), Vector3(0, 0, 1), 3, 2.0, 1.4)
	MapProps.window_row(b, Vector3(34, 6.0, -40.95), Vector3(43, 6.0, -40.95), Vector3(0, 0, 1), 3, 2.0, 1.4)
	MapProps.wall_lamp(b, Vector3(13.95, 3.6, -36.0), Vector3(1, 0, 0), Color(1, 0.84, 0.62), 1.4)
	MapProps.pipe(b, Vector3(43.85, 0.0, -18.0), Vector3(43.85, 8.5, -18.0), 0.12, "rust")

static func _mid(b: MapBuilder) -> void:
	# Gatehouse: 3 m gap under a pedestrian bridge.
	b.box(Vector3(-4, 0, -8), Vector3(-1, 4.2, -5), "brick_red", {"occluder": true})
	b.box(Vector3(2, 0, -8), Vector3(4, 4.2, -5), "brick_red", {"occluder": true})
	b.box(Vector3(-4, 4.2, -8.3), Vector3(4, 5.6, -4.7), "concrete_wall")
	b.box(Vector3(-1.08, 0, -8.1), Vector3(-0.92, 4.2, -4.9), "steel", {"collide": false})
	b.box(Vector3(1.92, 0, -8.1), Vector3(2.08, 4.2, -4.9), "steel", {"collide": false})
	MapProps.window_row(b, Vector3(-3.5, 4.9, -4.68), Vector3(3.5, 4.9, -4.68), Vector3(0, 0, 1), 3, 1.6, 0.8)
	b.label("MID", Vector3(-2.5, 2.8, -4.98), 0, 110, Color(0.95, 0.92, 0.85, 0.85), {"pixel": 0.008})
	# Cover south of the gatehouse.
	MapProps.flatbed(b, Vector3(2.5, 0, 17.0), 0, 9.0)
	MapProps.dumpster(b, Vector3(-2.9, 0, 18.4), 90)
	MapProps.crate(b, Vector3(3.2, 0, 10.6), Vector3(1.15, 1.15, 1.15), 8)
	MapProps.barrel_group(b, Vector3(-3.3, 0, 7.2), 2, "steel_yellow")
	# Defender side of mid.
	MapProps.jersey_barrier(b, Vector3(-2.3, 0, -22.0), 0, 2.6)
	MapProps.jersey_barrier(b, Vector3(2.0, 0, -17.2), 4, 2.6)
	MapProps.crate_stack(b, Vector3(-3.2, 0, -12.5), 2)
	# Facades, lamps and street furniture.
	for side: float in [-1, 1]:
		var x: float = 3.98 * side
		var n := Vector3(-side, 0, 0)
		MapProps.window_row(b, Vector3(x, 6.4, -27), Vector3(x, 6.4, -10), n, 4, 1.8, 1.5, 3)
		MapProps.window_row(b, Vector3(x, 6.4, 11), Vector3(x, 6.4, 26), n, 4, 1.8, 1.5)
		MapProps.wall_lamp(b, Vector3(x, 4.6, -18), n, Color(1, 0.84, 0.62), 1.5)
		MapProps.wall_lamp(b, Vector3(x, 4.6, 20), n, Color(1, 0.84, 0.62), 1.5)
	MapProps.wall_door(b, Vector3(-3.98, 0, 22.0), Vector3(1, 0, 0), 1.2, 2.3)
	MapProps.wall_door(b, Vector3(3.98, 0, -24.0), Vector3(-1, 0, 0), 1.2, 2.3)
	MapProps.pipe(b, Vector3(-3.85, 0, -2.0), Vector3(-3.85, 9.5, -2.0), 0.1, "steel")
	MapProps.pipe(b, Vector3(3.85, 3.4, 0.0), Vector3(3.85, 3.4, 12.0), 0.14, "rust")
	b.label("SHORT  A  >", Vector3(3.97, 3.4, 7.8), -90, 80, Color(0.95, 0.9, 0.8, 0.85), {"pixel": 0.008})
	b.label("<  WORKSHOP  B", Vector3(-3.97, 3.4, 4.5), 90, 80, Color(0.95, 0.9, 0.8, 0.85), {"pixel": 0.008})

static func _pump_house(b: MapBuilder) -> void:
	MapProps.machine(b, Vector3(9.0, 0, 9.6), Vector3(2.4, 1.7, 1.6), 0, "container_blue")
	MapProps.machine(b, Vector3(14.0, 0, 9.6), Vector3(2.4, 1.7, 1.6), 0, "container_blue")
	MapProps.pipe(b, Vector3(5.2, 3.7, 5.0), Vector3(20.8, 3.7, 5.0), 0.28, "rust")
	MapProps.pipe(b, Vector3(5.2, 3.2, 10.6), Vector3(20.8, 3.2, 10.6), 0.18, "steel")
	MapProps.pipe(b, Vector3(9.0, 2.0, 9.6), Vector3(9.0, 3.2, 10.6), 0.12, "steel")
	MapProps.pipe(b, Vector3(14.0, 2.0, 9.6), Vector3(14.0, 3.2, 10.6), 0.12, "steel")
	MapProps.crate(b, Vector3(19.6, 0, 9.8), Vector3(1.1, 1.1, 1.1), 10)
	MapProps.cabinet(b, Vector3(6.2, 0, 10.65), 180, Vector3(1.2, 1.9, 0.5), "paint_white")
	for x: float in [8.0, 13.0, 18.0]:
		MapProps.tube_light(b, Vector3(x, 4.42, 7.5), true, Color(1.0, 0.9, 0.75), 1.3, 8.0, "lamp_warm")
	# Stairs rising north to the landing at platform height.
	b.stairs(15, -7, 22, -2, 0.0, 1.2, "-z", 4, "concrete_wall")
	b.box(Vector3(15, 0, -11), Vector3(22, 1.12, -7), "concrete_wall")
	b.box(Vector3(15, 1.12, -11), Vector3(22, 1.2, -7), "tread", {"surface": "metal"})
	b.box(Vector3(16, 0, -12), Vector3(21, 1.2, -11), "tread")
	MapProps.tube_light(b, Vector3(18.5, 5.12, -4.0), false, Color(1.0, 0.9, 0.75), 1.3, 8.0, "lamp_warm")
	MapProps.tube_light(b, Vector3(18.5, 5.12, 1.5), false, Color(1.0, 0.9, 0.75), 1.0, 7.0, "lamp_warm")
	MapProps.railing(b, Vector3(15.1, 1.2, -7.0), Vector3(15.1, 1.2, -10.9))

static func _ct_spawn(b: MapBuilder) -> void:
	# Office facade on the north wall.
	MapProps.window_row(b, Vector3(-9.5, 2.0, -40.95), Vector3(-2.0, 2.0, -40.95), Vector3(0, 0, 1), 3, 1.8, 1.4, 2)
	MapProps.window_row(b, Vector3(2.0, 2.0, -40.95), Vector3(9.5, 2.0, -40.95), Vector3(0, 0, 1), 3, 1.8, 1.4, 2)
	MapProps.window_row(b, Vector3(-9.5, 5.6, -40.95), Vector3(9.5, 5.6, -40.95), Vector3(0, 0, 1), 7, 1.8, 1.4, 3)
	MapProps.wall_door(b, Vector3(0, 0, -40.98), Vector3(0, 0, 1), 2.2, 2.6, "glass")
	b.box(Vector3(-1.8, 2.7, -41.0), Vector3(1.8, 2.85, -39.8), "steel", {"collide": false})
	MapProps.wall_lamp(b, Vector3(-3.0, 3.3, -40.9), Vector3(0, 0, 1), Color(1, 0.86, 0.66), 1.4)
	MapProps.wall_lamp(b, Vector3(3.0, 3.3, -40.9), Vector3(0, 0, 1), Color(1, 0.86, 0.66), 1.4)
	# Planters and a guard booth near Mid Gate.
	for x: float in [-7.3, 7.3]:
		b.box(Vector3(x - 1.2, 0, -33.6), Vector3(x + 1.2, 0.75, -31.4), "concrete_wall")
		b.box(Vector3(x - 1.05, 0.75, -33.45), Vector3(x + 1.05, 0.8, -31.55), "dirt", {"collide": false})
	b.box(Vector3(4.8, 0, -32.6), Vector3(7.4, 2.7, -30.5), "plaster_warm")
	b.box(Vector3(4.6, 2.7, -32.8), Vector3(7.6, 2.85, -30.3), "roof", {"collide": false})
	MapProps.window(b, Vector3(6.1, 1.65, -30.48), Vector3(0, 0, 1), 1.6, 0.8, true)
	MapProps.window(b, Vector3(4.78, 1.65, -31.55), Vector3(-1, 0, 0), 1.0, 0.8, true)
	b.box(Vector3(-9.6, 0, -36.0), Vector3(-8.9, 0.45, -33.8), "wood_dark")
	MapProps.cabinet(b, Vector3(9.55, 0, -31.2), -90, Vector3(0.9, 1.4, 0.4), "steel")
	MapProps.tube_light(b, Vector3(11.5, 3.72, -36.0), false, Color(0.92, 0.95, 1.0), 1.0, 6.0)
	MapProps.tube_light(b, Vector3(-12.0, 3.72, -36.0), false, Color(0.92, 0.95, 1.0), 1.0, 6.0)
	b.label("A  >", Vector3(9.97, 3.3, -31.6), -90, 90, Color(0.95, 0.75, 0.25, 0.9), {"pixel": 0.008})
	b.label("<  B", Vector3(-9.97, 3.3, -31.6), 90, 90, Color(0.95, 0.75, 0.25, 0.9), {"pixel": 0.008})

static func _b_hall(b: MapBuilder) -> void:
	# Sawtooth roof: six 5 m teeth rising to the south, glazing faces south so
	# the afternoon sun shafts into the hall.
	var pitch := atan2(2.5, 5.0)
	var slope_len := sqrt(25.0 + 6.25)
	for k in 6:
		var zs := -41.0 + 5.0 * k
		var ze := zs + 5.0
		b.box_xf(Transform3D(Basis(Vector3.RIGHT, -pitch), Vector3(-29.5, 10.25, zs + 2.5)), Vector3(30.0, 0.2, slope_len), "corrugated", {"collide": false, "uv": "local"})
		b.ramp(-45, zs, -44, ze, 9.0, 11.5, "+z", "brick_dark", {"base": 9.0, "collide": false})
		b.ramp(-15, zs, -14, ze, 9.0, 11.5, "+z", "brick_dark", {"base": 9.0, "collide": false})
		for i in 11:
			var x := -43.6 + i * 2.82
			b.box(Vector3(x - 0.05, 9.0, ze - 0.06), Vector3(x + 0.05, 11.5, ze + 0.06), "steel", {"collide": false, "ao": false})
		b.box(Vector3(-44, 10.2, ze - 0.05), Vector3(-15, 10.28, ze + 0.05), "steel", {"collide": false, "ao": false})
		if k < 5:
			MapProps.i_beam(b, Vector3(-44, 8.75, ze), Vector3(-15, 8.75, ze), 0.45)
	# Furnace in the north-west corner with a glowing door.
	b.box(Vector3(-44, 0, -41), Vector3(-37, 5.5, -35), "brick_dark", {"occluder": true})
	b.box(Vector3(-43.5, 5.5, -40.5), Vector3(-37.5, 7.0, -35.5), "rust", {"collide": false})
	b.cylinder(Transform3D(Basis(), Vector3(-40.5, 11.0, -38.0)), 0.8, 8.0, "rust", {"collide": false})
	b.box(Vector3(-41.6, 0.7, -34.98), Vector3(-39.4, 2.3, -34.94), "lamp_red", {"collide": false, "ao": false})
	b.box(Vector3(-41.9, 0.5, -35.0), Vector3(-39.1, 2.5, -34.85), "steel", {"collide": false, "skip": ["s"]})
	b.omni(Vector3(-40.5, 1.6, -33.8), Color(1.0, 0.45, 0.15), 2.5, 7.0, {"attenuation": 1.6})
	# Ladle on its stand: centre-of-site cover.
	b.box(Vector3(-32.4, 0, -27.9), Vector3(-29.6, 0.5, -25.1), "steel")
	b.cylinder(Transform3D(Basis(), Vector3(-31.0, 1.4, -26.5)), 1.35, 1.8, "rust", {"segments": 18})
	b.cylinder(Transform3D(Basis(), Vector3(-31.0, 2.36, -26.5)), 1.45, 0.12, "steel", {"segments": 18, "collide": false})
	b.box(Vector3(-32.6, 1.8, -26.65), Vector3(-29.4, 2.0, -26.35), "steel", {"collide": false})
	# Crates, ingot pallets, beam pile.
	MapProps.crate_stack(b, Vector3(-36.6, 0, -29.6), -4)
	MapProps.crate(b, Vector3(-35.3, 0, -30.4), Vector3(1.1, 1.1, 1.1), 9)
	MapProps.loaded_pallet(b, Vector3(-34.6, 0, -21.6), 0, "rust")
	MapProps.loaded_pallet(b, Vector3(-26.4, 0, -31.9), 90, "rust")
	MapProps.loaded_pallet(b, Vector3(-29.2, 0, -36.4), 0, "steel")
	b.box(Vector3(-36.6, 0, -14.6), Vector3(-33.6, 0.85, -13.4), "steel", {"uv": "local"})
	MapProps.machine(b, Vector3(-25.6, 0, -15.8), Vector3(3.0, 3.4, 3.0), 0, "container_green")
	b.label("B", Vector3(-31.0, 5.6, -40.95), 0, 320, Color(0.95, 0.78, 0.25, 0.9), {"pixel": 0.01})
	b.label("B", Vector3(-25.6, 2.2, -14.27), 0, 110, Color(0.95, 0.78, 0.25), {"pixel": 0.006})
	# Mezzanine along the east wall (open underneath).
	b.box(Vector3(-20, 3.0, -40), Vector3(-15, 3.25, -26), "tread", {"uv": "world"})
	for z: float in [-39.7, -35.0, -30.5, -26.3]:
		b.box(Vector3(-20.0, 0, z - 0.15), Vector3(-19.7, 3.0, z + 0.15), "steel")
	b.stairs(-19, -26, -16, -20, 0.0, 3.25, "-z", 12, "tread")
	MapProps.railing(b, Vector3(-20.0, 3.25, -40.0), Vector3(-20.0, 3.25, -26.05))
	MapProps.railing(b, Vector3(-20.0, 3.25, -26.05), Vector3(-19.05, 3.25, -26.05))
	MapProps.railing(b, Vector3(-15.95, 3.25, -26.05), Vector3(-15.05, 3.25, -26.05))
	MapProps.railing(b, Vector3(-19.05, 0.0, -25.9), Vector3(-19.05, 0.0, -20.1), 1.0)
	MapProps.shelf(b, Vector3(-15.4, 0, -30.5), 90, 3.0)
	MapProps.cabinet(b, Vector3(-15.3, 3.25, -38.8), -90, Vector3(1.0, 1.5, 0.45), "steel")
	# Roller door drums at B Main and lighting.
	b.cylinder(Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(-35.5, 5.0, -11.6)), 0.45, 5.4, "steel", {"collide": false})
	for p in [Vector3(-36, 8.2, -32), Vector3(-24, 8.2, -32), Vector3(-36, 8.2, -18), Vector3(-24, 8.2, -18)]:
		b.box(p - Vector3(0.35, 0, 0.35), p + Vector3(0.35, 0.3, 0.35), "steel", {"collide": false, "ao": false})
		b.box(p - Vector3(0.28, 0.02, 0.28), p + Vector3(0.28, 0.0, 0.28), "lamp_warm", {"collide": false, "ao": false})
		b.spot(p - Vector3(0, 0.1, 0), Vector3.DOWN, Color(1.0, 0.86, 0.66), 2.6, 14.0, 60.0, {"shadow": p.x > -30 and p.z < -20})
	MapProps.window_row(b, Vector3(-43.95, 5.6, -33), Vector3(-43.95, 5.6, -14), Vector3(1, 0, 0), 4, 2.2, 1.8)

static func _tunnels_and_coal(b: MapBuilder) -> void:
	# Tunnels: pillars, pipes, fluorescent lights.
	for z: float in [17.0, 29.0]:
		b.box(Vector3(-36.4, 0, z - 0.4), Vector3(-35.6, 4.0, z + 0.4), "concrete_wall")
	MapProps.pipe(b, Vector3(-39.7, 3.4, 10.2), Vector3(-39.7, 3.4, 35.8), 0.2, "rust")
	MapProps.pipe(b, Vector3(-39.6, 2.9, 10.2), Vector3(-39.6, 2.9, 35.8), 0.12, "steel")
	MapProps.pipe(b, Vector3(-32.35, 3.5, 10.2), Vector3(-32.35, 3.5, 35.8), 0.1, "steel")
	for z: float in [13.0, 20.0, 26.0, 33.0]:
		MapProps.tube_light(b, Vector3(-36.0, 3.92, z), false, Color(0.82, 0.92, 1.0), 1.2, 8.0)
	MapProps.crate_stack(b, Vector3(-33.0, 0, 34.6), 4)
	MapProps.barrel_group(b, Vector3(-39.1, 0, 22.6), 2)
	# Scrap Lane: car wreck, scrap piles, barrels.
	b.box(Vector3(-27.2, 0.3, 33.4), Vector3(-23.0, 1.25, 35.4), "rust", {"uv": "local"})
	b.box(Vector3(-26.2, 1.25, 33.6), Vector3(-24.0, 1.95, 35.2), "rust", {"uv": "local"})
	for x: float in [-26.6, -23.6]:
		for z: float in [33.3, 35.5]:
			b.cylinder(Transform3D(Basis(Vector3.FORWARD, PI * 0.5), Vector3(x, 0.32, z)), 0.32, 0.22, "rubber", {"collide": false, "segments": 10})
	b.box_xf(Transform3D(Basis(Vector3.UP, 0.4) * Basis(Vector3.RIGHT, 0.25), Vector3(-19.5, 0.6, 29.6)), Vector3(2.2, 1.2, 1.4), "rust", {"uv": "local"})
	b.box_xf(Transform3D(Basis(Vector3.UP, -0.3), Vector3(-21.4, 0.45, 29.3)), Vector3(1.6, 0.9, 1.2), "corrugated_rust", {"uv": "local"})
	MapProps.barrel_group(b, Vector3(-29.8, 0, 28.8), 3)
	MapProps.pallet(b, Vector3(-18.4, 0, 36.0), 0, 3)
	# Coal Yard: bunkers along the west wall, forklift, container.
	for z: float in [-8.0, -2.0, 4.0]:
		b.box(Vector3(-42, 0, z - 0.2), Vector3(-38.6, 2.2, z + 0.2), "concrete_wall")
	for z0: float in [-7.8, -1.8, 4.2]:
		b.box(Vector3(-42, 0, z0), Vector3(-39.2, 1.1, z0 + 5.6), "coal", {"tint_var": 0.0})
		b.box(Vector3(-42, 1.1, z0 + 1.0), Vector3(-40.4, 1.7, z0 + 4.4), "coal", {"collide": false, "tint_var": 0.0})
	MapProps.forklift(b, Vector3(-33.2, 0, 3.6), 160)
	MapProps.container(b, Vector3(-31.75, 0, -3.6), 0, "container_green")
	MapProps.crate(b, Vector3(-36.0, 0, -7.6), Vector3(1.15, 1.15, 1.15), 7)
	MapProps.crate(b, Vector3(-37.0, 0, -8.5), Vector3(1.0, 1.0, 1.0), -12)
	b.label("B  >", Vector3(-29.98, 3.2, -6.0), -90, 110, Color(0.95, 0.78, 0.25, 0.9), {"pixel": 0.008})
	MapProps.wall_lamp(b, Vector3(-35.5, 5.2, -9.95), Vector3(0, 0, 1), Color(1, 0.84, 0.6), 1.6)
	MapProps.window_row(b, Vector3(-29.95, 4.6, 0), Vector3(-29.95, 4.6, 9), Vector3(-1, 0, 0), 3, 1.6, 1.2)

static func _workshop(b: MapBuilder) -> void:
	MapProps.workbench(b, Vector3(-10.0, 0, -0.55), 0, 2.4)
	MapProps.workbench(b, Vector3(-7.0, 0, -0.55), 0, 2.0)
	MapProps.shelf(b, Vector3(-17.0, 0, 6.65), 0, 3.0)
	MapProps.shelf(b, Vector3(-12.0, 0, 6.65), 0, 2.4)
	MapProps.machine(b, Vector3(-19.2, 0, 2.5), Vector3(1.4, 1.5, 2.4), 0, "container_orange")
	# Car up on stands mid-repair (cover in the middle of the room).
	b.box(Vector3(-14.2, 0.45, 2.2), Vector3(-9.8, 1.35, 4.0), "container_red", {"uv": "local"})
	b.box(Vector3(-13.2, 1.35, 2.35), Vector3(-10.8, 1.95, 3.85), "container_red", {"uv": "local"})
	b.box(Vector3(-13.15, 1.4, 2.32), Vector3(-10.85, 1.9, 3.88), "glass", {"collide": false})
	for x: float in [-13.4, -10.6]:
		for z: float in [2.3, 3.9]:
			b.box(Vector3(x - 0.15, 0, z - 0.15), Vector3(x + 0.15, 0.45, z + 0.15), "steel")
	for x: float in [-18.0, -13.0, -8.0]:
		MapProps.tube_light(b, Vector3(x, 4.12, 3.0), true, Color(0.9, 0.95, 1.0), 1.2, 8.0)
	MapProps.shelf(b, Vector3(-20.65, 0, -6.0), 90, 3.0)
	MapProps.crate_stack(b, Vector3(-15.8, 0, -8.8), 2)
	MapProps.tube_light(b, Vector3(-18.0, 4.12, -5.5), false, Color(0.9, 0.95, 1.0), 1.0, 7.0)
	MapProps.cabinet(b, Vector3(-5.55, 0, 5.8), -90, Vector3(0.8, 1.8, 0.5), "steel")

static func _skyline(b: MapBuilder) -> void:
	# Out-of-bounds silhouettes that read above the walls.
	b.cylinder(Transform3D(Basis(), Vector3(-46.5, 15.0, -44.0)), 1.5, 30.0, "brick_dark", {"collide": false, "segments": 16})
	b.cylinder(Transform3D(Basis(), Vector3(-46.5, 30.4, -44.0)), 1.7, 0.8, "concrete_dark", {"collide": false, "segments": 16})
	b.cylinder(Transform3D(Basis(), Vector3(-41.0, 12.0, -45.0)), 1.1, 24.0, "brick_red", {"collide": false, "segments": 14})
	# Water tower beyond A.
	for p in [Vector3(45.5, 0, -44.5), Vector3(48.5, 0, -44.5), Vector3(45.5, 0, -47.5), Vector3(48.5, 0, -47.5)]:
		b.box(p + Vector3(-0.15, 0, -0.15), p + Vector3(0.15, 15.0, 0.15), "steel", {"collide": false})
	b.cylinder(Transform3D(Basis(), Vector3(47.0, 17.5, -46.0)), 2.6, 5.0, "rust", {"collide": false, "segments": 18})
	# Distant buildings.
	b.box(Vector3(50, 0, -32), Vector3(64, 16, -6), "brick_dark", {"collide": false})
	b.box(Vector3(48, 0, 4), Vector3(60, 12, 30), "concrete_wall", {"collide": false})
	b.box(Vector3(-64, 0, -20), Vector3(-50, 14, 8), "brick_red", {"collide": false})
	b.box(Vector3(-24, 0, 46), Vector3(20, 15, 58), "brick_red", {"collide": false})
	b.box(Vector3(-16, 0, -62), Vector3(16, 24, -48), "plaster", {"collide": false})
	MapProps.window_row(b, Vector3(-15, 18, -47.95), Vector3(15, 18, -47.95), Vector3(0, 0, 1), 8, 2.0, 2.0, 3)
	MapProps.window_row(b, Vector3(-15, 14, -47.95), Vector3(15, 14, -47.95), Vector3(0, 0, 1), 8, 2.0, 2.0)
	MapProps.window_row(b, Vector3(49.95, 12, -30), Vector3(49.95, 12, -8), Vector3(-1, 0, 0), 6, 2.0, 2.0)

# ---------------------------------------------------------------------------

static func _markers(b: MapBuilder) -> void:
	var info := b.info
	# Spawns (yaw 0 faces north / -Z).
	for p in [Vector2(-6, 36.4), Vector2(-3, 37.4), Vector2(0, 36.4), Vector2(3, 37.4), Vector2(6, 36.4), Vector2(-8.5, 34.6), Vector2(8.5, 34.6), Vector2(0, 38.6)]:
		info.add_spawn(T, Vector3(p.x, 0.05, p.y), 0.0)
	for p in [Vector2(-6, -37.2), Vector2(-3, -38.2), Vector2(0, -37.2), Vector2(3, -38.2), Vector2(6, -37.2), Vector2(-4.5, -35.0), Vector2(4.5, -35.0), Vector2(0, -39.4)]:
		info.add_spawn(CT, Vector3(p.x, 0.05, p.y), 180.0)
	info.buy_zones[T].append(AABB(Vector3(-16, -1, 27), Vector3(32, 6, 13)))
	info.buy_zones[CT].append(AABB(Vector3(-10, -1, -41), Vector3(20, 6, 11)))
	info.bombsites[&"A"] = AABB(Vector3(22, 0.9, -35.5), Vector3(16.5, 4.0, 15.5))
	info.bombsites[&"B"] = AABB(Vector3(-38.5, -0.2, -34.5), Vector3(15, 4.0, 15))
	# Attack routes (attackers' preferred paths to each site).
	info.add_route("A Long", T, &"A", [Vector3(22, 0, 32), Vector3(35, 0, 29), Vector3(35, 0, 11), Vector3(35, 0, -2), Vector3(35, 0, -11.5), Vector3(36, 1.2, -21.5)])
	info.add_route("A Short", T, &"A", [Vector3(0, 0, 20), Vector3(4.5, 0, 6.5), Vector3(12, 0, 7.5), Vector3(18.5, 0, 0), Vector3(18.5, 1.2, -9), Vector3(18.5, 1.2, -16), Vector3(24, 1.2, -22.5)])
	info.add_route("B Tunnels", T, &"B", [Vector3(-24, 0, 32.5), Vector3(-31.5, 0, 32.5), Vector3(-36, 0, 23), Vector3(-36, 0, 2), Vector3(-35.5, 0, -10.5), Vector3(-33, 0, -18)])
	info.add_route("B Short", T, &"B", [Vector3(0, 0, 14), Vector3(-4.5, 0, 2.5), Vector3(-13, 0, 5.5), Vector3(-18, 0, -5), Vector3(-18.5, 0, -10.5), Vector3(-23, 0, -17)])
	info.add_route("Mid", T, &"mid", [Vector3(0, 0, 18), Vector3(0.5, 0, -2), Vector3(0.5, 0, -6.5), Vector3(0, 0, -20)])
	# Defender holds (look direction = yaw, 180 faces south / +Z).
	info.add_spot("Boxcar Gap", CT, Vector3(40.2, 0, -27.0), 180, ["hold", "A"])
	info.add_spot("Hut Corner", CT, Vector3(33.6, 1.2, -30.8), 165, ["hold", "A"])
	info.add_spot("Platform Back", CT, Vector3(25.0, 1.2, -34.6), 150, ["hold", "A"])
	info.add_spot("Stairs Top", CT, Vector3(22.4, 1.2, -30.5), 200, ["hold", "A"])
	info.add_spot("Mezzanine", CT, Vector3(-17.4, 3.25, -29.5), 225, ["hold", "B"])
	info.add_spot("Furnace", CT, Vector3(-36.0, 0, -33.6), 180, ["hold", "B"])
	info.add_spot("Press", CT, Vector3(-24.0, 0, -19.6), 135, ["hold", "B"])
	info.add_spot("Back Door", CT, Vector3(-17.0, 0, -36.5), 220, ["hold", "B"])
	info.add_spot("Ladle", CT, Vector3(-31.0, 0, -29.2), 180, ["hold", "B"])
	info.add_spot("Gatehouse", CT, Vector3(2.9, 0, -9.0), 180, ["hold", "mid"])
	info.add_spot("Mid Gate", CT, Vector3(-1.5, 0, -27.0), 180, ["hold", "mid"])
	# Defender retake rally points.
	info.add_spot("A Gate Rally", CT, Vector3(11.5, 0, -36.0), 90, ["rally", "A"])
	info.add_spot("Back Hall Rally", CT, Vector3(-12.0, 0, -36.0), -90, ["rally", "B"])
	# Plant spots.
	info.add_spot("A Default", T, Vector3(30.0, 1.2, -26.3), 0, ["plant", "A"])
	info.add_spot("A Hut", T, Vector3(33.6, 1.2, -29.2), 0, ["plant", "A"])
	info.add_spot("A Open", T, Vector3(25.5, 1.2, -24.5), 0, ["plant", "A"])
	info.add_spot("B Default", T, Vector3(-31.0, 0, -23.8), 0, ["plant", "B"])
	info.add_spot("B Crates", T, Vector3(-35.0, 0, -31.8), 0, ["plant", "B"])
	info.add_spot("B Pallet", T, Vector3(-27.6, 0, -30.2), 0, ["plant", "B"])
	# Post-plant positions for attackers.
	info.add_spot("Ramp Watch", T, Vector3(41.0, 0, -15.5), -30, ["postplant", "A"])
	info.add_spot("Walkway", T, Vector3(17.5, 1.2, -16.0), 220, ["postplant", "A"])
	info.add_spot("Pit", T, Vector3(29.5, 0, -14.2), 0, ["postplant", "A"])
	info.add_spot("B Main Inside", T, Vector3(-36.2, 0, -16.0), 20, ["postplant", "B"])
	info.add_spot("B Short Inside", T, Vector3(-18.5, 0, -14.5), -20, ["postplant", "B"])
	info.add_spot("Coal Yard", T, Vector3(-35.0, 0, -5.0), 0, ["postplant", "B", "lurk"])
	info.add_spot("Long Corner", T, Vector3(31.0, 0, -9.5), -10, ["lurk", "A"])
	# Radar: raised platforms.
	info.radar_raised = [Rect2(21, -36, 18.5, 17), Rect2(14, -24, 7, 12), Rect2(15, -11, 7, 4), Rect2(-20, -40, 5, 14)]

static func _callouts(b: MapBuilder) -> void:
	b.callout("A Site", Vector3(22, 0.9, -35.5), Vector3(38.5, 6, -20))
	b.callout("Ramp", Vector3(33, -1, -19), Vector3(39.5, 5, -13))
	b.callout("Walkway", Vector3(14, 0.9, -24), Vector3(21, 5, -12))
	b.callout("Boxcar", Vector3(39.5, -1, -38), Vector3(44, 6, -22))
	b.callout("A Back", Vector3(14, -1, -41), Vector3(44, 6, -36))
	b.callout("Pit", Vector3(21, -1, -19), Vector3(33, 4, -12))
	b.callout("Long Doors", Vector3(30, -1, 7), Vector3(40, 6, 13))
	b.callout("Long Corner", Vector3(30, -1, -11), Vector3(40, 6, -6))
	b.callout("B Site", Vector3(-38.5, -1, -34.5), Vector3(-23.5, 6, -19.5))
	b.callout("Mezzanine", Vector3(-20, 2.9, -40), Vector3(-15, 8, -26))
	b.callout("Furnace", Vector3(-44, -1, -41), Vector3(-36, 8, -34))
	b.callout("Gatehouse", Vector3(-4, -1, -9), Vector3(4, 6, -4))
	b.callout("Mid Gate", Vector3(-4, -1, -31), Vector3(4, 6, -24))
	b.callout("Lower Mid", Vector3(-4, -1, 9), Vector3(4, 6, 27))
