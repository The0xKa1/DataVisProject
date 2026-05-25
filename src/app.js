import * as d3 from "d3";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const COLORS = {
  fake: "#b8392e",
  real: "#1f7e57",
  accent: "#2944c0",
  actor: "#2944c0",
  ink: "#15170f",
  muted: "#98968b",
  line: "#ddd7c5",
  surface: "#fdfbf5",
};

const state = {
  data: null,
  label: "all",
  search: "",
  selectedId: null,
  dateRange: null,
  network: { simulation: null, zoom: null, svg: null },
  orbit: { renderer: null, scene: null, camera: null, controls: null, raf: 0, stars: [], autoRotate: true, resizeObserver: null, cameraState: null },
};

const fmt = new Intl.NumberFormat("zh-CN");
const compactFmt = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });
const $ = (selector) => document.querySelector(selector);
const parseDate = d3.timeParse("%Y-%m-%d %H:%M");
const parseMonth = d3.timeParse("%Y-%m");

// Cached arc generator reused for donut rings, notches, and actor split badges.
const arcGen = d3.arc();
const microblogRadius = (d) => Math.max(9, Math.min(28, Math.sqrt(d.weight || 1) * 0.38));
const actorRadius = (d) => Math.max(3.6, Math.min(11, Math.sqrt(d.weight || 1) * 0.18));
const RING_THICKNESS = 3.5;

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const labelName = (l) => (l === "fake" ? "虚假" : l === "real" ? "真实" : "全部");
const labelClass = (l) => (l === "fake" ? "label-fake" : l === "real" ? "label-real" : "");
const labelColor = (l) => (l === "fake" ? COLORS.fake : l === "real" ? COLORS.real : COLORS.accent);

function eventDate(event) {
  return event._date || (event._date = parseDate(event.date) || new Date(event.date));
}

function inDateRange(d) {
  if (!state.dateRange) return true;
  const [a, b] = state.dateRange;
  return d >= a && d <= b;
}

