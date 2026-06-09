import { Hono } from "hono"
import { Webhook } from "svix"
import type { Json } from "@workspace/db/types"
import { MessageReceivedEvent } from "../lib/agent-mail-schema.js"
import { getSupabase } from "../lib/supabase.js"
import { resolveInboxRouting } from "../lib/inbox-routing.js"
import { getEmailsQueue } from "../lib/queue.js"

const toJson = (v: unknown): Json => JSON.parse(JSON.stringify(v)) as Json

export const webhooksRoute = new Hono().post("/agent-mail", async (c) => {
  const secret = process.env.AGENT_MAIL_WEBHOOK_SECRET
  if (!secret) {
    console.error("[webhook] AGENT_MAIL_WEBHOOK_SECRET not configured")
    return c.json({ error: "server_misconfigured" }, 500)
  }

  const rawBody = await c.req.text()
  const headers = {
    "svix-id": c.req.header("svix-id") ?? "",
    "svix-timestamp": c.req.header("svix-timestamp") ?? "",
    "svix-signature": c.req.header("svix-signature") ?? "",
  }

  let verified: unknown
  try {
    verified = new Webhook(secret).verify(rawBody, headers)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await getSupabase()
      .from("audit_log")
      .insert({
        action: "webhook_received",
        status: "failure",
        error: `signature_verification_failed: ${message}`,
        payload: { "svix-id": headers["svix-id"] },
      })
    return c.json({ error: "invalid_signature" }, 400)
  }

  const parsed = MessageReceivedEvent.safeParse(verified)
  if (!parsed.success) {
    // Distinguish "non-received event" (ignore) from "malformed" (reject).
    const evType =
      verified &&
      typeof verified === "object" &&
      "event_type" in verified &&
      typeof (verified as { event_type: unknown }).event_type === "string"
        ? (verified as { event_type: string }).event_type
        : null
    const ignored = evType !== null && !evType.startsWith("message.received")
    await getSupabase()
      .from("audit_log")
      .insert({
        action: "webhook_received",
        status: ignored ? "success" : "failure",
        error: ignored ? null : parsed.error.message,
        payload: toJson({ verified, ignored }),
      })
    if (ignored) return c.json({ ok: true, status: "ignored", event_type: evType })
    return c.json({ error: "invalid_payload" }, 400)
  }

  const event = parsed.data
  const supabase = getSupabase()

  // Route the message to a product/inbox before persisting the thread.
  const routing = await resolveInboxRouting(supabase, event.message.inbox_id)

  const { data: thread, error: threadErr } = await supabase
    .from("threads")
    .upsert(
      {
        agent_mail_thread_id: event.message.thread_id,
        sender_email: event.message.from,
        subject:
          event.message.subject ?? event.thread.subject ?? "(no subject)",
        product_id: routing.productId,
        inbox_id: routing.inboxId,
      },
      { onConflict: "agent_mail_thread_id" }
    )
    .select("id")
    .single()

  if (threadErr || !thread) {
    await supabase
      .from("audit_log")
      .insert({
        action: "webhook_received",
        status: "failure",
        error: `thread_upsert_failed: ${threadErr?.message ?? "no row returned"}`,
        payload: toJson(event),
      })
    return c.json({ error: "db_error" }, 500)
  }

  const { data: email, error: emailErr } = await supabase
    .from("emails")
    .insert({
      thread_id: thread.id,
      direction: "inbound",
      agent_mail_message_id: event.message.message_id,
      from_email: event.message.from,
      to_email: event.message.to[0] ?? "",
      subject: event.message.subject ?? "(no subject)",
      body_text: event.message.text ?? null,
      body_html: event.message.html ?? null,
      raw_payload: toJson(event),
      received_at: event.message.timestamp,
    })
    .select("id")
    .single()

  // 23505 = unique violation → duplicate webhook, already processed.
  if (emailErr?.code === "23505") {
    await supabase
      .from("audit_log")
      .insert({
        action: "webhook_received",
        status: "success",
        payload: toJson({
          duplicate: true,
          agent_mail_message_id: event.message.message_id,
        }),
      })
    return c.json({ ok: true, status: "duplicate" })
  }
  if (emailErr || !email) {
    await supabase
      .from("audit_log")
      .insert({
        action: "webhook_received",
        status: "failure",
        error: `email_insert_failed: ${emailErr?.message ?? "no row returned"}`,
        payload: toJson(event),
      })
    return c.json({ error: "db_error" }, 500)
  }

  try {
    await getEmailsQueue().add("process_email", {
      emailId: email.id,
      eventType: event.event_type,
    })
  } catch (err) {
    await supabase
      .from("audit_log")
      .insert({
        action: "enqueue",
        email_id: email.id,
        status: "failure",
        error: err instanceof Error ? err.message : String(err),
      })
    return c.json({ error: "enqueue_failed" }, 500)
  }

  await supabase.from("audit_log").insert({
    action: "webhook_received",
    email_id: email.id,
    status: "success",
  })

  return c.json({ ok: true, emailId: email.id })
})
