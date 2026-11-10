extends TestCase
## Loads every script in the project so compile errors fail the suite.

func _collect(dir: String, out: Array[String]) -> void:
	for f in DirAccess.get_files_at(dir):
		if f.ends_with(".gd"):
			out.append(dir.path_join(f))
	for d in DirAccess.get_directories_at(dir):
		if not d.begins_with("."):
			_collect(dir.path_join(d), out)

func test_all_scripts_compile() -> void:
	var files: Array[String] = []
	for root in ["res://src", "res://scenes", "res://tests"]:
		_collect(root, files)
	check(files.size() > 10, "found scripts")
	for f in files:
		var s: Script = load(f)
		check(s != null and s.can_instantiate() or (s != null and not (s as GDScript).get_instance_base_type().is_empty()), "script fails to load: " + f)
