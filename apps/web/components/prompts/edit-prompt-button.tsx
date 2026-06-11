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
import { PromptForm } from "./prompt-form"
import type { PromptRow } from "@/lib/prompts"

export function EditPromptButton({
  prompt,
  label,
}: {
  prompt: PromptRow
  label: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`Edit ${label}`}
        onClick={() => setOpen(true)}
      >
        <IconPencil />
      </Button>
      <SheetContent className="gap-4 overflow-y-auto sm:max-w-275">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconPencil size={18} strokeWidth={1.2} />
            Edit: {label}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {prompt.kind} · v{prompt.version}
          </SheetDescription>
        </SheetHeader>
        <PromptForm prompt={prompt} closeSheet={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
