class_name Spring
## Frame-rate independent damped spring integration (fixed substeps), used
## by camera/viewmodel motion so hitches or low frame rates can't make the
## springs explode.

const STEP := 1.0 / 240.0
const MAX_STEPS := 24

## Advances a 1D spring toward 0. Returns Vector2(position, velocity).
static func step(x: float, v: float, stiffness: float, damping: float, delta: float) -> Vector2:
	var remaining := minf(delta, STEP * MAX_STEPS)
	while remaining > 0.0:
		var dt := minf(remaining, STEP)
		v += (-x * stiffness - v * damping) * dt
		x += v * dt
		remaining -= dt
	return Vector2(x, v)

## 2D variant: returns [position: Vector2, velocity: Vector2].
static func step2(x: Vector2, v: Vector2, stiffness: float, damping: float, delta: float) -> Array:
	var remaining := minf(delta, STEP * MAX_STEPS)
	while remaining > 0.0:
		var dt := minf(remaining, STEP)
		v += (-x * stiffness - v * damping) * dt
		x += v * dt
		remaining -= dt
	return [x, v]
