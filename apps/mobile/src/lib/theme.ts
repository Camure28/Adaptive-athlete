/**
 * Visual tokens (D-027): calm and rounded. A deep slate-ink background instead of pure black,
 * tone-on-tone cards without borders, one friendly geometric typeface in sentence case, and
 * signal yellow kept for actions and progress only. Red is reserved for pain and safety.
 * One deliberate dark theme (the app doesn't follow the phone's light/dark setting).
 */
export const color = {
  bg: "#12151B", // page: slate ink
  surface: "#1B1F27", // cards, inputs
  raised: "#262B35", // selected rows, chips, pressed
  line: "#2F3541", // the rare divider or track
  text: "#F3F4F6", // primary text
  muted: "#98A1AF", // secondary text
  faint: "#646D7B", // placeholders, tertiary
  accent: "#FFC93C", // signal yellow: primary action, selection, progress
  accentSoft: "#2B281C", // selected background
  onAccent: "#17140A", // text on yellow
  safety: "#FF6B7A", // pain / safety only
  safetySoft: "#3A1E25",
  panel: "#1B1F27", // neutral callouts (same tone as cards)
} as const;

/** Session colours: small dots and marks only, never large fills. */
export const kind = {
  hyrox: color.accent,
  hard: "#FF9B5E", // threshold, race pace, intervals
  easy: "#6FD3B5", // easy, long and recovery runs
  strength: "#A99BFF",
  rest: color.faint,
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * Type: Outfit throughout (round, geometric, easy to read on the move), sentence case everywhere.
 * Hierarchy comes from size and weight, not capitals or a second typeface.
 */
export const font = {
  regular: "Outfit_400Regular",
  medium: "Outfit_500Medium",
  semibold: "Outfit_600SemiBold",
  bold: "Outfit_700Bold",
  display: "Outfit_600SemiBold",
  title: "Outfit_600SemiBold",
  /** Kept for older call sites: figures now use the same family. */
  mono: "Outfit_500Medium",
  monoBold: "Outfit_600SemiBold",
} as const;

export const type = {
  display: { fontFamily: font.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.5, color: color.text },
  title: { fontFamily: font.title, fontSize: 20, lineHeight: 26, letterSpacing: -0.2, color: color.text },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24, color: color.text },
  strong: { fontFamily: font.medium, fontSize: 16, lineHeight: 24, color: color.text },
  explain: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.muted },
  small: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.muted },
  label: { fontFamily: font.medium, fontSize: 15, lineHeight: 20, color: color.text },
  /** Big figures: countdowns, volumes. */
  readout: { fontFamily: font.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: color.text },
  data: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted },
  /** A quiet heading above a block: "The work", "Why". */
  eyebrow: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: color.muted },
  figure: { fontVariant: ["tabular-nums" as const] },
};

export const radius = { control: 14, row: 20, card: 24, pill: 999 } as const;
