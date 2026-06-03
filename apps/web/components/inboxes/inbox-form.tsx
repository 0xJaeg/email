"use client"

import { type FormEvent, useState, useTransition } from "react"
import { toast } from "sonner"
import { createInbox, updateInbox } from "@/lib/inbox-actions"
import type { InboxRow, ProductOption } from "@/lib/inboxes"
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

export function InboxForm({
  mode,
  inbox,
  products,
  closeSheet,
}: {
  mode: "create" | "update"
  inbox?: InboxRow
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
        ? await createInbox(formData)
        : await updateInbox(formData)
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
      {!isCreate && <input type="hidden" name="id" value={inbox?.id} />}
      <div className="space-y-2">
        <Label htmlFor="product_id">Product</Label>
        <Select
          name="product_id"
          defaultValue={inbox?.product_id ?? products[0]?.id}
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
        <Label htmlFor="agent_mail_inbox_id">Agent Mail inbox id</Label>
        <Input
          id="agent_mail_inbox_id"
          name="agent_mail_inbox_id"
          defaultValue={inbox?.agent_mail_inbox_id}
          placeholder="name@agentmail.to"
          required
          disabled={isPending}
        />
        <p className="text-muted-foreground text-xs">
          Must match the <code>inbox_id</code> Agent Mail sends in its webhook.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address (display)</Label>
        <Input
          id="address"
          name="address"
          defaultValue={inbox?.address ?? ""}
          placeholder="support@yourdomain.com"
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="is_active">Status</Label>
        <Select
          name="is_active"
          defaultValue={inbox && !inbox.is_active ? "inactive" : "active"}
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
          "Create inbox"
        ) : (
          "Save changes"
        )}
      </Button>
    </form>
  )
}
