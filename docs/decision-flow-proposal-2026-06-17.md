# Decision-Flow Redesign — Proposal for Sign-off

**For:** Ben · **From:** Jhegg · **Date:** 2026-06-17
**Status:** Proposal — please approve the approach before we build (per your request on today's call)

---

## TL;DR

- **You were right.** The current flow is a black box. I'm not going to defend it — I'm going to fix it.
- **Most of the logic you asked for already runs** (spam stops early, the order API is *not* hit on every ticket, refunds already ladder offer → offer → refund). **What was missing is letting you see and edit it.** So this is mostly surfacing what's already there — not a rebuild from zero.
- **The fix:** the flow becomes a **visible, editable branching tree**, and — the key part — **the tree *is* what the system actually runs.** If you change the tree, you change the behaviour. It can never drift back into a hidden black box.
- **Nothing changes about safety:** every reply and every refund still waits for a human to approve it.
- **You asked me to confirm one thing:** yes — everything you raised today was already covered in last week's call. Receipts are in §1.

---

## 1. "Is Ben correct that he covered all this last week?" — Yes.

You asked me to check this directly. I went through both transcripts. **Everything you raised today, you also raised on the 2026-06-11 call.** It was on me to capture it, and I didn't fully. Here's the proof, point by point:

| What you said today | What you already said on 11 Jun |
|---|---|
| "It's a black box… I want to *see* the decision process." | *"too much of an opaque black box… for us to be able to refine things."* |
| Make it a branching flowchart, not a list. | *"some kind of a flowchart, some kind of a decision tree… funnel builder style."* |
| Don't hit the order API on every ticket. | *"we don't want that… we're going to get rate limited… logic that decides if we need to check."* |
| "How do I buy this?" shouldn't trigger an order lookup. | *"if the question is how do I buy this then we don't need to check if they purchased."* |
| Flows differ per inbox (marketing vs support). | *"a flow for each inbox, not the whole system."* |
| Multi-platform APIs, tried in order, view keys separate from refund keys. | *"ClickBank, JVZoo, DG Store… check one at a time… view access to minimise risk."* |
| Check product access (Madhav's API). | *"he'll need to give you some way to check if they have access."* |

So this isn't new scope — it's the same thing, and the gap is real.

---

## 2. What I got wrong / what's missing

Honestly:

1. **It was built as a black box, not a visible tree.** `/flows` shows a flat list of 6 boxes with arrows between them. None of the actual decision-making is visible.
2. **The prompts are hidden on a separate page.** To see what a step actually tells the AI, you have to leave `/flows`, go to `/prompts`, find it, and come back. (Your exact complaint: *"that's not good design."*)
3. **The real branching is buried in code** — which categories get an order lookup, the refund offer-ladder, the spam stop. It works, but you can't see or change it.
4. **Only 3 ticket categories** (refund / FAQ / other) instead of the ~5 you described — and you can't see or edit how they route.
5. **The multi-platform API setup is half-built** — only ClickBank/JVZoo, one key per product (no separate view vs refund keys), no Digistore, no "try them in order," no Madhav access slot.

> A note on what happened: we previously shipped this as "visible + tunable" and parked the full drag-and-drop builder. The mistake was calling it *visible* when the branching and prompts still weren't actually on the screen. This proposal delivers the real visibility + editability you asked for — without needing the heavy builder yet.

---

## 3. How it will work — the editable decision tree

The flow becomes a **branching tree you can read top-to-bottom and edit in place.** Here's the shape (for a support inbox):

```
● Email received
 └▼ Spam filter        [prompt ▸] Haiku
     ├ spam ───────▶ ◼ Quarantine (no reply)
     └ not spam ─▼ Classify   [prompt ▸] Haiku
         ├ How-do-I-buy ▶ ◼ Sales reply (no lookup)
         ├ Login/access ▶▼ Order lookup [JVZoo▸CB▸DG]
         │                 ├ found ─────▶ ◼ Login help
         │                 └ not found ─▶ ◼ "Can't find order"
         ├ Refund ──────▶▼ Refund ladder [after 3]
         │                 ├ 1st ▶ Offer 1   [tmpl ▸]
         │                 ├ 2nd ▶ Offer 2 / chargeback?
         │                 └ ≥3rd ▶ Issue refund (approval)
         ├ Unsubscribe ─▶ ◼ Unsubscribe reply
         └ Other ───────▶ ◼ Escalate to human
```

**Read it like a support agent's thought process** — exactly what you described: is it spam? → if not, what kind of ticket is it? → does this kind need me to look up their order, or just answer? → if I look up and find them, do X; if I can't, do Y.

Four things this gives you:

**a) The branching is the screen.** You can see that "How do I buy this?" goes straight to a sales reply and **never touches the order API**, while "I can't log in" does the lookup. The API-spam protection you were worried about is now **visible in the shape of the tree**, not hidden in code.

**b) Prompts are shown and edited *inline*.** Click any node, see the exact prompt it sends the AI (and the model), edit it right there. No more hopping to another page.

