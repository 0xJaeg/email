import { describe, it, expect } from "vitest"
import { parseRecipients } from "../settings.js"

describe("parseRecipients", () => {
  it("splits on commas and newlines, trims, and drops blanks", () => {
    expect(parseRecipients("a@x.com, b@y.com\n c@z.com ")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ])
  })

  it("returns an empty list for blank / whitespace-only input", () => {
    expect(parseRecipients("")).toEqual([])
    expect(parseRecipients("  \n , ")).toEqual([])
  })
})
