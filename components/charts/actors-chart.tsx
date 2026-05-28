"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useTooltip } from "@/lib/store/tooltip-store";
import { COLORS } from "@/lib/charts/colors";
import { compactFmt, escapeHTML, fmt } from "@/lib/format";
import type { ActorRow } from "@/lib/charts/types";

const W = 420;
const H = 620;
const CENTER = { x: W / 2, y: H / 2 + 10 };

interface ActorBubble extends ActorRow, d3.SimulationNodeDatum {
  order: number;
  r: number;
  totalInteractions: number;
  fakeShare: number;
}

export function ActorsChart() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const data = useDashboardStore((s) => s.data);
  const { show, hide } = useTooltip();

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !data || !data.actors.length) return;

    const rows = data.actors.slice(0, 24);
    const maxInteractions =
      d3.max(rows, (d) => d.comments + d.reposts + (d.attitudes ?? 0)) || 1;
    const rScale = d3.scaleSqrt().domain([0, maxInteractions]).range([14, 50]);

    const nodes: ActorBubble[] = rows.map((d, index) => {
      const totalInteractions = d.comments + d.reposts + (d.attitudes ?? 0);
      const labelTotal = d.fake + d.real;
      const fakeShare = labelTotal ? d.fake / labelTotal : 0;
      const angle = index * 2.3999632297;
      const radial = 26 + Math.sqrt(index) * 24;
      return {
        ...d,
        order: index,
        totalInteractions,
        fakeShare,
        r: rScale(totalInteractions),
        x: CENTER.x + Math.cos(angle) * radial + (fakeShare - 0.5) * 56,
        y: CENTER.y + Math.sin(angle) * radial,
      };
    });

    const simulation = d3
      .forceSimulation<ActorBubble>(nodes)
      .force("x", d3.forceX<ActorBubble>((d) => CENTER.x + (d.fakeShare - 0.5) * 96).strength(0.07))
      .force("y", d3.forceY<ActorBubble>((d) => CENTER.y + ((d.order % 4) - 1.5) * 12).strength(0.075))
      .force("collide", d3.forceCollide<ActorBubble>((d) => d.r + 5).iterations(4))
      .stop();

    for (let i = 0; i < 280; i += 1) simulation.tick();

    const svg = d3
      .select(svgEl)
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    svg.selectAll("*").remove();

    const g = svg.append("g");

    g.append("line")
      .attr("x1", 62)
      .attr("x2", W - 62)
      .attr("y1", CENTER.y)
      .attr("y2", CENTER.y)
      .attr("stroke", COLORS.ruleFaint)
      .attr("stroke-dasharray", "2 8");

    g.append("text")
      .attr("x", 24)
      .attr("y", 26)
      .attr("fill", COLORS.muted)
      .style("font-family", "var(--font-mono)")
      .style("font-size", "9px")
      .style("letter-spacing", "0.18em")
      .style("text-transform", "uppercase")
      .text("Bubble area = comments + reposts");

    g.append("text")
      .attr("x", 24)
      .attr("y", 44)
      .attr("fill", COLORS.hot)
      .style("font-family", "var(--font-mono)")
      .style("font-size", "9px")
      .style("letter-spacing", "0.18em")
      .style("text-transform", "uppercase")
      .text("Ring arc = fake-heavy participation");

    const arc = d3
      .arc<ActorBubble>()
      .innerRadius((d) => d.r + 2)
      .outerRadius((d) => d.r + 5)
      .startAngle(0)
      .endAngle((d) => Math.max(0.02, d.fakeShare * Math.PI * 2));

    const bubble = g
      .selectAll<SVGGElement, ActorBubble>("g.actor-bubble")
      .data(nodes, (d) => d.user)
      .join("g")
      .attr("class", "actor-bubble")
      .attr("transform", (d) => `translate(${d.x ?? CENTER.x},${d.y ?? CENTER.y})`)
      .on("mousemove", (event, d) => {
        show(
          event,
          `<b>${escapeHTML(d.user)}</b>
            <div class="mt-1 grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">comments</span><b>${fmt.format(d.comments)}</b></div>
            <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">reposts</span><b>${fmt.format(d.reposts)}</b></div>
            <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">engagement</span><b>${fmt.format(d.totalInteractions)}</b></div>
            <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">fake share</span><b>${(d.fakeShare * 100).toFixed(1)}%</b></div>`
        );
      })
      .on("mouseleave", hide);

    bubble
      .append("circle")
      .attr("r", (d) => d.r)
      .attr("fill", COLORS.coolSoft)
      .attr("stroke", COLORS.ruleSoft)
      .attr("stroke-width", 1.1);

    bubble
      .append("circle")
      .attr("r", (d) => Math.max(5, d.r * (0.38 + d.fakeShare * 0.22)))
      .attr("fill", COLORS.hot)
      .attr("fill-opacity", (d) => 0.1 + d.fakeShare * 0.32);

    bubble
      .append("path")
      .attr("d", arc)
      .attr("transform", "rotate(-90)")
      .attr("fill", COLORS.hot)
      .attr("fill-opacity", (d) => 0.35 + d.fakeShare * 0.45);

    bubble
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.18em")
      .attr("fill", COLORS.ink)
      .style("font-family", "var(--font-mono)")
      .style("font-size", (d) => `${Math.max(8.5, Math.min(12, d.r * 0.3))}px`)
      .style("font-weight", "600")
      .style("letter-spacing", "0.04em")
      .style("pointer-events", "none")
      .text((d) => d.user.slice(0, 8));

    bubble
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.18em")
      .attr("fill", COLORS.muted)
      .style("font-family", "var(--font-mono)")
      .style("font-size", "8.5px")
      .style("letter-spacing", "0.06em")
      .style("pointer-events", "none")
      .text((d) => compactFmt.format(d.totalInteractions));

    return () => {
      simulation.stop();
      svg.selectAll("*").remove();
    };
  }, [data, show, hide]);

  if (!data) {
    return (
      <div className="h-full w-full animate-pulse bg-card/40 border border-border/30" />
    );
  }
  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label="High-activity actor bubble map — size = engagement, ring = fake share"
      className="w-full h-full"
    />
  );
}
