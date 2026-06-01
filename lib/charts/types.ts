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
  month?: string;
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
  eventCount?: number;
  fakeEventCount?: number;
  realEventCount?: number;
  fakeShare?: number;
  botLabel?: "bot" | "human" | "unknown";
  botScore?: number;
  labelSource?: string;
  topEventIds?: string[];
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
  fakeShare?: number;
  x?: number;
  y?: number;
}

export type EdgeType = "repost" | "comment" | "attitude" | "repostCascade" | "commentReply";

export interface GraphEdge {
  source: string;
  target: string;
  type: EdgeType;
}

export interface BurstWindow {
  id: string;
  startMonth: string;
  endMonth: string;
  peakMonth: string;
  fake: number;
  real: number;
  engagement: number;
  botShare: number;
  eventIds: string[];
  topKeywords: string[];
  score: number;
}

export interface HubActor extends ActorRow {
  eventCount: number;
  fakeEventCount: number;
  realEventCount: number;
  fakeShare: number;
  topEventIds: string[];
  score: number;
}

export interface TemplateSignal {
  id: string;
  text: string;
  count: number;
  users: number;
  botUsers?: number;
  botShare?: number;
  eventIds: string[];
}

export interface EventGraphIndex {
  eventId: string;
  shortId: string;
  label: LabelKind;
  sourceType?: string;
  date: string;
  month: string;
  participantCount: number;
  knownUserCount: number;
  botShare: number;
  repostEdges: number;
  commentEdges: number;
  cascadeEdges: number;
  cascadeDepth: number;
  score: number;
  fullGraph?: string;
}

export interface GraphShard {
  eventId: string;
  shortId: string;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  visibleNodes: number;
  visibleEdges: number;
  omittedNodes: number;
  omittedEdges: number;
  selectionRule: string;
  path?: string;
}

export interface StoryNetworkNode {
  id: string;
  refId: string;
  kind: GraphNodeKind;
  x: number;
  y: number;
  r: number;
  cluster: string;
  label?: LabelKind;
  name?: string;
  weight: number;
  eventId?: string;
  botShare?: number;
  fakeShare?: number;
}

export interface StoryNetworkEdge {
  source: string;
  target: string;
  type: EdgeType;
  cluster: string;
  c1x?: number;
  c1y?: number;
  c2x?: number;
  c2y?: number;
}

export interface StoryFocusRegion {
  id: string;
  label: string;
  centerX: number;
  centerY: number;
  scale: number;
  nodeIds: string[];
  eventIds: string[];
  selectedEventId?: string;
  labelFilter?: "all" | LabelKind;
  botHeavy?: boolean;
  search?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  orbitPhase?: number;
  summary?: string;
  selectedActorId?: string;
}

export interface StoryNetwork {
  nodes: StoryNetworkNode[];
  edges: StoryNetworkEdge[];
  focusRegions: StoryFocusRegion[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  selectionRule: string;
}

export interface CoordinationSummary {
  summary: {
    fullCoverage?: boolean;
    eventCount?: number;
    actorUniverse?: number;
    visibleGraphPolicy?: string;
    shardBasePath?: string;
    shardCount?: number;
    fullGraphBasePath?: string;
    fullGraphCount?: number;
    fullGraphLimit?: number;
    fullGraphSelection?: string;
  };
  burstWindows: BurstWindow[];
  hubActors: HubActor[];
  templateSignals: TemplateSignal[];
  eventGraphIndex: EventGraphIndex[];
  caseGraphs?: GraphShard[];
  storyNetwork?: StoryNetwork;
  tailSummary?: {
    keywordRowsTotal?: number;
    phraseRowsTotal?: number;
    actorRowsRanked?: number;
    keywordsEmitted?: number;
    phrasesEmitted?: number;
    actorsEmitted?: number;
  };
}

export interface DashboardJSON {
  source: DashboardSource;
  stats: DashboardStats;
  timeline: TimelineRow[];
  keywords: KeywordRow[];
  events: EventItem[];
  actors: ActorRow[];
  phrases: PhraseRow[];
  coordination?: CoordinationSummary;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
}
