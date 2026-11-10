class_name MatchManager
extends Node
## Round-based match rules: teams, spawning, freeze/buy time, round timer,
## breach charge objective, win conditions, economy, scoring, side swap at
## halftime and match end. Also implements the objective interface used by
## TeamTactics (bomb_carrier / bomb_dropped / bomb_position / bomb_planted /
## bomb_site / time_left).

signal phase_changed(phase: int)
signal kill_feed(killer: PlayerRecord, victim: PlayerRecord, weapon_id: StringName, headshot: bool, penetrated: bool)

enum Phase { WARMUP, FREEZE, LIVE, PLANTED, ROUND_END, HALFTIME, MATCH_END }
enum EndReason { ELIMINATION, BOMB_EXPLODED, BOMB_DEFUSED, TIME_EXPIRED }

const T := GameConst.Team.ATTACKERS
const CT := GameConst.Team.DEFENDERS

var cfg := MatchConfig.new()
var map: GameMap
var world_root: Node3D
var difficulty := 1
var records: Array[PlayerRecord] = []
var local_record: PlayerRecord
var score := {T: 0, CT: 0}
var round_number := 0
var phase := Phase.WARMUP
var phase_time := 0.0
var round_elapsed := 0.0
var bomb: Bomb
var tactics := {}
var loss_streak := {T: 0, CT: 0}
var last_winner := 0
var last_reason := 0
var round_mvp: PlayerRecord
var history: Array = [] # [{round, winner, reason}]
var rng := RandomNumberGenerator.new()

var _new_half := true
var _bot_index := {T: 0, CT: 0}
var _use_held := {}

func setup(p_map: GameMap, p_root: Node3D, human: Combatant, human_team: int, p_difficulty: int) -> void:
	map = p_map
	world_root = p_root
	difficulty = p_difficulty
	name = "MatchManager"
	rng.randomize()
	for team in [T, CT]:
		var tt := TeamTactics.new(team, map.info)
		tt.objective = self
		tactics[team] = tt
	bomb = Bomb.new()
	world_root.add_child(bomb)
	bomb.setup(cfg, map.info)
	bomb.planted.connect(_on_bomb_planted)
	bomb.defused.connect(_on_bomb_defused)
	bomb.exploded.connect(_on_bomb_exploded)
	if human:
		local_record = _add_record(human_team, GameSettings.player_name, human)
	for team in [T, CT]:
		while team_records(team).size() < cfg.team_size:
			_add_record(team, "", null)
	Events.combatant_killed.connect(_on_killed)
	Events.combatant_damaged.connect(_on_damaged)

func _add_record(team: int, p_name: String, c: Combatant) -> PlayerRecord:
	var r := PlayerRecord.new()
	r.team = team
	r.money = cfg.start_money
	if c == null:
		c = BotFactory.create(world_root, team, _bot_index[team], map.info, tactics[team], difficulty)
		_bot_index[team] += 1
		r.is_bot = true
		r.name = c.display_name
	else:
		r.is_bot = false
		r.name = p_name
		c.display_name = p_name
	c.record = r
	r.combatant = c
	c.weapons.drop_requested.connect(func(w: WeaponInstance): _on_drop_requested(c, w))
	records.append(r)
	return r

func team_records(team: int) -> Array[PlayerRecord]:
	var out: Array[PlayerRecord] = []
	for r in records:
		if r.team == team:
			out.append(r)
	return out

func alive(team: int) -> Array:
	var out := []
	for r in records:
		if r.team == team and r.combatant and r.combatant.alive:
			out.append(r.combatant)
	return out

# ---------------------------------------------------------------------------
# Round flow
# ---------------------------------------------------------------------------

func start_match() -> void:
	score = {T: 0, CT: 0}
	round_number = 0
	history.clear()
	_new_half = true
	for r in records:
		r.money = cfg.start_money
		r.kills = 0
		r.deaths = 0
		r.assists = 0
		r.score = 0
		r.mvps = 0
	Events.match_started.emit()
	_begin_round()

func is_pistol_round() -> bool:
	return round_number == 1 or round_number == cfg.halftime_after + 1

