"use client"

import { type FormEvent, useState, useTransition } from "react"
import { toast } from "sonner"
import { createTrigger, updateTrigger } from "@/lib/trigger-actions"
import type { TriggerRow } from "@/lib/triggers"
import type { ProductOption } from "@/lib/inboxes"
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

export function TriggerForm({
  mode,
  trigger,
  products,
  closeSheet,
}: {
  mode: "create" | "update"
  trigger?: TriggerRow
  products: ProductOption[]
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
        ? await createTrigger(formData)
        : await updateTrigger(formData)
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
      {!isCreate && <input type="hidden" name="id" value={trigger?.id} />}
      <div className="space-y-2">
        <Label htmlFor="product_id">Product</Label>
        <Select
          name="product_id"
          defaultValue={trigger?.product_id ?? products[0]?.id}
          disabled={isPending}
        >
          <SelectTrigger id="product_id" className="w-full">
            <SelectValue placeholder="Select a product" />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="after_n_requests">Refund after N requests</Label>
        <Input
          id="after_n_requests"
          name="after_n_requests"
          type="number"
          min={1}
          step={1}
          defaultValue={trigger?.after_n_requests ?? 3}
          required
          disabled={isPending}
        />
        <p className="text-muted-foreground text-xs">
          The agent proposes a refund on the Nth refund request, offering
          retention first. Default is 3 (offer twice, then refund).
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="is_active">Status</Label>
        <Select
          name="is_active"
          defaultValue={trigger && !trigger.is_active ? "inactive" : "active"}
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
          "Create trigger"
        ) : (
          "Save changes"
        )}
      </Button>
    </form>
  )
}
