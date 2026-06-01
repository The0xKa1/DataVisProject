import type {
  DashboardJSON,
  EdgeType,
  GraphEdge,
  GraphNode,
  GraphShard,
  StoryFocusRegion,
  StoryNetwork,
  StoryNetworkEdge,
  StoryNetworkNode,
} from "./types";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function resolveStoryNetwork(data: DashboardJSON | null): StoryNetwork | null {
  if (!data) return null;
  const provided = data.coordination?.storyNetwork;
  if (provided?.nodes?.length && provided.focusRegions?.length) return provided;
  return buildStoryNetworkFallback(data);
}

function buildStoryNetworkFallback(data: DashboardJSON): StoryNetwork | null {
  const coordination = data.coordination;
  const sourceGraphs =
    coordination?.caseGraphs?.length
      ? coordination.caseGraphs
      : data.graph.nodes.length
        ? [
            {
              eventId: "default",
              shortId: "default",
              graph: data.graph,
              visibleNodes: data.graph.nodes.length,
              visibleEdges: data.graph.edges.length,
              omittedNodes: 0,
              omittedEdges: 0,
              selectionRule: "default visible graph",
            } satisfies GraphShard,
          ]
        : [];

  if (!sourceGraphs.length) return null;

  const shards = sourceGraphs.slice(0, 8);
  const nodes: StoryNetworkNode[] = [];
  const edges: StoryNetworkEdge[] = [];
  const nodeById = new Map<string, StoryNetworkNode>();
  const eventNodeIds = new Map<string, string>();
  const clusterNodeIds = new Map<string, string[]>();
  const graphRadius = Math.max(600, Math.min(980, 420 + shards.length * 80));

  shards.forEach((shard, shardIndex) => {
    const angle = shards.length === 1 ? 0 : (Math.PI * 2 * shardIndex) / shards.length - Math.PI / 2;
    const center = {
      x: Math.cos(angle) * graphRadius,
      y: Math.sin(angle) * graphRadius * 0.72,
    };
    const cluster = `cluster-${shardIndex + 1}`;
    const rawNodes = orderGraphNodes(shard.graph.nodes);
    const localIds = new Map<string, string>();
    clusterNodeIds.set(cluster, []);

    rawNodes.forEach((node, nodeIndex) => {
      const isEvent = node.kind === "microblog";
      const eventId = isEvent ? node.id.replace(/^m:/, "") : undefined;
      const storyId = `story:${shardIndex}:${node.id}`;
      const placed = placeNode(node, center, nodeIndex);
      const storyNode: StoryNetworkNode = {
        id: storyId,
        refId: node.id,
        kind: node.kind,
        x: placed.x,
        y: placed.y,
        r: placed.r,
        cluster,
        label: node.label,
        name: node.name,
        weight: node.weight,
        eventId,
        botShare: node.botShare,
        fakeShare: node.fakeShare,
      };
      nodes.push(storyNode);
      nodeById.set(storyId, storyNode);
      localIds.set(node.id, storyId);
      clusterNodeIds.get(cluster)?.push(storyId);
      if (eventId) eventNodeIds.set(eventId, storyId);
    });

    for (const edge of shard.graph.edges) {
      const source = localIds.get(edge.source);
      const target = localIds.get(edge.target);
      if (!source || !target) continue;
      edges.push(buildStoryEdge(edge, source, target, cluster, nodeById));
    }
  });

  const bounds = computeBounds(nodes);
  const focusRegions = buildFocusRegions(data, nodes, edges, clusterNodeIds, eventNodeIds, bounds);

  return {
    nodes,
    edges,
    focusRegions,
    bounds,
    selectionRule: "runtime story projection for scroll-driven audit context",
  };
}

function orderGraphNodes(nodes: GraphNode[]): GraphNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "microblog" ? -1 : 1;
    return (b.weight ?? 0) - (a.weight ?? 0);
  });
}

