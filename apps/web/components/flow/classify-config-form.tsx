"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  updateClassifyCategories,
  type CategoryInput,
} from "@/lib/flow-actions"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { IconLoader2, IconPlus, IconTrash } from "@tabler/icons-react"

export type CategoryRow = {
  key: string
  label: string
  description: string
  targetNodeId: string | null
}

export type TargetOption = { id: string; title: string }

// Editable category list for a classify node: each row is a category (label /
// key / description) and the step it routes to. Saving calls
// updateClassifyCategories, which atomically rewrites the node's categories +
// branch edges.
export function ClassifyConfigForm({
  nodeId,
  initial,
  targets,
  closeSheet,
}: {
  nodeId: string
  initial: CategoryRow[]
  targets: TargetOption[]
  closeSheet: () => void
}) {
  const [rows, setRows] = useState<CategoryRow[]>(initial)
  const [isPending, startTransition] = useTransition()

  const update = (i: number, patch: Partial<CategoryRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const add = () =>
    setRows((rs) => [
      ...rs,
      {
        key: "",
        label: "",
        description: "",
        targetNodeId: targets[0]?.id ?? null,
      },
    ])
  const remove = (i: number) =>
    setRows((rs) => rs.filter((_, idx) => idx !== i))

  function onSave() {
    if (isPending) return
    const payload: CategoryInput[] = rows.map((r) => ({
      key: r.key,
      label: r.label,
      description: r.description,
      target_node_id: r.targetNodeId ?? "",
    }))
    startTransition(async () => {
      const res = await updateClassifyCategories(nodeId, payload)
      if (res.error) {
        toast.error(res.message)
      } else {
        toast.success(res.message)
        closeSheet()
      }
    })
  }

  return (
    <div className="flex flex-col gap-3 px-4">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border p-2.5">
          <div className="flex items-center gap-2">
            <Input
              value={r.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Label (e.g. Refund request)"
              disabled={isPending}
              className="flex-1"
            />
            <Input
              value={r.key}
              onChange={(e) => update(i, { key: e.target.value })}
              placeholder="key"
              disabled={isPending}
              className="w-40 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Remove category"
              onClick={() => remove(i)}
              disabled={isPending}
            >
              <IconTrash />
            </Button>
          </div>
          <Textarea
            value={r.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="When does this category apply? (guides the classifier)"
            disabled={isPending}
            className="min-h-16 text-xs"
          />
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">
              routes to
            </Label>
            <Select
              value={r.targetNodeId ?? ""}
              onValueChange={(v) => update(i, { targetNodeId: v })}
              disabled={isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a step" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={isPending}
        >
          <IconPlus className="size-4" />
          Add category
        </Button>
        <Button type="button" onClick={onSave} disabled={isPending}>
          {isPending ? (
            <IconLoader2 className="animate-spin" />
          ) : (
            "Save categories"
          )}
        </Button>
      </div>
    </div>
  )
}
