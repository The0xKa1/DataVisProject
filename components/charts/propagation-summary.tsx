"use client";

import { useMemo } from "react";
import { COLORS } from "@/lib/charts/colors";
import type { EdgeType, GraphNode, GraphShard } from "@/lib/charts/types";
import { actorLabelName, compactFmt, fmt } from "@/lib/format";
import { useDashboardStore } from "@/lib/store/dashboard-store";

interface PropagationSummaryProps {
  shard: GraphShard;
}

type ActorGroup = "bot" | "human" | "unknown";

const EDGE_ORDER: EdgeType[] = ["repost", "comment", "attitude", "repostCascade", "commentReply"];

const EDGE_META: Record<EdgeType, { label: string; detail: string; color: string }> = {
  repost: { label: "转发", detail: "直接放大", color: COLORS.ink },
  comment: { label: "评论", detail: "直接讨论", color: COLORS.cool },
  attitude: { label: "态度", detail: "轻量反馈", color: "#9ca3af" },
  repostCascade: { label: "级联", detail: "参与者间转发", color: COLORS.hot },
  commentReply: { label: "回复", detail: "评论线程边", color: "#38bdf8" },
};

const GROUP_META: Record<ActorGroup, { label: string; color: string }> = {
  bot: { label: "水军代理", color: COLORS.hot },
  human: { label: "真人代理", color: COLORS.cool },
  unknown: { label: "未知", color: "#737373" },
};

