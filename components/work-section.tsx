"use client"

import { useEffect, useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { ChartCard } from "@/components/dashboard/chart-card"
import { MetricsTile } from "@/components/charts/metrics-tile"
import { TimelineChart } from "@/components/charts/timeline-chart"
import { NetworkGraph } from "@/components/charts/network-graph"
import { OrbitScene } from "@/components/charts/orbit-scene"
import { KeywordsChart } from "@/components/charts/keywords-chart"
import { ActorsChart } from "@/components/charts/actors-chart"
import { PhrasesList } from "@/components/charts/phrases-list"
import { EvidenceCard } from "@/components/charts/evidence-card"

gsap.registerPlugin(ScrollTrigger)

// Mapping of dashboard panels onto the bento grid.
// Total: 4 cols x ~16 rows. Each "row" = 60px (auto-rows below).
const panels = [
  {
    key: "network",
    number: "02",
    category: "Network · Diffusion",
    title: "Force-directed propagation",
    description:
      "Microblog squares + actor splits · drag to rearrange · click a node to focus evidence",
    span: "col-span-2 row-span-7",
    persistHover: true,
    Component: NetworkGraph,
  },
  {
    key: "timeline",
    number: "03",
    category: "Timeline · Temporal",
    title: "Monthly diffusion",
    description:
      "Stacked bars · fake (orange) over real (ink) · engagement line right axis · drag to filter date window",
    span: "col-span-2 row-span-4",
    Component: TimelineChart,
  },
  {
    key: "orbit",
    number: "04",
    category: "Orbit · Scroll Story",
    title: "Engagement orbit",
    description:
      "Scroll-driven camera · stars separate by label · radius = engagement · drag to rotate",
    span: "col-span-2 row-span-7",
    Component: OrbitScene,
  },
  {
    key: "keywords",
    number: "05",
    category: "Keywords · Bubble Cloud",
    title: "Narrative term cloud",
    description: "Bubble area = term hits · warmer rings = fake-heavy usage · click to search",
    span: "col-span-1 row-span-7",
    Component: KeywordsChart,
  },
  {
    key: "actors",
    number: "06",
    category: "Actors · Bubble Map",
    title: "Amplifier bubble field",
    description: "Bubble area = engagement · orange ring arc = fake-heavy participation",
    span: "col-span-1 row-span-7",
    Component: ActorsChart,
  },
  {
    key: "phrases",
    number: "07",
    category: "Phrases · Templates",
    title: "Repeated text signals",
    description: "Re-used phrases · potential coordination templates",
    span: "col-span-2 row-span-6",
    Component: PhrasesList,
  },
  {
    key: "evidence",
    number: "08",
    category: "Evidence · Sample",
    title: "Anonymized evidence",
    description: "Selected microblog text · click sibling rows to switch",
    span: "col-span-2 row-span-6",
    Component: EvidenceCard,
  },
] as const

export function WorkSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const metricsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current || !headerRef.current || !gridRef.current) return

    const ctx = gsap.context(() => {
      // Header slide-in from left — verbatim from v0 WorkSection
      gsap.fromTo(
        headerRef.current,
        { x: -60, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: headerRef.current,
            start: "top 90%",
            toggleActions: "play none none reverse",
          },
        },
      )

      // Metrics row fade-up
      if (metricsRef.current) {
        gsap.fromTo(
          metricsRef.current,
          { y: 30, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            ease: "power3.out",
            scrollTrigger: {
              trigger: metricsRef.current,
              start: "top 90%",
              toggleActions: "play none none reverse",
            },
          },
        )
      }

      // Chart cards stagger fade-up — same pattern as v0
      const cards = gridRef.current?.querySelectorAll("article")
      if (cards && cards.length > 0) {
        gsap.set(cards, { y: 60, opacity: 0 })
        gsap.to(cards, {
          y: 0,
          opacity: 1,
          duration: 0.8,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: {
            trigger: gridRef.current,
            start: "top 88%",
            toggleActions: "play none none reverse",
          },
        })
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="work"
      className="relative py-28 md:py-32 pl-6 md:pl-28 pr-6 md:pr-12"
    >
      {/* Section header */}
      <div ref={headerRef} className="mb-12 md:mb-16 flex items-end justify-between gap-6">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
            02 / Experiments
          </span>
          <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">
            DIFFUSION AUDIT
          </h2>
        </div>
        <p className="hidden md:block max-w-xs font-mono text-xs text-muted-foreground text-right leading-relaxed">
          Eight coordinated views over Weibo misinformation diffusion. Brush time, filter
          labels, isolate bot-heavy bursts, drill into anonymized evidence.
        </p>
      </div>

      {/* Metrics strip */}
      <div ref={metricsRef} className="mb-6 md:mb-8">
        <MetricsTile />
      </div>

      {/* Bento grid */}
      <div
        ref={gridRef}
        className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 auto-rows-[60px]"
      >
        {panels.map((p, i) => {
          const C = p.Component
          // Reuse the v0 WorkSection's "persistHover" trick on the lead Network panel
          const persistHover = "persistHover" in p ? p.persistHover : false
          return (
            <ChartCard
              key={p.key}
              span={p.span}
              number={p.number}
              category={p.category}
              title={p.title}
              description={p.description}
              index={i}
              persistHover={persistHover}
              contentClassName={p.key === "phrases" ? "p-0" : undefined}
            >
              <C />
            </ChartCard>
          )
        })}
      </div>
    </section>
  )
}