function matchesEvent(event) {
  if (state.label !== "all" && event.label !== state.label) return false;
  if (state.dateRange && !inDateRange(eventDate(event))) return false;
  const q = state.search.trim().toLowerCase();
  if (!q) return true;
  const haystack = [event.text, event.analysis, event.shortId, event.user, ...(event.keywords || []), ...(event.tags || [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

const getEvents = () => (state.data?.events || []).filter(matchesEvent);

function getSelectedEvent() {
  const events = getEvents();
  return events.find((e) => e.id === state.selectedId) || events[0] || null;
}

function setSelected(id) {
  state.selectedId = id;
  renderEvidence();
  highlightNetworkSelection();
  highlightOrbitSelection();
}

function setSearch(value) {
  state.search = value;
  const input = $("#searchInput");
  if (input) input.value = value;
  state.selectedId = null;
  renderAll();
}

function showTooltip(event, html) {
  const tip = $("#tooltip");
  tip.innerHTML = html;
  tip.hidden = false;
  tip.style.left = `${Math.min(event.clientX + 16, window.innerWidth - 340)}px`;
  tip.style.top = `${event.clientY + 16}px`;
}
const hideTooltip = () => ($("#tooltip").hidden = true);

/* ---------- LOADING / ERROR ---------- */

function renderLoading() {
  $("#dateRange").textContent = "loading";
  $("#metrics").innerHTML = Array.from({ length: 5 })
    .map(
      () => `<div class="metric skeleton-block">
        <span class="m-label skeleton-line short"></span>
        <strong class="m-value skeleton-line"></strong>
        <span class="m-sub skeleton-line mid"></span>
      </div>`,
    )
    .join("");
  ["#timelineChart", "#networkGraph", "#keywordChart", "#actorChart"].forEach((sel) => {
    const t = $(sel);
    if (t) t.innerHTML = `<text x="50%" y="50%" text-anchor="middle" class="chart-empty">加载 CHECKED 摘要中</text>`;
  });
  $("#orbitScene").innerHTML = `<div class="orbit-loading"><span></span><p>building propagation orbit</p></div>`;
  $("#phraseList").innerHTML = `<div class="list-empty">正在整理重复文本信号</div>`;
  $("#evidencePanel").innerHTML = `<div class="evidence-card"><p class="evidence-body">正在载入证据样本。</p></div>`;
}

function renderError(error) {
  document.body.innerHTML = `<main class="error-state">
    <p class="project-label">DataVisProject</p>
    <h1>数据加载失败</h1>
    <p>${escapeHTML(error.message)}</p>
  </main>`;
}

/* ---------- METRICS ---------- */

function renderMetrics() {
  const { stats } = state.data;
  const fakeRatio = stats.microblogs ? (stats.fake / stats.microblogs) * 100 : 0;
  const events = getEvents();
  const window = state.dateRange
    ? `${d3.timeFormat("%Y-%m-%d")(state.dateRange[0])} → ${d3.timeFormat("%Y-%m-%d")(state.dateRange[1])}`
    : "all months";
  const metrics = [
    ["Microblogs", stats.microblogs, `${fakeRatio.toFixed(1)}% fake-labeled`],
    ["Actors", stats.actors, "hashed ids only"],
    ["Comments", stats.comments, "propagation evidence"],
    ["Reposts", stats.reposts, "diffusion edges"],
    ["Case Window", window, `${labelName(state.label)} · ${events.length} samples`],
  ];
  $("#metrics").innerHTML = metrics
    .map(
      ([label, value, sub]) => `<div class="metric">
        <span class="m-label">${escapeHTML(label)}</span>
        <strong class="m-value">${typeof value === "number" ? compactFmt.format(value) : escapeHTML(value)}</strong>
        <span class="m-sub">${escapeHTML(sub)}</span>
      </div>`,
    )
    .join("");
  $("#dateRange").textContent = `${stats.dateStart.slice(0, 10)} - ${stats.dateEnd.slice(0, 10)}`;
}

/* ---------- TIMELINE (d3 stacked bar + line + brushX) ---------- */

function renderTimeline() {
  const rows = state.data.timeline.map((d) => ({ ...d, dateObj: parseMonth(d.month) }));
  const svgEl = $("#timelineChart");
  const width = 920;
  const height = 320;
  const margin = { top: 28, right: 56, bottom: 50, left: 58 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const svg = d3.select(svgEl).attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "none");
  svg.selectAll("*").remove();
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const months = rows.map((d) => d.dateObj);
  const xDomain = [d3.min(months), d3.timeMonth.offset(d3.max(months), 1)];
  const x = d3.scaleTime().domain(xDomain).range([0, innerW]);
  const monthSpan = innerW / rows.length;
  const barW = monthSpan * 0.68;
  const barOffset = (monthSpan - barW) / 2;
  const barX = (d) => x(d.dateObj) + barOffset;
  const barCenter = (d) => x(d.dateObj) + monthSpan / 2;
  const y = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.fake + d.real) || 1]).nice().range([innerH, 0]);
  const yRight = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.comments + d.reposts) || 1]).nice().range([innerH, 0]);

  // Gridlines (low-ink: dashed, light)
  g.append("g")
    .attr("class", "tl-grid")
    .call(d3.axisLeft(y).ticks(4).tickSize(-innerW).tickFormat(""))
    .call((sel) => sel.selectAll("line").attr("stroke", COLORS.line).attr("stroke-dasharray", "2 4"))
    .call((sel) => sel.select(".domain").remove());

  // Stacked bars: real bottom, fake top
  const monthGroups = g.selectAll("g.month-group")
    .data(rows)
    .join("g")
    .attr("class", "month-group")
    .attr("transform", (d) => `translate(${barX(d)},0)`);

  monthGroups.append("rect")
    .attr("class", "area-real")
    .attr("x", 0)
    .attr("y", (d) => y(d.real))
    .attr("width", barW)
    .attr("height", (d) => innerH - y(d.real))
    .attr("rx", 3);

  monthGroups.append("rect")
    .attr("class", "area-fake")
    .attr("x", 0)
    .attr("y", (d) => y(d.real + d.fake))
    .attr("width", barW)
    .attr("height", (d) => y(d.real) - y(d.real + d.fake))
    .attr("rx", 3);

  // Engagement line + dots (right axis)
  const line = d3.line()
    .x((d) => barCenter(d))
    .y((d) => yRight(d.comments + d.reposts))
    .curve(d3.curveMonotoneX);

  g.append("path")
    .datum(rows)
    .attr("class", "interaction-line")
    .attr("d", line);

  g.selectAll("circle.interaction-dot")
    .data(rows)
    .join("circle")
    .attr("class", "interaction-dot")
    .attr("cx", (d) => barCenter(d))
    .attr("cy", (d) => yRight(d.comments + d.reposts))
    .attr("r", 4.2);

  // Axes
  g.append("g")
    .attr("class", "tl-axis")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(d3.timeMonth.every(1)).tickFormat(d3.timeFormat("%Y-%m")))
    .call((sel) => sel.select(".domain").attr("stroke", COLORS.line))
    .call((sel) => sel.selectAll("text").attr("fill", COLORS.muted).style("font-family", "var(--font-mono)").style("font-size", "11px"));

  g.append("g")
    .attr("class", "tl-axis")
    .call(d3.axisLeft(y).ticks(4))
    .call((sel) => sel.select(".domain").remove())
    .call((sel) => sel.selectAll("line").attr("stroke", COLORS.line))
    .call((sel) => sel.selectAll("text").attr("fill", COLORS.muted).style("font-family", "var(--font-mono)").style("font-size", "11px"));

  g.append("g")
    .attr("class", "tl-axis")
    .attr("transform", `translate(${innerW},0)`)
    .call(d3.axisRight(yRight).ticks(4).tickFormat((d) => compactFmt.format(d)))
    .call((sel) => sel.select(".domain").remove())
    .call((sel) => sel.selectAll("line").attr("stroke", COLORS.line))
    .call((sel) => sel.selectAll("text").attr("fill", COLORS.accent).style("font-family", "var(--font-mono)").style("font-size", "11px"));

  g.append("text").attr("class", "axis-title").attr("x", 0).attr("y", -12).text("MONTHLY POSTS");
  g.append("text").attr("class", "axis-title").attr("x", innerW).attr("y", -12).attr("text-anchor", "end").text("ENGAGEMENT");

  // Hover tooltip on month groups
  monthGroups
    .on("mousemove", (event, d) => {
      showTooltip(
        event,
        `<b>${escapeHTML(d.month)}</b>
         <div class="tt-row"><span>fake</span><b>${fmt.format(d.fake)}</b></div>
         <div class="tt-row"><span>real</span><b>${fmt.format(d.real)}</b></div>
         <div class="tt-row"><span>engagement</span><b>${fmt.format(d.comments + d.reposts)}</b></div>`,
      );
    })
    .on("mouseleave", hideTooltip);

  // BrushX — true overview→zoom/filter (Shneiderman). Drag to select date window.
  const brush = d3.brushX()
    .extent([[0, 0], [innerW, innerH]])
    .on("end", brushed);

  const brushG = g.append("g").attr("class", "tl-brush").call(brush);
  brushG.selectAll(".selection").attr("fill", COLORS.ink).attr("fill-opacity", 0.06).attr("stroke", COLORS.ink).attr("stroke-opacity", 0.4);

  // Restore current selection visually
  if (state.dateRange) {
    brushG.call(brush.move, [x(state.dateRange[0]), x(state.dateRange[1])]);
  }

  function brushed({ selection, sourceEvent }) {
    if (!sourceEvent) return;
    if (!selection) {
      state.dateRange = null;
    } else {
      const [x0, x1] = selection;
      state.dateRange = [x.invert(x0), x.invert(x1)];
    }
    state.selectedId = null;
    renderAll();
  }
}

