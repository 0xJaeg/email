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
import { InboxForm } from "./inbox-form"
import type { InboxRow, ProductOption } from "@/lib/inboxes"

export function EditInboxButton({
  inbox,
  products,
}: {
  inbox: InboxRow
  products: ProductOption[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Edit inbox"
        onClick={() => setOpen(true)}
      >
        <IconPencil />
      </Button>
      <SheetContent className="gap-4 overflow-y-auto sm:max-w-120">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconPencil size={18} strokeWidth={1.2} />
            Edit inbox
          </SheetTitle>
          <SheetDescription className="sr-only">
            Edit this inbox
          </SheetDescription>
        </SheetHeader>
        <InboxForm
          mode="update"
          inbox={inbox}
          products={products}
          closeSheet={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
