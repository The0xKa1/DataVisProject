"use client";

import { useEffect, useMemo } from "react";
import { NetworkGraph } from "@/components/charts/network-graph";
import { EvidenceCard } from "@/components/charts/evidence-card";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useSelectedBurst, useSelectedGraphIndex } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";
import { compactFmt, fmt, labelName } from "@/lib/format";
import type { BurstWindow, CoordinationSummary, GraphShard, HubActor, TemplateSignal } from "@/lib/charts/types";

function parseMonthStart(month: string): Date | null {
  const [year, monthNo] = month.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(monthNo)) return null;
  return new Date(year, monthNo - 1, 1);
}

function parseMonthEnd(month: string): Date | null {
  const start = parseMonthStart(month);
  if (!start) return null;
  return new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
}

function pickBurstEventId(burst: BurstWindow, coordination: CoordinationSummary | undefined): string | null {
  const ids = new Set(burst.eventIds);
  const rich = coordination?.eventGraphIndex
    ?.filter((entry) => ids.has(entry.eventId) && entry.shard)
    .sort((a, b) => (b.cascadeEdges - a.cascadeEdges) || (b.participantCount - a.participantCount));
  return rich?.[0]?.eventId ?? burst.eventIds[0] ?? null;
}

export function AnalystConsoleSection() {
  const data = useDashboardStore((s) => s.data);
  const selectedId = useDashboardStore((s) => s.selectedId);
  const selectedBurstId = useDashboardStore((s) => s.selectedBurstId);
  const graphShard = useDashboardStore((s) => s.graphShard);
  const graphShardStatus = useDashboardStore((s) => s.graphShardStatus);
  const graphShardError = useDashboardStore((s) => s.graphShardError);
  const setSelected = useDashboardStore((s) => s.setSelected);
  const setSelectedBurst = useDashboardStore((s) => s.setSelectedBurst);
  const setSelectedHub = useDashboardStore((s) => s.setSelectedHub);
  const setDateRange = useDashboardStore((s) => s.setDateRange);
  const setSearch = useDashboardStore((s) => s.setSearch);
  const setGraphShard = useDashboardStore((s) => s.setGraphShard);
  const setGraphShardLoading = useDashboardStore((s) => s.setGraphShardLoading);
  const setGraphShardError = useDashboardStore((s) => s.setGraphShardError);

  const coordination = data?.coordination;
  const selectedBurst = useSelectedBurst();
  const graphIndex = useSelectedGraphIndex();

  useEffect(() => {
    const firstBurst = data?.coordination?.burstWindows?.[0];
    const currentCoordination = data?.coordination;
    if (!firstBurst || !currentCoordination) return;
    if (!selectedBurstId) setSelectedBurst(firstBurst.id);
    if (!selectedId) setSelected(pickBurstEventId(firstBurst, currentCoordination));
  }, [data, selectedBurstId, selectedId, setSelectedBurst, setSelected]);

  const inlineShard = useMemo(() => {
    if (!graphIndex || !coordination?.caseGraphs?.length) return null;
    return coordination.caseGraphs.find((shard) => shard.eventId === graphIndex.eventId) ?? null;
  }, [coordination, graphIndex]);

  useEffect(() => {
    if (!graphIndex) {
      setGraphShard(null);
      return;
    }
    if (inlineShard) {
      setGraphShard(inlineShard);
      return;
    }
    if (!graphIndex.shard) {
      setGraphShard(null);
      return;
    }

    const controller = new AbortController();
    setGraphShardLoading();
    fetch(`/data/${graphIndex.shard}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Shard ${response.status}`);
        return response.json() as Promise<GraphShard>;
      })
      .then((shard) => setGraphShard(shard))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setGraphShardError(error instanceof Error ? error.message : "Graph shard failed");
      });
    return () => controller.abort();
  }, [graphIndex, inlineShard, setGraphShard, setGraphShardError, setGraphShardLoading]);

  const emptyShard = useMemo<GraphShard | null>(() => {
    if (!graphIndex) return null;
    return {
      eventId: graphIndex.eventId,
      shortId: graphIndex.shortId,
      graph: { nodes: [], edges: [] },
      visibleNodes: 0,
      visibleEdges: 0,
      omittedNodes: graphIndex.participantCount,
      omittedEdges: graphIndex.cascadeEdges,
      selectionRule: graphIndex.shard ? "Shard unavailable" : "No bounded shard was generated for this event",
    };
  }, [graphIndex]);

  if (!data || !coordination) {
    return null;
  }

  const selectedEvent = graphIndex
    ? data.events.find((event) => event.id === graphIndex.eventId)
    : null;
  const graphForRender = graphShard ?? inlineShard ?? emptyShard;

  return (
    <section id="analyst-console" className="relative pl-6 md:pl-28 pr-6 md:pr-12 py-24 md:py-28">
      <header className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
            03 / Analyst Console
          </span>
          <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">
            FULL-COVERAGE AUDIT
          </h2>
        </div>
        <p className="max-w-lg font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground leading-relaxed md:text-right">
          All {fmt.format(coordination.summary.eventCount ?? data.events.length)} MisBot instances drive the
          rankings. The network renders bounded shards and discloses omitted topology.
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
        <Panel className="xl:col-span-3" eyebrow="Burst windows" title="Abnormal windows">
          <BurstList
            bursts={coordination.burstWindows}
            selected={selectedBurst}
            onSelect={(burst) => {
              const start = parseMonthStart(burst.startMonth);
              const end = parseMonthEnd(burst.endMonth);
              setSelectedBurst(burst.id);
              if (start && end) setDateRange([start, end]);
              setSearch("");
              setSelected(pickBurstEventId(burst, coordination));
            }}
          />
        </Panel>

        <Panel
          className="xl:col-span-6 min-h-[620px]"
          eyebrow="Propagation shard"
          title={selectedEvent ? `${labelName(selectedEvent.label)} ${selectedEvent.shortId}` : "Shard loading"}
          aside={graphIndex ? `${compactFmt.format(graphIndex.participantCount)} participants - ${compactFmt.format(graphIndex.cascadeEdges)} cascade edges` : undefined}
        >
          <div className="relative h-[520px] border border-border/30 bg-background/40">
            <NetworkGraph shard={graphForRender} />
            {graphShardStatus === "loading" && (
              <OverlayText>Loading graph shard ...</OverlayText>
            )}
            {graphShardStatus === "error" && (
              <OverlayText>{graphShardError ?? "Graph shard failed"}</OverlayText>
            )}
          </div>
          {graphForRender && (
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground leading-relaxed">
              {graphForRender.selectionRule}. Visible {fmt.format(graphForRender.visibleNodes)} nodes and{" "}
              {fmt.format(graphForRender.visibleEdges)} edges; omitted {fmt.format(graphForRender.omittedNodes)} nodes and{" "}
              {fmt.format(graphForRender.omittedEdges)} edges.
            </p>
          )}
        </Panel>

        <div className="xl:col-span-3 grid grid-cols-1 gap-4 md:gap-5">
          <Panel eyebrow="Hub candidates" title="Proxy-ranked amplifiers">
            <HubList
              hubs={coordination.hubActors}
              onSelect={(hub) => {
                setSelectedHub(hub.user);
                if (hub.topEventIds[0]) setSelected(hub.topEventIds[0]);
              }}
            />
          </Panel>
          <Panel eyebrow="Templates" title="Repeated phrasing">
            <TemplateList
              templates={coordination.templateSignals}
              onSelect={(template) => {
                setSearch(template.text);
                if (template.eventIds[0]) setSelected(template.eventIds[0]);
              }}
            />
          </Panel>
        </div>

        <Panel className="xl:col-span-12" eyebrow="Evidence" title="Anonymized close read">
          <EvidenceCard />
        </Panel>
      </div>
    </section>
  );
}

