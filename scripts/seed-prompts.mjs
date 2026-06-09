// Seeds prompt_configs from the version-controlled instructions/*.md files.
// Run AFTER applying the prompt_configs migration:
//   set -a; source .env.local; set +a; node scripts/seed-prompts.mjs
// Idempotent: upserts on the unique `kind`.
import { readFileSync } from "node:fs"

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY
if (!BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY — `source .env.local` first.")
  process.exit(1)
}

const FILES = [
  ["instructions/README.md", "overview"],
  ["instructions/classifier.md", "classifier"],
  ["instructions/policies/refund.md", "policy_refund"],
  ["instructions/policies/common-questions.md", "policy_faq"],
  ["instructions/tone/voice.md", "tone"],
]

const rows = FILES.map(([path, kind]) => ({
  kind,
  content: readFileSync(path, "utf8"),
}))

const res = await fetch(`${BASE}/rest/v1/prompt_configs?on_conflict=kind`, {
  method: "POST",
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "content-type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify(rows),
})

const text = await res.text()
if (!res.ok) {
  console.error(`Seed failed (${res.status}): ${text}`)
  process.exit(1)
}
const data = JSON.parse(text)
console.log(`Seeded ${data.length} prompt_configs: ${data.map((r) => r.kind).join(", ")}`)
