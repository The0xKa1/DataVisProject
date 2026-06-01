"use client";

import { useMemo } from "react";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PhrasesList() {
  const data = useDashboardStore((s) => s.data);
  const setSearch = useDashboardStore((s) => s.setSearch);
  const search = useDashboardStore((s) => s.search);

  const rows = useMemo(() => (data?.phrases ?? []).slice(0, 24), [data]);
  const max = useMemo(
    () => Math.max(1, ...rows.map((r) => r.count)),
    [rows]
  );

  if (!data) {
    return (
      <div className="space-y-1.5 p-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 bg-card/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground p-4">
        正在扫描话术模板...
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/30 overflow-y-auto h-full">
      {rows.map((p, i) => {
        const width = Math.max(4, (p.count / max) * 100);
        const hot = p.count / max > 0.65;
        const active = search === p.text;
        const idx = String(i + 1).padStart(2, "0");
        return (
          <li key={`${p.text}-${i}`}>
            <button
              type="button"
              onClick={() => setSearch(p.text)}
              className={cn(
                "group relative w-full text-left px-3 py-2 flex items-center gap-3 transition-colors duration-150",
                active
                  ? "bg-accent/10"
                  : "hover:bg-card/80",
              )}
            >
              <span
                className={cn(
                  "font-mono text-[10px] tabular-nums tracking-widest w-7 shrink-0",
                  hot ? "text-accent" : "text-muted-foreground/60"
                )}
              >
                {idx}
              </span>
              <p
                className={cn(
                  "flex-1 min-w-0 truncate font-mono text-xs leading-relaxed",
                  hot ? "text-foreground" : "text-foreground/80"
                )}
              >
                {p.text}
              </p>
              <span className="hidden md:inline font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <b className="text-foreground/90 font-medium">{fmt.format(p.count)}</b> 次命中 · {fmt.format(p.users)} 用户
              </span>
              <span className="absolute left-0 bottom-0 h-px bg-accent/70 transition-all duration-200 ease-out group-hover:bg-accent" style={{ width: `${width}%` }} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
