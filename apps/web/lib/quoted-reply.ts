// Split an inbound email body into the customer's NEW message and the quoted
// reply/forward history below it, so the conversation view can collapse the
// quoted part. Mirrors the worker's cut markers (apps/worker/src/lib/
// strip-quotes.ts) — that file is the source of truth; keep them in sync.
const QUOTE_MARKERS: RegExp[] = [
  /^[ \t]*On\b[^\n]{1,200}\bwrote:[ \t]*$/im, // Gmail / Apple Mail attribution
  /^[ \t]*-{2,}[ \t]*Original Message[ \t]*-{2,}/im, // Outlook
  /^[ \t]*-{2,}[ \t]*Forwarded message[ \t]*-{2,}/im, // Gmail forward
  /^[ \t]*_{5,}[ \t]*$/m, // Outlook underscore divider
  /^[ \t]*From:[ \t].+\n[ \t]*(?:Sent|Date|To|Subject):/im, // forwarded headers
  /^[ \t]*>/m, // first quoted ">" line
]

export function splitQuotedReply(body: string): {
  body: string
  quoted: string | null
} {
  const text = body.replace(/\r\n/g, "\n")
  let cut = text.length
  for (const marker of QUOTE_MARKERS) {
    const idx = text.search(marker)
    if (idx !== -1 && idx < cut) cut = idx
  }
  const head = text.slice(0, cut).trim()
  const tail = text.slice(cut).trim()
  // If the message is entirely quoted (nothing new above the marker), show it
  // all rather than an empty body.
  if (!head) return { body: tail, quoted: null }
  return { body: head, quoted: tail || null }
}
