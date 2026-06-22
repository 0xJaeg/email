import { notFound } from "next/navigation"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getThreadDetail, type ThreadDecision } from "@/lib/tickets"
import { EmailCard } from "@/components/tickets/email-card"
import { ThreadSummary } from "@/components/tickets/thread-summary"
import { ThreadFlow } from "@/components/tickets/thread-flow"
import { ManualReply } from "@/components/tickets/manual-reply"
import { TicketDraftReview } from "@/components/tickets/ticket-draft-review"
import { buildFlowTrace } from "@/lib/flow-trace"

export const dynamic = "force-dynamic"

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const thread = await getThreadDetail(getServerSupabase(), id)
  if (!thread) notFound()

  const decisions = thread.emails.flatMap((e) => e.decisions)
  const latestDecision: ThreadDecision | null = decisions.length
    ? decisions.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b))
    : null
  const auditEntries = thread.emails
    .flatMap((e) => e.audit)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3.5">
          <h2 className="flex items-center gap-2 font-heading text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Conversation
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {thread.emails.length}
            </span>
          </h2>
          <ol className="flex flex-col">
            {thread.emails.map((e, i) => (
              <EmailCard
                key={e.id}
                email={e}
                isLast={i === thread.emails.length - 1}
              />
            ))}
          </ol>
        </section>

        {/* One response box per ticket: edit + approve/reject the agent's draft
            when one's pending; otherwise (escalation, after a reject, follow-up
            on a sent ticket) the manual composer. */}
        {latestDecision?.status === "pending_approval" ? (
          <TicketDraftReview decision={latestDecision} />
        ) : (
          <ManualReply threadId={thread.id} />
        )}

        <ThreadFlow steps={buildFlowTrace(latestDecision, auditEntries)} />
      </div>

      <ThreadSummary
        status={thread.status}
        sender={thread.sender}
        createdAt={thread.createdAt}
        emailCount={thread.emails.length}
        decisionCount={decisions.length}
        approvedBy={latestDecision?.approvedBy ?? null}
      />
    </div>
  )
}
