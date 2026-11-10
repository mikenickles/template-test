class_name MatchConfig
extends Resource
## Match rules. Defaults describe the standard Breach Line competitive mode.

@export var rounds_to_win := 7
@export var max_rounds := 12
@export var halftime_after := 6
@export var team_size := 5
@export var freeze_time := 6.0
@export var buy_time := 20.0
@export var round_time := 115.0
@export var round_end_time := 5.0
@export var halftime_time := 6.0
@export var bomb_timer := 40.0
@export var plant_time := 3.2
@export var defuse_time := 10.0
@export var defuse_time_kit := 5.0
@export var bomb_radius := 24.0
@export var bomb_damage := 260.0
@export var start_money := 800
@export var max_money := 16000
@export var reward_win_elimination := 3250
@export var reward_win_time := 3250
@export var reward_win_bomb := 3500
@export var reward_win_defuse := 3500
@export var loss_bonus_base := 1400
@export var loss_bonus_step := 500
@export var loss_bonus_max := 3400
@export var plant_reward := 300
@export var defuse_reward := 300
## Team bonus for attackers who planted but lost the round.
@export var planted_loss_bonus := 800
@export var assist_damage := 40.0
