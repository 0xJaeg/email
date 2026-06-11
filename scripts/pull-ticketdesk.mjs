// Read-only pull of ticketdesk.ai tickets → a LOCAL fixture for sim/eval.
//
// SAFETY: this talks to ticketdesk ONLY through getJson(), which throws on any
// non-GET method — it physically cannot create, edit, close, or delete a real
// ticket. Output contains customer PII, so it writes to a gitignored file
// (scripts/fixtures/ticketdesk-*.json) and nothing is ever sent back.
//
// Usage (env loaded by the npm script):
//   pnpm pull:tickets [--max <n>] [--inbox <substr>] [--days <n>] [--out <path>]
//     --max    matching tickets to KEEP (default 50)
//     --inbox  case-insensitive substring match on inbox name (e.g. "Mobile Profits")
//     --days   keep only tickets whose created_at is within the last N days
//     --out    output path (default scripts/fixtures/ticketdesk-real.json)
//
// Then replay through the LOCAL pipeline (does NOT touch ticketdesk):
//   pnpm sim:batch --file scripts/fixtures/ticketdesk-real.json

import { writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const BASE = process.env.TICKETDESK_API_BASE
const KEY = process.env.TICKETDESK_API_KEY
if (!BASE || !KEY) {
  console.error(
    "Missing TICKETDESK_API_BASE / TICKETDESK_API_KEY — set them in .env.local."
  )
  process.exit(1)
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    max: { type: "string", default: "50" },
    inbox: { type: "string" },
    days: { type: "string" },
    out: { type: "string" },
  },
})

const MAX = Number(values.max)
const PAGE = 100
const DAYS = values.days ? Number(values.days) : null
const INBOX = values.inbox ? values.inbox.toLowerCase() : null
// Cap how many tickets we scan to find MAX matches, so a rare inbox can't walk
// the entire 219k-row table.
const SCAN_MAX = Math.max(3000, MAX * 15)
const here = dirname(fileURLToPath(import.meta.url))
const outPath = values.out
  ? resolve(values.out)
  : resolve(here, "fixtures/ticketdesk-real.json")

// --- GET-only guard: the ONLY path to ticketdesk. Throws on any write. ---
async function getJson(url, method = "GET") {
  if (method !== "GET") {
    throw new Error(`Refusing non-GET request (${method}) — this puller is read-only.`)
  }
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GET ${url} → HTTP ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// BASE already includes /v1/tickets; append pagination params.
function pageUrl(offset) {
  const u = new URL(BASE)
  u.searchParams.set("limit", String(PAGE))
  u.searchParams.set("offset", String(offset))
  return u.toString()
}

// Real inbound (Agent Mail) gives us plaintext; ticketdesk bodies are sometimes
// HTML. Strip to text so the eval matches what our pipeline normally sees.
function htmlToText(s) {
  if (!s) return ""
  if (!/<\s*[a-z!/][^>]*>/i.test(s)) return s.trim()
  return s
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function keep(t) {
  if (INBOX && !((t.inbox?.name ?? "").toLowerCase().includes(INBOX))) return false
  if (DAYS != null) {
    const ts = Date.parse(t.created_at ?? "")
    if (!(Number.isFinite(ts) && ts >= Date.now() - DAYS * 86_400_000)) return false
  }
  return true
}

const kept = []
let offset = 0
let total = Infinity
let scanned = 0
while (kept.length < MAX && offset < total && scanned < SCAN_MAX) {
  const data = await getJson(pageUrl(offset))
  total =
    typeof data.total === "number" ? data.total : offset + (data.result?.length ?? 0)
  const batch = Array.isArray(data.result) ? data.result : []
  if (batch.length === 0) break
  for (const t of batch) {
    scanned++
    if (keep(t)) kept.push(t)
    if (kept.length >= MAX) break
  }
  offset += batch.length
  console.log(`  scanned ${scanned}, matched ${kept.length}/${MAX} (offset ${offset}/${total})`)
  if (kept.length < MAX && offset < total && scanned < SCAN_MAX) await sleep(300)
}
if (scanned >= SCAN_MAX && kept.length < MAX) {
  console.log(`  (hit scan cap ${SCAN_MAX} before reaching --max ${MAX})`)
}

// Map → the sim-batch fixture shape { from, subject, text, thread }.
const fixtures = kept.map((t) => ({
  from: t.requester?.email ?? "unknown@unknown.invalid",
  subject: t.subject ?? "(no subject)",
  text: htmlToText(t.description),
  thread: `td-${t.ticket_id}`,
}))

writeFileSync(outPath, JSON.stringify(fixtures, null, 2) + "\n")
console.log(`\nWrote ${fixtures.length} tickets → ${outPath}`)

const ibCount = {}
for (const t of kept) {
  const n = t.inbox?.name ?? "?"
  ibCount[n] = (ibCount[n] ?? 0) + 1
}
console.log("  kept by inbox:", ibCount)

const dates = kept
  .map((t) => t.created_at)
  .filter(Boolean)
  .sort()
if (dates.length) {
  console.log(`  created_at range: ${dates[0]} … ${dates[dates.length - 1]}`)
}

// PII-safe preview of the first mapped fixture.
const p = fixtures[0]
if (p) {
  const masked = p.from.replace(/^(.).*(@.*)$/, "$1***$2")
  console.log(
    `  e.g. { from: ${masked}, subject: ${JSON.stringify(
      p.subject.slice(0, 60)
    )}, text: "${p.text.length} chars", thread: ${p.thread} }`
  )
}

console.log("\nRead-only pull complete — nothing was written to ticketdesk.")
console.log(`Replay through the LOCAL pipeline with:\n  pnpm sim:batch --file ${outPath}`)
