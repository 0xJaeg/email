import { notFound, redirect } from "next/navigation"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getProduct, type ProductRow } from "@/lib/products"
import { getCredentialsForProduct } from "@/lib/credentials"
import { AddCredentialButton } from "@/components/credentials/add-credential-button"
import { DeleteCredentialButton } from "@/components/credentials/delete-credential-button"
import { ProductForm } from "@/components/products/product-form"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

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
  const credentials = await getCredentialsForProduct(id)
  const encConfigured = Boolean(process.env.CREDENTIALS_ENC_KEY)
  const cfg = product.support_config

  return (
    <div className="flex max-w-2xl flex-col gap-6">
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

      <ProductForm
        mode="update"
        product={product}
        redirectTo={`/products/${id}`}
      />

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h2 className="font-medium">Stored API keys</h2>
            <p className="text-sm text-muted-foreground">
              Encrypted at rest — shown only as the last 4 characters.
            </p>
          </div>
          <AddCredentialButton lockedProductId={product.id} />
        </div>
        {!encConfigured && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            CREDENTIALS_ENC_KEY isn&apos;t set — saving a key will fail until
            it&apos;s configured.
          </p>
        )}
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Secret</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No keys yet.
                  </TableCell>
                </TableRow>
              ) : (
                credentials.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.label}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.platform}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      ••••{c.last4 ?? ""}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(c.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="flex justify-end">
                      <DeleteCredentialButton id={c.id} label={c.label} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

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
