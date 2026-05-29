export type StageKind = "network" | "timeline" | "orbit";

export interface StepHelpers {
  setStoryPreset: (presetId: string) => void;
}

export interface Step {
  id: string;
  presetId: string;
  eyebrow: string;
  title: string;
  body: string;
  side: "left" | "right";
  stage: StageKind;
  apply: (h: StepHelpers) => void;
}

function preset(id: string) {
  return (h: StepHelpers) => h.setStoryPreset(id);
}

// MIT-style story steps: each card only selects a deterministic network
// preset. The preset then drives viewport, highlights, timeline window, and
// evidence through the dashboard store.
export const STEPS: Step[] = [
  {
    id: "overview",
    presetId: "overview",
    eyebrow: "01 / OVERVIEW",
    title: "The audit opens as one field.",
    body:
      "A bounded projection of MisBot cases fills the background. Each cluster is a prepared story shard, not a live force simulation. We start wide so topology reads as context rather than accusation.",
    side: "left",
    stage: "network",
    apply: preset("overview"),
  },
  {
    id: "fake-burst",
    presetId: "fake-burst",
    eyebrow: "02 / BURST",
    title: "Scroll into the fake-heavy window.",
    body:
      "The camera moves toward the strongest misinformation burst and the shared filters follow: fake stream, burst months, and the first evidence candidate become the active analytical slice.",
    side: "right",
    stage: "network",
    apply: preset("fake-burst"),
  },
  {
    id: "propagation-core",
    presetId: "propagation-core",
    eyebrow: "03 / DIFFUSION",
    title: "Hold the layout. Change the scale.",
    body:
      "Instead of recomputing a force graph, the narrative zooms into a stable cascade. Actors and posts stay in place, so the viewer can learn the shape as the explanation gets narrower.",
    side: "left",
    stage: "network",
    apply: preset("propagation-core"),
  },
  {
    id: "template-cluster",
    presetId: "template-cluster",
    eyebrow: "04 / TEMPLATE",
    title: "Repeated phrasing becomes a region.",
    body:
      "A repeated text template turns into a spatial focus. The search state updates behind the scenes, tying a language signal to the same network field.",
    side: "right",
    stage: "network",
    apply: preset("template-cluster"),
  },
  {
    id: "bot-heavy",
    presetId: "bot-heavy",
    eyebrow: "05 / PROXY SIGNAL",
    title: "Bot-heavy nodes light up, carefully.",
    body:
      "Weak bot labels are proxy evidence only. The story highlights candidate-heavy participation while preserving the visual reminder that this is an audit surface, not a verdict.",
    side: "left",
    stage: "network",
    apply: preset("bot-heavy"),
  },
  {
    id: "evidence-focus",
    presetId: "evidence-focus",
    eyebrow: "06 / CLOSE READ",
    title: "Land on one local neighborhood.",
    body:
      "The camera drops to a single post and its immediate neighbors. The evidence panel receives the same selected event, making the scroll step end in something the analyst can actually read.",
    side: "right",
    stage: "network",
    apply: preset("evidence-focus"),
  },
  {
    id: "limits",
    presetId: "limits",
    eyebrow: "07 / LIMITS",
    title: "Pull back before conclusion.",
    body:
      "The network zooms back out. Omitted topology and proxy labels remain part of the story, because the system should surface signals for human review, not present automatic accusations.",
    side: "left",
    stage: "network",
    apply: preset("limits"),
  },
];
