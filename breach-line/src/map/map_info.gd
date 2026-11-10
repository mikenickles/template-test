class_name MapInfo
extends Node
## Gameplay-facing description of a built map: spawns, objectives, callout
## zones, AI tactical markers and a coarse walkability grid for the radar.
## Produced by MapBuilder; consumed by MatchManager, AI, HUD and tests.

class Spot:
	var pos: Vector3
	var yaw: float # radians, facing direction
	var team: int
	var tags: PackedStringArray
	var name: String
	func _to_string() -> String:
		return "Spot(%s %s)" % [name, pos]

class Route:
	var name: String
	var team: int
	var site: StringName
	var points: PackedVector3Array

var map_name := ""
var bounds := Rect2(-50, -50, 100, 100)
## team -> Array[Transform3D]
var spawns := {GameConst.Team.ATTACKERS: [], GameConst.Team.DEFENDERS: []}
## site name (&"A"/&"B") -> AABB
var bombsites := {}
## team -> Array[AABB]
var buy_zones := {GameConst.Team.ATTACKERS: [], GameConst.Team.DEFENDERS: []}
## Named callout regions, checked in order (first match wins): [name, AABB]
var callouts: Array = []
var spots: Array[Spot] = []
var routes: Array[Route] = []

# Radar / surface grid (1 m cells). cell value: -1 solid, else floor surface idx.
var grid_origin := Vector2i.ZERO
var grid_size := Vector2i.ZERO
var walkable := PackedByteArray()
var surface_ids := PackedByteArray()
var surface_names: PackedStringArray = []
## Rects (x, z, w, h) + heights of raised platforms for the radar.
var radar_raised: Array = []

func add_spawn(team: int, pos: Vector3, yaw_deg: float) -> void:
	var t := Transform3D(Basis(Vector3.UP, deg_to_rad(yaw_deg)), pos)
	spawns[team].append(t)

func add_spot(spot_name: String, team: int, pos: Vector3, yaw_deg: float, tags: Array) -> Spot:
	var s := Spot.new()
	s.name = spot_name
	s.team = team
	s.pos = pos
	s.yaw = deg_to_rad(yaw_deg)
	s.tags = PackedStringArray(tags)
	spots.append(s)
	return s

func add_route(route_name: String, team: int, site: StringName, pts: Array) -> Route:
	var r := Route.new()
	r.name = route_name
	r.team = team
	r.site = site
	r.points = PackedVector3Array(pts)
	routes.append(r)
	return r

func spots_with(tag: String, team: int = -1) -> Array[Spot]:
	var out: Array[Spot] = []
	for s in spots:
		if tag in s.tags and (team < 0 or s.team == team or s.team == GameConst.Team.NONE):
			out.append(s)
	return out

func routes_to(site: StringName, team: int) -> Array[Route]:
	var out: Array[Route] = []
	for r in routes:
		if r.site == site and r.team == team:
			out.append(r)
	return out

func site_at(pos: Vector3) -> StringName:
	for site in bombsites:
		if (bombsites[site] as AABB).has_point(pos):
			return site
	return &""

func in_buy_zone(team: int, pos: Vector3) -> bool:
	for a: AABB in buy_zones.get(team, []):
		if a.has_point(pos + Vector3(0, 0.5, 0)):
			return true
	return false

func callout_at(pos: Vector3) -> String:
	for c in callouts:
		if (c[1] as AABB).has_point(pos):
			return c[0]
	return ""

func site_center(site: StringName) -> Vector3:
	var a: AABB = bombsites.get(site, AABB())
	return a.get_center() - Vector3(0, a.size.y * 0.5, 0)

func _cell_index(pos: Vector3) -> int:
	var cx := int(floor(pos.x)) - grid_origin.x
	var cz := int(floor(pos.z)) - grid_origin.y
	if cx < 0 or cz < 0 or cx >= grid_size.x or cz >= grid_size.y:
		return -1
	return cz * grid_size.x + cx

func is_walkable_cell(pos: Vector3) -> bool:
	var i := _cell_index(pos)
	return i >= 0 and walkable[i] == 1

## Floor surface name under a position (used for footsteps on zone floors).
func floor_surface_at(pos: Vector3) -> String:
	var i := _cell_index(pos)
	if i < 0 or walkable[i] == 0:
		return "concrete"
	return surface_names[surface_ids[i]]