**c) Categories are yours to change.** Add a 6th category, rename one, point its branch somewhere else — no developer needed. (Starter set below; tell me if you'd shape them differently.)

**d) The tree is the source of truth.** This is the important one. The system **runs the tree** — so the page can never lie to you about what's happening. Edit the tree → behaviour changes. You can even watch a test ticket and see the exact path it took highlighted on the tree.

**Per inbox.** Each inbox gets its own tree, so the **marketing** inbox can handle "no purchase found" differently from the **support** inbox — the example you gave.

**Safety unchanged.** Every reply and refund still lands in the approval queue for a human. Nothing auto-sends.

### Proposed starter categories (editable)

| Category | What happens |
|---|---|
| **How do I buy / pre-sale** | Sales reply. No order lookup. |
| **Login / access problem** | Order lookup → found: send login help · not found: "can't find your order" |
| **Refund request** | Refund ladder (offer → offer → refund, with chargeback check) |
| **General product question** | AI reply from the training docs |
| **Unsubscribe** | Unsubscribe reply |
| **Other** | Escalate to a human |

---

## 4. Multi-platform API config — visible now, switched on later

On each **product** page you'll see and configure:

- **View / lookup APIs** for **JVZoo, ClickBank, Digistore**, with the **order they're tried in** until a purchase is found.
- **Refund APIs** kept **separate** from the view keys (least-privilege — a view key can't issue refunds).
- A **product-access check** slot per product (Madhav's API).

**Straight talk on the blocker:** the *real* API calls stay switched off until your **platform keys** and **Madhav's access API** arrive — that's the one thing genuinely blocked on others (Madhav was asked today). But the **whole framework will be visible now**, so the moment those land it's a config change, not a build.

---

## 5. What changes for you, day to day

- Open `/flows`, pick an inbox, and **see the entire decision tree** for that product.
- Click any node to **read and edit its prompt** in place.
- **Add or rename categories** and redirect branches yourself.
- Run a test ticket and **see the exact path it took** lit up on the tree, so you can refine it.

---

## 6. The build plan

Ordered so you get **visibility fast**, then we refine on real tickets (your words). Each step is something I can demo to you.

| # | Step | You'll be able to… | Size |
|---|---|---|---|
| 1 | **Engine runs the tree** | (internal) — proven to produce *identical* results to today before we change anything | M |
| 2 | **See the tree** | Open `/flows` and see the real branching flowchart, per inbox, prompts shown inline | S–M |
| 3 | **Edit the tree** | Edit prompts and add/rename categories yourself; changes take effect immediately | M |
| 4 | **Multi-platform API config** | See the ordered view APIs + separate refund keys + Madhav slot on each product | S–M |
| 5 | **Polish** | Per-ticket trace shows the real path; clone the default tree to customise an inbox | S |

After **steps 1–3** you have a genuinely visible, editable flow you can start testing on a small batch of real tickets — which is what you said you wanted. I'll attach calendar dates once you approve the approach and scope.

---

## 7. What I need from you

1. **Approve the approach** (a visible, editable branching tree that the system runs) — or tell me what you'd change.
2. **The categories** — confirm the starter set in §3, or reshape it.
3. **Unblock Phase B when you can** — the platform API keys (ideally separate view vs refund keys), and Madhav's access API.

Once you're happy with this, I'll turn it into a detailed build plan and start on step 1.

---

## Appendix — under the hood (only if you want it)

The flow moves from a fixed linear list to a **node + branch model** the worker walks: each node runs (spam check, classify, lookup, refund ladder, reply…), returns an outcome, and the tree decides the next node. The existing refund-ladder logic is reused as-is. Step 1 is a pure refactor, verified to produce byte-identical results to today before any new category is added — so we don't break what already works while making it visible.
