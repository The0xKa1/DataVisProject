"use client";

import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useTooltip } from "@/lib/store/tooltip-store";
import { COLORS } from "@/lib/charts/colors";
import { compactFmt, escapeHTML, fmt } from "@/lib/format";
import type { TimelineRow } from "@/lib/charts/types";

const W = 920;
const H = 320;
const MARGIN = { top: 28, right: 56, bottom: 50, left: 58 };

interface TimelineDatum extends TimelineRow {
  dateObj: Date;
}

export function TimelineChart() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const brushRef = useRef<d3.BrushBehavior<unknown> | null>(null);
  const brushGRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const xScaleRef = useRef<d3.ScaleTime<number, number> | null>(null);

  const data = useDashboardStore((s) => s.data);
  const dateRange = useDashboardStore((s) => s.dateRange);
  const { show, hide } = useTooltip();

  // Parse months once per data load.
  const rows: TimelineDatum[] = useMemo(() => {
    if (!data) return [];
    const parseMonth = d3.timeParse("%Y-%m");
    return data.timeline
      .map((d) => {
        const dt = parseMonth(d.month);
        return dt ? { ...d, dateObj: dt } : null;
      })
      .filter((d): d is TimelineDatum => d !== null);
  }, [data]);

  // Effect 1 — draw the static parts + bind brush. Triggered only on data change.
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || rows.length === 0) return;
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

    const months = rows.map((d) => d.dateObj);
    const xDomain: [Date, Date] = [
      d3.min(months) ?? new Date(),
      d3.timeMonth.offset(d3.max(months) ?? new Date(), 1),
    ];
    const x = d3.scaleTime().domain(xDomain).range([0, innerW]);
    xScaleRef.current = x;
    const monthSpan = innerW / rows.length;
    const barW = monthSpan * 0.68;
    const barOffset = (monthSpan - barW) / 2;
    const barX = (d: TimelineDatum) => x(d.dateObj) + barOffset;
    const barCenter = (d: TimelineDatum) => x(d.dateObj) + monthSpan / 2;

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(rows, (d) => d.fake + d.real) || 1])
      .nice()
      .range([innerH, 0]);
    const yRight = d3
      .scaleLinear()
      .domain([0, d3.max(rows, (d) => d.comments + d.reposts) || 1])
      .nice()
      .range([innerH, 0]);

    // Grid
    g.append("g")
      .call(d3.axisLeft(y).ticks(4).tickSize(-innerW).tickFormat(() => ""))
      .call((sel) =>
        sel
          .selectAll("line")
          .attr("stroke", COLORS.ruleFaint)
          .attr("stroke-dasharray", "1 4")
      )
      .call((sel) => sel.select(".domain").remove());

    // Stacked bars
    const monthGroups = g
      .selectAll<SVGGElement, TimelineDatum>("g.month-group")
      .data(rows)
      .join("g")
      .attr("class", "month-group")
      .attr("transform", (d) => `translate(${barX(d)},0)`)
      .style("cursor", "crosshair")
      .on("mousemove", (event, d) => {
        show(
          event,
          `<b>${escapeHTML(d.month)}</b>
            <div class="mt-1 grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">fake</span><b>${fmt.format(d.fake)}</b></div>
            <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">real</span><b>${fmt.format(d.real)}</b></div>
            <div class="grid grid-cols-2 gap-x-3"><span class="text-muted-foreground">engagement</span><b>${fmt.format(d.comments + d.reposts)}</b></div>`
        );
      })
      .on("mouseleave", hide);

    monthGroups
      .append("rect")
      .attr("x", 0)
      .attr("y", (d) => y(d.real))
      .attr("width", barW)
      .attr("height", (d) => innerH - y(d.real))
      .attr("fill", COLORS.ink)
      .attr("fill-opacity", 0.95);

    monthGroups
      .append("rect")
      .attr("x", 0)
      .attr("y", (d) => y(d.real + d.fake))
      .attr("width", barW)
      .attr("height", (d) => y(d.real) - y(d.real + d.fake))
      .attr("fill", COLORS.hot);

    const line = d3
      .line<TimelineDatum>()
      .x((d) => barCenter(d))
      .y((d) => yRight(d.comments + d.reposts))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(rows)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", COLORS.cool)
      .attr("stroke-width", 1.5);

    g.selectAll<SVGCircleElement, TimelineDatum>("circle.interaction-dot")
      .data(rows)
      .join("circle")
      .attr("class", "interaction-dot")
      .attr("cx", (d) => barCenter(d))
      .attr("cy", (d) => yRight(d.comments + d.reposts))
      .attr("r", 2.5)
      .attr("fill", COLORS.bg)
      .attr("stroke", COLORS.cool)
      .attr("stroke-width", 1.5);

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(d3.timeMonth.every(1) as d3.TimeInterval)
          .tickFormat((d) => d3.timeFormat("%Y-%m")(d as Date))
      )
      .call((sel) => sel.select(".domain").attr("stroke", COLORS.rule))
      .call((sel) => sel.selectAll("line").attr("stroke", COLORS.rule))
      .call((sel) =>
        sel
          .selectAll("text")
          .attr("fill", COLORS.muted)
          .style("font-family", "var(--font-mono)")
          .style("font-size", "10px")
          .style("letter-spacing", "0.06em")
          .style("text-transform", "uppercase")
      );

    g.append("g")
      .call(d3.axisLeft(y).ticks(4))
      .call((sel) => sel.select(".domain").remove())
      .call((sel) => sel.selectAll("line").attr("stroke", COLORS.rule))
      .call((sel) =>
        sel
          .selectAll("text")
          .attr("fill", COLORS.muted)
          .style("font-family", "var(--font-mono)")
          .style("font-size", "10px")
      );

    g.append("g")
      .attr("transform", `translate(${innerW},0)`)
      .call(
        d3
          .axisRight(yRight)
          .ticks(4)
          .tickFormat((d) => compactFmt.format(d as number))
      )
      .call((sel) => sel.select(".domain").remove())
      .call((sel) => sel.selectAll("line").attr("stroke", COLORS.cool))
      .call((sel) =>
        sel
          .selectAll("text")
          .attr("fill", COLORS.cool)
          .style("font-family", "var(--font-mono)")
          .style("font-size", "10px")
      );

    g.append("text")
      .attr("x", 0)
      .attr("y", -12)
      .attr("fill", COLORS.muted)
      .style("font-family", "var(--font-mono)")
      .style("font-size", "9.5px")
      .style("letter-spacing", "0.18em")
      .style("text-transform", "uppercase")
      .text("MONTHLY POSTS");

    g.append("text")
      .attr("x", innerW)
      .attr("y", -12)
      .attr("text-anchor", "end")
      .attr("fill", COLORS.cool)
      .style("font-family", "var(--font-mono)")
      .style("font-size", "9.5px")
      .style("letter-spacing", "0.18em")
      .style("text-transform", "uppercase")
      .text("ENGAGEMENT");

    // Brush
    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [innerW, innerH],
      ])
      .on("end", ({ selection, sourceEvent }) => {
        if (!sourceEvent) return; // ignore programmatic move
        const setDateRange = useDashboardStore.getState().setDateRange;
        if (!selection) {
          setDateRange(null);
          return;
        }
        const [x0, x1] = selection as [number, number];
        setDateRange([x.invert(x0), x.invert(x1)]);
      });

    const brushG = g.append("g").attr("class", "tl-brush").call(brush);
    brushG
      .selectAll(".selection")
      .attr("fill", COLORS.ink)
      .attr("fill-opacity", 0.08)
      .attr("stroke", COLORS.ink)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4 3")
      .attr("shape-rendering", "crispEdges");
    brushG.selectAll(".handle").attr("fill", COLORS.ink);

    brushRef.current = brush;
    brushGRef.current = brushG as d3.Selection<SVGGElement, unknown, null, undefined>;

    // Restore selection from store at first paint without triggering brushed.
    const initialRange = useDashboardStore.getState().dateRange;
    if (initialRange && brushGRef.current && brushRef.current && xScaleRef.current) {
      brushGRef.current.call(brushRef.current.move, [
        xScaleRef.current(initialRange[0]),
        xScaleRef.current(initialRange[1]),
      ]);
    }

    return () => {
      svg.selectAll("*").remove();
      brushRef.current = null;
      brushGRef.current = null;
      xScaleRef.current = null;
    };
  }, [rows, show, hide]);

  // Effect 2 — mirror external dateRange changes back onto the brush handle.
  // Runs only when dateRange changes (e.g. user clicked the Reset button).
  useEffect(() => {
    const brush = brushRef.current;
    const brushG = brushGRef.current;
    const x = xScaleRef.current;
    if (!brush || !brushG || !x) return;
    if (dateRange) {
      brushG.call(brush.move, [x(dateRange[0]), x(dateRange[1])]);
    } else {
      brushG.call(brush.move, null);
    }
  }, [dateRange]);

  if (!data || !rows.length) {
    return (
      <div className="h-full w-full animate-pulse bg-card/40 border border-border/30" />
    );
  }
  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label="Monthly diffusion timeline — drag to select a date window"
      className="w-full h-full"
    />
  );
}
