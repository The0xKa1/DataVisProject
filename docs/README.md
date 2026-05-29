# DataVisProject

Course final project for building a reproducible visual analytics system.

## Topic

`【文本情报+网络演化】基于社交媒体/群聊文本的“网络水军”与虚假信息协同扩散审计系统`

The project should be framed as an exploratory audit system. It can surface suspected coordination signals, but should not present accounts as proven malicious actors.

## Goal

Build a multi-view visual analytics prototype that helps users:

1. Find major narratives, claims, keywords, URLs, or topics in social text.
2. Trace how claims diffuse through actors, messages, reposts, comments, or groups over time.
3. Inspect coordination signals such as synchronized activity, repeated text, shared links, dense amplification, and bursts.
4. Drill from aggregate patterns to anonymized evidence for 1-2 case studies.

## Data Direction

Primary dataset: MisBot, a Weibo misinformation and social bot participation dataset.

- Source: https://github.com/whr000001/MisBot
- Paper: https://arxiv.org/abs/2408.09613
- Fit: misinformation / verified / trend information instances, repost/comment/attitude participants, user-level bot labels, and bot-score proxy signals.
- Scale noted by the repository: 23,622 Weibo information instances, 942,430 spread participants, 99,874 human-annotated users, and 407,801 weakly annotated active inference users.
- Label caution: weakly supervised bot labels are proxy signals only; the system must not present individual accounts as proven malicious.
- Local raw data path: `data/raw/misbot` (ignored by git).
- Prototype data path: `public/data/misbot_dashboard.json`.

Backup candidates:

- CHECKED: previous Chinese COVID-19 fake news baseline with Weibo propagation information.
- VoterFraud2020: useful later as an English Twitter event comparison with suspension and coordination proxies, but not used in the current main build.
- PHEME / CoAID: fallback options if MisBot data access becomes blocked.

## View Plan

- Text overview: topics, keywords, labels, trends, repeated phrases.
- Dynamic propagation network: actors/messages/topics as nodes; repost/comment/similarity relations as edges.
- Coordination matrix: actor-topic-time or actor-actor similarity and synchronization.
- Event timeline: volume bursts, topic phases, selected case-study intervals.
- Evidence panel: anonymized message snippets and local neighborhoods for explanation.

## First Prototype

Run locally (the front-end is a Next.js app — Node 20+ recommended):

```bash
npm install
npm run dev
```

Then open `http://localhost:3000/`.

If you have raw MisBot data, regenerate the dashboard JSON first:

```bash
python3 scripts/build_misbot_dashboard.py \
  --raw data/raw/misbot \
  --out public/data/misbot_dashboard.json
```

When `public/data/misbot_dashboard.json` is still the empty placeholder schema
(the default for first-clone), the app automatically falls back to the
populated `public/data/checked_dashboard.json` so the dashboard is never blank.

Current dashboard uses a hybrid narrative + analyst-console structure:

- SCROLL STORY · a MIT-style sticky background network whose viewport jumps
  between stable story regions as the user scrolls;
- ANALYST CONSOLE · full-data burst ranking, bounded propagation shards, hub candidates, repeated templates, and evidence.

The full MisBot build emits all 23,622 information instances into
`public/data/misbot_dashboard.json`. Network rendering stays interactive by
loading bounded graph projections from `public/data/misbot_graph_shards/`,
with visible and omitted topology counts disclosed in the UI.

The coordinated views include:

- METRICS · dataset-level counters with selected case-window context;
- STORY NETWORK · precomputed/bounded canvas projection for scroll-driven
  zoom/pan, highlights, and evidence focus;
- TIMELINE · monthly fake/real stacked bars + engagement line + d3 brush;
- NETWORK · d3-force propagation shard graph with drag, zoom, and selection;
- ORBIT · three.js engagement starfield with scroll-driven camera phases and raycast selection;
- KEYWORDS · keyword bubble cloud with term-size and fake-share encoding;
- ACTORS · high-activity actor bubble field with engagement size and fake-share rings;
- PHRASES · repeated text templates with bot-share signal;
- EVIDENCE · anonymized microblog evidence with sibling list.

The legacy static d3 + three.js build is archived under `legacy/`.

## Course Constraints

- Dataset must not be a toy dataset such as iris, titanic, or tips.
- Dataset must not duplicate a ChinaVis or VAST reference challenge dataset.
- Data source, license/terms, scale, processing, and privacy handling must be explainable.
- Final system should be runnable by a TA in about 15 minutes.
- Final report/presentation should include division of work, AI usage, design rationale, and 1-2 case studies.

## Documentation Policy

Keep docs minimal:

- `README.md`: stable project brief, dataset direction, view plan, and course constraints.
- `CURRENT.md`: current state, decisions, active tasks, blockers, and next steps.

Do not recreate `handoff/` or split notes unless the team explicitly asks for a heavier documentation structure.
