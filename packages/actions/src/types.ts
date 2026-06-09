import type { ServerClient } from "@workspace/db/client"

export type SendReplyArgs = {
  /** Agent Mail inbox id (from env). */
  inboxId: string
  /** Agent Mail message id of the inbound email being replied to. */
  inReplyToMessageId: string
  /** Plain-text reply body. */
  replyText: string
  /** Internal decision id, for audit linkage. */
  decisionId: string
  /** Internal email id — links the audit row to its thread. */
  emailId: string
  /** Customer address — recipient when sending a new message (no real thread to reply to). */
  to: string
  /** Subject for the new message (ignored on the threaded reply path). */
  subject: string
  supabase: ServerClient
}

export type SendReplyResult =
  | { ok: true; sentMessageId: string }
  | { ok: false; error: string }

export type RefundCustomerArgs = {
  decisionId: string
  customerEmail: string
  /** Best-effort extraction from email body. Mock doesn't validate; real ClickBank will. */
  orderId: string | null
  /** Optional. Mock doesn't enforce. */
  amount: number | null
  /** Which product adapter executes the refund (from products.adapter_key). */
  adapterKey: string
  supabase: ServerClient
}

export type RefundCustomerResult =
  | { ok: true; refundId: string }
  | { ok: false; error: string }

export type RefundArgs = {
  orderId: string | null
  customerEmail: string
  amount: number | null
}

export type Order = {
  orderId: string
  productName: string
  amount: number
  currency: string
  purchasedAt: string
}

export type OrderLookupResult = {
  found: boolean
  orders: Order[]
}

export type AccessResult = {
  hasAccess: boolean
  /** When access exists, the actual login/download details to send the customer. */
  details: string | null
}

// A per-product integration (ClickBank, JVZoo, …). Read-only enrichment
// (lookupOrder/checkAccess) gathers customer context before drafting a reply;
// issueRefund executes a refund on human approval.
export interface ProductAdapter {
  readonly key: string
  lookupOrder(args: { email: string }): Promise<OrderLookupResult>
  checkAccess(args: { email: string; order: Order | null }): Promise<AccessResult>
  issueRefund(args: RefundArgs): Promise<RefundCustomerResult>
}

// Mutating actions a decision proposes; executed in order on human approval.
export type ProposedAction =
  | { type: "issue_refund" }
  | { type: "suppress_contact"; reason: string }

export type SuppressContactArgs = {
  decisionId: string
  email: string
  reason: string
  supabase: ServerClient
}

export type SuppressContactResult = { ok: true } | { ok: false; error: string }
