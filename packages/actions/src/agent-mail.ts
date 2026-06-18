import { AgentMailClient, AgentMailError } from "agentmail"

const DEFAULT_INBOX_DOMAIN = "agentmail.to"

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

// Provision an Agent Mail inbox (idempotent). Webhooks are configured at the
// account level, so creating the inbox is all that's needed for its mail to
// flow to our webhook — no per-inbox wiring. If the inbox already exists on
// Agent Mail we link the existing one rather than failing.
export async function createAgentMailInbox({
  username,
  displayName,
  domain = DEFAULT_INBOX_DOMAIN,
}: {
  username: string
  displayName: string
  domain?: string
}): Promise<{ inboxId: string; created: boolean }> {
  try {
    const inbox = await getAgentMailClient().inboxes.create({
      username,
      displayName,
      domain,
    })
    return { inboxId: inbox.inboxId, created: true }
  } catch (err) {
    if (isInboxAlreadyExists(err)) {
      return { inboxId: `${username}@${domain}`, created: false }
    }
    throw err
  }
}

function isInboxAlreadyExists(err: unknown): boolean {
  if (!(err instanceof AgentMailError)) return false
  if (err.statusCode === 409) return true
  const body = err.body as { name?: string } | null | undefined
  if (err.statusCode === 403 && body?.name === "AlreadyExistsError") return true
  return /already exists/i.test(String(err.message ?? ""))
}
