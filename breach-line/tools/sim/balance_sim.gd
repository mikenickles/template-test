extends Node
## Headless balance simulator: plays bot-only matches and reports side win
## rates, end reasons, plant/defuse rates, first-kill timing and kill
## locations. Usage:
##   godot --headless --fixed-fps 60 --path . res://tools/sim/balance_sim.tscn -- --rounds=40 [--difficulty=1]

var rounds_target := 40
var difficulty := 1
var stats := {
	"rounds": 0, "t_wins": 0, "ct_wins": 0, "reasons": [0, 0, 0, 0], "plants": 0, "defuses": 0,
	"plant_sites": {}, "attack_sites": {}, "site_wins": {}, "first_kill": [], "first_kill_side": {1: 0, 2: 0},
	"kill_zones": {}, "round_times": [], "weapon_kills": {},
}
var _first_kill_done := false
var mm: MatchManager
var map: GameMap

func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--rounds="):
			rounds_target = int(arg.substr(9))
		elif arg.begins_with("--difficulty="):
			difficulty = int(arg.substr(13))
	map = GameMap.new()
	map.apply_environment = false
	add_child(map)
	await map.await_navigation_ready()
	Events.round_ended.connect(_on_round_end)
	Events.bomb_planted.connect(func(_p, site, _pos): stats.plants += 1; stats.plant_sites[site] = stats.plant_sites.get(site, 0) + 1)
	Events.bomb_defused.connect(func(_d): stats.defuses += 1)
	Events.combatant_killed.connect(_on_kill)
	Events.round_started.connect(func(_n): _first_kill_done = false)
	var t0 := Time.get_ticks_msec()
	while stats.rounds < rounds_target:
		_new_match()
		while mm.phase != MatchManager.Phase.MATCH_END and stats.rounds < rounds_target:
			await get_tree().physics_frame
		mm.queue_free()
		for c in get_tree().get_nodes_in_group(&"combatants"):
			c.queue_free()
		await get_tree().process_frame
	_report((Time.get_ticks_msec() - t0) / 1000.0)
	get_tree().quit()

func _new_match() -> void:
	mm = MatchManager.new()
	mm.cfg.round_end_time = 1.0
	mm.cfg.halftime_time = 1.0
	map.add_child(mm)
	mm.setup(map, map, null, GameConst.Team.ATTACKERS, difficulty)
	mm.start_match()

func _on_round_end(winner: int, reason: int) -> void:
	stats.rounds += 1
	if winner == GameConst.Team.ATTACKERS:
		stats.t_wins += 1
	else:
		stats.ct_wins += 1
	stats.reasons[reason] += 1
	stats.round_times.append(mm.round_elapsed)
	var site: StringName = mm.tactics[GameConst.Team.ATTACKERS].target_site
	stats.attack_sites[site] = stats.attack_sites.get(site, 0) + 1
	if winner == GameConst.Team.ATTACKERS:
		stats.site_wins[site] = stats.site_wins.get(site, 0) + 1

func _on_kill(victim: Node, killer: Node, weapon_id: StringName, _h: bool, _p: bool) -> void:
	if mm == null or not (victim is Combatant):
		return
	var v := victim as Combatant
	var zone := map.info.callout_at(v.global_position)
	var key := "%s:%s" % [GameConst.team_name(v.team), zone]
	stats.kill_zones[key] = stats.kill_zones.get(key, 0) + 1
	stats.weapon_kills[weapon_id] = stats.weapon_kills.get(weapon_id, 0) + 1
	if not _first_kill_done and killer is Combatant:
		_first_kill_done = true
		stats.first_kill.append(mm.round_elapsed)
		stats.first_kill_side[(killer as Combatant).team] += 1

func _report(secs: float) -> void:
	var n: int = stats.rounds
	print("\n==== BALANCE REPORT (%d rounds, difficulty %d, %.0fs real) ====" % [n, difficulty, secs])
	print("Attackers win %.0f%%  |  Defenders win %.0f%%" % [100.0 * stats.t_wins / n, 100.0 * stats.ct_wins / n])
	print("End reasons: elimination %d, detonation %d, defuse %d, time %d" % stats.reasons)
	print("Plants %d (%.0f%% of rounds) by site %s; defuses %d" % [stats.plants, 100.0 * stats.plants / n, stats.plant_sites, stats.defuses])
	var site_lines := []
	for s in stats.attack_sites:
		site_lines.append("%s: %d attacks, %d wins" % [s, stats.attack_sites[s], stats.site_wins.get(s, 0)])
	print("Attack sites: ", ", ".join(site_lines))
	var fk: Array = stats.first_kill
	fk.sort()
	if not fk.is_empty():
		print("First kill: median %.1fs, by attackers %d / defenders %d" % [fk[fk.size() / 2], stats.first_kill_side[1], stats.first_kill_side[2]])
	var rt: Array = stats.round_times
	rt.sort()
	print("Round length median %.0fs" % rt[rt.size() / 2])
	var zones: Array = stats.kill_zones.keys()
	zones.sort_custom(func(a, b): return stats.kill_zones[a] > stats.kill_zones[b])
	print("Deaths by area (victim side:area):")
	for z in zones.slice(0, 14):
		print("   %3d  %s" % [stats.kill_zones[z], z])
	print("Kills by weapon: ", stats.weapon_kills)
