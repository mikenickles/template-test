class_name ScriptBrain
extends Node
## Test/AI helper brain: calls `fn(combatant, intent, delta)` every tick.

var fn: Callable
var ticks := 0

func _init(f: Callable = Callable()) -> void:
	fn = f

func update_intent(c: Combatant, intent: CombatIntent, delta: float) -> void:
	ticks += 1
	if fn.is_valid():
		fn.call(c, intent, delta)
