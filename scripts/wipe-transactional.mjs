// Scoped wipe: delete ONLY the 5 transactional tables (children first, FK-safe),
// then verify. Config tables (prompt_configs, flow_steps, products, inboxes,
// action_triggers, prompt_templates, integration_credentials) and profiles are
// intentionally untouched. Run AFTER dump-transactional.mjs.
//
// Run: node --env-file=.env.local scripts/wipe-transactional.mjs
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY
if (!BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY")
  process.exit(1)
}

const h = { apikey: KEY, Authorization: `Bearer ${KEY}` }

// Children before parents so FK constraints are satisfied.
const ORDER = ["suppression_list", "audit_log", "decisions", "emails", "threads"]

console.log("Deleting transactional rows…")
for (const table of ORDER) {
  // id is the PK on all five tables; `not.is.null` matches every row.
  const res = await fetch(`${BASE}/rest/v1/${table}?id=not.is.null`, {
    method: "DELETE",
    headers: { ...h, Prefer: "return=representation" },
  })
  if (!res.ok) {
    console.error(`  delete ${table} failed (${res.status}): ${await res.text()}`)
    process.exit(1)
  }
  const rows = await res.json()
  console.log(`  ${table}: deleted ${rows.length}`)
}

console.log("\nVerifying counts (transactional should be 0, config/users intact)…")
const CHECK = [
  "threads", "emails", "decisions", "audit_log", "suppression_list",
  "prompt_configs", "flow_steps", "products", "inboxes", "profiles",
]
for (const table of CHECK) {
  const res = await fetch(`${BASE}/rest/v1/${table}?select=id`, {
    headers: { ...h, Prefer: "count=exact", Range: "0-0" },
  })
  const cr = res.headers.get("content-range") || "?/?"
  console.log(`  ${table}: ${cr.split("/")[1]}`)
}
console.log("\nScoped wipe complete.")
