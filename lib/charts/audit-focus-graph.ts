import type {
  ActorRow,
  BurstWindow,
  DashboardJSON,
  EventGraphIndex,
  EventItem,
  GraphEdge,
  GraphNode,
  GraphShard,
  HubActor,
  LabelKind,
  TemplateSignal,
} from "@/lib/charts/types";

const MAX_FOCUS_EVENTS = 8;
const MAX_RELATED_ACTORS = 18;

type ActorLike = ActorRow | HubActor;

export function scoreGraphEvent(entry?: EventGraphIndex): number {
  if (!entry) return 0;
  return (
    (entry.label === "fake" ? 100000 : 0) +
    (entry.fullGraph ? 50000 : 0) +
    (entry.participantCount ?? 0) * 4 +
    (entry.botShare ?? 0) * 1000 +
    (entry.score ?? 0) / 100
  );
}

export function rankEventIds(
  eventIds: string[] | undefined,
  graphIndex: EventGraphIndex[],
  limit = MAX_FOCUS_EVENTS,
): string[] {
  if (!eventIds?.length) return [];
  const indexById = new Map(graphIndex.map((entry) => [entry.eventId, entry]));
  return [...new Set(eventIds)]
    .sort((a, b) => scoreGraphEvent(indexById.get(b)) - scoreGraphEvent(indexById.get(a)))
    .slice(0, limit);
}

export function buildBurstFocusGraph(data: DashboardJSON, burst: BurstWindow): GraphShard {
  const graphIndex = data.coordination?.eventGraphIndex ?? [];
  const eventIds = rankEventIds(burst.eventIds, graphIndex);
  const eventById = eventMap(data);
  const graphIndexById = new Map(graphIndex.map((entry) => [entry.eventId, entry]));
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const centerId = `focus:burst:${burst.id}`;
  const label: LabelKind = burst.fake >= burst.real ? "fake" : "real";

  nodes.set(centerId, {
    id: centerId,
    kind: "microblog",
    semanticRole: "burst",
    semanticLabel: "异常时间窗",
    label,
    name: `突发 ${burst.peakMonth}`,
    text: `${burst.startMonth} 至 ${burst.endMonth}：虚假 ${burst.fake}，真实 ${burst.real}，互动 ${burst.engagement}`,
    weight: Math.max(1, burst.engagement),
    botShare: burst.botShare,
  });

  for (const eventId of eventIds) {
    const eventNodeId = addEventNode(nodes, eventById.get(eventId), graphIndexById.get(eventId));
    if (eventNodeId) addEdge(edges, centerId, eventNodeId, "repostCascade");
  }

  const relatedActors = relatedActorsForEvents(data, eventIds, MAX_RELATED_ACTORS);
  for (const actor of relatedActors) {
    const actorId = addActorNode(nodes, actor);
    for (const eventId of actor.topEventIds ?? []) {
      if (!eventIds.includes(eventId)) continue;
      addEdge(edges, actorId, `m:${eventId}`, actor.fakeShare && actor.fakeShare >= 0.5 ? "repost" : "comment");
    }
  }

  if (!relatedActors.length) {
    addAggregateCohorts(nodes, edges, eventIds, eventById, graphIndexById);
  }

  return finalizeShard({
    eventId: centerId,
    shortId: burst.peakMonth,
    nodes,
    edges,
    selectionRule: "异常时间窗聚合图：中心为突发窗口，外圈为该窗口的代表事件与可用的共享参与者候选",
  });
}

