// Dark-theme chart palette — derived from the v0 INTERFACE design tokens
// (oklch values in app/globals.css). Used by d3 and three.js modules that
// can't read CSS variables directly.

export const COLORS = {
  // Page surfaces
  bg: "#0a0a0a", //   --background
  bgDeep: "#050505",
  surface: "#131313", //   --card
  surfaceAlt: "#1a1a1a",

  // Ink + text
  ink: "#ededed", //   --foreground
  inkSoft: "#cfcfcf",
  muted: "#7a7a7a", //   --muted-foreground
  muted2: "#545454",

  // Rules + dividers
  rule: "#333333", //   --border
  ruleSoft: "rgba(237, 237, 237, 0.18)",
  ruleFaint: "rgba(237, 237, 237, 0.08)",

  // Semantic accents
  hot: "#e96a2c", //   --accent (the signature orange)
  hotSoft: "rgba(233, 106, 44, 0.22)",
  cool: "#6f9fd8", //   secondary axis / engagement line
  coolSoft: "rgba(111, 159, 216, 0.22)",

  // Convenience aliases used heavily by the legacy port
  fake: "#e96a2c",
  real: "#ededed",
  accent: "#6f9fd8",
} as const;

// Cardinal sizing constants the chart code passes through.
export const RING_THICKNESS = 3.5;
export const MICROBLOG_MIN = 9;
export const MICROBLOG_MAX = 28;
export const ACTOR_MIN = 3.6;
export const ACTOR_MAX = 11;

export function labelColor(label?: string): string {
  if (label === "fake") return COLORS.fake;
  if (label === "real") return COLORS.real;
  return COLORS.cool;
}

export function microblogRadius(weight?: number): number {
  return Math.max(MICROBLOG_MIN, Math.min(MICROBLOG_MAX, Math.sqrt(weight || 1) * 0.38));
}

export function actorRadius(weight?: number): number {
  return Math.max(ACTOR_MIN, Math.min(ACTOR_MAX, Math.sqrt(weight || 1) * 0.18));
}
