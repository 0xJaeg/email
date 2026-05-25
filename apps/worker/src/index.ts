import { config as dotenvFlowConfig } from "dotenv-flow"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import { Worker } from "bullmq"
import { Redis } from "ioredis"
import { processEmail } from "./processors/email.js"
import { QUEUE_EMAILS } from "./queues.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenvFlowConfig({ path: resolve(__dirname, "../../..") })

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379"
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null })

const worker = new Worker(QUEUE_EMAILS, processEmail, { connection })

worker.on("ready", () => {
  console.log(`[worker] ready, listening to queue: ${QUEUE_EMAILS}`)
})

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err)
})
