/** The seven onboarding screens (docs/ONBOARDING.md). Each renders questions only; navigation lives in the route. */
import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { EQUIPMENT, STATION_NAMES, STATION_ORDER, addDays, implausibleRaceTime, type Equipment, type GymType, type HyroxLevel, type TrainingStatus, type Weekday } from "@adaptive-athlete/engine";
import { backend, type HyroxEvent } from "@/data";
import { resultsProvider } from "@/data/results";
import { Button, Callout, Choice, Field, Heading, Pills, Question, Stepper } from "@/components/ui";
import { localToday } from "@/lib/session";
import { color, space, type } from "@/lib/theme";
import {
  applyGymTypes,
  BENCHMARK_METERS,
  doublesQuestionApplies,
  hyroxTimeProblem,
  parseTime,
  readTime,
  LIMITATION_LABELS,
  LIMITATIONS,
  suggestStatusFromPastRace,
  type BenchmarkDistance,
  type Division,
  type Errors,
  type OnboardingAnswers,
  type Step,
} from "./model";

/**
 * A time entry that says back how it was read ("Reads as 1 h 32 min"), so a 1:30 meant as an hour
 * and a half is caught while typing. `check` flags times that can't be right for this field.
 */
function TimeField({ label, value, onChange, placeholder, check }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; check?: (secs: number) => string | null }) {
  const secs = value.trim() ? parseTime(value) : null;
  const problem = secs !== null && check ? check(secs) : null;
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[type.small, { marginBottom: 4 }]}>{label}</Text>
      <Field value={value} onChangeText={onChange} placeholder={placeholder} keyboardType="numbers-and-punctuation" invalid={!!problem} accessibilityLabel={label} />
      {value.trim() ? (
        <Text style={[type.data, { marginTop: 4 }, problem ? { color: color.safety } : null]} accessibilityLiveRegion="polite">
          {secs === null ? "Use colons, like 1:32:10" : problem ?? `Reads as ${readTime(secs)}`}
        </Text>
      ) : null}
    </View>
  );
}

const BENCH_PLACEHOLDER: Record<BenchmarkDistance, string> = { "5k": "24:30", "10k": "52:00", half_marathon: "1:55:00" };

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

// ---- Race picker ------------------------------------------------------------------------------

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parts = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay() }; };
export function eventDates(e: Pick<HyroxEvent, "startDate" | "endDate">): string {
  const s = parts(e.startDate), f = parts(e.endDate);
  if (e.startDate === e.endDate) return `${MON[s.m]} ${s.d}, ${s.y}`;
  return s.m === f.m ? `${MON[s.m]} ${s.d}–${f.d}, ${f.y}` : `${MON[s.m]} ${s.d} – ${MON[f.m]} ${f.d}, ${f.y}`;
}
const toUs = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const fromUs = (us: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };
const place = (e: HyroxEvent) => [e.city, e.region ?? e.country].join(", ");

