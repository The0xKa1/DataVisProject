# CURRENT

## Current Phase

Front-end now uses a MIT-style background-network scrollytelling +
analyst-console dashboard.
The MisBot builder emits all 23,622 information instances, full aggregate
rankings, coordination indexes, and complete event graph files for priority
story cases plus recent events. The analyst console loads precomputed full
propagation graphs, falls back to raw-data computation for older selections,
and switches large graphs into a fullscreen-capable 3D propagation space
instead of forcing thousands of nodes into one SVG force layout.

## Confirmed Decisions

- Front-end stack: Next.js 15 stable + React 19, Tailwind v4, shadcn/ui
  primitives, IBM Plex Sans/Mono + Bebas Neue (via `next/font/google`).
- Animation chain preserved verbatim from v0 INTERFACE: GSAP ScrollTrigger
  (hero parallax scrub, signals/work/principles/colophon slide-ins, magnetic
  cursor in Signals), Lenis smooth scroll bridged into GSAP's ticker,
  SplitFlapText hero, ScrambleTextOnHover CTAs, HighlightText scroll
  parallax in Principles, BitmapChevron rotate, AnimatedNoise canvas grain.
- Data viz stack stays d3 v7 + three.js. The scrollytelling section now uses
  a full-bleed sticky canvas story network derived from real MisBot graph
  shards with deterministic zoom/pan presets; the analyst console loads
  precomputed full selected-event propagation graphs from
  `public/data/misbot_full_graphs/` and renders large events as an interactive
  3D propagation space.
- State: Zustand store + selector hooks. Tooltip is a portal singleton
  with its own Zustand store so 60Hz mousemove never re-renders the page.
- Story state: `activeStoryPresetId`, story viewport, and highlighted nodes
  sit in Zustand. Step cards activate named presets such as `fake-burst`,
  `propagation-core`, `template-cluster`, `bot-heavy`, and `evidence-focus`.
- Selection uses `selectedId` and `selectedActorId` in Zustand; the story
  canvas, evidence card, and `PropagationSpace` respond without page-wide
  React rerenders.
- 3D pipeline: `scripts/build_misbot_dashboard.py` writes `GraphShard` JSON
  under `public/data/misbot_full_graphs/`; the analyst console loads it into
  Zustand as `graphShard`; `PropagationSpace` maps it to three.js meshes,
  shader-driven curved line buffers, postprocessed glow, and `InstancedMesh`
  flow pulses.
- `PropagationSpace.prepareSpace` precomputes adjacency sets, per-node edge
  lists, BFS distance, risk groups, and influence scores before the render loop.
- Page composition (`app/page.tsx`):
  Hero → Signals (dataset facts) → FilterBar (sticky) → Scrollytelling
  case study → Full-coverage analyst console → Principles → Colophon.
- Static dashboard archived under `legacy/` (preserved for reference).
- Documentation still lives only in `docs/README.md` and `docs/CURRENT.md`.
- GitHub remote repository is public: `https://github.com/The0xKa1/DataVisProject`.
- Final topic: 基于社交媒体/群聊文本的"网络水军"与虚假信息协同扩散审计系统.
- System framing: exploratory audit and evidence inspection, not automatic accusation.
- Primary data candidate: MisBot; CHECKED stays as offline demo fallback.
- Raw MisBot data ignored by git at `data/raw/misbot`.
- Processed full-coverage dashboard JSON at `public/data/misbot_dashboard.json`.
- Latest selected-event graphs live under `public/data/misbot_full_graphs/`.
- Weakly supervised bot labels are proxy signals only, not account-level accusations.

## How to Run (TA-ready, ~5 min)

```bash
npm install
npm run dev   # opens http://localhost:3000
```

If `public/data/misbot_dashboard.json` is still the placeholder/empty schema,
the page automatically falls back to `public/data/checked_dashboard.json`
(a populated CHECKED dataset) so the dashboard is never blank.

To swap in real MisBot data:

```bash
# Download MisBot raw into data/raw/misbot, then:
python3 scripts/build_misbot_dashboard.py \
  --raw data/raw/misbot \
  --out public/data/misbot_dashboard.json
npm run dev
```

The build no longer samples 60 events by default. It emits every MisBot
information instance and coordination index, plus full per-event graphs for
priority story cases and the latest events by publish date. Use
`--full-graph-limit 0` to write all event graphs, or `--limit-events` only for
local debug runs.

Production build:

```bash
npm run build && npm start
```

## Topic / Dataset / Stack Status

- Topic: confirmed.
- Dataset: MisBot primary, CHECKED as offline demo fallback (populated).
- Frontend stack: Next.js 15 + React 19 + Tailwind v4 + d3 + three.js.
- Data processing stack: Python script over MisBot JSONL (unchanged).
- Deployment target: undecided.

