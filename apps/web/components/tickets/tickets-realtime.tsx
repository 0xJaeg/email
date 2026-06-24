"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getBrowserSupabase } from "@/lib/supabase/client"

// Keeps the tickets table live: on any decision or thread change, soft-refresh
// the route so the server table re-fetches the current state/query/page (all
// URL-encoded). Mirrors the old ActivityRealtime island.
export function TicketsRealtime() {
  const router = useRouter()

  useEffect(() => {
    const supabase = getBrowserSupabase()
    const channel = supabase
      .channel("tickets-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decisions" },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "threads" },
        () => router.refresh()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
