"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useTooltip } from "@/lib/store/tooltip-store";
import { COLORS } from "@/lib/charts/colors";
import { escapeHTML, fmt } from "@/lib/format";
import type { KeywordRow } from "@/lib/charts/types";

const W = 420;
const H = 620;
const CENTER = { x: W / 2, y: H / 2 + 6 };

interface KeywordBubble extends KeywordRow, d3.SimulationNodeDatum {
  order: number;
  r: number;
  fontSize: number;
  fakeShare: number;
}

export function KeywordsChart() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const data = useDashboardStore((s) => s.data);
  const setSearch = useDashboardStore((s) => s.setSearch);
  const { show, hide } = useTooltip();

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !data || !data.keywords.length) return;

    const rows = data.keywords.slice(0, 22);
    const totalMax = d3.max(rows, (d) => d.total) || 1;
    const rScale = d3.scaleSqrt().domain([0, totalMax]).range([18, 56]);
    const fontScale = d3.scaleSqrt().domain([0, totalMax]).range([10, 22]);

    const nodes: KeywordBubble[] = rows.map((d, index) => {
      const fakeShare = d.total ? d.fake / d.total : 0;
      const angle = index * 2.3999632297;
      const radial = 20 + Math.sqrt(index) * 22;
      return {
        ...d,
        order: index,
        fakeShare,
        r: rScale(d.total),
        fontSize: fontScale(d.total),
        x: CENTER.x + Math.cos(angle) * radial + (fakeShare - 0.5) * 48,
        y: CENTER.y + Math.sin(angle) * radial,
      };
    });

    const simulation = d3
      .forceSimulation<KeywordBubble>(nodes)
      .force("x", d3.forceX<KeywordBubble>((d) => CENTER.x + (d.fakeShare - 0.5) * 86).strength(0.08))
      .force("y", d3.forceY<KeywordBubble>((d) => CENTER.y + ((d.order % 3) - 1) * 16).strength(0.07))
      .force("collide", d3.forceCollide<KeywordBubble>((d) => d.r + 4).iterations(4))
      .stop();

    for (let i = 0; i < 260; i += 1) simulation.tick();

    const svg = d3
      .select(svgEl)
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    const radial = defs.append("radialGradient").attr("id", "keyword-bubble-hot");
    radial.append("stop").attr("offset", "0%").attr("stop-color", COLORS.hot).attr("stop-opacity", 0.72);
    radial.append("stop").attr("offset", "68%").attr("stop-color", COLORS.hot).attr("stop-opacity", 0.2);
    radial.append("stop").attr("offset", "100%").attr("stop-color", COLORS.hot).attr("stop-opacity", 0.02);

    const g = svg.append("g");

    g.append("circle")
      .attr("cx", CENTER.x)
      .attr("cy", CENTER.y)
      .attr("r", 168)
      .attr("fill", "none")
      .attr("stroke", COLORS.ruleFaint)
      .attr("stroke-dasharray", "2 8");

    g.append("circle")
      .attr("cx", CENTER.x)
      .attr("cy", CENTER.y)
      .attr("r", 86)
      .attr("fill", "none")
      .attr("stroke", COLORS.ruleFaint)
      .attr("stroke-dasharray", "1 6");

    const bubble = g
      .selectAll<SVGGElement, KeywordBubble>("g.keyword-bubble")
      .data(nodes, (d) => d.keyword)
      .join("g")
      .attr("class", "keyword-bubble")
      .attr("transform", (d) => `translate(${d.x ?? CENTER.x},${d.y ?? CENTER.y})`)
      .style("cursor", "pointer")
      .on("click", (_, d) => setSearch(d.keyword))
      .on("mousemove", (event, d) => {
        const fakeShare = d.total ? ((d.fake / d.total) * 100).toFixed(1) : "0.0";
        show(
          event,
          `<b>${escapeHTML(d.keyword)}</b>
            <div class="mt-1 grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">总量</span><b>${fmt.format(d.total)}</b></div>
            <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">真实</span><b>${fmt.format(d.real)}</b></div>
            <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">虚假</span><b>${fmt.format(d.fake)}</b></div>
            <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">虚假占比</span><b>${fakeShare}%</b></div>`
        );
      })
      .on("mouseleave", hide);

    bubble
      .append("circle")
      .attr("r", (d) => d.r)
      .attr("fill", (d) =>
        d.fakeShare > 0.45 ? "url(#keyword-bubble-hot)" : COLORS.coolSoft
      )
      .attr("stroke", (d) => (d.fakeShare > 0.45 ? COLORS.hot : COLORS.ruleSoft))
      .attr("stroke-width", (d) => 0.8 + d.fakeShare * 1.4);

    bubble
      .append("circle")
      .attr("r", (d) => d.r * (0.54 + d.fakeShare * 0.28))
      .attr("fill", "none")
      .attr("stroke", (d) => (d.fakeShare > 0.45 ? COLORS.hot : COLORS.ink))
      .attr("stroke-opacity", (d) => 0.2 + d.fakeShare * 0.55)
      .attr("stroke-width", 1);

    bubble
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.08em")
      .attr("fill", COLORS.ink)
      .style("font-family", "var(--font-mono)")
      .style("font-size", (d) => `${Math.max(9, d.fontSize - Math.max(0, d.keyword.length - 5) * 1.15)}px`)
      .style("font-weight", "600")
      .style("letter-spacing", "0.03em")
      .style("pointer-events", "none")
      .text((d) => (d.keyword.length > 7 ? `${d.keyword.slice(0, 7)}...` : d.keyword));

    bubble
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.55em")
      .attr("fill", COLORS.muted)
      .style("font-family", "var(--font-mono)")
      .style("font-size", "9px")
      .style("letter-spacing", "0.08em")
      .style("pointer-events", "none")
      .text((d) => fmt.format(d.total));

    const legend = svg
      .append("g")
      .attr("transform", "translate(24,26)")
      .style("font-family", "var(--font-mono)")
      .style("font-size", "9px")
      .style("letter-spacing", "0.18em")
      .style("text-transform", "uppercase");

    legend.append("text").attr("fill", COLORS.muted).text("气泡面积 = 词项命中总数");
    legend
      .append("text")
      .attr("y", 18)
      .attr("fill", COLORS.hot)
      .text("越暖 = 虚假占比越高");

    return () => {
      simulation.stop();
      svg.selectAll("*").remove();
    };
  }, [data, setSearch, show, hide]);

  if (!data) return <ChartSkeleton />;
  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label="关键词气泡云：大小表示总频次，颜色表示虚假占比"
      className="w-full h-full"
    />
  );
}

function ChartSkeleton() {
  return (
    <div className="h-full w-full animate-pulse bg-card/40 border border-border/30" />
  );
}
