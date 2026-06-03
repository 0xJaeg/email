import type { RefundCustomerArgs, RefundCustomerResult } from "./types.js"
import { getAdapter } from "./get-adapter.js"

// Executes a refund through the product's adapter and records it in the audit
// log. The mock adapter never touches a real payment API (audited as a "stub"
// so the activity feed flags test-mode); real adapters (ClickBank/JVZoo) issue
// the actual refund. A failed/unconfigured adapter returns ok:false so the
// caller can rewind the approval for a human to retry.
export async function refundCustomer(
  args: RefundCustomerArgs
): Promise<RefundCustomerResult> {
  let result: RefundCustomerResult
  try {
    result = await getAdapter(args.adapterKey).issueRefund({
      orderId: args.orderId,
      customerEmail: args.customerEmail,
      amount: args.amount,
    })
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  const isMock = args.adapterKey === "mock"
  await args.supabase.from("audit_log").insert({
    action: isMock ? "refund_customer_stub" : "refund_customer",
    status: result.ok ? "success" : "failure",
    error: result.ok ? null : result.error,
    payload: {
      decision_id: args.decisionId,
      customer_email: args.customerEmail,
      order_id: args.orderId,
      amount: args.amount,
      adapter: args.adapterKey,
      ...(result.ok ? { refund_id: result.refundId } : {}),
      ...(isMock ? { mock: true } : {}),
    },
  })
  return result
}
