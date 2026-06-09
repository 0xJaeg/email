// Turns the audit_log's machine-written values into plain language for the
// operator-facing Activity feed. `action` strings are written across the API,
// worker, and action layer; keep this map in sync when new actions are added.

const ACTION_LABELS: Record<string, string> = {
  webhook_received: "Email received",
  enqueue: "Queued for processing",
  classify_email: "Email classified",
  gather_context: "Checked purchase & access",
  unknown_inbox: "Email to an unrecognized inbox",
  escalate_needs_human: "Flagged for human review",
  generate_reply_failed: "Couldn't draft a reply",
  refund_pending_approval: "Refund waiting for approval",
  reply_pending_approval: "Reply waiting for approval",
  send_reply: "Reply sent",
  refund_customer_stub: "Refund issued (test mode)",
  refund_customer: "Refund issued",
  suppress_contact: "Added to suppression list",
  approve_decision_noop: "Already handled",
  approve_decision_failed: "Approval failed",
  reject_decision: "Rejected by operator",
  reject_decision_noop: "Already handled",
  // Legacy action names kept so historical audit rows still render cleanly.
  approve_refund_noop: "Refund already handled",
  approve_refund_failed: "Refund approval failed",
  reject_refund: "Refund rejected",
  reject_refund_noop: "Refund already handled",
}

export function humanizeAction(action: string): string {
  const known = ACTION_LABELS[action]
  if (known) return known
  // Unknown action: prettify rather than leak raw snake_case.
  const spaced = action.replace(/_/g, " ").trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// Internal error strings leak implementation detail (env var names, etc.).
// Soften the ones an operator might actually see; pass the rest through so we
// never hide a genuinely unexpected failure.
const ERROR_LABELS: { match: RegExp; friendly: string }[] = [
  {
    match: /AGENT_MAIL_INBOX_ID is not set/i,
    friendly: "Email sending isn't set up yet",
  },
  {
    match: /signature_verification_failed/i,
    friendly: "Couldn't verify the incoming email's signature",
  },
]

export function humanizeError(error: string): string {
  for (const { match, friendly } of ERROR_LABELS) {
    if (match.test(error)) return friendly
  }
  return error
}