function placeNode(node: GraphNode, center: { x: number; y: number }, index: number) {
  if (node.kind === "microblog") {
    return {
      x: center.x,
      y: center.y,
      r: Math.max(16, Math.min(36, Math.sqrt(node.weight || 1) * 0.42)),
    };
  }

  const i = Math.max(0, index - 1);
  const ring = 78 + Math.sqrt(i) * 38;
  const angle = i * GOLDEN_ANGLE;
  return {
    x: center.x + Math.cos(angle) * ring,
    y: center.y + Math.sin(angle) * ring * 0.78,
    r: Math.max(4.5, Math.min(13, Math.sqrt(node.weight || 1) * 0.22)),
  };
}

function buildStoryEdge(
  edge: GraphEdge,
  source: string,
  target: string,
  cluster: string,
  nodeById: Map<string, StoryNetworkNode>,
): StoryNetworkEdge {
  const s = nodeById.get(source);
  const t = nodeById.get(target);
  if (!s || !t) return { source, target, type: edge.type, cluster };

  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const bend = (hashUnit(`${source}:${target}:${edge.type}`) > 0.5 ? 1 : -1) *
    Math.min(120, Math.max(20, distance * 0.18));
  const nx = -dy / distance;
  const ny = dx / distance;
  const mx = (s.x + t.x) / 2 + nx * bend;
  const my = (s.y + t.y) / 2 + ny * bend;

  return {
    source,
    target,
    type: edge.type as EdgeType,
    cluster,
    c1x: mx,
    c1y: my,
  };
}

