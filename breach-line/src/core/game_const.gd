class_name GameConst
## Shared enums, physics layers and tuning constants used across systems.
## Keep this file free of logic so it can be referenced from anywhere.

enum Team { NONE = 0, ATTACKERS = 1, DEFENDERS = 2 }

## Hit groups used for locational damage.
enum HitGroup { GENERIC, HEAD, CHEST, STOMACH, ARM, LEG }

## Inventory slots (also the default number keys 1-5).
enum Slot { PRIMARY = 0, SECONDARY = 1, MELEE = 2, GRENADE = 3, BOMB = 4 }

## Physics layer bits (see project.godot [layer_names]).
const LAYER_WORLD := 1
const LAYER_BODY_ATTACKERS := 1 << 1
const LAYER_BODY_DEFENDERS := 1 << 2
const LAYER_HITBOX := 1 << 3
const LAYER_TRIGGER := 1 << 4
const LAYER_PROP := 1 << 5
## Invisible movement blockers (railings, map edges): stop bodies, not bullets.
const LAYER_CLIP := 1 << 6

## Mask used by hitscan weapons: static world, props and hitboxes.
const MASK_BULLET := LAYER_WORLD | LAYER_PROP | LAYER_HITBOX
## Mask used for line-of-sight checks (world geometry only blocks vision).
const MASK_SIGHT := LAYER_WORLD | LAYER_PROP

const HITGROUP_MULTIPLIER := {
	HitGroup.GENERIC: 1.0,
	HitGroup.HEAD: 4.0,
	HitGroup.CHEST: 1.0,
	HitGroup.STOMACH: 1.25,
	HitGroup.ARM: 1.0,
	HitGroup.LEG: 0.75,
}

## Surface types drive impact FX, footstep sounds and bullet penetration.
const SURFACE_PENETRATION := {
	"concrete": 0.0,
	"brick": 0.0,
	"metal": 0.35,
	"metal_thin": 0.75,
	"wood": 0.8,
	"dirt": 0.0,
	"gravel": 0.0,
	"flesh": 1.0,
}

static func team_name(team: int) -> String:
	match team:
		Team.ATTACKERS: return "Breachers"
		Team.DEFENDERS: return "Wardens"
	return "Spectators"

static func team_color(team: int) -> Color:
	match team:
		Team.ATTACKERS: return Color(0.93, 0.58, 0.22)
		Team.DEFENDERS: return Color(0.35, 0.62, 0.95)
	return Color(0.8, 0.8, 0.8)

static func other_team(team: int) -> int:
	if team == Team.ATTACKERS:
		return Team.DEFENDERS
	if team == Team.DEFENDERS:
		return Team.ATTACKERS
	return Team.NONE

static func body_layer(team: int) -> int:
	return LAYER_BODY_ATTACKERS if team == Team.ATTACKERS else LAYER_BODY_DEFENDERS

## Movement collision mask: teammates pass through each other (avoids bot
## gridlock in chokepoints) but enemies block each other, as does the world.
static func body_mask(team: int) -> int:
	var enemy := LAYER_BODY_DEFENDERS if team == Team.ATTACKERS else LAYER_BODY_ATTACKERS
	return LAYER_WORLD | LAYER_PROP | LAYER_CLIP | enemy
