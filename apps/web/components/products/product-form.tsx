"use client"

import { type FormEvent, useState, useTransition } from "react"
import { toast } from "sonner"
import { createProduct, updateProduct } from "@/lib/product-actions"
import type { ProductRow } from "@/lib/products"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
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
      <div className="space-y-1 border-t pt-4">
        <p className="text-sm font-medium">
          Support facts (used in customer replies)
        </p>
        <p className="text-muted-foreground text-xs">
          The agent uses ONLY these links in replies and never invents URLs.
          Leave a field blank if you don’t have it.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="support_platform">Access / membership platform</Label>
        <Input
          id="support_platform"
          name="support_platform"
          defaultValue={product?.support_config?.platform ?? ""}
          placeholder="Digistore24"
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login_url">Login / sign-in URL</Label>
        <Input
          id="login_url"
          name="login_url"
          type="url"
          defaultValue={product?.support_config?.login_url ?? ""}
          placeholder="https://..."
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reset_url">Password reset URL</Label>
        <Input
          id="reset_url"
          name="reset_url"
          type="url"
          defaultValue={product?.support_config?.reset_url ?? ""}
          placeholder="https://..."
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dashboard_url">Account dashboard URL</Label>
        <Input
          id="dashboard_url"
          name="dashboard_url"
          type="url"
          defaultValue={product?.support_config?.dashboard_url ?? ""}
          placeholder="https://..."
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="support_notes">Access notes</Label>
        <Textarea
          id="support_notes"
          name="support_notes"
          defaultValue={product?.support_config?.notes ?? ""}
          placeholder="e.g. access is emailed after purchase; use the email you bought with"
          disabled={isPending}
        />
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
