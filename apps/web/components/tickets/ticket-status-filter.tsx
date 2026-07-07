"use client"

import { useSearchParams, usePathname, useRouter } from "next/navigation"
import { cn } from "@workspace/ui/lib/utils"

// Filter for the unified tickets table. URL-driven like the search bar: sets
// ?status= and resets ?page= so results start at page 1. Default (no param) =
// open. Two groups: the work-queue views (open/done/all/quarantined) and the
// lookup / escalation outcome filters (found/not_found/failed/escalated), so an
// operator can see, across tickets, why a purchase lookup found something, found
// nothing, or could not run.
type Opt = { value: string; label: string; title?: string }

const STATE_OPTIONS: Opt[] = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
  {
    value: "quarantined",
    label: "Quarantined",
    title:
      "Blocked as likely spam — no reply is sent. Review here to catch anything wrongly quarantined.",
  },
]

const OUTCOME_OPTIONS: Opt[] = [
  {
    value: "found",
    label: "Found",
    title: "Purchase lookup found an active order for the sender.",
  },
  {
    value: "not_found",
    label: "Not found",
    title: "The lookup ran cleanly and found no active order.",
  },
  {
    value: "failed",
    label: "Failed",
    title:
      "The lookup could not run (API/DB error). Escalated — NOT a real miss.",
  },
  {
    value: "escalated",
    label: "Escalated",
    title: "Routed to a human for a manual reply.",
  },
]

export function TicketStatusFilter() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { replace } = useRouter()
  const active = searchParams.get("status") ?? "open"

  function select(value: string) {
    const params = new URLSearchParams(searchParams)
    // "open" is the default — keep the URL clean by omitting it.
    if (value === "open") params.delete("status")
    else params.set("status", value)
    params.delete("page")
    replace(`${pathname}?${params.toString()}`)
  }

  const button = (o: Opt) => (
    <button
      key={o.value}
      type="button"
      title={o.title}
      onClick={() => select(o.value)}
      className={cn(
        "rounded px-3 py-1 text-sm transition-colors",
        active === o.value
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {o.label}
    </button>
  )

  return (
    <div className="inline-flex flex-wrap items-center gap-y-1 rounded-md border p-0.5">
      {STATE_OPTIONS.map(button)}
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      {OUTCOME_OPTIONS.map(button)}
    </div>
  )
}
