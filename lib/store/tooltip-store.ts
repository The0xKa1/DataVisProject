"use client";

import { create } from "zustand";

// Singleton tooltip store — fires on every mousemove (~60Hz). Kept off
// the main dashboard store so chart hovers don't ripple React re-renders
// through the rest of the page.

export interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  html: string;
  show: (event: { clientX: number; clientY: number }, html: string) => void;
  hide: () => void;
}

const TOOLTIP_OFFSET = 16;
const VIEWPORT_GUARD = 340;

export const useTooltipStore = create<TooltipState>((set) => ({
  visible: false,
  x: 0,
  y: 0,
  html: "",
  show: (event, html) => {
    const x = Math.min(
      event.clientX + TOOLTIP_OFFSET,
      (typeof window !== "undefined" ? window.innerWidth : 1440) - VIEWPORT_GUARD
    );
    const y = event.clientY + TOOLTIP_OFFSET;
    set({ visible: true, x, y, html });
  },
  hide: () => set({ visible: false }),
}));

export function useTooltip() {
  const show = useTooltipStore((s) => s.show);
  const hide = useTooltipStore((s) => s.hide);
  return { show, hide };
}
