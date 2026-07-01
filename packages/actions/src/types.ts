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
  /** Links the audit row to the thread so it shows in the ticket's timeline. */
  emailId: string
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

// The HTTP call an adapter made, surfaced in the ticket trace so an operator can
// see the real endpoint + status — and verify a down/erroring endpoint.
export type HttpCallInfo = {
  endpoint: string
  method: string
  status: number | null
  /** Compact, PII-light summary of the request we sent (shown in the trace). */
  request?: string
  /** Compact, PII-light summary of the response we got (shown in the trace). */
  response?: string
}

export type OrderLookupResult = {
  found: boolean
  orders: Order[]
  http?: HttpCallInfo
  /** false = this adapter is a credential-pending stub (no real call was made);
   * absent/true = a real answer. The purchase-lookup node escalates when EVERY
   * platform is unconfigured (or threw), so "we couldn't check" is never
   * mistaken for "no purchase found". */
  configured?: boolean
}

export type AccessResult = {
  hasAccess: boolean
  /** When access exists, the actual login/download details to send the customer. */
  details: string | null
  http?: HttpCallInfo
}

// A per-product integration (ClickBank, JVZoo, …). Read-only enrichment
// (lookupOrder/checkAccess) gathers customer context before drafting a reply;
// issueRefund executes a refund on human approval.
export interface ProductAdapter {
  readonly key: string
  lookupOrder(args: { email: string }): Promise<OrderLookupResult>
  checkAccess(args: {
    email: string
    order: Order | null
    /** The provider's product key this product expects (e.g. "mobile_profit").
     * Adapters whose API spans multiple products gate access on a match, so a
     * member of a *different* product isn't treated as having access here. */
    expectedProductKey?: string | null
  }): Promise<AccessResult>
  issueRefund(args: RefundArgs): Promise<RefundCustomerResult>
}

// Mutating actions a decision proposes; executed in order on human approval.
export type ProposedAction =
  | { type: "issue_refund" }
  | { type: "suppress_contact"; reason: string }
  // Save-the-sale: subscribe the customer to the coaching email series instead
  // of refunding. `list` is an optional MailWizz list uid (else the env default).
  | { type: "coaching_signup"; list?: string }

export type SuppressContactArgs = {
  decisionId: string
  /** Links the audit row to the thread so it shows in the ticket's timeline. */
  emailId: string
  email: string
  reason: string
  supabase: ServerClient
}

export type SuppressContactResult = { ok: true } | { ok: false; error: string }

export type CoachingSignupArgs = {
  decisionId: string
  /** Links the audit row to the thread so it shows in the ticket's timeline. */
  emailId: string
  email: string
  /** Optional MailWizz list uid; falls back to the env default. */
  list?: string
  supabase: ServerClient
}

// Best-effort: a failed/not-configured signup must NOT block the retention
// reply (the caller sends it anyway). `detail` is "subscribed" /
// "skipped (development)" / "not_configured" / "http_<status>" / an error.
export type CoachingSignupResult = { ok: boolean; detail: string }
