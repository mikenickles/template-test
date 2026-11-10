class_name Prof
## Tiny opt-in section profiler (accumulates microseconds per label).

static var enabled := false
static var totals: Dictionary = {}
static var counts: Dictionary = {}

static func begin() -> int:
	return Time.get_ticks_usec() if enabled else 0

static func end(label: String, t0: int) -> void:
	if not enabled:
		return
	totals[label] = totals.get(label, 0) + Time.get_ticks_usec() - t0
	counts[label] = counts.get(label, 0) + 1

static func report(ticks: int) -> String:
	var keys := totals.keys()
	keys.sort_custom(func(a, b): return totals[a] > totals[b])
	var out := ""
	for k in keys:
		out += "  %-24s %7.3f ms/tick  (%d calls)\n" % [k, totals[k] / 1000.0 / ticks, counts[k]]
	return out
