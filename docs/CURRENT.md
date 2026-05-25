# CURRENT

## Current Phase

Front-end refactored to d3.js (2D charts) + three.js (3D orbit), guided by `docs/design.md`.
节点 glyph 已从单色圆进化为多通道复合标记（donut + 时刻 notch + actor 双饱和度徽章 + 3D 平面光盘 + 彗尾轨迹）。

## Confirmed Decisions

- Documentation now stays in `docs/README.md` and `docs/CURRENT.md` only.
- GitHub remote repository is public: `https://github.com/The0xKa1/DataVisProject`.
- Final topic: `【文本情报+网络演化】基于社交媒体/群聊文本的“网络水军”与虚假信息协同扩散审计系统`.
- System framing: exploratory audit and evidence inspection, not automatic accusation.
- Primary data candidate: CHECKED, a Chinese COVID-19 fake news dataset with Weibo propagation information.
- Frontend first version is a static HTML/CSS/JS dashboard.
- Raw CHECKED data is stored at `data/raw/checked` and ignored by git.
- Processed prototype data is generated at `public/data/checked_dashboard.json`.
- Full `obsidian-docs/` team-collab structure is not enabled.
- `docs/handoff/` and the old split docs have been removed.

## Topic / Dataset / Stack Status

- Topic: confirmed.
- Dataset: CHECKED downloaded and locally validated.
- Frontend stack: static HTML/CSS/JS for first version.
- Data processing stack: Python script over CHECKED JSON.
- Deployment target: undecided.

## Data Candidates

| Priority | Dataset | Use |
| --- | --- | --- |
| 1 | CHECKED | Main candidate for Chinese misinformation diffusion and propagation analysis. |
| 2 | PHEME | Backup for English rumor propagation and conversation structures. |
| 3 | FiveThirtyEight/Clemson Russian Troll Tweets | Backup or comparison for coordinated account behavior. |
| 4 | CoAID | Backup for COVID misinformation labels and engagement. |

## Active Tasks

- Improve topology-focused interactions: community filtering, richer ego-network controls, and coordinated burst ranking.
- Decide whether to keep static frontend or migrate to React/Vite after the first review.
- Confirm team members and division of work.
- Keep AI usage, design rationale, and case studies documented in the final report or README sections when needed.

## Blockers

- Need to avoid committing private, restricted, or non-anonymized raw data.
- Need to decide how much derived text evidence can be committed in the public repo under academic-use terms.

## Immediate Focus

1. Review the first prototype at `http://localhost:4173/`.
2. Add topology-specific views: ego network controls, coordinated burst ranking, and repeated actor overlap.
3. Decide whether to use CHECKED alone or add FiveThirtyEight/Clemson tweets as a coordinated-behavior comparison.
4. Assign team responsibilities and presentation ownership.

## Completion Notes

- Repository initialized and pushed to public GitHub.
- Topic finalized.
- Candidate datasets explored and ranked.
- Documentation reduced to two short files per current project preference.
- CHECKED downloaded and validated: 2,104 microblogs, 1,185,701 comments, 1,868,174 reposts, 732,444 actors.
- First static dashboard created with timeline, keyword, network, actor, repeated-text, and evidence views.
- Frontend design pass repaired stale chart bindings, added loading/empty/error states, keyword/phrase search linking, month filtering, and a canvas-based propagation orbit.
- Front-end migrated to d3 v7 + three.js (loaded via importmap, no build step):
  - Timeline: d3 stacked bars + engagement line with `d3.brushX` for true date-range filtering (Shneiderman: overview → zoom & filter).
  - Network: `d3.forceSimulation` with drag, `d3.zoom` for pan/zoom; clearer cluster/closure (Gestalt continuity).
  - Keywords / actors: d3 scales + axes; encoding consistency — hue = label category, length = quantity.
  - 3D orbit replaced with `THREE.WebGLRenderer` + `OrbitControls`, raycaster click → linked evidence/network selection.
  - Phrase bars: dropped rainbow gradient (chartjunk) for single-hue saturation ramp.
- Glyph evolution (P0–Phase 6):
  - Microblog 节点：内盘（label 色）+ 外双弧 donut（转发/评论比）+ 时刻 notch（brush 窗口内位置）。
  - Actor 节点：同色相双半圆，左半饱和度 ∝ fake 占比，右半 ∝ 活跃度。
  - 3D 星球：billboard ring 改为轨道平面光盘（厚度 ∝ log(likes)）+ 彗尾轨迹（长度 ∝ |评论 − 转发|）。
  - `disposeOrbit` 用 `scene.traverse` 单次遍历 dispose，修复跨 brush 的 GPU 资源泄漏。
  - CSS 选择器从 `.node circle*` 迁移到 `.node .core*`，留出后续扩展空间。
- Bug-fix 批次：timeline brush 与 bar 边界对齐、actor 条改为真·堆叠 real|fake、Orbit 接入 `getEvents()` 并保留相机位姿、删除 month-group 死三元。
