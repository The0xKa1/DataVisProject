import type { DashboardJSON, EventItem, PhraseRow } from "@/lib/charts/types";
import { eventInteractions, parseEventDate } from "@/lib/format";

export type StageKind = "network" | "timeline" | "orbit";

// Driver hands these to each step's `apply`. Wraps the store so the steps
// stay declarative and testable. `setOrbitPhase` accepts 0..1 to drive the
// pinned OrbitScene's camera; `null` releases control back to its self
// ScrollTrigger (used after the section ends).
export interface StepHelpers {
  data: DashboardJSON | null;
  setLabel: (v: "all" | "fake" | "real") => void;
  setBotHeavy: (v: boolean) => void;
  setSearch: (v: string) => void;
  setDateRange: (r: [Date, Date] | null) => void;
  setSelected: (id: string | null) => void;
  setOrbitPhase: (p: number | null) => void;
  resetFilters: () => void;
}

export interface Step {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  side: "left" | "right";
  stage: StageKind;
  apply: (h: StepHelpers) => void;
}

// Helper: locate the highest-fake month in the timeline and return a
// [start, end] window covering that month ± 1 month. Falls back to full
// range when timeline is empty / malformed.
function burstWindow(data: DashboardJSON | null): [Date, Date] | null {
  if (!data?.timeline?.length) return null;
  const peak = [...data.timeline].sort((a, b) => (b.fake ?? 0) - (a.fake ?? 0))[0];
  if (!peak) return null;
  const [y, m] = peak.month.split("-").map((s) => parseInt(s, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  // ±1 month around the peak
  const start = new Date(y, m - 2, 1);
  const end = new Date(y, m + 1, 0, 23, 59, 59);
  return [start, end];
}

// Helper: top engagement event matching a label, optionally inside a window.
function topEvent(
  data: DashboardJSON | null,
  label?: "fake" | "real",
  window?: [Date, Date] | null,
): EventItem | null {
  if (!data?.events?.length) return null;
  const filtered = data.events.filter((e) => {
    if (label && e.label !== label) return false;
    if (window) {
      const dt = parseEventDate(e.date);
      if (!dt) return false;
      if (dt < window[0] || dt > window[1]) return false;
    }
    return true;
  });
  filtered.sort((a, b) => eventInteractions(b) - eventInteractions(a));
  return filtered[0] ?? data.events[0] ?? null;
}

function topPhrase(data: DashboardJSON | null): PhraseRow | null {
  return data?.phrases?.[0] ?? null;
}

// 9-step Case Study narrative. Each `apply` is idempotent: re-running it
// from any prior state lands the store in this step's intended state.
// Filters that clear `selectedId` (setLabel/setBotHeavy/setSearch/setDateRange)
// are called BEFORE setSelected so focus survives.
export const STEPS: Step[] = [
  {
    id: "overview",
    eyebrow: "01 / OVERVIEW",
    title: "A field of microblogs.",
    body:
      "Twenty-three thousand information instances, nearly a million participants. Each star is a microblog; radius is engagement, lane is fake versus real. Before we accuse anyone of coordination, we look at the field as a whole.",
    side: "left",
    stage: "orbit",
    apply: (h) => {
      h.resetFilters();
      h.setOrbitPhase(0);
    },
  },
  {
    id: "fake-only",
    eyebrow: "02 / NARRATIVES",
    title: "Isolate the fake stream.",
    body:
      "Most months carry a low base rate of misinformation. We strip out the verified posts and look at the misinformation timeline alone — orange bars only, real-axis muted.",
    side: "right",
    stage: "timeline",
    apply: (h) => {
      h.setOrbitPhase(0.15);
      h.setLabel("fake");
      h.setDateRange(null);
      h.setSelected(null);
    },
  },
  {
    id: "burst",
    eyebrow: "03 / BURST",
    title: "Find the spike.",
    body:
      "One month dominates the misinformation curve. We brush a window around it and watch every other view follow — keywords, actors, evidence — re-scoped to the burst period.",
    side: "left",
    stage: "timeline",
    apply: (h) => {
      h.setOrbitPhase(0.25);
      h.setLabel("fake");
      const w = burstWindow(h.data);
      if (w) h.setDateRange(w);
    },
  },
  {
    id: "network-in",
    eyebrow: "04 / DIFFUSION",
    title: "Switch to the propagation graph.",
    body:
      "Inside the burst window, posts and amplifiers form a force-directed network. Squares are microblogs, circles are actors. The window is preserved — we are looking at the same time slice, in a different geometry.",
    side: "right",
    stage: "network",
    apply: (h) => {
      h.setOrbitPhase(0.35);
      h.setLabel("fake");
      const w = burstWindow(h.data);
      if (w) h.setDateRange(w);
    },
  },
  {
    id: "core-amplifier",
    eyebrow: "05 / FOCUS",
    title: "The loudest microblog.",
    body:
      "We highlight the highest-engagement fake post in the window. Its one-hop neighbors light up — every actor that reposted, commented, or reacted. The rest of the graph dims to context.",
    side: "left",
    stage: "network",
    apply: (h) => {
      h.setOrbitPhase(0.45);
      h.setLabel("fake");
      const w = burstWindow(h.data);
      if (w) h.setDateRange(w);
      const ev = topEvent(h.data, "fake", w);
      if (ev) h.setSelected(ev.id);
    },
  },
  {
    id: "template",
    eyebrow: "06 / TEMPLATE",
    title: "Same words, many mouths.",
    body:
      "Re-used phrases are the cheapest coordination signal we have. We search the most-repeated template — every microblog whose text contains it stays lit, the rest fall away.",
    side: "right",
    stage: "network",
    apply: (h) => {
      h.setOrbitPhase(0.55);
      h.setLabel("fake");
      const phrase = topPhrase(h.data);
      // Search clears selectedId — re-apply the focal event after.
      h.setSearch(phrase?.text ?? "");
      const w = burstWindow(h.data);
      if (w) h.setDateRange(w);
      const ev = topEvent(h.data, "fake", w);
      if (ev) h.setSelected(ev.id);
    },
  },
  {
    id: "bot-heavy",
    eyebrow: "07 / BOT SLICE",
    title: "Filter to bot-heavy participation.",
    body:
      "Weakly supervised bot scores are proxy signals, not accusations. We restrict to microblogs whose participants are at least a quarter bot-labeled. The graph collapses to the candidates worth a closer look.",
    side: "left",
    stage: "network",
    apply: (h) => {
      h.setOrbitPhase(0.65);
      h.setLabel("fake");
      h.setSearch("");
      h.setBotHeavy(true);
      const w = burstWindow(h.data);
      if (w) h.setDateRange(w);
      const ev = topEvent(h.data, "fake", w);
      if (ev) h.setSelected(ev.id);
    },
  },
  {
    id: "close-read",
    eyebrow: "08 / CLOSE READ",
    title: "Zoom in. Read the evidence.",
    body:
      "Back in orbit space, the camera drops into close-read phase: stars separate by lane, halos brighten on the focal event. The audit hands the analyst a single, anonymized post to read carefully.",
    side: "right",
    stage: "orbit",
    apply: (h) => {
      h.setOrbitPhase(0.95);
      h.setLabel("fake");
      h.setBotHeavy(true);
      h.setSearch("");
      const w = burstWindow(h.data);
      if (w) h.setDateRange(w);
      const ev = topEvent(h.data, "fake", w);
      if (ev) h.setSelected(ev.id);
    },
  },
  {
    id: "audit-posture",
    eyebrow: "09 / POSTURE",
    title: "An audit, not an accusation.",
    body:
      "We surfaced a fake-heavy burst, a coordinated phrase, a bot-labeled slice, and one focal post. Nothing in this story is a verdict. The system's job is to put suspect signals in front of a human reviewer, then step back.",
    side: "left",
    stage: "orbit",
    apply: (h) => {
      h.resetFilters();
      h.setOrbitPhase(1);
    },
  },
];
