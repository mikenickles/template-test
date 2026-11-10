extends Node
## Measures CPU cost of simulation + AI during a live 5v5 bot match
## (headless; rendering excluded). Usage:
##   godot --headless --fixed-fps 60 --path . res://tools/sim/perf_probe.tscn

func _ready() -> void:
	var map := GameMap.new()
	map.apply_environment = false
	add_child(map)
	await map.await_navigation_ready()
	print("map build %.0f ms, navmesh bake %.0f ms, %d meshes, %d collision shapes, %d lights" % [map.build_stats.build_ms, map.build_stats.nav_ms, map.build_stats.meshes, map.build_stats.shapes, map.build_stats.lights])
	var no_bots := "--no-bots" in OS.get_cmdline_user_args()
	Combatant.default_build_model = not ("--no-models" in OS.get_cmdline_user_args())
	if no_bots:
		var s2: Array[float] = []
		for i in 600:
			await get_tree().physics_frame
			s2.append(Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0)
		s2.sort()
		print("baseline (no bots) physics tick median %.2f ms" % s2[s2.size() / 2])
		get_tree().quit()
		return
	var mm := MatchManager.new()
	mm.cfg.freeze_time = 1.0
	map.add_child(mm)
	mm.setup(map, map, null, GameConst.Team.ATTACKERS, 1)
	mm.start_match()
	Prof.enabled = true
	var samples: Array[float] = []
	var last := Time.get_ticks_usec()
	for i in 60 * 45:
		await get_tree().physics_frame
		var now := Time.get_ticks_usec()
		if i > 120:
			samples.append((now - last) / 1000.0)
		last = now
	samples.sort()
	var avg := 0.0
	for s in samples:
		avg += s
	avg /= samples.size()
	print("wall-clock per simulated tick (physics + AI + scripts, no rendering): avg %.2f ms, p95 %.2f ms, max %.2f ms over %d ticks (budget at 60 Hz: 16.7 ms)" % [avg, samples[int(samples.size() * 0.95)], samples[-1], samples.size()])
	print("breakdown (script time per physics tick):\n" + Prof.report(60 * 45))
	print("objects: %d nodes, %d physics bodies" % [Performance.get_monitor(Performance.OBJECT_NODE_COUNT), Performance.get_monitor(Performance.PHYSICS_3D_ACTIVE_OBJECTS)])
	get_tree().quit()