func _begin_round() -> void:
	round_number += 1
	round_elapsed = 0.0
	round_mvp = null
	_set_phase(Phase.FREEZE, cfg.freeze_time)
	for ww in get_tree().get_nodes_in_group(&"world_weapons"):
		ww.queue_free()
	bomb.reset()
	for team in [T, CT]:
		var spawns: Array = map.info.spawns[team].duplicate()
		var recs := team_records(team)
		for i in recs.size():
			var r := recs[i]
			var c := r.combatant
			r.reset_round_stats()
			var survived := c.alive and round_number > 1 and not _new_half
			if not survived:
				c.weapons.clear()
				c.weapons.give(&"knife")
				c.weapons.give(&"p9", true)
				c.armor = 0.0
				c.has_helmet = false
				c.has_defuse_kit = false
			c.spawn_at(spawns[i % spawns.size()])
			c.frozen = true
			c.move_locked = false
			c.weapons.can_fire = false
			c.weapons.aim_punch = Vector2.ZERO
			if c.weapons.has_slot(GameConst.Slot.BOMB):
				c.weapons.take(GameConst.Slot.BOMB)
			# Equip the best weapon at round start.
			if c.weapons.has_slot(GameConst.Slot.PRIMARY):
				c.weapons.switch_to(GameConst.Slot.PRIMARY)
	_new_half = false
	var attackers := alive(T)
	if not attackers.is_empty():
		var carrier: Combatant = attackers[rng.randi_range(0, attackers.size() - 1)]
		bomb.give_to(carrier)
	_bots_buy()
	for team in [T, CT]:
		var mine := alive(team)
		var theirs := alive(GameConst.other_team(team))
		tactics[team].begin_round(mine, theirs)
	Events.round_started.emit(round_number)

func _bots_buy() -> void:
	for team in [T, CT]:
		var recs := team_records(team)
		var total := 0
		for r in recs:
			total += r.money
		var avg := float(total) / maxf(recs.size(), 1)
		for r in recs:
			if r.is_bot:
				BotBuyer.buy(r, avg, is_pistol_round(), loss_streak[team], rng, func(c, w): _spawn_world_weapon(c, w, false))

func _set_phase(p: int, t: float) -> void:
	phase = p
	phase_time = t
	phase_changed.emit(p)
	Events.round_phase_changed.emit(p, t)

func _go_live() -> void:
	_set_phase(Phase.LIVE, cfg.round_time)
	for r in records:
		r.combatant.frozen = false
		r.combatant.weapons.can_fire = true

func _physics_process(delta: float) -> void:
	match phase:
		Phase.FREEZE:
			phase_time -= delta
			if phase_time <= 0.0:
				_go_live()
		Phase.LIVE, Phase.PLANTED:
			var tm := Prof.begin()
			round_elapsed += delta
			if phase == Phase.LIVE:
				phase_time -= delta
			for team in [T, CT]:
				tactics[team].update(delta)
			bomb.update(delta, alive(T), alive(CT), true)
			_update_pickups()
			_check_win()
			Prof.end("match", tm)
		Phase.ROUND_END:
			phase_time -= delta
			bomb.update(delta, alive(T), alive(CT), false)
			_update_pickups()
			if phase_time <= 0.0:
				_after_round()
		Phase.HALFTIME:
			phase_time -= delta
			if phase_time <= 0.0:
				_swap_sides()
				_begin_round()

func _check_win() -> void:
	if phase != Phase.LIVE and phase != Phase.PLANTED:
		return
	var t_alive := alive(T).size()
	var ct_alive := alive(CT).size()
	if ct_alive == 0:
		_end_round(T, EndReason.ELIMINATION)
	elif t_alive == 0 and not bomb.is_planted():
		_end_round(CT, EndReason.ELIMINATION)
	elif phase == Phase.LIVE and phase_time <= 0.0:
		_end_round(CT, EndReason.TIME_EXPIRED)

func _end_round(winner: int, reason: int) -> void:
	if phase == Phase.ROUND_END or phase == Phase.MATCH_END:
		return
	var loser := GameConst.other_team(winner)
	var planted := bomb.state == Bomb.State.PLANTED or bomb.state == Bomb.State.EXPLODED or bomb.state == Bomb.State.DEFUSED
	score[winner] += 1
	last_winner = winner
	last_reason = reason
	history.append({"round": round_number, "winner": winner, "reason": reason})
	loss_streak[winner] = 0
	loss_streak[loser] = mini(loss_streak[loser] + 1, 5)
	var win_money := Economy.win_reward(cfg, reason)
	var loss_money := Economy.loss_bonus(cfg, loss_streak[loser])
	for r in records:
		if r.team == winner:
			_pay(r, win_money, "round win")
		else:
			var amount := loss_money
			# Attackers who survive a lost-on-time round earn nothing.
			if reason == EndReason.TIME_EXPIRED and r.team == T and r.combatant.alive:
				amount = 0
			if r.team == T and planted:
				amount += cfg.planted_loss_bonus
			_pay(r, amount, "round loss")
	# MVP: most kills this round on the winning side.
	var best: PlayerRecord = null
	for r in team_records(winner):
		if best == null or r.round_kills > best.round_kills:
			best = r
	if best and best.round_kills > 0:
		best.mvps += 1
		round_mvp = best
	for r in records:
		r.combatant.move_locked = false
	_set_phase(Phase.ROUND_END, cfg.round_end_time)
	Events.round_ended.emit(winner, reason)
	Events.announcement.emit(_end_text(winner, reason), GameConst.team_color(winner), cfg.round_end_time - 0.5)

