// Extract a bare email address from an RFC 5322 string.
// `"Jane Doe <jane@x.com>"` → `"jane@x.com"`
// `"jane@x.com"` → `"jane@x.com"`
// Returns the input trimmed + lowercased if no angle-bracketed address is found.
export function normalizeEmailAddress(rfc5322: string): string {
  const trimmed = rfc5322.trim()
  const match = trimmed.match(/<([^>]+)>/)
  return (match?.[1] ?? trimmed).toLowerCase()
}
