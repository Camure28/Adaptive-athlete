/** Equipment icons (drawn for this app, white on transparent; tinted where shown). */
import type { ImageSourcePropType } from "react-native";
import type { MovementGear } from "@adaptive-athlete/engine";
import outdoorRun from "../../assets/equipment/outdoor_run.png";
import treadmill from "../../assets/equipment/treadmill.png";
import curvedTreadmill from "../../assets/equipment/curved_treadmill.png";
import skierg from "../../assets/equipment/skierg.png";
import rower from "../../assets/equipment/rower.png";
import bikeErg from "../../assets/equipment/bike_erg.png";
import sled from "../../assets/equipment/sled.png";
import turfLane from "../../assets/equipment/turf_lane.png";
import plates from "../../assets/equipment/plates.png";
import barbellRack from "../../assets/equipment/barbell_rack.png";
import dumbbells from "../../assets/equipment/dumbbells.png";
import kettlebells from "../../assets/equipment/kettlebells.png";
import cableMachine from "../../assets/equipment/cable_machine.png";
import battleRope from "../../assets/equipment/battle_rope.png";
import wallBall from "../../assets/equipment/wall_ball.png";
import sandbag from "../../assets/equipment/sandbag.png";
import openFloor from "../../assets/equipment/open_floor.png";
import bodyweight from "../../assets/equipment/bodyweight.png";

export const GEAR_ICON: Record<MovementGear, ImageSourcePropType> = {
  outdoor_run: outdoorRun,
  treadmill: treadmill,
  curved_treadmill: curvedTreadmill,
  skierg: skierg,
  rower: rower,
  bike_erg: bikeErg,
  sled: sled,
  turf_lane: turfLane,
  plates: plates,
  barbell_rack: barbellRack,
  dumbbells: dumbbells,
  kettlebells: kettlebells,
  cable_machine: cableMachine,
  battle_rope: battleRope,
  wall_ball: wallBall,
  sandbag: sandbag,
  open_floor: openFloor,
  bodyweight: bodyweight,
};
