"use client"

import { type FormEvent, useState, useTransition } from "react"
import { toast } from "sonner"
import { updateFlowStepPrompt } from "@/lib/flow-actions"
import type { FlowStepRow } from "@/lib/flow-steps"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { IconLoader2 } from "@tabler/icons-react"

export function StepPromptForm({
  step,
  closeSheet,
}: {
  step: FlowStepRow
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
      const result = await updateFlowStepPrompt(formData)
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
      <input type="hidden" name="id" value={step.id} />
      <p className="text-muted-foreground text-sm">
        Overrides the global prompt for this step on this flow only. Leave empty
        to fall back to the shared prompt at{" "}
        <span className="font-mono">/prompts</span>. Edits take effect on the
        next email (the worker reloads within ~60s — no restart).
      </p>
      <Textarea
        name="ai_prompt"
        defaultValue={step.ai_prompt ?? ""}
        disabled={isPending}
        placeholder="(empty — using the global prompt)"
        className="max-h-[70vh] min-h-[40vh] flex-1 overflow-y-auto font-mono text-xs"
        spellCheck={false}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? <IconLoader2 className="animate-spin" /> : "Save changes"}
      </Button>
    </form>
  )
}
