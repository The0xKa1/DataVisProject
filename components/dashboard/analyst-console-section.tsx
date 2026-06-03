"use client";

import { useEffect, useMemo } from "react";
import { PropagationSpace } from "@/components/charts/propagation-space";
import { SemanticFocusGraph } from "@/components/charts/semantic-focus-graph";
import { EvidenceCard } from "@/components/charts/evidence-card";
import { useDashboardStore, type AuditFocus } from "@/lib/store/dashboard-store";
import { useSelectedBurst, useSelectedGraphIndex } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";
import { actorLabelName, compactFmt, fmt, labelName, selectionRuleName } from "@/lib/format";
import type { BurstWindow, CoordinationSummary, EventGraphIndex, EventItem, GraphEdge, GraphNode, GraphShard, HubActor, TemplateSignal } from "@/lib/charts/types";
import {
  buildBurstFocusGraph,
  buildHubFocusGraph,
  buildTemplateFocusGraph,
  rankEventIds,
} from "@/lib/charts/audit-focus-graph";



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

function pickGraphEventId(eventIds: string[] | undefined, coordination?: CoordinationSummary): string | null {
  return rankEventIds(eventIds, coordination?.eventGraphIndex ?? [], 1)[0] ?? eventIds?.[0] ?? null;
}

function pickBurstEventId(burst: BurstWindow, coordination?: CoordinationSummary): string | null {
  return pickGraphEventId(burst.eventIds, coordination);
}

function buildAutoGraphShard(graphIndex: EventGraphIndex, event: EventItem | null): GraphShard {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const eventNodeId = `m:${graphIndex.eventId}`;
  const directInteractions =
    (event?.repostCount ?? graphIndex.repostEdges ?? 0) +
    (event?.commentCount ?? graphIndex.commentEdges ?? 0) +
    (event?.attitudeCount ?? 0);
  const eventWeight = Math.max(1, event?.score ?? directInteractions);

  nodes.push({
    id: eventNodeId,
    kind: "microblog",
    label: graphIndex.label,
    sourceType: graphIndex.sourceType,
    name: graphIndex.shortId,
    text: event?.text ?? "",
    weight: eventWeight,
    botShare: graphIndex.botShare,
  });

  function addActorNode(
    suffix: string,
    name: string,
    weight: number,
    fakeShare: number,
    botLabel: GraphNode["botLabel"] = "unknown",
    botScore = 0,
  ): string | null {
    if (weight <= 0) return null;
    const id = `u:auto-${suffix}-${graphIndex.shortId}`;
    nodes.push({
      id,
      kind: "actor",
      name,
      weight: Math.max(1, weight),
      botLabel,
      botScore,
      labelSource: "aggregate",
      botShare: botScore,
      fakeShare,
    });
    return id;
  }

  function addEdge(source: string | null, target: string | null, type: GraphEdge["type"]) {
    if (!source || !target || source === target) return;
    edges.push({ source, target, type });
  }

  const fakeShare = graphIndex.label === "fake" ? 1 : 0;
  const knownBots = event?.botUserCount ?? Math.round(graphIndex.knownUserCount * graphIndex.botShare);
  const knownHumans = event?.humanUserCount ?? Math.max(0, graphIndex.knownUserCount - knownBots);
  const unknownUsers = event?.unknownUserCount ?? Math.max(0, graphIndex.participantCount - graphIndex.knownUserCount);

  const repostNode = addActorNode("repost", "转发参与者", event?.repostCount ?? graphIndex.repostEdges, fakeShare);
  const commentNode = addActorNode("comment", "评论参与者", event?.commentCount ?? graphIndex.commentEdges, fakeShare);
  const attitudeNode = addActorNode("attitude", "态度反馈参与者", event?.attitudeCount ?? 0, fakeShare);
  const botNode = addActorNode("known-bots", "已知代理水军", knownBots, fakeShare, "bot", graphIndex.botShare);
  const humanNode = addActorNode("known-humans", "已知真人", knownHumans, fakeShare, "human", 0);
  const unknownNode = addActorNode("unknown-users", "未知用户", unknownUsers, fakeShare, "unknown", 0);

  addEdge(repostNode, eventNodeId, "repost");
  addEdge(commentNode, eventNodeId, "comment");
  addEdge(attitudeNode, eventNodeId, "attitude");
  addEdge(botNode, eventNodeId, "repost");
  addEdge(humanNode, eventNodeId, "comment");
  addEdge(unknownNode, eventNodeId, "attitude");

  const cascadeLevels = Math.min(8, Math.max(0, graphIndex.cascadeDepth));
  let previous: string | null = eventNodeId;
  for (let level = 1; level <= cascadeLevels; level += 1) {
    const remaining = Math.max(1, Math.round((graphIndex.cascadeEdges || directInteractions || 1) / (level + 1)));
    const layerNode = addActorNode(`cascade-l${level}`, `级联深度 ${level}`, remaining, fakeShare);
    addEdge(layerNode, previous, "repostCascade");
    previous = layerNode;
  }

  if (nodes.length === 1) {
    const summaryNode = addActorNode("summary", "聚合参与者", graphIndex.participantCount, fakeShare);
    addEdge(summaryNode, eventNodeId, "attitude");
  }

  const omittedNodes = Math.max(0, graphIndex.participantCount + 1 - nodes.length);
  const possibleEdges =
    graphIndex.repostEdges +
    graphIndex.commentEdges +
    Math.max(0, event?.attitudeCount ?? 0);
  const omittedEdges = Math.max(0, possibleEdges - edges.length);

  return {
    eventId: graphIndex.eventId,
    shortId: graphIndex.shortId,
    graph: { nodes, edges },
    visibleNodes: nodes.length,
    visibleEdges: edges.length,
    omittedNodes,
    omittedEdges,
    selectionRule: "auto-computed aggregate propagation sketch from event-level counts; raw participant edges were not embedded",
  };
}

