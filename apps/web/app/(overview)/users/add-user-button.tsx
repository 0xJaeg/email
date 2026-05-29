"use client"

import { useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { Button } from "@workspace/ui/components/button"
import { IconPlus } from "@tabler/icons-react"
import { UserForm } from "./user-form"

export function AddUserButton() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <IconPlus />
          <span className="hidden md:block">New user</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-4 overflow-y-auto sm:max-w-[480px]">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconPlus size={18} strokeWidth={1.2} />
            Create user
          </SheetTitle>
          <SheetDescription>
            The user signs in with this email and password. No email is sent.
          </SheetDescription>
        </SheetHeader>
        <UserForm mode="create" closeSheet={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
