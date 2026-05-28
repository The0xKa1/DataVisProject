"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useTooltip } from "@/lib/store/tooltip-store";
import { COLORS } from "@/lib/charts/colors";
import { compactFmt, escapeHTML, fmt } from "@/lib/format";
import type { ActorRow } from "@/lib/charts/types";

const W = 720;
const H = 470;
const MARGIN = { top: 18, right: 80, bottom: 30, left: 120 };

export function ActorsChart() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const data = useDashboardStore((s) => s.data);
  const { show, hide } = useTooltip();

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !data || !data.actors.length) return;
    const rows: ActorRow[] = data.actors.slice(0, 18);
    const innerW = W - MARGIN.left - MARGIN.right;
    const innerH = H - MARGIN.top - MARGIN.bottom;

    const svg = d3
      .select(svgEl)
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "none");
    svg.selectAll("*").remove();
    const g = svg
      .append("g")
      .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    const totals = rows.map((r) => r.comments + r.reposts);
    const x = d3
      .scaleSqrt()
      .domain([0, d3.max(totals) || 1])
      .range([0, innerW])
      .nice();
    const y = d3
      .scaleBand<string>()
      .domain(rows.map((r) => r.user))
      .range([0, innerH])
      .padding(0.22);

    g.append("g")
      .selectAll<SVGTextElement, ActorRow>("text.actor-label")
      .data(rows)
      .join("text")
      .attr("class", "actor-label")
      .attr("x", -12)
      .attr("y", (d) => (y(d.user) ?? 0) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .attr("fill", COLORS.muted)
      .style("font-family", "var(--font-mono)")
      .style("font-size", "10px")
      .style("letter-spacing", "0.04em")
      .text((d) => d.user);

    const rowG = g
      .selectAll<SVGGElement, ActorRow>("g.actor-row")
      .data(rows)
      .join("g")
      .attr("class", "actor-row")
      .attr("transform", (d) => `translate(0,${y(d.user) ?? 0})`)
      .on("mousemove", (event, d) => {
        const total = d.comments + d.reposts;
        const fakeShare = total ? ((d.fake / total) * 100).toFixed(1) : "0.0";
        show(
          event,
          `<b>${escapeHTML(d.user)}</b>
            <div class="mt-1 grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">comments</span><b>${fmt.format(d.comments)}</b></div>
            <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">reposts</span><b>${fmt.format(d.reposts)}</b></div>
            <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">fake share</span><b>${fakeShare}%</b></div>`
        );
      })
      .on("mouseleave", hide);

    rowG
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", innerW)
      .attr("height", y.bandwidth())
      .attr("fill", COLORS.surfaceAlt)
      .attr("stroke", COLORS.ruleFaint)
      .attr("stroke-width", 1);

    rowG
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", (d) => x(d.comments + d.reposts))
      .attr("height", y.bandwidth())
      .attr("fill", COLORS.cool)
      .attr("fill-opacity", 0.85);

    rowG
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", (d) => x(d.comments + d.reposts))
      .attr("height", (d) => {
        const total = d.comments + d.reposts;
        const fakeShare = total ? d.fake / total : 0;
        return Math.min(
          y.bandwidth(),
          Math.max(0, fakeShare * 4 + (fakeShare > 0 ? 2 : 0))
        );
      })
      .attr("fill", COLORS.hot);

    rowG
      .append("text")
      .attr("x", (d) => x(d.comments + d.reposts) + 8)
      .attr("y", y.bandwidth() / 2 + 4)
      .attr("fill", COLORS.ink)
      .style("font-family", "var(--font-mono)")
      .style("font-size", "11px")
      .style("font-weight", "500")
      .text((d) => compactFmt.format(d.comments + d.reposts));

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(4)
          .tickFormat((d) => compactFmt.format(d as number))
      )
      .call((sel) => sel.select(".domain").attr("stroke", COLORS.rule))
      .call((sel) => sel.selectAll("line").attr("stroke", COLORS.rule))
      .call((sel) =>
        sel
          .selectAll("text")
          .attr("fill", COLORS.muted)
          .style("font-family", "var(--font-mono)")
          .style("font-size", "10px")
          .style("text-transform", "uppercase")
          .style("letter-spacing", "0.08em")
      );

    return () => {
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
      aria-label="High-activity actors — bar length = engagement"
      className="w-full h-full"
    />
  );
}
