import { describe, it, expect } from "vitest"
import { ROUTING_SPEC } from "../api-routing-spec.js"

const VALID_KINDS = new Set(["ok", "empty", "error", "pending", "gap"])
const VALID_STATES = new Set(["live", "pending", "gap"])

// The outcomes each node's run() can actually emit (from the worker node code).
// The spec must not introduce an outcome a node can't produce. Update both
// together when a node's outcomes change — that binding is the no-drift guard.
const EXPECTED_OUTCOMES: Record<string, string[]> = {
  purchase_lookup: ["found", "not_found", "failed"],
  access_check: ["has_access", "no_access", "failed"],
  add_to_dashboard: ["success", "failed"],
  order_lookup: ["found", "not_found"],
  unsubscribe_call: ["success", "email_not_found", "failed", "skipped"],
}

describe("ROUTING_SPEC", () => {
  for (const [nodeType, spec] of Object.entries(ROUTING_SPEC)) {
    describe(nodeType, () => {
      it("matches its map key", () => {
        expect(spec.nodeType).toBe(nodeType)
      })

      it("declares at least one API call", () => {
        expect(spec.apis.length).toBeGreaterThan(0)
      })

      for (const api of spec.apis) {
        it(`${api.adapter}/${api.operation} is well-formed`, () => {
          expect(api.request).toBeTruthy()
          expect(VALID_STATES.has(api.state)).toBe(true)
          expect(api.responses.length).toBeGreaterThan(0)
          const ids = api.responses.map((r) => r.id)
          expect(new Set(ids).size).toBe(ids.length) // ids unique within the call
          for (const r of api.responses) {
            expect(r.http).toBeTruthy()
            expect(r.label).toBeTruthy()
            expect(r.outcome).toBeTruthy()
            expect(VALID_KINDS.has(r.kind)).toBe(true)
          }
        })
      }

      const expected = EXPECTED_OUTCOMES[nodeType]
      if (expected) {
        it("only maps to outcomes the node can actually emit", () => {
          const specOutcomes = new Set(
            spec.apis.flatMap((a) => a.responses.map((r) => r.outcome))
          )
          for (const o of specOutcomes) {
            expect(expected).toContain(o)
          }
        })
      }
    })
  }
})
