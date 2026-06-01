import { notFound } from "next/navigation"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getThreadDetail, type ThreadDecision } from "@/lib/tickets"
import { ThreadStatusBadge } from "@/components/shared/status-badges"
import { EmailCard } from "@/components/tickets/email-card"
import { ThreadSummary } from "@/components/tickets/thread-summary"
import { ThreadAudit } from "@/components/tickets/thread-audit"
import { VerdictBanner } from "@/components/tickets/verdict-banner"

export const dynamic = "force-dynamic"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

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
    <div className="flex flex-col gap-5 md:gap-6">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {thread.subject}
          </h1>
          <ThreadStatusBadge value={thread.status} />
        </div>
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">{thread.sender}</span> ·
          opened {formatDate(thread.createdAt)}
        </p>
      </header>

      <VerdictBanner decision={latestDecision} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3.5">
            <h2 className="text-muted-foreground font-heading flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase">
              Conversation
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px]">
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

          <ThreadAudit entries={auditEntries} />
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
    </div>
  )
}