export function AnalystConsoleSection() {
  const data = useDashboardStore((s) => s.data);
  const selectedId = useDashboardStore((s) => s.selectedId);
  const selectedBurstId = useDashboardStore((s) => s.selectedBurstId);
  const auditFocus = useDashboardStore((s) => s.auditFocus);
  const graphShard = useDashboardStore((s) => s.graphShard);
  const graphShardStatus = useDashboardStore((s) => s.graphShardStatus);
  const graphShardError = useDashboardStore((s) => s.graphShardError);
  const setSelected = useDashboardStore((s) => s.setSelected);
  const setSelectedBurst = useDashboardStore((s) => s.setSelectedBurst);
  const setSelectedHub = useDashboardStore((s) => s.setSelectedHub);
  const setSelectedActor = useDashboardStore((s) => s.setSelectedActor);
  const setDateRange = useDashboardStore((s) => s.setDateRange);
  const setSearch = useDashboardStore((s) => s.setSearch);
  const setAuditFocus = useDashboardStore((s) => s.setAuditFocus);
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
    if (!selectedId) {
      const eventId = pickBurstEventId(firstBurst, currentCoordination);
      setSelected(eventId);
      setAuditFocus({ type: "burst", burstId: firstBurst.id, eventId });
    }
  }, [data, selectedBurstId, selectedId, setAuditFocus, setSelectedBurst, setSelected]);

  const templateSignals = useMemo<TemplateSignal[]>(() => {
    if (coordination?.templateSignals?.length) return coordination.templateSignals;
    return (data?.phrases ?? []).map((phrase, index) => ({
      id: `phrase-fallback-${index}`,
      text: phrase.text,
      count: phrase.count,
      users: phrase.users,
      botUsers: phrase.botUsers,
      botShare: phrase.botShare,
      eventIds: [],
    }));
  }, [coordination?.templateSignals, data?.phrases]);

  useEffect(() => {
    if (auditFocus.type !== "event") {
      setGraphShard(null);
      return;
    }
    if (!graphIndex) {
      setGraphShard(null);
      return;
    }
    const controller = new AbortController();
    const graphUrl = graphIndex.fullGraph
      ? `/data/${graphIndex.fullGraph}`
      : `/api/misbot/event-graph/${graphIndex.eventId}`;
    setGraphShardLoading();
    fetch(graphUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`完整图 ${response.status}`);
        return response.json() as Promise<GraphShard>;
      })
      .then((graph) => setGraphShard(graph))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setGraphShardError(error instanceof Error ? error.message : "完整图加载失败");
      });
    return () => controller.abort();
  }, [auditFocus.type, graphIndex, setGraphShard, setGraphShardError, setGraphShardLoading]);

  const emptyShard = useMemo<GraphShard | null>(() => {
    if (!graphIndex) return null;
    const event = data?.events.find((item) => item.id === graphIndex.eventId) ?? null;
    return buildAutoGraphShard(graphIndex, event);
  }, [data?.events, graphIndex]);

  const semanticShard = useMemo<GraphShard | null>(() => {
    if (!data || !coordination || auditFocus.type === "event") return null;
    if (auditFocus.type === "burst") {
      const burst = coordination.burstWindows.find((item) => item.id === auditFocus.burstId);
      return burst ? buildBurstFocusGraph(data, burst) : null;
    }
    if (auditFocus.type === "hub") {
      const hub = coordination.hubActors.find((item) => item.user === auditFocus.hubId);
      return hub ? buildHubFocusGraph(data, hub) : null;
    }
    const template = templateSignals.find((item) => item.id === auditFocus.templateId);
    return template ? buildTemplateFocusGraph(data, template) : null;
  }, [auditFocus, coordination, data, templateSignals]);

  if (!data || !coordination) {
    return null;
  }

  const selectedEvent = graphIndex
    ? data.events.find((event) => event.id === graphIndex.eventId)
    : null;
  const selectedEventOrNull = selectedEvent ?? null;
  const graphForRender = auditFocus.type === "event"
    ? graphShard ?? emptyShard
    : semanticShard ?? emptyShard;
  const graphTitle = graphPanelTitle(auditFocus, coordination, templateSignals, selectedEventOrNull);
  const graphAside = auditFocus.type === "event" && graphIndex
    ? `${compactFmt.format(graphIndex.participantCount)} 名参与者 - ${compactFmt.format(graphIndex.cascadeEdges)} 条级联边`
    : graphForRender
      ? `${compactFmt.format(graphForRender.visibleNodes)} 节点 - ${compactFmt.format(graphForRender.visibleEdges)} 条语义边`
      : undefined;


  return (
    <section id="analyst-console" className="relative pl-6 md:pl-28 pr-6 md:pr-12 py-24 md:py-28">
      <header className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
            03 / 分析台
          </span>
          <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">
            全覆盖审计
          </h2>
        </div>
        <p className="max-w-lg font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground leading-relaxed md:text-right">
          全部 {fmt.format(coordination.summary.eventCount ?? data.events.length)} 条 MisBot 实例共同驱动排序。
          {fmt.format(coordination.summary.fullGraphCount ?? 0)} 个优先案例与近期待审事件使用预计算完整图；
          更早的选择会在本地原始记录可用时按需计算。
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5">
        <Panel className="xl:col-span-3" eyebrow="突发窗口" title="异常时间窗">
          <BurstList
            bursts={coordination.burstWindows}
            selected={selectedBurst}
            onSelect={(burst) => {
              const start = parseMonthStart(burst.startMonth);
              const end = parseMonthEnd(burst.endMonth);
              const eventId = pickBurstEventId(burst, coordination);
              setSelectedBurst(burst.id);
              setSelectedActor(null);
              if (start && end) setDateRange([start, end]);
              setSearch("");
              setSelected(eventId);
              setAuditFocus({ type: "burst", burstId: burst.id, eventId });
            }}
          />
        </Panel>

        <Panel
          className="xl:col-span-6 min-h-[620px]"
          eyebrow={auditFocus.type === "event" ? "传播图" : "聚合图"}
          title={graphTitle}
          aside={graphAside}
        >
          <FocusBridge
            focus={auditFocus}
            data={data}
            coordination={coordination}
            templates={templateSignals}
            onOpenEvent={(eventId) => {
              setSelectedActor(null);
              setSelected(eventId);
              setAuditFocus({ type: "event", eventId });
            }}
          />
          <div className="relative h-[520px] border border-border/30 bg-background/40">
            {graphForRender && (
              auditFocus.type === "event" ? (
                <PropagationSpace shard={graphForRender} />
              ) : (
                <SemanticFocusGraph shard={graphForRender} />
              )
            )}
            {auditFocus.type === "event" && graphShardStatus === "loading" && (
              <OverlayText>正在计算完整图...</OverlayText>
            )}
            {auditFocus.type === "event" && graphShardStatus === "error" && (
              <OverlayText>{graphShardError ?? "完整图加载失败"}</OverlayText>
            )}
          </div>
          {graphForRender && (
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground leading-relaxed">
              {auditFocus.type === "event"
                ? "单事件使用 3D 传播空间渲染完整图，可全屏、旋转、缩放、拖拽节点并点击账号高亮一跳邻域。"
                : "当前为 2D 力导向聚合图：先解释所选窗口、放大者或话术模板，再点击图中的微博事件节点进入单事件 3D 传播图。"}
              {selectionRuleName(graphForRender.selectionRule)}。可见 {fmt.format(graphForRender.visibleNodes)} 个节点和{" "}
              {fmt.format(graphForRender.visibleEdges)} 条边；省略 {fmt.format(graphForRender.omittedNodes)} 个节点和{" "}
              {fmt.format(graphForRender.omittedEdges)} 条边。
            </p>
          )}
        </Panel>

        <div className="xl:col-span-3 grid grid-cols-1 gap-4 md:gap-5">
          <Panel eyebrow="枢纽候选" title="按代理信号排序的放大者">
            <HubList
              hubs={coordination.hubActors}
              onSelect={(hub) => {
                const eventId = pickGraphEventId(hub.topEventIds, coordination);
                setSelectedHub(hub.user);
                setSelectedActor(`u:${hub.user}`);
                setSelected(eventId);
                setAuditFocus({ type: "hub", hubId: hub.user, eventId });
              }}
            />
          </Panel>
          <Panel eyebrow="话术模板" title="重复话术">
            <TemplateList
              templates={templateSignals}
              onSelect={(template) => {
                setSelectedActor(null);
                setSearch(template.text);
                const selectedTemplateEvent = pickGraphEventId(template.eventIds, coordination);
                if (selectedTemplateEvent) setSelected(selectedTemplateEvent);
                setAuditFocus({ type: "template", templateId: template.id, eventId: selectedTemplateEvent });
              }}
            />
          </Panel>
        </div>

        <Panel className="xl:col-span-12" eyebrow="证据" title="匿名细读">
          <EvidenceCard />
        </Panel>
      </div>
    </section>
  );
}

