class_name DamageModel
## Pure functions for locational damage and armor absorption.
## Separated from Combatant so the rules are unit-testable.

## Result of resolving damage against a target's protection.
class Result:
	var health_damage := 0.0
	var armor_damage := 0.0
	var helmet_blocked := false

## Armor absorbs part of the damage on protected hit groups. Legs are never
## protected and the head is only protected by a helmet.
static func resolve(info: DamageInfo, armor: float, has_helmet: bool) -> Result:
	var r := Result.new()
	var dmg := info.amount
	if not info.is_explosion:
		dmg *= GameConst.HITGROUP_MULTIPLIER.get(info.hitgroup, 1.0)
	var protected := armor > 0.0 and info.hitgroup != GameConst.HitGroup.LEG
	if info.hitgroup == GameConst.HitGroup.HEAD and not has_helmet:
		protected = false
	if protected:
		var to_health := dmg * info.armor_penetration
		var to_armor := (dmg - to_health) * 0.5
		if to_armor > armor:
			# Armor ran out: the remainder bleeds through to health.
			to_health = dmg - armor * 2.0
			to_armor = armor
		r.health_damage = to_health
		r.armor_damage = to_armor
		r.helmet_blocked = info.hitgroup == GameConst.HitGroup.HEAD
	else:
		r.health_damage = dmg
	return r

## Linear-exponential range falloff: damage * modifier^(distance/10m).
static func range_modifier(range_mod: float, distance: float) -> float:
	return pow(range_mod, distance / 10.0)
