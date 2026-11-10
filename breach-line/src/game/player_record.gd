class_name PlayerRecord
extends RefCounted
## Persistent per-player match state (survives respawns and side swaps).

var name := ""
var team := GameConst.Team.ATTACKERS
var is_bot := true
var money := 800
var kills := 0
var deaths := 0
var assists := 0
var score := 0
var mvps := 0
var round_kills := 0
var combatant: Combatant
## Damage dealt this round per victim record (for assists).
var damage_to: Dictionary = {}

func reset_round_stats() -> void:
	round_kills = 0
	damage_to.clear()

func add_money(amount: int, cap: int) -> int:
	var before := money
	money = clampi(money + amount, 0, cap)
	return money - before
