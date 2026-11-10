class_name WorldWeapon
extends RigidBody3D
## A weapon lying in the world (dropped on death or with G). Keeps its ammo.
## Picked up automatically by walking over it when the slot is free, or
## swapped with E while looking at it.

var instance: WeaponInstance
var pickup_block := 0.5
var dropper: Combatant

func setup(inst: WeaponInstance, pos: Vector3, vel: Vector3, from: Combatant) -> void:
	instance = inst
	dropper = from
	name = "World_%s" % inst.data.id
	collision_layer = GameConst.LAYER_PROP
	collision_mask = GameConst.LAYER_WORLD
	mass = 3.0
	continuous_cd = true
	linear_damp = 0.4
	angular_damp = 1.5
	var cs := CollisionShape3D.new()
	var s := BoxShape3D.new()
	s.size = Vector3(0.08, 0.14, 0.7 if inst.data.slot == GameConst.Slot.PRIMARY else 0.25)
	cs.shape = s
	add_child(cs)
	var model := WeaponModels.build(inst.data.model)
	add_child(model)
	add_to_group(&"world_weapons")
	top_level = true
	global_position = pos
	rotation = Vector3(0, randf() * TAU, PI * 0.5)
	linear_velocity = vel
	angular_velocity = Vector3(randf_range(-3, 3), randf_range(-3, 3), randf_range(-3, 3))

func _physics_process(delta: float) -> void:
	pickup_block -= delta
	if global_position.y < -20.0:
		queue_free()