func _end_text(winner: int, reason: int) -> String:
	var w := GameConst.team_name(winner).to_upper()
	match reason:
		EndReason.BOMB_EXPLODED: return "%s WIN — CHARGE DETONATED" % w
		EndReason.BOMB_DEFUSED: return "%s WIN — CHARGE DEFUSED" % w
		EndReason.TIME_EXPIRED: return "%s WIN — TIME EXPIRED" % w
	return "%s WIN" % w

func _after_round() -> void:
	var winner := last_winner
	if score[winner] >= cfg.rounds_to_win or round_number >= cfg.max_rounds:
		var final_winner := T if score[T] > score[CT] else (CT if score[CT] > score[T] else 0)
		_set_phase(Phase.MATCH_END, 0.0)
		Events.match_ended.emit(final_winner)
		return
	if round_number == cfg.halftime_after:
		_set_phase(Phase.HALFTIME, cfg.halftime_time)
		Events.halftime.emit()
		Events.announcement.emit("HALFTIME — SWITCHING SIDES", Color(0.95, 0.9, 0.8), cfg.halftime_time - 0.5)
		return
	_begin_round()

func _swap_sides() -> void:
	score = {T: score[CT], CT: score[T]}
	loss_streak = {T: 0, CT: 0}
	for r in records:
		r.team = GameConst.other_team(r.team)
		r.money = cfg.start_money
		var c := r.combatant
		c.alive = false # force a fresh loadout
		c.set_team(r.team)
		c.rebuild_model()
		if c.brain is BotBrain:
			(c.brain as BotBrain).tactics = tactics[r.team]
			(c.brain as BotBrain)._threat_cache.clear()
	_new_half = true

func _pay(r: PlayerRecord, amount: int, reason: String) -> void:
	if amount == 0:
		return
	var got := r.add_money(amount, cfg.max_money)
	Events.money_changed.emit(r, r.money, got, reason)

# ---------------------------------------------------------------------------
# Objective events
# ---------------------------------------------------------------------------

func _on_bomb_planted(site: StringName, planter: Combatant) -> void:
	if phase != Phase.LIVE:
		return
	_set_phase(Phase.PLANTED, cfg.bomb_timer)
	if planter and planter.record:
		_pay(planter.record, cfg.plant_reward, "plant")
		planter.record.score += 2
	Events.announcement.emit("CHARGE PLANTED — SITE %s" % site, GameConst.team_color(T), 3.0)

func _on_bomb_defused(defuser: Combatant) -> void:
	if defuser and defuser.record:
		_pay(defuser.record, cfg.defuse_reward, "defuse")
		defuser.record.score += 2
	if phase == Phase.PLANTED:
		_end_round(CT, EndReason.BOMB_DEFUSED)

func _on_bomb_exploded(_pos: Vector3) -> void:
	if phase == Phase.PLANTED:
		_end_round(T, EndReason.BOMB_EXPLODED)

# ---------------------------------------------------------------------------
# Kills, damage, drops, pickups
# ---------------------------------------------------------------------------

func _on_damaged(victim: Node, attacker: Node, dmg: float, _group: int) -> void:
	if not (victim is Combatant) or not (attacker is Combatant):
		return
	var vr: PlayerRecord = (victim as Combatant).record
	var ar: PlayerRecord = (attacker as Combatant).record
	if vr and ar and vr != ar:
		ar.damage_to[vr] = ar.damage_to.get(vr, 0.0) + dmg

func _on_killed(victim: Node, killer: Node, weapon_id: StringName, headshot: bool, penetrated: bool) -> void:
	if not (victim is Combatant):
		return
	var vc := victim as Combatant
	var vr: PlayerRecord = vc.record
	if vr == null or not (vr in records):
		return
	vr.deaths += 1
	var kr: PlayerRecord = (killer as Combatant).record if killer is Combatant else null
	if kr and kr != vr and kr.team != vr.team:
		kr.kills += 1
		kr.round_kills += 1
		kr.score += 2
		_pay(kr, Economy.kill_reward(weapon_id), "kill")
	for r in records:
		if r != kr and r.team != vr.team and r.damage_to.get(vr, 0.0) >= cfg.assist_damage:
			r.assists += 1
			r.score += 1
	kill_feed.emit(kr, vr, weapon_id, headshot, penetrated)
	# The victim's team learns where the shot came from (enables trades).
	if killer is Combatant and (killer as Combatant).alive and tactics.has(vr.team):
		tactics[vr.team].report_enemy(killer, (killer as Combatant).global_position)
	# Drop the best gun.
	var drop := vc.weapons.get_slot(GameConst.Slot.PRIMARY)
	var slot := GameConst.Slot.PRIMARY
	if drop == null:
		drop = vc.weapons.get_slot(GameConst.Slot.SECONDARY)
		slot = GameConst.Slot.SECONDARY
	if drop and phase != Phase.WARMUP:
		vc.weapons.take(slot)
		_spawn_world_weapon(vc, drop, true)
	if bomb.carrier == vc:
		bomb.drop(vc.global_position)
	if phase == Phase.LIVE or phase == Phase.PLANTED:
		_check_win()

