"use client"

import { useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Button } from "@workspace/ui/components/button"
import { IconPencil } from "@tabler/icons-react"
import { StepPromptForm } from "./step-prompt-form"
import type { FlowStepRow } from "@/lib/flow-steps"

export function EditStepButton({ step }: { step: FlowStepRow }) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`Edit ${step.title}`}
        onClick={() => setOpen(true)}
      >
        <IconPencil />
      </Button>
      <SheetContent className="gap-4 overflow-y-auto sm:max-w-275">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconPencil size={18} strokeWidth={1.2} />
            Edit: {step.title}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {step.step_key}
          </SheetDescription>
        </SheetHeader>
        <StepPromptForm step={step} closeSheet={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
