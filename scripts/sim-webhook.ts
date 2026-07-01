// Simulate an inbound AgentMail webhook by POSTing a Svix-signed payload
// to localhost:3001/webhooks/agent-mail. Exercises the full pipeline:
// Svix verify -> Zod parse -> Supabase persist -> BullMQ enqueue -> worker.
//
// Usage:
//   pnpm sim <scenario> [--sender <email>] [--target <url>] [--thread <id>]
//
//   --thread reuses an existing thread id so a scenario lands as a REPLY — used
//   to drive the save-the-sale resume path (offer -> approve+send -> reply).
//
// Scenarios:
//   refund1        Alice asks for a refund (no reason) -> no_problem -> coaching offer
//   refund2        Alice's second refund               -> decide=send_offer_2 (run refund1 first)
//   refund3        Alice's third refund                -> decide=issue_refund (run refund1,2 first)
//   refund_problem Alice refund WITH a stated problem  -> problem branch (help, then await reply)
//   reply_decline  "no thanks, still want the refund"  -> resumes: not_accepted -> refund_issue
//   reply_accept   "sure, I'll try the coaching"       -> resumes: accepted -> do nothing
//   chargeback     Bob threatens chargeback            -> Sonnet fires on Bob's *second* call
//   faq            Charlie asks an FAQ                 -> decide=send_faq_reply
//   other          Dave sends a thank-you             -> decide=escalate
//
// Save-the-sale replay (needs the new refund tree deployed to the worker):
//   pnpm sim refund1                          # no-reason refund -> coaching offer (note the thread id)
//   # approve it in /approvals so the send worker stamps the thread's resume cursor
//   pnpm sim reply_decline --thread thr_sim_… # reply on the same thread -> refund drafted for approval

import { Webhook } from "svix"
import { randomUUID } from "crypto"
import { parseArgs } from "util"

const secret = process.env.AGENT_MAIL_WEBHOOK_SECRET
if (!secret) {
  console.error(
    "Missing AGENT_MAIL_WEBHOOK_SECRET — run via `pnpm sim` so .env.local is loaded."
  )
  process.exit(1)
}

type Scenario = { from: string; subject: string; text: string }

const SCENARIOS: Record<string, Scenario> = {
  refund1: {
    from: "Alice Sim <alice@sim.local>",
    subject: "I want a refund",
    text: "Hi, I bought your product yesterday and I'd like to get a refund please.",
  },
  refund2: {
    from: "Alice Sim <alice@sim.local>",
    subject: "Still want my refund",
    text: "Hi, following up — I still want a refund. The product isn't working for me.",
  },
  refund3: {
    from: "Alice Sim <alice@sim.local>",
    subject: "Refund please — third time asking",
    text: "Please just refund my purchase already. Final ask.",
  },
  refund_problem: {
    from: "Alice Sim <alice@sim.local>",
    subject: "Refund — the export is broken",
    text: "I want a refund. The video export button does nothing when I click it, so the product doesn't work for me.",
  },
  reply_decline: {
    from: "Alice Sim <alice@sim.local>",
    subject: "Re: about your refund",
    text: "No thanks, I'm not interested in the coaching emails. I just want the refund please.",
  },
  reply_accept: {
    from: "Alice Sim <alice@sim.local>",
    subject: "Re: about your refund",
    text: "Oh nice, sure — I'll give the coaching series a try before deciding. Thanks!",
  },
  chargeback: {
    from: "Bob Sim <bob@sim.local>",
    subject: "Refund or I'm filing a chargeback",
    text: "I want my money back. If I don't hear back today I'm contacting my bank to file a chargeback with my credit card company.",
  },
  faq: {
    from: "Charlie Sim <charlie@sim.local>",
    subject: "Can't log in",
    text: "Hi, I can't log in to my account. How do I reset my password? I don't see a reset link in my inbox.",
  },
  other: {
    from: "Dave Sim <dave@sim.local>",
    subject: "thanks!",
    text: "Just wanted to say thanks for the product — it's been great so far.",
  },
}

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    target: { type: "string", default: "http://localhost:3001" },
    sender: { type: "string" },
    thread: { type: "string" },
  },
  allowPositionals: true,
})

const name = positionals[0]
if (!name || !(name in SCENARIOS)) {
  console.error(
    `Usage: pnpm sim <scenario> [--sender <email>] [--target <url>]`
  )
  console.error(`Scenarios: ${Object.keys(SCENARIOS).join(", ")}`)
  process.exit(1)
}

const scenario = SCENARIOS[name]!
const from = values.sender
  ? `Sim <${values.sender}>`
  : scenario.from
const url = `${values.target}/webhooks/agent-mail`

const messageId = `<sim-${randomUUID()}@sim.local>`
// --thread reuses an existing thread so this lands as a reply (resume path).
const threadId = values.thread ?? `thr_sim_${randomUUID().slice(0, 12)}`
const now = new Date().toISOString()

const payload = {
  type: "event",
  event_type: "message.received",
  event_id: `evt_sim_${randomUUID().slice(0, 8)}`,
  message: {
    message_id: messageId,
    thread_id: threadId,
    inbox_id: "ibx_sim",
    from,
    to: ["sim-inbox@agentmail.to"],
    subject: scenario.subject,
    text: scenario.text,
    timestamp: now,
  },
  thread: {
    thread_id: threadId,
    inbox_id: "ibx_sim",
    subject: scenario.subject,
  },
}

const body = JSON.stringify(payload)
const wh = new Webhook(secret)
const svixMsgId = `msg_sim_${randomUUID().slice(0, 12)}`
const svixTimestamp = new Date()
const signature = wh.sign(svixMsgId, svixTimestamp, body)
const signedHeaders: Record<string, string> = {
  "svix-id": svixMsgId,
  "svix-timestamp": Math.floor(svixTimestamp.getTime() / 1000).toString(),
  "svix-signature": signature,
}

async function main(): Promise<void> {
  console.log(`→ POST ${url}`)
  console.log(`  scenario:  ${name}`)
  console.log(`  from:      ${from}`)
  console.log(`  subject:   ${scenario.subject}`)
  console.log(`  message:   ${messageId}`)
  console.log(`  thread:    ${threadId}`)

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...signedHeaders },
    body,
  })

  const respText = await response.text()
  console.log(`← HTTP ${response.status}`)
  console.log(`  ${respText}`)
  if (!response.ok) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
