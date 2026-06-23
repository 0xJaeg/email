"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { updateRefundSettings } from "@/lib/settings-actions"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { IconLoader2, IconPlus, IconX } from "@tabler/icons-react"

// Configure the global refund-safety brake: a daily cap on executed refunds and
// who to email when it's hit. Posts to the admin-gated updateRefundSettings.
export function RefundSettingsForm({
  refundDailyLimit,
  refundAlertRecipients,
}: {
  refundDailyLimit: number | null
  refundAlertRecipients: string[]
}) {
  const [isPending, startTransition] = useTransition()

  // Each recipient is its own row (add / edit / remove). A stable id per row
  // keeps inputs from losing focus when a middle row is removed. On submit the
  // non-blank emails are joined into the hidden field the action already parses,
  // so the server contract (parseRecipients) is unchanged.
  const initial = refundAlertRecipients.length ? refundAlertRecipients : [""]
  const [rows, setRows] = useState(
    initial.map((email, i) => ({ id: i, email }))
  )
  const nextId = useRef(initial.length)

  const addRow = () =>
    setRows((rs) => [...rs, { id: nextId.current++, email: "" }])
  const removeRow = (id: number) =>
    setRows((rs) => rs.filter((r) => r.id !== id))
  const setEmail = (id: number, email: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, email } : r)))

  const recipientsValue = rows
    .map((r) => r.email.trim())
    .filter(Boolean)
    .join("\n")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isPending) return
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateRefundSettings(formData)
      if (res.error) toast.error(res.message)
      else toast.success(res.message)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Refund safety</CardTitle>
        <CardDescription>
          A daily cap on executed refunds, plus who to alert when it&apos;s hit.
          Refunds always require human approval — this is an extra brake on top.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="refund_daily_limit">Daily refund cap</Label>
            <Input
              id="refund_daily_limit"
              name="refund_daily_limit"
              type="number"
              min={0}
              inputMode="numeric"
              defaultValue={refundDailyLimit ?? ""}
              placeholder="No cap"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Max refunds executed per day (UTC). Blank or 0 = no cap. Once
              reached, refund approvals are paused until the next day.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Alert recipients</Label>
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={row.email}
                    onChange={(e) => setEmail(row.id, e.target.value)}
                    placeholder="ops@example.com"
                    disabled={isPending}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => removeRow(row.id)}
                    disabled={isPending}
                    aria-label="Remove recipient"
                  >
                    <IconX />
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRow}
                  disabled={isPending}
                >
                  <IconPlus />
                  Add recipient
                </Button>
              </div>
            </div>
            <input
              type="hidden"
              name="refund_alert_recipients"
              value={recipientsValue}
            />
            <p className="text-xs text-muted-foreground">
              Emailed when the daily cap is hit.
            </p>
          </div>
          <div>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <IconLoader2 className="animate-spin" />
              ) : (
                "Save settings"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
