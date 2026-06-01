"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { approveRefund, rejectRefund } from "@/lib/approvals"
import { Button } from "@workspace/ui/components/button"

export function ApprovalActions({ id }: { id: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function run(action: (id: string) => Promise<unknown>) {
    setPending(true)
    try {
      await action(id)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button
        variant="default"
        size="sm"
        disabled={pending}
        onClick={() => run(approveRefund)}
      >
        Approve
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(rejectRefund)}
      >
        Reject
      </Button>
    </>
  )
}
