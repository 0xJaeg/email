"use client"

import { useTransition } from "react"
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
import { Textarea } from "@workspace/ui/components/textarea"
import { Label } from "@workspace/ui/components/label"
import { IconLoader2 } from "@tabler/icons-react"

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
              className="w-40"
            />
            <p className="text-xs text-muted-foreground">
              Max refunds executed per day (UTC). Blank or 0 = no cap. Once
              reached, refund approvals are paused until the next day.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="refund_alert_recipients">Alert recipients</Label>
            <Textarea
              id="refund_alert_recipients"
              name="refund_alert_recipients"
              defaultValue={refundAlertRecipients.join("\n")}
              placeholder={"ops@example.com\nyou@example.com"}
              disabled={isPending}
              className="min-h-20"
            />
            <p className="text-xs text-muted-foreground">
              Emailed when the daily cap is hit. One per line or comma-separated.
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
