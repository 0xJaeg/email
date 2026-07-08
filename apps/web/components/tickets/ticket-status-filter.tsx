"use client"

import { useSearchParams, usePathname, useRouter } from "next/navigation"
import { cn } from "@workspace/ui/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

// Filter for the unified tickets table. URL-driven like the search bar: the
// work-queue view sets ?status=, the lookup/escalation result sets ?outcome=,
// each resetting ?page= so results start at page 1. Two separate controls so the
// everyday views stay one clean row and the diagnostic filters (Ben's ask:
// found / not found / failed / escalated) live in a dropdown beside them.
const STATE_OPTIONS: { value: string; label: string; title?: string }[] = [
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

const RESULT_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All results" },
  { value: "found", label: "Found" },
  { value: "not_found", label: "Not found" },
  { value: "failed", label: "Failed" },
  { value: "escalated", label: "Escalated" },
]

export function TicketStatusFilter() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { replace } = useRouter()
  const activeState = searchParams.get("status") ?? "open"
  const activeResult = searchParams.get("outcome") ?? "all"

  // Set (or clear, when it's the default) a URL param, and reset pagination.
  function setParam(key: string, value: string, defaultValue: string) {
    const params = new URLSearchParams(searchParams)
    if (value === defaultValue) params.delete(key)
    else params.set(key, value)
    params.delete("page")
    replace(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border p-0.5">
        {STATE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.title}
            onClick={() => setParam("status", o.value, "open")}
            className={cn(
              "rounded px-3 py-1 text-sm transition-colors",
              activeState === o.value
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">Result</span>
        <Select
          value={activeResult}
          onValueChange={(v) => setParam("outcome", v, "all")}
        >
          <SelectTrigger size="sm" className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESULT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
