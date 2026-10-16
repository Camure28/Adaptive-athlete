import { createContext, useContext, useRef, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { backend } from "@/data";
import { color, radius, space, type } from "@/lib/theme";

/** Lets a text field ask its page to scroll it into view above the keyboard. */
const ScrollTo = createContext<((field: View | TextInput | null) => void) | null>(null);

/**
 * Page shell: demo banner (when applicable), scrollable content, pinned footer.
 * The page shrinks above the keyboard, and a focused field scrolls into view, so what you type is
 * never hidden. The footer button rides on top of the keyboard.
 */
export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const reveal = (field: View | TextInput | null) => {
    // Wait for the keyboard to finish opening and the page to resize, then scroll the field to
    // sit a comfortable distance below the top of the visible area.
    setTimeout(() => {
      if (!field || !content.current) return;
      field.measureLayout(content.current, (_x, y) => scroll.current?.scrollTo({ y: Math.max(0, y - 96), animated: true }), () => undefined);
    }, 250);
  };
  return (
    <SafeAreaView style={s.page} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {backend.mode === "demo" ? (
          <View style={s.demo} accessibilityRole="alert">
            <Text style={s.demoText}>Demo mode: nothing you enter is saved.</Text>
          </View>
        ) : null}
        <ScrollTo.Provider value={reveal}>
          <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <View ref={content} style={s.column}>
              {children}
            </View>
          </ScrollView>
        </ScrollTo.Provider>
        {footer ? (
          <View style={s.footer}>
            <View style={s.column}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Onboarding progress drawn as a lane: one segment per step, filled up to the current one. */
export function Lane({ total, current }: { total: number; current: number }) {
  return (
    <View
      style={s.lane}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${total}`}
      accessibilityValue={{ min: 1, max: total, now: current + 1 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[s.laneSeg, i <= current && s.laneSegOn]} />
      ))}
    </View>
  );
}

export function Heading({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={{ marginBottom: space.xl }}>
      <Text style={type.display} accessibilityRole="header">
        {title}
      </Text>
      {detail ? <Text style={[type.small, { marginTop: space.sm }]}>{detail}</Text> : null}
    </View>
  );
}

export function Question({ label, help, error, children }: { label: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: space.xl }}>
      <Text style={[type.label, { marginBottom: help ? 2 : space.sm }]}>{label}</Text>
      {help ? <Text style={[type.small, { marginBottom: space.sm }]}>{help}</Text> : null}
      {children}
      {error ? (
        <Text style={s.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A full-width selectable row. `multi` draws a checkbox, otherwise a radio. */
export function Choice({
  label,
  detail,
  selected,
  onPress,
  multi = false,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  multi?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={multi ? { checked: selected } : { selected }}
      style={({ pressed }) => [s.choice, selected && s.choiceOn, pressed && { opacity: 0.85 }]}
    >
      <View style={[multi ? s.box : s.dot, selected && s.markOn]}>
        {selected ? <View style={multi ? s.boxTick : s.dotFill} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={selected ? type.strong : type.body}>{label}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Compact toggles laid out in a row (days of the week, units). */
export function Pills<T extends string | number>({
  options,
  isOn,
  onToggle,
  label,
}: {
  options: { value: T; label: string; a11y?: string }[];
  isOn: (v: T) => boolean;
  onToggle: (v: T) => void;
  label: string;
}) {
  return (
    <View style={s.pills} accessibilityLabel={label}>
      {options.map((o) => (
        <Pressable
          key={String(o.value)}
          onPress={() => onToggle(o.value)}
          accessibilityRole="checkbox"
          accessibilityLabel={o.a11y ?? o.label}
          accessibilityState={{ checked: isOn(o.value) }}
          style={[s.pill, isOn(o.value) && s.pillOn]}
        >
          <Text style={[type.label, isOn(o.value) && { color: color.surface }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Field(props: TextInputProps & { invalid?: boolean }) {
  const { invalid, style, onFocus, ...rest } = props;
  const reveal = useContext(ScrollTo);
  const ref = useRef<TextInput>(null);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor="#7A8288"
      style={[s.field, invalid && { borderColor: color.safety }, style]}
      onFocus={(e) => {
        reveal?.(ref.current);
        onFocus?.(e);
      }}
      {...rest}
    />
  );
}

/** − value + control for minutes. */
export function Stepper({ value, onChange, step, min, max, unit, label }: { value: number; onChange: (n: number) => void; step: number; min: number; max: number; unit: string; label: string }) {
  return (
    <View style={s.stepper} accessibilityLabel={label}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Less ${label}`} onPress={() => onChange(Math.max(min, value - step))} style={s.stepBtn}>
        <Text style={type.title}>−</Text>
      </Pressable>
      <Text style={[type.title, type.figure, { minWidth: 96, textAlign: "center" }]}>
        {value} {unit}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`More ${label}`} onPress={() => onChange(Math.min(max, value + step))} style={s.stepBtn}>
        <Text style={type.title}>+</Text>
      </Pressable>
    </View>
  );
}

export function Button({ title, onPress, kind = "primary", busy = false }: { title: string; onPress: () => void; kind?: "primary" | "quiet"; busy?: boolean }) {
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ busy }}
      style={({ pressed }) => [kind === "primary" ? s.btn : s.btnQuiet, pressed && { opacity: 0.85 }]}
    >
      <Text style={[type.label, { fontSize: 16, color: kind === "primary" ? color.surface : color.turf }]}>{busy ? "Working…" : title}</Text>
    </Pressable>
  );
}

