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
import { ProductForm } from "./product-form"

export function AddProductButton() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <IconPlus />
          <span className="hidden md:block">New product</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-4 overflow-y-auto sm:max-w-150">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconPlus size={18} strokeWidth={1.2} />
            Create product
          </SheetTitle>
          <SheetDescription />
        </SheetHeader>
        <ProductForm mode="create" closeSheet={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
