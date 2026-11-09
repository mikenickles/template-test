extends Node
## Headless test runner. Usage (from the project directory):
##   godot --headless --path . res://tests/test_runner.tscn [-- --filter=name]
## Runs every tests/test_*.gd script's test_* methods and exits with code 1 on
## any failure. tools/run_tests.sh additionally fails on engine SCRIPT ERRORs.

const TEST_DIR := "res://tests/"

func _ready() -> void:
	await get_tree().process_frame
	var filter := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--filter="):
			filter = arg.substr(9)
	var files := Array(DirAccess.get_files_at(TEST_DIR))
	files.sort()
	var total := 0
	var failed := 0
	var all_failures: Array[String] = []
	var started := Time.get_ticks_msec()
	for f: String in files:
		if not (f.begins_with("test_") and f.ends_with(".gd")) or f == "test_runner.gd" or f == "test_case.gd":
			continue
		var script: Script = load(TEST_DIR + f)
		if script == null:
			all_failures.append("%s: failed to load" % f)
			failed += 1
			continue
		var suite: TestCase = script.new()
		suite.name = f.get_basename()
		add_child(suite)
		for m in suite.get_method_list():
			var mname: String = m["name"]
			if not mname.begins_with("test_"):
				continue
			if filter != "" and not (f + ":" + mname).contains(filter):
				continue
			total += 1
			suite.current_test = "%s:%s" % [f.get_basename(), mname]
			var before := suite.failures.size()
			var t0 := Time.get_ticks_msec()
			await suite.before_each()
			await suite.call(mname)
			await suite.after_each()
			var dt := Time.get_ticks_msec() - t0
			if suite.failures.size() > before:
				failed += 1
				print("  FAIL  %s (%d ms)" % [suite.current_test, dt])
				for i in range(before, suite.failures.size()):
					print("        - " + suite.failures[i])
			else:
				print("  ok    %s (%d ms)" % [suite.current_test, dt])
		all_failures.append_array(suite.failures)
		suite.queue_free()
		await get_tree().process_frame
	print("")
	print("%d tests, %d failed, %.1fs" % [total, failed, (Time.get_ticks_msec() - started) / 1000.0])
	if failed == 0 and total > 0:
		print("ALL TESTS PASSED")
	get_tree().quit(1 if failed > 0 or total == 0 else 0)
