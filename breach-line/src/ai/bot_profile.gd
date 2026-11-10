class_name BotProfile
extends RefCounted
## Difficulty-dependent bot skill parameters (angles in degrees).

var name := "Normal"
var reaction_time := 0.32
var turn_speed := 320.0 # deg/s when tracking
var aim_error := 3.5 # initial aim offset on a new target
var settle_time := 0.4 # time constant for the offset to shrink
var headshot_chance := 0.25
var recoil_comp := 0.55
var fov := 115.0
var burst_min := 3
var burst_max := 6
var crouch_chance := 0.35
var strafe_skill := 0.6 # how often to counter-strafe / strafe properly
var aggression := 0.5 # tendency to chase and peek

static func for_difficulty(d: int) -> BotProfile:
	var p := BotProfile.new()
	match clampi(d, 0, 3):
		0:
			p.name = "Easy"; p.reaction_time = 0.6; p.turn_speed = 170.0; p.aim_error = 7.0; p.settle_time = 0.75
			p.headshot_chance = 0.08; p.recoil_comp = 0.2; p.fov = 100.0; p.burst_min = 4; p.burst_max = 9
			p.crouch_chance = 0.15; p.strafe_skill = 0.25; p.aggression = 0.35
		1:
			pass
		2:
			p.name = "Hard"; p.reaction_time = 0.22; p.turn_speed = 480.0; p.aim_error = 2.2; p.settle_time = 0.28
			p.headshot_chance = 0.42; p.recoil_comp = 0.75; p.fov = 120.0; p.burst_min = 3; p.burst_max = 5
			p.crouch_chance = 0.45; p.strafe_skill = 0.8; p.aggression = 0.6
		3:
			p.name = "Expert"; p.reaction_time = 0.15; p.turn_speed = 700.0; p.aim_error = 1.4; p.settle_time = 0.18
			p.headshot_chance = 0.6; p.recoil_comp = 0.9; p.fov = 125.0; p.burst_min = 2; p.burst_max = 5
			p.crouch_chance = 0.5; p.strafe_skill = 0.95; p.aggression = 0.7
	return p
