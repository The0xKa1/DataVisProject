"use client";

import { useMemo } from "react";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useFilteredEvents, useSelectedEvent } from "@/lib/store/selectors";
import { fmt, labelName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GraphNode } from "@/lib/charts/types";
import { TimelineMiniMap } from "./timeline-mini-map";

export function EvidenceCard() {
  const events = useFilteredEvents();
  const event = useSelectedEvent(events);
  const setSearch = useDashboardStore((s) => s.setSearch);
  const setSelected = useDashboardStore((s) => s.setSelected);
  const setAuditFocus = useDashboardStore((s) => s.setAuditFocus);
  const graphShard = useDashboardStore((s) => s.graphShard);
  const selectedActorId = useDashboardStore((s) => s.selectedActorId);
  const setSelectedActor = useDashboardStore((s) => s.setSelectedActor);
  const data = useDashboardStore((s) => s.data);

  // Compute participant actors connected to the selected event in the active graph.
  const participantActors = useMemo(() => {
    if (!event || !data) return [];
    const sourceGraph = graphShard?.graph ?? data.graph;
    const eventNodeId = `m:${event.id}`;
    const actorIds = new Set<string>();
    for (const edge of sourceGraph.edges) {
      if (edge.source === eventNodeId && edge.target.startsWith("u:")) {
        actorIds.add(edge.target);
      }
      if (edge.target === eventNodeId && edge.source.startsWith("u:")) {
        actorIds.add(edge.source);
      }
    }
    return sourceGraph.nodes
      .filter((n): n is GraphNode => n.kind === "actor" && actorIds.has(n.id))
      .slice(0, 12);
  }, [event, graphShard, data]);

  if (!events.length || !event) {
    return (
      <div className="border border-border/40 bg-card/40 p-6">
        <span className="block h-2 w-2 bg-accent mb-3" aria-hidden />
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground leading-relaxed">
          当前筛选下没有匹配证据。请清空搜索、切回全部标签，或重置时间窗。
        </p>
      </div>
    );
  }

  const tags = [
    ...(event.keywords ?? []),
    ...(event.tags ?? []),
  ].slice(0, 8);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(220px,300px)] gap-4 h-full">
      {/* Main evidence card */}
      <article className="border border-border/50 bg-card/70 p-5 md:p-6 flex flex-col">
        <header className="flex flex-wrap gap-2 mb-4">
          <Tag accent={event.label === "fake"}>
            {labelName(event.label)}
          </Tag>
          <Tag>{event.date}</Tag>
          <Tag>{event.shortId}</Tag>
          <Tag>用户 {event.user}</Tag>
        </header>

        <p className="font-sans text-sm md:text-base leading-relaxed text-foreground/95 line-clamp-6 md:line-clamp-none flex-1">
          {event.text}
        </p>

        {event.analysis && (
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-accent uppercase tracking-[0.2em]">
              事实核查 ·{" "}
            </span>
            {event.analysis}
          </p>
        )}

        <div className="mt-5 grid grid-cols-3 gap-px bg-border/30">
          <Stat label="评论" value={event.commentCount ?? 0} />
          <Stat label="转发" value={event.repostCount ?? 0} />
          <Stat label="点赞" value={event.likeCount ?? 0} />
        </div>

        {participantActors.length > 0 && (
          <div className="mt-4">
            <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-2">
              参与者
            </span>
            <div className="flex flex-wrap gap-1.5">
              {participantActors.map((actor) => {
                const active = selectedActorId === actor.id;
                return (
                  <button
                    key={actor.id}
                    type="button"
                    onClick={() => setSelectedActor(active ? null : actor.id)}
                    className={cn(
                      "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors duration-150",
                      active
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border/50 text-muted-foreground hover:border-accent/60 hover:text-accent"
                    )}
                  >
                    {actor.name ?? actor.id.replace(/^u:/, "").slice(0, 8)}
                    {actor.fakeShare != null && actor.fakeShare > 0.5 && (
                      <span className="ml-1.5 text-accent">●</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {tags.map((t, index) => (
              <button
                key={`${t}-${index}`}
                type="button"
                onClick={() => setSearch(t)}
                className="border border-border/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:border-accent hover:text-accent transition-colors duration-150"
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <div className="mt-auto pt-5">
          <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-1.5">
            时间线位置
          </span>
          <div className="h-12">
            <TimelineMiniMap eventId={event.id} />
          </div>
        </div>
      </article>

      {/* Sibling list */}
      <aside className="border border-border/30 bg-card/30 overflow-y-auto max-h-[460px]">
        {events.slice(0, 9).map((ev) => {
          const active = ev.id === event.id;
          return (
            <button
              key={ev.id}
              type="button"
              onClick={() => {
                setSelected(ev.id);
                setAuditFocus({ type: "event", eventId: ev.id });
              }}
              className={cn(
                "w-full text-left block border-b border-border/20 px-3 py-2.5 transition-colors duration-150",
                active ? "bg-accent/10" : "hover:bg-card/80"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-[0.2em]",
                    ev.label === "fake" ? "text-accent" : "text-foreground"
                  )}
                >
                  {labelName(ev.label)}
                </span>
                <time className="font-mono text-[9px] text-muted-foreground/70 tracking-[0.1em]">
                  {ev.date}
                </time>
              </div>
              <p className="font-mono text-[11px] text-foreground/70 line-clamp-2 leading-relaxed">
                {ev.text}
              </p>
            </button>
          );
        })}
      </aside>
    </div>
  );
}

function Tag({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em]",
        accent
          ? "bg-accent text-accent-foreground"
          : "border border-border/50 text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card p-3">
      <div className="font-[var(--font-bebas)] text-xl md:text-2xl leading-none tabular-nums text-foreground">
        {fmt.format(value)}
      </div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
