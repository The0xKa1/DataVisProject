"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { StageHost } from "./stage-host";
import { StepCard, StepsColumn } from "./step-card";
import { STEPS, type StageKind, type Step, type StepHelpers } from "@/lib/scrollytelling/steps";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { MetricsTile } from "@/components/charts/metrics-tile";

gsap.registerPlugin(ScrollTrigger);

// Scrollytelling director.
//
// Layout (>= md): two columns — sticky stage on the left half, narrative
// step cards on the right half. The stage hosts Network/Timeline/Orbit
// mounted once; each step card has its own ScrollTrigger that runs
// `step.apply(helpers)` on enter (forward) and on re-enter (backward),
// driving the Zustand store. Stage swaps are opacity cross-fades.
//
// On mobile we drop pinning and stack the step cards above a static
// orbit (the section's natural intro), to keep the page usable without
// a master timeline.
export function ScrollytellingSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [activeStage, setActiveStage] = useState<StageKind>(STEPS[0].stage);
  // Track the last applied step index so we don't re-fire `apply` on every
  // scroll pixel within the same step — that would clobber user's manual
  // interactions (clicking a node, brushing the timeline, etc.).
  const lastAppliedRef = useRef<number>(-1);

  // Bind helpers once — they read live store state via `getState`.
  const helpers = useMemo<StepHelpers>(() => {
    const s = useDashboardStore;
    return {
      get data() {
        return s.getState().data;
      },
      setLabel: (v) => s.getState().setLabel(v),
      setBotHeavy: (v) => s.getState().setBotHeavy(v),
      setSearch: (v) => s.getState().setSearch(v),
      setDateRange: (r) => s.getState().setDateRange(r),
      setSelected: (id) => s.getState().setSelected(id),
      setOrbitPhase: (p) => s.getState().setOrbitPhase(p),
      resetFilters: () => s.getState().resetFilters(),
    };
  }, []);

  // Master pinning + per-step triggers.
  useEffect(() => {
    if (!sectionRef.current || !stageRef.current) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;

    const ctx = gsap.context(() => {
      // Pin the sticky stage column across the entire scrollytelling
      // section. Stage column is `position: sticky` via CSS already, but
      // we also create a ScrollTrigger so that ScrollTrigger refreshes
      // are aware of the pin region (no `pin: true` needed because CSS
      // sticky does the actual pinning — this trigger only exists to give
      // us a hook for global progress if we want it later).
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: "top top",
        end: "bottom bottom",
      });

      // Per-step trigger. `onEnter` fires when the card scrolls UP into
      // the activation band; `onEnterBack` fires when the card scrolls
      // DOWN back into it (scrolling up). Both run the same apply, so
      // each step is idempotent. Stage swap is a side-effect of apply
      // (we mirror `step.stage` into local state).
      const cards = sectionRef.current!.querySelectorAll<HTMLElement>(".scrolly-step");
      cards.forEach((card, i) => {
        const step: Step | undefined = STEPS[i];
        if (!step) return;
        const enter = () => {
          if (lastAppliedRef.current === i) return;
          lastAppliedRef.current = i;
          step.apply(helpers);
          setActiveStage(step.stage);
        };
        ScrollTrigger.create({
          trigger: card,
          start: "top 55%",
          end: "bottom 45%",
          onEnter: enter,
          onEnterBack: enter,
        });
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [helpers]);

  // When the section unmounts (or the user scrolls past it), release the
  // orbit phase override so the rest of the page is left in a clean state.
  useEffect(() => {
    return () => {
      useDashboardStore.getState().setOrbitPhase(null);
      useDashboardStore.getState().resetFilters();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="work"
      className="relative pl-6 md:pl-28 pr-6 md:pr-12 py-20 md:py-24"
    >
      {/* Section header */}
      <header className="mb-10 md:mb-14 flex items-end justify-between gap-6">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
            02 / Case Study
          </span>
          <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">
            DIFFUSION AUDIT
          </h2>
        </div>
        <p className="hidden md:block max-w-xs font-mono text-xs text-muted-foreground text-right leading-relaxed">
          A nine-step walkthrough of one misinformation burst. Scroll to advance
          the narrative — the stage on the left links each claim to data.
        </p>
      </header>

      {/* Metrics strip — kept above the scrolly columns for context */}
      <div className="mb-8 md:mb-10">
        <MetricsTile />
      </div>

      {/* Two-column scrolly layout */}
      <div className="relative grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 items-start">
        {/* Sticky stage column — left half (≈58% via 7/12).
            `self-start` is critical: without it, the grid item stretches
            to the full row height (≈900vh) and `position: sticky` has no
            room to actually stick. */}
        <div className="md:col-span-7 md:sticky md:top-4 md:self-start md:h-[calc(100vh-2rem)]">
          <div ref={stageRef} className="relative h-[60vh] md:h-full">
            <StageHost active={activeStage} />
          </div>
        </div>

        {/* Steps column — right half */}
        <div className="md:col-span-5">
          <StepsColumn>
            {STEPS.map((step, i) => (
              <StepCard
                key={step.id}
                step={step}
                index={i}
                total={STEPS.length}
                onActivate={() => {
                  // Fallback path (e.g. mobile, no ScrollTrigger): mirror
                  // the active stage as cards become visible.
                  setActiveStage(step.stage);
                  if (typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches) {
                    step.apply(helpers);
                  }
                }}
              />
            ))}
          </StepsColumn>
        </div>
      </div>
    </section>
  );
}
