# CURRENT

## Current Phase

Front-end fully rewritten on top of the v0 INTERFACE template.
The static d3 + three dashboard has been ported into a Next.js 15 / React 19
project; all visual analytics panels live inside the v0 Work bento grid.

## Confirmed Decisions

- Front-end stack: Next.js 15 stable + React 19, Tailwind v4, shadcn/ui
  primitives, IBM Plex Sans/Mono + Bebas Neue (via `next/font/google`).
- Animation chain preserved verbatim from v0 INTERFACE: GSAP ScrollTrigger
  (hero parallax scrub, signals/work/principles/colophon slide-ins, magnetic
  cursor in Signals), Lenis smooth scroll bridged into GSAP's ticker,
  SplitFlapText hero, ScrambleTextOnHover CTAs, HighlightText scroll
  parallax in Principles, BitmapChevron rotate, AnimatedNoise canvas grain.
- Data viz stack stays d3 v7 + three.js; the 8 dashboard panels are
  React-wrapped (refs + useEffect) instead of imperative `renderAll()`.
- State: Zustand store + selector hooks. Tooltip is a portal singleton
  with its own Zustand store so 60Hz mousemove never re-renders the page.
- Selection (`selectedId`) patches network + orbit imperatively via refs;
  only the evidence card re-renders through React.
- Three.js orbit is mounted ONCE; star meshes diff on filter changes
  (`stars: Map<eventId, Mesh>`). IntersectionObserver gates rAF when
  off-screen. Camera state lives on the controls object across filters.
- Page composition (`app/page.tsx`):
  Hero → Signals (dataset facts) → FilterBar (sticky) → Work (8 chart
  cards in bento) → Principles (audit posture) → Colophon.
- Static dashboard archived under `legacy/` (preserved for reference).
- Documentation still lives only in `docs/README.md` and `docs/CURRENT.md`.
- GitHub remote repository is public: `https://github.com/The0xKa1/DataVisProject`.
- Final topic: 基于社交媒体/群聊文本的"网络水军"与虚假信息协同扩散审计系统.
- System framing: exploratory audit and evidence inspection, not automatic accusation.
- Primary data candidate: MisBot; CHECKED stays as offline demo fallback.
- Raw MisBot data ignored by git at `data/raw/misbot`.
- Processed dashboard JSON at `public/data/misbot_dashboard.json`.
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

- Download and unpack MisBot into `data/raw/misbot`.
- Run `python3 scripts/build_misbot_dashboard.py --raw data/raw/misbot --out public/data/misbot_dashboard.json`.
- Validate the MisBot dashboard with real events, actor bot scores, and graph edges.
- Confirm team members and division of work.
- Keep AI usage, design rationale, and case studies documented in the final report or README sections when needed.

## Blockers

- Need to avoid committing private, restricted, or non-anonymized raw data.
- Current `public/data/misbot_dashboard.json` is a schema placeholder until real MisBot raw data is available — CHECKED demo is shown in the meantime.
- Need to decide how much derived text evidence can be committed in the public repo under MisBot privacy guidance.

## Immediate Focus

1. Download MisBot and rebuild `public/data/misbot_dashboard.json`.
2. Review the dashboard at `http://localhost:3000/` with real MisBot data.
3. Add topology-specific views: ego network controls, coordinated burst ranking, repeated actor overlap.
4. Assign team responsibilities and presentation ownership.

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
