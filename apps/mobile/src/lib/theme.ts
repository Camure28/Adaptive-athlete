/**
 * Visual tokens: a dark performance cockpit. Near-black surfaces, signal yellow for action and
 * live data, cool greys for everything secondary. Red is reserved for pain and safety only.
 * One deliberate dark theme (the app doesn't follow the phone's light/dark setting).
 */
export const color = {
  bg: "#0A0B0D", // page
  surface: "#14161A", // cards, inputs
  raised: "#1C1F24", // selected rows, chips
  line: "#2A2E35", // borders and dividers
  text: "#F2F3EF", // primary text
  muted: "#9AA1AA", // secondary text
  accent: "#FFC400", // signal yellow: primary action, selection, progress, live figures
  accentSoft: "#2B2410", // selected background
  onAccent: "#0A0B0D", // text on yellow
  safety: "#FF5468", // pain / safety only
  safetySoft: "#3A1419",
  panel: "#191B10", // neutral callouts (assumptions, demo mode)
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * Type: Barlow Condensed for titles (athletic, compact), Barlow for everything else.
 * Three voices on a session: the title (condensed, bold), the work (semibold, figures line up),
 * and the explanation (regular, quieter colour). Custom fonts set the weight via the family.
 */
export const font = {
  mono: "JetBrainsMono_500Medium",
  monoBold: "JetBrainsMono_700Bold",
  display: "BarlowCondensed_700Bold",
  title: "BarlowCondensed_600SemiBold",
  regular: "Barlow_400Regular",
  medium: "Barlow_500Medium",
  semibold: "Barlow_600SemiBold",
} as const;

export const type = {
  display: { fontFamily: font.display, fontSize: 36, lineHeight: 38, letterSpacing: 0.6, textTransform: "uppercase" as const, color: color.text },
  title: { fontFamily: font.title, fontSize: 22, lineHeight: 26, letterSpacing: 0.2, color: color.text },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23, color: color.text },
  strong: { fontFamily: font.semibold, fontSize: 16, lineHeight: 23, color: color.text },
  explain: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.muted },
  small: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.muted },
  label: { fontFamily: font.semibold, fontSize: 14, lineHeight: 18, color: color.text },
  /** Instrument readouts: countdowns, paces, volumes. */
  readout: { fontFamily: "JetBrainsMono_700Bold", fontSize: 28, lineHeight: 32, color: color.accent, letterSpacing: -0.5 },
  data: { fontFamily: "JetBrainsMono_500Medium", fontSize: 13, lineHeight: 18, letterSpacing: 0.4, color: color.muted },
  /** Small capitals above a section: WHY, THE WORK. */
  eyebrow: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 1.2, textTransform: "uppercase" as const, color: color.muted },
  figure: { fontVariant: ["tabular-nums" as const] },
};

export const radius = { control: 6, row: 8 } as const;
