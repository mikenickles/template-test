extends Node3D
## Visual effects service (impacts, decals, tracers, muzzle lights).
## Expanded in Phase 4; Phase 1 provides the lifecycle API only.

func clear() -> void:
	for c in get_children():
		c.queue_free()
