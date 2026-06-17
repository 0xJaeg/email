# Decision-Tree Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the worker's linear `flow_steps` pipeline with a node + branch graph the worker executes directly, so the admin can *see and edit the real decision tree* — starting with a Phase 1 refactor that is byte-identical to today's behavior.

**Architecture:** A `flow_nodes` + `flow_edges` data model is the single source of truth the worker walks. Each node runs and returns an `outcome` string; the walk follows the edge `(from_node, outcome)` — falling back to a `default` edge. **Phase 1 wraps the existing, tested step logic in thin node adapters** (same code paths → identical behavior) and seeds a default tree whose edges are all `default` (plus the spam halt), reproducing today's linear flow exactly. Later phases reshape the tree into real category branching as *data* (edges/nodes), with little or no further engine change.

**Tech Stack:** TypeScript (NodeNext ESM), BullMQ worker (`apps/worker`), Supabase/Postgres (`packages/db` migrations + generated types), Vitest, Next.js 16 dashboard (`apps/web`), Anthropic SDK (Haiku/Sonnet).

**Source spec:** `docs/decision-flow-proposal-2026-06-17.md` (approved by Ben 2026-06-17). Working plan: `~/.claude/plans/i-just-had-a-cheerful-clarke.md`.

---

## Phase scope

This plan details **Phase 1 (engine refactor, byte-identical)** as bite-sized TDD tasks. Phases 2–5 are outlined at the end and will be expanded into their own task lists when reached (UI specifics depend on Phase 1's concrete schema). Each phase ships green and is independently demoable.

**Equivalence is the prime directive for Phase 1:** do not change *any* observable behavior (DB writes, decisions, statuses, audit rows, model calls). The refactor only changes *how* the same steps are dispatched.

---

## File Structure (Phase 1)

**Create:**
- `packages/db/supabase/migrations/<ts>_flow_nodes_edges.sql` — the two tables + RLS + seeded default tree (= today's pipeline).
- `apps/worker/src/lib/flow/run-graph.ts` — the graph walk (replaces `run-flow.ts` at the call site).
- `apps/worker/src/lib/flow/load-graph.ts` — load nodes+edges → `FlowGraph` (replaces `load-flow.ts` at the call site).
- `apps/worker/src/lib/flow/node-registry.ts` — `node_type → NodeType` map (replaces `registry.ts` at the call site).
- `apps/worker/src/lib/flow/nodes/adapt.ts` — `toStepConfig(node)` helper bridging `FlowNode` → existing `FlowStepConfig`.
- `apps/worker/src/lib/flow/nodes/{spam-filter,classify,lookup-gate,enrich,decide,draft}.ts` — thin `NodeType` wrappers over the existing `steps/*` implementations.
- `apps/worker/src/lib/flow/__tests__/run-graph.test.ts` — walk semantics + seeded-tree equivalence.

**Modify:**
- `apps/worker/src/lib/flow/types.ts` — add `FlowNode`, `NodeResult`, `NodeType`, `FlowGraph` (keep existing `Step`/`FlowStepConfig`).
- `apps/worker/src/processors/email.ts:42-53` — swap `loadFlow/runFlow/STEP_REGISTRY` → `loadGraph/runGraph/NODE_REGISTRY` (ctx unchanged).

**Leave untouched in Phase 1 (deleted in Phase 5):** `steps/*`, `run-flow.ts`, `load-flow.ts`, `registry.ts`, `run-flow.test.ts`, `flow_steps` table. They remain valid and tested; the wrappers reuse `steps/*` so there is one source of logic, not two copies.

---

## Phase 1 Tasks

### Task 1: Migration — `flow_nodes` + `flow_edges` + seeded default tree

**Files:**
- Create: `packages/db/supabase/migrations/<ts>_flow_nodes_edges.sql` (use the next timestamp after `20260616070928`).

- [ ] **Step 1: Write the migration SQL**

```sql
-- Phase 1: node + branch model the worker walks. flow_nodes are decision/action
-- nodes (one per inbox, null = global default); flow_edges route from a node's
-- outcome to the next node. Phase 1 seeds a default tree equivalent to today's
-- linear pipeline (spam_filter -> classify -> lookup_gate -> enrich -> decide ->
-- draft), so behavior is unchanged; later phases reshape edges into real
-- branching. Supersedes flow_steps (left in place until a later cleanup).
create table flow_nodes (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid references inboxes(id) on delete cascade,   -- null = global default tree
  node_key text not null,            -- stable slug within a tree (edge authoring + idempotent seeds)
  node_type text not null,           -- maps to a NodeType in the worker registry
  title text not null,               -- admin label
  description text,                  -- admin sub-text
  ai_prompt text,                    -- inline per-node prompt override (null = global fallback)
  model text,                        -- null = node-type default
  config jsonb not null default '{}'::jsonb,   -- node-type params (categories, template, ...)
  is_start boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inbox_id, node_key)
);
create index flow_nodes_inbox_idx on flow_nodes (inbox_id);
-- exactly one start per tree (coalesce handles the null/global tree)
create unique index flow_nodes_one_start_idx
  on flow_nodes (coalesce(inbox_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_start;

create table flow_edges (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid references inboxes(id) on delete cascade,    -- matches the node tree
  from_node_id uuid not null references flow_nodes(id) on delete cascade,
  to_node_id uuid not null references flow_nodes(id) on delete cascade,
  outcome text not null,             -- branch label the from-node emits ('default','not_spam',...)
  position int not null default 0,   -- display/tiebreak order
  created_at timestamptz not null default now(),
  unique (from_node_id, outcome)     -- deterministic routing: one destination per (node, outcome)
);
create index flow_edges_inbox_idx on flow_edges (inbox_id);

alter table flow_nodes enable row level security;
alter table flow_edges enable row level security;
create policy "authenticated read flow_nodes" on flow_nodes
  for select to authenticated using (true);
create policy "authenticated read flow_edges" on flow_edges
  for select to authenticated using (true);

-- Seed the global default tree (inbox_id null) = today's pipeline. node_key = node_type
-- (one of each). Idempotent via NOT EXISTS (matches existing seed-migration style).
insert into flow_nodes (inbox_id, node_key, node_type, title, description, is_start)
select null, v.node_key, v.node_type, v.title, v.description, v.is_start
from (values
  ('spam_filter','spam_filter','Spam filter','Cheap AI check — if the message is spam/junk/auto-reply, quarantine it and stop (no further processing, no API calls).', true),
  ('classify','classify','Classify the ticket','Label the email (refund / FAQ / other) and whether the sender is an existing member or a prospective buyer.', false),
  ('lookup_gate','lookup_gate','Order-lookup gate','Cheap AI decides whether this ticket needs an order/account lookup, so we do not hit platform APIs on every ticket.', false),
  ('enrich','enrich','Check purchase & access','For existing members, look up their order and product access via the product adapter.', false),
  ('decide','decide','Decide the action','Run the refund offer-ladder / FAQ / escalation logic and choose the action + template.', false),
  ('draft','draft','Draft the reply','Write the customer-facing reply (when the decision is a reply/refund) and queue it for human approval.', false)
) as v(node_key, node_type, title, description, is_start)
where not exists (
  select 1 from flow_nodes n where n.inbox_id is null and n.node_key = v.node_key
);

-- Seed the linear edges (+ spam halts, so no 'spam' edge needed).
insert into flow_edges (inbox_id, from_node_id, to_node_id, outcome, position)
select null, f.id, t.id, e.outcome, 0
from (values
  ('spam_filter','classify','not_spam'),
  ('classify','lookup_gate','default'),
  ('lookup_gate','enrich','default'),
  ('enrich','decide','default'),
  ('decide','draft','default')
) as e(from_key, to_key, outcome)
join flow_nodes f on f.inbox_id is null and f.node_key = e.from_key
join flow_nodes t on t.inbox_id is null and t.node_key = e.to_key
where not exists (
  select 1 from flow_edges x where x.from_node_id = f.id and x.outcome = e.outcome
);
```

- [ ] **Step 2: Apply the migration + regenerate types**

Run (requires the Supabase project linked / local DB up — same as any schema change in this repo):
```bash
# apply: supabase db push  (or local: supabase migration up)
pnpm --filter @workspace/db gen-types
```
Expected: `packages/db` generated types now include `flow_nodes` and `flow_edges` rows. Verify the `Database` type has both tables before continuing (the worker tasks below won't typecheck otherwise).

- [ ] **Step 3: Commit** *(see "Branch & commit" note before the first commit)*

```bash
git add packages/db/supabase/migrations packages/db
git commit -m "feat(db): add flow_nodes + flow_edges + seeded default tree"
```

---

### Task 2: Types — add the graph types

**Files:**
- Modify: `apps/worker/src/lib/flow/types.ts` (append; keep `Step`/`FlowStepConfig`).

- [ ] **Step 1: Add the new types**

```ts
// A node as loaded from flow_nodes (per inbox tree).
export type FlowNode = {
  id: string
  node_key: string
  node_type: string
  ai_prompt: string | null
  model: string | null
  config: Record<string, unknown>
}

// A node returns a context patch PLUS the outcome that routes the next edge.
export type NodeResult = Partial<StepContext> & {
  outcome: string
  halt?: boolean
}

export type NodeType = {
  type: string
  run(ctx: StepContext, node: FlowNode): Promise<NodeResult>
}

// The loaded tree: start node + node lookup + adjacency (fromId -> outcome -> toId).
export type FlowGraph = {
  startId: string | null
  nodes: Map<string, FlowNode>
  edges: Map<string, Map<string, string>>
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter worker typecheck`
Expected: PASS (additive types only).

---

### Task 3: The graph walk (`run-graph.ts`) — TDD

**Files:**
- Create: `apps/worker/src/lib/flow/run-graph.ts`
- Test: `apps/worker/src/lib/flow/__tests__/run-graph.test.ts`

- [ ] **Step 1: Write the failing tests** (mirror `run-flow.test.ts` mock style)

```ts
import { describe, it, expect } from "vitest"
import { runGraph } from "../run-graph.js"
import type { NodeType, StepContext, FlowGraph, FlowNode } from "../types.js"

const node = (id: string, type: string): FlowNode => ({
  id, node_key: id, node_type: type, ai_prompt: null, model: null, config: {},
})
// build a FlowGraph from a start id, nodes, and [from, outcome, to] edges
const graph = (
  startId: string,
  nodes: FlowNode[],
  edgeList: [string, string, string][]
): FlowGraph => {
  const edges = new Map<string, Map<string, string>>()
  for (const [from, outcome, to] of edgeList) {
    if (!edges.has(from)) edges.set(from, new Map())
    edges.get(from)!.set(outcome, to)
  }
  return { startId, nodes: new Map(nodes.map((n) => [n.id, n])), edges }
}

describe("runGraph", () => {
  it("walks from start, following the edge for each node's outcome", async () => {
    const calls: string[] = []
    const reg: Record<string, NodeType> = {
      A: { type: "A", run: async () => { calls.push("A"); return { outcome: "go" } } },
      B: { type: "B", run: async () => { calls.push("B"); return { outcome: "done" } } },
    }
    const g = graph("a", [node("a", "A"), node("b", "B")], [["a", "go", "b"]])
    await runGraph(g, reg, {} as StepContext)
    expect(calls).toEqual(["A", "B"])
  })

  it("falls back to the 'default' edge when no edge matches the outcome", async () => {
    const calls: string[] = []
    const reg: Record<string, NodeType> = {
      A: { type: "A", run: async () => { calls.push("A"); return { outcome: "refund_request" } } },
      B: { type: "B", run: async () => { calls.push("B"); return { outcome: "done" } } },
    }
    const g = graph("a", [node("a", "A"), node("b", "B")], [["a", "default", "b"]])
    await runGraph(g, reg, {} as StepContext)
    expect(calls).toEqual(["A", "B"])
  })

  it("halts when a node returns halt (no edge followed)", async () => {
    const calls: string[] = []
    const reg: Record<string, NodeType> = {
      A: { type: "A", run: async () => { calls.push("A"); return { outcome: "spam", halt: true } } },
      B: { type: "B", run: async () => { calls.push("B"); return { outcome: "done" } } },
    }
    const g = graph("a", [node("a", "A"), node("b", "B")], [["a", "not_spam", "b"]])
    await runGraph(g, reg, {} as StepContext)
    expect(calls).toEqual(["A"])
  })

  it("merges each node's patch into ctx", async () => {
    const reg: Record<string, NodeType> = {
      A: { type: "A", run: async () => ({ outcome: "default", productFacts: "x" }) },
      B: { type: "B", run: async (ctx) => ({ outcome: "done", decisionId: ctx.productFacts ?? "" }) },
    }
    const g = graph("a", [node("a", "A"), node("b", "B")], [["a", "default", "b"]])
    const out = await runGraph(g, reg, {} as StepContext)
    expect(out.decisionId).toBe("x")
  })

  it("ends at a terminal node (no outgoing edge)", async () => {
    const calls: string[] = []
    const reg: Record<string, NodeType> = {
      A: { type: "A", run: async () => { calls.push("A"); return { outcome: "done" } } },
    }
    const g = graph("a", [node("a", "A")], [])
    await runGraph(g, reg, {} as StepContext)
    expect(calls).toEqual(["A"])
  })

  it("stops on an unknown node_type", async () => {
    const g = graph("a", [node("a", "MISSING")], [])
    await runGraph(g, {}, {} as StepContext) // no throw, just stops
  })

  it("bounds traversal against cycles (maxHops)", async () => {
    let n = 0
    const reg: Record<string, NodeType> = {
      A: { type: "A", run: async () => { n++; return { outcome: "default" } } },
    }
    const g = graph("a", [node("a", "A"), node("b", "A")],
      [["a", "default", "b"], ["b", "default", "a"]])
    await runGraph(g, reg, {} as StepContext)
    expect(n).toBeLessThanOrEqual(3) // nodes.size + 1
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter worker test run-graph`
Expected: FAIL — `run-graph.js` not found / `runGraph` not defined.

- [ ] **Step 3: Implement `run-graph.ts`**

```ts
import type { NodeType, StepContext, FlowGraph } from "./types.js"

// Walk the node graph from the start node. Each node returns an `outcome`;
// we follow the edge (from_node, outcome), falling back to a `default` edge.
// `halt` stops immediately (e.g. spam). maxHops guards against edge cycles.
export async function runGraph(
  graph: FlowGraph,
  registry: Record<string, NodeType>,
  ctx: StepContext
): Promise<StepContext> {
  let currentId = graph.startId
  const maxHops = graph.nodes.size + 1
  let hops = 0
  while (currentId && hops < maxHops) {
    hops++
    const node = graph.nodes.get(currentId)
    if (!node) break
    const impl = registry[node.node_type]
    if (!impl) {
      console.warn(`[flow] unknown node_type '${node.node_type}' — stopping`)
      break
    }
    const { outcome, halt, ...patch } = await impl.run(ctx, node)
    Object.assign(ctx, patch)
    if (halt) break
    const out = graph.edges.get(node.id)
    currentId = out?.get(outcome) ?? out?.get("default") ?? null
  }
  if (hops >= maxHops) console.warn(`[flow] maxHops reached — possible cycle`)
  return ctx
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter worker test run-graph`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/lib/flow/run-graph.ts apps/worker/src/lib/flow/__tests__/run-graph.test.ts apps/worker/src/lib/flow/types.ts
git commit -m "feat(worker): add node-graph walk (run-graph)"
```

---

### Task 4: Node wrappers over existing steps

These reuse the *exact* tested step logic, so behavior is identical. Each wrapper calls the matching `Step.run` and derives the `outcome`.

**Files:**
- Create: `apps/worker/src/lib/flow/nodes/adapt.ts`
- Create: `apps/worker/src/lib/flow/nodes/{spam-filter,classify,lookup-gate,enrich,decide,draft}.ts`

- [ ] **Step 1: `adapt.ts` — bridge FlowNode → FlowStepConfig**

```ts
import type { FlowNode, FlowStepConfig } from "../types.js"

// Existing steps read FlowStepConfig (ai_prompt + condition). Map a node onto it
// so the wrappers can call the unchanged step logic.
export function toStepConfig(node: FlowNode): FlowStepConfig {
  return {
    step_key: node.node_type,
    position: 0,
    ai_prompt: node.ai_prompt,
    condition: node.config,
  }
}
```

- [ ] **Step 2: The six wrappers**

`nodes/spam-filter.ts`:
```ts
import { SpamFilterStep } from "../steps/spam-filter.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Reuses SpamFilterStep verbatim (it inserts the quarantine decision + halts on
// spam). Outcome: 'spam' when it halted, else 'not_spam'.
export const SpamFilterNode: NodeType = {
  type: "spam_filter",
  async run(ctx, node) {
    const patch = await SpamFilterStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: patch.halt ? "spam" : "not_spam" }
  },
}
```

`nodes/classify.ts`:
```ts
import { ClassifyStep } from "../steps/classify.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Outcome = the classification label, so later phases can branch by category.
// Phase 1's seeded tree has only a 'default' edge, so all labels route onward.
export const ClassifyNode: NodeType = {
  type: "classify",
  async run(ctx, node) {
    const patch = await ClassifyStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: patch.classification?.classification ?? "default" }
  },
}
```

`nodes/lookup-gate.ts`:
```ts
import { LookupGateStep } from "../steps/lookup-gate.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

export const LookupGateNode: NodeType = {
  type: "lookup_gate",
  async run(ctx, node) {
    const patch = await LookupGateStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: "default" }
  },
}
```

`nodes/enrich.ts`:
```ts
import { EnrichStep } from "../steps/enrich.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

