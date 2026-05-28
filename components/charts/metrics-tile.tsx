"use client";

import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useFilteredEvents } from "@/lib/store/selectors";
import { compactFmt, labelName } from "@/lib/format";

const formatTickDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

interface Metric {
  num: string;
  label: string;
  value: string;
  sub: string;
  hot?: boolean;
}

export function MetricsTile() {
  const data = useDashboardStore((s) => s.data);
  const label = useDashboardStore((s) => s.label);
  const dateRange = useDashboardStore((s) => s.dateRange);
  const events = useFilteredEvents();

  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border/40">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card p-4 md:p-5 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  const { stats } = data;
  const fakeRatio = stats.microblogs
    ? ((stats.fake / stats.microblogs) * 100).toFixed(1)
    : "0.0";
  const windowText = dateRange
    ? `${formatTickDate(dateRange[0])} → ${formatTickDate(dateRange[1])}`
    : "ALL MONTHS";

  const metrics: Metric[] = [
    {
      num: "01",
      label: "MICROBLOGS",
      value: compactFmt.format(stats.microblogs),
      sub: `${fakeRatio}% FAKE-LABELED`,
      hot: true,
    },
    {
      num: "02",
      label: "ACTORS",
      value: compactFmt.format(stats.actors),
      sub: "HASHED IDS ONLY",
    },
    {
      num: "03",
      label: "COMMENTS",
      value: compactFmt.format(stats.comments),
      sub: "PROPAGATION EVIDENCE",
    },
    {
      num: "04",
      label: "REPOSTS",
      value: compactFmt.format(stats.reposts),
      sub: "DIFFUSION EDGES",
    },
    {
      num: "05",
      label: "CASE WINDOW",
      value: windowText,
      sub: `${labelName(label)} · ${events.length} SAMPLES`,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border/40 border border-border/40">
      {metrics.map((m) => (
        <div
          key={m.num}
          className={`relative bg-card p-4 md:p-5 ${
            m.hot ? "shadow-[inset_0_-3px_0_var(--accent)]" : ""
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[10px] font-medium text-accent tracking-[0.3em]">
              {m.num}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {m.label}
            </span>
          </div>
          <strong
            className="block font-[var(--font-bebas)] text-3xl md:text-5xl leading-none tracking-tight tabular-nums break-words"
            style={{ fontWeight: 400 }}
          >
            {m.value}
          </strong>
          <span className="mt-3 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {m.sub}
          </span>
        </div>
      ))}
    </div>
  );
}