/* ---------- KEYWORDS (d3 lollipop, hue = label) ---------- */

function renderKeywords() {
  const rows = state.data.keywords.slice(0, 16);
  const svgEl = $("#keywordChart");
  const width = 720;
  const height = 470;
  const margin = { top: 24, right: 64, bottom: 28, left: 110 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const svg = d3.select(svgEl).attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "none");
  svg.selectAll("*").remove();
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, d3.max(rows, (d) => Math.max(d.fake, d.real)) || 1]).nice().range([0, innerW]);
  const y = d3.scaleBand().domain(rows.map((d) => d.keyword)).range([0, innerH]).padding(0.18);

  // Position-based labels
  g.append("g")
    .selectAll("text.kw-label")
    .data(rows)
    .join("text")
    .attr("class", "kw-label")
    .attr("x", -12)
    .attr("y", (d) => y(d.keyword) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "end")
    .text((d) => d.keyword)
    .style("cursor", "pointer")
    .on("click", (_, d) => setSearch(d.keyword));

  const rowG = g.selectAll("g.kw-row")
    .data(rows)
    .join("g")
    .attr("class", "kw-row")
    .attr("transform", (d) => `translate(0,${y(d.keyword)})`)
    .style("cursor", "pointer")
    .on("click", (_, d) => setSearch(d.keyword))
    .on("mousemove", (event, d) => {
      showTooltip(
        event,
        `<b>${escapeHTML(d.keyword)}</b>
         <div class="tt-row"><span>real</span><b>${fmt.format(d.real)}</b></div>
         <div class="tt-row"><span>fake</span><b>${fmt.format(d.fake)}</b></div>`,
      );
    })
    .on("mouseleave", hideTooltip);

  rowG.append("line")
    .attr("class", "kw-track")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", y.bandwidth() / 2).attr("y2", y.bandwidth() / 2);

  rowG.append("line")
    .attr("class", "kw-real-line")
    .attr("x1", 0).attr("x2", (d) => x(d.real))
    .attr("y1", y.bandwidth() / 2 - 2).attr("y2", y.bandwidth() / 2 - 2);

  rowG.append("line")
    .attr("class", "kw-fake-line")
    .attr("x1", 0).attr("x2", (d) => x(d.fake))
    .attr("y1", y.bandwidth() / 2 + 4).attr("y2", y.bandwidth() / 2 + 4);

  rowG.append("circle")
    .attr("class", "kw-dot real")
    .attr("cx", (d) => x(d.real)).attr("cy", y.bandwidth() / 2 - 2).attr("r", 5);

  rowG.append("circle")
    .attr("class", "kw-dot fake")
    .attr("cx", (d) => x(d.fake)).attr("cy", y.bandwidth() / 2 + 4).attr("r", 4.2);

  rowG.append("text")
    .attr("class", "kw-value")
    .attr("x", innerW + 10)
    .attr("y", y.bandwidth() / 2 + 4)
    .text((d) => fmt.format(d.total));

  // X axis
  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(4).tickFormat((d) => compactFmt.format(d)))
    .call((sel) => sel.select(".domain").attr("stroke", COLORS.line))
    .call((sel) => sel.selectAll("line").attr("stroke", COLORS.line))
    .call((sel) => sel.selectAll("text").attr("fill", COLORS.muted).style("font-family", "var(--font-mono)").style("font-size", "11px"));
}

/* ---------- ACTORS (d3 horizontal bar; length = quantity, fake share = inset) ---------- */

