import fs from "node:fs/promises"
import path from "node:path"
import { SideNav } from "@/components/side-nav"
import { HeroSection } from "@/components/hero-section"
import { SignalsSection } from "@/components/signals-section"
import { ScrollytellingSection } from "@/components/scrollytelling/scrollytelling-section"
import { PrinciplesSection } from "@/components/principles-section"
import { ColophonSection } from "@/components/colophon-section"
import { DashboardClient } from "@/components/dashboard/dashboard-client"
import { AnalystConsoleSection } from "@/components/dashboard/analyst-console-section"
import type { DashboardJSON } from "@/lib/charts/types"

// Read the dashboard JSON at request time. Prefer the populated CHECKED
// demo dataset when MisBot is still the empty schema, so a TA who runs
// `npm run dev` without downloading raw MisBot still sees a meaningful
// visualization. When the MisBot raw exists and the Python builder has
// populated misbot_dashboard.json with non-zero events, that wins.
async function loadDashboardData(): Promise<DashboardJSON> {
  const dataDir = path.join(process.cwd(), "public", "data")
  const misbotPath = path.join(dataDir, "misbot_dashboard.json")
  const checkedPath = path.join(dataDir, "checked_dashboard.json")

  try {
    const misbot = JSON.parse(await fs.readFile(misbotPath, "utf-8")) as DashboardJSON
    if (misbot.events && misbot.events.length > 0) return misbot
  } catch {
    // fall through to CHECKED
  }
  try {
    return JSON.parse(await fs.readFile(checkedPath, "utf-8")) as DashboardJSON
  } catch {
    return JSON.parse(await fs.readFile(misbotPath, "utf-8")) as DashboardJSON
  }
}

export default async function Page() {
  const data = await loadDashboardData()

  return (
    <main className="relative min-h-screen">
      <SideNav />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10">
        <HeroSection />
        <SignalsSection />
        <DashboardClient initialData={data}>
          <ScrollytellingSection />
          <AnalystConsoleSection />
        </DashboardClient>
        <PrinciplesSection />
        <ColophonSection />
      </div>
    </main>
  )
}
