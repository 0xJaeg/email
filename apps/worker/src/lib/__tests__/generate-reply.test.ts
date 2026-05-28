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
      anthropic,
    })
    expect(result.text).toBe("Hi Alice — refund issued. — Sam")
    expect(result.usage.cache_read_input_tokens).toBe(4844)
    const create = anthropic.messages.create as ReturnType<typeof vi.fn>
    const callArgs = create.mock.calls[0]?.[0]
    expect(callArgs?.model).toBe("claude-haiku-4-5")
    expect(callArgs?.system[0].cache_control).toEqual({
      type: "ephemeral",
      ttl: "1h",
    })
    expect(callArgs?.messages[0].content).toContain("REFUND_CONFIRMATION")
    expect(callArgs?.messages[0].content).toContain("alice@x.com")
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
        anthropic,
      })
    ).rejects.toThrow(/empty/)
  })
})
