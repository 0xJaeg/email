// Turn a plain-text reply into a simple, safe HTML body for the multipart
// email's html part. Escapes HTML first (so customer/agent text can never
// inject markup), splits blank-line-separated blocks into paragraphs, turns
// single newlines into <br>, and linkifies bare http(s) URLs. No deps.
export function renderReplyHtml(text: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")

  // Run on already-escaped text; URLs stop at whitespace or an entity start.
  const linkify = (s: string) =>
    s.replace(
      /(https?:\/\/[^\s<&]+(?:&amp;[^\s<&]+)*)/g,
      (u) => `<a href="${u}">${u}</a>`
    )

  const blocks = escape(text.trim())
    .split(/\n{2,}/)
    .map((b) => `<p>${linkify(b).replace(/\n/g, "<br>")}</p>`)
    .join("\n")

  return `<div>${blocks}</div>`
}
