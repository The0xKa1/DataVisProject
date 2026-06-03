"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import * as d3 from "d3";
import { COLORS } from "@/lib/charts/colors";
import type { EdgeType, GraphEdge, GraphNode, GraphShard } from "@/lib/charts/types";
import { actorLabelName, escapeHTML, fmt, labelName } from "@/lib/format";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { useTooltip } from "@/lib/store/tooltip-store";

interface SemanticFocusGraphProps {
  shard: GraphShard;
}

interface LayoutNode extends GraphNode, d3.SimulationNodeDatum {
  degree: number;
  radius: number;
}

interface LayoutLink extends Omit<GraphEdge, "source" | "target"> {
  source: LayoutNode;
  target: LayoutNode;
}

interface PreparedGraph {
  nodes: LayoutNode[];
  links: LayoutLink[];
}

interface Size {
  width: number;
  height: number;
}

const DEFAULT_SIZE: Size = { width: 760, height: 520 };
const EDGE_STROKE: Record<EdgeType, string> = {
  repost: COLORS.hot,
  comment: COLORS.cool,
  attitude: COLORS.muted,
  repostCascade: COLORS.hot,
  commentReply: COLORS.cool,
};

export function SemanticFocusGraph({ shard }: SemanticFocusGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const size = useElementSize(containerRef);
  const width = Math.max(320, Math.round(size.width || DEFAULT_SIZE.width));
  const height = Math.max(360, Math.round(size.height || DEFAULT_SIZE.height));
  const prepared = useMemo(() => prepareGraph(shard), [shard]);
  const [layout, setLayout] = useState<PreparedGraph>(prepared);
  const selectedId = useDashboardStore((s) => s.selectedId);
  const selectedActorId = useDashboardStore((s) => s.selectedActorId);
  const setSelected = useDashboardStore((s) => s.setSelected);
  const setSelectedActor = useDashboardStore((s) => s.setSelectedActor);
  const setAuditFocus = useDashboardStore((s) => s.setAuditFocus);
  const { show, hide } = useTooltip();

  useEffect(() => {
    const nodes = prepared.nodes.map((node) => ({
      ...node,
      x: node.x ?? seededX(node.id, width),
      y: node.y ?? seededY(node.id, height),
    }));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const links: LayoutLink[] = [];
    for (const link of prepared.links) {
      const source = nodeById.get(link.source.id);
      const target = nodeById.get(link.target.id);
      if (source && target) links.push({ type: link.type, source, target });
    }

    for (const node of nodes) {
      if (!isFocusNode(node)) continue;
      node.fx = width / 2;
      node.fy = height / 2;
    }

    const simulation = d3
      .forceSimulation<LayoutNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<LayoutNode, LayoutLink>(links)
          .distance((link) => linkDistance(link, width, height))
          .strength((link) => (isFocusNode(link.source) || isFocusNode(link.target) ? 0.72 : 0.42)),
      )
      .force(
        "charge",
        d3.forceManyBody<LayoutNode>().strength((node) => {
          if (isFocusNode(node)) return -560;
          if (node.semanticRole === "event") return -230;
          if (node.semanticRole === "cohort") return -72;
          return -120;
        }),
      )
      .force(
        "radial",
        d3
          .forceRadial<LayoutNode>(
            (node) => radialDistance(node, width, height),
            width / 2,
            height / 2,
          )
          .strength((node) => (isFocusNode(node) ? 0.9 : node.semanticRole === "event" ? 0.16 : 0.08)),
      )
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<LayoutNode>((node) => node.radius + 9).iterations(3))
      .stop();

    for (let i = 0; i < 240; i += 1) simulation.tick();
    setLayout({ nodes, links });
  }, [height, prepared, width]);

  function handleNodeClick(node: LayoutNode) {
    if (isEventNode(node)) {
      const eventId = node.id.slice(2);
      setSelectedActor(null);
      setSelected(eventId);
      setAuditFocus({ type: "event", eventId });
      return;
    }
    if (node.kind === "actor" && node.semanticRole !== "cohort") {
      setSelectedActor(node.id);
    }
  }

  function handleNodeKeyDown(event: KeyboardEvent<SVGGElement>, node: LayoutNode) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleNodeClick(node);
  }

  const selectedNodeId = selectedActorId ?? (selectedId ? `m:${selectedId}` : null);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden border border-border/30 bg-[#080808]">
      <svg
        className="h-full w-full"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="语义聚合二维力导向图"
      >
        <defs>
          <radialGradient id="semantic-focus-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={COLORS.ink} stopOpacity="0.32" />
            <stop offset="62%" stopColor={COLORS.hot} stopOpacity="0.1" />
            <stop offset="100%" stopColor={COLORS.hot} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={width} height={height} fill="transparent" />
        <circle cx={width / 2} cy={height / 2} r={Math.min(width, height) * 0.34} fill="url(#semantic-focus-glow)" />
        <g>
          {layout.links.map((link, index) => (
            <line
              key={`${link.source.id}-${link.target.id}-${link.type}-${index}`}
              x1={boundedX(link.source, width)}
              y1={boundedY(link.source, height)}
              x2={boundedX(link.target, width)}
              y2={boundedY(link.target, height)}
              stroke={EDGE_STROKE[link.type]}
              strokeOpacity={edgeOpacity(link)}
              strokeWidth={edgeWidth(link)}
              strokeDasharray={edgeDash(link.type)}
            />
          ))}
        </g>
        <g>
          {layout.nodes.map((node) => {
            const selected = node.id === selectedNodeId;
            const interactive = isInteractiveNode(node);
            const label = nodeLabel(node);
            return (
              <g
                key={node.id}
                role={interactive ? "button" : "img"}
                tabIndex={interactive ? 0 : -1}
                aria-label={label}
                data-node-id={node.id}
                data-node-kind={node.kind}
                data-semantic-role={node.semanticRole}
                transform={`translate(${boundedX(node, width)}, ${boundedY(node, height)})`}
                className={interactive ? "cursor-pointer outline-none" : ""}
                onClick={() => interactive && handleNodeClick(node)}
                onKeyDown={(event) => interactive && handleNodeKeyDown(event, node)}
                onMouseMove={(event) => show(event, nodeTooltip(node))}
                onMouseLeave={hide}
              >
                {isFocusNode(node) && (
                  <circle r={node.radius + 18} fill={nodeFill(node)} opacity="0.1" />
                )}
                <circle
                  r={node.radius}
                  fill={nodeFill(node)}
                  fillOpacity={nodeFillOpacity(node)}
                  stroke={selected ? COLORS.ink : nodeStroke(node)}
                  strokeWidth={selected ? 2.6 : isFocusNode(node) ? 2.2 : 1.2}
                  strokeDasharray={node.semanticRole === "cohort" ? "3 4" : undefined}
                />
                {isFocusNode(node) && (
                  <circle r={node.radius + 5} fill="none" stroke={nodeFill(node)} strokeOpacity="0.58" strokeWidth="1.4" />
                )}
                {shouldShowLabel(node) && (
                  <text
                    x={0}
                    y={node.radius + 14}
                    textAnchor="middle"
                    className="pointer-events-none select-none fill-foreground font-mono text-[10px] uppercase tracking-[0.1em]"
                  >
                    {shorten(label, isFocusNode(node) ? 20 : 14)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute left-3 top-3 border border-border/50 bg-card/75 px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-muted-foreground backdrop-blur-sm">
        <span className="text-accent">{fmt.format(layout.nodes.length)}</span> 2D 节点 ·{" "}
        <span className="text-accent">{fmt.format(layout.links.length)}</span> 聚合边 · 点击事件节点进入 3D
      </div>
      <div className="pointer-events-none absolute inset-x-3 bottom-3 border border-border/45 bg-card/75 px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-muted-foreground backdrop-blur-sm">
        聚合图只表达语义解释关系：中心 focus、代表事件、相关账号或聚合人群；原始传播方向和层级留给单事件 3D 图。
      </div>
    </div>
  );
}

function useElementSize(ref: RefObject<HTMLDivElement | null>): Size {
  const [size, setSize] = useState<Size>(DEFAULT_SIZE);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function prepareGraph(shard: GraphShard): PreparedGraph {
  const degree = new Map<string, number>();
  for (const edge of shard.graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const nodes = shard.graph.nodes.map((node) => ({
    ...node,
    degree: degree.get(node.id) ?? 0,
    radius: nodeRadius(node),
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const links = shard.graph.edges
    .map((edge) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      return source && target ? { ...edge, source, target } : null;
    })
    .filter((link): link is LayoutLink => Boolean(link));

  return { nodes, links };
}

function isFocusNode(node: GraphNode) {
  return node.semanticRole === "burst" || node.semanticRole === "hub" || node.semanticRole === "template";
}

function isEventNode(node: GraphNode) {
  return node.semanticRole === "event" && node.id.startsWith("m:");
}

function isInteractiveNode(node: GraphNode) {
  return isEventNode(node) || (node.kind === "actor" && node.semanticRole !== "cohort");
}

function nodeRadius(node: GraphNode) {
  const size = Math.log10(Math.max(1, node.weight) + 1);
  if (isFocusNode(node)) return 20 + Math.min(14, size * 2.5);
  if (node.semanticRole === "event" || node.kind === "microblog") return 9 + Math.min(13, size * 1.45);
  if (node.semanticRole === "cohort") return 6 + Math.min(8, size * 0.9);
  return 7 + Math.min(10, size * 1.05);
}

function nodeFill(node: GraphNode) {
  if (node.semanticRole === "template") return COLORS.hot;
  if (node.semanticRole === "hub") {
    if (node.botLabel === "bot") return COLORS.hot;
    if (node.botLabel === "human") return COLORS.inkSoft;
    return COLORS.cool;
  }
  if (node.kind === "microblog") {
    if (node.label === "fake") return COLORS.hot;
    if (node.label === "real") return COLORS.ink;
    return COLORS.cool;
  }
  if (node.botLabel === "bot") return COLORS.hot;
  if (node.botLabel === "human") return COLORS.inkSoft;
  return COLORS.cool;
}

function nodeStroke(node: GraphNode) {
  if (isFocusNode(node)) return COLORS.ink;
  if (node.semanticRole === "cohort") return COLORS.rule;
  return node.kind === "microblog" ? COLORS.ruleSoft : COLORS.rule;
}

function nodeFillOpacity(node: GraphNode) {
  if (isFocusNode(node)) return 0.92;
  if (node.semanticRole === "cohort") return 0.34;
  if (node.kind === "microblog") return 0.82;
  return 0.64;
}

function edgeOpacity(link: LayoutLink) {
  if (isFocusNode(link.source) || isFocusNode(link.target)) return 0.48;
  if (link.source.semanticRole === "cohort" || link.target.semanticRole === "cohort") return 0.2;
  return 0.32;
}

function edgeWidth(link: LayoutLink) {
  if (isFocusNode(link.source) || isFocusNode(link.target)) return 1.6;
  return 0.9;
}

function edgeDash(type: EdgeType) {
  if (type === "repostCascade" || type === "commentReply") return "5 5";
  if (type === "attitude") return "2 4";
  return undefined;
}

function radialDistance(node: LayoutNode, width: number, height: number) {
  const base = Math.min(width, height);
  if (isFocusNode(node)) return 0;
  if (node.semanticRole === "event") return base * 0.22;
  if (node.semanticRole === "cohort") return base * 0.36;
  return base * 0.34;
}

function linkDistance(link: LayoutLink, width: number, height: number) {
  const base = Math.min(width, height);
  if (isFocusNode(link.source) || isFocusNode(link.target)) return base * 0.2;
  if (link.source.semanticRole === "event" || link.target.semanticRole === "event") return base * 0.16;
  return base * 0.12;
}

function boundedX(node: LayoutNode, width: number) {
  return Math.max(node.radius + 24, Math.min(width - node.radius - 24, node.x ?? width / 2));
}

function boundedY(node: LayoutNode, height: number) {
  return Math.max(node.radius + 28, Math.min(height - node.radius - 42, node.y ?? height / 2));
}

function seededX(id: string, width: number) {
  return 48 + hashUnit(`${id}:x`) * Math.max(1, width - 96);
}

function seededY(id: string, height: number) {
  return 48 + hashUnit(`${id}:y`) * Math.max(1, height - 96);
}

function hashUnit(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function shouldShowLabel(node: LayoutNode) {
  return isFocusNode(node) || node.semanticRole === "event" || node.degree >= 3;
}

function nodeLabel(node: GraphNode) {
  if (isFocusNode(node)) return node.semanticLabel ?? node.name ?? node.id;
  return node.name ?? node.semanticLabel ?? node.id.replace(/^m:/, "").replace(/^u:/, "");
}

function nodeTooltip(node: GraphNode) {
  const label = nodeLabel(node);
  const type = node.kind === "microblog"
    ? `${node.semanticLabel ?? "微博事件"} / ${labelName(node.label ?? "all")}`
    : `${node.semanticLabel ?? "账号"} / ${actorLabelName(node.botLabel)}`;
  const botShare = typeof node.botShare === "number"
    ? `<br/>代理信号 ${escapeHTML((node.botShare * 100).toFixed(1))}%`
    : "";
  const fakeShare = typeof node.fakeShare === "number"
    ? `<br/>虚假参与占比 ${escapeHTML((node.fakeShare * 100).toFixed(1))}%`
    : "";
  const text = node.text ? `<br/><span style="color:${COLORS.muted}">${escapeHTML(shorten(node.text, 86))}</span>` : "";
  return `<strong>${escapeHTML(label)}</strong><br/>${escapeHTML(type)}<br/>权重 ${escapeHTML(fmt.format(node.weight))}${botShare}${fakeShare}${text}`;
}

function shorten(value: string, length: number) {
  return value.length > length ? `${value.slice(0, Math.max(0, length - 1))}…` : value;
}
