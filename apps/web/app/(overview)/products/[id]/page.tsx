import { notFound, redirect } from "next/navigation"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getProduct, type ProductRow } from "@/lib/products"
import { ProductForm } from "@/components/products/product-form"
import { Badge } from "@workspace/ui/components/badge"
import { IconAlertTriangle } from "@tabler/icons-react"

export const dynamic = "force-dynamic"

// Read-only, honest description of what the agent does for this product on a
// ticket — derived from the configured adapter (no real calls on mock/stub).
function agentChecksSummary(product: ProductRow): string {
  if (!product.adapter_key)
    return "No integration adapter is configured, so the agent drafts replies without looking up orders or access."
  if (product.adapter_key === "mock")
    return "Order lookup and access checks run against the mock adapter — safe canned data, no real platform calls."
  return `When a lookup is needed, the agent checks orders and access via the ${product.platform} integration (currently a stub — pending real API credentials).`
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") redirect("/")

  const { id } = await params
  const product = await getProduct(id)
  if (!product) notFound()
  const encConfigured = Boolean(process.env.CREDENTIALS_ENC_KEY)
  const cfg = product.support_config

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{product.name}</h1>
          <Badge variant={product.is_active ? "default" : "secondary"}>
            {product.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {product.slug} · {product.platform} · adapter:{" "}
          {product.adapter_key ?? "—"}
        </p>
      </div>

      {!encConfigured && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <IconAlertTriangle className="size-4 shrink-0" />
          <span>
            CREDENTIALS_ENC_KEY isn&apos;t set — saving an API key will fail
            until it&apos;s configured.
          </span>
        </div>
      )}

      <ProductForm
        mode="update"
        product={product}
        redirectTo={`/products/${id}`}
      />

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">What the agent checks</h2>
        <p className="text-sm text-muted-foreground">
          {agentChecksSummary(product)}
        </p>
        <p className="text-sm text-muted-foreground">
          {cfg.access_product_key
            ? `Access lookups only count membership of product key "${cfg.access_product_key}".`
            : "Access lookups accept any membership returned (no product key set)."}
        </p>
      </section>
    </div>
  )
}
