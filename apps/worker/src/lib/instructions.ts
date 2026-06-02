import { readFileSync, readdirSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))

// apps/worker/src/lib → repo root is four levels up
const INSTRUCTIONS_DIR = join(__dirname, "..", "..", "..", "..", "instructions")

const HEADER = `You are an email-support classifier for a ClickBank-listed digital-product business. Read the instructions below carefully. They contain the classification rubric, the refund policy your customers know about, an FAQ skeleton, and a tone-of-voice guide. Your job is to classify exactly one inbound email into one of three labels and return your reasoning. Follow the output format described in the classifier rubric exactly.`

// The reply generator is a DIFFERENT job from the classifier: it writes the
// customer-facing email. It must NOT inherit the classifier identity or the
// JSON output format, or it replies with classification JSON and internal
// architecture talk. This header establishes the agent persona and hard
// guardrails against leaking anything internal.
const REPLY_HEADER = `You are a human customer-support agent for a ClickBank-listed digital-product business, writing a reply that will be sent directly to the customer by email.

Write ONLY the body of that reply — natural, plain-text prose in the brand voice described below. The material below (refund policy, retention templates, FAQ answers, voice guide) is your internal knowledge for deciding what to say and do. Use it, but never expose it:

- Do NOT output JSON, classifications, labels (e.g. "refund_request"/"faq"), template names (e.g. "OFFER_1"), policy or section names, or decision/approval mechanics.
- Do NOT relay internal process steps (e.g. "pull the order history", "queued for operator approval"). Translate them into what the customer should hear.
- Do NOT describe your own role or reasoning, mention that you are an AI or automated, or reference any internal project structure.

Output the reply body only: no preamble, no JSON, no meta-commentary.`

// The reply draws only on customer-facing knowledge — voice, policy, FAQ —
// never the classifier rubric. Listed in reading order.
const REPLY_FILES = [
  "tone/voice.md",
  "policies/refund.md",
  "policies/common-questions.md",
]

function readInstruction(rel: string): string {
  return readFileSync(join(INSTRUCTIONS_DIR, rel), "utf8")
}

// Drop the trailing "What the classifier should remember…" section: it's
// classifier-only meta and has no place in a customer-reply prompt.
function customerFacing(body: string): string {
  const head = body.split(/\n#+\s*What the classifier should remember/i)[0]
  return (head ?? body).trim()
}

function loadInstructions(): string {
  const files = readdirSync(INSTRUCTIONS_DIR, { recursive: true }) as string[]
  const mdFiles = files
    .filter((f) => typeof f === "string" && f.endsWith(".md"))
    .sort()

  if (mdFiles.length === 0) {
    throw new Error(`No .md files found in ${INSTRUCTIONS_DIR}`)
  }

  const blocks = mdFiles.map((relPath) => {
    const body = readFileSync(join(INSTRUCTIONS_DIR, relPath), "utf8")
    return `# File: ${relPath}\n\n${body}`
  })

  return `${HEADER}\n\n---\n\n${blocks.join("\n\n---\n\n")}`
}

export const INSTRUCTIONS_TEXT = loadInstructions()

export const REPLY_INSTRUCTIONS_TEXT = (() => {
  const blocks = REPLY_FILES.map(
    (rel) => `# File: ${rel}\n\n${customerFacing(readInstruction(rel))}`
  )
  return `${REPLY_HEADER}\n\n---\n\n${blocks.join("\n\n---\n\n")}`
})()

const estTokens = Math.round(INSTRUCTIONS_TEXT.length / 4)
console.log(
  `[worker] instructions loaded: ${INSTRUCTIONS_TEXT.length} chars, ~${estTokens} tokens (classifier); ${REPLY_INSTRUCTIONS_TEXT.length} chars (reply)`
)
if (estTokens < 4096) {
  console.warn(
    `[worker] WARNING: instructions are below Haiku 4.5's 4096-token cache floor; prompt caching will not activate. Add more content to instructions/*.md.`
  )
}
