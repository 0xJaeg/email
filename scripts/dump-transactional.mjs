// One-off safety net: dump the transactional tables to local JSON before a
// scoped wipe (so a re-sim starts from a clean slate but the old rows are
// recoverable). Config tables (prompt_configs, flow_steps, products, …) and
// profiles are intentionally NOT dumped — they're kept, not deleted.
//
// Run: node --env-file=.env.local scripts/dump-transactional.mjs
import { mkdirSync, writeFileSync } from "node:fs"

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY
if (!BASE || !KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY — run via `node --env-file=.env.local`."
  )
  process.exit(1)
}

const TABLES = ["threads", "emails", "decisions", "audit_log", "suppression_list"]
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const dir = `scripts/snapshots/${stamp}`
mkdirSync(dir, { recursive: true })

for (const table of TABLES) {
  const res = await fetch(`${BASE}/rest/v1/${table}?select=*`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) {
    console.error(`Dump ${table} failed (${res.status}): ${await res.text()}`)
    process.exit(1)
  }
  const rows = await res.json()
  writeFileSync(`${dir}/${table}.json`, JSON.stringify(rows, null, 2))
  console.log(`  ${table}: ${rows.length} rows`)
}
console.log(`\nSnapshot complete → ${dir}`)
