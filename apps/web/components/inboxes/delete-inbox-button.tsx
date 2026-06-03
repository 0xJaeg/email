"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { deleteInbox } from "@/lib/inbox-actions"
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

export function DeleteInboxButton({
  id,
  agentMailInboxId,
}: {
  id: string
  agentMailInboxId: string
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function onConfirm() {
    startTransition(async () => {
      const result = await deleteInbox(id)
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
        <Button variant="outline" size="icon-sm" aria-label="Delete inbox">
          <IconTrash />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete inbox</AlertDialogTitle>
          <AlertDialogDescription>
            Delete {agentMailInboxId}? New email to this inbox will fall back to
            the default product until re-added.
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
