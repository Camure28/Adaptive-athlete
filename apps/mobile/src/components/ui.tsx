import { createContext, useContext, useRef, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { backend } from "@/data";
import { color, font, radius, space, type } from "@/lib/theme";

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
            <Text style={s.demoText}>Demo mode: nothing you enter is saved</Text>
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

/** Onboarding progress: one smooth bar, with the step count beside it. */
export function Lane({ total, current }: { total: number; current: number }) {
  return (
    <View
      style={s.lane}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${total}`}
      accessibilityValue={{ min: 1, max: total, now: current + 1 }}
    >
      <View style={s.laneTrack}>
        <View style={[s.laneFill, { width: `${((current + 1) / total) * 100}%` }]} />
      </View>
      <Text style={[type.data, type.figure]}>
        {current + 1} of {total}
      </Text>
    </View>
  );
}

/** Brand mark: the name, set quietly. */
export function Wordmark() {
  return (
    <Text style={s.mark} accessibilityRole="header">
      Adaptive Athlete
    </Text>
  );
}

/**
 * A progress ring drawn with plain views (no native drawing library, so no rebuild needed).
 * Two clipped halves each rotate a half-ring into view; `progress` runs 0–1 clockwise from the top.
 */
export function Ring({ size, stroke, progress, children }: { size: number; stroke: number; progress: number; children?: ReactNode }) {
  const p = Math.max(0, Math.min(1, progress));
  const half = size / 2;
  const ring = { width: size, height: size, borderRadius: half, borderWidth: stroke, borderColor: color.accent };
  const side = (which: "left" | "right", deg: number) => (
    <View style={{ position: "absolute", top: 0, [which]: 0, width: half, height: size, overflow: "hidden" }}>
      <View style={{ position: "absolute", top: 0, left: which === "right" ? -half : 0, width: size, height: size, transform: [{ rotate: `${deg}deg` }] }}>
        <View style={{ position: "absolute", top: 0, left: which === "right" ? 0 : half, width: half, height: size, overflow: "hidden" }}>
          <View style={[ring, { position: "absolute", top: 0, left: which === "right" ? 0 : -half }]} />
        </View>
      </View>
    </View>
  );
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={[ring, { position: "absolute", borderColor: color.raised }]} />
      {p > 0 ? side("right", Math.min(p, 0.5) * 360) : null}
      {p > 0.5 ? side("left", (p - 0.5) * 360) : null}
      {children}
    </View>
  );
}

/** A small coloured dot (session kinds, status). */
export function Dot({ tint, size = 8 }: { tint: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint }} />;
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
          <Text style={[type.label, isOn(o.value) && { color: color.onAccent }]}>{o.label}</Text>
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
      placeholderTextColor="#5E656E"
      selectionColor={color.accent}
      keyboardAppearance="dark"
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
        <Text style={[type.title, { color: color.muted }]}>−</Text>
      </Pressable>
      <Text style={[type.title, type.figure, { minWidth: 96, textAlign: "center" }]}>
        {value} {unit}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`More ${label}`} onPress={() => onChange(Math.min(max, value + step))} style={s.stepBtn}>
        <Text style={[type.title, { color: color.muted }]}>+</Text>
      </Pressable>
    </View>
  );
}

/** primary: yellow pill. soft: a quiet card-coloured pill. quiet: text only. */
export function Button({ title, onPress, kind = "primary", busy = false }: { title: string; onPress: () => void; kind?: "primary" | "soft" | "quiet"; busy?: boolean }) {
  const box = kind === "primary" ? s.btn : kind === "soft" ? s.btnSoft : s.btnQuiet;
  const text = kind === "primary" ? s.btnText : kind === "soft" ? s.btnSoftText : s.btnQuietText;
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ busy }}
      style={({ pressed }) => [box, pressed && { opacity: 0.8, transform: [{ scale: 0.99 }] }]}
    >
      <Text style={text}>{busy ? "Working…" : title}</Text>
    </Pressable>
  );
}

/** A highlighted note. With `onDismiss` it gets a close button (safety notes should never be dismissible). */
export function Callout({ children, tone = "note", onDismiss }: { children: ReactNode; tone?: "note" | "safety"; onDismiss?: () => void }) {
  return (
    <View style={[s.callout, tone === "safety" && { backgroundColor: color.safetySoft }, onDismiss && { flexDirection: "row", gap: space.sm }]}>
      <View style={[s.calloutDot, tone === "safety" && { backgroundColor: color.safety }]} />
      <Text style={[type.small, { color: color.text, flex: 1 }]}>{children}</Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={12} style={s.dismiss}>
          <Text style={s.dismissText}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: 20, paddingTop: space.lg, paddingBottom: 40 },
  column: { width: "100%", maxWidth: 560, alignSelf: "center" },
  footer: { paddingHorizontal: 20, paddingTop: space.md, paddingBottom: space.lg, backgroundColor: color.bg },
  mark: { fontFamily: font.semibold, fontSize: 17, letterSpacing: -0.2, color: color.text, marginBottom: space.xl },
  demo: { alignSelf: "center", backgroundColor: color.accentSoft, paddingVertical: 6, paddingHorizontal: space.md, borderRadius: radius.pill, marginTop: space.xs },
  demoText: { ...type.data, fontSize: 12, color: color.accent, textAlign: "center" },
  lane: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.xl },
  laneTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: color.raised, overflow: "hidden" },
  laneFill: { height: 6, borderRadius: 3, backgroundColor: color.accent },
  error: { ...type.small, color: color.safety, marginTop: space.sm },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: color.surface,
    backgroundColor: color.surface,
    marginBottom: space.sm,
    minHeight: 56,
  },
  choiceOn: { borderColor: color.accent, backgroundColor: color.accentSoft },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: color.faint, alignItems: "center", justifyContent: "center" },
  dotFill: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.accent },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: color.faint, alignItems: "center", justifyContent: "center" },
  boxTick: { width: 10, height: 10, borderRadius: 3, backgroundColor: color.accent },
  markOn: { borderColor: color.accent },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pill: { minWidth: 52, minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: color.surface },
  pillOn: { backgroundColor: color.accent },
  field: { ...type.body, minWidth: 0, minHeight: 52, paddingHorizontal: space.lg, borderRadius: radius.control, borderWidth: 1.5, borderColor: color.surface, backgroundColor: color.surface },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.md },
  stepBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: color.surface, alignItems: "center", justifyContent: "center" },
  btn: { minHeight: 56, borderRadius: radius.pill, backgroundColor: color.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  btnText: { fontFamily: font.semibold, fontSize: 17, color: color.onAccent },
  btnSoft: { minHeight: 52, borderRadius: radius.pill, backgroundColor: color.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg },
  btnSoftText: { fontFamily: font.medium, fontSize: 16, color: color.text },
  btnQuietText: { fontFamily: font.medium, fontSize: 16, color: color.muted },
  btnQuiet: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  dismiss: { width: 24, height: 24, alignItems: "center", justifyContent: "center", marginTop: -2 },
  dismissText: { fontFamily: font.regular, fontSize: 22, lineHeight: 24, color: color.muted },
  callout: { flexDirection: "row", alignItems: "flex-start", gap: space.md, backgroundColor: color.panel, paddingVertical: 14, paddingHorizontal: space.lg, borderRadius: 18, marginBottom: space.lg },
  calloutDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent, marginTop: 7 },
});
