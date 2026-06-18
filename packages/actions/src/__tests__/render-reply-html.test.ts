import { describe, it, expect } from "vitest"
import { renderReplyHtml } from "../render-reply-html.js"

describe("renderReplyHtml", () => {
  it("splits blank-line blocks into <p> and single newlines into <br>", () => {
    expect(renderReplyHtml("Hi there.\n\nLine one\nLine two")).toBe(
      "<div><p>Hi there.</p>\n<p>Line one<br>Line two</p></div>"
    )
  })

  it("escapes HTML so text can't inject markup", () => {
    const html = renderReplyHtml('a < b & c > d "q"')
    expect(html).toContain("&lt;")
    expect(html).toContain("&amp;")
    expect(html).toContain("&gt;")
    expect(html).toContain("&quot;")
    // The "< b" must not survive as a real tag.
    expect(html).not.toMatch(/<\s*b\b/)
  })

  it("linkifies bare URLs (including query strings with &)", () => {
    const html = renderReplyHtml("Reset: https://acme.test/r?a=1&b=2")
    expect(html).toContain(
      '<a href="https://acme.test/r?a=1&amp;b=2">https://acme.test/r?a=1&amp;b=2</a>'
    )
  })
})
