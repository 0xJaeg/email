"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { deleteCredential } from "@/lib/credential-actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { IconTrash, IconLoader2 } from "@tabler/icons-react"

export function DeleteCredentialButton({
  id,
  label,
}: {
  id: string
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onConfirm() {
    startTransition(async () => {
      const result = await deleteCredential(id)
      if (result.error) {
        toast.error(result.message)
      } else {
        toast.success(result.message)
        setOpen(false)
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Delete credential">
          <IconTrash />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete credential</AlertDialogTitle>
          <AlertDialogDescription>
            Delete “{label}”? Any product using it will fall back to failing
            closed until a new key is added. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={isPending}
            className="bg-destructive hover:bg-destructive/90 text-white"
          >
            {isPending ? <IconLoader2 className="animate-spin" /> : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
