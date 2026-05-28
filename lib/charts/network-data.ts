import type {
  ActorRow,
  DashboardJSON,
  EventItem,
  GraphEdge,
  GraphNode,
} from "./types";

// Enriched simulation node carries metrics joined from events / actors.
export interface NetworkNode extends GraphNode {
  repostCount?: number;
  commentCount?: number;
  attitudeCount?: number;
  likeCount?: number;
  eventDate?: string;
  fakeShare?: number;
  activityNorm?: number;
  // Mutated by d3-force at runtime
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export type NetworkLink = GraphEdge & {
  // d3-force will replace string IDs with node refs at runtime
  source: string | NetworkNode;
  target: string | NetworkNode;
};

// Build the per-filter network projection: keep only edges whose target
// microblog is in the visible event set, then keep nodes that touch a
// surviving edge, and join in event/actor stats. Mirrors legacy
// buildNetworkData() at legacy/src/app.js:488.
export function buildNetworkData(
  data: DashboardJSON,
  visibleEvents: EventItem[]
): { nodes: NetworkNode[]; links: NetworkLink[] } {
  const visibleEventIds = new Set(visibleEvents.map((e) => `m:${e.id}`));
  const { nodes: rawNodes, edges: rawEdges } = data.graph;

  const links: NetworkLink[] = rawEdges
    .filter((e) => visibleEventIds.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, type: e.type }));

  const linkedIds = new Set<string>();
  for (const l of links) {
    const sourceId = typeof l.source === "string" ? l.source : (l.source as NetworkNode).id;
    const targetId = typeof l.target === "string" ? l.target : (l.target as NetworkNode).id;
    linkedIds.add(sourceId);
    linkedIds.add(targetId);
  }

  const eventById = new Map<string, EventItem>(
    data.events.map((e) => [e.id, e])
  );
  const actorByUser = new Map<string, ActorRow>(
    data.actors.map((a) => [a.user, a])
  );
  let maxActorScore = 0;
  for (const a of data.actors) {
    const s = a.score ?? 0;
    if (s > maxActorScore) maxActorScore = s;
  }
  if (!maxActorScore) maxActorScore = 1;

  const nodes: NetworkNode[] = rawNodes
    .filter((n) => linkedIds.has(n.id))
    .map((n) => {
      const enriched: NetworkNode = { ...n };
      if (n.kind === "microblog") {
        const ev = eventById.get(n.id.slice(2));
        if (ev) {
          enriched.repostCount = ev.repostCount ?? 0;
          enriched.commentCount = ev.commentCount ?? 0;
          enriched.attitudeCount = ev.attitudeCount ?? 0;
          enriched.likeCount = ev.likeCount ?? 0;
          enriched.eventDate = ev.date;
        }
      } else {
        const actor = actorByUser.get(n.id.slice(2));
        if (actor) {
          const total = (actor.fake ?? 0) + (actor.real ?? 0);
          enriched.fakeShare = total ? (actor.fake ?? 0) / total : 0;
          enriched.activityNorm = (actor.score ?? 0) / maxActorScore;
        } else {
          enriched.fakeShare = 0;
          enriched.activityNorm = 0;
        }
      }
      return enriched;
    });

  return { nodes, links };
}
