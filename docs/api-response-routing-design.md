# Design: "API responses → routing" visibility on the Decision Flow (live from code)

## Goal (Ben's request)
On the Decision Flow node panel, for each step that calls an external API, show **every possible response** that API can return and **which branch each one routes to**. It must be **pulled from the actual code** that handles each API, so it auto-updates when the backend logic changes and never drifts. The point: guarantee every possible API response has a planned path (none route nowhere or to the wrong place).

**Style reference:** the per-ticket "What the assistant did" trace (rows of `API · operation · result`). Same look, but showing **all possible** responses, not one actual run.

## Current state (why this is build, not just render)
- The node panel's **Branches** come only from `flow_edges` (the saved `outcome → target` graph). It shows abstract outcomes (`found`/`not_found`/`failed`), not the API responses behind them.
- The "API response → outcome" logic is **inline in each node's `run()`**. Outcomes are free-form strings; nothing declares the set a node can emit.
- There is **no shared source of truth** a UI could read, so the data Ben wants does not exist in a readable form yet.
- Adapters: **ClickBank / JVZoo / Digistore are stubs** (return "not configured"); **Profit Dashboard** (access) and **MailWizz** (unsubscribe) make real calls.

## Approach: one typed spec that both routes and renders
Create a single, typed **routing spec** that is the source of truth for `API response → outcome`, used by **both** the worker (to route) and the web (to render). Because they read the same module, they cannot drift.

### 1. The spec (new, shared)
`packages/actions/src/api-routing-spec.ts` — importable by both `apps/worker` and `apps/web` (both already depend on `@workspace/actions`).

```ts
type ApiResponseCase = {
  id: string        // stable key, e.g. "purchase_found"
  label: string     // human row, e.g. "Purchase found"
  kind: "ok" | "empty" | "error" | "pending"   // drives the icon
  outcome: string   // the flow outcome this response produces, e.g. "found"
}
type ApiCallSpec   = { adapter: string; operation: string; responses: ApiResponseCase[] }
type NodeRoutingSpec = { nodeType: string; apis: ApiCallSpec[] }
export const ROUTING_SPEC: Record<string, NodeRoutingSpec> = { /* per API node */ }
```

### 2. Runtime uses it (no drift)
Refactor each API-node `run()` to derive its outcome **via the spec** instead of ad-hoc string literals — the spec becomes the routing logic. For nodes with combination logic (e.g. `purchase_lookup` across 3 platforms), the per-adapter `response → outcome` comes from the spec; the node keeps only the orchestration (which platform answered), with a test guarding consistency.

### 3. Web renders it
In the node-detail panel, for API-calling nodes, render the spec joined with `flow_edges`:
- spec gives `response → outcome`
- `flow_edges` gives `outcome → target node`
- panel shows **`API · operation · response → outcome → target`** in the ticket-trace style (icons for ok / empty / error / pending).

The web imports `ROUTING_SPEC` directly (no network call) and reuses the edges `flow-canvas` already loads.

### 4. No-drift enforcement (tests)
Vitest assertions that bind the spec to reality:
- every outcome a node's `run()` can emit is declared in the spec (no undeclared routes),
- every spec outcome has a matching `flow_edge` in the default flow (**nothing routes nowhere** — Ben's exact fear),
- every `flow_edge` outcome exists in the spec (no stray edges).

If routing changes without updating the spec, tests fail — forcing the spec (and therefore the panel) to stay accurate. That is what makes it "live from the real code."

## Populate now vs scaffold (gated on credentials)
- **Full now:** Profit Dashboard (access) + MailWizz (unsubscribe) — real responses enumerated from the live adapters.
- **Scaffold now, fill later:** ClickBank / JVZoo / Digistore — declare the intended responses (purchase found → `found`; no purchase → `not_found`; error/unavailable → `failed`; not configured → `failed`), each marked `kind: "pending"` until the real adapter lands. The structure + routing guarantees go in now; the rows fill in as each adapter is built.

## Files
- **New:** `packages/actions/src/api-routing-spec.ts` (+ exports map entry); a no-drift test file under `apps/worker`.
- **Change:** the API-node `run()`s (`purchase-lookup`, `access-check`, `order-lookup`, `add-to-dashboard`, `unsubscribe-call`, `api-action`) to consult the spec; `apps/web/components/flow/node-detail-sheet.tsx` to render the API block.
- **Reuse:** `flow_edges` (already loaded by `flow-canvas`), the ticket-trace styling.

## Verification
- **Unit:** the no-drift tests pass.
- **Visual:** open an API node on `/flows` → see the APIs, all possible responses, and the route for each, in trace style; stubs show "pending credentials."
- **Live-from-code check:** change a node's outcome mapping in the spec → the panel reflects it with no other edits; remove an edge → the panel flags "routes nowhere" and the test fails.

## Open questions
- Spec home: `packages/actions` vs a new `packages/flow-spec` (recommend `packages/actions` for now — no new package).
- How deep to go on raw HTTP-status rows for the live APIs (Profit Dashboard / MailWizz) now, vs starting at the outcome level and deepening later.
- Confirm scope with Ben: this enriches the existing node panel (not a separate page).

## API docs findings (researched 2026-06-26)
What the public docs actually say, per platform. **Planning-level — Ben's account/keys are authoritative.**

- **ClickBank** — Orders API `GET /rest/1.3/orders2/list?email={email}&type=SALE` (email search, wildcards). Auth: ClickBank API key (Order-Read role). HTTP: `200` (orders or empty), `403` (no permission / not found), + `401/429/5xx`. Refunds are a **separate Tickets API** (`/1.3/tickets`, open a refund ticket). Purchase-lookup-by-email maps cleanly.
- **Digistore24** — `listPurchases(email=…)` (email search), `getPurchase`, `listTransactions` (payments / returns / chargebacks). Auth: API key (Settings → Account access → API keys). The dev portal returns 403 to automated fetches, so exact params + error tables must be confirmed from Ben's logged-in account.
- **JVZoo** 🚩 — **no email-search endpoint.** Lookup is by transaction id (`GET /v2.0/transactions/summaries/{id}`); purchases/refunds arrive via **IPN (push)**. **Design decision needed:** feed JVZoo from stored IPN events, or escalate JVZoo cases. This changes what `purchase_lookup` does for JVZoo.
- **Live APIs (already in code)** — Profit Dashboard access check (`POST /api/email-lookup`; `200` has/no access; non-2xx → fail) and MailWizz unsubscribe (response classified into `success` / `email_not_found` / `failed`; dev → `skipped`).

**Implication:** the routing spec gains an HTTP layer per response case (status / condition + the outcome it maps to). ClickBank + the live APIs can be specced now; Digistore24 details confirm from Ben's account; **JVZoo needs the IPN-vs-lookup decision before its rows are real.**

Sources: ClickBank Orders API (support.clickbank.com) · Digistore24 dev docs (dev.digistore24.com) · JVZoo API (api.jvzoo.com/docs).
