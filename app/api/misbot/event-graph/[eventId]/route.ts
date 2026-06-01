import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import type {
  ActorRow,
  DashboardJSON,
  EventGraphIndex,
  EventItem,
  GraphEdge,
  GraphNode,
  GraphShard,
} from "@/lib/charts/types";

export const runtime = "nodejs";

const INFO_FILES = [
  { sourceType: "misinformation", filename: "misinformation.jsonl" },
  { sourceType: "verified_information", filename: "verified_information.jsonl" },
  { sourceType: "trend_information", filename: "trend_information.jsonl" },
] as const;

const graphCache = new Map<string, GraphShard>();
let dashboardCache: Promise<DashboardJSON> | null = null;

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  if (!eventId) {
    return Response.json({ error: "缺少事件 ID" }, { status: 400 });
  }

  const cached = graphCache.get(eventId);
  if (cached) return Response.json(cached);

  const dashboard = await loadDashboard();
  const event = dashboard.events.find((item) => item.id === eventId) ?? null;
  const graphIndex =
    dashboard.coordination?.eventGraphIndex.find((item) => item.eventId === eventId) ?? null;

  if (!event || !graphIndex) {
    return Response.json({ error: "看板索引中未找到该事件" }, { status: 404 });
  }

  const rawRecord = await findRawRecord(eventId);
  if (!rawRecord) {
    return Response.json({ error: "未找到原始 MisBot 记录" }, { status: 404 });
  }

  const graph = buildFullEventGraph(
    rawRecord.row,
    event,
    graphIndex,
    new Map(dashboard.actors.map((actor) => [actor.user, actor])),
  );
  graphCache.set(eventId, graph);
  return Response.json(graph);
}

async function loadDashboard(): Promise<DashboardJSON> {
  dashboardCache ??= fs
    .readFile(path.join(process.cwd(), "public", "data", "misbot_dashboard.json"), "utf-8")
    .then((raw) => JSON.parse(raw) as DashboardJSON);
  return dashboardCache;
}

async function findRawRecord(eventId: string): Promise<{ row: Record<string, unknown> } | null> {
  const rawRoot = path.join(process.cwd(), "data", "raw", "misbot");
  for (const infoFile of INFO_FILES) {
    const file = await findFile(rawRoot, infoFile.filename);
    if (!file) continue;

    let rowIndex = 0;
    const input = createReadStream(file, { encoding: "utf-8" });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const row = JSON.parse(trimmed) as Record<string, unknown>;
      if (computeEventIds(row, infoFile.sourceType, rowIndex).includes(eventId)) {
        lines.close();
        input.destroy();
        return { row };
      }
      rowIndex += 1;
    }
  }
  return null;
}

async function findFile(root: string, filename: string): Promise<string | null> {
  const direct = path.join(root, filename);
  try {
    await fs.access(direct);
    return direct;
  } catch {
    // fall through to recursive search
  }

  async function walk(dir: string): Promise<string | null> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const child = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === filename) return child;
      if (entry.isDirectory()) {
        const found = await walk(child);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(root);
}

function computeEventIds(row: Record<string, unknown>, sourceType: string, rowIndex: number): string[] {
  const article = asRecord(row.article);
  const textRaw = getFirst(article, "article_content", "text", "content", "");
  const publishTime = getFirst(article, "publish_time", "date", "created_at", "");
  return [...new Set(stringVariants(publishTime).map((time) => sha256(`${sourceType}:${rowIndex}:${time}:${textRaw}`)))];
}

