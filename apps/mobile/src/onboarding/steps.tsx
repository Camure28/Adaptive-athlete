/** The seven onboarding screens (docs/ONBOARDING.md). Each renders questions only; navigation lives in the route. */
import { Text, View } from "react-native";
import { EQUIPMENT, type Equipment, type GymType, type HyroxLevel, type Weekday } from "@adaptive-athlete/engine";
import { Callout, Choice, Field, Heading, Pills, Question, Stepper } from "@/components/ui";
import { space, type } from "@/lib/theme";
import {
  applyGymTypes,
  doublesQuestionApplies,
  LIMITATION_LABELS,
  LIMITATIONS,
  type BenchmarkDistance,
  type Division,
  type Errors,
  type OnboardingAnswers,
  type Step,
} from "./model";

export interface StepProps {
  a: OnboardingAnswers;
  update: (patch: Partial<OnboardingAnswers>) => void;
  set: (a: OnboardingAnswers) => void;
  errors: Errors;
}

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const DIVISIONS: { value: Division; label: string }[] = [
  { value: "women_open", label: "Women Open" },
  { value: "women_pro", label: "Women Pro" },
  { value: "men_open", label: "Men Open" },
  { value: "men_pro", label: "Men Pro" },
];

function Race({ a, update, errors }: StepProps) {
  return (
    <>
      <Heading title="Your race" detail="Your race date sets how long your plan is. Your division sets the station weights you'll train with." />
      <Question label="When is your race?" error={errors.raceDate}>
        <Field value={a.raceDate} onChangeText={(raceDate) => update({ raceDate })} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" invalid={!!errors.raceDate} accessibilityLabel="Race date" />
      </Question>
      <Question label="Which division are you racing?" error={errors.division}>
        {DIVISIONS.map((d) => (
          <Choice key={d.value} label={d.label} selected={a.division === d.value} onPress={() => update({ division: d.value })} />
        ))}
      </Question>
      <Question label="What's your goal?" error={errors.targetTime}>
        <Choice label="Just finish" selected={a.goal === "finish"} onPress={() => update({ goal: "finish" })} />
        <Choice label="A target time" selected={a.goal === "time"} onPress={() => update({ goal: "time" })} />
        {a.goal === "time" ? (
          <View style={{ marginTop: space.sm }}>
            <Field value={a.targetTime} onChangeText={(targetTime) => update({ targetTime })} placeholder="1:25:00" keyboardType="numbers-and-punctuation" invalid={!!errors.targetTime} accessibilityLabel="Target finish time" />
            <Text style={[type.small, { marginTop: space.sm }]}>We'll record this now and use it for pacing once we can check it against your benchmarks.</Text>
          </View>
        ) : null}
      </Question>
    </>
  );
}

const LEVELS: { value: HyroxLevel; label: string; detail: string }[] = [
  { value: "first_timer", label: "First-timer", detail: "You haven't finished a HYROX yet." },
  { value: "intermediate", label: "Intermediate", detail: "You've finished one or more and want to get faster." },
  { value: "advanced", label: "Advanced", detail: "You race for time or age-group places." },
  { value: "competitive", label: "Competitive", detail: "Pro division or chasing World Championship qualification." },
];

function Experience({ a, update, errors }: StepProps) {
  return (
    <>
      <Heading title="Your experience" detail="This sets how many sessions you get, how hard they are, and which race simulations you do. Your logged training fine-tunes it over time." />
      <Question label="Which describes you best?" error={errors.level}>
        {LEVELS.map((l) => (
          <Choice key={l.value} label={l.label} detail={l.detail} selected={a.level === l.value} onPress={() => update({ level: l.value, wantsDoubles: l.value === "advanced" ? a.wantsDoubles : null })} />
        ))}
      </Question>
      {a.level && a.level !== "first_timer" ? (
        <Question label="Your best recent HYROX time (optional)" help="Skip this if you don't have it to hand." error={errors.pastHyroxTime ?? errors.pastHyroxDate}>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Field style={{ flex: 1 }} value={a.pastHyroxTime} onChangeText={(pastHyroxTime) => update({ pastHyroxTime })} placeholder="1:32:10" accessibilityLabel="Past HYROX finish time" />
            <Field style={{ flex: 1 }} value={a.pastHyroxDate} onChangeText={(pastHyroxDate) => update({ pastHyroxDate })} placeholder="MM/DD/YYYY" accessibilityLabel="Past HYROX race date" />
          </View>
        </Question>
      ) : null}
    </>
  );
}

