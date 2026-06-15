"use client"

import { type FormEvent, useState, useTransition } from "react"
import { toast } from "sonner"
import { createTemplate, updateTemplate } from "@/lib/template-actions"
import type { TemplateRow } from "@/lib/templates"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { IconLoader2 } from "@tabler/icons-react"

export function TemplateForm({
  mode,
  template,
  closeSheet,
}: {
  mode: "create" | "update"
  template?: TemplateRow
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
        ? await createTemplate(formData)
        : await updateTemplate(formData)
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
    <form
      onSubmit={onSubmit}
      className="flex flex-1 flex-col gap-4 px-4 pb-4"
    >
      {!isCreate && <input type="hidden" name="id" value={template?.id} />}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={template?.name}
          placeholder="login_help"
          className="font-mono"
          required
          disabled={isPending}
        />
        <p className="text-muted-foreground text-xs">
          A short slug the agent references (e.g. login_help).
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={template?.title}
          placeholder="Login help"
          required
          disabled={isPending}
        />
      </div>
      <div className="flex flex-1 flex-col space-y-2">
        <Label htmlFor="content">Content</Label>
        <Textarea
          id="content"
          name="content"
          defaultValue={template?.content}
          required
          disabled={isPending}
          className="max-h-[70vh] min-h-[40vh] flex-1 overflow-y-auto font-mono text-xs"
          spellCheck={false}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="is_active"
          name="is_active"
          defaultChecked={template ? template.is_active : true}
          disabled={isPending}
        />
        <Label htmlFor="is_active">Active</Label>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <IconLoader2 className="animate-spin" />
        ) : isCreate ? (
          "Create template"
        ) : (
          "Save changes"
        )}
      </Button>
    </form>
  )
}
