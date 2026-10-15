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

export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: "700" as const, letterSpacing: -0.5, color: color.ink },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "700" as const, color: color.ink },
  body: { fontSize: 16, lineHeight: 23, color: color.ink },
  small: { fontSize: 14, lineHeight: 20, color: color.iron },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "600" as const, color: color.ink },
  figure: { fontVariant: ["tabular-nums" as const] },
};

export const radius = { control: 10, row: 12 } as const;
