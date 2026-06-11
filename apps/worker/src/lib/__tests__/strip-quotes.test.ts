import { describe, it, expect } from "vitest"
import { stripQuotedReply } from "../strip-quotes.js"

describe("stripQuotedReply", () => {
  it("passes through null and quote-free bodies", () => {
    expect(stripQuotedReply(null)).toBeNull()
    expect(
      stripQuotedReply("I want a refund please. Thanks, Rachel")
    ).toBe("I want a refund please. Thanks, Rachel")
  })

  it("cuts Gmail/Apple 'On … wrote:' quoted history", () => {
    const body =
      "How do i get it ?\n\nOn Wed, Jun 10, 2026, 6:11 PM David <updates@x.co> wrote:\n> Your balance is ready"
    expect(stripQuotedReply(body)).toBe("How do i get it ?")
  })

  it("cuts a forwarded chain", () => {
    const body =
      "Mail my payment.Thank you\n\n---------- Forwarded message ---------\nFrom: Robly <x@y.com>\nDate: Mon, Jun 9"
    expect(stripQuotedReply(body)).toBe("Mail my payment.Thank you")
  })

  it("drops a trailing mobile signature (even as a markdown link)", () => {
    const body =
      "Safari says the site cannot open\n\n[Sent from Yahoo Mail for iPhone](https://mail.onelink.me/x)"
    expect(stripQuotedReply(body)).toBe("Safari says the site cannot open")
  })

  it("returns empty when the reply is only quoted history", () => {
    const body =
      "On Mon, 8 Jun 2026 at 12:43 am, Emma <x@y.co> wrote:\n> the whole thing was quoted"
    expect(stripQuotedReply(body)).toBe("")
  })

  it("cuts at a leading '>' quote block", () => {
    expect(stripQuotedReply("yes please\n> previous message\n> more")).toBe(
      "yes please"
    )
  })

  it("does not cut a '>' used mid-sentence", () => {
    expect(stripQuotedReply("is the price > $50 per month?")).toBe(
      "is the price > $50 per month?"
    )
  })
})
