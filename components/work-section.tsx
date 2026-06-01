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
    category: "网络 · 扩散",
    title: "力导向传播图",
    description:
      "微博方块 + 参与者分裂编码 · 拖拽重排 · 点击节点聚焦证据",
    span: "col-span-2 row-span-7",
    persistHover: true,
    Component: NetworkGraph,
  },
  {
    key: "timeline",
    number: "03",
    category: "时间线 · 时序",
    title: "月度扩散",
    description:
      "堆叠柱 · 虚假橙色叠加真实墨色 · 右轴互动折线 · 拖拽筛选时间窗",
    span: "col-span-2 row-span-4",
    Component: TimelineChart,
  },
  {
    key: "orbit",
    number: "04",
    category: "轨道 · 滚动叙事",
    title: "互动轨道",
    description:
      "滚动驱动镜头 · 星点按标签分离 · 半径表示互动量 · 拖拽旋转",
    span: "col-span-2 row-span-7",
    Component: OrbitScene,
  },
  {
    key: "keywords",
    number: "05",
    category: "关键词 · 气泡云",
    title: "叙事词云",
    description: "气泡面积表示词项命中 · 暖色环表示虚假高占比使用 · 点击搜索",
    span: "col-span-1 row-span-7",
    Component: KeywordsChart,
  },
  {
    key: "actors",
    number: "06",
    category: "参与者 · 气泡图",
    title: "放大者气泡场",
    description: "气泡面积表示互动量 · 橙色圆弧表示虚假高占比参与",
    span: "col-span-1 row-span-7",
    Component: ActorsChart,
  },
  {
    key: "phrases",
    number: "07",
    category: "话术 · 模板",
    title: "重复文本信号",
    description: "复用话术 · 潜在协同模板",
    span: "col-span-2 row-span-6",
    Component: PhrasesList,
  },
  {
    key: "evidence",
    number: "08",
    category: "证据 · 样本",
    title: "匿名证据",
    description: "选中微博文本 · 点击相邻行切换",
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
            02 / 实验
          </span>
          <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">
            扩散审计
          </h2>
        </div>
        <p className="hidden md:block max-w-xs font-mono text-xs text-muted-foreground text-right leading-relaxed">
          八个联动视图覆盖微博虚假信息扩散。刷选时间、筛选标签、
          隔离水军高占比突发，并下钻到匿名证据。
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
