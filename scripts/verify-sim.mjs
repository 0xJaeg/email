// Summarize the decisions produced by the latest sim run.
// Run: node --env-file=.env.local scripts/verify-sim.mjs
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY
const h = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const sel =
  "select=created_at,classification,decision,status,context,proposed_actions,emails(from_email,subject)&order=created_at.asc"
const rows = await (await fetch(`${BASE}/rest/v1/decisions?${sel}`, { headers: h })).json()

const count = async (t) => {
  const r = await fetch(`${BASE}/rest/v1/${t}?select=id`, { headers: { ...h, Prefer: "count=exact", Range: "0-0" } })
  return (r.headers.get("content-range") || "?/?").split("/")[1]
}
console.log(`threads=${await count("threads")} emails=${await count("emails")} decisions=${await count("decisions")} audit_log=${await count("audit_log")}\n`)

for (const d of rows) {
  const who = (d.emails?.from_email || "?").replace("dev+", "").split("@")[0]
  const ctx = d.context || {}
  const order = ctx.orders?.length ? `order:${ctx.orders[0].orderId}` : "no-order"
  const access = ctx.access ? (ctx.access.hasAccess ? "access:yes" : "access:no") : "access:-"
  const acts = (d.proposed_actions || []).map((a) => a.type).join("+") || "-"
  console.log(
    `  ${who.padEnd(9)} ${(d.classification || "-").padEnd(14)} -> ${(d.decision || "-").padEnd(24)} [${(d.status || "-").padEnd(16)}] ${order} ${access} act:${acts}`
  )
}