function buildFocusRegions(
  data: DashboardJSON,
  nodes: StoryNetworkNode[],
  edges: StoryNetworkEdge[],
  clusterNodeIds: Map<string, string[]>,
  eventNodeIds: Map<string, string>,
  bounds: StoryNetwork["bounds"],
): StoryFocusRegion[] {
  const coordination = data.coordination;
  const firstBurst = coordination?.burstWindows?.[0];
  const firstTemplate = coordination?.templateSignals?.[0];
  const firstShard = coordination?.caseGraphs?.[0];
  const fakeNodes = nodes.filter((node) => node.label === "fake");
  const eventNodes = nodes.filter((node) => node.eventId);
  const overviewIds = nodes.map((node) => node.id);
  const burstIds = idsForEvents(firstBurst?.eventIds ?? [], eventNodeIds);
  const templateIds = idsForEvents(firstTemplate?.eventIds ?? [], eventNodeIds);
  const burstFocusIds = expandEventFocus(firstBurst?.eventIds ?? [], eventNodeIds, nodes, edges, clusterNodeIds, true);
  const templateFocusIds = expandEventFocus(firstTemplate?.eventIds ?? [], eventNodeIds, nodes, edges, clusterNodeIds, true);
  const ringleaderNode = pickRingleaderNode(nodes);
  const ringleaderClusterIds = ringleaderNode ? clusterNodeIds.get(ringleaderNode.cluster) ?? [] : [];
  const ringleaderIds = ringleaderNode
    ? [...new Set([...neighborNodeIds(ringleaderNode.id, edges), ...ringleaderClusterIds])]
    : [];
  const ringleaderEventIds = ringleaderIds
    .map((id) => nodes.find((node) => node.id === id)?.eventId)
    .filter((id): id is string => !!id);
  const selectedEvidenceId =
    firstBurst?.eventIds.find((eventId) => eventNodeIds.has(eventId)) ??
    fakeNodes.find((node) => node.eventId)?.eventId ??
    eventNodes[0]?.eventId;
  const selectedEvidenceNode = selectedEvidenceId ? eventNodeIds.get(selectedEvidenceId) : undefined;
  const selectedNeighbors = selectedEvidenceNode
    ? neighborNodeIds(selectedEvidenceNode, edges)
    : [];
  const firstClusterIds = firstShard
    ? clusterNodeIds.get("cluster-1") ?? []
    : clusterNodeIds.values().next().value ?? [];
  const botHeavyIds = nodes
    .filter((node) => (node.botShare ?? 0) >= 0.25 || (node.kind === "actor" && (node.fakeShare ?? 0) >= 0.5))
    .map((node) => node.id);

  return [
    focusFromNodes({
      id: "overview",
      label: "全部叙事区域",
      nodeIds: overviewIds,
      eventIds: eventNodes.map((node) => node.eventId!).filter(Boolean),
      bounds,
      nodes,
      scale: 0.82,
      labelFilter: "all",
      orbitPhase: 0,
      summary: "叙事从完整审计投影打开。",
    }),
    focusFromNodes({
      id: "fake-burst",
      label: firstBurst ? `虚假突发 ${firstBurst.peakMonth}` : "虚假信息突发",
      nodeIds: burstFocusIds.length ? burstFocusIds : burstIds.length ? burstIds : fakeNodes.map((node) => node.id),
      eventIds: firstBurst?.eventIds ?? fakeNodes.map((node) => node.eventId!).filter(Boolean),
      bounds,
      nodes,
      scale: 1.35,
      labelFilter: "fake",
      dateRange: firstBurst ? dateRangeFromMonths(firstBurst.startMonth, firstBurst.endMonth) : undefined,
      selectedEventId: firstBurst?.eventIds.find((eventId) => eventNodeIds.has(eventId)),
      orbitPhase: 0.25,
      summary: "第一段跳转隔离虚假信息占比最高的突发窗口。",
    }),
    focusFromNodes({
      id: "propagation-core",
      label: "扩散核心",
      nodeIds: firstClusterIds.length ? firstClusterIds : overviewIds,
      eventIds: firstShard?.eventId ? [firstShard.eventId] : [],
      bounds,
      nodes,
      scale: 1.75,
      labelFilter: "fake",
      selectedEventId: firstShard?.eventId,
      orbitPhase: 0.42,
      summary: "镜头进入一条转发/评论级联。",
    }),
    focusFromNodes({
      id: "template-cluster",
      label: "重复话术簇",
      nodeIds: templateFocusIds.length ? templateFocusIds : templateIds.length ? templateIds : burstFocusIds,
      eventIds: firstTemplate?.eventIds ?? [],
      bounds,
      nodes,
      scale: 1.85,
      labelFilter: "fake",
      search: firstTemplate?.text ?? "",
      selectedEventId: firstTemplate?.eventIds.find((eventId) => eventNodeIds.has(eventId)),
      orbitPhase: 0.58,
      summary: "重复话术被纳入空间焦点，而不是单独陈列。",
    }),
    focusFromNodes({
      id: "ringleader-hunt",
      label: ringleaderNode ? `组织者候选 ${ringleaderNode.name ?? ringleaderNode.refId}` : "组织者候选",
      nodeIds: ringleaderIds.length ? ringleaderIds : botHeavyIds,
      eventIds: ringleaderEventIds,
      bounds,
      nodes,
      scale: 1.95,
      labelFilter: "fake",
      botHeavy: true,
      selectedEventId: ringleaderEventIds[0],
      selectedActorId: ringleaderNode?.refId,
      orbitPhase: 0.68,
      summary: "从水军代理分数、虚假参与占比与一跳邻域锁定疑似放大者。",
    }),
    focusFromNodes({
      id: "bot-heavy",
      label: "水军高占比参与",
      nodeIds: botHeavyIds.length ? botHeavyIds : burstIds,
      eventIds: botHeavyIds
        .map((id) => nodes.find((node) => node.id === id)?.eventId)
        .filter((id): id is string => !!id),
      bounds,
      nodes,
      scale: 1.55,
      labelFilter: "fake",
      botHeavy: true,
      dateRange: firstBurst ? dateRangeFromMonths(firstBurst.startMonth, firstBurst.endMonth) : undefined,
      selectedEventId: selectedEvidenceId,
      orbitPhase: 0.72,
      summary: "高水军代理参与被高亮，但不会被转化为定罪判断。",
    }),
    focusFromNodes({
      id: "evidence-focus",
      label: "证据细读",
      nodeIds: selectedNeighbors.length ? selectedNeighbors : selectedEvidenceNode ? [selectedEvidenceNode] : burstIds,
      eventIds: selectedEvidenceId ? [selectedEvidenceId] : [],
      bounds,
      nodes,
      scale: 2.25,
      labelFilter: "fake",
      botHeavy: true,
      selectedEventId: selectedEvidenceId,
      orbitPhase: 0.92,
      summary: "最后一步落到一条匿名微博及其局部邻域。",
    }),
    focusFromNodes({
      id: "limits",
      label: "审计边界",
      nodeIds: overviewIds,
      eventIds: eventNodes.map((node) => node.eventId!).filter(Boolean),
      bounds,
      nodes,
      scale: 0.95,
      labelFilter: "all",
      orbitPhase: 1,
      summary: "叙事拉远，提醒分析者拓扑只是证据，不是裁决。",
    }),
  ];
}

