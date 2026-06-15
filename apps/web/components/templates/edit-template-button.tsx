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
import { TemplateForm } from "./template-form"
import type { TemplateRow } from "@/lib/templates"

export function EditTemplateButton({ template }: { template: TemplateRow }) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Edit template"
        onClick={() => setOpen(true)}
      >
        <IconPencil />
      </Button>
      <SheetContent className="gap-4 overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconPencil size={18} strokeWidth={1.2} />
            Edit template
          </SheetTitle>
          <SheetDescription className="sr-only">
            Edit this template
          </SheetDescription>
        </SheetHeader>
        <TemplateForm
          mode="update"
          template={template}
          closeSheet={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
