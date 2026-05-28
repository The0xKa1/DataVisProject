"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger);

interface Props {
  span: string;          // grid span Tailwind classes — same shape as v0 experiments[]
  number: string;        // "02"
  category: string;      // "TIMELINE"
  title: string;         // "MONTHLY DIFFUSION"
  description?: string;
  index: number;
  persistHover?: boolean; // keeps the accent border lit once scrolled into view
  contentClassName?: string;
  children: ReactNode;
}

// Bento card matching the v0 INTERFACE Work-section card design language —
// monospace eyebrow, Bebas Neue title, hover/scroll-active accent state,
// top-right L-corner, bottom-right index marker. Inside, an unstyled
// children slot for the actual chart.
export function ChartCard({
  span,
  number,
  category,
  title,
  description,
  index,
  persistHover = false,
  contentClassName,
  children,
}: Props) {
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const [isScrollActive, setIsScrollActive] = useState(false);

  useEffect(() => {
    if (!persistHover || !cardRef.current) return;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: cardRef.current,
        start: "top 80%",
        onEnter: () => setIsScrollActive(true),
      });
    }, cardRef);
    return () => ctx.revert();
  }, [persistHover]);

  const active = isHovered || isScrollActive;

  return (
    <article
      ref={cardRef}
      className={cn(
        "group relative border border-border/40 flex flex-col transition-all duration-500 overflow-hidden bg-card/30",
        span,
        active && "border-accent/60"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background tint on hover */}
      <div
        className={cn(
          "absolute inset-0 bg-accent/5 transition-opacity duration-500 pointer-events-none",
          active ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Header — eyebrow + Bebas title + optional sublabel */}
      <header className="relative z-10 flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border/30">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] font-medium tracking-[0.3em] text-accent tabular-nums">
              {number}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {category}
            </span>
          </div>
          <h3
            className={cn(
              "mt-1.5 font-[var(--font-bebas)] text-2xl md:text-3xl leading-none tracking-tight transition-colors duration-300",
              active ? "text-accent" : "text-foreground"
            )}
          >
            {title}
          </h3>
          {description && (
            <p className="mt-1.5 max-w-[44ch] font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </header>

      {/* Chart body */}
      <div
        className={cn(
          "relative z-10 flex-1 min-h-0 p-3 md:p-4",
          contentClassName
        )}
      >
        {children}
      </div>

      {/* Bottom-right index marker */}
      <span
        className={cn(
          "absolute bottom-3 right-3 font-mono text-[10px] tabular-nums transition-colors duration-300 z-20 pointer-events-none",
          active ? "text-accent" : "text-muted-foreground/40"
        )}
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      {/* Top-right L corner — same accent treatment as v0 WorkCard */}
      <div
        className={cn(
          "absolute top-0 right-0 w-12 h-12 transition-all duration-500 z-20 pointer-events-none",
          active ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="absolute top-0 right-0 w-full h-[1px] bg-accent" />
        <div className="absolute top-0 right-0 w-[1px] h-full bg-accent" />
      </div>
    </article>
  );
}
