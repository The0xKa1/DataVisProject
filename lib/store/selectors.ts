"use client";

import { useMemo } from "react";
import { useDashboardStore } from "./dashboard-store";
import { parseEventDate } from "@/lib/format";
import type { BurstWindow, EventGraphIndex, EventItem, HubActor } from "@/lib/charts/types";

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

export function useSelectedBurst(): BurstWindow | null {
  const data = useDashboardStore((s) => s.data);
  const selectedBurstId = useDashboardStore((s) => s.selectedBurstId);

  return useMemo(() => {
    const bursts = data?.coordination?.burstWindows ?? [];
    if (!bursts.length) return null;
    return bursts.find((b) => b.id === selectedBurstId) ?? bursts[0];
  }, [data, selectedBurstId]);
}

export function useSelectedHub(): HubActor | null {
  const data = useDashboardStore((s) => s.data);
  const selectedHubId = useDashboardStore((s) => s.selectedHubId);

  return useMemo(() => {
    const hubs = data?.coordination?.hubActors ?? [];
    if (!hubs.length) return null;
    return hubs.find((h) => h.user === selectedHubId) ?? hubs[0];
  }, [data, selectedHubId]);
}

export function useSelectedGraphIndex(): EventGraphIndex | null {
  const data = useDashboardStore((s) => s.data);
  const selectedId = useDashboardStore((s) => s.selectedId);
  const selectedBurstId = useDashboardStore((s) => s.selectedBurstId);

  return useMemo(() => {
    const coordination = data?.coordination;
    if (!coordination?.eventGraphIndex?.length) return null;
    const burst = coordination.burstWindows.find((b) => b.id === selectedBurstId) ?? coordination.burstWindows[0];
    const preferredId = selectedId ?? pickBurstGraphEventId(burst, coordination.eventGraphIndex);
    if (preferredId) {
      const match = coordination.eventGraphIndex.find((entry) => entry.eventId === preferredId);
      if (match) return match;
    }
    return coordination.eventGraphIndex[0];
  }, [data, selectedId, selectedBurstId]);
}

function pickBurstGraphEventId(
  burst: BurstWindow | undefined,
  graphIndex: EventGraphIndex[],
): string | undefined {
  if (!burst?.eventIds?.length) return undefined;
  const indexById = new Map(graphIndex.map((entry) => [entry.eventId, entry]));
  return [...burst.eventIds].sort((a, b) => {
    const score = (entry?: EventGraphIndex) =>
      (entry?.label === "fake" ? 100000 : 0) +
      (entry?.fullGraph ? 50000 : 0) +
      (entry?.participantCount ?? 0) * 4 +
      (entry?.botShare ?? 0) * 1000 +
      (entry?.score ?? 0) / 100;
    return score(indexById.get(b)) - score(indexById.get(a));
  })[0];
}
