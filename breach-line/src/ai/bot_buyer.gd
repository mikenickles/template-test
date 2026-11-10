class_name BotBuyer
## Bot purchasing: team-aware economy (full buy / force / eco / pistol round).

## `team_avg` is the team's average money; `pistol_round` for round 1/half.
static func buy(rec: PlayerRecord, team_avg: float, pistol_round: bool, loss_streak: int, rng: RandomNumberGenerator, drop_fn: Callable = Callable()) -> Array[StringName]:
	var bought: Array[StringName] = []
	var c := rec.combatant
	if c == null:
		return bought
	var rifle := &"ravager" if rec.team == GameConst.Team.ATTACKERS else &"sentinel"
	var has_primary := c.weapons.has_slot(GameConst.Slot.PRIMARY)
	if pistol_round:
		if rng.randf() < 0.55:
			_try(rec, &"kevlar", bought, drop_fn)
		else:
			_try(rec, &"hand_cannon", bought, drop_fn)
		return bought
	var full_buy_cost := WeaponDB.get_data(rifle).price + 1000
	var eco := team_avg < 2600 and rec.money < full_buy_cost and loss_streak < 3
	if has_primary:
		_top_up_gear(rec, bought, drop_fn)
		return bought
	if rec.money >= full_buy_cost:
		if rec.money >= 4750 + 1000 and rng.randf() < 0.18:
			_try(rec, &"longbow", bought, drop_fn)
		else:
			_try(rec, rifle, bought, drop_fn)
		_top_up_gear(rec, bought, drop_fn)
	elif eco:
		# Save, maybe an upgraded pistol if flush enough to afford it.
		if rec.money >= 2200 and rng.randf() < 0.4:
			_try(rec, &"hand_cannon", bought, drop_fn)
	elif rec.money >= 1850:
		# Force buy: SMG or shotgun plus vest.
		_try(rec, &"vx9" if rng.randf() < 0.7 else &"breacher12", bought, drop_fn)
		_try(rec, &"kevlar", bought, drop_fn)
	else:
		_try(rec, &"kevlar", bought, drop_fn)
	return bought

static func _top_up_gear(rec: PlayerRecord, bought: Array[StringName], drop_fn: Callable) -> void:
	if not _try(rec, &"kevlar_helmet", bought, drop_fn):
		_try(rec, &"kevlar", bought, drop_fn)
	if rec.team == GameConst.Team.DEFENDERS and rec.money >= 400:
		_try(rec, &"defuse_kit", bought, drop_fn)

static func _try(rec: PlayerRecord, item: StringName, bought: Array[StringName], drop_fn: Callable) -> bool:
	if BuySystem.buy(rec, item, drop_fn):
		bought.append(item)
		return true
	return false