export function buildHubFocusGraph(data: DashboardJSON, hub: HubActor): GraphShard {
  const graphIndex = data.coordination?.eventGraphIndex ?? [];
  const eventIds = rankEventIds(hub.topEventIds, graphIndex);
  const eventById = eventMap(data);
  const graphIndexById = new Map(graphIndex.map((entry) => [entry.eventId, entry]));
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const centerId = `u:${hub.user}`;

  nodes.set(centerId, {
    id: centerId,
    kind: "actor",
    semanticRole: "hub",
    semanticLabel: "放大者候选",
    name: hub.user,
    weight: Math.max(1, hub.comments + hub.reposts + (hub.attitudes ?? 0)),
    botLabel: hub.botLabel,
    botScore: hub.botScore,
    labelSource: hub.labelSource,
    botShare: hub.botScore,
    fakeShare: hub.fakeShare,
  });

  for (const eventId of eventIds) {
    const eventNodeId = addEventNode(nodes, eventById.get(eventId), graphIndexById.get(eventId));
    if (eventNodeId) addEdge(edges, centerId, eventNodeId, hub.fakeShare >= 0.5 ? "repost" : "comment");
  }

  const neighbors = relatedActorsForEvents(data, eventIds, MAX_RELATED_ACTORS)
    .filter((actor) => actor.user !== hub.user);
  for (const actor of neighbors) {
    const actorId = addActorNode(nodes, actor);
    for (const eventId of actor.topEventIds ?? []) {
      if (!eventIds.includes(eventId)) continue;
      addEdge(edges, actorId, `m:${eventId}`, actor.fakeShare && actor.fakeShare >= 0.5 ? "repostCascade" : "commentReply");
    }
  }

  if (!eventIds.length) {
    addEdge(edges, centerId, addCohortNode(nodes, "hub-no-event", "代表事件缺失", hub.eventCount, hub.fakeShare, hub.botLabel, hub.botScore), "attitude");
  }

  return finalizeShard({
    eventId: centerId,
    shortId: hub.user,
    nodes,
    edges,
    selectionRule: "放大者 ego 图：中心为候选账号，连接其代表参与事件与同事件参与者候选",
  });
}

export function buildTemplateFocusGraph(data: DashboardJSON, template: TemplateSignal): GraphShard {
  const graphIndex = data.coordination?.eventGraphIndex ?? [];
  const eventIds = rankEventIds(template.eventIds, graphIndex);
  const eventById = eventMap(data);
  const graphIndexById = new Map(graphIndex.map((entry) => [entry.eventId, entry]));
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const centerId = `focus:template:${template.id}`;

  nodes.set(centerId, {
    id: centerId,
    kind: "microblog",
    semanticRole: "template",
    semanticLabel: "重复话术",
    label: "fake",
    name: "话术模板",
    text: template.text,
    weight: Math.max(1, template.count),
    botShare: template.botShare,
  });

  for (const eventId of eventIds) {
    const eventNodeId = addEventNode(nodes, eventById.get(eventId), graphIndexById.get(eventId));
    if (eventNodeId) addEdge(edges, centerId, eventNodeId, "commentReply");
  }

  const relatedActors = relatedActorsForEvents(data, eventIds, MAX_RELATED_ACTORS);
  for (const actor of relatedActors) {
    const actorId = addActorNode(nodes, actor);
    for (const eventId of actor.topEventIds ?? []) {
      if (!eventIds.includes(eventId)) continue;
      addEdge(edges, actorId, `m:${eventId}`, actor.fakeShare && actor.fakeShare >= 0.5 ? "repost" : "comment");
    }
  }

  if (!relatedActors.length) {
    addAggregateCohorts(nodes, edges, eventIds, eventById, graphIndexById);
  }

  return finalizeShard({
    eventId: centerId,
    shortId: template.id.replace(/^template-/, "").slice(0, 12) || "template",
    nodes,
    edges,
    selectionRule: "话术模板传播图：中心为重复文本，连接命中事件与可用的相关参与者候选",
  });
}

function eventMap(data: DashboardJSON) {
  return new Map(data.events.map((event) => [event.id, event]));
}

function allActors(data: DashboardJSON): ActorLike[] {
  const actors = new Map<string, ActorLike>();
  for (const actor of data.actors) actors.set(actor.user, actor);
  for (const actor of data.coordination?.hubActors ?? []) actors.set(actor.user, actor);
  return [...actors.values()];
}

function relatedActorsForEvents(data: DashboardJSON, eventIds: string[], limit: number): ActorLike[] {
  if (!eventIds.length) return [];
  const eventSet = new Set(eventIds);
  return allActors(data)
    .filter((actor) => actor.topEventIds?.some((eventId) => eventSet.has(eventId)))
    .sort((a, b) =>
      (b.score ?? 0) - (a.score ?? 0) ||
      (b.fakeShare ?? 0) - (a.fakeShare ?? 0) ||
      (b.eventCount ?? 0) - (a.eventCount ?? 0) ||
      a.user.localeCompare(b.user)
    )
    .slice(0, limit);
}

