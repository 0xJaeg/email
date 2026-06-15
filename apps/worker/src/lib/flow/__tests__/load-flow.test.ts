import { describe, it, expect } from "vitest"
import { loadFlow } from "../load-flow.js"
import type { ServerClient } from "@workspace/db/client"

type Row = {
  step_key: string
  position: number
  ai_prompt: string | null
  condition: Record<string, unknown>
}
const r = (k: string, p: number): Row => ({
  step_key: k,
  position: p,
  ai_prompt: null,
  condition: {},
})

// Chainable supabase stub. loadFlow calls .from().select().eq("inbox_id",…)
// .eq("is_active",…).order() for the inbox query, and .from().select()
// .is("inbox_id",null).eq("is_active",…).order() for the default query.
function makeSupabase(rows: { inbox: Row[]; default: Row[] }): ServerClient {
  let mode: "inbox" | "default" = "default"
  const b: Record<string, unknown> = {}
  b.from = () => {
    mode = "default"
    return b
  }
  b.select = () => b
  b.eq = (col: string) => {
    if (col === "inbox_id") mode = "inbox"
    return b
  }
  b.is = (col: string) => {
    if (col === "inbox_id") mode = "default"
    return b
  }
  b.order = async () => ({
    data: mode === "inbox" ? rows.inbox : rows.default,
    error: null,
  })
  return b as unknown as ServerClient
}

describe("loadFlow", () => {
  it("returns the inbox's steps when the inbox has a flow", async () => {
    const sb = makeSupabase({
      inbox: [r("classify", 1), r("draft", 2)],
      default: [r("classify", 1)],
    })
    const steps = await loadFlow(sb, "inbox-1")
    expect(steps.map((s) => s.step_key)).toEqual(["classify", "draft"])
  })

  it("falls back to the global default when the inbox has no flow", async () => {
    const sb = makeSupabase({
      inbox: [],
      default: [r("classify", 1), r("enrich", 2)],
    })
    const steps = await loadFlow(sb, "inbox-1")
    expect(steps.map((s) => s.step_key)).toEqual(["classify", "enrich"])
  })

  it("returns the global default when no inbox is given", async () => {
    const sb = makeSupabase({ inbox: [], default: [r("classify", 1)] })
    const steps = await loadFlow(sb, null)
    expect(steps.map((s) => s.step_key)).toEqual(["classify"])
  })
})
