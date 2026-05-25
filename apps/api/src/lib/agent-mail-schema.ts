import { z } from "zod"

export const MessageReceivedEventType = z.enum([
  "message.received",
  "message.received.spam",
  "message.received.blocked",
  "message.received.unauthenticated",
])

const AgentMailMessage = z
  .object({
    message_id: z.string(),
    thread_id: z.string(),
    inbox_id: z.string(),
    from: z.string(),
    to: z.array(z.string()),
    subject: z.string().nullish(),
    text: z.string().nullish(),
    html: z.string().nullish(),
    timestamp: z.string(),
  })
  .passthrough()

const AgentMailThread = z
  .object({
    thread_id: z.string(),
    inbox_id: z.string(),
    subject: z.string().nullish(),
  })
  .passthrough()

export const MessageReceivedEvent = z.object({
  type: z.literal("event"),
  event_type: MessageReceivedEventType,
  event_id: z.string(),
  message: AgentMailMessage,
  thread: AgentMailThread,
})

export type MessageReceivedEvent = z.infer<typeof MessageReceivedEvent>
