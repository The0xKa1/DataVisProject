"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { StoryNetworkCanvas } from "./story-network-canvas";
import { StepCard, StepsColumn } from "./step-card";
import { STEPS, type Step, type StepHelpers } from "@/lib/scrollytelling/steps";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { MetricsTile } from "@/components/charts/metrics-tile";

gsap.registerPlugin(ScrollTrigger);

// MIT-style story director.
//
// The network canvas is pinned as a full-bleed background. Step cards only
// switch named story presets; the preset then updates viewport, highlights,
// timeline range, selected evidence, and proxy filters in one place.
export function ScrollytellingSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const lastAppliedRef = useRef<number>(-1);

  const helpers = useMemo<StepHelpers>(() => {
    const s = useDashboardStore;
    return {
      setStoryPreset: (presetId) => s.getState().setStoryPreset(presetId),
    };
  }, []);

  const activateStep = useCallback(
    (step: Step, index: number) => {
      if (lastAppliedRef.current === index) return;
      lastAppliedRef.current = index;
      step.apply(helpers);
    },
    [helpers],
  );

  useEffect(() => {
    if (!sectionRef.current || typeof window === "undefined") return;

    const ctx = gsap.context(() => {
      const cards = sectionRef.current!.querySelectorAll<HTMLElement>(".scrolly-step");
      cards.forEach((card, index) => {
        const step = STEPS[index];
        if (!step) return;
        ScrollTrigger.create({
          trigger: card,
          start: "top 58%",
          end: "bottom 42%",
          onEnter: () => activateStep(step, index),
          onEnterBack: () => activateStep(step, index),
        });
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [activateStep]);

  return (
    <section
      ref={sectionRef}
      id="work"
      className="relative overflow-clip border-y border-border/30 bg-background"
    >
      <div className="sticky top-0 z-0 h-[100dvh] min-h-[680px] md:min-h-0">
        <StoryNetworkCanvas />
      </div>

      <div className="relative z-10 -mt-[100dvh] min-h-[calc(100dvh+700vh)] px-6 pb-24 pt-0 md:px-12 lg:px-28">
        <header className="flex min-h-[100dvh] flex-col justify-end gap-8 pb-16 pt-28 md:pb-20">
          <div className="max-w-4xl">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
              02 / 案例研究
            </span>
            <h2 className="mt-4 max-w-3xl font-[var(--font-bebas)] text-6xl leading-none tracking-tight md:text-8xl">
              背景网络审计
            </h2>
            <p className="mt-5 max-w-xl font-mono text-xs uppercase leading-relaxed tracking-[0.16em] text-muted-foreground">
              滚动浏览同一个稳定的 MisBot 投影。网络不会重新布局；
              视窗、重点、证据与筛选器会一起移动。
            </p>
          </div>
          <div className="max-w-5xl">
            <MetricsTile />
          </div>
        </header>

        <StepsColumn>
          {STEPS.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              index={index}
              total={STEPS.length}
              onActivate={() => activateStep(step, index)}
            />
          ))}
        </StepsColumn>
      </div>
    </section>
  );
}