function renderActors() {
  const rows = state.data.actors.slice(0, 18);
  const svgEl = $("#actorChart");
  const width = 720;
  const height = 470;
  const margin = { top: 18, right: 80, bottom: 30, left: 120 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const svg = d3.select(svgEl).attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "none");
  svg.selectAll("*").remove();
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const totals = rows.map((r) => r.comments + r.reposts);
  // sqrt scale to compress the long-tail (actor[0] is an outlier) without distorting visual ratios beyond ratio fidelity
  const x = d3.scaleSqrt().domain([0, d3.max(totals) || 1]).range([0, innerW]).nice();
  const y = d3.scaleBand().domain(rows.map((r) => r.user)).range([0, innerH]).padding(0.22);

  g.append("g")
    .selectAll("text.actor-label")
    .data(rows)
    .join("text")
    .attr("class", "actor-label")
    .attr("x", -12)
    .attr("y", (d) => y(d.user) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "end")
    .text((d) => d.user);

  const rowG = g.selectAll("g.actor-row")
    .data(rows)
    .join("g")
    .attr("transform", (d) => `translate(0,${y(d.user)})`)
    .on("mousemove", (event, d) => {
      const total = d.comments + d.reposts;
      const fakeShare = total ? ((d.fake / total) * 100).toFixed(1) : "0.0";
      showTooltip(
        event,
        `<b>${escapeHTML(d.user)}</b>
         <div class="tt-row"><span>comments</span><b>${fmt.format(d.comments)}</b></div>
         <div class="tt-row"><span>reposts</span><b>${fmt.format(d.reposts)}</b></div>
         <div class="tt-row"><span>fake share</span><b>${fakeShare}%</b></div>`,
      );
    })
    .on("mouseleave", hideTooltip);

  rowG.append("rect")
    .attr("class", "actor-row-bg")
    .attr("x", 0).attr("y", 0)
    .attr("width", innerW).attr("height", y.bandwidth())
    .attr("rx", 3);

  rowG.append("rect")
    .attr("class", "actor-row-real")
    .attr("x", 0).attr("y", 0)
    .attr("width", (d) => {
      const total = d.comments + d.reposts;
      const realShare = total ? 1 - d.fake / total : 1;
      return x(total) * realShare;
    })
    .attr("height", y.bandwidth())
    .attr("rx", 3);

  rowG.append("rect")
    .attr("class", "actor-row-fake")
    .attr("x", (d) => {
      const total = d.comments + d.reposts;
      const realShare = total ? 1 - d.fake / total : 1;
      return x(total) * realShare;
    })
    .attr("y", 0)
    .attr("width", (d) => {
      const total = d.comments + d.reposts;
      const fakeShare = total ? d.fake / total : 0;
      return x(total) * fakeShare;
    })
    .attr("height", y.bandwidth())
    .attr("rx", 3);

  rowG.append("text")
    .attr("class", "actor-value")
    .attr("x", (d) => x(d.comments + d.reposts) + 8)
    .attr("y", y.bandwidth() / 2 + 4)
    .text((d) => compactFmt.format(d.comments + d.reposts));

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(4).tickFormat((d) => compactFmt.format(d)))
    .call((sel) => sel.select(".domain").attr("stroke", COLORS.line))
    .call((sel) => sel.selectAll("line").attr("stroke", COLORS.line))
    .call((sel) => sel.selectAll("text").attr("fill", COLORS.muted).style("font-family", "var(--font-mono)").style("font-size", "11px"));
}

/* ---------- NETWORK (d3-force + d3-zoom) ---------- */

function buildNetworkData() {
  const visibleEventIds = new Set(getEvents().map((e) => `m:${e.id}`));
  const { nodes: rawNodes, edges: rawEdges } = state.data.graph;

  const links = rawEdges
    .filter((e) => visibleEventIds.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, type: e.type }));
  const linkedIds = new Set();
  links.forEach((l) => { linkedIds.add(l.source); linkedIds.add(l.target); });

  const eventById = new Map(state.data.events.map((e) => [e.id, e]));
  const actorByUser = new Map(state.data.actors.map((a) => [a.user, a]));
  const maxActorScore = d3.max(state.data.actors, (a) => a.score) || 1;

  const nodes = rawNodes
    .filter((n) => linkedIds.has(n.id))
    .map((n) => {
      const enriched = { ...n };
      if (n.kind === "microblog") {
        const ev = eventById.get(n.id.slice(2));
        if (ev) {
          enriched.repostCount = ev.repostCount || 0;
          enriched.commentCount = ev.commentCount || 0;
          enriched.likeCount = ev.likeCount || 0;
          enriched.eventDate = ev.date;
        }
      } else {
        const actor = actorByUser.get(n.id.slice(2));
        if (actor) {
          const total = (actor.fake || 0) + (actor.real || 0);
          enriched.fakeShare = total ? actor.fake / total : 0;
          enriched.activityNorm = actor.score / maxActorScore;
        } else {
          enriched.fakeShare = 0;
          enriched.activityNorm = 0;
        }
      }
      return enriched;
    });
  return { nodes, links };
}

