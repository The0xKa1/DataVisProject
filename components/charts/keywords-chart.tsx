"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useTooltip } from "@/lib/store/tooltip-store";
import { COLORS } from "@/lib/charts/colors";
import { compactFmt, escapeHTML, fmt } from "@/lib/format";
import type { KeywordRow } from "@/lib/charts/types";

const W = 720;
const H = 470;
const MARGIN = { top: 24, right: 64, bottom: 28, left: 110 };

export function KeywordsChart() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const data = useDashboardStore((s) => s.data);
  const setSearch = useDashboardStore((s) => s.setSearch);
  const { show, hide } = useTooltip();

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !data || !data.keywords.length) return;
    const rows: KeywordRow[] = data.keywords.slice(0, 16);
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

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(rows, (d) => Math.max(d.fake, d.real)) || 1])
      .nice()
      .range([0, innerW]);
    const y = d3
      .scaleBand<string>()
      .domain(rows.map((d) => d.keyword))
      .range([0, innerH])
      .padding(0.18);

    g.append("g")
      .selectAll<SVGTextElement, KeywordRow>("text.kw-label")
      .data(rows)
      .join("text")
      .attr("class", "kw-label")
      .attr("x", -12)
      .attr("y", (d) => (y(d.keyword) ?? 0) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .attr("fill", COLORS.ink)
      .style("font-family", "var(--font-mono)")
      .style("font-size", "11px")
      .style("cursor", "pointer")
      .text((d) => d.keyword)
      .on("click", (_, d) => setSearch(d.keyword));

    const rowG = g
      .selectAll<SVGGElement, KeywordRow>("g.kw-row")
      .data(rows)
      .join("g")
      .attr("class", "kw-row")
      .attr("transform", (d) => `translate(0,${y(d.keyword) ?? 0})`)
      .style("cursor", "pointer")
      .on("click", (_, d) => setSearch(d.keyword))
      .on("mousemove", (event, d) => {
        show(
          event,
          `<b>${escapeHTML(d.keyword)}</b>
            <div class="mt-1 grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">real</span><b>${fmt.format(d.real)}</b></div>
            <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">fake</span><b>${fmt.format(d.fake)}</b></div>`
        );
      })
      .on("mouseleave", hide);

    rowG
      .append("line")
      .attr("class", "kw-track")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", y.bandwidth() / 2)
      .attr("y2", y.bandwidth() / 2)
      .attr("stroke", COLORS.ruleFaint)
      .attr("stroke-dasharray", "1 3");

    rowG
      .append("line")
      .attr("x1", 0)
      .attr("x2", (d) => x(d.real))
      .attr("y1", y.bandwidth() / 2 - 3)
      .attr("y2", y.bandwidth() / 2 - 3)
      .attr("stroke", COLORS.ink)
      .attr("stroke-width", 1.2);

    rowG
      .append("line")
      .attr("x1", 0)
      .attr("x2", (d) => x(d.fake))
      .attr("y1", y.bandwidth() / 2 + 3)
      .attr("y2", y.bandwidth() / 2 + 3)
      .attr("stroke", COLORS.hot)
      .attr("stroke-width", 1.2);

    rowG
      .append("rect")
      .attr("x", (d) => x(d.real) - 4)
      .attr("y", y.bandwidth() / 2 - 7)
      .attr("width", 8)
      .attr("height", 6)
      .attr("fill", COLORS.ink);

    rowG
      .append("rect")
      .attr("x", (d) => x(d.fake) - 4)
      .attr("y", y.bandwidth() / 2 + 1)
      .attr("width", 8)
      .attr("height", 6)
      .attr("fill", COLORS.hot);

    rowG
      .append("text")
      .attr("x", innerW + 10)
      .attr("y", y.bandwidth() / 2 + 4)
      .attr("fill", COLORS.muted)
      .style("font-family", "var(--font-mono)")
      .style("font-size", "10px")
      .style("letter-spacing", "0.04em")
      .text((d) => fmt.format(d.total));

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
  }, [data, setSearch, show, hide]);

  if (!data) return <ChartSkeleton />;
  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label="Keyword frequency split — real vs fake"
      className="w-full h-full"
    />
  );
}

function ChartSkeleton() {
  return (
    <div className="h-full w-full animate-pulse bg-card/40 border border-border/30" />
  );
}
