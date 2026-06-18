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
    <form onSubmit={onSubmit} className="space-y-4 px-4 pb-4">
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
      {isCreate ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              placeholder="support"
              required
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Creates a new Agent Mail inbox at{" "}
              <code>username@agentmail.to</code>.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="display_name">Display name</Label>
            <Input
              id="display_name"
              name="display_name"
              placeholder="Support"
              required
              disabled={isPending}
            />
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Label>Agent Mail inbox</Label>
          <p className="font-mono text-sm text-muted-foreground">
            {inbox?.agent_mail_inbox_id}
          </p>
          <p className="text-xs text-muted-foreground">
            The address is fixed once created — edit the product mapping or
            status below.
          </p>
        </div>
      )}
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
      {error && <p className="text-sm text-destructive">{error}</p>}
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
