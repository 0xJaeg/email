export const QUEUE_EMAILS = "emails" as const

// Outbound customer replies, enqueued on approval (with an optional per-node
// delay) so the send doesn't block the approval request and can land on a
// human-feeling delay. Consumed by the send processor.
export const QUEUE_SENDS = "sends" as const
