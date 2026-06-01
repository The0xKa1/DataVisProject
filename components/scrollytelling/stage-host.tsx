"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { NetworkGraph } from "@/components/charts/network-graph";
import { TimelineChart } from "@/components/charts/timeline-chart";
import { OrbitScene } from "@/components/charts/orbit-scene";
import { cn } from "@/lib/utils";
import type { StageKind } from "@/lib/scrollytelling/steps";

interface Props {
  active: StageKind;
}

// All three charts mount once and stay mounted. Active stage gets full
// opacity + pointer-events; inactive stages fade to 0 with pointer-events
// disabled so the active chart receives drag/zoom/raycaster input cleanly.
// d3 simulation and three.js renderer are never re-initialized during swaps.
export function StageHost({ active }: Props) {
  const networkRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const orbitRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const layers: Array<[StageKind, HTMLDivElement | null]> = [
      ["network", networkRef.current],
      ["timeline", timelineRef.current],
      ["orbit", orbitRef.current],
    ];
    for (const [kind, el] of layers) {
      if (!el) continue;
      const isActive = kind === active;
      gsap.to(el, {
        opacity: isActive ? 1 : 0,
        duration: 0.55,
        ease: "power2.out",
        overwrite: true,
      });
      el.style.pointerEvents = isActive ? "auto" : "none";
    }
  }, [active]);

  return (
    <div className="relative h-full w-full border border-border/40 bg-card/30 overflow-hidden">
      <Layer ref={networkRef} label="网络 · 扩散" badge="04" defaultOpacity={0}>
        <NetworkGraph />
      </Layer>
      <Layer ref={timelineRef} label="时间线 · 月度" badge="03" defaultOpacity={0}>
        <TimelineChart />
      </Layer>
      <Layer ref={orbitRef} label="轨道 · 星场" badge="05" defaultOpacity={1}>
        <OrbitScene />
      </Layer>
      <ActiveBadge active={active} />
      <InteractHint active={active} />
    </div>
  );
}

interface LayerProps {
  label: string;
  badge: string;
  defaultOpacity: number;
  children: React.ReactNode;
}

const Layer = function Layer({
  ref,
  label,
  defaultOpacity,
  children,
}: LayerProps & { ref: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={ref}
      className="absolute inset-0"
      style={{ opacity: defaultOpacity }}
      aria-label={label}
    >
      <div className="absolute inset-0 p-3 md:p-4">{children}</div>
    </div>
  );
};

function ActiveBadge({ active }: { active: StageKind }) {
  const label =
    active === "network" ? "网络" : active === "timeline" ? "时间线" : "轨道";
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-3 top-3 z-10",
        "border border-accent/60 bg-card/80 px-2.5 py-1 backdrop-blur-sm",
        "font-mono text-[10px] uppercase tracking-[0.28em] text-accent",
      )}
    >
      {label}
    </div>
  );
}

function InteractHint({ active }: { active: StageKind }) {
  const hint =
    active === "network"
      ? "拖拽 · 缩放 · 点击节点"
      : active === "timeline"
        ? "拖拽刷选 · 在筛选栏重置"
        : "拖拽旋转 · 点击星点";
  return (
    <div
      className={cn(
        "pointer-events-none absolute left-3 bottom-3 z-10",
        "border border-border/40 bg-card/80 px-2.5 py-1 backdrop-blur-sm",
        "font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/85",
      )}
    >
      <span className="text-accent">▸</span> {hint}
    </div>
  );
}
