/**
 * Visual tokens. Concrete, ink and turf: the floor of a training hall rather than a brand palette.
 * Red is reserved for pain and safety messages only.
 */
export const color = {
  concrete: "#E8EBEA", // page
  surface: "#FFFFFF", // inputs, selected rows
  ink: "#15191C", // primary text
  iron: "#3C4349", // secondary text
  rule: "#C9CFCC", // borders and lane gaps
  turf: "#1E6B4A", // primary action, selection, progress
  turfSoft: "#D6E8DE", // selected background
  safety: "#C8283C", // pain / safety only
  safetySoft: "#F6DDE0",
  note: "#F1EDD9", // neutral callouts (assumptions, demo mode)
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * Type: Barlow Condensed for titles (athletic, compact), Barlow for everything else.
 * Three voices on a session: the title (condensed, bold), the work (semibold, figures line up),
 * and the explanation (regular, quieter colour). Custom fonts set the weight via the family.
 */
export const font = {
  display: "BarlowCondensed_700Bold",
  title: "BarlowCondensed_600SemiBold",
  regular: "Barlow_400Regular",
  medium: "Barlow_500Medium",
  semibold: "Barlow_600SemiBold",
} as const;

export const type = {
  display: { fontFamily: font.display, fontSize: 34, lineHeight: 38, letterSpacing: 0.2, color: color.ink },
  title: { fontFamily: font.title, fontSize: 22, lineHeight: 26, letterSpacing: 0.2, color: color.ink },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23, color: color.ink },
  strong: { fontFamily: font.semibold, fontSize: 16, lineHeight: 23, color: color.ink },
  explain: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.iron },
  small: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: color.iron },
  label: { fontFamily: font.semibold, fontSize: 14, lineHeight: 18, color: color.ink },
  /** Small capitals above a section: WHY, THE WORK. */
  eyebrow: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 1.2, textTransform: "uppercase" as const, color: color.iron },
  figure: { fontVariant: ["tabular-nums" as const] },
};

export const radius = { control: 10, row: 12 } as const;
