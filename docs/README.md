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

Primary candidate: CHECKED, a Chinese COVID-19 fake news dataset.

- Source: https://github.com/cyang03/CHECKED
- Paper: https://arxiv.org/abs/2010.09029
- Fit: fact-checked Weibo posts with text, temporal information, reposts, comments, likes, labels, and hashed ids.
- Scale reported by the paper: 2,104 verified microblogs, 1,868,175 reposts, 1,185,702 comments, and 56,852,736 likes.
- Terms noted in the paper: academic research only; microblog and user ids are hashed.
- Local raw data path: `data/raw/checked` (ignored by git).
- Prototype data path: `public/data/checked_dashboard.json`.

Backup candidates:

- PHEME rumours/veracity datasets: good for English rumor propagation and conversation structures.
- FiveThirtyEight/Clemson Russian Troll Tweets: good for coordinated account behavior, weaker for truth labels.
- CoAID: useful COVID misinformation backup, but propagation structure may be weaker.
- Avoid FakeNewsNet as the main source unless Twitter API rehydration is proven locally.

## View Plan

- Text overview: topics, keywords, labels, trends, repeated phrases.
- Dynamic propagation network: actors/messages/topics as nodes; repost/comment/similarity relations as edges.
- Coordination matrix: actor-topic-time or actor-actor similarity and synchronization.
- Event timeline: volume bursts, topic phases, selected case-study intervals.
- Evidence panel: anonymized message snippets and local neighborhoods for explanation.

## First Prototype

Run locally:

```bash
python3 scripts/build_checked_sample.py
python3 -m http.server 4173
```

Then open `http://localhost:4173/`.

Current prototype uses CHECKED JSON to generate:

- dataset-level statistics;
- monthly fake/real timeline;
- keyword frequency split by label;
- microblog-to-actor propagation network;
- high-activity actor list;
- repeated text signals;
- evidence samples with hashed ids.

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