function buildFullEventGraph(
  row: Record<string, unknown>,
  event: EventItem,
  graphIndex: EventGraphIndex,
  actorByHash: Map<string, ActorRow>,
): GraphShard {
  const commentUsers = iterUserIds(row.comment_users);
  const repostUsers = iterUserIds(row.repost_users);
  const attitudeUsers = iterUserIds(row.attitude_users);
  const commentSet = new Set(commentUsers);
  const repostSet = new Set(repostUsers);
  const attitudeSet = new Set(attitudeUsers);
  const participantCounter = new Map<string, number>();
  for (const uid of [...commentUsers, ...repostUsers, ...attitudeUsers]) {
    participantCounter.set(uid, (participantCounter.get(uid) ?? 0) + 1);
  }

  const eventNodeId = `m:${event.id}`;
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  nodes.set(eventNodeId, {
    id: eventNodeId,
    kind: "microblog",
    label: event.label,
    sourceType: event.sourceType,
    name: event.shortId,
    text: event.text,
    weight: Math.max(1, event.score ?? event.commentCount ?? event.repostCount ?? 1),
    botShare: event.botShare,
  });

  function addActor(rawUid: unknown): string | null {
    if (rawUid == null || rawUid === "") return null;
    const uid = String(rawUid);
    const hash = shaShort(uid);
    const nodeId = `u:${hash}`;
    if (!nodes.has(nodeId)) {
      const actor = actorByHash.get(hash);
      const count = participantCounter.get(uid) ?? 1;
      nodes.set(nodeId, {
        id: nodeId,
        kind: "actor",
        name: hash,
        weight: Math.max(1, count),
        botLabel: actor?.botLabel ?? "unknown",
        botScore: actor?.botScore ?? 0,
        labelSource: actor?.labelSource ?? "raw-event",
        botShare: actor?.botScore ?? 0,
        fakeShare: actor?.fakeShare ?? (event.label === "fake" ? 1 : 0),
      });
    }
    return nodeId;
  }

  function addEdge(source: string | null, target: string | null, type: GraphEdge["type"]) {
    if (!source || !target || source === target) return;
    const key = `${source}->${target}:${type}`;
    if (!edges.has(key)) edges.set(key, { source, target, type });
  }

  for (const uid of repostSet) addEdge(addActor(uid), eventNodeId, "repost");
  for (const uid of commentSet) addEdge(addActor(uid), eventNodeId, "comment");
  for (const uid of attitudeSet) addEdge(addActor(uid), eventNodeId, "attitude");

  const repostGraph = asRecord(row.repost_graph);
  const repostNodes = Array.isArray(repostGraph.nodes) ? repostGraph.nodes : [];
  for (const edge of Array.isArray(repostGraph.edges) ? repostGraph.edges : []) {
    if (!Array.isArray(edge) || edge.length < 2) continue;
    const sourceIndex = safeInt(edge[0], -1);
    const targetIndex = safeInt(edge[1], -1);
    const source = asRecord(repostNodes[sourceIndex]);
    const target = asRecord(repostNodes[targetIndex]);
    addEdge(addActor(source.name), addActor(target.name), "repostCascade");
  }

  for (const graph of Array.isArray(row.comment_graphs) ? row.comment_graphs : []) {
    const commentGraph = asRecord(graph);
    const commentNodes = Array.isArray(commentGraph.nodes) ? commentGraph.nodes : [];
    const graphEdges = Array.isArray(commentGraph.edges) ? commentGraph.edges : [];
    if (graphEdges.length) {
      for (const edge of graphEdges) {
        if (!Array.isArray(edge) || edge.length < 2) continue;
        const sourceIndex = safeInt(edge[0], -1);
        const targetIndex = safeInt(edge[1], -1);
        const sourceNode = asRecord(commentNodes[sourceIndex]);
        const targetNode = asRecord(commentNodes[targetIndex]);
        addEdge(
          addActor(sourceNode.user_from),
          addActor(targetNode.user_from ?? targetNode.user_to),
          "commentReply",
        );
      }
    } else {
      for (const commentNodeRaw of commentNodes) {
        const commentNode = asRecord(commentNodeRaw);
        if (!commentNode.user_to) continue;
        addEdge(addActor(commentNode.user_from), addActor(commentNode.user_to), "commentReply");
      }
    }
  }

  const graphNodes = [...nodes.values()];
  const graphEdges = [...edges.values()];
  return {
    eventId: event.id,
    shortId: event.shortId,
    graph: { nodes: graphNodes, edges: graphEdges },
    visibleNodes: graphNodes.length,
    visibleEdges: graphEdges.length,
    omittedNodes: 0,
    omittedEdges: 0,
    selectionRule: "由本地 MisBot 原始记录按需计算得到的完整事件传播图",
    path: `/api/misbot/event-graph/${event.id}`,
  };
}

function iterUserIds(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap((item) => iterUserIds(item));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["uid", "user_id", "userid", "user", "id", "mid"]) {
      if (record[key] != null && record[key] !== "") return [String(record[key])];
    }
    return Object.values(record).flatMap((item) => iterUserIds(item));
  }
  return [String(value)];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getFirst(record: Record<string, unknown>, ...keysAndDefault: unknown[]): unknown {
  const defaultValue = keysAndDefault.at(-1);
  const keys = keysAndDefault.slice(0, -1) as string[];
  for (const key of keys) {
    if (record[key] != null && record[key] !== "") return record[key];
  }
  return defaultValue;
}

function safeInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringVariants(value: unknown): string[] {
  if (typeof value === "number" && Number.isInteger(value)) {
    return [String(value), `${value}.0`];
  }
  return [String(value ?? "")];
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function shaShort(value: unknown, length = 8): string {
  return sha256(String(value ?? "unknown")).slice(0, length);
}
