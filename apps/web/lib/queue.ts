import "server-only"
import { Queue } from "bullmq"
import { Redis } from "ioredis"

// Producer for the outbound reply queue. approveDecision enqueues an approved
// reply here (optionally delayed); the worker consumes QUEUE_SENDS and sends it
// via Agent Mail. Kept server-only — never import from a client component.
export const QUEUE_SENDS = "sends" as const

let queue: Queue | undefined

export function getSendsQueue(): Queue {
  if (queue) return queue
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379"
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
  queue = new Queue(QUEUE_SENDS, { connection })
  return queue
}
