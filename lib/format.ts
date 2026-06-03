// Formatting and tiny pure helpers ported from legacy/src/app.js.
// No d3 imports here so the module stays cheap to import server-side.

export const fmt = new Intl.NumberFormat("zh-CN");
export const compactFmt = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function escapeHTML(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function pct(numerator: number, denominator: number): string {
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export type LabelKind = "fake" | "real" | "all" | string;

export const labelName = (l: LabelKind): string =>
  l === "fake" ? "虚假" : l === "real" ? "真实" : "全部";

export function actorLabelName(label?: string | null): string {
  if (label === "bot") return "水军代理";
  if (label === "human") return "真人代理";
  return "未知代理";
}

export function graphRelationName(type?: string | null): string {
  if (type === "repost" || type === "repostCascade") return "转发";
  if (type === "comment" || type === "commentReply") return "评论";
  if (type === "attitude") return "态度";
  return "关系";
}

export function selectionRuleName(rule?: string | null): string {
  if (!rule) return "未记录筛选规则";
  const mapped: Record<string, string> = {
    "auto-computed aggregate propagation sketch from event-level counts; raw participant edges were not embedded":
      "根据事件级计数自动聚合的传播草图；原始参与者边未嵌入",
    "complete event propagation graph precomputed from local raw MisBot records":
      "由本地 MisBot 原始记录预计算得到的完整事件传播图",
    "complete event propagation graph computed on demand from local raw MisBot records":
      "由本地 MisBot 原始记录按需计算得到的完整事件传播图",
    "top participants plus bounded repost/comment cascade edges":
      "头部参与者与有界转发/评论级联边",
    "default visible graph": "默认可见图",
    "runtime story projection for scroll-driven audit context":
      "用于滚动审计语境的运行时叙事投影",
    "precomputed story projection from bounded graph shards":
      "由有界图分片预计算得到的叙事投影",
    "no story shards available": "没有可用叙事图分片",
  };
  return mapped[rule] ?? rule;
}

export function storyLabelName(label?: string | null): string {
  if (!label) return "叙事网络";
  if (label === "All story regions") return "全部叙事区域";
  if (label === "Fake burst") return "虚假信息突发";
  if (label.startsWith("Fake burst ")) return label.replace("Fake burst", "虚假突发");
  const mapped: Record<string, string> = {
    "Propagation core": "扩散核心",
    "All bounded story shards": "全部有界叙事分片",
    "Repeated template cluster": "重复话术簇",
    "Bot-heavy participation": "水军高占比参与",
    "Evidence close read": "证据细读",
    "Audit limits": "审计边界",
    "Story network": "叙事网络",
  };
  return mapped[label] ?? label;
}

// Total interactions count used by event and actor scoring.
export function eventInteractions(e: {
  commentCount?: number;
  repostCount?: number;
  attitudeCount?: number;
  likeCount?: number;
}): number {
  return (
    (e.commentCount ?? 0) +
    (e.repostCount ?? 0) +
    (e.attitudeCount ?? 0) +
    (e.likeCount ?? 0)
  );
}

// Lazy date parser. Tolerates the legacy "YYYY-MM-DD HH:MM" format
// the Python builder writes, falls back to native Date parsing.
const PARSE_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/;
export function parseEventDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const m = PARSE_RE.exec(raw);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5])
    );
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateRange(start?: string, end?: string): string {
  if (!start || !end) return "—";
  return `${start.slice(0, 7)} → ${end.slice(0, 7)}`;
}
