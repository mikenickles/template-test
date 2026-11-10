class_name Hitbox
extends Area3D
## One damageable body part. Lives on the hitbox physics layer, which only
## bullet/melee traces query (movement never collides with it).

var combatant: Combatant
var group := GameConst.HitGroup.CHEST

func _init(p_combatant: Combatant = null, p_group: int = GameConst.HitGroup.CHEST) -> void:
	combatant = p_combatant
	group = p_group
	collision_layer = GameConst.LAYER_HITBOX
	collision_mask = 0
	monitoring = false
	monitorable = true

static func make_box(owner: Combatant, grp: int, size: Vector3, offset: Vector3 = Vector3.ZERO) -> Hitbox:
	var hb := Hitbox.new(owner, grp)
	var cs := CollisionShape3D.new()
	var s := BoxShape3D.new()
	s.size = size
	cs.shape = s
	cs.position = offset
	hb.add_child(cs)
	return hb

## Capsule along local Y, or along local Z when `along_z` (limb bones that
## point down -Z).
static func make_capsule(owner: Combatant, grp: int, radius: float, height: float, offset: Vector3 = Vector3.ZERO, along_z: bool = false) -> Hitbox:
	var hb := Hitbox.new(owner, grp)
	var cs := CollisionShape3D.new()
	var s := CapsuleShape3D.new()
	s.radius = radius
	s.height = maxf(height, radius * 2.0)
	cs.shape = s
	cs.position = offset
	if along_z:
		cs.rotation_degrees = Vector3(90, 0, 0)
	hb.add_child(cs)
	return hb
