"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
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
        <StageBadge step={step} />
      </div>
    </div>
  );
}

function StageBadge({ step }: { step: Step }) {
  return (
    <div className="mt-4 inline-flex items-center gap-2 border border-border/40 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/80">
      <span className="h-1 w-1 bg-accent" aria-hidden />
      Network region / {step.presetId.replace(/-/g, " ")}
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