function RacePicker({ a, update, error }: { a: OnboardingAnswers; update: StepProps["update"]; error?: string }) {
  const [events, setEvents] = useState<HyroxEvent[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(a.eventId === null && a.raceDate !== "");
  useEffect(() => {
    let live = true;
    backend.listEvents(localToday()).then((ev) => live && setEvents(ev)).catch(() => live && setLoadError(true));
    return () => { live = false; };
  }, []);
  const picked = events?.find((e) => e.id === a.eventId) ?? null;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = events ?? [];
    return (q ? list.filter((e) => `${e.name} ${e.city} ${e.region ?? ""} ${e.country}`.toLowerCase().includes(q)) : list).slice(0, 8);
  }, [events, query]);

  if (manual || loadError) {
    return (
      <Question label="When is your race?" help={loadError ? "The race list didn't load, so enter your race date." : undefined} error={error}>
        <Field value={a.raceDate} onChangeText={(raceDate) => update({ raceDate, eventId: null, eventLabel: "" })} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" invalid={!!error} accessibilityLabel="Race date" />
        {!loadError ? <Button kind="quiet" title="Search the race list instead" onPress={() => setManual(false)} /> : null}
      </Question>
    );
  }

  if (picked) {
    const days: string[] = [];
    for (let d = picked.startDate; d <= picked.endDate; d = addDays(d, 1)) days.push(d);
    const chosen = fromUs(a.raceDate);
    return (
      <>
        <Question label="Your race">
          <View style={[st.event, st.eventOn]}>
            <Text style={type.strong}>{picked.name}</Text>
            <Text style={type.small}>{place(picked)} · {eventDates(picked)}</Text>
          </View>
          <Button kind="quiet" title="Change race" onPress={() => update({ eventId: null, eventLabel: "", raceDate: "" })} />
        </Question>
        {days.length > 1 ? (
          <Question label="Which day are you racing?" help="It's on your ticket. Not sure yet? Pick the first day; you can change it later." error={error}>
            <Pills label="Race day" options={days.map((d) => { const p = parts(d); return { value: d, label: `${DOW[p.w]} ${p.d}`, a11y: `${DOW[p.w]} ${MON[p.m]} ${p.d}` }; })} isOn={(d) => chosen === d} onToggle={(d) => update({ raceDate: toUs(d) })} />
          </Question>
        ) : null}
      </>
    );
  }

  return (
    <Question label="Find your race" help="Search by city or event name." error={error}>
      <Field value={query} onChangeText={setQuery} placeholder="e.g. Denver" autoCorrect={false} accessibilityLabel="Search races" />
      <View style={{ marginTop: space.sm }}>
        {events === null ? <Text style={type.small}>Loading races…</Text> : null}
        {events !== null && matches.length === 0 ? <Text style={type.small}>No upcoming races match "{query.trim()}".</Text> : null}
        {matches.map((e) => (
          <Pressable key={e.id} accessibilityRole="button" onPress={() => update({ eventId: e.id, eventLabel: e.name, raceDate: e.startDate === e.endDate ? toUs(e.startDate) : "" })} style={({ pressed }) => [st.event, pressed && { opacity: 0.85 }]}>
            <Text style={type.strong}>{e.name}</Text>
            <Text style={type.small}>{place(e)} · {eventDates(e)}</Text>
          </Pressable>
        ))}
      </View>
      <Button kind="quiet" title="My race isn't listed" onPress={() => { setManual(true); update({ eventId: null, eventLabel: "" }); }} />
    </Question>
  );
}

function Race({ a, update, errors }: StepProps) {
  return (
    <>
      <Heading title="Your race" detail="Your race date sets how long your plan is. Your division sets the station weights you'll train with." />
      <RacePicker a={a} update={update} error={errors.raceDate} />
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
            <TimeField label="Target finish time (hours:minutes:seconds)" value={a.targetTime} onChange={(targetTime) => update({ targetTime })} placeholder="1:25:00" check={hyroxTimeProblem} />
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

const STATUS: { value: TrainingStatus; label: string; detail: string }[] = [
  { value: "building", label: "Building up", detail: "Coming back from a break, or new to structured training. Your plan starts with an easier base phase." },
  { value: "consistent", label: "Training consistently", detail: "Training most weeks with some hard sessions. The base phase is shortened to 2 weeks." },
  { value: "race_ready", label: "Race-ready", detail: "In a race block or raced in the last 8 weeks, with hard sessions every week. Your plan starts with race-specific training." },
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
        <PastResult a={a} update={update} errors={errors} />
      ) : null}
      <Question label="Where's your training right now?" help="This sets where your plan starts, so you don't repeat an easy build-up you've already done." error={errors.trainingStatus}>
        {STATUS.map((st) => (
          <Choice key={st.value} label={st.label} detail={st.detail} selected={a.trainingStatus === st.value} onPress={() => update({ trainingStatus: st.value })} />
        ))}
      </Question>
    </>
  );
}

