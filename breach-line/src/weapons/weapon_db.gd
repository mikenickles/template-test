class_name WeaponDB
## Registry of WeaponData resources loaded from res://data/weapons.

const DIR := "res://data/weapons/"
static var _by_id: Dictionary = {}

static func _ensure() -> void:
	if not _by_id.is_empty():
		return
	for f in ResourceLoader.list_directory(DIR):
		var path := DIR + f.trim_suffix(".remap")
		if not path.ends_with(".tres"):
			continue
		var d := load(path) as WeaponData
		if d and d.id != &"":
			_by_id[d.id] = d

static func get_data(id: StringName) -> WeaponData:
	_ensure()
	return _by_id.get(id)

static func all() -> Array[WeaponData]:
	_ensure()
	var out: Array[WeaponData] = []
	for d in _by_id.values():
		out.append(d)
	out.sort_custom(func(a: WeaponData, b: WeaponData): return a.price < b.price)
	return out

static func ids() -> Array:
	_ensure()
	return _by_id.keys()