function Panel({
  eyebrow,
  title,
  aside,
  className,
  children,
}: {
  eyebrow: string;
  title: string;
  aside?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article className={cn("border border-border/40 bg-card/30 p-4 md:p-5 min-w-0", className)}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
            {eyebrow}
          </div>
          <h3 className="mt-1.5 font-[var(--font-bebas)] text-3xl leading-none tracking-tight">
            {title}
          </h3>
        </div>
        {aside && (
          <span className="hidden md:block max-w-[24ch] text-right font-mono text-[10px] uppercase tracking-[0.16em] leading-relaxed text-muted-foreground">
            {aside}
          </span>
        )}
      </header>
      {children}
    </article>
  );
}

function BurstList({
  bursts,
  selected,
  onSelect,
}: {
  bursts: BurstWindow[];
  selected: BurstWindow | null;
  onSelect: (burst: BurstWindow) => void;
}) {
  return (
    <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
      {bursts.slice(0, 10).map((burst, index) => {
        const active = selected?.id === burst.id;
        return (
          <button
            key={burst.id}
            type="button"
            onClick={() => onSelect(burst)}
            className={cn(
              "w-full border px-3 py-3 text-left transition-colors duration-150",
              active ? "border-accent bg-accent/10" : "border-border/40 hover:border-accent/60 hover:bg-card/60",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                {String(index + 1).padStart(2, "0")} - {burst.peakMonth}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {(burst.botShare * 100).toFixed(1)}% proxy bot
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-px bg-border/30">
              <MiniStat label="fake" value={compactFmt.format(burst.fake)} hot />
              <MiniStat label="real" value={compactFmt.format(burst.real)} />
              <MiniStat label="engage" value={compactFmt.format(burst.engagement)} />
            </div>
            <p className="mt-3 line-clamp-2 font-mono text-[10px] uppercase tracking-[0.14em] leading-relaxed text-muted-foreground">
              {burst.topKeywords.join(" / ") || "No keyword summary"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function HubList({ hubs, onSelect }: { hubs: HubActor[]; onSelect: (hub: HubActor) => void }) {
  return (
    <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
      {hubs.slice(0, 10).map((hub, index) => (
        <button
          key={hub.user}
          type="button"
          onClick={() => onSelect(hub)}
          className="w-full border border-border/30 px-3 py-2 text-left transition-colors duration-150 hover:border-accent/60 hover:bg-card/60"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {String(index + 1).padStart(2, "0")} - {hub.user}
            </span>
            <span className="font-mono text-[10px] text-accent">{hub.score.toFixed(1)}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <span>{fmt.format(hub.eventCount)} events</span>
            <span>{(hub.fakeShare * 100).toFixed(1)}% fake-heavy</span>
            <span>{hub.botLabel ?? "unknown"} proxy</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function TemplateList({
  templates,
  onSelect,
}: {
  templates: TemplateSignal[];
  onSelect: (template: TemplateSignal) => void;
}) {
  return (
    <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
      {templates.slice(0, 10).map((template, index) => (
        <button
          key={template.id}
          type="button"
          onClick={() => onSelect(template)}
          className="w-full border border-border/30 px-3 py-2 text-left transition-colors duration-150 hover:border-accent/60 hover:bg-card/60"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {String(index + 1).padStart(2, "0")} - {fmt.format(template.count)} hits
            </span>
            <span className="font-mono text-[10px] text-accent">
              {((template.botShare ?? 0) * 100).toFixed(1)}%
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 font-mono text-[11px] leading-relaxed text-foreground/80">
            {template.text}
          </p>
        </button>
      ))}
    </div>
  );
}

function MiniStat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <span className="bg-card px-2 py-1.5">
      <b className={cn("block font-mono text-xs tabular-nums", hot ? "text-accent" : "text-foreground")}>
        {value}
      </b>
      <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </span>
  );
}

function OverlayText({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[1px]">
      <span className="border border-border/50 bg-card/80 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {children}
      </span>
    </div>
  );
}
