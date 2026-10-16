/**
 * Tap-to-answer options for the adaptation engine's questions (D-026). Values the rules read:
 * A-2 "yes"/"no", A-3 "resume", "<rule>.confirm" "yes"; S-1/S-2 follow-ups "better", "gone" and
 * "improving" count as the pain improving (PAIN_IMPROVED_ANSWERS); S-1.area takes a pain-map
 * group; Q-1 takes an RPE, which is also written into that session's log.
 * Wording is Claude's, awaiting coach review.
 */
export type AnswerOptions = { kind: "choices"; options: { value: string; label: string }[] } | { kind: "rpe" };

const choices = (...options: [string, string][]): AnswerOptions => ({ kind: "choices", options: options.map(([value, label]) => ({ value, label })) });

const RESUME = choices(["resume", "Ready to train again"], ["time_off", "On vacation or taking time off"], ["logging_elsewhere", "Training, just not logging"]);

export function answerOptions(questionId: string): AnswerOptions {
  if (questionId.startsWith("Q-1.")) return { kind: "rpe" };
  if (questionId.endsWith(".confirm")) return choices(["yes", "Yes, make the change"], ["no", "No, keep my week as it is"]);
  switch (questionId) {
    case "A-2":
      return choices(["yes", "Yes, pull back a little"], ["no", "No, keep the plan"]);
    case "A-3":
    case "A-3.checkin":
    case "A-4":
      return RESUME;
    case "S-2.followup":
      return choices(["better", "Better"], ["same", "The same"], ["worse", "Worse"]);
    case "S-1.followup":
      return choices(["gone", "Gone"], ["improving", "Improving"], ["same_or_worse", "The same or worse"]);
    case "S-1.area":
      return choices(["knee", "Knee"], ["lower_back_hip", "Lower back or hip"], ["shoulder_arm", "Shoulder, elbow or wrist"], ["foot_ankle_lower_leg", "Foot, ankle, shin or calf"], ["other", "Somewhere else"]);
    case "F-2.sleep_stress":
      return choices(["fine", "Both fine"], ["poor_sleep", "Sleeping badly"], ["high_stress", "Stressed"], ["both", "Both"]);
    case "F-3.context":
      return choices(["heat", "Heat"], ["illness", "Feeling unwell"], ["stress_sleep", "Stress or poor sleep"], ["nothing", "Nothing different"]);
    default:
      return choices(["yes", "Yes"], ["no", "No"]);
  }
}
