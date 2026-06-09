# Common Questions (FAQ skeleton)

Common operational questions and the canned answers to draw from when replying. These also serve as concrete examples of what `faq`-classed emails look like.

## Access and login

**Q: I can't log in to my account.**
A: Walk the user through the password-reset flow at `https://example.com/reset` and confirm they're using the email address they purchased with. If the email isn't recognized, they may have purchased with a different address — ask which email shows on their ClickBank receipt.

**Q: I never received my confirmation email.**
A: Confirmations arrive within 15 minutes of purchase. Ask them to check spam, then look up their order in the admin panel by the email or order ID and resend manually if needed.

**Q: I can't find the download link.**
A: Send them to the customer dashboard at `https://example.com/dashboard`. Every active purchase appears under "My Products" with a download button.

**Q: My access expired but I still have an active subscription.**
A: Subscription status is checked nightly. Ask them to log out and back in, or to wait 24 hours. If it persists, this is a real bug — escalate to product.

## Product and pricing questions

**Q: What's included in the [product name] plan?**
A: Refer them to the pricing page at `https://example.com/pricing` for the canonical feature list. Highlight 2–3 features most likely relevant to a new buyer.

**Q: Does this work on Windows / Mac / Linux / iPad?**
A: The product is web-based and works in any modern browser. iOS and Android apps are on the roadmap; no firm date.

**Q: Can I upgrade or downgrade my plan?**
A: Yes, from the billing tab in the dashboard. Upgrades are prorated against the current cycle. Downgrades take effect at the next billing date.

**Q: Do you offer team or enterprise pricing?**
A: For teams of 5+ seats, point them at the contact form at `https://example.com/enterprise`. A human follows up.

## Billing and orders

**Q: When will my card be charged?**
A: Initial charge happens at checkout. Subscription renewals happen on the same day of the month as the original purchase.

**Q: I see a duplicate charge.**
A: Pull up the ClickBank order history for that email and confirm whether it's a duplicate or two distinct purchases (sometimes a subscription renewal happens the same day as a one-off purchase). If it's truly a duplicate, the decision is a refund + apology (queued for operator approval — the duplicate-charge path also requires approval, no carve-outs). Do not escalate to the retention ladder for duplicate-charge errors.

**Q: Can I get a receipt for my purchase?**
A: ClickBank sends a receipt to the email on file at purchase time. They can also re-request from `https://www.clickbank.com/orderhistory`.

## Technical issues

**Q: I'm getting an error when I try to [do thing].**
A: Ask for a screenshot and the exact error text. If it matches a known issue, link them to the status page. Otherwise escalate to engineering.

**Q: A feature isn't working the way I expected.**
A: Confirm what they expected, what they're seeing, and the steps they took. If it's a misunderstanding of the feature, explain. If it's a real bug, escalate.

## What the classifier should remember from this file

Operational support emails — login, password, download, access, receipt, billing, error, plan comparison — are textbook `faq`. The classifier should not need to know the actual answers; it just needs to recognize the shape of an FAQ-class question.
