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
  /** Best-effort extraction from email body. Stub doesn't validate; real ClickBank will. */
  orderId: string | null
  /** Optional. Stub doesn't enforce. */
  amount: number | null
  supabase: ServerClient
}

export type RefundCustomerResult =
  | { ok: true; refundId: string }
  | { ok: false; error: string }
