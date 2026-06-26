// "What this step does" — plain-language, accurate descriptions of what each
// non-API action/terminal step actually does at runtime, shown on the /flows
// node panel. Lives in code (read by the panel) so it can't drift into a vague
// hand-written label. API-calling steps are covered by ROUTING_SPEC instead.
//
// Keep these honest: if the behavior is vaguer than the label implies, say so
// in `notes` (e.g. escalate sends no alert) — surfacing that is the point.

export type StepBehavior = {
  /** One-line summary of what the step does. */
  summary: string
  /** The concrete things that happen, in order. */
  steps: string[]
  /** Caveats / good-to-know (including known gaps). */
  notes?: string[]
}

export const STEP_BEHAVIOR: Record<string, StepBehavior> = {
  escalate: {
    summary: "Hands the ticket to a person to answer by hand.",
    steps: [
      "Marks the ticket as needs-human in the review queue.",
      "Drafts nothing — a person opens it and writes the reply from scratch.",
      "When they send, it goes out through Agent Mail and the ticket is marked done.",
    ],
    notes: [
      "No automatic alert is sent — the ticket waits in the queue until someone opens it.",
    ],
  },

  reply: {
    summary: "Drafts a reply for a person to approve before anything is sent.",
    steps: [
      "The AI writes a draft reply using this step's prompt and the verified customer info.",
      "The draft goes to the approval queue — nothing is sent yet.",
      "A person approves or edits it, and only then is it sent through Agent Mail.",
    ],
    notes: ["No reply is ever sent automatically — every one is approved by a person first."],
  },

  refund_ladder: {
    summary: "Decides whether to offer help or refund, and queues the refund for approval.",
    steps: [
      "Counts the sender's recent refund requests and scans the message for a chargeback threat.",
      "Picks the next rung: offer 1 → offer 2 → refund (or a chargeback apology).",
      "Drafts the reply and attaches the actual refund as a pending action.",
      "On approval, the refund is issued (up to a daily cap), then the reply is sent.",
    ],
  },

  spam_filter: {
    summary: "Screens out spam before any other step runs.",
    steps: [
      "The AI checks whether the email is spam.",
      "If it is, the ticket is quarantined and the flow stops — no reply.",
      "If it isn't, the flow continues to classification.",
    ],
  },

  classify: {
    summary: "Labels the ticket so it can be routed.",
    steps: [
      "The AI sorts the ticket into one of the editable categories.",
      "Each category sends the ticket down its own branch below.",
    ],
  },

  decide: {
    summary: "Routes the ticket based on its category.",
    steps: [
      "Refund requests go to the refund ladder.",
      "FAQs get a drafted reply.",
      "Everything else is escalated to a person.",
    ],
  },
}

// Which behavior entry a node uses. send_reply is the same node type for both
// "escalate" and a drafted reply — they differ only by config.decision — so we
// resolve it here. API nodes return null (they use ROUTING_SPEC instead).
export function behaviorKeyFor(
  nodeType: string,
  config: Record<string, unknown> | null | undefined
): string | null {
  if (nodeType === "send_reply") {
    return config?.decision === "escalate" ? "escalate" : "reply"
  }
  if (nodeType === "draft") return "reply"
  return nodeType in STEP_BEHAVIOR ? nodeType : null
}
