// Strip quoted reply history, forwarded chains, and mobile signatures from an
// inbound email body so the agent classifies + replies to the customer's NEW
// message — not the quoted thread or marketing footer underneath it.
//
// AgentMail delivers the raw message text (quotes included) and recommends
// running Talon to extract the reply. Talon is Python; our worker is Node, so
// this implements the same plain-text technique Talon uses: cut at the earliest
// reliable, line-anchored quote/forward marker, then drop a trailing mobile
// signature. Conservative by design — it only cuts at strong markers so it
// won't truncate a genuine message. The raw body stays in the DB for the
// thread/audit; only the model input is cleaned.

const QUOTE_MARKERS: RegExp[] = [
  /^[ \t]*On\b[^\n]{1,200}\bwrote:[ \t]*$/im, // Gmail / Apple Mail attribution
  /^[ \t]*-{2,}[ \t]*Original Message[ \t]*-{2,}/im, // Outlook
  /^[ \t]*-{2,}[ \t]*Forwarded message[ \t]*-{2,}/im, // Gmail forward
  /^[ \t]*_{5,}[ \t]*$/m, // Outlook underscore divider before quoted headers
  /^[ \t]*From:[ \t].+\n[ \t]*(?:Sent|Date|To|Subject):/im, // forwarded header block
  /^[ \t]*>/m, // first quoted ">" line
]

const TRAILING_SIGNATURE =
  /\n[ \t]*\[?[ \t]*(?:Sent from\b|Get Outlook for\b)[^\n]*\s*$/i

export function stripQuotedReply(body: string | null): string | null {
  if (body == null) return body
  const text = body.replace(/\r\n/g, "\n")

  let cut = text.length
  for (const marker of QUOTE_MARKERS) {
    const idx = text.search(marker)
    if (idx !== -1 && idx < cut) cut = idx
  }

  const head = text.slice(0, cut).replace(TRAILING_SIGNATURE, "")
  return head.trim()
}
