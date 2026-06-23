import { redirect } from "next/navigation"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getAppSettings } from "@/lib/settings"
import { RefundSettingsForm } from "@/components/settings/refund-settings-form"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()

  // Admin-only page. The settings mutation re-checks this independently.
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") redirect("/")

  const settings = await getAppSettings(admin)

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <RefundSettingsForm
        refundDailyLimit={settings.refundDailyLimit}
        refundAlertRecipients={settings.refundAlertRecipients}
      />
    </div>
  )
}
