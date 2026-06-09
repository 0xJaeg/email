import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getProductOptions } from "@/lib/inboxes"
import { AddCredentialButton } from "@/components/credentials/add-credential-button"
import { CredentialsTable } from "@/components/credentials/credentials-table"

export const dynamic = "force-dynamic"

export default async function CredentialsPage() {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()

  // Admin-only page. The credential mutations re-check this independently.
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") redirect("/")

  const products = await getProductOptions()
  const encConfigured = Boolean(process.env.CREDENTIALS_ENC_KEY)

  return (
    <div className="flex flex-col gap-2 md:gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">API credentials</h1>
          <p className="text-muted-foreground text-sm">
            Per-product ClickBank/JVZoo keys — encrypted at rest, shown only as
            the last 4 characters.
          </p>
        </div>
        <AddCredentialButton products={products} />
      </div>

      {!encConfigured && (
        <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
          CREDENTIALS_ENC_KEY isn&apos;t set — saving a credential will fail
          until it&apos;s configured in the environment.
        </p>
      )}

      <Suspense
        fallback={<p className="text-muted-foreground text-sm">Loading…</p>}
      >
        <CredentialsTable products={products} />
      </Suspense>
    </div>
  )
}
