"use client"

import { useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Button } from "@workspace/ui/components/button"
import { IconPencil } from "@tabler/icons-react"
import { UserForm } from "./user-form"
import type { UserRow } from "@/lib/users"

export function EditUserButton({ user }: { user: UserRow }) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Edit user"
        onClick={() => setOpen(true)}
      >
        <IconPencil />
      </Button>
      <SheetContent className="gap-4 overflow-y-auto sm:max-w-[480px]">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconPencil size={18} strokeWidth={1.2} />
            Edit user
          </SheetTitle>
          <SheetDescription className="sr-only">
            Edit this user&apos;s details
          </SheetDescription>
        </SheetHeader>
        <UserForm mode="update" user={user} closeSheet={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
