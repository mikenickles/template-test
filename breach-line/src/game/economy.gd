class_name Economy
## Pure economy rules (testable without scenes).

## Round-win reward by end reason (MatchManager.EndReason).
static func win_reward(cfg: MatchConfig, reason: int) -> int:
	match reason:
		1: return cfg.reward_win_bomb # BOMB_EXPLODED
		2: return cfg.reward_win_defuse # BOMB_DEFUSED
		3: return cfg.reward_win_time # TIME_EXPIRED
	return cfg.reward_win_elimination

## Loss bonus grows with consecutive losses (streak counts the current loss).
static func loss_bonus(cfg: MatchConfig, streak: int) -> int:
	return mini(cfg.loss_bonus_base + cfg.loss_bonus_step * maxi(streak - 1, 0), cfg.loss_bonus_max)

static func kill_reward(weapon_id: StringName) -> int:
	var d := WeaponDB.get_data(weapon_id)
	return d.kill_reward if d else 300
