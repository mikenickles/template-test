class_name MeshMerge
## Combines sibling MeshInstance3D children (same parent, same space) into a
## single MeshInstance3D with one surface per material. Used on procedural
## weapons and characters: animated parts stay separate nodes, but the many
## static primitives under each part collapse into one draw-call group.

## Merges recursively; returns the merged MeshInstance3D nodes created.
static func merge_tree(root: Node3D) -> Array[MeshInstance3D]:
	var out: Array[MeshInstance3D] = []
	_merge_node(root, out)
	return out

static func _merge_node(node: Node3D, out: Array[MeshInstance3D]) -> void:
	for child in node.get_children():
		if child is Node3D and not (child is MeshInstance3D):
			_merge_node(child, out)
	var parts: Array[MeshInstance3D] = []
	for child in node.get_children():
		var mi := child as MeshInstance3D
		if mi and mi.get_child_count() == 0 and not mi.top_level and mi.mesh and mi.material_override and not String(mi.name).begins_with("_keep"):
			parts.append(mi)
	if parts.size() < 2:
		for p in parts:
			out.append(p)
		return
	var by_mat: Dictionary = {}
	for mi in parts:
		var key: Material = mi.material_override
		if not by_mat.has(key):
			by_mat[key] = []
		by_mat[key].append(mi)
	var mesh := ArrayMesh.new()
	for mat: Material in by_mat:
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		for mi: MeshInstance3D in by_mat[mat]:
			for s in mi.mesh.get_surface_count():
				st.append_from(mi.mesh, s, mi.transform)
		st.commit(mesh)
		mesh.surface_set_material(mesh.get_surface_count() - 1, mat)
	var merged := MeshInstance3D.new()
	merged.name = "Merged"
	merged.mesh = mesh
	merged.cast_shadow = parts[0].cast_shadow
	for mi in parts:
		node.remove_child(mi)
		mi.free()
	node.add_child(merged)
	out.append(merged)
