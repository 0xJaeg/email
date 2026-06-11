import { describe, it, expect } from "vitest"
import { renderProductFacts } from "../product-facts.js"

describe("renderProductFacts", () => {
  it("returns null when there are no usable facts", () => {
    expect(renderProductFacts("X", null)).toBeNull()
    expect(renderProductFacts("X", {})).toBeNull()
    expect(renderProductFacts("X", { login_url: "   " })).toBeNull()
  })

  it("renders configured links + platform under the product name", () => {
    const out = renderProductFacts("Mobile Profits", {
      platform: "Digistore24",
      login_url: "https://acme.test/login",
      reset_url: "https://acme.test/reset",
      notes: "Use the email you purchased with.",
    })
    expect(out).toContain("Mobile Profits")
    expect(out).toContain("Digistore24")
    expect(out).toContain("https://acme.test/login")
    expect(out).toContain("https://acme.test/reset")
    expect(out).toContain("Use the email you purchased with.")
  })

  it("omits fields that aren't set", () => {
    const out = renderProductFacts("P", { login_url: "https://x.test/in" })
    expect(out).toContain("https://x.test/in")
    expect(out).not.toContain("reset")
    expect(out).not.toContain("dashboard")
  })
})
