# HYROX Equipment & Station Substitutions

Status: working draft, 2026-10-15. Items marked **(PO)** came from the product owner (coach); items marked **(draft)** are Claude's proposals awaiting review.

## How it works

1. **Setup type first:** the athlete picks *Gym*, *Home*, or *Both*.
2. **Checklist:** the athlete ticks the equipment they can access. They can change it at any time; the plan updates its substitutions.
3. **Substitution order:** for each station, options are listed in preference order. The engine uses the real station if available, otherwise the first option whose required equipment is ticked.
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

## Substitutions (preference order)

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

### Other stations **(draft)**
| Station | Substitutes in order |
|---|---|
| SkiErg | Rower or bike erg intervals at matched effort, plus straight-arm pulldowns (cable or band) |
| Rowing | SkiErg or bike erg at matched effort |
| Burpee Broad Jumps | Burpees and broad jumps performed separately; with no space, burpee + step-back |
| Farmers Carry | Dumbbells, kettlebells, or trap bar at race load; with nothing heavy, loaded holds |
| Sandbag Lunges | Dumbbell or kettlebell front-rack lunges |
| Wall Balls | Dumbbell or kettlebell thrusters |

## Open questions
- Should RowErg damper 10 move higher in the sled pull order? It is the only fully conditioning-based option and is widely available.
- Does *Gym* setup pre-tick typical gym equipment for the athlete to correct, or start empty?
