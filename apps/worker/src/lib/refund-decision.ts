import { z } from "zod/v4"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import type Anthropic from "@anthropic-ai/sdk"
import type { ServerClient } from "@workspace/db/client"
import { normalizeEmailAddress } from "./email-address.js"

export const CHARGEBACK_RE =
  /\b(chargeback|charge[\s-]?back|dispute|bank|credit[\s-]?card|cc\s*company|visa|mastercard|amex)\b/i

const ChargebackCheck = z.object({
  is_genuine_chargeback_threat: z.boolean(),
  reasoning: z.string(),
})

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number | null
  cache_creation_input_tokens: number | null
}

export type RefundDecision = {
  decision:
    | "send_offer_1"
    | "send_offer_2"
    | "issue_refund_chargeback"
    | "issue_refund"
  refund_request_count: number
  template_used:
    | "OFFER_1"
    | "OFFER_2"
    | "REFUND_CHARGEBACK_APOLOGY"
    | "REFUND_CONFIRMATION"
  sonnet_usage?: Usage
  sonnet_reasoning?: string
}

export async function decideRefund(opts: {
  email: { id: string; from_email: string; body_text: string | null }
  supabase: ServerClient
  anthropic: Anthropic
  /** Classifier instructions, reused as the cached system block for the Sonnet check. */
  instructions: string
}): Promise<RefundDecision> {
  const { email, supabase, anthropic, instructions } = opts
  const senderAddress = normalizeEmailAddress(email.from_email)
  const priorRefunds = await countPriorRefunds(supabase, senderAddress)
  const requestNumber = priorRefunds + 1

  // Request #3+ → immediate refund (no offers, no Sonnet)
  if (priorRefunds >= 2) {
    return {
      decision: "issue_refund",
      refund_request_count: requestNumber,
      template_used: "REFUND_CONFIRMATION",
    }
  }

  // Request #2 → chargeback path or offer 2
  if (priorRefunds === 1) {
    const body = email.body_text ?? ""
    if (CHARGEBACK_RE.test(body)) {
      const sonnet = await confirmChargebackThreat(anthropic, body, instructions)
      return {
        decision: sonnet.confirmed
          ? "issue_refund_chargeback"
          : "send_offer_2",
        refund_request_count: requestNumber,
        template_used: sonnet.confirmed
          ? "REFUND_CHARGEBACK_APOLOGY"
          : "OFFER_2",
        sonnet_usage: sonnet.usage,
        sonnet_reasoning: sonnet.reasoning,
      }
    }
    return {
      decision: "send_offer_2",
      refund_request_count: requestNumber,
      template_used: "OFFER_2",
    }
  }

  // Request #1 → retention offer 1
  return {
    decision: "send_offer_1",
    refund_request_count: requestNumber,
    template_used: "OFFER_1",
  }
}

async function countPriorRefunds(
  supabase: ServerClient,
  senderAddress: string,
  days = 30
): Promise<number> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from("decisions")
    .select("id, emails!inner(from_email)")
    .eq("classification", "refund_request")
    .gte("created_at", since)
  if (error) {
    throw new Error(`count_prior_refunds_failed: ${error.message}`)
  }
  return (data ?? []).filter(
    (row) => normalizeEmailAddress(row.emails.from_email) === senderAddress
  ).length
}

async function confirmChargebackThreat(
  anthropic: Anthropic,
  emailBody: string,
  instructions: string
): Promise<{ confirmed: boolean; reasoning: string; usage: Usage }> {
  const response = await anthropic.messages.parse({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: [
      {
        type: "text",
        text: instructions,
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    ],
    messages: [
      {
        role: "user",
        content:
          `Email body:\n${emailBody || "(empty)"}\n\n` +
          `Is this a genuine chargeback / bank-dispute threat that should trigger an immediate refund + apology, or is it venting that mentions chargeback words without real intent to dispute? Return is_genuine_chargeback_threat=true ONLY if the sender appears credibly committed to filing a chargeback (e.g. explicit statement that they will or have contacted their bank/card issuer/PayPal to reverse the charge).`,
      },
    ],
    output_config: { format: zodOutputFormat(ChargebackCheck) },
  })
  if (!response.parsed_output) {
    throw new Error("sonnet_chargeback_check_parse_failed")
  }
  return {
    confirmed: response.parsed_output.is_genuine_chargeback_threat,
    reasoning: response.parsed_output.reasoning,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
    },
  }
}
