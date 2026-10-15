# HYROX Equipment & Station Substitutions

Status: approved by product owner 2026-10-15, including coach ratings. Presets accepted with SkiErg removed from CrossFit.

## How it works

1. **Setup type first:** the athlete picks *Home*, *CrossFit gym*, *Commercial gym*, *HYROX Training Club*, or a combination.
2. **Pre-ticked checklist:** each gym type pre-ticks its typical equipment (see Presets). The athlete corrects it. They can change it at any time; the plan updates its substitutions.
3. **Coach ranking:** each substitute has a coach-assigned rank for stimulus quality. The plan *recommends* the highest-ranked option the athlete has equipment for, and *still shows* the other available options, ranked, for the athlete to choose. The athlete's choice is logged with the session.
4. **Specific vs. support:** *race-specific* substitutes (they mimic the station's movement and fatigue) are preferred in HYROX-specific sessions such as compromised runs and simulations. *Strength-support* substitutes build the underlying capacity and are placed in strength sessions.
5. If no option is possible, the plan says so plainly rather than prescribing something the athlete can't do.

## Equipment checklist

| ID | Item | Notes |
|---|---|---|
| `outdoor_run` | Place to run outdoors | Running is required: outdoor or treadmill |
| `treadmill` | Motorised treadmill | |
| `curved_treadmill` | Curved / non-motorised treadmill | Needed for resisted treadmill pushing |
| `skierg` | SkiErg | |
| `rower` | Rower (RowErg) | |
| `bike_erg` | Bike erg / air bike | |
| `sled` | Sled (push and pull) | |
| `turf_lane` | Turf or smooth floor lane (≥ 12.5 m) | Needed for sled and plate pushing |
| `plates` | Weight plates | |
| `barbell_rack` | Barbell and squat rack | |
| `dumbbells` | Dumbbells | |
| `kettlebells` | Kettlebells | |
| `cable_machine` | Cable machine | Needed for hand-over-hand cable rows |
| `battle_rope` | Battle rope | |
| `wall_ball` | Wall ball and target | |
| `sandbag` | Sandbag | |
| `open_floor` | ~10 m open floor | For burpee broad jumps |

## Substitutions

Coach ratings submitted 2026-10-15. Ratings: **Best > Good > Fallback**. Ties keep the order shown. The plan recommends the highest-rated option the athlete has equipment for and shows the rest below it. Options rated *Don't use* are excluded and must not be re-added without the coach.

### Sled Push
| Rating | Option | Type | Requires |
|---|---|---|---|
| — | Sled push (real station) | real | `sled`, `turf_lane` |
| Best | Resisted treadmill pushing | specific | `curved_treadmill` |
| Good | Pushing heavy plates across turf | specific | `plates`, `turf_lane` |
| Good | Weighted walking lunges | support | `dumbbells` or `kettlebells` |
| Fallback | Heavy back squats | support | `barbell_rack` |
| Fallback | Bulgarian split squats | support | `dumbbells` or `kettlebells` |

Excluded: heavy farmer's carries.

### Sled Pull
| Rating | Option | Type | Requires |
|---|---|---|---|
| — | Sled pull (real station) | real | `sled`, `turf_lane` |
| Good | Timed hand-over-hand cable rows | specific | `cable_machine` |
| Good | Battle rope pulls | specific | `battle_rope` |
| Good | Kettlebell see-saw rows | support | `kettlebells` |
| Fallback | Kettlebell deadlift to high pull | support | `kettlebells` |
| Fallback | Romanian deadlifts + bent-over rows | support | `barbell_rack` or `dumbbells` |
| Fallback | RowErg, damper 10 | specific | `rower` |

### SkiErg
| Rating | Option | Requires |
|---|---|---|
| Good | Straight-arm pulldowns | `cable_machine` (or band) |
| Fallback | Rower intervals at matched effort | `rower` |

Excluded: bike erg intervals.

### Rowing
| Rating | Option | Requires |
|---|---|---|
| Good | Bike erg at matched effort | `bike_erg` |
| Fallback | SkiErg at matched effort | `skierg` |

### Other stations (all rated Good)
| Station | Options |
|---|---|
| Burpee Broad Jumps | Burpees and broad jumps separately (`open_floor`); burpee + step-back (no space needed) |
| Farmers Carry | Dumbbells; trap bar; loaded holds |
| Sandbag Lunges | Dumbbell or kettlebell front-rack lunges |
| Wall Balls | Dumbbell or kettlebell thrusters |

## Presets

✓ = pre-ticked. Items that are only *sometimes* present are left unticked so the plan never assumes equipment the athlete doesn't have.

| Item | Home | CrossFit gym | Commercial gym | HYROX Training Club |
|---|---|---|---|---|
| Outdoor running | ✓ | ✓ | ✓ | ✓ |
| Treadmill | | | ✓ | ✓ |
| Curved treadmill | | | | ✓ |
| SkiErg | | | | ✓ |
| Rower | | ✓ | ✓ | ✓ |
| Bike erg / air bike | | ✓ | ✓ | ✓ |
| Sled + turf lane | | | | ✓ |
| Weight plates | | ✓ | ✓ | ✓ |
| Barbell + rack | | ✓ | ✓ | ✓ |
| Dumbbells | | ✓ | ✓ | ✓ |
| Kettlebells | | ✓ | ✓ | ✓ |
| Cable machine | | | ✓ | |
| Battle rope | | | | ✓ |
| Wall ball + target | | ✓ | | ✓ |
| Sandbag | | ✓ | | ✓ |
| Open floor (~10 m) | | ✓ | ✓ | ✓ |