function renderNetwork() {
  const svgEl = $("#networkGraph");
  const width = 960;
  const height = 560;
  const svg = d3.select(svgEl)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  svg.selectAll("*").remove();

  const root = svg.append("g").attr("class", "net-root");
  const linkG = root.append("g").attr("class", "links");
  const nodeG = root.append("g").attr("class", "nodes");

  const { nodes, links } = buildNetworkData();

  const linkSel = linkG.selectAll("line")
    .data(links)
    .join("line")
    .attr("class", (d) => `link ${d.type}`)
    .attr("stroke-width", 1)
    .attr("stroke-opacity", 0.45);

  const nodeSel = nodeG.selectAll("g.node")
    .data(nodes, (d) => d.id)
    .join("g")
    .attr("class", "node")
    .attr("data-id", (d) => (d.kind === "microblog" ? d.id.slice(2) : ""))
    .style("cursor", (d) => (d.kind === "microblog" ? "pointer" : "default"));

  // Core mark: microblog gets a solid circle (filled by label color in CSS);
  // actor gets a split-saturation badge (Phase 3) — two semicircle paths
  // sharing the actor hue, with saturation encoding fakeShare (left) and
  // activityNorm (right).
  nodeSel.filter((d) => d.kind === "microblog")
    .append("circle")
    .attr("class", (d) => `core ${d.label || "actor"}`)
    .attr("r", (d) => microblogRadius(d));

  const accentHsl = d3.hsl(COLORS.accent);
  const satForActor = (norm) => 0.2 + Math.max(0, Math.min(1, norm || 0)) * 0.5;
  const colorForActor = (norm) => {
    const c = accentHsl.copy();
    c.s = satForActor(norm);
    return c.formatHex();
  };

  const actorSel = nodeSel.filter((d) => d.kind !== "microblog");
  actorSel.each(function (d) {
    const r = actorRadius(d);
    const leftPath = arcGen({
      innerRadius: 0,
      outerRadius: r,
      startAngle: -Math.PI,
      endAngle: 0,
    });
    const rightPath = arcGen({
      innerRadius: 0,
      outerRadius: r,
      startAngle: 0,
      endAngle: Math.PI,
    });
    const g = d3.select(this).append("g").attr("class", "core actor actor-split");
    g.append("path")
      .attr("class", "actor-half left")
      .attr("d", leftPath)
      .attr("fill", colorForActor(d.fakeShare));
    g.append("path")
      .attr("class", "actor-half right")
      .attr("d", rightPath)
      .attr("fill", colorForActor(d.activityNorm));
  });

  // Phase 1: donut outer arcs on microblog nodes — encode repost vs. comment share.
  // Phase 2: publish-time notch — when a brush window is active, mark each event's
  // position within that window as a thin radial wedge.
  const microblogSel = nodeSel.filter((d) => d.kind === "microblog");
  const brush = state.dateRange;
  const NOTCH_DEG = 12;
  microblogSel.each(function (d) {
    const r = microblogRadius(d);
    const total = (d.repostCount || 0) + (d.commentCount || 0);
    const repostShare = total ? d.repostCount / total : 0.5;
    const splitAngle = -Math.PI / 2 + repostShare * Math.PI * 2;
    const ringInner = r;
    const ringOuter = r + RING_THICKNESS;
    const repostPath = arcGen({
      innerRadius: ringInner,
      outerRadius: ringOuter,
      startAngle: -Math.PI / 2,
      endAngle: splitAngle,
    });
    const commentPath = arcGen({
      innerRadius: ringInner,
      outerRadius: ringOuter,
      startAngle: splitAngle,
      endAngle: -Math.PI / 2 + Math.PI * 2,
    });
    const g = d3.select(this);
    g.append("path").attr("class", "ring-repost").attr("d", repostPath);
    g.append("path").attr("class", "ring-comment").attr("d", commentPath);

    if (brush && d.eventDate) {
      const eventTime = parseDate(d.eventDate);
      if (eventTime) {
        const [a, b] = brush;
        const span = b - a;
        if (span > 0) {
          const t = Math.max(0, Math.min(1, (eventTime - a) / span));
          const center = -Math.PI / 2 + t * Math.PI * 2;
          const half = (NOTCH_DEG / 2) * (Math.PI / 180);
          const notchPath = arcGen({
            innerRadius: ringOuter + 1,
            outerRadius: ringOuter + 2.5,
            startAngle: center - half,
            endAngle: center + half,
          });
          g.append("path").attr("class", "ring-notch").attr("d", notchPath);
        }
      }
    }
  });

  nodeSel.filter((d) => d.kind === "microblog").append("text")
    .attr("y", (d) => microblogRadius(d) + RING_THICKNESS + 14)
    .text((d) => d.name);

  nodeSel.append("title")
    .text((d) => {
      if (d.kind === "microblog") {
        const ev = state.data.events.find((e) => e.id === d.id.slice(2));
        return ev ? `${ev.shortId} · ${labelName(ev.label)}` : d.id;
      }
      return `actor ${d.name || d.id}`;
    });

  nodeSel
    .on("click", (_, d) => {
      if (d.kind === "microblog") setSelected(d.id.slice(2));
    })
    .on("mousemove", (event, d) => {
      if (d.kind === "microblog") {
        const ev = state.data.events.find((e) => e.id === d.id.slice(2));
        if (!ev) return;
        const total = (ev.repostCount || 0) + (ev.commentCount || 0);
        const repostPct = total ? ((ev.repostCount / total) * 100).toFixed(0) : "—";
        let timeRow = "";
        if (state.dateRange && ev.date) {
          const t = parseDate(ev.date);
          if (t) {
            const [a, b] = state.dateRange;
            const span = b - a;
            if (span > 0) {
              const pct = Math.max(0, Math.min(1, (t - a) / span)) * 100;
              timeRow = `<div class="tt-row"><span>time-in-window</span><b>${pct.toFixed(0)}%</b></div>`;
            }
          }
        }
        showTooltip(
          event,
          `<b>${escapeHTML(ev.shortId)}</b>
           <div class="tt-row"><span>label</span><b>${labelName(ev.label)}</b></div>
           <div class="tt-row"><span>comments</span><b>${compactFmt.format(ev.commentCount)}</b></div>
           <div class="tt-row"><span>reposts</span><b>${compactFmt.format(ev.repostCount)}</b></div>
           <div class="tt-row"><span>repost share</span><b>${repostPct}%</b></div>
           ${timeRow}`,
        );
      } else {
        const fakePct = ((d.fakeShare || 0) * 100).toFixed(0);
        const actPct = ((d.activityNorm || 0) * 100).toFixed(0);
        showTooltip(
          event,
          `<b>${escapeHTML(d.name || d.id)}</b>
           <div class="tt-row"><span>fake share</span><b>${fakePct}%</b></div>
           <div class="tt-row"><span>activity</span><b>${actPct}%</b></div>`,
        );
      }
    })
    .on("mouseleave", hideTooltip);

  // Force simulation — favors closure (separate clusters around each microblog hub)
  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance((d) => (d.type === "repost" ? 60 : 40)).strength(0.7))
    .force("charge", d3.forceManyBody().strength((d) => (d.kind === "microblog" ? -260 : -50)))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide().radius((d) =>
      d.kind === "microblog"
        ? microblogRadius(d) + RING_THICKNESS + 4
        : actorRadius(d) + 2,
    ));

  simulation.on("tick", () => {
    linkSel
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });

  // Drag
  nodeSel.call(d3.drag()
    .on("start", (event, d) => {
      if (!event.active) simulation.alphaTarget(0.25).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on("end", (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null; d.fy = null;
    }));

  // Zoom & pan
  const zoom = d3.zoom().scaleExtent([0.4, 3]).on("zoom", (event) => root.attr("transform", event.transform));
  svg.call(zoom);

  state.network.simulation = simulation;
  state.network.zoom = zoom;
  state.network.svg = svg;

  $("#netStatNodes").textContent = fmt.format(nodes.length);
  $("#netStatEdges").textContent = fmt.format(links.length);
  highlightNetworkSelection();
}

function highlightNetworkSelection() {
  const svg = state.network.svg;
  if (!svg) return;
  const selectedNodeId = state.selectedId ? `m:${state.selectedId}` : null;
  const neighbors = new Set();
  if (selectedNodeId) {
    neighbors.add(selectedNodeId);
    state.data.graph.edges.forEach((e) => {
      if (e.source === selectedNodeId) neighbors.add(typeof e.target === "string" ? e.target : e.target.id);
      if (e.target === selectedNodeId) neighbors.add(typeof e.source === "string" ? e.source : e.source.id);
    });
  }

  svg.selectAll("g.node")
    .classed("dim", (d) => selectedNodeId && !neighbors.has(d.id))
    .classed("hot", (d) => d.id === selectedNodeId);

  svg.selectAll("line.link")
    .classed("dim", (d) => {
      if (!selectedNodeId) return false;
      const sId = typeof d.source === "object" ? d.source.id : d.source;
      const tId = typeof d.target === "object" ? d.target.id : d.target;
      return sId !== selectedNodeId && tId !== selectedNodeId;
    })
    .classed("hot", (d) => {
      if (!selectedNodeId) return false;
      const sId = typeof d.source === "object" ? d.source.id : d.source;
      const tId = typeof d.target === "object" ? d.target.id : d.target;
      return sId === selectedNodeId || tId === selectedNodeId;
    });

  const ev = getSelectedEvent();
  $("#netSelInfo").textContent = ev ? `${ev.shortId} · ${labelName(ev.label)}` : "";
}

/* ---------- PHRASES (saturation ramp, no rainbow gradient) ---------- */

function renderPhrases() {
  const rows = state.data.phrases.slice(0, 24);
  const max = d3.max(rows, (d) => d.count) || 1;
  const sat = d3.scaleLinear().domain([0, max]).range([0.18, 0.92]);
  $("#phraseList").innerHTML = rows
    .map((p) => {
      const w = Math.max(4, (p.count / max) * 100);
      const opacity = sat(p.count).toFixed(2);
      return `<button class="phrase-row" type="button" data-phrase="${escapeHTML(p.text)}">
        <p>${escapeHTML(p.text)}</p>
        <span class="meta"><b>${fmt.format(p.count)}</b> / ${fmt.format(p.users)} users</span>
        <span class="heat"><span style="width:${w}%; opacity:${opacity}"></span></span>
      </button>`;
    })
    .join("");
  $("#phraseList").querySelectorAll(".phrase-row").forEach((row) => {
    row.addEventListener("click", () => setSearch(row.getAttribute("data-phrase")));
  });
}

/* ---------- EVIDENCE ---------- */

function renderEvidence() {
  const events = getEvents();
  if (!events.length) {
    $("#evidencePanel").innerHTML = `<div class="evidence-card empty-panel">
      <span class="empty-mark"></span>
      <p class="evidence-body">没有匹配的证据样本。可以清空搜索词、切回全部标签，或重置时间窗口。</p>
    </div>`;
    return;
  }

  const event = getSelectedEvent();
  state.selectedId = event.id;
  const tags = [...(event.keywords || []), ...(event.tags || [])].slice(0, 8);
  $("#evidencePanel").innerHTML = `<div class="evidence-card">
    <div class="tagline">
      <span class="tag ${labelClass(event.label)}">${labelName(event.label)}</span>
      <span class="tag">${escapeHTML(event.date)}</span>
      <span class="tag">${escapeHTML(event.shortId)}</span>
      <span class="tag">user ${escapeHTML(event.user)}</span>
    </div>
    <p class="evidence-body">${escapeHTML(event.text)}</p>
    ${event.analysis ? `<p class="evidence-body muted"><strong>核验分析：</strong>${escapeHTML(event.analysis)}</p>` : ""}
    <div class="evidence-meta-grid">
      <span><b>${fmt.format(event.commentCount)}</b> comments</span>
      <span><b>${fmt.format(event.repostCount)}</b> reposts</span>
      <span><b>${fmt.format(event.likeCount)}</b> likes</span>
    </div>
    <div class="tagline">${tags.map((t) => `<button class="tag tag-button" type="button" data-tag="${escapeHTML(t)}">${escapeHTML(t)}</button>`).join("")}</div>
  </div>`;

  const list = document.createElement("div");
  list.className = "event-list";
  list.innerHTML = events
    .slice(0, 9)
    .map(
      (ev) => `<button class="event-row ${ev.id === event.id ? "active" : ""}" type="button" data-id="${ev.id}">
        <strong><span class="${labelClass(ev.label)}">${labelName(ev.label)}</span> ${escapeHTML(ev.date)}</strong>
        <p>${escapeHTML(ev.text)}</p>
      </button>`,
    )
    .join("") || `<div class="list-empty">没有可展示的事件。</div>`;
  $("#evidencePanel").appendChild(list);
  list.querySelectorAll(".event-row").forEach((row) => {
    row.addEventListener("click", () => setSelected(row.getAttribute("data-id")));
  });
  $("#evidencePanel").querySelectorAll(".tag-button").forEach((tag) => {
    tag.addEventListener("click", () => setSearch(tag.getAttribute("data-tag")));
  });
}

/* ---------- ORBIT (three.js) ---------- */

function disposeOrbit() {
  cancelAnimationFrame(state.orbit.raf);
  if (state.orbit.camera && state.orbit.controls) {
    state.orbit.cameraState = {
      position: state.orbit.camera.position.toArray(),
      target: state.orbit.controls.target.toArray(),
    };
  }
  if (state.orbit.controls) state.orbit.controls.dispose();
  // Walk the scene and dispose every geometry / material before tearing down
  // the renderer — otherwise stars, halos, rings, and ambient points leak GPU memory.
  if (state.orbit.scene) {
    state.orbit.scene.traverse((obj) => {
      if (obj.geometry && typeof obj.geometry.dispose === "function") obj.geometry.dispose();
      const mat = obj.material;
      if (mat) {
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose && m.dispose());
        else if (typeof mat.dispose === "function") mat.dispose();
      }
    });
  }
  if (state.orbit.renderer) {
    state.orbit.renderer.dispose();
    if (state.orbit.renderer.domElement?.parentNode) {
      state.orbit.renderer.domElement.parentNode.removeChild(state.orbit.renderer.domElement);
    }
  }
  if (state.orbit.resizeObserver) state.orbit.resizeObserver.disconnect();
  state.orbit.stars = [];
  state.orbit.scene = null;
}

