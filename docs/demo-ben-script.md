# Demo script — Email Support Agent (with Ben)

## The demo emails — 20 total (all `@example.com` → safe; approving won't reach a real person)
**6 "story" emails to walk through** (use the Approvals search bar to pull these up):
1. **Maria** — "Can't log into my dashboard" → login FAQ (accuracy showcase)
2–4. **James** (×3, same sender) — the refund offer-ladder: offer → retention offer → **chargeback → refund**
5. **Alex** — "Question before I buy" → prospective buyer (branch showcase)
6. **Dana** — "Ok thanks." → escalates to a human (safety showcase)

The other **14** are realistic background volume (FAQs, refunds, prospects, billing, escalations) so the dashboard and ticket feed look populated.

---

## BEFORE the call (~3–4 min)

**0. (Recommended) Clean slate** — paste into the Supabase SQL editor so the queue shows only the demo data (and no real-customer rows you could approve by accident):
```sql
-- Dev DB: all ticket data is synthetic, so this fully clears the pipeline
-- (keeps products, users, prompts, inboxes, credentials, triggers).
delete from decisions;
delete from audit_log;
delete from emails;
delete from threads;
```

**1.** Redis: `pnpm db:start`  (Docker must be running)
**2.** App: `pnpm dev`  (web :3000, api :3001, worker)
**3.** Seed the demo (sequential so the refund ladder counts in order):
```bash
pnpm sim:batch --file scripts/fixtures/demo-ben.json --delay 12000
```
**4.** Wait **~4–5 min** (20 emails), then open **localhost:3000**, log in, and confirm **~20 items** flowed in (Approvals + Tickets). Use the **Approvals search bar** to pull up Maria / James during the walkthrough. You're ready.

---

## DURING the call (~8–10 min)

**1. Dashboard** — "Oversight view: volume, how many are waiting on a human, % auto-handled, running cost."

**2. Tickets** — "Every email becomes a ticket with its full conversation thread."

**3. Approvals → search "maria", open it (the accuracy moment)** — "She can't log in. The agent classified it as a login question, checked her account, and drafted this — notice it gives the *real* link, **profitdashboard.io**, and correctly says it's **email-only, no password**. That's from config I can edit, not hardcoded. Nothing's sent — it's waiting for me. I can edit, then approve." → **Approve it** ("…and that sends the email").

**4. Approvals → search "james", open the 3 in order (the refund ladder — the meat)**
- #1: "First refund ask → it offers a goodwill gesture first, doesn't just refund."
- #2: "He's back → now a retention offer (a walkthrough), still no refund."
- #3: "He threatens a chargeback → it **escalates, double-checks with a stronger model, and proposes an actual refund** — flagged red because money moves. **I approve every refund; nothing auto-refunds.**"

**5. Alex** — "It can tell this person hasn't bought yet, so it doesn't look up an account — different handling for prospects."

**6. Dana** — "When it's unsure, it doesn't guess — it escalates to a human."

**7. Admin panel (the 'no developer needed' moment)** — Products → edit Mobile Profits support facts (or Prompts → edit a prompt) → save. "The agent uses that on the next email — no code, no deploy. You or the team can tune it."

---

## Be honest if asked (don't overclaim)
- **Refunds run on a mock** — no real money moves yet. Order/access lookup is placeholder data.
- **Driven by test emails** (no live inbox connected yet), running on my laptop.
- Both flip to real the moment we have the payment API keys.

## Close with the 3 asks
1. **ClickBank/JVZoo API credentials** + confirm we start with **Mobile Profits** → flips refunds + order-lookup from mock to real.
2. Confirm **every reply + action stays human-approved** this phase.
3. OK to point a **real Mobile Profits inbox** at it for a live end-to-end test.

## ⚠️ Safety
Approving sends a **real email**. The demo addresses are all `@example.com` (won't deliver), so approving is safe — just don't approve any non-demo row.
