"use client"

import { useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { Button } from "@workspace/ui/components/button"
import { IconPlus } from "@tabler/icons-react"
import { TriggerForm } from "./trigger-form"
import type { ProductOption } from "@/lib/inboxes"

export function AddTriggerButton({ products }: { products: ProductOption[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button disabled={products.length === 0}>
          <IconPlus />
          <span className="hidden md:block">New trigger</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-4 overflow-y-auto sm:max-w-120">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconPlus size={18} strokeWidth={1.2} />
            Create trigger
          </SheetTitle>
          <SheetDescription />
        </SheetHeader>
        <TriggerForm
          mode="create"
          products={products}
          closeSheet={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
