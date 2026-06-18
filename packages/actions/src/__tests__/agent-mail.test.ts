import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock AgentMailClient but preserve the real AgentMailError so instanceof works.
// vi.mock is hoisted, so MockAgentMailClient must be defined inside the factory.
const mockCreate = vi.fn()

vi.mock("agentmail", async (orig) => {
  const real = await orig<typeof import("agentmail")>()
  return {
    ...real,
    AgentMailClient: class MockAgentMailClient {
      inboxes = {
        create: (...args: unknown[]) => mockCreate(...args),
      }
    },
  }
})

// Import AgentMailError after mock (real class preserved via spread above).
import { AgentMailError } from "agentmail"

process.env.AGENT_MAIL_API_KEY = "test-key"

import { createAgentMailInbox } from "../agent-mail.js"

describe("createAgentMailInbox", () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it("returns { inboxId, created: true } on success and calls create with domain", async () => {
    mockCreate.mockResolvedValue({ inboxId: "sales@agentmail.to" })
    const result = await createAgentMailInbox({
      username: "sales",
      displayName: "Sales Inbox",
    })
    expect(result).toEqual({ inboxId: "sales@agentmail.to", created: true })
    expect(mockCreate).toHaveBeenCalledWith({
      username: "sales",
      displayName: "Sales Inbox",
      domain: "agentmail.to",
    })
  })

  it("returns { inboxId: username@domain, created: false } on 403 AlreadyExistsError", async () => {
    mockCreate.mockRejectedValue(
      new AgentMailError({
        message: "Inbox already exists",
        statusCode: 403,
        body: { name: "AlreadyExistsError" },
      })
    )
    const result = await createAgentMailInbox({
      username: "sales",
      displayName: "Sales Inbox",
    })
    expect(result).toEqual({ inboxId: "sales@agentmail.to", created: false })
  })

  it("returns { created: false } on 409 conflict", async () => {
    mockCreate.mockRejectedValue(
      new AgentMailError({
        message: "Conflict",
        statusCode: 409,
        body: null,
      })
    )
    const result = await createAgentMailInbox({
      username: "sales",
      displayName: "Sales Inbox",
    })
    expect(result.created).toBe(false)
  })

  it("rethrows non-conflict AgentMailError (500)", async () => {
    mockCreate.mockRejectedValue(
      new AgentMailError({ message: "boom", statusCode: 500 })
    )
    await expect(
      createAgentMailInbox({ username: "sales", displayName: "Sales Inbox" })
    ).rejects.toThrow("boom")
  })

  it("rethrows non-conflict plain errors (e.g. fetch failed)", async () => {
    mockCreate.mockRejectedValue(new TypeError("fetch failed"))
    await expect(
      createAgentMailInbox({ username: "sales", displayName: "Sales Inbox" })
    ).rejects.toThrow("fetch failed")
  })
})
