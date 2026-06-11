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
import { ProductForm } from "./product-form"
import type { ProductRow } from "@/lib/products"

export function EditProductButton({ product }: { product: ProductRow }) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Edit product"
        onClick={() => setOpen(true)}
      >
        <IconPencil />
      </Button>
      <SheetContent className="gap-4 overflow-y-auto sm:max-w-150!">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconPencil size={18} strokeWidth={1.2} />
            Edit product
          </SheetTitle>
          <SheetDescription className="sr-only">
            Edit this product
          </SheetDescription>
        </SheetHeader>
        <ProductForm
          mode="update"
          product={product}
          closeSheet={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
