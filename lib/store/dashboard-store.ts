"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { DashboardJSON } from "@/lib/charts/types";

export type LabelFilter = "all" | "fake" | "real";

interface DashboardState {
  data: DashboardJSON | null;
  label: LabelFilter;
  botHeavy: boolean;
  search: string;
  dateRange: [Date, Date] | null;
  selectedId: string | null;
  // Scrollytelling override for OrbitScene's camera/orbit phase. When null,
  // OrbitScene falls back to its own ScrollTrigger. When 0..1, the section
  // director drives the phase — used while the orbit is hosted inside the
  // pinned scrollytelling stage (which has no scroll progress of its own).
  orbitPhase: number | null;

  // Setters
  setData: (data: DashboardJSON) => void;
  setLabel: (label: LabelFilter) => void;
  setBotHeavy: (botHeavy: boolean) => void;
  setSearch: (search: string) => void;
  setDateRange: (range: [Date, Date] | null) => void;
  setSelected: (id: string | null) => void;
  setOrbitPhase: (phase: number | null) => void;
  resetFilters: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  subscribeWithSelector((set) => ({
    data: null,
    label: "all",
    botHeavy: false,
    search: "",
    dateRange: null,
    selectedId: null,
    orbitPhase: null,

    setData: (data) => set({ data }),
    setLabel: (label) => set({ label, selectedId: null }),
    setBotHeavy: (botHeavy) => set({ botHeavy, selectedId: null }),
    setSearch: (search) => set({ search, selectedId: null }),
    setDateRange: (dateRange) => set({ dateRange, selectedId: null }),
    setSelected: (selectedId) => set({ selectedId }),
    setOrbitPhase: (orbitPhase) => set({ orbitPhase }),
    resetFilters: () =>
      set({
        label: "all",
        botHeavy: false,
        search: "",
        dateRange: null,
        selectedId: null,
      }),
  }))
);
