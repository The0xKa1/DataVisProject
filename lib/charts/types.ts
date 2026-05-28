// Type definitions for the dashboard JSON contract produced by
// scripts/build_misbot_dashboard.py. All bot-related fields are optional
// since the legacy CHECKED dataset (used as the offline demo) omits them.

export interface DashboardSource {
  name: string;
  repository: string;
  paper?: string;
  note?: string;
  generatedAt?: string;
}

export interface DashboardStats {
  informationInstances?: number;
  microblogs: number;
  fake: number;
  real: number;
  comments: number;
  reposts: number;
  attitudes?: number;
  actors: number;
  botActors?: number;
  humanActors?: number;
  unknownActors?: number;
  botShare?: number;
  dateStart: string;
  dateEnd: string;
}

export interface TimelineRow {
  month: string;
  fake: number;
  real: number;
  comments: number;
  reposts: number;
  attitudes?: number;
  botUsers?: number;
  humanUsers?: number;
  unknownUsers?: number;
  botShare?: number;
}

export interface KeywordRow {
  keyword: string;
  fake: number;
  real: number;
  total: number;
}

export type LabelKind = "fake" | "real";

export interface EventItem {
  id: string;
  shortId: string;
  label: LabelKind;
  sourceType?: string;
  date: string;
  user: string;
  text: string;
  analysis?: string;
  commentCount?: number;
  repostCount?: number;
  attitudeCount?: number;
  likeCount?: number;
  declaredComments?: number;
  declaredReposts?: number;
  tags?: string[];
  keywords?: string[];
  botUserCount?: number;
  humanUserCount?: number;
  unknownUserCount?: number;
  knownUserCount?: number;
  botShare?: number;
  score?: number;
}

export interface ActorRow {
  user: string;
  comments: number;
  reposts: number;
  attitudes?: number;
  fake: number;
  real: number;
  botLabel?: "bot" | "human" | "unknown";
  botScore?: number;
  labelSource?: string;
  score?: number;
}

export interface PhraseRow {
  text: string;
  count: number;
  users: number;
  botUsers?: number;
  botShare?: number;
}

export type GraphNodeKind = "microblog" | "actor";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  // Microblog-only fields
  label?: LabelKind;
  sourceType?: string;
  text?: string;
  // Actor-only fields
  botLabel?: "bot" | "human" | "unknown";
  botScore?: number;
  labelSource?: string;
  // Shared
  name?: string;
  weight: number;
  botShare?: number;
  x?: number;
  y?: number;
}

export type EdgeType = "repost" | "comment" | "attitude";

export interface GraphEdge {
  source: string;
  target: string;
  type: EdgeType;
}

export interface DashboardJSON {
  source: DashboardSource;
  stats: DashboardStats;
  timeline: TimelineRow[];
  keywords: KeywordRow[];
  events: EventItem[];
  actors: ActorRow[];
  phrases: PhraseRow[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
}
