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
import { TriggerForm } from "./trigger-form"
import type { TriggerRow } from "@/lib/triggers"
import type { ProductOption } from "@/lib/inboxes"

export function EditTriggerButton({
  trigger,
  products,
}: {
  trigger: TriggerRow
  products: ProductOption[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Edit trigger"
        onClick={() => setOpen(true)}
      >
        <IconPencil />
      </Button>
      <SheetContent className="gap-4 overflow-y-auto sm:max-w-120">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconPencil size={18} strokeWidth={1.2} />
            Edit trigger
          </SheetTitle>
          <SheetDescription className="sr-only">
            Edit this trigger
          </SheetDescription>
        </SheetHeader>
        <TriggerForm
          mode="update"
          trigger={trigger}
          products={products}
          closeSheet={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