function renderOrbit() {
  disposeOrbit();
  const scene = $("#orbitScene");
  scene.innerHTML = `<div class="orbit-legend">
    <span>stars: top microblogs</span>
    <span>orbit radius: engagement</span>
    <span>disc thickness: log(likes)</span>
    <span>comet trail: |comments − reposts|</span>
  </div>`;

  const events = getEvents()
    .slice()
    .sort((a, b) => (b.commentCount + b.repostCount) - (a.commentCount + a.repostCount))
    .slice(0, 24);
  if (!events.length) {
    scene.innerHTML += `<div class="orbit-loading"><p>当前筛选条件下没有可展示的微博。</p></div>`;
    return;
  }
  const rect = scene.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h);
  renderer.setClearColor(0x07080b, 1);
  scene.insertBefore(renderer.domElement, scene.firstChild);
  renderer.domElement.classList.add("orbit-canvas");

  const threeScene = new THREE.Scene();
  threeScene.fog = new THREE.FogExp2(0x07080b, 0.018);

  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  camera.position.set(0, 14, 36);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 18;
  controls.maxDistance = 70;
  controls.autoRotate = state.orbit.autoRotate;
  controls.autoRotateSpeed = 0.5;

  // Restore prior camera pose so brush/label/search re-renders don't snap the view back.
  if (state.orbit.cameraState) {
    camera.position.fromArray(state.orbit.cameraState.position);
    controls.target.fromArray(state.orbit.cameraState.target);
    controls.update();
  }

  // Lighting — directional fill so stars feel volumetric
  threeScene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const keyLight = new THREE.PointLight(0xffffff, 0.7, 100);
  keyLight.position.set(10, 18, 12);
  threeScene.add(keyLight);

  // Subtle ambient star field (chart background context, not data)
  const ambientGeom = new THREE.BufferGeometry();
  const ambientPositions = [];
  for (let i = 0; i < 380; i += 1) {
    const r = 38 + Math.random() * 20;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    ambientPositions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );
  }
  ambientGeom.setAttribute("position", new THREE.Float32BufferAttribute(ambientPositions, 3));
  threeScene.add(new THREE.Points(ambientGeom, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, sizeAttenuation: true, opacity: 0.42, transparent: true })));

  // Orbit rings (data-ink: thin, low-opacity; mark the orbit shells)
  const rings = new THREE.Group();
  const ringRadii = [6, 10, 14, 18, 22];
  ringRadii.forEach((r) => {
    const segments = 128;
    const pts = [];
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 });
    rings.add(new THREE.Line(geom, mat));
  });
  threeScene.add(rings);

  // Stars — radius from engagement (sqrt scale to keep ratio fidelity), hue from label
  const engagementValues = events.map((e) => e.commentCount + e.repostCount);
  const eMin = d3.min(engagementValues) || 0;
  const eMax = d3.max(engagementValues) || 1;
  const radiusScale = d3.scaleSqrt().domain([eMin, eMax]).range([5.5, 22]);
  const sizeScale = d3.scaleSqrt().domain([eMin, eMax]).range([0.35, 1.4]);

  const stars = [];
  events.forEach((event, i) => {
    const engagement = event.commentCount + event.repostCount;
    const r = radiusScale(engagement);
    const angle = (i / events.length) * Math.PI * 2 + (event.label === "fake" ? 0.08 : 0);
    const yJitter = ((i % 3) - 1) * 1.2;
    const color = new THREE.Color(labelColor(event.label));
    const size = sizeScale(engagement);

    const geom = new THREE.SphereGeometry(size, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color.clone().multiplyScalar(0.55),
      roughness: 0.4,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.userData = { event, angle, radius: r, yJitter, baseColor: color, size };
    mesh.position.set(Math.cos(angle) * r, yJitter, Math.sin(angle) * r);
    threeScene.add(mesh);

    // Phase 4: planar disc (in the orbit plane) — thickness encodes log(likes).
    // Open-ended cylinder lying on its side so a top-down view reads as a coin.
    const likeThickness = Math.max(
      0.05,
      Math.min(1.2, Math.log10((event.likeCount || 0) + 1) * 0.15),
    );
    const discGeom = new THREE.CylinderGeometry(size * 1.5, size * 1.5, likeThickness, 48, 1, true);
    const discMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(discGeom, discMat);
    halo.rotation.x = Math.PI / 2;
    mesh.add(halo);
    mesh.userData.halo = halo;
    mesh.userData.haloBaseOpacity = 0.35;

    // Phase 5: comet trail — a Line trailing the star along its orbit.
    // Length grows with |comments − reposts| asymmetry (a coordination tell).
    const asymmetry = Math.abs((event.commentCount || 0) - (event.repostCount || 0));
    const trailSpan = 0.05 + Math.max(0, Math.min(0.25, asymmetry / 200));
    const TRAIL_N = 18;
    const trailGeom = new THREE.BufferGeometry();
    trailGeom.setAttribute("position", new THREE.Float32BufferAttribute(new Array(TRAIL_N * 3).fill(0), 3));
    const trailMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 });
    const trail = new THREE.Line(trailGeom, trailMat);
    threeScene.add(trail);
    mesh.userData.trail = trail;
    mesh.userData.trailSpan = trailSpan;
    mesh.userData.trailN = TRAIL_N;

    stars.push(mesh);
  });

  // Raycast click → select event (links to evidence + network)
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function onPointerDown(event) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((event.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(stars, false);
    if (hits.length) {
      const ev = hits[0].object.userData.event;
      if (ev) setSelected(ev.id);
    }
  }
  renderer.domElement.addEventListener("pointerdown", onPointerDown);

  function tick(time = 0) {
    stars.forEach((mesh, i) => {
      const speed = 0.00008 * (1 + i * 0.04);
      const a = mesh.userData.angle + time * speed;
      mesh.userData.currentAngle = a;
      mesh.position.x = Math.cos(a) * mesh.userData.radius;
      mesh.position.z = Math.sin(a) * mesh.userData.radius;
      const trail = mesh.userData.trail;
      if (trail) {
        const N = mesh.userData.trailN;
        const span = mesh.userData.trailSpan;
        const r = mesh.userData.radius;
        const y = mesh.userData.yJitter;
        const positions = trail.geometry.attributes.position.array;
        for (let k = 0; k < N; k += 1) {
          // index 0 = head (at the star), N-1 = tail (lagging behind)
          const lagAngle = a - (k / (N - 1)) * span;
          positions[k * 3] = Math.cos(lagAngle) * r;
          positions[k * 3 + 1] = y;
          positions[k * 3 + 2] = Math.sin(lagAngle) * r;
        }
        trail.geometry.attributes.position.needsUpdate = true;
      }
    });
    controls.update();
    renderer.render(threeScene, camera);
    state.orbit.raf = requestAnimationFrame(tick);
  }
  tick();

  // Handle resize
  const ro = new ResizeObserver(() => {
    const r2 = scene.getBoundingClientRect();
    if (r2.width === 0 || r2.height === 0) return;
    renderer.setSize(r2.width, r2.height);
    camera.aspect = r2.width / r2.height;
    camera.updateProjectionMatrix();
  });
  ro.observe(scene);

  // Auto-rotate checkbox
  const checkbox = $("#orbitAutoRotate");
  checkbox.checked = state.orbit.autoRotate;
  checkbox.onchange = () => {
    state.orbit.autoRotate = checkbox.checked;
    controls.autoRotate = checkbox.checked;
  };

  state.orbit.renderer = renderer;
  state.orbit.scene = threeScene;
  state.orbit.camera = camera;
  state.orbit.controls = controls;
  state.orbit.stars = stars;
  state.orbit.resizeObserver = ro;

  highlightOrbitSelection();
}