## Data Candidates

| Priority | Dataset | Use |
| --- | --- | --- |
| 1 | MisBot | Main candidate for Weibo misinformation diffusion and bot participation analysis. |
| 2 | CHECKED | Populated fallback so the dashboard always renders when MisBot raw is unavailable. |
| 3 | VoterFraud2020 | Later comparison for event-centered Twitter coordination proxies. |
| 4 | PHEME / CoAID | Backup rumor and COVID misinformation datasets. |

## Active Tasks

- Finalize UI polish pass: actor highlight + timeline mini-map integration is done.
- Validate the full-coverage dashboard with real MisBot events, actor bot
  scores, burst windows, priority-case full event graphs, and large-graph
  canvas interaction.
- Confirm team members and division of work.
- Keep AI usage, design rationale, and case studies documented in the final report or README sections when needed.

## Blockers

- Need to avoid committing private, restricted, or non-anonymized raw data.
- Need to decide how much derived text evidence can be committed in the public repo under MisBot privacy guidance.
- Full generated dashboard JSON is about 43 MB, and the complete graph folder
  is about 397 MB, so the TA run path is local-first rather than a tiny static
  demo artifact.

## Immediate Focus

1. Review the background-network story at `http://localhost:3000/#case-study`.
2. Review the full-coverage analyst console at `http://localhost:3000/#analyst-console`.
3. Confirm team responsibilities and presentation ownership.

## Completion Notes

### Scrollytelling narrative rewrite with restored MisBot data (2026-06-08)

- Restored full MisBot dashboard (23,622 events, 18 burst windows, 120 template signals, 80 hub actors) from git commit `a721cba^` — the generated artifact was previously tracked before `public/data/` was gitignored.
- Replaced all 8 scrollytelling card texts from generic "system feature tour" to a data-driven narrative anchored on the **Prada Rong Residence fire rumor** (event `b596cd8d`, July 2023), the peak burst in the 2023 summer disinformation campaign.
- Updated `buildFocusRegions` in `story-network.ts` to select fake burst events as the primary evidence anchor, and to point `propagation-core` at the Prada fire cluster (cluster-2, 160 nodes) instead of the first case graph's real event (cluster-1, 5 nodes).
- Pushed to branch `feat/scrollytelling-narrative` for review.

## Completion Notes

### PropagationSpace real-event exposure tuning (2026-06-03)

- Reduced 3D bloom strength, glow texture opacity, hot point light intensity,
  pulse opacity, and shader stream brightness so selected real events no longer
  overexpose the center of the propagation graph.
- Changed real event nodes from pure white emissive color to a cooler gray-blue
  and gave real events lower selected scale/glow than fake events.
- Limited selected-edge overlay to actor selections only; event roots no longer
  redraw every incident edge as an extra hot highlight layer.
- Verified in browser with a large real event (`fb548390`, 17,497 participants):
  center WebGL sample reported 0% white pixels, 0% very-bright pixels, and max
  luma about 155 instead of a saturated white core.

### Analyst console semantic focus graphs (2026-06-03)

- Added explicit `auditFocus` state so the propagation panel can distinguish
  single events from burst-window, hub-actor, and repeated-template focus.
- Added semantic 2D force-directed focus graphs: burst windows render as
  window -> representative events -> related/shared participant candidates;
  hub actors render as actor ego graphs; repeated templates render as
  template -> matched events -> related participant candidates.
- Clicking graph event nodes or the "open single event" control switches into
  the precomputed full single-event 3D propagation graph.
- Updated the MisBot builder so future actor/hub rows keep multiple top event
  ids, giving actor ego graphs more event context after regeneration.
- Verified with `npm run typecheck`, `npm run build`, and browser automation at
  `http://127.0.0.1:3004/#analyst-console`: window, hub, template, and
  single-event graph states route correctly; aggregate focus states use a 2D
  SVG force graph, while the selected single-event state uses a live 3D canvas.

### StoryNetworkCanvas cinematic background pass (2026-06-03)

- Added a two-layer canvas stack for the scrollytelling story network: the
  lower layer renders blurred/saturated atmosphere and bloom, while the upper
  layer keeps crisp edges, nodes, labels, and pointer interaction.
- Reworked story-network edges from flat strokes into source-to-target alpha
  gradients with much quieter inactive edges, so non-current topology reads as
  background structure instead of dense color blocks.
- Added deterministic edge-control-point wobble, propagation-delay flow
  particles, distance attenuation, and a focus-change ripple so step changes
  feel more like information diffusion than uniform animation.
