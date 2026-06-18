"use client"

import { type FormEvent, useState, useTransition } from "react"
import { toast } from "sonner"
import { createUser, updateUser } from "@/lib/user-actions"
import type { UserRow } from "@/lib/users"
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

export function UserForm({
  mode,
  user,
  closeSheet,
}: {
  mode: "create" | "update"
  user?: UserRow
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
        ? await createUser(formData)
        : await updateUser(formData)
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
      {!isCreate && <input type="hidden" name="id" value={user?.id} />}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={user?.email}
          autoComplete="off"
          required
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          defaultValue={user?.name ?? ""}
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Select
          name="role"
          defaultValue={user?.role ?? "operator"}
          disabled={isPending}
        >
          <SelectTrigger id="role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="operator">operator</SelectItem>
            <SelectItem value="admin">admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">
          {isCreate ? "Initial password" : "New password"}
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={6}
          autoComplete="new-password"
          required={isCreate}
          disabled={isPending}
          placeholder={isCreate ? "" : "Leave blank to keep current"}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <IconLoader2 className="animate-spin" />
        ) : isCreate ? (
          "Create user"
        ) : (
          "Save changes"
        )}
      </Button>
    </form>
  )
}