function focusFromNodes({
  id,
  label,
  nodeIds,
  eventIds,
  bounds,
  nodes,
  scale,
  labelFilter,
  botHeavy,
  search,
  dateRange,
  selectedEventId,
  orbitPhase,
  summary,
  selectedActorId,
}: {
  id: string;
  label: string;
  nodeIds: string[];
  eventIds: string[];
  bounds: StoryNetwork["bounds"];
  nodes: StoryNetworkNode[];
  scale: number;
  labelFilter?: StoryFocusRegion["labelFilter"];
  botHeavy?: boolean;
  search?: string;
  dateRange?: StoryFocusRegion["dateRange"];
  selectedEventId?: string;
  orbitPhase?: number;
  summary?: string;
  selectedActorId?: string;
}): StoryFocusRegion {
  const selected = nodeIds
    .map((nodeId) => nodes.find((node) => node.id === nodeId))
    .filter((node): node is StoryNetworkNode => !!node);
  const box = selected.length ? computeBounds(selected) : bounds;

  return {
    id,
    label,
    centerX: (box.minX + box.maxX) / 2,
    centerY: (box.minY + box.maxY) / 2,
    scale,
    nodeIds,
    eventIds,
    selectedEventId,
    selectedActorId,
    labelFilter,
    botHeavy,
    search,
    dateRange,
    orbitPhase,
    summary,
  };
}

function pickRingleaderNode(nodes: StoryNetworkNode[]): StoryNetworkNode | undefined {
  return nodes
    .filter((node) => node.kind === "actor")
    .sort((a, b) => ringleaderScore(b) - ringleaderScore(a))[0];
}

function ringleaderScore(node: StoryNetworkNode): number {
  const bot = node.botShare ?? 0;
  const fake = node.fakeShare ?? 0;
  const activity = Math.log1p(node.weight ?? 1) / 8;
  return bot * 2.4 + fake * 2.8 + activity;
}

function computeBounds(nodes: StoryNetworkNode[]): StoryNetwork["bounds"] {
  if (!nodes.length) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.r);
    minY = Math.min(minY, node.y - node.r);
    maxX = Math.max(maxX, node.x + node.r);
    maxY = Math.max(maxY, node.y + node.r);
  }
  return { minX, minY, maxX, maxY };
}

function idsForEvents(eventIds: string[], eventNodeIds: Map<string, string>): string[] {
  return eventIds.map((eventId) => eventNodeIds.get(eventId)).filter((id): id is string => !!id);
}

function expandEventFocus(
  eventIds: string[],
  eventNodeIds: Map<string, string>,
  nodes: StoryNetworkNode[],
  edges: StoryNetworkEdge[],
  clusterNodeIds: Map<string, string[]>,
  includeCluster: boolean,
): string[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const ids = new Set<string>();
  for (const eventId of eventIds) {
    const nodeId = eventNodeIds.get(eventId);
    if (!nodeId) continue;
    for (const neighborId of neighborNodeIds(nodeId, edges)) ids.add(neighborId);
    if (!includeCluster) continue;
    const node = nodeById.get(nodeId);
    if (!node) continue;
    for (const clusterNodeId of clusterNodeIds.get(node.cluster) ?? []) ids.add(clusterNodeId);
  }
  return [...ids];
}

function neighborNodeIds(nodeId: string, edges: StoryNetworkEdge[]): string[] {
  const ids = new Set<string>([nodeId]);
  for (const edge of edges) {
    if (edge.source === nodeId) ids.add(edge.target);
    if (edge.target === nodeId) ids.add(edge.source);
  }
  return [...ids];
}

function dateRangeFromMonths(startMonth: string, endMonth: string): StoryFocusRegion["dateRange"] {
  return {
    start: `${startMonth}-01`,
    end: `${endMonth}-28`,
  };
}

function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}
