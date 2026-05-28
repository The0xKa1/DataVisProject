"use client";

import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useFilteredEvents } from "@/lib/store/selectors";
import { useTooltip } from "@/lib/store/tooltip-store";
import {
  COLORS,
  RING_THICKNESS,
  microblogRadius,
  actorRadius,
} from "@/lib/charts/colors";
import { buildNetworkData, type NetworkLink, type NetworkNode } from "@/lib/charts/network-data";
import { compactFmt, escapeHTML, fmt, labelName, parseEventDate } from "@/lib/format";

const W = 960;
const H = 560;

interface NetworkRefs {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  root: d3.Selection<SVGGElement, unknown, null, undefined>;
  linkG: d3.Selection<SVGGElement, unknown, null, undefined>;
  nodeG: d3.Selection<SVGGElement, unknown, null, undefined>;
  simulation: d3.Simulation<NetworkNode, NetworkLink>;
}

export function NetworkGraph() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const refsRef = useRef<NetworkRefs | null>(null);
  const data = useDashboardStore((s) => s.data);
  const selectedId = useDashboardStore((s) => s.selectedId);
  const dateRange = useDashboardStore((s) => s.dateRange);
  const setSelected = useDashboardStore((s) => s.setSelected);
  const events = useFilteredEvents();
  const { show, hide } = useTooltip();

  // Compute the network projection per filter change.
  const { nodes, links } = useMemo(() => {
    if (!data) return { nodes: [] as NetworkNode[], links: [] as NetworkLink[] };
    return buildNetworkData(data, events);
  }, [data, events]);

  // Mount once: create svg root, simulation, zoom.
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3
      .select(svgEl)
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    svg.selectAll("*").remove();

    const root = svg.append("g").attr("class", "net-root");
    const linkG = root.append("g").attr("class", "links");
    const nodeG = root.append("g").attr("class", "nodes");

    const simulation = d3
      .forceSimulation<NetworkNode>()
      .force(
        "link",
        d3
          .forceLink<NetworkNode, NetworkLink>()
          .id((d) => d.id)
          .distance((d) => (d.type === "repost" ? 60 : 40))
          .strength(0.7)
      )
      .force(
        "charge",
        d3
          .forceManyBody<NetworkNode>()
          .strength((d) => (d.kind === "microblog" ? -260 : -50))
      )
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force(
        "collide",
        d3.forceCollide<NetworkNode>().radius((d) =>
          d.kind === "microblog"
            ? microblogRadius(d.weight) * Math.SQRT2 + RING_THICKNESS + 4
            : actorRadius(d.weight) * Math.SQRT2 + 2
        )
      );

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 3])
      .on("zoom", (event) => root.attr("transform", event.transform));
    svg.call(zoom);

    refsRef.current = { svg, root, linkG, nodeG, simulation };

    return () => {
      simulation.stop();
      svg.on(".zoom", null);
      svg.selectAll("*").remove();
      refsRef.current = null;
    };
  }, []);

  // On filter change: diff nodes/links into the existing simulation.
  useEffect(() => {
    const refs = refsRef.current;
    if (!refs || !data) return;

    const { linkG, nodeG, simulation } = refs;
    const brush = dateRange;

    // Link join
    const linkSel = linkG
      .selectAll<SVGLineElement, NetworkLink>("line")
      .data(links, (d) => `${linkKey(d)}-${d.type}`)
      .join(
        (enter) =>
          enter
            .append("line")
            .attr("stroke-width", 1)
            .attr("stroke-opacity", 0.45)
            .attr("stroke", (d) =>
              d.type === "comment" ? COLORS.cool : COLORS.ink
            ),
        (update) => update,
        (exit) => exit.remove()
      )
      .attr("class", (d) => `link ${d.type}`);

    // Node join
    const nodeSel = nodeG
      .selectAll<SVGGElement, NetworkNode>("g.node")
      .data(nodes, (d) => d.id)
      .join(
        (enter) => {
          const g = enter
            .append("g")
            .attr("class", "node")
            .attr("data-id", (d) =>
              d.kind === "microblog" ? d.id.slice(2) : ""
            )
            .style("cursor", (d) =>
              d.kind === "microblog" ? "pointer" : "default"
            );
          // Microblog core: square frame.
          g.filter((d) => d.kind === "microblog")
            .append("rect")
            .attr("class", (d) => `core ${d.label || "actor"}`)
            .attr("x", (d) => -microblogRadius(d.weight))
            .attr("y", (d) => -microblogRadius(d.weight))
            .attr("width", (d) => microblogRadius(d.weight) * 2)
            .attr("height", (d) => microblogRadius(d.weight) * 2)
            .attr("fill", (d) =>
              d.label === "fake" ? COLORS.hot : COLORS.ink
            )
            .attr("stroke", COLORS.ink)
            .attr("stroke-width", 1)
            .attr("shape-rendering", "crispEdges");

          // Actor core: split square (left = fake share, right = activity)
          const actorGroup = g.filter((d) => d.kind !== "microblog");
          actorGroup.each(function (d) {
            const r = actorRadius(d.weight);
            const size = r * 2;
            const node = d3.select(this);
            const inner = node
              .append("g")
              .attr("class", "core actor-rect");
            inner
              .append("rect")
              .attr("class", "actor-frame")
              .attr("x", -r)
              .attr("y", -r)
              .attr("width", size)
              .attr("height", size)
              .attr("fill", COLORS.surface)
              .attr("stroke", COLORS.ink)
              .attr("stroke-width", 1);
            const fake = Math.max(0, Math.min(1, d.fakeShare || 0));
            const act = Math.max(0, Math.min(1, d.activityNorm || 0));
            inner
              .append("rect")
              .attr("class", "actor-half-left")
              .attr("x", -r)
              .attr("y", r - size * fake)
              .attr("width", r)
              .attr("height", size * fake)
              .attr("fill", COLORS.hot);
            inner
              .append("rect")
              .attr("class", "actor-half-right")
              .attr("x", 0)
              .attr("y", r - size * act)
              .attr("width", r)
              .attr("height", size * act)
              .attr("fill", COLORS.cool);
            if (fake > 0.5) {
              inner
                .append("rect")
                .attr("class", "actor-flag")
                .attr("x", -r)
                .attr("y", -r - 2)
                .attr("width", size)
                .attr("height", 2)
                .attr("fill", COLORS.hot);
            }
          });

          // Microblog rings (repost top / comment bottom)
          const micro = g.filter((d) => d.kind === "microblog");
          micro.each(function (d) {
            const r = microblogRadius(d.weight);
            const total = (d.repostCount || 0) + (d.commentCount || 0);
            const repostShare = total ? (d.repostCount || 0) / total : 0.5;
            const t = RING_THICKNESS;
            const sel = d3.select(this);
            sel
              .append("rect")
              .attr("class", "ring-repost")
              .attr("x", -r)
              .attr("y", -r - t)
              .attr("width", r * 2)
              .attr("height", t)
              .attr("fill", COLORS.ink)
              .attr("opacity", 0.4 + 0.55 * repostShare);
            sel
              .append("rect")
              .attr("class", "ring-comment")
              .attr("x", -r)
              .attr("y", r)
              .attr("width", r * 2)
              .attr("height", t)
              .attr("fill", COLORS.cool)
              .attr("opacity", 0.4 + 0.55 * (1 - repostShare));
          });

          // Labels for microblogs
          micro
            .append("text")
            .attr("y", (d) => microblogRadius(d.weight) + RING_THICKNESS + 14)
            .attr("text-anchor", "middle")
            .attr("fill", COLORS.muted)
            .style("font-family", "var(--font-mono)")
            .style("font-size", "9px")
            .style("letter-spacing", "0.08em")
            .style("pointer-events", "none")
            .text((d) => d.name || "");

          // Drag
          const drag = d3
            .drag<SVGGElement, NetworkNode>()
            .on("start", (event, d) => {
              if (!event.active) simulation.alphaTarget(0.25).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on("drag", (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on("end", (event, d) => {
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            });
          g.call(drag);

          // Interactions
          g.on("click", (_event, d) => {
            if (d.kind === "microblog") setSelected(d.id.slice(2));
          })
            .on("mousemove", (event, d) => {
              if (!data) return;
              if (d.kind === "microblog") {
                const ev = data.events.find((e) => e.id === d.id.slice(2));
                if (!ev) return;
                const tot = (ev.repostCount || 0) + (ev.commentCount || 0);
                const repostPct = tot
                  ? (((ev.repostCount || 0) / tot) * 100).toFixed(0)
                  : "—";
                show(
                  event,
                  `<b>${escapeHTML(ev.shortId)}</b>
                    <div class="mt-1 grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">label</span><b>${labelName(ev.label)}</b></div>
                    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">comments</span><b>${compactFmt.format(ev.commentCount ?? 0)}</b></div>
                    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">reposts</span><b>${compactFmt.format(ev.repostCount ?? 0)}</b></div>
                    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">repost share</span><b>${repostPct}%</b></div>`
                );
              } else {
                const fakePct = ((d.fakeShare || 0) * 100).toFixed(0);
                const actPct = ((d.activityNorm || 0) * 100).toFixed(0);
                show(
                  event,
                  `<b>${escapeHTML(d.name || d.id)}</b>
                    <div class="mt-1 grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">fake share</span><b>${fakePct}%</b></div>
                    <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">activity</span><b>${actPct}%</b></div>`
                );
              }
            })
            .on("mouseleave", hide);

          return g;
        },
        (update) => update,
        (exit) => exit.remove()
      );

    // Refresh notches per brush change (cheap to redraw)
    nodeSel.selectAll(".ring-notch").remove();
    if (brush) {
      nodeSel
        .filter((d) => d.kind === "microblog")
        .each(function (d) {
          const r = microblogRadius(d.weight);
          const t = RING_THICKNESS;
          if (!d.eventDate) return;
          const eventTime = parseEventDate(d.eventDate);
          if (!eventTime) return;
          const [a, b] = brush;
          const span = b.getTime() - a.getTime();
          if (span <= 0) return;
          const tt = Math.max(0, Math.min(1, (eventTime.getTime() - a.getTime()) / span));
          const notchW = Math.max(2, r * 0.4);
          const notchX = -r + tt * (r * 2 - notchW);
          d3.select(this)
            .append("rect")
            .attr("class", "ring-notch")
            .attr("x", notchX)
            .attr("y", -r - t - 2)
            .attr("width", notchW)
            .attr("height", 2)
            .attr("fill", COLORS.hot);
        });
    }

    // Wire simulation to current data
    simulation.nodes(nodes);
    const linkForce = simulation.force<d3.ForceLink<NetworkNode, NetworkLink>>(
      "link"
    );
    linkForce?.links(links);
    simulation.alpha(0.6).restart();

    simulation.on("tick", () => {
      linkSel
        .attr("x1", (d) => linkNode(d.source).x ?? 0)
        .attr("y1", (d) => linkNode(d.source).y ?? 0)
        .attr("x2", (d) => linkNode(d.target).x ?? 0)
        .attr("y2", (d) => linkNode(d.target).y ?? 0);
      nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });
  }, [nodes, links, dateRange, data, setSelected, show, hide]);

  // selectedId — imperative highlight, no React re-render of nodes.
  useEffect(() => {
    const refs = refsRef.current;
    if (!refs || !data) return;
    const { svg } = refs;
    const selectedNodeId = selectedId ? `m:${selectedId}` : null;
    const neighbors = new Set<string>();
    if (selectedNodeId) {
      neighbors.add(selectedNodeId);
      for (const e of data.graph.edges) {
        if (e.source === selectedNodeId) neighbors.add(linkId(e.target));
        if (e.target === selectedNodeId) neighbors.add(linkId(e.source));
      }
    }

    svg
      .selectAll<SVGGElement, NetworkNode>("g.node")
      .each(function (d) {
        const isHot = selectedNodeId === d.id;
        const isDim = !!selectedNodeId && !neighbors.has(d.id);
        const sel = d3.select(this);
        sel.attr("opacity", isDim ? 0.18 : 1);
        // Highlight microblog cores
        sel
          .selectAll<SVGRectElement, NetworkNode>("rect.core")
          .attr("stroke", isHot ? COLORS.hot : COLORS.ink)
          .attr("stroke-width", isHot ? 2 : 1);
      });

    svg
      .selectAll<SVGLineElement, NetworkLink>("line.link")
      .each(function (d) {
        const sId = linkId(d.source);
        const tId = linkId(d.target);
        const isHot =
          !!selectedNodeId && (sId === selectedNodeId || tId === selectedNodeId);
        const isDim =
          !!selectedNodeId && sId !== selectedNodeId && tId !== selectedNodeId;
        const node = d3.select(this);
        node
          .attr("stroke", isHot ? COLORS.hot : d.type === "comment" ? COLORS.cool : COLORS.ink)
          .attr("stroke-width", isHot ? 1.5 : 1)
          .attr("stroke-opacity", isDim ? 0.06 : isHot ? 1 : 0.45);
      });
  }, [selectedId, data]);

  if (!data || !nodes.length) {
    return (
      <div className="relative h-full w-full bg-card/40 border border-border/30 flex items-center justify-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
          {data ? "No microblogs under current filter." : "Loading network …"}
        </span>
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full bg-background/30"
      data-lenis-prevent
    >
      <svg
        ref={svgRef}
        role="img"
        aria-label="Force-directed propagation network"
        className="block h-full w-full cursor-grab active:cursor-grabbing"
      />
      <div className="pointer-events-none absolute left-3 bottom-3 flex border border-border bg-card/70 backdrop-blur-sm font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
        <span className="border-r border-border px-3 py-1.5">
          <b className="text-accent font-medium">{fmt.format(nodes.length)}</b> nodes
        </span>
        <span className="px-3 py-1.5">
          <b className="text-accent font-medium">{fmt.format(links.length)}</b> edges
        </span>
      </div>
    </div>
  );
}

function linkId(ref: string | NetworkNode): string {
  return typeof ref === "string" ? ref : (ref as NetworkNode).id;
}

function linkNode(ref: string | NetworkNode): NetworkNode {
  return typeof ref === "string"
    ? ({ id: ref, kind: "actor", weight: 0 } as NetworkNode)
    : (ref as NetworkNode);
}

function linkKey(d: NetworkLink): string {
  return `${linkId(d.source)}->${linkId(d.target)}`;
}
