"use client"

import { type FormEvent, useState, useTransition } from "react"
import { toast } from "sonner"
import { updateFlowNodePrompt } from "@/lib/flow-actions"
import type { FlowNodeRow } from "@/lib/flow-graph"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { IconLoader2 } from "@tabler/icons-react"

export function NodePromptForm({
  node,
  closeSheet,
}: {
  node: FlowNodeRow
  closeSheet: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      setError(null)
      const result = await updateFlowNodePrompt(formData)
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
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 px-4 pb-4">
      <input type="hidden" name="id" value={node.id} />
      <p className="text-sm text-muted-foreground">
        The full AI prompt for this node. The worker prepends fixed safety
        framing (brand voice + guardrails); this is the editable body. Edits
        take effect on the next email (the worker reloads within ~60s — no
        restart).
      </p>
      <Textarea
        name="ai_prompt"
        defaultValue={node.ai_prompt ?? ""}
        disabled={isPending}
        placeholder="(this node has no prompt set)"
        className="max-h-[70vh] min-h-[40vh] flex-1 overflow-y-auto font-mono text-xs"
        spellCheck={false}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? <IconLoader2 className="animate-spin" /> : "Save changes"}
      </Button>
    </form>
  )
}
