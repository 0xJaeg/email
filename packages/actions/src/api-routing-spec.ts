// Single source of truth for "API response -> flow outcome" per API-calling
// node. The /flows node panel renders THIS (so the page shows the real routing
// logic, not a hand-written page), joined at render time with the flow's edges
// (outcome -> target node). Result on the panel: API request -> response ->
// outcome -> next step.
//
// When an adapter/node changes how it handles an API response, update its entry
// here; the panel updates with it. Keeping the runtime node logic literally
// driven by this spec is a planned follow-up — until then, the consistency
// tests bind this to the nodes' real outcomes.

/** Visual + semantic kind of a response row. */
export type ResponseKind = "ok" | "empty" | "error" | "pending" | "gap"

/** Whether the underlying adapter is wired for real. */
export type ApiState = "live" | "pending" | "gap"

export type ApiResponseCase = {
  /** Stable id, unique within the API call. */
  id: string
  /** HTTP status or condition shown as a badge, e.g. "200", "403", "success". */
  http: string
  /** Human-readable description of the response. */
  label: string
  kind: ResponseKind
  /** The flow outcome (branch key) this response produces. */
  outcome: string
}

export type ApiCallSpec = {
  /** Adapter / service key, e.g. "clickbank". */
  adapter: string
  /** Operation, e.g. "order lookup". */
  operation: string
  /** The HTTP request we make: method + endpoint + key params. */
  request: string
  /** Short auth summary. */
  auth?: string
  state: ApiState
  /** Sourcing note, caveat, or design-gap explanation. */
  note?: string
  responses: ApiResponseCase[]
}

export type NodeRoutingSpec = {
  nodeType: string
  apis: ApiCallSpec[]
}

export const ROUTING_SPEC: Record<string, NodeRoutingSpec> = {
  purchase_lookup: {
    nodeType: "purchase_lookup",
    apis: [
      {
        adapter: "clickbank",
        operation: "order lookup",
        request: "GET /1.3/orders2/list?email={sender}&type=SALE",
        auth: "ClickBank API key · Order-Read role",
        state: "pending",
        note: "Confirmed from the ClickBank Orders API docs (email search supports wildcards).",
        responses: [
          { id: "ok", http: "200", label: "order(s) returned", kind: "ok", outcome: "found" },
          { id: "empty", http: "200", label: "empty list", kind: "empty", outcome: "not_found" },
          { id: "denied", http: "403", label: "no permission / not found", kind: "error", outcome: "failed" },
          { id: "err", http: "401 / 429 / 5xx", label: "auth / rate-limit / server", kind: "error", outcome: "failed" },
          { id: "stub", http: "—", label: "not configured yet", kind: "pending", outcome: "failed" },
        ],
      },
      {
        adapter: "digistore24",
        operation: "order lookup",
        request: "listPurchases(email={sender})",
        auth: "Digistore24 API key",
        state: "pending",
        note: "listPurchases supports email search; dev portal is gated, so exact params + error codes to confirm from the account.",
        responses: [
          { id: "ok", http: "success", label: "purchases returned", kind: "ok", outcome: "found" },
          { id: "empty", http: "success", label: "empty result", kind: "empty", outcome: "not_found" },
          { id: "err", http: "error", label: "invalid key / API error", kind: "error", outcome: "failed" },
          { id: "server", http: "429 / 5xx", label: "rate-limit / server", kind: "error", outcome: "failed" },
          { id: "stub", http: "—", label: "not configured yet", kind: "pending", outcome: "failed" },
        ],
      },
      {
        adapter: "jvzoo",
        operation: "order lookup",
        request: "(no email lookup) · GET /v2.0/transactions/summaries/{id}  +  IPN push",
        auth: "JVZoo API key",
        state: "gap",
        note: "JVZoo has no email-search endpoint — lookups are by transaction id, and purchases/refunds arrive via IPN (push). Design decision needed: feed JVZoo from stored IPN records, or escalate JVZoo cases.",
        responses: [
          { id: "no_email", http: "no email API", label: "cannot look up by email", kind: "gap", outcome: "failed" },
          { id: "ipn", http: "via IPN", label: "purchase on record (IPN-fed)", kind: "ok", outcome: "found" },
        ],
      },
    ],
  },

  access_check: {
    nodeType: "access_check",
    apis: [
      {
        adapter: "profit_dashboard",
        operation: "access check",
        request: "POST profitdashboard.io/api/email-lookup  { email }",
        auth: "API key",
        state: "live",
        note: "Live in the adapter today.",
        responses: [
          { id: "has", http: "200", label: "has active access", kind: "ok", outcome: "has_access" },
          { id: "none", http: "200", label: "no access on file", kind: "empty", outcome: "no_access" },
          { id: "err", http: "non-2xx", label: "API error / timeout / no adapter", kind: "error", outcome: "failed" },
        ],
      },
    ],
  },

  add_to_dashboard: {
    nodeType: "add_to_dashboard",
    apis: [
      {
        adapter: "dashboard",
        operation: "add user",
        request: "(pending add-user API)",
        auth: "API key",
        state: "pending",
        note: "Endpoint not provided yet — scaffolded so the routing is ready when it lands.",
        responses: [
          { id: "ok", http: "when live", label: "user added", kind: "ok", outcome: "success" },
          { id: "err", http: "when live", label: "add failed", kind: "error", outcome: "failed" },
          { id: "stub", http: "—", label: "not configured yet", kind: "pending", outcome: "failed" },
        ],
      },
    ],
  },

  order_lookup: {
    nodeType: "order_lookup",
    apis: [
      {
        adapter: "per-product adapter",
        operation: "lookupOrder / checkAccess",
        request: "adapter.lookupOrder(email) / adapter.checkAccess(email)",
        auth: "per-product credentials",
        state: "pending",
        note: "Legacy combined lookup: a customer is 'found' if there is any order OR active access.",
        responses: [
          { id: "ok", http: "order or access", label: "order found or has access", kind: "ok", outcome: "found" },
          { id: "empty", http: "neither", label: "no order and no access", kind: "empty", outcome: "not_found" },
        ],
      },
    ],
  },

  unsubscribe_call: {
    nodeType: "unsubscribe_call",
    apis: [
      {
        adapter: "mailwizz",
        operation: "unsubscribe",
        request: "POST {mailwizz}/lists/{lists}/subscribers/.../unsubscribe",
        auth: "MailWizz API key",
        state: "live",
        note: "Live in the adapter; the response body is classified into the outcomes below. Skipped outside production.",
        responses: [
          { id: "ok", http: "status: success", label: "unsubscribed", kind: "ok", outcome: "success" },
          { id: "not_found", http: "error: not found", label: "email not on any list", kind: "empty", outcome: "email_not_found" },
          { id: "err", http: "other / non-2xx", label: "API error", kind: "error", outcome: "failed" },
          { id: "skipped", http: "dev", label: "skipped (non-production)", kind: "empty", outcome: "skipped" },
        ],
      },
    ],
  },
}
