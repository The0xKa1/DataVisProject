"use client"

import { useRef, useEffect } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export function ColophonSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current) return

    const ctx = gsap.context(() => {
      // Header slide in
      if (headerRef.current) {
        gsap.from(headerRef.current, {
          x: -60,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: headerRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      }

      // Grid columns fade up with stagger
      if (gridRef.current) {
        const columns = gridRef.current.querySelectorAll(":scope > div")
        gsap.from(columns, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: gridRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      }

      // Footer fade in
      if (footerRef.current) {
        gsap.from(footerRef.current, {
          y: 20,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: footerRef.current,
            start: "top 95%",
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
      id="colophon"
      className="relative py-32 pl-6 md:pl-28 pr-6 md:pr-12 border-t border-border/30"
    >
      {/* Section header */}
      <div ref={headerRef} className="mb-16">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">04 / Colophon</span>
        <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">COLOPHON</h2>
      </div>

      {/* Multi-column layout */}
      <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 md:gap-12">
        {/* Dataset */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Dataset</h4>
          <ul className="space-y-2">
            <li>
              <a
                href="https://github.com/whr000001/MisBot"
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-xs text-foreground/80 hover:text-accent transition-colors duration-200"
              >
                MisBot
              </a>
            </li>
            <li>
              <a
                href="https://arxiv.org/abs/2408.09613"
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-xs text-foreground/80 hover:text-accent transition-colors duration-200"
              >
                arXiv:2408.09613
              </a>
            </li>
          </ul>
        </div>

        {/* Stack */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Stack</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">Next.js 15</li>
            <li className="font-mono text-xs text-foreground/80">React 19</li>
            <li className="font-mono text-xs text-foreground/80">Tailwind v4</li>
            <li className="font-mono text-xs text-foreground/80">Zustand</li>
          </ul>
        </div>

        {/* Visualization */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Visualization</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">d3.js v7</li>
            <li className="font-mono text-xs text-foreground/80">three.js</li>
            <li className="font-mono text-xs text-foreground/80">GSAP + Lenis</li>
          </ul>
        </div>

        {/* Typography */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Typography</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">Bebas Neue</li>
            <li className="font-mono text-xs text-foreground/80">IBM Plex Sans</li>
            <li className="font-mono text-xs text-foreground/80">IBM Plex Mono</li>
          </ul>
        </div>

        {/* Course */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Course</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">Data Visualization</li>
            <li className="font-mono text-xs text-foreground/80">Final Project</li>
            <li className="font-mono text-xs text-foreground/80">2026</li>
          </ul>
        </div>

        {/* Disclaimer */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Posture</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">Exploratory</li>
            <li className="font-mono text-xs text-foreground/80">Proxy signals</li>
            <li className="font-mono text-xs text-foreground/80">Not accusation</li>
          </ul>
        </div>
      </div>

      {/* Bottom copyright */}
      <div
        ref={footerRef}
        className="mt-24 pt-8 border-t border-border/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          MISBOT diffusion audit · 2026 course prototype · MIT-style academic use
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          Bot labels are proxy signals. Accounts are not accused.
        </p>
      </div>
    </section>
  )
}