- Changed rendered node sizing to a nonlinear scale: microblog hubs stay
  visually dominant while ordinary actor nodes compress into a finer starfield.
- Added parallax depth grid/dust, stronger vignette masking, and dark-backed
  hover/selected labels to improve cinematic focus and readability.
- Corrected the hero CTA and review link from the stale `#work` anchor to the
  real `#case-study` scrollytelling section.
- Verified with `npm run typecheck`, `npm run build`, and browser QA at
  `http://127.0.0.1:3004/#case-study`: the two canvas layers mount, render
  non-empty orange/blue network pixels, and stay active through the
  `fake-burst` scroll step with no application console errors.

### 3D PropagationSpace smoothing pass (2026-06-02)

- Replaced repeated selected-neighborhood edge scans with precomputed adjacency
  sets and per-node edge lists, so actor one-hop queries are O(1) per neighbor
  instead of scanning the full edge list.
- Converted weak propagation edges and selected-neighborhood lines from straight
  segments into deterministic multi-segment Bezier curves with source-to-target
  vertex-color gradients.
- Merged strong-edge rendering into a single shader-driven curve buffer instead
  of allocating one `Line2` object per strong edge.
- Dragging a node now rewrites only that node's adjacent edge curves in the
  batched buffers instead of recomputing every edge on each pointer move.
- Added per-vertex edge alpha attributes so weak and strong edges fade from
  source to target through `ShaderMaterial` rather than baked RGB darkening.
- Added per-edge progress and phase shader attributes so weak and strong edges
  now breathe and carry time-driven traveling highlights on the GPU.
- Tuned strong edges away from continuous glowing tubes: they now render as
  faint evidence skeletons with short dashed traveling traces.
- Moved flow pulses onto the same curved paths and added subtle non-linear
  timing so propagation motion reads less mechanically.
- Added a restrained `EffectComposer` chain with `UnrealBloomPass` so flow
  pulses and emissive nodes read as luminous propagation traces.
- Replaced rectangular `GridHelper` risk planes with circular radar grids and
  fragment-shader expanding rings.
- Added cascade/reply parent-angle bias so actor children in a propagation
  branch cluster nearer their parent rather than scattering uniformly.
- Cleaned current docs to refer to `PropagationSpace` instead of removed
  legacy three.js scene labels.

### Midterm LaTeX report draft (2026-06-01)

- Added `report/midterm_report.tex` for the course midterm document, covering
  background, task definitions, data, design plan, current implementation
  progress, and remaining work with a Zhejiang University course cover.

### 3D large graph propagation pass (2026-06-01)

- Replaced the large-graph chord/bundling direction with a direct 3D propagation
  space: core event nodes sit near the center while participant actors are
  distributed across risk-layered spherical shells.
- Large graphs now support fullscreen inspection, orbit rotation, dolly zoom,
  hover tooltips, actor/event selection, reset view, and direct node dragging.
- Full graph edges remain visible as original links; selecting a node highlights
  its one-hop neighborhood for ringleader-style topology inspection.

### Deliverable scrollytelling + large-graph audit pass (2026-06-01)

- Rebuilt the MisBot story-network selection so the homepage canvas is driven
  by priority case shards: fake bursts, repeated-template events, suspect
  amplifier neighborhoods, and evidence close reads all point to real event
  IDs and precomputed full graph files.
- Added a dedicated `ringleader-hunt` story preset. It carries
  `selectedActorId`, highlights the candidate actor's local topology, and keeps
  the framing as proxy evidence rather than accusation.
- Story cards now show data-derived metrics for each preset: node count, event
  count, selected event label/short ID, date range, proxy bot share, and the
  generated story summary.
- Large analyst-console graphs now use a 3D propagation space instead of
  falling back to a static aggregate summary. Users can rotate, zoom, hover,
  click actor/event nodes, drag nodes, reset the view, and inspect one-hop
  neighborhoods.
- Updated full-graph preprocessing to include priority story cases first, then
  fill the remaining graph budget with recent MisBot events.

### Full Chinese interface pass (2026-06-01)

- Converted the visible application interface to Chinese, including the hero,
  dataset cards, sticky filters, scrollytelling steps, analyst console panels,
  propagation summary, chart legends/tooltips, empty states, navigation, and
  metadata title/description.
- Kept proper nouns and technical names such as MisBot, arXiv, Next.js, d3.js,
  three.js, GSAP, and font names in their original form.
- Added runtime translation helpers for legacy/generated graph labels and
  selection rules so existing generated JSON/graph files render Chinese without
  regenerating the 10,000 full graph files.
