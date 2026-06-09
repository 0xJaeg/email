// Replay a batch of authored "real" customer emails through the local pipeline
// by POSTing Svix-signed `message.received` webhooks to the API (localhost:3001).
// Reuses the same signing approach as scripts/sim-webhook.ts.
//
// Usage:
//   pnpm sim:batch [--target <url>] [--delay <ms>] [--file <path>]
//
// Same-sender refund sequences MUST be processed in order — the decision tree
// counts prior refund decisions per sender — so emails are sent sequentially
// with a delay between each to let the worker finish before the next arrives.
// Emails sharing a `thread` key land in one conversation (one thread).

import { Webhook } from "svix"
import { randomUUID } from "crypto"
import { parseArgs } from "util"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const secret = process.env.AGENT_MAIL_WEBHOOK_SECRET
if (!secret) {
  console.error(
    "Missing AGENT_MAIL_WEBHOOK_SECRET — run via `pnpm sim:batch` so .env.local is loaded."
  )
  process.exit(1)
}

type EmailFixture = {
  from: string
  subject: string
  text: string
  /** Optional grouping key: emails sharing it land in one thread (a conversation). */
  thread?: string
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    target: { type: "string", default: "http://localhost:3001" },
    delay: { type: "string", default: "10000" },
    file: { type: "string" },
  },
})

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = values.file
  ? resolve(values.file)
  : resolve(here, "fixtures/real-emails.json")
const emails: EmailFixture[] = JSON.parse(readFileSync(fixturePath, "utf8"))
const url = `${values.target}/webhooks/agent-mail`
const delayMs = Number(values.delay)
const wh = new Webhook(secret)

// Stable thread id per grouping key, so a sender's follow-ups form one thread.
const threadIds = new Map<string, string>()
function threadIdFor(key: string | undefined): string {
  const k = key ?? randomUUID()
  let id = threadIds.get(k)
  if (!id) {
    id = `thr_sim_${randomUUID().slice(0, 12)}`
    threadIds.set(k, id)
  }
  return id
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function postOne(email: EmailFixture, i: number): Promise<void> {
  const messageId = `<sim-${randomUUID()}@sim.local>`
  const threadId = threadIdFor(email.thread)
  const now = new Date().toISOString()
  const payload = {
    type: "event",
    event_type: "message.received",
    event_id: `evt_sim_${randomUUID().slice(0, 8)}`,
    message: {
      message_id: messageId,
      thread_id: threadId,
      inbox_id: "ibx_sim",
      from: email.from,
      to: ["sim-inbox@agentmail.to"],
      subject: email.subject,
      text: email.text,
      timestamp: now,
    },
    thread: {
      thread_id: threadId,
      inbox_id: "ibx_sim",
      subject: email.subject,
    },
  }
  const body = JSON.stringify(payload)
  const svixMsgId = `msg_sim_${randomUUID().slice(0, 12)}`
  const svixTimestamp = new Date()
  const signature = wh.sign(svixMsgId, svixTimestamp, body)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "svix-id": svixMsgId,
    "svix-timestamp": Math.floor(svixTimestamp.getTime() / 1000).toString(),
    "svix-signature": signature,
  }

  console.log(
    `\n[${i + 1}/${emails.length}] → ${email.from}  «${email.subject}»`
  )
  const res = await fetch(url, { method: "POST", headers, body })
  const text = await res.text()
  console.log(`    ← HTTP ${res.status}  ${text.slice(0, 140)}`)
  if (!res.ok) throw new Error(`webhook POST failed (${res.status})`)
}

async function main(): Promise<void> {
  console.log(
    `Replaying ${emails.length} emails → ${url} (delay ${delayMs}ms between sends)`
  )
  for (let i = 0; i < emails.length; i++) {
    await postOne(emails[i]!, i)
    if (i < emails.length - 1) await sleep(delayMs)
  }
  console.log(
    `\nDone — ${emails.length} emails sent. Watch the worker logs, the dashboard, and /approvals.`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
