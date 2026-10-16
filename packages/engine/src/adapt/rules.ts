/** The approved rule set (docs/ADAPTATION_ENGINE.md), in rubric groups. */
import { illnessRule, painRule, severePainRule } from "./rules/safety.js";
import { easyHeartRateRule, effortHoldRule, hardVolumeRule, loadSpikeRule, recoveryRule, sorenessRule } from "./rules/fatigue.js";
import { askForDataRule, daysOffRule, missedOneRule, missedSeveralRule, unplannedHardRule } from "./rules/adherence.js";
import { fasterBenchmarkRule, missedTargetRule, progressRule, slowerBenchmarkRule, tooEasyRule } from "./rules/progression.js";
import type { Rule } from "./rules/shared.js";

export * from "./rules/shared.js";
export * from "./rules/safety.js";
export * from "./rules/fatigue.js";
export * from "./rules/adherence.js";
export * from "./rules/progression.js";

export const DEFAULT_RULES: readonly Rule[] = [
  severePainRule,
  painRule,
  illnessRule,
  hardVolumeRule,
  effortHoldRule,
  easyHeartRateRule,
  recoveryRule,
  sorenessRule,
  loadSpikeRule,
  askForDataRule,
  daysOffRule,
  missedOneRule,
  missedSeveralRule,
  unplannedHardRule,
  missedTargetRule,
  progressRule,
  fasterBenchmarkRule,
  tooEasyRule,
  slowerBenchmarkRule,
];