const BENCH: { value: BenchmarkDistance | null; label: string }[] = [
  { value: "5k", label: "5K" },
  { value: "10k", label: "10K" },
  { value: "half_marathon", label: "Half marathon" },
  { value: null, label: "I don't have one" },
];

function Running({ a, update, errors }: StepProps) {
  const unit = a.units === "mi" ? "miles" : "kilometers";
  return (
    <>
      <Heading title="Your running" detail="Running is half of HYROX. Your current volume sets a safe starting point; a recent race time sets your personal paces." />
      <Question label="Units">
        <Pills label="Units" options={[{ value: "mi", label: "Miles" }, { value: "km", label: "Kilometers" }]} isOn={(v) => a.units === v} onToggle={(units) => update({ units })} />
      </Question>
      <Question label={`How many ${unit} do you run in a typical week?`} help="Your average over the last month. 0 is fine." error={errors.weeklyRun}>
        <Field value={a.weeklyRun} onChangeText={(weeklyRun) => update({ weeklyRun })} placeholder={a.units === "mi" ? "12" : "20"} keyboardType="decimal-pad" invalid={!!errors.weeklyRun} accessibilityLabel={`Weekly ${unit}`} />
      </Question>
      <Question label="A recent race or time trial (optional)" help="Your best effort in the last few months. Without one, sessions use effort levels instead of paces.">
        {BENCH.map((b) => (
          <Choice key={b.label} label={b.label} selected={a.benchmarkDistance === b.value} onPress={() => update({ benchmarkDistance: b.value })} />
        ))}
      </Question>
      {a.benchmarkDistance ? (
        <Question label="Time and date" error={errors.benchmarkTime ?? errors.benchmarkDate}>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Field style={{ flex: 1 }} value={a.benchmarkTime} onChangeText={(benchmarkTime) => update({ benchmarkTime })} placeholder="24:30" accessibilityLabel="Benchmark finish time" />
            <Field style={{ flex: 1 }} value={a.benchmarkDate} onChangeText={(benchmarkDate) => update({ benchmarkDate })} placeholder="MM/DD/YYYY" accessibilityLabel="Benchmark date" />
          </View>
        </Question>
      ) : null}
    </>
  );
}

const DAYS: { value: Weekday; label: string; a11y: string }[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d, i) => ({
  value: i as Weekday,
  label: d.slice(0, 3),
  a11y: d,
}));

function Schedule({ a, update, errors }: StepProps) {
  return (
    <>
      <Heading title="Your schedule" detail="Sessions only go on the days you pick, and never run longer than the time you have." />
      <Question label="Which days can you train?" error={errors.days}>
        <Pills label="Training days" options={DAYS} isOn={(d) => a.days.includes(d)} onToggle={(d) => update({ days: toggle(a.days, d), longDay: a.longDay === d && a.days.includes(d) ? null : a.longDay })} />
      </Question>
      {a.days.length > 0 ? (
        <Question label="Best day for your longest session?" help="Usually a weekend day. Long runs and race simulations go here." error={errors.longDay}>
          <Pills label="Long session day" options={DAYS.filter((d) => a.days.includes(d.value))} isOn={(d) => a.longDay === d} onToggle={(d) => update({ longDay: a.longDay === d ? null : d })} />
        </Question>
      ) : null}
      <Question label="Time available on weekdays">
        <Stepper label="weekday minutes" value={a.weekdayMinutes} onChange={(weekdayMinutes) => update({ weekdayMinutes })} step={15} min={30} max={180} unit="min" />
      </Question>
      <Question label="Time available on weekends">
        <Stepper label="weekend minutes" value={a.weekendMinutes} onChange={(weekendMinutes) => update({ weekendMinutes })} step={15} min={30} max={240} unit="min" />
      </Question>
      {doublesQuestionApplies(a.level) ? (
        <Question label="Do you want double days?" help="Two sessions on some days, morning and evening. More training, but harder to recover from.">
          <Choice label="Yes, add double days" selected={a.wantsDoubles === true} onPress={() => update({ wantsDoubles: true })} />
          <Choice label="No, one session a day" selected={a.wantsDoubles !== true} onPress={() => update({ wantsDoubles: false })} />
        </Question>
      ) : null}
    </>
  );
}

