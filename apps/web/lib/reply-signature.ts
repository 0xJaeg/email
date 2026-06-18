import type { ServerClient } from "@workspace/db/client"

// The product's configured reply signature (products.support_config.signature)
// for a thread, appended to outbound replies at send time. Returns null when
// unset or the thread isn't routed to a product.
export async function getReplySignature(
  supabase: ServerClient,
  threadId: string | null
): Promise<string | null> {
  if (!threadId) return null
  const { data: thread } = await supabase
    .from("threads")
    .select("product_id")
    .eq("id", threadId)
    .maybeSingle()
  if (!thread?.product_id) return null
  const { data: product } = await supabase
    .from("products")
    .select("support_config")
    .eq("id", thread.product_id)
    .maybeSingle()
  const sig = (product?.support_config as { signature?: unknown } | null)
    ?.signature
  return typeof sig === "string" && sig.trim() ? sig.trim() : null
}

// Append the signature as its own block, if present.
export function withSignature(text: string, signature: string | null): string {
  return signature ? `${text}\n\n${signature}` : text
}
