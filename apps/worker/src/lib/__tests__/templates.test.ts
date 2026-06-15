import { describe, it, expect } from "vitest"
import { renderTemplates } from "../templates.js"

describe("renderTemplates", () => {
  it("renders each template as a titled block", () => {
    const out = renderTemplates([
      { title: "Login help", content: "Go to the login page." },
      { title: "Refund policy", content: "30-day guarantee." },
    ])
    expect(out).toContain("### Login help")
    expect(out).toContain("Go to the login page.")
    expect(out).toContain("### Refund policy")
  })

  it("returns an empty string when there are no templates", () => {
    expect(renderTemplates([])).toBe("")
  })
})
