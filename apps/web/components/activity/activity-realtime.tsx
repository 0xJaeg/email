"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getBrowserSupabase } from "@/lib/supabase/client"

// Keeps the audit log live: on any audit_log change, soft-refresh the route so
// the server table re-fetches the current page/query (both URL-encoded).
export function ActivityRealtime() {
  const router = useRouter()

  useEffect(() => {
    const supabase = getBrowserSupabase()
    const channel = supabase
      .channel("activity-log")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_log" },
        () => router.refresh()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