function PastResult({ a, update, errors }: { a: OnboardingAnswers; update: StepProps["update"]; errors: Errors }) {
  const [showSplits, setShowSplits] = useState(a.pastRunSplits.some(Boolean) || Object.values(a.pastStationSplits).some(Boolean));
  return (
    <Question label="Your best recent HYROX result (optional)" help={resultsProvider ? undefined : "Skip this if you don't have it to hand. Splits help us find your strongest and weakest stations."} error={errors.pastHyroxTime ?? errors.pastHyroxDate ?? errors.pastSplits}>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <TimeField label="Finish time (h:mm:ss)" value={a.pastHyroxTime} onChange={(pastHyroxTime) => update({ pastHyroxTime })} placeholder="1:32:10" check={hyroxTimeProblem} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.small, { marginBottom: 4 }]}>Race date</Text>
          <Field value={a.pastHyroxDate} onChangeText={(pastHyroxDate) => update(suggestStatusFromPastRace(a, pastHyroxDate, localToday()))} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" accessibilityLabel="Past HYROX race date" />
        </View>
      </View>
      <Button kind="quiet" title="Look up my result on the HYROX results site" onPress={() => { Linking.openURL("https://results.hyrox.com").catch(() => undefined); }} />
      {showSplits ? (
        <View style={{ gap: space.md, marginTop: space.sm }}>
          <Text style={type.small}>Minutes:seconds, like 4:35. Leave any you don't know blank.</Text>
          <Text style={type.eyebrow}>Runs (each 1 km)</Text>
          <View style={st.grid}>
            {a.pastRunSplits.map((v, i) => (
              <Field key={i} style={st.cell} value={v} onChangeText={(x) => { const next = [...a.pastRunSplits]; next[i] = x; update({ pastRunSplits: next }); }} placeholder={`Run ${i + 1}`} keyboardType="numbers-and-punctuation" accessibilityLabel={`Run ${i + 1} time`} />
            ))}
          </View>
          <Text style={type.eyebrow}>Stations</Text>
          <View style={st.grid}>
            {STATION_ORDER.map((stn) => (
              <View key={stn} style={st.cell}>
                <Text style={[type.small, { marginBottom: 2 }]}>{STATION_NAMES[stn]}</Text>
                <Field value={a.pastStationSplits[stn] ?? ""} onChangeText={(x) => update({ pastStationSplits: { ...a.pastStationSplits, [stn]: x } })} placeholder="m:ss" keyboardType="numbers-and-punctuation" accessibilityLabel={`${STATION_NAMES[stn]} time`} />
              </View>
            ))}
          </View>
        </View>
      ) : (
        <Button kind="quiet" title="Add splits (optional)" onPress={() => setShowSplits(true)} />
      )}
    </Question>
  );
}

const st = {
  event: { paddingVertical: 14, paddingHorizontal: space.lg, borderRadius: 18, backgroundColor: color.surface, marginBottom: space.sm, gap: 2 },
  eventOn: { borderColor: color.accent, backgroundColor: color.accentSoft },
  grid: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: space.sm },
  cell: { flexBasis: "47%" as const, flexGrow: 1 },
};

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
        <Question
          label="Time and date"
          help={a.benchmarkDistance === "half_marathon" ? "Hours:minutes:seconds, like 1:55:00." : "Minutes:seconds, like 24:30. Over an hour? Add hours, like 1:02:30."}
          error={errors.benchmarkTime ?? errors.benchmarkDate}
        >
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <TimeField
              label="Finish time"
              value={a.benchmarkTime}
              onChange={(benchmarkTime) => update({ benchmarkTime })}
              placeholder={BENCH_PLACEHOLDER[a.benchmarkDistance]}
              check={(secs) => {
                const off = implausibleRaceTime(BENCHMARK_METERS[a.benchmarkDistance!], secs);
                return off === "too_fast" ? "Faster than the world record. Add hours?" : off === "too_slow" ? "Too slow for this distance" : null;
              }}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type.small, { marginBottom: 4 }]}>Date</Text>
              <Field value={a.benchmarkDate} onChangeText={(benchmarkDate) => update({ benchmarkDate })} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" accessibilityLabel="Benchmark date" />
            </View>
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
    ["Race", a.eventLabel ? `${a.eventLabel}, ${a.raceDate}` : a.raceDate],
    ["Division", DIVISIONS.find((d) => d.value === a.division)?.label ?? ""],
    ["Level", LEVELS.find((l) => l.value === a.level)?.label ?? ""],
    ["Training now", STATUS.find((st) => st.value === a.trainingStatus)?.label ?? ""],
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