func _on_drop_requested(c: Combatant, w: WeaponInstance) -> void:
	if w.data.category == "bomb":
		if bomb.carrier == c:
			var fwd := c.view_direction()
			fwd.y = 0.0
			bomb.drop(c.global_position, fwd.normalized() * 1.5)
		return
	if w.data.is_melee():
		return
	c.weapons.take(w.data.slot)
	_spawn_world_weapon(c, w, false)

func _spawn_world_weapon(c: Combatant, w: WeaponInstance, death: bool) -> WorldWeapon:
	var ww := WorldWeapon.new()
	var fwd := c.view_direction()
	var pos := c.global_position + Vector3(0, 1.1, 0) + (Vector3.ZERO if death else fwd * 0.5)
	var vel := (Vector3(randf_range(-1, 1), 1.0, randf_range(-1, 1)) if death else fwd * 4.0 + Vector3.UP * 1.0) + c.velocity * 0.5
	world_root.add_child(ww)
	ww.setup(w, pos, vel, c)
	return ww

func _update_pickups() -> void:
	var weapons := get_tree().get_nodes_in_group(&"world_weapons")
	if weapons.is_empty():
		return
	for r in records:
		var c := r.combatant
		if not c.alive:
			continue
		var use_pressed: bool = c.intent.use and not _use_held.get(c, false)
		_use_held[c] = c.intent.use
		for node in weapons:
			var ww := node as WorldWeapon
			if ww == null or ww.is_queued_for_deletion() or ww.pickup_block > 0.0:
				continue
			var slot := ww.instance.data.slot
			var d := ww.global_position.distance_to(c.global_position + Vector3(0, 0.4, 0))
			if d < 1.3 and not c.weapons.has_slot(slot):
				_pickup(c, ww)
				break
			# E to swap with what you're looking at.
			if use_pressed and d < 2.4 and c.view_direction().dot((ww.global_position - c.eye_position()).normalized()) > 0.9:
				var old := c.weapons.take(slot)
				if old:
					_spawn_world_weapon(c, old, false)
				_pickup(c, ww)
				break

func _pickup(c: Combatant, ww: WorldWeapon) -> void:
	var inst := ww.instance
	c.weapons.inventory[inst.data.slot] = inst
	c.weapons.inventory_changed.emit()
	var active := c.weapons.active
	if active == null or active.data.is_melee() or (inst.data.slot == GameConst.Slot.PRIMARY and active.data.slot != GameConst.Slot.PRIMARY):
		c.weapons.switch_to(inst.data.slot)
	ww.remove_from_group(&"world_weapons")
	ww.queue_free()
	Audio.play_3d("weapons/weapon_draw", c.global_position + Vector3(0, 1, 0), -8.0, 0.05, 15.0)

# ---------------------------------------------------------------------------
# Buying (human)
# ---------------------------------------------------------------------------

func buy_time_left() -> float:
	var elapsed := (cfg.freeze_time - phase_time) if phase == Phase.FREEZE else cfg.freeze_time + round_elapsed
	return cfg.buy_time - elapsed

func can_buy(r: PlayerRecord) -> String:
	if not (phase == Phase.FREEZE or phase == Phase.LIVE):
		return "not now"
	if buy_time_left() <= 0.0:
		return "buy time over"
	if r.combatant == null or not r.combatant.alive:
		return "dead"
	if not map.info.in_buy_zone(r.team, r.combatant.global_position):
		return "outside buy zone"
	return ""

func try_buy(r: PlayerRecord, item: StringName) -> String:
	var why := can_buy(r)
	if why == "":
		why = BuySystem.check(r, item)
	if why != "":
		return why
	BuySystem.buy(r, item, func(c, w): _spawn_world_weapon(c, w, false))
	return ""

# ---------------------------------------------------------------------------
# Objective interface for TeamTactics
# ---------------------------------------------------------------------------

func bomb_carrier() -> Combatant:
	return bomb.carrier if bomb.state == Bomb.State.CARRIED else null

func bomb_dropped() -> bool:
	return bomb.state == Bomb.State.DROPPED

func bomb_position() -> Vector3:
	return bomb.position_now()

func bomb_planted() -> bool:
	return bomb.state == Bomb.State.PLANTED

func bomb_site() -> StringName:
	return bomb.site

func time_left() -> float:
	if phase == Phase.PLANTED:
		return bomb.time_left
	if phase == Phase.LIVE:
		return phase_time
	return cfg.round_time
