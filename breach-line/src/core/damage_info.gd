class_name DamageInfo
extends RefCounted
## Describes a single damage event before armor is applied.

var amount := 0.0
## Fraction of damage that still reaches health when armor absorbs (0-1).
var armor_penetration := 0.5
var hitgroup := GameConst.HitGroup.GENERIC
var attacker: Node = null
var weapon_id := &""
var direction := Vector3.ZERO
var position := Vector3.ZERO
var penetrated := false
var is_explosion := false

static func make(p_amount: float, p_attacker: Node, p_weapon: StringName, p_group: int = GameConst.HitGroup.GENERIC) -> DamageInfo:
	var d := DamageInfo.new()
	d.amount = p_amount
	d.attacker = p_attacker
	d.weapon_id = p_weapon
	d.hitgroup = p_group
	return d
