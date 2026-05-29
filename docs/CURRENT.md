# CURRENT

## Current Phase

Front-end now uses a MIT-style background-network scrollytelling +
analyst-console dashboard.
The MisBot builder emits all 23,622 information instances, full aggregate
rankings, coordination indexes, and bounded graph shards for interactive
network inspection.

## Confirmed Decisions

- Front-end stack: Next.js 15 stable + React 19, Tailwind v4, shadcn/ui
  primitives, IBM Plex Sans/Mono + Bebas Neue (via `next/font/google`).
- Animation chain preserved verbatim from v0 INTERFACE: GSAP ScrollTrigger
  (hero parallax scrub, signals/work/principles/colophon slide-ins, magnetic
  cursor in Signals), Lenis smooth scroll bridged into GSAP's ticker,
  SplitFlapText hero, ScrambleTextOnHover CTAs, HighlightText scroll
  parallax in Principles, BitmapChevron rotate, AnimatedNoise canvas grain.
- Data viz stack stays d3 v7 + three.js. The scrollytelling section now uses
  a full-bleed sticky canvas story network with deterministic zoom/pan
  presets; the analyst console lazy-loads bounded graph shards from
  `public/data/misbot_graph_shards/`.
- State: Zustand store + selector hooks. Tooltip is a portal singleton
  with its own Zustand store so 60Hz mousemove never re-renders the page.
- Story state: `activeStoryPresetId`, story viewport, and highlighted nodes
  sit in Zustand. Step cards activate named presets such as `fake-burst`,
  `propagation-core`, `template-cluster`, `bot-heavy`, and `evidence-focus`.
- Selection (`selectedId`) patches network + orbit imperatively via refs;
  only the evidence card re-renders through React.
- Three.js orbit is mounted ONCE; star meshes diff on filter changes
  (`stars: Map<eventId, Mesh>`). IntersectionObserver gates rAF when
  off-screen. Camera state lives on the controls object across filters.
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
- Generated graph shards live under `public/data/misbot_graph_shards/`.
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
information instance and writes deterministic bounded network shards for
top-ranked case events. Use `--limit-events` only for local debug runs.

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

- Validate the full-coverage dashboard with real MisBot events, actor bot
  scores, burst windows, and graph shards.
- Confirm team members and division of work.
- Keep AI usage, design rationale, and case studies documented in the final report or README sections when needed.

## Blockers

- Need to avoid committing private, restricted, or non-anonymized raw data.
- Need to decide how much derived text evidence can be committed in the public repo under MisBot privacy guidance.
- Full generated dashboard JSON is about 41 MB, so the TA run path is still
  local-first rather than a tiny static demo artifact.

## Immediate Focus

1. Review the background-network story at `http://localhost:3000/#work`.
2. Review the full-coverage analyst console at `http://localhost:3000/#analyst-console`.
3. Tune the final case-study narrative around the strongest burst/hub/template combination.
4. Confirm team responsibilities and presentation ownership.

## Completion Notes

- Repository initialized and pushed to public GitHub.
- Topic finalized.
- Candidate datasets explored and ranked.
- Primary dataset changed from CHECKED to MisBot for stronger bot/misinformation alignment.
- Added `scripts/build_misbot_dashboard.py` to produce the frontend JSON contract from local MisBot raw data.
- CHECKED downloaded and validated: 2,104 microblogs, 1,185,701 comments, 1,868,174 reposts, 732,444 actors.
- Front-end migrated to d3 v7 + three.js loaded via importmap (the old static build, now archived).
- Glyph evolution (P0–Phase 6 of the static build) preserved in `legacy/src/app.js`.
- **Phase 7 of the v0 port complete**: Next.js + v0 INTERFACE shell, 8 dashboard panels ported into the Work bento grid, Zustand store, tooltip portal, IntersectionObserver-gated orbit, brush-preserving timeline.
- **Phase 8 copy**: hero word swapped to MISBOT, Signals reframed as dataset facts, Principles rewritten as audit posture, Colophon credits MisBot/Next.js/d3/three/typography.
- **Hydration bug fix**: Network, timeline, and orbit chart containers now mount before dashboard data hydrates, so d3/three initialization is not skipped on first load.
- **Visual impact pass**: keyword and actor bar views replaced with bubble/cloud encodings; orbit now uses scroll progress to shift camera, star separation, and motion tempo.
- **Full-coverage MisBot pass**: `scripts/build_misbot_dashboard.py` now emits all
  23,622 information instances, 800 keyword rows, 800 phrase rows, 2,000 actor
  rows, coordination burst/hub/template indexes, and 36 bounded graph shards.
- **Analyst console added**: full-data burst windows, lazy-loaded propagation
  shards, proxy-ranked hub candidates, repeated templates, and evidence now sit
  after the scrollytelling section.
- **MIT-style story network added**: scroll steps now drive a sticky canvas
  background network through named viewport/highlight/evidence presets, while
  the analyst console keeps the interactive d3-force shard graph.