function highlightOrbitSelection() {
  const stars = state.orbit.stars;
  if (!stars?.length) return;
  const selected = state.selectedId;
  stars.forEach((mesh) => {
    const isSelected = mesh.userData.event.id === selected;
    mesh.scale.setScalar(isSelected ? 1.6 : 1);
    const halo = mesh.userData.halo;
    if (halo) {
      const base = mesh.userData.haloBaseOpacity ?? 0.35;
      halo.material.opacity = isSelected ? Math.min(0.9, base + 0.4) : base;
    }
    mesh.material.emissiveIntensity = isSelected ? 1.2 : 0.6;
  });
}

/* ---------- CONTROLS ---------- */

function bindControls() {
  document.querySelectorAll(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".segmented button").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      state.label = button.dataset.label;
      state.selectedId = null;
      renderAll();
    });
  });

  $("#searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    state.selectedId = null;
    renderAll();
  });

  $("#resetBrush").addEventListener("click", () => {
    state.dateRange = null;
    state.selectedId = null;
    renderAll();
  });

  $("#netReheat").addEventListener("click", () => {
    if (state.network.simulation) state.network.simulation.alpha(0.9).restart();
  });
}

/* ---------- ENTRY ---------- */

function renderAll() {
  renderMetrics();
  renderTimeline();
  renderKeywords();
  renderActors();
  renderPhrases();
  renderEvidence();
  renderNetwork();
  if (state.data) renderOrbit();
}

renderLoading();

fetch("./public/data/checked_dashboard.json")
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    state.data = data;
    renderAll();
    bindControls();
  })
  .catch(renderError);

window.addEventListener("beforeunload", () => disposeOrbit());
