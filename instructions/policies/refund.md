# Refund Policy and Retention Workflow

## Customer-facing policy

- **60-day money-back guarantee** on every digital product, no questions asked. This is the ClickBank standard and customers know it.
- **Refunds are processed via the original payment method** through the ClickBank API. Typical processing time: 3–5 business days for credit cards, 5–10 for PayPal.
- **Customers do not need to "return" anything** — the products are digital. Their access is revoked when the refund is issued.
- **Chargebacks and bank disputes** are treated as refund requests to avoid the merchant losing the chargeback fee on top of the refund. The bar to route the decision down the "refund + chargeback apology" path is intentionally low; the operator still approves before money moves.

## Retention offer ladder

These retention templates are selected based on the number of prior refund requests from the same sender:

### `[OFFER_1]` — First refund request

Send a polite retention message that:

1. Acknowledges their concern by name.
2. Asks one specific clarifying question — what isn't working, or what feature didn't meet their expectation.
3. Offers a one-time 50% discount on their next purchase as a goodwill gesture, OR a free 30-day extension on whatever the product is.
4. Makes the refund still easy: "if this doesn't change your mind, just reply 'refund' and we'll process it the same day."

Do not be pushy. The goal is to learn what went wrong and offer something useful. If they reply with anything that still reads as refund intent, the next message is a refund decision — recorded and queued for the operator to approve. The agent does not issue refunds directly.

### `[OFFER_2]` — Second refund request from the same sender

This is still a RETENTION message, not a refund. **No refund has been approved at this step — do NOT state or imply that a refund has been issued, processed, or is on its way.** Send a shorter, more direct message that:

1. Acknowledges this is their second time reaching out.
2. Makes one stronger, more personal retention offer — a 1:1 video walkthrough with a human specialist (15 minutes, via a scheduling link), or a free 30-day extension.
3. Keeps the refund available without performing it: "if you'd still rather have the refund, just reply and we'll get it processed" — an offer to act on their word, never a confirmation.

Keep it warm and brief. The refund only happens if they ask again (the third request), and only after operator approval. If the second email contains any chargeback or dispute language, **skip the offer ladder entirely — the decision tree records this as a refund + chargeback apology, which the operator approves before money moves**.

### Third request → refund (pending approval)

By the third request the goodwill window is closed. The decision tree records the refund (pending operator approval); the confirmation reply is composed in advance and sent automatically once approved. Multiple refund-attempts is a product-quality signal worth logging.

### `[REFUND_CONFIRMATION]` — Refund being issued

The refund is being issued now (pending operator approval) — when this reply goes out, the refund is in flight. Write a short confirmation that:

1. Leads with the action: the refund is being processed back to their original payment method.
2. Gives the timeframe (3–5 business days for cards, 5–10 for PayPal) **without inventing an exact date**.
3. Notes their product access will end as part of the refund.

Use only amounts/order numbers present in the email or verified context; if you don't have a figure, say "your purchase" rather than guessing. Never use bracketed placeholders.

### `[REFUND_CHARGEBACK_APOLOGY]` — Refund + chargeback de-escalation

The customer has threatened a chargeback or bank dispute. The refund is being issued now (pending operator approval). Write a calm, brief, lightly apologetic reply that:

1. Confirms the refund is being processed now to their original payment method — **present/near tense; never describe it as having happened on a past date**.
2. Gives the normal timeframe (3–5 business days, up to 10 via their bank) without inventing a specific date.
3. Reassures them there's no need to file a chargeback — the refund is already on its way.

Never use bracketed placeholders like `[date]`. Do not claim the refund was processed on some prior date — it is being issued as a result of this message.

## What the classifier should remember from this file

Mostly: the customer-facing language. Phrases like "60-day guarantee", "money-back guarantee", "ClickBank refund", or "use the guarantee" are strong `refund_request` signals because they reference the policy the customer expects.

The classifier does not need to remember the retention-offer template names or the decision tree — that's slice D's job. It just needs to know that the policy exists, that customers know about it, and that referencing it counts as a refund ask.