const GYMS: { value: GymType; label: string; detail: string }[] = [
  { value: "home", label: "Home", detail: "Your own space" },
  { value: "crossfit", label: "CrossFit gym", detail: "Rowers, kettlebells, wall balls" },
  { value: "commercial", label: "Commercial gym", detail: "Treadmills, cables, free weights" },
  { value: "hyrox_club", label: "HYROX training club", detail: "The full race setup" },
];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  outdoor_run: "Somewhere to run outdoors",
  treadmill: "Treadmill",
  curved_treadmill: "Curved or non-motorized treadmill",
  skierg: "SkiErg",
  rower: "Rower",
  bike_erg: "Bike erg or air bike",
  sled: "Sled",
  turf_lane: "Turf lane (12.5 m or more)",
  plates: "Weight plates",
  barbell_rack: "Barbell and rack",
  dumbbells: "Dumbbells",
  kettlebells: "Kettlebells",
  cable_machine: "Cable machine",
  battle_rope: "Battle rope",
  wall_ball: "Wall ball and target",
  sandbag: "Sandbag",
  open_floor: "About 10 m of open floor",
};

function EquipmentStep({ a, set, errors }: StepProps) {
  return (
    <>
      <Heading title="Your equipment" detail="We'll use the real race stations when you have them and the best substitute when you don't." />
      <Question label="Where do you train?" help="Pick all that apply." error={errors.gymTypes}>
        {GYMS.map((g) => (
          <Choice key={g.value} multi label={g.label} detail={g.detail} selected={a.gymTypes.includes(g.value)} onPress={() => set(applyGymTypes(a, toggle(a.gymTypes, g.value)))} />
        ))}
      </Question>
      {a.gymTypes.length > 0 ? (
        <Question label="Check what you can use" help="We've ticked what's typical for your gym. Change anything that's different." error={errors.equipment}>
          {EQUIPMENT.map((e) => (
            <Choice key={e} multi label={EQUIPMENT_LABELS[e]} selected={a.equipment.includes(e)} onPress={() => set({ ...a, equipment: toggle(a.equipment, e) })} />
          ))}
        </Question>
      ) : null}
    </>
  );
}

function Limitations({ a, update, errors }: StepProps) {
  return (
    <>
      <Heading title="Anything to avoid?" detail="Optional. Tell us movements to leave out and we'll work around them. We don't ask about injuries or diagnoses." />
      <Question label="Movements to avoid">
        {LIMITATIONS.map((l) => (
          <Choice key={l} multi label={LIMITATION_LABELS[l]} selected={a.limitations.includes(l)} onPress={() => update({ limitations: toggle(a.limitations, l) })} />
        ))}
      </Question>
      <Question label="Anything else? (optional)" error={errors.limitationNote}>
        <Field value={a.limitationNote} onChangeText={(limitationNote) => update({ limitationNote })} placeholder="Low ceiling at home, no overhead throws" multiline maxLength={280} style={{ minHeight: 80, paddingTop: space.md }} accessibilityLabel="Other limitations" />
      </Question>
      {a.limitations.length > 0 ? <Callout>If a race station involves a movement you avoid, your plan will say so and offer the closest safe option. For anything painful, check with a physio or doctor.</Callout> : null}
    </>
  );
}

function Review({ a, update, errors }: StepProps) {
  const rows: [string, string][] = [
    ["Race date", a.raceDate],
    ["Division", DIVISIONS.find((d) => d.value === a.division)?.label ?? ""],
    ["Level", LEVELS.find((l) => l.value === a.level)?.label ?? ""],
    ["Weekly running", `${a.weeklyRun || 0} ${a.units}`],
    ["Training days", a.days.slice().sort().map((d) => DAYS[d]!.label).join(", ")],
    ["Equipment", `${a.equipment.length} items`],
    ["Avoiding", a.limitations.length ? a.limitations.map((l) => LIMITATION_LABELS[l]).join(", ") : "Nothing"],
  ];
  return (
    <>
      <Heading title="Check your answers" detail="You can change any of these later from your profile." />
      <View style={{ marginBottom: space.xl }}>
        {rows.map(([k, v]) => (
          <View key={k} style={{ flexDirection: "row", paddingVertical: space.sm, gap: space.md }}>
            <Text style={[type.small, { width: 128 }]}>{k}</Text>
            <Text style={[type.body, { flex: 1 }]}>{v}</Text>
          </View>
        ))}
      </View>
      <Question label="Your data" error={errors.consentHealthData}>
        <Choice
          multi
          label="I agree to Adaptive Athlete using my training data to build and adjust my plan"
          detail="Your data is only visible to you. You can export or delete it at any time."
          selected={a.consentHealthData}
          onPress={() => update({ consentHealthData: !a.consentHealthData })}
        />
      </Question>
    </>
  );
}

export const STEP_COMPONENTS: Record<Step, (p: StepProps) => React.JSX.Element> = {
  race: Race,
  experience: Experience,
  running: Running,
  schedule: Schedule,
  equipment: EquipmentStep,
  limitations: Limitations,
  review: Review,
};