export function PropagationSummary({ shard }: PropagationSummaryProps) {
  const selectedActorId = useDashboardStore((s) => s.selectedActorId);
  const setSelectedActor = useDashboardStore((s) => s.setSelectedActor);
  const summary = useMemo(() => summarize(shard), [shard]);
  const maxEdgeCount = Math.max(1, ...EDGE_ORDER.map((type) => summary.edgeCounts[type] ?? 0));

  return (
    <div className="h-full w-full overflow-hidden bg-background/35 p-4 md:p-5">
      <div className="grid grid-cols-2 gap-px border border-border/40 bg-border/40 md:grid-cols-4">
        <StatCell label="完整节点" value={fmt.format(shard.visibleNodes)} />
        <StatCell label="完整边" value={fmt.format(shard.visibleEdges)} />
        <StatCell label="参与者节点" value={fmt.format(summary.actorCount)} />
        <StatCell label="密度" value={`${(summary.density * 100).toFixed(2)}%`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="min-h-[260px] border border-border/35 bg-card/30 p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
                传播通道
              </p>
              <h4 className="mt-1 text-2xl font-medium tracking-tight">聚合完整图</h4>
            </div>
            <span className="max-w-[190px] text-right font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-muted-foreground">
              不运行力导向布局；全部边按关系类型汇总。
            </span>
          </div>

          <svg viewBox="0 0 760 245" role="img" aria-label="聚合传播通道" className="h-[245px] w-full">
            <rect x="0" y="0" width="760" height="245" fill="transparent" />
            <g transform="translate(322 88)">
              <rect x="-52" y="-38" width="104" height="76" fill={COLORS.surface} stroke={COLORS.ink} />
              <rect x="-38" y="-24" width="76" height="48" fill={summary.eventLabel === "fake" ? COLORS.hot : COLORS.ink} opacity="0.9" />
              <text x="0" y="58" textAnchor="middle" className="fill-muted-foreground font-mono text-[10px] uppercase tracking-[0.16em]">
                {shard.shortId}
              </text>
            </g>

            {EDGE_ORDER.map((type, index) => {
              const count = summary.edgeCounts[type] ?? 0;
              const ratio = count / maxEdgeCount;
              const y = 24 + index * 42;
              const strokeWidth = 2 + ratio * 18;
              const color = EDGE_META[type].color;
              const endX = 214 + ratio * 410;
              return (
                <g key={type}>
                  <text x="0" y={y + 4} className="fill-foreground font-mono text-[11px] uppercase tracking-[0.14em]">
                    {EDGE_META[type].label}
                  </text>
                  <text x="0" y={y + 20} className="fill-muted-foreground font-mono text-[9px] uppercase tracking-[0.12em]">
                    {EDGE_META[type].detail}
                  </text>
                  <line x1="150" y1={y} x2="690" y2={y} stroke={COLORS.surface} strokeWidth="1" />
                  <line
                    x1="150"
                    y1={y}
                    x2={endX}
                    y2={y}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="square"
                    opacity={count ? 0.86 : 0.18}
                  />
                  <text x="706" y={y + 4} textAnchor="end" className="fill-foreground font-mono text-[12px] uppercase tracking-[0.12em]">
                    {compactFmt.format(count)}
                  </text>
                </g>
              );
            })}
          </svg>
        </section>

        <section className="border border-border/35 bg-card/30 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
            参与者构成
          </p>
          <h4 className="mt-1 text-2xl font-medium tracking-tight">代理标签</h4>
          <div className="mt-5 space-y-4">
            {(Object.keys(GROUP_META) as ActorGroup[]).map((group) => {
              const count = summary.actorGroups[group] ?? 0;
              const ratio = summary.actorCount ? count / summary.actorCount : 0;
              return (
                <div key={group}>
                  <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em]">
                    <span className="text-muted-foreground">{GROUP_META[group].label}</span>
                    <span>{fmt.format(count)}</span>
                  </div>
                  <div className="h-2 border border-border/50 bg-background/60">
                    <div
                      className="h-full"
                      style={{ width: `${Math.max(1, ratio * 100)}%`, backgroundColor: GROUP_META[group].color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-px border border-border/40 bg-border/40">
            <StatCell label="直连边" value={compactFmt.format(summary.directEdges)} compact />
            <StatCell label="级联边" value={compactFmt.format(summary.cascadeEdges)} compact />
          </div>
        </section>
      </div>

      <section className="mt-4 border border-border/35 bg-card/30 p-4">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent">
              参与者排序
            </p>
            <h4 className="mt-1 text-2xl font-medium tracking-tight">按度数排序的主要放大者</h4>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            点击行以高亮
          </span>
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden border border-border/35 bg-border/35 md:grid-cols-2 xl:grid-cols-4">
          {summary.topActors.map((actor, index) => (
            <button
              key={actor.id}
              type="button"
              onClick={() => setSelectedActor(actor.id)}
              className={`min-w-0 bg-background/70 px-3 py-3 text-left transition hover:bg-accent/10 ${
                selectedActorId === actor.id ? "outline outline-1 outline-accent" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.16em]">
                <span className="text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-accent">{compactFmt.format(actor.degree)}</span>
              </div>
              <div className="mt-2 truncate text-sm font-medium">{actor.name}</div>
              <div className="mt-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                <span>{actorLabelName(actor.botLabel)}</span>
                <span>{Math.round(actor.fakeShare * 100)}% 虚假占比</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCell({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`bg-background/80 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className={`${compact ? "mt-1 text-lg" : "mt-2 text-2xl"} font-medium tracking-tight`}>{value}</div>
    </div>
  );
}

function summarize(shard: GraphShard) {
  const eventNode = shard.graph.nodes.find((node) => node.kind === "microblog");
  const actorNodes = shard.graph.nodes.filter((node) => node.kind === "actor");
  const degree = new Map<string, number>();
  const edgeCounts = Object.fromEntries(EDGE_ORDER.map((type) => [type, 0])) as Record<EdgeType, number>;
  let directEdges = 0;
  let cascadeEdges = 0;

  for (const edge of shard.graph.edges) {
    edgeCounts[edge.type] = (edgeCounts[edge.type] ?? 0) + 1;
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    if (edge.target === eventNode?.id) directEdges += 1;
    if (edge.type === "repostCascade" || edge.type === "commentReply") cascadeEdges += 1;
  }

  const actorGroups: Record<ActorGroup, number> = { bot: 0, human: 0, unknown: 0 };
  for (const node of actorNodes) {
    actorGroups[toActorGroup(node)] += 1;
  }

  const topActors = actorNodes
    .map((node) => ({
      id: node.id,
      name: node.name || node.id,
      degree: degree.get(node.id) ?? 0,
      fakeShare: node.fakeShare ?? 0,
      botLabel: node.botLabel ?? "unknown",
      botScore: node.botScore ?? 0,
    }))
    .sort((a, b) => (b.degree - a.degree) || (b.botScore - a.botScore) || a.name.localeCompare(b.name))
    .slice(0, 12);

  const possibleEdges = Math.max(1, shard.visibleNodes * Math.max(1, shard.visibleNodes - 1));

  return {
    actorCount: actorNodes.length,
    actorGroups,
    cascadeEdges,
    density: shard.visibleEdges / possibleEdges,
    directEdges,
    edgeCounts,
    eventLabel: eventNode?.label,
    topActors,
  };
}

function toActorGroup(node: GraphNode): ActorGroup {
  if (node.botLabel === "bot") return "bot";
  if (node.botLabel === "human") return "human";
  return "unknown";
}
