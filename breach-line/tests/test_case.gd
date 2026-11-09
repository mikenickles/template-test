class_name TestCase
extends Node
## Base class for headless tests. Subclasses define `test_*` methods, which
## may be coroutines (await physics frames, spawn scenes, etc.).
## Assertions record failures instead of aborting so one run reports all.

var failures: Array[String] = []
var current_test := ""
var assertions := 0

func before_each() -> void:
	pass

func after_each() -> void:
	pass

func fail(msg: String) -> void:
	failures.append("%s: %s" % [current_test, msg])

func check(cond: bool, msg: String = "expected true") -> bool:
	assertions += 1
	if not cond:
		fail(msg)
	return cond

func check_eq(actual, expected, msg: String = "") -> bool:
	assertions += 1
	if typeof(actual) != typeof(expected) and not (_is_num(actual) and _is_num(expected)):
		fail("%s expected %s (%s) got %s (%s)" % [msg, str(expected), type_string(typeof(expected)), str(actual), type_string(typeof(actual))])
		return false
	if actual != expected:
		fail("%s expected %s got %s" % [msg, str(expected), str(actual)])
		return false
	return true

func check_near(actual: float, expected: float, tol: float, msg: String = "") -> bool:
	assertions += 1
	if absf(actual - expected) > tol:
		fail("%s expected %.4f±%.4f got %.4f" % [msg, expected, tol, actual])
		return false
	return true

func check_range(actual: float, lo: float, hi: float, msg: String = "") -> bool:
	assertions += 1
	if actual < lo or actual > hi:
		fail("%s expected in [%.3f, %.3f] got %.4f" % [msg, lo, hi, actual])
		return false
	return true

func _is_num(v) -> bool:
	return typeof(v) == TYPE_INT or typeof(v) == TYPE_FLOAT

func wait_physics(frames: int = 1) -> void:
	for i in frames:
		await get_tree().physics_frame

func wait_frames(frames: int = 1) -> void:
	for i in frames:
		await get_tree().process_frame
