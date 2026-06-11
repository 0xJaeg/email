import type { ServerClient } from "@workspace/db/client"

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
- NEVER invent, guess, or output a URL. Use only links that appear in the "Product support facts" or verified customer context provided with the message. If you don't have the exact link the customer needs, give the steps in words and offer to follow up with it — never use placeholder or example URLs (e.g. example.com).

Output the reply body only: no preamble, no JSON, no meta-commentary.`

// Kinds that feed the customer-facing reply prompt. Everything else (e.g. the
// classifier rubric) is firewalled out so it can't bleed into a reply.
const REPLY_KINDS = ["tone", "policy_refund", "policy_faq"] as const

export type PromptConfig = { kind: string; content: string }
export type Instructions = { classifier: string; reply: string }

// Drop the trailing "What the classifier should remember…" section: it's
// classifier-only meta and has no place in a customer-reply prompt.
function customerFacing(body: string): string {
  const head = body.split(/\n#+\s*What the classifier should remember/i)[0]
  return (head ?? body).trim()
}

// Pure assembly: prompt_configs rows → the two cached system strings. Sorted by
// kind so the prompt-cache key stays stable across unchanged edits.
export function assembleInstructions(configs: PromptConfig[]): Instructions {
  const sorted = [...configs].sort((a, b) => a.kind.localeCompare(b.kind))

  const classifierBlocks = sorted.map((c) => `# ${c.kind}\n\n${c.content}`)
  const classifier = `${HEADER}\n\n---\n\n${classifierBlocks.join("\n\n---\n\n")}`

  const replyBlocks = REPLY_KINDS.map((kind) =>
    sorted.find((c) => c.kind === kind)
  )
    .filter((c): c is PromptConfig => Boolean(c))
    .map((c) => `# ${c.kind}\n\n${customerFacing(c.content)}`)
  const reply = `${REPLY_HEADER}\n\n---\n\n${replyBlocks.join("\n\n---\n\n")}`

  return { classifier, reply }
}

// In-process cache so we don't refetch per email; edits reflect within TTL_MS
// without a worker restart.
const TTL_MS = 60_000
let cache: { value: Instructions; fetchedAt: number } | null = null

export async function getInstructions(
  supabase: ServerClient
): Promise<Instructions> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < TTL_MS) return cache.value

  const { data, error } = await supabase
    .from("prompt_configs")
    .select("kind, content")
    .eq("is_active", true)
  if (error) throw new Error(`load_prompt_configs: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error(
      "no active prompt_configs — seed them with scripts/seed-prompts.mjs"
    )
  }

  const value = assembleInstructions(data)
  cache = { value, fetchedAt: now }

  const estTokens = Math.round(value.classifier.length / 4)
  console.log(
    `[worker] instructions loaded from DB: ${value.classifier.length} chars, ~${estTokens} tokens (classifier); ${value.reply.length} chars (reply)`
  )
  if (estTokens < 4096) {
    console.warn(
      `[worker] WARNING: instructions are below Haiku 4.5's 4096-token cache floor; prompt caching will not activate.`
    )
  }
  return value
}
