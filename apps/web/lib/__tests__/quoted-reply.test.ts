import { describe, it, expect } from "vitest"
import { splitQuotedReply } from "../quoted-reply.js"

describe("splitQuotedReply", () => {
  it("splits at a Gmail 'On … wrote:' attribution", () => {
    const r = splitQuotedReply(
      "Thanks, that worked!\n\nOn Wed, Jun 17, 2026 Chris <x@y.co> wrote:\n> old stuff\n> more"
    )
    expect(r.body).toBe("Thanks, that worked!")
    expect(r.quoted).toContain("On Wed")
    expect(r.quoted).toContain("> old stuff")
  })

  it("splits at the first quoted '>' line", () => {
    const r = splitQuotedReply("New message here.\n> quoted line\n> another")
    expect(r.body).toBe("New message here.")
    expect(r.quoted).toBe("> quoted line\n> another")
  })

  it("returns quoted=null when there's no quoted history", () => {
    const r = splitQuotedReply("Just a plain message.\nSecond line.")
    expect(r.body).toBe("Just a plain message.\nSecond line.")
    expect(r.quoted).toBeNull()
  })

  it("shows it all (no collapse) when the message is entirely quoted", () => {
    const r = splitQuotedReply("> only quoted\n> lines")
    expect(r.body).toBe("> only quoted\n> lines")
    expect(r.quoted).toBeNull()
  })
})
