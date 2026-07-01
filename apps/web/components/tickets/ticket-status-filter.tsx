"use client"

import { useSearchParams, usePathname, useRouter } from "next/navigation"
import { cn } from "@workspace/ui/lib/utils"

// Open / Done / All filter for the unified tickets table (replaces the separate
// Approvals + Activity pages). URL-driven like the search bar: sets ?status= and
// resets ?page= so results start at page 1. Default (no param) = open.
const OPTIONS: { value: string; label: string; title?: string }[] = [
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

  return (
    <div className="inline-flex rounded-md border p-0.5">
      {OPTIONS.map((o) => (
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
      ))}
    </div>
  )
}
