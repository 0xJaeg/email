import { randomUUID } from "node:crypto"
import type { RefundCustomerArgs, RefundCustomerResult } from "./types.js"

export async function refundCustomer(
  args: RefundCustomerArgs
): Promise<RefundCustomerResult> {
  const refundId = `stub-${randomUUID()}`
  await args.supabase.from("audit_log").insert({
    action: "refund_customer_stub",
    status: "success",
    payload: {
      decision_id: args.decisionId,
      customer_email: args.customerEmail,
      order_id: args.orderId,
      amount: args.amount,
      refund_id: refundId,
      stub: true,
    },
  })
  return { ok: true, refundId }
}
