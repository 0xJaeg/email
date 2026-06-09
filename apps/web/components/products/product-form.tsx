"use client"

import { type FormEvent, useState, useTransition } from "react"
import { toast } from "sonner"
import { createProduct, updateProduct } from "@/lib/product-actions"
import type { ProductRow } from "@/lib/products"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { IconLoader2 } from "@tabler/icons-react"

export function ProductForm({
  mode,
  product,
  closeSheet,
}: {
  mode: "create" | "update"
  product?: ProductRow
  closeSheet: () => void
}) {
  const isCreate = mode === "create"
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      setError(null)
      const result = isCreate
        ? await createProduct(formData)
        : await updateProduct(formData)
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
    <form onSubmit={onSubmit} className="space-y-4 px-4">
      {!isCreate && <input type="hidden" name="id" value={product?.id} />}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={product?.name}
          required
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          name="slug"
          defaultValue={product?.slug}
          placeholder="mobile-profits"
          required
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="platform">Platform</Label>
        <Select
          name="platform"
          defaultValue={product?.platform ?? "clickbank"}
          disabled={isPending}
        >
          <SelectTrigger id="platform" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clickbank">clickbank</SelectItem>
            <SelectItem value="jvzoo">jvzoo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="adapter_key">Adapter</Label>
        <Select
          name="adapter_key"
          defaultValue={product?.adapter_key ?? "mock"}
          disabled={isPending}
        >
          <SelectTrigger id="adapter_key" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mock">mock (no real API)</SelectItem>
            <SelectItem value="clickbank">clickbank</SelectItem>
            <SelectItem value="jvzoo">jvzoo</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          Keep on “mock” until real API credentials are configured.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="is_active">Status</Label>
        <Select
          name="is_active"
          defaultValue={product && !product.is_active ? "inactive" : "active"}
          disabled={isPending}
        >
          <SelectTrigger id="is_active" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <IconLoader2 className="animate-spin" />
        ) : isCreate ? (
          "Create product"
        ) : (
          "Save changes"
        )}
      </Button>
    </form>
  )
}
