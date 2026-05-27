"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { getBrowserSupabase } from "@/lib/supabase-browser"
import { fetchStats, type DashboardStats } from "@/lib/tickets"

export function SectionCards({ initial }: { initial: DashboardStats }) {
  const [stats, setStats] = useState<DashboardStats>(initial)

  const refetch = useCallback(async () => {
    try {
      setStats(await fetchStats(getBrowserSupabase()))
    } catch (err) {
      console.error("[stats] realtime refetch failed", err)
    }
  }, [])

  useEffect(() => {
    const supabase = getBrowserSupabase()
    const channel = supabase
      .channel("dashboard-stats")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emails" },
        () => refetch()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decisions" },
        () => refetch()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "threads" },
        () => refetch()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refetch])

  const cards = [
    { label: "Emails today", value: String(stats.emailsToday) },
    { label: "Total threads", value: String(stats.totalThreads) },
    { label: "Refund share", value: `${stats.refundShare}%` },
    { label: "Auto-decided", value: `${stats.decidedShare}%` },
  ]
  return (
    <div className="grid grid-cols-1 gap-2 md:gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {cards.map((c) => (
        <Card key={c.label} className="@container/card">
          <CardHeader>
            <CardDescription>{c.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {c.value}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}
