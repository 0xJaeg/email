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
    <form onSubmit={onSubmit} className="space-y-4 px-4 pb-4">
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
          defaultValue={product?.adapter_key ?? "profitdashboard"}
          disabled={isPending}
        >
          <SelectTrigger id="adapter_key" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="profitdashboard">
              profitdashboard (access lookup)
            </SelectItem>
            <SelectItem value="clickbank">clickbank</SelectItem>
            <SelectItem value="jvzoo">jvzoo</SelectItem>
            <SelectItem value="digistore">digistore</SelectItem>
            <SelectItem value="mock">mock (no real API)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          profitdashboard does access / membership lookups (live). clickbank,
          jvzoo and digistore do orders + refunds once their API keys are set.
          mock returns safe canned data.
        </p>
      </div>
      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="access_product_key">Access lookup product key</Label>
        <Input
          id="access_product_key"
          name="access_product_key"
          defaultValue={product?.support_config?.access_product_key ?? ""}
          placeholder="e.g. mobile_profit"
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          For a multi-product access API (e.g. Profit Dashboard): the
          provider&apos;s product key a customer must hold to count as a member
          of this product. Leave blank to accept any membership.
        </p>
      </div>
      <div className="space-y-1 border-t pt-4">
        <p className="text-sm font-medium">
          Support facts (used in customer replies)
        </p>
        <p className="text-xs text-muted-foreground">
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
      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="signature">Reply signature</Label>
        <Textarea
          id="signature"
          name="signature"
          defaultValue={product?.support_config?.signature ?? ""}
          placeholder={"Best,\nThe Mobile Profits Team"}
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          Appended to every outbound reply (agent + manual). Leave blank for
          none.
        </p>
      </div>
      <div className="space-y-1 border-t pt-4">
        <p className="text-sm font-medium">Refund policy</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="refund_threshold">Refund after N requests</Label>
        <Input
          id="refund_threshold"
          name="refund_threshold"
          type="number"
          min="1"
          step="1"
          defaultValue={product?.refund_threshold ?? ""}
          placeholder="3 (default)"
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          After this many refund requests from the same customer, the agent
          drafts a refund instead of another retention offer. Blank uses the
          default of 3 (offer twice, then refund).
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
      {error && <p className="text-sm text-destructive">{error}</p>}
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
