"use client"

import { useSearchParams, usePathname, useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Label } from "@workspace/ui/components/label"
import type { InboxOption } from "@/lib/flow-steps"

// URL-driven inbox selector (?inbox=). "Default flow" clears the param.
export function InboxPicker({ inboxes }: { inboxes: InboxOption[] }) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { replace } = useRouter()
  const current = searchParams.get("inbox") ?? "default"

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams)
    if (value === "default") params.delete("inbox")
    else params.set("inbox", value)
    replace(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="inbox" className="text-sm text-muted-foreground">
        Inbox
      </Label>
      <Select value={current} onValueChange={onChange}>
        <SelectTrigger id="inbox" className="w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">Default flow (all inboxes)</SelectItem>
          {inboxes.map((ib) => (
            <SelectItem key={ib.id} value={ib.id}>
              {ib.agent_mail_inbox_id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
