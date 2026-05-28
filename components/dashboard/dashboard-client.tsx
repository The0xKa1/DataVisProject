"use client";

import { useEffect, type ReactNode } from "react";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import type { DashboardJSON } from "@/lib/charts/types";
import { FilterBar } from "./filter-bar";

interface Props {
  initialData: DashboardJSON;
  children: ReactNode;
}

// Hydrates the Zustand store on first client mount, then renders the
// children (the Work section bento, which contains every chart). The
// FilterBar sits between Signals and Work as a sticky region so it
// stays in view while the user scrolls through the chart grid.
export function DashboardClient({ initialData, children }: Props) {
  const setData = useDashboardStore((s) => s.setData);
  const hasData = useDashboardStore((s) => s.data !== null);

  useEffect(() => {
    setData(initialData);
  }, [initialData, setData]);

  if (!hasData) {
    // First render before hydration effect runs — render children with
    // empty data; charts gracefully no-op until store fills.
    return (
      <>
        <FilterBar />
        {children}
      </>
    );
  }

  return (
    <>
      <FilterBar />
      {children}
    </>
  );
}
