import { AgentMailClient } from "agentmail"

let cached: AgentMailClient | null = null

export function getAgentMailClient(): AgentMailClient {
  if (cached) return cached
  const apiKey = process.env.AGENT_MAIL_API_KEY
  if (!apiKey) {
    throw new Error("AGENT_MAIL_API_KEY is not set")
  }
  cached = new AgentMailClient({ apiKey })
  return cached
}

export function getAgentMailInboxId(): string {
  const inboxId = process.env.AGENT_MAIL_INBOX_ID
  if (!inboxId) {
    throw new Error("AGENT_MAIL_INBOX_ID is not set")
  }
  return inboxId
}
