"use client"

import { type FormEvent, useState, useTransition } from "react"
import { toast } from "sonner"
import { updateNodeSendDelay } from "@/lib/flow-actions"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { IconLoader2 } from "@tabler/icons-react"

// Min/max send-delay (minutes) for a send_reply node. On approval the reply is
// sent after a random wait in this range, so it reads as hand-written. 0/0 = now.
export function NodeDelayForm({
  nodeId,
  min,
  max,
  closeSheet,
}: {
  nodeId: string
  min: number
  max: number
  closeSheet: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [lo, setLo] = useState(String(min))
  const [hi, setHi] = useState(String(max))
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return
    startTransition(async () => {
      setError(null)
      const result = await updateNodeSendDelay(nodeId, Number(lo), Number(hi))
      if (result.error) {
        setError(result.message)
        toast.error(result.message)
      } else {
        toast.success(result.message)
        closeSheet()
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 px-4">
      <p className="text-sm text-muted-foreground">
        Wait a random time in this range before sending, so the reply feels
        hand-written. Set both to 0 to send immediately.
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          value={lo}
          onChange={(e) => setLo(e.target.value)}
          disabled={isPending}
          className="w-20"
          aria-label="Minimum delay in minutes"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="number"
          min={0}
          value={hi}
          onChange={(e) => setHi(e.target.value)}
          disabled={isPending}
          className="w-20"
          aria-label="Maximum delay in minutes"
        />
        <span className="text-sm text-muted-foreground">minutes</span>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? <IconLoader2 className="animate-spin" /> : "Save delay"}
      </Button>
    </form>
  )
}