function graphPanelTitle(
  focus: AuditFocus,
  coordination: CoordinationSummary,
  templates: TemplateSignal[],
  selectedEvent: EventItem | null,
) {
  if (focus.type === "burst") {
    const burst = coordination.burstWindows.find((item) => item.id === focus.burstId);
    return burst ? `异常窗口 ${burst.peakMonth}` : "异常窗口";
  }
  if (focus.type === "hub") return `放大者 ${focus.hubId}`;
  if (focus.type === "template") {
    const template = templates.find((item) => item.id === focus.templateId);
    const text = template?.text?.trim();
    return text ? `话术 ${text.slice(0, 10)}` : "话术模板";
  }
  return selectedEvent ? `${labelName(selectedEvent.label)} ${selectedEvent.shortId}` : "图加载中";
}

function FocusBridge({
  focus,
  data,
  coordination,
  templates,
  onOpenEvent,
}: {
  focus: AuditFocus;
  data: { events: EventItem[] };
  coordination: CoordinationSummary;
  templates: TemplateSignal[];
  onOpenEvent: (eventId: string) => void;
}) {
  const meta = focusMeta(focus, data.events, coordination, templates);
  if (!meta) return null;

  return (
    <div className="mb-3 border border-border/35 bg-background/45 px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-muted-foreground">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <span>
          <span className="text-accent">{meta.label}</span>
          {" · "}
          {meta.detail}
        </span>
        {meta.eventId && focus.type !== "event" && (
          <button
            type="button"
            onClick={() => onOpenEvent(meta.eventId!)}
            className="w-fit border border-accent/50 px-2 py-1 text-foreground transition hover:bg-accent hover:text-background"
          >
            打开单事件 3D 图
          </button>
        )}
      </div>
    </div>
  );
}

