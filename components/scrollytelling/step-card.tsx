"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { resolveStoryNetwork } from "@/lib/charts/story-network";
import { compactFmt, formatDateRange, labelName } from "@/lib/format";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { cn } from "@/lib/utils";
import type { Step } from "@/lib/scrollytelling/steps";

gsap.registerPlugin(ScrollTrigger);

interface Props {
  step: Step;
  index: number;
  total: number;
  onActivate: () => void;
}

// Single narrative card. Pinned scrollytelling design: each card is a
// full-viewport-tall panel; ScrollTrigger fires on enter/leave to drive the
// shared stage. The card itself does a lightweight fade-up, mirroring the
// principles-section pattern (toggleActions play reverse play reverse).
export function StepCard({ step, index, total, onActivate }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current || !innerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        innerRef.current,
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ref.current,
            start: "top 75%",
            end: "bottom 25%",
            toggleActions: "play reverse play reverse",
            onEnter: onActivate,
            onEnterBack: onActivate,
          },
        },
      );
    }, ref);
    return () => ctx.revert();
  }, [onActivate]);

  return (
    <div
      ref={ref}
      data-step-id={step.id}
      className={cn(
        "scrolly-step pointer-events-none relative flex min-h-[92dvh] items-center px-0 md:min-h-screen",
        step.side === "left" ? "md:justify-start" : "md:justify-end",
      )}
    >
      <div
        ref={innerRef}
        className={cn(
          "pointer-events-auto w-full border-l border-accent/70 bg-background/58 p-5 backdrop-blur-md md:max-w-md md:p-7",
          "shadow-[inset_1px_0_0_rgba(255,255,255,0.08),0_28px_70px_-48px_rgba(0,0,0,0.9)]",
        )}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
            {step.eyebrow}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
            {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
        </div>
        <h3 className="mt-3 font-[var(--font-bebas)] text-3xl md:text-4xl leading-tight tracking-tight">
          {step.title}
        </h3>
        <p className="mt-3 max-w-[46ch] font-mono text-[12px] leading-relaxed text-muted-foreground">
          {step.body}
        </p>
        <StepDataFootnote presetId={step.presetId} />
        <StageBadge step={step} />
      </div>
    </div>
  );
}

function StepDataFootnote({ presetId }: { presetId: string }) {
  const data = useDashboardStore((s) => s.data);
  const story = useMemo(() => resolveStoryNetwork(data), [data]);
  const focus = story?.focusRegions.find((region) => region.id === presetId);
  const selectedEvent = focus?.selectedEventId
    ? data?.events.find((event) => event.id === focus.selectedEventId)
    : focus?.eventIds?.[0]
      ? data?.events.find((event) => event.id === focus.eventIds[0])
      : null;

  if (!data || !focus) return null;

  const actorName = focus.selectedActorId?.replace(/^u:/, "") ?? null;
  const botShare = selectedEvent?.botShare ?? 0;

  return (
    <div className="mt-4 border border-border/35 bg-card/35 p-3">
      <div className="grid grid-cols-3 gap-px bg-border/30">
        <StepMetric label="节点" value={compactFmt.format(focus.nodeIds.length)} />
        <StepMetric label="事件" value={compactFmt.format(focus.eventIds.length)} />
        <StepMetric label="水军" value={`${Math.round(botShare * 100)}%`} hot={botShare >= 0.25} />
      </div>
      <div className="mt-3 space-y-1.5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-muted-foreground">
        {selectedEvent && (
          <p>
            <span className="text-accent">{labelName(selectedEvent.label)}</span>{" "}
            {selectedEvent.shortId} · {formatDateRange(focus.dateRange?.start, focus.dateRange?.end)}
          </p>
        )}
        {actorName && (
          <p>
            疑似放大者 <span className="text-accent">{actorName}</span> · 点击背景节点可反向点亮分析台
          </p>
        )}
        {focus.summary && <p>{focus.summary}</p>}
      </div>
    </div>
  );
}

function StepMetric({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <span className="bg-background/80 px-2 py-2">
      <b className={cn("block font-mono text-xs tabular-nums", hot ? "text-accent" : "text-foreground")}>
        {value}
      </b>
      <span className="block font-mono text-[8px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </span>
  );
}

function StageBadge({ step }: { step: Step }) {
  return (
    <div className="mt-4 inline-flex items-center gap-2 border border-border/40 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/80">
      <span className="h-1 w-1 bg-accent" aria-hidden />
      网络区域 / {step.eyebrow.split(" / ")[1] ?? step.presetId}
    </div>
  );
}

interface ChildProps {
  children: ReactNode;
}

// Minimal helper: a transparent spacer wrapping the StepCard list so a
// containing flex column lays out cards stacked vertically.
export function StepsColumn({ children }: ChildProps) {
  return <div className="relative z-20 flex flex-col">{children}</div>;
}