export const EnrichNode: NodeType = {
  type: "enrich",
  async run(ctx, node) {
    const patch = await EnrichStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: "default" }
  },
}
```

`nodes/decide.ts`:
```ts
import { DecideStep } from "../steps/decide.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Outcome = the chosen decision; Phase 1's seeded tree routes all to draft via
// the 'default' edge.
export const DecideNode: NodeType = {
  type: "decide",
  async run(ctx, node) {
    const patch = await DecideStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: patch.decision?.decision ?? "default" }
  },
}
```

`nodes/draft.ts`:
```ts
import { DraftStep } from "../steps/draft.js"
import { toStepConfig } from "./adapt.js"
import type { NodeType } from "../types.js"

// Terminal: persists the decision + drafts/escalates. No outgoing edge.
export const DraftNode: NodeType = {
  type: "draft",
  async run(ctx, node) {
    const patch = await DraftStep.run(ctx, toStepConfig(node))
    return { ...patch, outcome: "done" }
  },
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter worker typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/lib/flow/nodes
git commit -m "feat(worker): node wrappers reusing existing step logic"
```

---

### Task 5: Node registry

**Files:**
- Create: `apps/worker/src/lib/flow/node-registry.ts`

- [ ] **Step 1: Implement the registry**

```ts
import type { NodeType } from "./types.js"
import { SpamFilterNode } from "./nodes/spam-filter.js"
import { ClassifyNode } from "./nodes/classify.js"
import { LookupGateNode } from "./nodes/lookup-gate.js"
import { EnrichNode } from "./nodes/enrich.js"
import { DecideNode } from "./nodes/decide.js"
import { DraftNode } from "./nodes/draft.js"

// Maps flow_nodes.node_type to its NodeType implementation.
export const NODE_REGISTRY: Record<string, NodeType> = {
  [SpamFilterNode.type]: SpamFilterNode,
  [ClassifyNode.type]: ClassifyNode,
  [LookupGateNode.type]: LookupGateNode,
  [EnrichNode.type]: EnrichNode,
  [DecideNode.type]: DecideNode,
  [DraftNode.type]: DraftNode,
}
```

- [ ] **Step 2: Verify typecheck** — `pnpm --filter worker typecheck` → PASS.

---

### Task 6: `load-graph.ts` — load the tree

**Files:**
- Create: `apps/worker/src/lib/flow/load-graph.ts`

- [ ] **Step 1: Implement (mirror `load-flow.ts` fallback logic)**

```ts
import type { ServerClient } from "@workspace/db/client"
import type { FlowGraph, FlowNode } from "./types.js"

const NODE_COLS = "id, node_key, node_type, ai_prompt, model, config, is_start"

// Load the active node tree for an inbox, falling back to the global default
// (inbox_id is null) — same resolution as the old loadFlow.
export async function loadGraph(
  supabase: ServerClient,
  inboxId: string | null
): Promise<FlowGraph> {
  const nodes = await loadNodes(supabase, inboxId)
  if (!nodes.length) return { startId: null, nodes: new Map(), edges: new Map() }

  const { data: edgeRows } = await supabase
    .from("flow_edges")
    .select("from_node_id, to_node_id, outcome, position")
    .in("from_node_id", nodes.map((n) => n.id))
    .order("position")

  const edges = new Map<string, Map<string, string>>()
  for (const e of edgeRows ?? []) {
    if (!edges.has(e.from_node_id)) edges.set(e.from_node_id, new Map())
    edges.get(e.from_node_id)!.set(e.outcome, e.to_node_id)
  }
  const start = nodes.find((n) => n.is_start)
  return {
    startId: start?.id ?? null,
    nodes: new Map(nodes.map((n) => [n.id, n])),
    edges,
  }
}

async function loadNodes(
  supabase: ServerClient,
  inboxId: string | null
): Promise<(FlowNode & { is_start: boolean })[]> {
  if (inboxId) {
    const { data } = await supabase
      .from("flow_nodes").select(NODE_COLS)
      .eq("inbox_id", inboxId).eq("is_active", true)
    if (data && data.length) return data as unknown as (FlowNode & { is_start: boolean })[]
  }
  const { data } = await supabase
    .from("flow_nodes").select(NODE_COLS)
    .is("inbox_id", null).eq("is_active", true)
  return (data ?? []) as unknown as (FlowNode & { is_start: boolean })[]
}
```

- [ ] **Step 2: Verify typecheck** — `pnpm --filter worker typecheck` → PASS (depends on Task 1's regenerated types).

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/lib/flow/node-registry.ts apps/worker/src/lib/flow/load-graph.ts
git commit -m "feat(worker): load-graph + node-registry"
```

---

### Task 7: Seeded-tree equivalence test

Proves the seeded default tree reproduces today's visiting order (linear, with spam halt) without needing live models.

**Files:**
- Modify: `apps/worker/src/lib/flow/__tests__/run-graph.test.ts` (append a describe block).

- [ ] **Step 1: Write the failing test**

```ts
describe("seeded default tree (equivalence)", () => {
  // Mirror the migration's seeded nodes/edges.
  const SEED_NODES = ["spam_filter","classify","lookup_gate","enrich","decide","draft"]
  const SEED_EDGES: [string, string, string][] = [
    ["spam_filter","not_spam","classify"],
    ["classify","default","lookup_gate"],
    ["lookup_gate","default","enrich"],
    ["enrich","default","decide"],
    ["decide","default","draft"],
  ]
  const buildGraph = () => {
    const nodes = SEED_NODES.map((k) => node(k, k))      // node() from the helper above
    return graph("spam_filter", nodes, SEED_EDGES)        // graph() from the helper above
  }

  it("non-spam ticket visits all six nodes in pipeline order", async () => {
    const seen: string[] = []
    const reg: Record<string, NodeType> = Object.fromEntries(
      SEED_NODES.map((k) => [k, {
        type: k,
        run: async () => {
          seen.push(k)
          if (k === "classify") return { outcome: "faq" }   // real label; routes via 'default'
          if (k === "decide") return { outcome: "send_faq_reply" }
          if (k === "draft") return { outcome: "done" }
          return { outcome: "default" }
        },
      }])
    )
    await runGraph(buildGraph(), reg, {} as StepContext)
    expect(seen).toEqual(["spam_filter","classify","lookup_gate","enrich","decide","draft"])
  })

  it("spam ticket halts after spam_filter", async () => {
    const seen: string[] = []
    const reg: Record<string, NodeType> = Object.fromEntries(
      SEED_NODES.map((k) => [k, {
        type: k,
        run: async () => {
          seen.push(k)
          if (k === "spam_filter") return { outcome: "spam", halt: true }
          return { outcome: "default" }
        },
      }])
    )
    await runGraph(buildGraph(), reg, {} as StepContext)
    expect(seen).toEqual(["spam_filter"])
  })
})
```

- [ ] **Step 2: Run → expect FAIL** (until the helpers `node`/`graph` are shared — they're defined at the top of the file from Task 3, so this should compile; the assertions are the gate). Run: `pnpm --filter worker test run-graph`. Expected: PASS once Task 3 helpers exist. If helper scoping fails, hoist `node`/`graph` to module scope.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/lib/flow/__tests__/run-graph.test.ts
git commit -m "test(worker): seeded-tree equivalence for the graph walk"
```

---

### Task 8: Rewire the processor to the graph

**Files:**
- Modify: `apps/worker/src/processors/email.ts` (imports + lines 42-53).

- [ ] **Step 1: Swap imports**

Replace:
```ts
import { loadFlow } from "../lib/flow/load-flow.js"
import { runFlow } from "../lib/flow/run-flow.js"
import { STEP_REGISTRY } from "../lib/flow/registry.js"
```
with:
```ts
import { loadGraph } from "../lib/flow/load-graph.js"
import { runGraph } from "../lib/flow/run-graph.js"
import { NODE_REGISTRY } from "../lib/flow/node-registry.js"
```

- [ ] **Step 2: Swap the call** (lines 42-53 — `ctx` is unchanged)

Replace:
```ts
  // Run the per-inbox decision flow (default: classify → enrich → decide → draft).
  const steps = await loadFlow(supabase, routing.inboxId)
  const ctx: StepContext = { email, inboxId: routing.inboxId, product: routing.product, productFacts, supabase, anthropic, instructions }
  await runFlow(steps, STEP_REGISTRY, ctx)
```
with:
```ts
  // Run the per-inbox decision tree (node graph the worker walks).
  const graph = await loadGraph(supabase, routing.inboxId)
  const ctx: StepContext = { email, inboxId: routing.inboxId, product: routing.product, productFacts, supabase, anthropic, instructions }
  await runGraph(graph, NODE_REGISTRY, ctx)
```

- [ ] **Step 3: Verify build + full worker tests**

Run: `pnpm --filter worker typecheck && pnpm --filter worker test && pnpm --filter worker build`
Expected: PASS. (Old `run-flow.test.ts` still passes — those files are untouched.)

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/processors/email.ts
git commit -m "refactor(worker): execute the node graph instead of the linear flow"
```

---

### Task 9: Whole-repo verification + end-to-end equivalence

- [ ] **Step 1: Repo-wide checks**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: PASS across workspaces.

- [ ] **Step 2: End-to-end equivalence (live/mock)**

Process the same set of test emails through the worker before and after and confirm identical `decisions` rows (`classification`, `decision`, `status`, `template_used`, `refund_request_count`) and the same `audit_log` action sequence.
- If a replay/sim script exists under `apps/worker/scripts/` or `scripts/` (the team has run simulated scenarios — see `docs/eod/`), run it against both the pre-refactor commit and HEAD and diff the `decisions`.
- If no script exists, enqueue the canonical fixtures (spam, FAQ, prospective-buyer, existing-member refund 1st/2nd/3rd, chargeback) against a Redis + mock-adapter dev worker and compare the resulting `decisions` rows to a snapshot from the pre-refactor commit.
Expected: zero diffs. **Any diff is a bug, not an improvement — fix before Phase 2.**

- [ ] **Step 3: Demo checkpoint** — report equivalence evidence (diff output / passing snapshot) to the user/Ben: "same decisions, now produced by the tree the dashboard will show."

---

## Subsequent Phases (outline — expand into task lists when reached)

### Phase 2 — See the tree (S–M)
- `apps/web/lib/flow-graph.ts`: `getFlowGraph(inboxId)` mirroring `loadGraph` (browser uses the `authenticated` SELECT policy added in Task 1).
- Rewrite `apps/web/components/flow/flow-view.tsx`: render nodes as the existing card vocabulary, laid out by BFS from the start node, with a **branch chip per outgoing edge** and an **inline prompt preview** (effective prompt = node `ai_prompt` || global from `prompt_configs`). Simple SVG/CSS elbow connectors (`flow-edges.tsx`).
- Keep the inbox picker + `?inbox=` URL pattern. Demo: Ben sees the real flow per inbox, prompts inline. (Tree is the seeded shape until Phase 3.)

### Phase 3 — Edit + real branching (M)
- `updateFlowNode` admin-gated server action in `apps/web/lib/flow-actions.ts` (edit `ai_prompt`, `model`, `config.categories`); node sheet reuses the `step-prompt-form` pattern and shows the resolved global fallback inline.
- New node types for true branching: `order_lookup` (folds gate+enrich → outcomes `found`/`not_found`), `refund_ladder` (wraps `refund-decision.ts` → ladder outcomes), `send_reply` (template/decision/proposed_actions from `config`), `escalate`, `quarantine`.
- Migration reshapes the default tree into the category-branching mockup; widen `classify` to ~5 categories (dynamic Zod enum from `config.categories`). **Deliberate, visible behavior change** (no longer a pure refactor). Demo: rename a category / edit a prompt → next ticket follows the new branch.

### Phase 4 — Multi-platform API config (S–M)
- Migration: `integration_credentials` add `scope` (view|refund) + `platform_order`, allow `digistore`; `products.support_config.access_check` for Madhav.
- `packages/actions`: `getViewAdapters(product)` (ordered chain), `getRefundAdapter(product)`, `digistore.ts` stub, `checkProductAccess` stub. `order_lookup` iterates the view chain.
- Product detail page UI (scope/order/access-check); remove standalone `/credentials`. Calls stay stubbed (blocked on Ben's keys + Madhav). Demo: the API framework, visible.

### Phase 5 — Polish & cleanup (S)
- Delete `steps/*`, `run-flow.ts`, `load-flow.ts`, `registry.ts`, `run-flow.test.ts`, the `flow_steps` table; collapse node wrappers into first-class node impls.
- Persist `ctx.path` (executed nodes/outcomes) → `decisions.context.path`; make `apps/web/lib/flow-trace.ts` read it so the per-ticket trace is faithful.
- Per-inbox "clone the default tree to customize" action.

---

## Branch & commit (read before the first commit)
Current branch is `feat/auto-create-inbox` (an unrelated feature) with uncommitted changes. This feature should live on its own branch off `main`. **Confirm branch strategy and commit cadence with the user before committing** — do not commit onto `feat/auto-create-inbox`.

---

## Self-review

**Spec coverage (against `docs/decision-flow-proposal-2026-06-17.md`):**
- "Tree is what the worker runs" → Tasks 1,3,6,8 (worker walks `flow_nodes`/`flow_edges`). ✓
- "Byte-identical first" → wrappers reuse step logic (Task 4) + equivalence tests (Tasks 7,9). ✓
- Visible branching tree, inline prompts → Phase 2. Editable categories/branches → Phase 3. ✓
- Multi-platform view/refund APIs + Madhav slot → Phase 4. ✓
- Per-inbox flows → fallback resolution in `loadGraph` (Task 6), per-inbox trees (Phase 2/5). ✓
- Approval-gated, never auto-send → `DraftNode` reuses `DraftStep` which only drafts/queues; no node imports `sendReply`/`refundCustomer` (those stay in `apps/web/lib/approvals.ts`). ✓

**Placeholder scan:** none — every code step has complete content.

**Type consistency:** `NodeType.run` returns `NodeResult` (`Partial<StepContext> & {outcome; halt?}`); `runGraph` destructures `{outcome, halt, ...patch}` and merges `patch`; wrappers return `{...patch, outcome}` where `patch` is the step's `Partial<StepContext>`. `FlowGraph.edges` is `Map<fromId, Map<outcome, toId>>`, built identically in `load-graph.ts` and the test helper. `node_type` values (`spam_filter`/`classify`/`lookup_gate`/`enrich`/`decide`/`draft`) match across the migration seed, the wrappers' `.type`, and the registry keys.
