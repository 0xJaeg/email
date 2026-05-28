# Refund Policy and Retention Workflow

**Note for slice C**: this file is loaded into the classifier's system prompt for context only. The decision tree that uses it lands in slice D. The classifier does NOT need to apply this policy — it only needs to recognize refund-related intent.

## Customer-facing policy

- **60-day money-back guarantee** on every digital product, no questions asked. This is the ClickBank standard and customers know it.
- **Refunds are processed via the original payment method** through the ClickBank API. Typical processing time: 3–5 business days for credit cards, 5–10 for PayPal.
- **Customers do not need to "return" anything** — the products are digital. Their access is revoked when the refund is issued.
- **Chargebacks and bank disputes** are treated as immediate refund requests to avoid the merchant losing the chargeback fee on top of the refund. The bar to escalate to "immediate refund + apology" on chargeback language is intentionally low.

## Retention offer ladder

The refund decision tree (slice D) progresses through these templates based on the number of prior refund requests from the same sender:

### `[OFFER_1]` — First refund request

Send a polite retention message that:

1. Acknowledges their concern by name.
2. Asks one specific clarifying question — what isn't working, or what feature didn't meet their expectation.
3. Offers a one-time 50% discount on their next purchase as a goodwill gesture, OR a free 30-day extension on whatever the product is.
4. Makes the refund still easy: "if this doesn't change your mind, just reply 'refund' and we'll process it the same day."

Do not be pushy. The goal is to learn what went wrong and offer something useful. If they reply with anything that still reads as refund intent, the next message is a refund decision — recorded and queued for the operator to approve. The agent does not issue refunds directly.

### `[OFFER_2]` — Second refund request from the same sender

Send a shorter, more direct message that:

1. Acknowledges the previous touch.
2. Offers either a refund OR a 1:1 video walkthrough with a human support specialist (15 minutes, scheduled via a Calendly link).
3. If the second email contains any chargeback or dispute language, **skip the offer ladder entirely — the decision tree records this as a refund + chargeback apology, which the operator approves before money moves**.

### Third request → immediate refund

By the third request the goodwill window is closed. The decision tree records the refund (pending operator approval); the confirmation reply is composed in advance and sent automatically once approved. Multiple refund-attempts is a product-quality signal worth logging.

## What the classifier should remember from this file

Mostly: the customer-facing language. Phrases like "60-day guarantee", "money-back guarantee", "ClickBank refund", or "use the guarantee" are strong `refund_request` signals because they reference the policy the customer expects.

The classifier does not need to remember the retention-offer template names or the decision tree — that's slice D's job. It just needs to know that the policy exists, that customers know about it, and that referencing it counts as a refund ask.
