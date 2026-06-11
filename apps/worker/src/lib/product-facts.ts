// Renders a product's configured support facts (real login/reset/dashboard URLs
// + platform) into a compact block fed to the reply model — so replies use the
// product's ACTUAL links instead of inventing placeholders. Returns null when
// the product has no usable facts (then no block is added and the reply gives
// steps without a fabricated URL).
export function renderProductFacts(
  name: string,
  config: unknown
): string | null {
  if (!config || typeof config !== "object") return null
  const c = config as Record<string, unknown>
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null

  const platform = str(c.platform)
  const lines: string[] = []
  const login = str(c.login_url)
  const reset = str(c.reset_url)
  const dashboard = str(c.dashboard_url)
  const notes = str(c.notes)
  if (login) lines.push(`- Login / sign-in URL: ${login}`)
  if (reset) lines.push(`- Password reset URL: ${reset}`)
  if (dashboard) lines.push(`- Account dashboard URL: ${dashboard}`)
  if (notes) lines.push(`- Notes: ${notes}`)
  if (lines.length === 0) return null

  const header = platform
    ? `Product: ${name} (access delivered via ${platform})`
    : `Product: ${name}`
  return `${header}\n${lines.join("\n")}`
}
