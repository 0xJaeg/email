import { Queue } from "bullmq"
import { Redis } from "ioredis"

export const QUEUE_EMAILS = "emails" as const

let queue: Queue | undefined

export function getEmailsQueue(): Queue {
  if (queue) return queue
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379"
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
  queue = new Queue(QUEUE_EMAILS, { connection })
  return queue
}