- Updated future MisBot preprocessing/API output strings to Chinese for graph
  selection rules, story-region labels, source notes, CLI warnings, and help text.
- Verified with `npm run typecheck` and a local browser pass on
  `http://localhost:3004`.

### Full event graph preprocessing and Templates fallback (2026-06-01)

- Analyst Console Templates now falls back from `coordination.templateSignals`
  to top-level `phrases` rows when a dashboard JSON lacks template signals.
- Added an explicit empty-state message so the Templates panel no longer
  renders as a blank box when no repeated templates are emitted.
- `scripts/build_misbot_dashboard.py` now writes complete event graph files for
  the latest 10,000 events under `public/data/misbot_full_graphs/` and records
  each path as `eventGraphIndex[].fullGraph`.
- Analyst Console propagation graph now loads precomputed full graph files for
  the latest 10,000 events; the raw API remains only as a fallback when an
  older or missing generated graph file is selected.
- Full graph validation: `public/data/misbot_dashboard.json` has 23,622 events,
  23,622 graph index rows, 10,000 `fullGraph` paths, and zero missing graph
  files in the current generated artifact; event graph index rows no longer
  carry legacy `shard` paths.
- Large Analyst Console graphs now switch from the d3-force node-link view to
  an aggregated propagation-lane summary above 360 nodes or 720 edges. This
  keeps the complete graph statistics visible while avoiding expensive
  force-layout simulation on thousands of SVG nodes.

### EvidenceCard + NetworkGraph bidirectional actor highlighting (2026-05-30)

- **Zustand store**: added `selectedActorId` (string | null) and `setSelectedActor`. Reset on filter clear and burst/hub/template selection changes.
- **NetworkGraph**: actor node click calls `setSelectedActor`; highlight `useEffect` now processes both `selectedId` (microblog) and `selectedActorId` (actor), computing their 1-hop neighbor union. Nodes/edges outside this union are dimmed; the selected node(s) and their direct edges are highlighted in hot orange.
- **EvidenceCard**: participant actors are mined from the active graph edges connected to the selected event. Rendered as toggle buttons below stats, with active state (accent border/bg) when `selectedActorId` matches. A dot marker (●) indicates actors with `fakeShare > 0.5`. Reverse highlight: if the actor is already selected in the store, the button gets accent styling even on first render.
- **TimelineMiniMap**: new lightweight SVG component at `components/charts/timeline-mini-map.tsx` — renders monthly fake/real stacked bars, a semi-transparent dateRange brush rectangle, and a vertical accent line at the selected event's month. Placed at the bottom of the EvidenceCard article with `mt-auto`.
- Design: single select (clicking a new actor replaces previous), actor selection only highlights in network (does NOT change selected event).

- Repository initialized and pushed to public GitHub.
- Topic finalized.
- Candidate datasets explored and ranked.
- Primary dataset changed from CHECKED to MisBot for stronger bot/misinformation alignment.
- Added `scripts/build_misbot_dashboard.py` to produce the frontend JSON contract from local MisBot raw data.
- CHECKED downloaded and validated: 2,104 microblogs, 1,185,701 comments, 1,868,174 reposts, 732,444 actors.
- Front-end migrated to d3 v7 + three.js loaded via importmap (the old static build, now archived).
- Glyph evolution (P0–Phase 6 of the static build) preserved in `legacy/src/app.js`.
- **Phase 7 of the v0 port complete**: Next.js + v0 INTERFACE shell, 8 dashboard panels ported into the Work bento grid, Zustand store, tooltip portal, IntersectionObserver-gated charts, brush-preserving timeline.
- **Phase 8 copy**: hero word swapped to MISBOT, Signals reframed as dataset facts, Principles rewritten as audit posture, Colophon credits MisBot/Next.js/d3/three/typography.
- **Hydration bug fix**: chart containers now mount before dashboard data hydrates, so d3/three initialization is not skipped on first load.
- **Visual impact pass**: keyword and actor bar views replaced with bubble/cloud encodings; legacy three.js motion used scroll progress to shift camera, separation, and tempo.
- **Full-coverage MisBot pass**: `scripts/build_misbot_dashboard.py` now emits all
  23,622 information instances, 800 keyword rows, 800 phrase rows, 2,000 actor
  rows, coordination burst/hub/template indexes, and latest-event complete
  propagation graphs.
- **Analyst console added**: full-data burst windows, propagation graphs,
  proxy-ranked hub candidates, repeated templates, and evidence now sit after
  the scrollytelling section.
- **MIT-style story network added**: scroll steps now drive a sticky canvas
  background network through named viewport/highlight/evidence presets, while
  the analyst console keeps the interactive d3-force event graph.
