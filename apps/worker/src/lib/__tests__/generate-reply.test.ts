import { describe, it, expect, vi } from "vitest"
import { generateReply } from "../generate-reply.js"
import type Anthropic from "@anthropic-ai/sdk"

function mockAnthropic(replyText: string) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: replyText }],
    usage: {
      input_tokens: 50,
      output_tokens: 30,
      cache_read_input_tokens: 4844,
      cache_creation_input_tokens: 0,
    },
  })
  return { messages: { create } } as unknown as Anthropic
}

describe("generateReply", () => {
  it("calls Haiku with cached instructions + per-email user prompt; returns text + usage", async () => {
    const anthropic = mockAnthropic("Hi Alice — refund issued. — Sam")
    const result = await generateReply({
      template: "REFUND_CONFIRMATION",
      email: {
        from_email: "Alice <alice@x.com>",
        subject: "refund pls",
        body_text: "Please refund.",
      },
      replyInstructions: "BRAND VOICE GUIDE",
      anthropic,
    })
    expect(result.text).toBe("Hi Alice - refund issued. - Sam")
    expect(result.usage.cache_read_input_tokens).toBe(4844)
    const create = anthropic.messages.create as ReturnType<typeof vi.fn>
    const callArgs = create.mock.calls[0]?.[0]
    expect(callArgs?.model).toBe("claude-haiku-4-5")
    expect(callArgs?.system[0].text).toBe("BRAND VOICE GUIDE")
    expect(callArgs?.system[0].cache_control).toEqual({
      type: "ephemeral",
      ttl: "1h",
    })
    expect(callArgs?.messages[0].content).toContain("REFUND_CONFIRMATION")
    expect(callArgs?.messages[0].content).toContain("alice@x.com")
  })

  it("includes verified customer context in the prompt when provided", async () => {
    const anthropic = mockAnthropic("ok")
    await generateReply({
      template: "FAQ_REPLY",
      email: { from_email: "a@x.com", subject: "s", body_text: "b" },
      customerContext: "- Purchase: Pro Course, order O-1",
      replyInstructions: "guide",
      anthropic,
    })
    const create = anthropic.messages.create as ReturnType<typeof vi.fn>
    const userContent = create.mock.calls[0]?.[0]?.messages[0].content
    expect(userContent).toContain("order O-1")
  })

  it("includes product support facts and a never-invent-URLs instruction when provided", async () => {
    const anthropic = mockAnthropic("ok")
    await generateReply({
      template: "FAQ_REPLY",
      email: { from_email: "a@x.com", subject: "s", body_text: "b" },
      productFacts:
        "Product: Mobile Profits (access delivered via Digistore24)\n- Login / sign-in URL: https://acme.test/login",
      replyInstructions: "guide",
      anthropic,
    })
    const create = anthropic.messages.create as ReturnType<typeof vi.fn>
    const userContent = create.mock.calls[0]?.[0]?.messages[0].content
    expect(userContent).toContain("https://acme.test/login")
    expect(userContent).toMatch(/only real links|never invent/i)
  })

  it("throws on empty text response", async () => {
    const anthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [], usage: {} }),
      },
    } as unknown as Anthropic
    await expect(
      generateReply({
        template: "FAQ_REPLY",
        email: { from_email: "x@x.com", subject: "s", body_text: "b" },
        replyInstructions: "guide",
        anthropic,
      })
    ).rejects.toThrow(/empty/)
  })

  it("strips em and en dashes from the reply text", async () => {
    const anthropic = mockAnthropic("Hello — world – and 10–20 items")
    const result = await generateReply({
      template: "FAQ_REPLY",
      email: { from_email: "a@x.com", subject: "s", body_text: "b" },
      replyInstructions: "guide",
      anthropic,
    })
    expect(result.text).not.toMatch(/[—–]/)
    expect(result.text).toBe("Hello - world - and 10-20 items")
  })

  it("includes active templates in the prompt when provided", async () => {
    const anthropic = mockAnthropic("ok")
    await generateReply({
      template: "FAQ_REPLY",
      email: { from_email: "a@x.com", subject: "s", body_text: "b" },
      replyInstructions: "guide",
      templates: "### Login help\nGo to the login page.",
      anthropic,
    })
    const create = anthropic.messages.create as ReturnType<typeof vi.fn>
    const userContent = create.mock.calls[0]?.[0]?.messages[0].content
    expect(userContent).toContain("Go to the login page.")
  })
})
