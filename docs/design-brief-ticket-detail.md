# Design brief — Thread detail page (`/tickets/[id]`)

> Paste everything below into claude/design, and attach: this page's code, a screenshot of the current rendering, and `packages/ui/src/styles/globals.css`.

---

Redesign one page of an existing Next.js app — the **"thread detail" page** of an internal email-support-agent oversight dashboard. I'm attaching: (1) the current page + component code, (2) a screenshot of the current rendering, (3) the app's `globals.css` (the design tokens). Elevate the visual design while keeping it **100% consistent with the existing system and drop-in ready**.

**Product context.** Internal ops tool. This page (`/tickets/[id]`) is a read-only view where a support operator reviews one customer email thread and the AI agent's handling of it. The hero of the page is the **agent's decision + reasoning** ("what did the bot decide, and why") — it should read as the verdict at a glance, alongside the conversation and an audit trail.

**Current state (see attached code + screenshot).** Two-column: a conversation timeline (avatar + email card + an "Agent decision" chip) with an audit-trail list below, and a right summary sidebar (Status / Sender / Opened + a "Latest decision" block: badges, model/template/refund#, reasoning). It works — I want your design eye to sharpen hierarchy, polish, and the verdict-at-a-glance feel.

**Hard constraints (this is drop-in code for the repo):**
- **Stack:** Next.js App Router **React Server Components** — the page is async, server-rendered, read-only. **No `"use client"`, no hooks, no client-only/animation libs, no data-fetching changes.** Output **TSX**.
- **Styling:** Tailwind CSS **v4** + **shadcn/ui** (style "radix-mira", base neutral). **Reuse existing shadcn components only** — `Card`, `Badge`, `Avatar`, `Separator`, `Table`, `Tooltip`, etc. No new component libraries, fonts, or dependencies.
- **Colors:** use **only** the theme tokens from the attached `globals.css` via Tailwind utilities — `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted`, `bg-primary`/`text-primary-foreground`, `bg-secondary`, `bg-accent`, `border`, `bg-destructive`, `ring`, `bg-popover`, etc. **No hardcoded colors** (no hex, no `bg-blue-500`). Must be correct in **light and dark** (handled by tokens + the `.dark` class) — verify both.
- **Icons:** `@tabler/icons-react` only. **Fonts:** already configured (`--font-sans` = Inter, `--font-heading` = JetBrains Mono) — don't import fonts.
- **Code style:** no semicolons, double quotes, 2-space indent.
- **Reuse these shared components** (don't change their semantics): `ClassificationBadge`, `DecisionBadge`, `ThreadStatusBadge`, `AuditStatusBadge` from `@/components/shared/status-badges`.
- **Don't change the data layer** — the page receives a `ThreadDetail` (shape below); keep using it.

**Data shape (`ThreadDetail`):**
- thread: `{ id, sender, subject, status, createdAt }`
- `emails: ThreadEmail[]`, each `{ id, direction: "inbound" | "outbound", from, to, subject, bodyText: string | null, receivedAt, decisions: ThreadDecision[], audit: ThreadAudit[] }`
- `ThreadDecision`: `{ id, classification, decision, refundRequestCount, templateUsed, llmModel, llmReasoning, status, approvedAt, approvedBy, createdAt }`
- `ThreadAudit`: `{ id, action, status, error, createdAt }`
- Email bodies are plain text. "Latest decision" = the most recent decision across all emails.

**Design goals:** sharpen hierarchy and make the decision + reasoning the clear hero; refined and **restrained** (internal ops dashboard — not flashy/maximalist, no generic AI-gradient aesthetics); clear inbound vs outbound distinction; tasteful spacing/typography; CSS-only hover/transitions are fine (stay server-rendered); responsive (two-column desktop → stacks on mobile); dark-mode-correct.

**Deliverable:** updated TSX for `app/(overview)/tickets/[id]/page.tsx` and the components under `components/tickets/` (`email-card.tsx`, `thread-summary.tsx`, `thread-audit.tsx`), using only the allowed components + tokens, paste-ready. Note any new shadcn component you rely on so I can add it.

---

## What to attach alongside this brief
- This file (the brief).
- A screenshot of the current page — `docs/ticket-detail-current.png` (+ `…-dark.png`).
- `packages/ui/src/styles/globals.css` — the design tokens.
- Code: `app/(overview)/tickets/[id]/page.tsx`, `components/tickets/email-card.tsx`, `components/tickets/thread-summary.tsx`, `components/tickets/thread-audit.tsx`, `components/shared/status-badges.tsx`, and the `ThreadDetail` / `ThreadEmail` / `ThreadDecision` / `ThreadAudit` types from `lib/tickets.ts`.
