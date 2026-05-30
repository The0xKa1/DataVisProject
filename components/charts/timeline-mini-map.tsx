"use client";

import { useMemo } from "react";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { COLORS } from "@/lib/charts/colors";

interface TimelineMiniMapProps {
  eventId: string | null;
}

export function TimelineMiniMap({ eventId }: TimelineMiniMapProps) {
  const data = useDashboardStore((s) => s.data);
  const dateRange = useDashboardStore((s) => s.dateRange);

  const bars = useMemo(() => {
    if (!data?.timeline?.length) return null;
    const rows = data.timeline;
    const maxVal = Math.max(1, ...rows.map((r) => r.fake + r.real));
    return { rows, maxVal };
  }, [data]);

  const eventMonth = useMemo(() => {
    if (!eventId || !data) return null;
    const ev = data.events.find((e) => e.id === eventId);
    if (!ev?.month) return null;
    const idx = data.timeline.findIndex((r) => r.month === ev.month);
    return idx >= 0 ? { month: ev.month, index: idx } : null;
  }, [eventId, data]);

  if (!bars || bars.rows.length === 0) return null;

  const W = 220;
  const H = 48;
  const PAD = 2;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const n = bars.rows.length;
  const barW = Math.max(1, innerW / n);
  const gap = Math.max(0.5, barW * 0.15);
  const drawW = barW - gap;

  // Parse dateRange into pixel range
  let brushStart: number | null = null;
  let brushEnd: number | null = null;
  if (dateRange) {
    const months = bars.rows.map((r) => new Date(`${r.month}-01`).getTime());
    const rangeStart = dateRange[0].getTime();
    const rangeEnd = dateRange[1].getTime();
    const first = months[0];
    const last = months[months.length - 1];
    const span = last - first || 1;
    brushStart = PAD + ((rangeStart - first) / span) * innerW;
    brushEnd = PAD + ((rangeEnd - first) / span) * innerW;
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full"
      role="img"
      aria-label="Timeline mini-map"
    >
      {/* Brush range indicator */}
      {brushStart != null && brushEnd != null && (
        <rect
          x={brushStart}
          y={PAD}
          width={brushEnd - brushStart}
          height={innerH}
          fill={COLORS.ink}
          fillOpacity={0.12}
          rx={1}
        />
      )}

      {/* Monthly bars */}
      {bars.rows.map((row, i) => {
        const x = PAD + i * barW;
        const fakeH = (row.fake / bars.maxVal) * innerH;
        const realH = ((row.fake + row.real) / bars.maxVal) * innerH;
        return (
          <g key={row.month}>
            <rect
              x={x}
              y={PAD + innerH - realH}
              width={drawW}
              height={realH}
              fill={COLORS.ink}
              fillOpacity={0.5}
              rx={0.5}
            />
            <rect
              x={x}
              y={PAD + innerH - fakeH}
              width={drawW}
              height={fakeH}
              fill={COLORS.hot}
              fillOpacity={0.7}
              rx={0.5}
            />
          </g>
        );
      })}

      {/* Selected event marker */}
      {eventMonth && (
        <line
          x1={PAD + eventMonth.index * barW + barW / 2}
          y1={PAD}
          x2={PAD + eventMonth.index * barW + barW / 2}
          y2={PAD + innerH}
          stroke={COLORS.hot}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