function focusMeta(
  focus: AuditFocus,
  events: EventItem[],
  coordination: CoordinationSummary,
  templates: TemplateSignal[],
): { label: string; detail: string; eventId: string | null } | null {
  if (focus.type === "burst") {
    const burst = coordination.burstWindows.find((item) => item.id === focus.burstId);
    if (!burst) return null;
    const event = focus.eventId ? events.find((item) => item.id === focus.eventId) : null;
    return {
      label: "窗口聚合图",
      detail: `${burst.startMonth} -> ${burst.endMonth}，展示代表事件与共享参与者候选${event ? `；代表事件 ${event.shortId}` : ""}`,
      eventId: focus.eventId,
    };
  }
  if (focus.type === "hub") {
    const hub = coordination.hubActors.find((item) => item.user === focus.hubId);
    if (!hub) return null;
    return {
      label: "放大者 ego 聚合图",
      detail: `${hub.eventCount} 个参与事件，${(hub.fakeShare * 100).toFixed(1)}% 虚假参与，中心节点为该候选账号`,
      eventId: focus.eventId,
    };
  }
  if (focus.type === "template") {
    const template = templates.find((item) => item.id === focus.templateId);
    if (!template) return null;
    return {
      label: "话术聚合图",
      detail: `${fmt.format(template.count)} 次命中，${fmt.format(template.users)} 名相关用户，中心节点为重复文本`,
      eventId: focus.eventId,
    };
  }
  const event = focus.eventId ? events.find((item) => item.id === focus.eventId) : null;
  return {
    label: "单事件 3D 传播图",
    detail: event ? `${labelName(event.label)} ${event.shortId}，展示该事件的原始传播节点和边` : "展示被选中事件的原始传播节点和边",
    eventId: focus.eventId,
  };
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
                {(burst.botShare * 100).toFixed(1)}% 代理水军
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-px bg-border/30">
              <MiniStat label="虚假" value={compactFmt.format(burst.fake)} hot />
              <MiniStat label="真实" value={compactFmt.format(burst.real)} />
              <MiniStat label="互动" value={compactFmt.format(burst.engagement)} />
            </div>
            <p className="mt-3 line-clamp-2 font-mono text-[10px] uppercase tracking-[0.14em] leading-relaxed text-muted-foreground">
              {burst.topKeywords.join(" / ") || "暂无关键词摘要"}
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
            <span>{fmt.format(hub.eventCount)} 个事件</span>
            <span>{(hub.fakeShare * 100).toFixed(1)}% 虚假高占比</span>
            <span>{actorLabelName(hub.botLabel)}</span>
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
  if (!templates.length) {
    return (
      <div className="border border-border/30 bg-card/30 px-3 py-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] leading-relaxed text-muted-foreground">
          当前看板 JSON 没有生成重复话术模板。请重新处理数据，或检查源文本字段是否可用。
        </p>
      </div>
    );
  }

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
              {String(index + 1).padStart(2, "0")} - {fmt.format(template.count)} 次命中
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
