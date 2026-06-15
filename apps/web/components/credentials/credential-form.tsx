"use client"

import { type FormEvent, useState, useTransition } from "react"
import { toast } from "sonner"
import { createCredential } from "@/lib/credential-actions"
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

export function CredentialForm({
  products,
  lockedProductId,
  closeSheet,
}: {
  products?: ProductOption[]
  lockedProductId?: string
  closeSheet: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      setError(null)
      const result = await createCredential(formData)
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
      {lockedProductId ? (
        <input type="hidden" name="product_id" value={lockedProductId} />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="product_id">Product</Label>
          <Select
            name="product_id"
            defaultValue={products?.[0]?.id}
            disabled={isPending}
          >
            <SelectTrigger id="product_id" className="w-full">
              <SelectValue placeholder="Select a product" />
            </SelectTrigger>
            <SelectContent>
              {(products ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="platform">Platform</Label>
        <Select name="platform" defaultValue="clickbank" disabled={isPending}>
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
        <Label htmlFor="label">Label</Label>
        <Input
          id="label"
          name="label"
          placeholder="e.g. ClickBank API key"
          required
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="secret">Secret</Label>
        <Input
          id="secret"
          name="secret"
          type="password"
          autoComplete="off"
          required
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          Stored encrypted at rest. You&apos;ll only ever see the last 4
          characters after saving — to change it, delete and re-add.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <IconLoader2 className="animate-spin" />
        ) : (
          "Save credential"
        )}
      </Button>
    </form>
  )
}