export function Callout({ children, tone = "note" }: { children: ReactNode; tone?: "note" | "safety" }) {
  return (
    <View style={[s.callout, tone === "safety" && { backgroundColor: color.safetySoft }]}>
      <Text style={[type.small, { color: color.ink }]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.concrete },
  content: { padding: space.lg, paddingBottom: space.xxl },
  column: { width: "100%", maxWidth: 560, alignSelf: "center" },
  footer: { padding: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.rule, backgroundColor: color.concrete },
  demo: { backgroundColor: color.note, paddingVertical: space.sm, paddingHorizontal: space.lg },
  demoText: { ...type.small, color: color.ink, textAlign: "center" },
  lane: { flexDirection: "row", gap: 4, marginBottom: space.xl },
  laneSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: color.rule },
  laneSegOn: { backgroundColor: color.turf },
  error: { ...type.small, color: color.safety, marginTop: space.sm },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: color.rule,
    marginBottom: space.sm,
    minHeight: 52,
  },
  choiceOn: { borderColor: color.turf, backgroundColor: color.turfSoft },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color.iron, alignItems: "center", justifyContent: "center" },
  dotFill: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.turf },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: color.iron, alignItems: "center", justifyContent: "center" },
  boxTick: { width: 10, height: 10, borderRadius: 2, backgroundColor: color.turf },
  markOn: { borderColor: color.turf },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pill: { minWidth: 48, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.control, borderWidth: 1, borderColor: color.rule, alignItems: "center", justifyContent: "center", backgroundColor: color.surface },
  pillOn: { backgroundColor: color.turf, borderColor: color.turf },
  field: { ...type.body, minWidth: 0, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.control, borderWidth: 1, borderColor: color.rule, backgroundColor: color.surface },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.md },
  stepBtn: { width: 48, height: 48, borderRadius: radius.control, borderWidth: 1, borderColor: color.rule, backgroundColor: color.surface, alignItems: "center", justifyContent: "center" },
  btn: { minHeight: 52, borderRadius: radius.control, backgroundColor: color.turf, alignItems: "center", justifyContent: "center" },
  btnQuiet: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  callout: { backgroundColor: color.note, padding: space.md, borderRadius: radius.row, marginBottom: space.lg },
});
