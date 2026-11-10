class_name BuySystem
## Validates and executes purchases for humans (buy menu) and bots.

const GEAR := {
	&"kevlar": {"name": "Kevlar Vest", "price": 650},
	&"kevlar_helmet": {"name": "Kevlar + Helmet", "price": 1000},
	&"defuse_kit": {"name": "Defuse Kit", "price": 400, "team": GameConst.Team.DEFENDERS},
}

static func price_of(item: StringName, c: Combatant = null) -> int:
	if GEAR.has(item):
		var p: int = GEAR[item].price
		# Already wearing a full vest: only the helmet is charged.
		if item == &"kevlar_helmet" and c and c.armor >= 100.0:
			p = 350
		return p
	var d := WeaponDB.get_data(item)
	return d.price if d else -1

static func display_name(item: StringName) -> String:
	if GEAR.has(item):
		return GEAR[item].name
	var d := WeaponDB.get_data(item)
	return d.display_name if d else str(item)

## Returns "" if the purchase is allowed, else a reason.
static func check(rec: PlayerRecord, item: StringName) -> String:
	var c := rec.combatant
	if c == null or not c.alive:
		return "dead"
	var price := price_of(item, c)
	if price < 0:
		return "unknown item"
	if GEAR.has(item):
		var g: Dictionary = GEAR[item]
		if g.has("team") and g.team != rec.team:
			return "wrong team"
		match item:
			&"kevlar":
				if c.armor >= 100.0:
					return "already owned"
			&"kevlar_helmet":
				if c.armor >= 100.0 and c.has_helmet:
					return "already owned"
			&"defuse_kit":
				if c.has_defuse_kit:
					return "already owned"
	else:
		var d := WeaponDB.get_data(item)
		if d.category in ["melee", "bomb"]:
			return "not for sale"
		if d.team != 0 and d.team != rec.team:
			return "wrong team"
		var owned := c.weapons.get_slot(d.slot)
		if owned and owned.data.id == item:
			return "already owned"
	if rec.money < price:
		return "not enough money"
	return ""

## Executes a purchase. Returns true on success. The previous weapon in the
## slot is dropped by `drop_fn` (Callable(Combatant, WeaponInstance)) if set.
static func buy(rec: PlayerRecord, item: StringName, drop_fn: Callable = Callable()) -> bool:
	if check(rec, item) != "":
		return false
	var c := rec.combatant
	var price := price_of(item, c)
	rec.money -= price
	match item:
		&"kevlar":
			c.armor = 100.0
		&"kevlar_helmet":
			c.armor = 100.0
			c.has_helmet = true
		&"defuse_kit":
			c.has_defuse_kit = true
		_:
			var d := WeaponDB.get_data(item)
			var old := c.weapons.take(d.slot)
			if old and drop_fn.is_valid():
				drop_fn.call(c, old)
			c.weapons.give(item, true)
	Events.money_changed.emit(rec, rec.money, -price, "buy")
	return true