function addEventNode(
  nodes: Map<string, GraphNode>,
  event: EventItem | undefined,
  graphIndex: EventGraphIndex | undefined,
) {
  if (!event && !graphIndex) return null;
  const eventId = event?.id ?? graphIndex!.eventId;
  const nodeId = `m:${eventId}`;
  if (!nodes.has(nodeId)) {
    nodes.set(nodeId, {
      id: nodeId,
      kind: "microblog",
      semanticRole: "event",
      semanticLabel: "代表事件",
      label: event?.label ?? graphIndex?.label ?? "real",
      sourceType: event?.sourceType ?? graphIndex?.sourceType,
      name: event?.shortId ?? graphIndex?.shortId ?? eventId.slice(0, 8),
      text: event?.text ?? "",
      weight: Math.max(1, event?.score ?? graphIndex?.score ?? 1),
      botShare: event?.botShare ?? graphIndex?.botShare,
    });
  }
  return nodeId;
}

function addActorNode(nodes: Map<string, GraphNode>, actor: ActorLike) {
  const nodeId = `u:${actor.user}`;
  if (!nodes.has(nodeId)) {
    nodes.set(nodeId, {
      id: nodeId,
      kind: "actor",
      semanticRole: "actor",
      semanticLabel: "相关参与者",
      name: actor.user,
      weight: Math.max(1, actor.comments + actor.reposts + (actor.attitudes ?? 0)),
      botLabel: actor.botLabel,
      botScore: actor.botScore,
      labelSource: actor.labelSource,
      botShare: actor.botScore,
      fakeShare: actor.fakeShare,
    });
  }
  return nodeId;
}

function addAggregateCohorts(
  nodes: Map<string, GraphNode>,
  edges: Map<string, GraphEdge>,
  eventIds: string[],
  eventById: Map<string, EventItem>,
  graphIndexById: Map<string, EventGraphIndex>,
) {
  for (const eventId of eventIds) {
    const event = eventById.get(eventId);
    const graphIndex = graphIndexById.get(eventId);
    const knownBots = event?.botUserCount ?? Math.round((graphIndex?.knownUserCount ?? 0) * (graphIndex?.botShare ?? 0));
    const knownHumans = event?.humanUserCount ?? Math.max(0, (graphIndex?.knownUserCount ?? 0) - knownBots);
    const unknownUsers = event?.unknownUserCount ?? Math.max(0, (graphIndex?.participantCount ?? 0) - (graphIndex?.knownUserCount ?? 0));

    const botNode = addCohortNode(nodes, `bot-${eventId}`, "聚合水军参与者", knownBots, event?.label === "fake" ? 1 : 0, "bot", graphIndex?.botShare ?? event?.botShare ?? 0);
    const humanNode = addCohortNode(nodes, `human-${eventId}`, "聚合真人参与者", knownHumans, event?.label === "fake" ? 1 : 0, "human", 0);
    const unknownNode = addCohortNode(nodes, `unknown-${eventId}`, "聚合未知参与者", unknownUsers, event?.label === "fake" ? 1 : 0, "unknown", 0);
    addEdge(edges, botNode, `m:${eventId}`, "repost");
    addEdge(edges, humanNode, `m:${eventId}`, "comment");
    addEdge(edges, unknownNode, `m:${eventId}`, "attitude");
  }
}

function addCohortNode(
  nodes: Map<string, GraphNode>,
  suffix: string,
  name: string,
  weight: number,
  fakeShare: number,
  botLabel: GraphNode["botLabel"],
  botScore = 0,
) {
  const nodeId = `u:cohort-${suffix}`;
  if (!nodes.has(nodeId)) {
    nodes.set(nodeId, {
      id: nodeId,
      kind: "actor",
      semanticRole: "cohort",
      semanticLabel: "聚合参与者",
      name,
      weight: Math.max(1, weight),
      botLabel,
      botScore,
      labelSource: "aggregate",
      botShare: botScore,
      fakeShare,
    });
  }
  return nodeId;
}

function addEdge(edges: Map<string, GraphEdge>, source: string | null, target: string | null, type: GraphEdge["type"]) {
  if (!source || !target || source === target) return;
  const key = `${source}->${target}:${type}`;
  if (!edges.has(key)) edges.set(key, { source, target, type });
}

function finalizeShard({
  eventId,
  shortId,
  nodes,
  edges,
  selectionRule,
}: {
  eventId: string;
  shortId: string;
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  selectionRule: string;
}): GraphShard {
  const graphNodes = [...nodes.values()];
  const graphEdges = [...edges.values()];
  return {
    eventId,
    shortId,
    graph: { nodes: graphNodes, edges: graphEdges },
    visibleNodes: graphNodes.length,
    visibleEdges: graphEdges.length,
    omittedNodes: 0,
    omittedEdges: 0,
    selectionRule,
  };
}
