"use client";

import { useMemo } from "react";
import { useDashboardStore } from "./dashboard-store";
import { parseEventDate } from "@/lib/format";
import type { EventItem } from "@/lib/charts/types";

// Returns events that match all four active filters.
// Computed once per [data, label, botHeavy, dateRange, search] tuple,
// then read by every chart that needs the filtered set.
export function useFilteredEvents(): EventItem[] {
  const data = useDashboardStore((s) => s.data);
  const label = useDashboardStore((s) => s.label);
  const botHeavy = useDashboardStore((s) => s.botHeavy);
  const dateRange = useDashboardStore((s) => s.dateRange);
  const search = useDashboardStore((s) => s.search);

  return useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.events.filter((event) => {
      if (label !== "all" && event.label !== label) return false;
      if (botHeavy) {
        const known = event.knownUserCount ?? 0;
        const share = event.botShare ?? 0;
        if (share < 0.25 || known < 5) return false;
      }
      if (dateRange) {
        const dt = parseEventDate(event.date);
        if (!dt) return false;
        if (dt < dateRange[0] || dt > dateRange[1]) return false;
      }
      if (q) {
        const haystack = [
          event.text ?? "",
          event.analysis ?? "",
          event.shortId ?? "",
          event.user ?? "",
          ...(event.keywords ?? []),
          ...(event.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [data, label, botHeavy, dateRange, search]);
}

// Selects the event represented by selectedId, falling back to the first
// visible event so the evidence card is never empty when data is present.
export function useSelectedEvent(events: EventItem[]): EventItem | null {
  const selectedId = useDashboardStore((s) => s.selectedId);
  return useMemo(() => {
    if (!events.length) return null;
    return events.find((e) => e.id === selectedId) ?? events[0];
  }, [events, selectedId]);
}
