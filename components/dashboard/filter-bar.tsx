"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  useDashboardStore,
  type LabelFilter,
} from "@/lib/store/dashboard-store";
import { compactFmt } from "@/lib/format";

const labels: { id: LabelFilter; text: string }[] = [
  { id: "all", text: "全部" },
  { id: "fake", text: "虚假" },
  { id: "real", text: "真实" },
];

export function FilterBar() {
  const label = useDashboardStore((s) => s.label);
  const search = useDashboardStore((s) => s.search);
  const botHeavy = useDashboardStore((s) => s.botHeavy);
  const dateRange = useDashboardStore((s) => s.dateRange);
  const setLabel = useDashboardStore((s) => s.setLabel);
  const setSearch = useDashboardStore((s) => s.setSearch);
  const setBotHeavy = useDashboardStore((s) => s.setBotHeavy);
  const setDateRange = useDashboardStore((s) => s.setDateRange);
  const data = useDashboardStore((s) => s.data);

  // Local debounced search input so each keystroke doesn't trigger a full
  // re-filter on every chart.
  const [draft, setDraft] = useState(search);
  useEffect(() => setDraft(search), [search]);
  useEffect(() => {
    const id = setTimeout(() => {
      if (draft !== search) setSearch(draft);
    }, 220);
    return () => clearTimeout(id);
  }, [draft, search, setSearch]);

  const total = data?.events.length ?? 0;
  const dateText = dateRange
    ? `${formatShort(dateRange[0])} → ${formatShort(dateRange[1])}`
    : data
    ? `${data.stats.dateStart?.slice(0, 7) ?? "—"} → ${data.stats.dateEnd?.slice(0, 7) ?? "—"}`
    : "—";

  return (
    <div
      id="filter-bar"
      className="sticky top-0 z-40 border-y border-border/40 bg-background/85 backdrop-blur-md"
    >
      <div className="relative pl-6 md:pl-28 pr-6 md:pr-12 py-4">
        <div className="flex flex-wrap items-center gap-4 md:gap-6">
          {/* Eyebrow */}
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 bg-accent" aria-hidden />
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              筛选
            </span>
          </div>

          {/* Segmented label filter */}
          <div className="flex border border-border">
            {labels.map(({ id, text }) => (
              <button
                key={id}
                type="button"
                onClick={() => setLabel(id)}
                className={cn(
                  "relative border-r border-border px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] uppercase transition-colors duration-150 last:border-r-0",
                  label === id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {text}
              </button>
            ))}
          </div>

          {/* Bot-heavy switch */}
          <label className="flex items-center gap-2 border border-border px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <input
              type="checkbox"
              className="h-3 w-3 accent-[var(--accent)]"
              checked={botHeavy}
              onChange={(e) => setBotHeavy(e.target.checked)}
            />
            水军占比高
          </label>

          {/* Search */}
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="搜索关键词 / 话术"
            className="min-w-0 flex-1 max-w-md border border-border bg-card/60 px-3 py-1.5 font-mono text-[11px] tracking-[0.08em] uppercase text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />

          {/* Reset window */}
          {dateRange && (
            <button
              type="button"
              onClick={() => setDateRange(null)}
              className="border border-border px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground hover:border-accent hover:text-accent transition-colors"
            >
              重置窗口
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
          <span>
            <b className="text-foreground font-medium">{compactFmt.format(total)}</b> 条实例
          </span>
          <span>
            时间窗 <b className="text-foreground font-medium">{dateText}</b>
          </span>
          <span className="hidden md:inline">
            探索式 · 代理信号 · 非指控
          </span>
        </div>
      </div>
    </div>
  );
}

function formatShort(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
