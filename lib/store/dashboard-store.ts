"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { resolveStoryNetwork } from "@/lib/charts/story-network";
import type { DashboardJSON, GraphShard, StoryFocusRegion } from "@/lib/charts/types";

export type LabelFilter = "all" | "fake" | "real";

export interface StoryViewport {
  centerX: number;
  centerY: number;
  scale: number;
}

interface DashboardState {
  data: DashboardJSON | null;
  label: LabelFilter;
  botHeavy: boolean;
  search: string;
  dateRange: [Date, Date] | null;
  selectedId: string | null;
  selectedBurstId: string | null;
  selectedHubId: string | null;
  selectedActorId: string | null;
  graphShard: GraphShard | null;
  graphShardStatus: "idle" | "loading" | "ready" | "error";
  graphShardError: string | null;
  activeStoryPresetId: string;
  storyViewport: StoryViewport | null;
  highlightNodeIds: string[];
  // Scrollytelling phase emitted by story presets. Kept as orbitPhase for
  // generated JSON compatibility even though the active three.js surface is
  // now PropagationSpace.
  orbitPhase: number | null;

  // Setters
  setData: (data: DashboardJSON) => void;
  setLabel: (label: LabelFilter) => void;
  setBotHeavy: (botHeavy: boolean) => void;
  setSearch: (search: string) => void;
  setDateRange: (range: [Date, Date] | null) => void;
  setSelected: (id: string | null) => void;
  setSelectedBurst: (id: string | null) => void;
  setSelectedHub: (id: string | null) => void;
  setSelectedActor: (id: string | null) => void;
  setGraphShardLoading: () => void;
  setGraphShard: (shard: GraphShard | null) => void;
  setGraphShardError: (message: string) => void;
  setStoryPreset: (presetId: string) => void;
  setStoryViewport: (viewport: StoryViewport | null) => void;
  setHighlightNodeIds: (nodeIds: string[]) => void;
  setOrbitPhase: (phase: number | null) => void;
  resetFilters: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  subscribeWithSelector((set, get) => ({
    data: null,
    label: "all",
    botHeavy: false,
    search: "",
    dateRange: null,
    selectedId: null,
    selectedBurstId: null,
    selectedHubId: null,
    selectedActorId: null,
    graphShard: null,
    graphShardStatus: "idle",
    graphShardError: null,
    activeStoryPresetId: "overview",
    storyViewport: null,
    highlightNodeIds: [],
    orbitPhase: null,

    setData: (data) => {
      set({ data });
      get().setStoryPreset(get().activeStoryPresetId);
    },
    setLabel: (label) => set({ label, selectedId: null }),
    setBotHeavy: (botHeavy) => set({ botHeavy, selectedId: null }),
    setSearch: (search) => set({ search, selectedId: null }),
    setDateRange: (dateRange) => set({ dateRange, selectedId: null }),
    setSelected: (selectedId) => set({ selectedId }),
    setSelectedBurst: (selectedBurstId) => set({ selectedBurstId }),
    setSelectedHub: (selectedHubId) => set({ selectedHubId }),
    setSelectedActor: (selectedActorId) => set({ selectedActorId }),
    setGraphShardLoading: () =>
      set({ graphShardStatus: "loading", graphShardError: null }),
    setGraphShard: (graphShard) =>
      set({
        graphShard,
        graphShardStatus: graphShard ? "ready" : "idle",
        graphShardError: null,
      }),
    setGraphShardError: (graphShardError) =>
      set({ graphShardStatus: "error", graphShardError }),
    setStoryPreset: (activeStoryPresetId) => {
      const story = resolveStoryNetwork(get().data);
      const focus = story?.focusRegions.find((region) => region.id === activeStoryPresetId) ??
        story?.focusRegions[0];

      if (!focus) {
        set({ activeStoryPresetId, storyViewport: null, highlightNodeIds: [] });
        return;
      }

      set({
        activeStoryPresetId: focus.id,
        storyViewport: {
          centerX: focus.centerX,
          centerY: focus.centerY,
          scale: focus.scale,
        },
        highlightNodeIds: focus.nodeIds,
        label: focus.labelFilter ?? "all",
        botHeavy: focus.botHeavy ?? false,
        search: focus.search ?? "",
        dateRange: parseStoryDateRange(focus),
        selectedId: focus.selectedEventId ?? null,
        selectedActorId: focus.selectedActorId ?? null,
        orbitPhase: focus.orbitPhase ?? null,
      });
    },
    setStoryViewport: (storyViewport) => set({ storyViewport }),
    setHighlightNodeIds: (highlightNodeIds) => set({ highlightNodeIds }),
    setOrbitPhase: (orbitPhase) => set({ orbitPhase }),
    resetFilters: () =>
      set({
        label: "all",
        botHeavy: false,
        search: "",
        dateRange: null,
        selectedId: null,
        selectedBurstId: null,
        selectedHubId: null,
        selectedActorId: null,
      }),
  }))
);

function parseStoryDateRange(focus: StoryFocusRegion): [Date, Date] | null {
  const start = focus.dateRange?.start ? new Date(focus.dateRange.start) : null;
  const end = focus.dateRange?.end ? new Date(focus.dateRange.end) : null;
  if (!start || !end) return null;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  end.setHours(23, 59, 59, 999);
  return [start, end];
}
