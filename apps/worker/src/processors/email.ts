import type { Job } from "bullmq"

// Slice C will fill in classify → decide → act. Foundation: log + complete.
export async function processEmail(job: Job) {
  console.log(`[worker] processing job ${job.id}`, job.data)
  return { ok: true }
}
