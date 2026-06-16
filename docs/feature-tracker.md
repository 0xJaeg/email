# Feature Tracker — 2026-06-11 Ben call

Living status of every concern/feature raised in the 2026-06-11 demo call (Ben, Jhegg, Nofaisa). Source plan: `~/.claude/plans/context-i-m-evaluating-hashed-lollipop.md`. Update as we go.

**Legend:** ✅ done · ⚠️ partial/deviates · ❌ not yet · 🔒 blocked on external input

> **Note on "Mav":** in the transcript "Mav" = **Madhav** (a person), who will provide the per-product **product-access API** (access check + add-user). Product-access work is blocked on him (asking 2026-06-17).

## ✅ Done & verified
- [x] Universal human approval before any send/action — `/approvals`; all decisions land pending
- [x] Oversight dashboard (waiting / auto-handled / running cost) — `/`
- [x] Spam filter (detect + halt, no API calls on spam) — `flow_steps.spam_filter`
- [x] Smart order-lookup gate (skip "how do I buy", run on access/refund) — `flow_steps.lookup_gate`
- [x] Visible + tunable per-inbox decision flow (his #1 ask, in the agreed code-defined form) — `/flows`, editable step prompts, hot-reload
- [x] Per-ticket "what the agent did" trace — `/tickets/[id]` (shipped 2026-06-16, PR #13)
- [x] Refund offer-ladder + chargeback short-circuit — decision tree + Sonnet confirmation
- [x] Template library (on-demand templates, out of the system prompt) — `/templates`, `prompt_templates`
- [x] Training: business overview + FAQ + refund policy + tone — `prompt_configs`, `/prompts`
- [x] Remove em-dashes from generated replies
- [x] API keys merged into the product page (not a separate setup) — `/products/[id]`
- [x] Encrypted per-product credential storage — `integration_credentials` (AES-GCM)

## ⚠️ Partial / deviates — NOT blocked (quick wins)
- [ ] Least-privilege keys: lookup vs refund vs access per platform — no `key_type` column yet
- [ ] Remove the "password reset" field from product config — `reset_url` still present in `product-form.tsx`
- [ ] Delete the now-redundant standalone `/credentials` page (merged into product)
- [ ] Retention offer should be the "10-day coaching" Ben named — current offers differ (50% discount / 30-day extension / 1:1 walkthrough); prompt content edit
- [ ] Make the inbox display name mandatory — field exists but not required (display address already shown in the table ✅)
- [ ] Full multi-ticket context (whole thread + all of the sender's other tickets) — today the agent reasons over the single inbound email + order/access enrichment; refund ladder is sender-aware via the decision count
- [ ] Per-inbox flow differentiation (marketing vs support handle "no purchase found" differently) — `flow_steps` supports per-inbox flows; only the global default is configured; only 1 inbox

## 🔧 In progress
- [ ] **Auto-create Agent Mail inbox from the dashboard** (started 2026-06-16) — today you paste the `agent_mail_inbox_id`; automate it via the Agent Mail SDK (verify the SDK exposes inbox creation first)

## 🔒 Phase B — blocked (real money + data)
**Needs from Ben:** ClickBank / JVZoo / Digi Store API keys — ideally least-privilege **lookup** keys + separate **refund** keys per platform.
**Needs from Madhav:** the per-product **product-access API** — **access check** + **add-user** (asking 2026-06-17).
- [ ] Multi-platform order lookup across ClickBank + JVZoo + Digi Store — only mock wired; no `digistore.ts`
- [ ] Multiple platforms per product (select more than one)
- [ ] Product-access check via Madhav's API
- [ ] Auto-add user to dashboard (`grant_access`) + email login details (Ben's new ask)
- [ ] Real refund execution via API (currently a stub)

## Deferred by design (Ben agreed)
- Drag-and-drop flowchart/funnel builder — chose "visible + tunable, code-defined" (`/flows`); a visual builder can come later once the flow shape is proven.
