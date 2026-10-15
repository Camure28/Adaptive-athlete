# HYROX Equipment & Station Substitutions

Status: approved by product owner 2026-10-15. Coach stimulus rankings and gym-type presets still to be finalised.

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

Ranks below are placeholders (list order) until the coach assigns stimulus rankings.

### Sled Push **(PO)**
| # | Option | Type | Requires |
|---|---|---|---|
| 0 | Sled push | real station | `sled`, `turf_lane` |
| 1 | Resisted treadmill pushing | specific | `curved_treadmill` |
| 2 | Pushing heavy plates across turf | specific | `plates`, `turf_lane` |
| 3 | Heavy back squats | support | `barbell_rack` |
| 4 | Bulgarian split squats | support | `dumbbells` or `kettlebells` |
| 5 | Weighted walking lunges | support | `dumbbells` or `kettlebells` |
| 6 | Heavy farmer's carries | support | `dumbbells` or `kettlebells` |

### Sled Pull **(PO)**
| # | Option | Type | Requires |
|---|---|---|---|
| 0 | Sled pull | real station | `sled`, `turf_lane` |
| 1 | Timed hand-over-hand cable rows | specific | `cable_machine` |
| 2 | Battle rope pulls | specific | `battle_rope` |
| 3 | Kettlebell see-saw rows | support | `kettlebells` |
| 4 | Kettlebell deadlift to high pull | support | `kettlebells` |
| 5 | Romanian deadlifts + bent-over rows | support | `barbell_rack` or `dumbbells` |
| 6 | RowErg, damper 10 | specific | `rower` |

### Other stations **(approved by PO)**
| Station | Substitutes in order |
|---|---|
| SkiErg | Rower or bike erg intervals at matched effort, plus straight-arm pulldowns (cable or band) |
| Rowing | SkiErg or bike erg at matched effort |
| Burpee Broad Jumps | Burpees and broad jumps performed separately; with no space, burpee + step-back |
| Farmers Carry | Dumbbells, kettlebells, or trap bar at race load; with nothing heavy, loaded holds |
| Sandbag Lunges | Dumbbell or kettlebell front-rack lunges |
| Wall Balls | Dumbbell or kettlebell thrusters |

## Presets (draft — coach to correct)

✓ = pre-ticked. Items that are only *sometimes* present are left unticked so the plan never assumes equipment the athlete doesn't have.

| Item | Home | CrossFit gym | Commercial gym | HYROX Training Club |
|---|---|---|---|---|
| Outdoor running | ✓ | ✓ | ✓ | ✓ |
| Treadmill | | | ✓ | ✓ |
| Curved treadmill | | | | ✓ |
| SkiErg | | ✓ | | ✓ |
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
