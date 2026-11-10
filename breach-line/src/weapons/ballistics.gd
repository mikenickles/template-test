class_name Ballistics
## Hitscan resolution: traces against world, props and hitboxes, applies
## locational damage with range falloff, and penetrates thin/soft surfaces.
## Returns impact records for effects; never touches FX itself.

const MAX_SEGMENTS := 4

## One bullet. `exclude` must contain the shooter's body and hitbox RIDs.
## Returns an Array of Dictionaries: {pos, normal, surface, exit, victim,
## hitgroup, damage}. The final entry also carries `end` for tracers.
static func fire_bullet(space: PhysicsDirectSpaceState3D, shooter: Node, origin: Vector3, dir: Vector3, w: WeaponData, exclude: Array[RID], damage_scale: float = 1.0) -> Array:
	var impacts: Array = []
	var dmg := w.damage * damage_scale
	var traveled := 0.0
	var pen_budget := w.penetration_power
	var from := origin
	var penetrated := false
	var excl := exclude.duplicate()
	for seg in MAX_SEGMENTS:
		var remaining := w.max_range - traveled
		if remaining <= 0.0:
			break
		var q := PhysicsRayQueryParameters3D.create(from, from + dir * remaining, GameConst.MASK_BULLET, excl)
		q.collide_with_areas = true
		var hit := space.intersect_ray(q)
		if hit.is_empty():
			impacts.append({"end": from + dir * minf(remaining, 120.0)})
			break
		traveled += from.distance_to(hit.position)
		var col: Object = hit.collider
		if col is Hitbox:
			var hb := col as Hitbox
			if hb.combatant == null or hb.combatant == shooter or not hb.combatant.alive:
				excl.append(hit.rid)
				from = hit.position
				continue
			var info := DamageInfo.new()
			info.amount = dmg * DamageModel.range_modifier(w.range_modifier, traveled)
			info.armor_penetration = w.armor_penetration
			info.hitgroup = hb.group
			info.attacker = shooter
			info.weapon_id = w.id
			info.direction = dir
			info.position = hit.position
			info.penetrated = penetrated
			var dealt := hb.combatant.apply_damage(info)
			impacts.append({"pos": hit.position, "normal": hit.normal, "surface": "flesh", "victim": hb.combatant,
				"hitgroup": hb.group, "damage": dealt, "end": hit.position})
			break
		var surface: String = col.get_meta("surface", "concrete") if col.has_method("get_meta") else "concrete"
		impacts.append({"pos": hit.position, "normal": hit.normal, "surface": surface, "end": hit.position})
		var pen: float = GameConst.SURFACE_PENETRATION.get(surface, 0.0)
		if pen <= 0.0 or pen_budget <= 0.0:
			break
		# Find the exit point by tracing back from the furthest possible exit.
		var max_thick := pen * pen_budget
		var probe: Vector3 = hit.position + dir * max_thick
		var q2 := PhysicsRayQueryParameters3D.create(probe, hit.position - dir * 0.001, GameConst.LAYER_WORLD | GameConst.LAYER_PROP)
		var back := space.intersect_ray(q2)
		if back.is_empty():
			break # probe is still inside solid material: too thick
		var thickness: float = hit.position.distance_to(back.position)
		if thickness > max_thick:
			break
		pen_budget -= thickness / pen
		dmg *= clampf(1.0 - thickness / maxf(max_thick, 0.01), 0.2, 1.0) * 0.75
		penetrated = true
		impacts.append({"pos": back.position, "normal": back.normal, "surface": surface, "exit": true, "end": back.position})
		from = back.position + dir * 0.02
	return impacts

## Melee trace: a fan of short rays; returns the first impact dictionary
## (same format as fire_bullet) or an empty dictionary on a miss.
static func melee_trace(space: PhysicsDirectSpaceState3D, shooter: Combatant, origin: Vector3, dir: Vector3, reach: float, exclude: Array[RID]) -> Dictionary:
	var right := dir.cross(Vector3.UP).normalized()
	if right == Vector3.ZERO:
		right = Vector3.RIGHT
	var best := {}
	var best_d := INF
	for off: Vector2 in [Vector2.ZERO, Vector2(0.12, 0), Vector2(-0.12, 0), Vector2(0, -0.1), Vector2(0, 0.08)]:
		var d := (dir + right * off.x + Vector3.UP * off.y).normalized()
		var q := PhysicsRayQueryParameters3D.create(origin, origin + d * reach, GameConst.MASK_BULLET, exclude)
		q.collide_with_areas = true
		var hit := space.intersect_ray(q)
		if hit.is_empty():
			continue
		var dist: float = origin.distance_to(hit.position)
		var is_body: bool = hit.collider is Hitbox and (hit.collider as Hitbox).combatant != shooter
		# Prefer bodies over walls at similar distance.
		if is_body:
			dist -= 0.3
		if dist < best_d:
			best_d = dist
			best = hit
	return best
