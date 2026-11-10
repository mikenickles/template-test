class_name BotFactory
## Creates bot-controlled combatants.

const NAMES := {
	GameConst.Team.ATTACKERS: ["Kestrel", "Rook", "Sable", "Dusk", "Marrow", "Flint", "Vane", "Cinder"],
	GameConst.Team.DEFENDERS: ["Halden", "Ward", "Lumen", "Garrick", "Mercer", "Osprey", "Tamsin", "Brask"],
}

static func create(parent: Node, team: int, index: int, map_info: MapInfo, tactics: TeamTactics, difficulty: int) -> Combatant:
	var c := Combatant.new()
	c.team = team
	c.display_name = NAMES[team][index % NAMES[team].size()]
	c.name = "Bot_%s" % c.display_name
	c.map_info = map_info
	parent.add_child(c)
	var b := BotBrain.new()
	b.name = "BotBrain"
	c.add_child(b)
	b.setup(c, BotProfile.for_difficulty(difficulty), tactics, map_info)
	return c
