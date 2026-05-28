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
  l === "fake" ? "FAKE" : l === "real" ? "REAL" : "ALL";

// Total interactions count used by the orbit + actor scoring.
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
