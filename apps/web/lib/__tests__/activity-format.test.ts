import { describe, it, expect } from "vitest"
import {
  humanizeAction,
  humanizeError,
  humanizeDecisionStatus,
} from "../activity-format.js"

describe("humanizeAction", () => {
  it("maps known machine actions to plain phrases", () => {
    expect(humanizeAction("webhook_received")).toBe("Email received")
    expect(humanizeAction("classify_email")).toBe("Email classified")
    expect(humanizeAction("generate_reply_failed")).toBe(
      "Couldn't draft a reply"
    )
    expect(humanizeAction("refund_pending_approval")).toBe(
      "Refund waiting for approval"
    )
    expect(humanizeAction("reply_pending_approval")).toBe(
      "Reply waiting for approval"
    )
    expect(humanizeAction("send_reply")).toBe("Reply sent")
    expect(humanizeAction("refund_customer_stub")).toBe(
      "Refund issued (test mode)"
    )
    expect(humanizeAction("reject_refund")).toBe("Refund rejected")
    expect(humanizeAction("reject_decision")).toBe("Rejected by operator")
    expect(humanizeAction("approve_decision_failed")).toBe("Approval failed")
    expect(humanizeAction("unknown_inbox")).toBe(
      "Email to an unrecognized inbox"
    )
    expect(humanizeAction("gather_context")).toBe("Checked purchase & access")
    expect(humanizeAction("suppress_contact")).toBe("Added to suppression list")
    expect(humanizeAction("draft_edited")).toBe("Draft edited before approval")
  })

  it("prettifies unknown actions instead of showing raw snake_case", () => {
    expect(humanizeAction("some_new_event")).toBe("Some new event")
  })
})

describe("humanizeError", () => {
  it("replaces known internal errors with operator-friendly text", () => {
    expect(humanizeError("no_sender_inbox: add it in Inboxes")).toBe(
      "No Agent Mail inbox is registered for this conversation"
    )
    expect(humanizeError("signature_verification_failed: bad sig")).toBe(
      "Couldn't verify the incoming email's signature"
    )
  })

  it("passes through unknown errors unchanged", () => {
    expect(humanizeError("database connection lost")).toBe(
      "database connection lost"
    )
  })
})

describe("humanizeDecisionStatus", () => {
  it("maps lifecycle states to plain language", () => {
    expect(humanizeDecisionStatus("pending_approval")).toBe(
      "Waiting for approval"
    )
    expect(humanizeDecisionStatus("needs_human")).toBe("Needs a person")
    expect(humanizeDecisionStatus("sent")).toBe("Sent")
    expect(humanizeDecisionStatus("failed")).toBe("Send failed")
  })

  it("prettifies unknown statuses instead of raw snake_case", () => {
    expect(humanizeDecisionStatus("some_new_state")).toBe("Some new state")
  })
})
