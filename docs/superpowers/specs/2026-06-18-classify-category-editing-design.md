# Classify category + branch editing (in-app)

**Date:** 2026-06-18 · **Status:** approved

## Problem

The classify node's categories (`flow_nodes.config.categories`) and their branches
(`flow_edges` out of the classify node) are read-only in `/flows` — only the AI
prompt is editable. Changing the category list requires SQL/migration. We want
admins to edit categories and where each routes, in-app, without breaking the
worker's live routing.

## How the engine couples categories ↔ routing (constraints)

- The classify node builds its output **enum from `config.categories[].key`** and
  injects each `key: description` as the classifier's guide (`nodes/classify.ts`).
- It emits the chosen key as the **branch outcome**; `run-graph` routes
  `(classify, outcome=key) → edge.to_node_id`.
- So a category's **key** is both the enum value AND the edge outcome — renames/
  adds/removes must keep `config.categories` and the classify node's outgoing
  `flow_edges` in sync, or real mail misroutes. **label/description** are guidance
  only (no routing impact).

## Scope (chosen)

**Route categories to existing steps.** Edit the category list (add / remove /
rename key / edit label+description) and pick each category's target from the
inbox's **existing** flow nodes. No in-app node creation (not a workflow builder).

## Design

### 1. Atomic persistence — Postgres function

`set_classify_categories(p_node_id uuid, p_categories jsonb)` (migration), where
each element is `{ key, label, description, target_node_id }`. In one transaction:

- `update flow_nodes set config = jsonb_set(config, '{categories}', <key/label/description list>)` for the node.
- Replace the node's outgoing branch edges: `delete from flow_edges where from_node_id = p_node_id`, then insert one edge per category `(from_node_id = node, to_node_id = target, outcome = key, position = ordinality, inbox_id = node.inbox_id)`.

Atomic → the live classify node is never left with the enum and edges disagreeing.

### 2. Server action

`updateClassifyCategories(nodeId, categories[])` (admin-gated, `"use server"`):
validates, then `supabase.rpc("set_classify_categories", …)`, then
`revalidatePath("/flows")`.

**Validation:** ≥1 category; each `key` matches `^[a-z0-9_]+$` and is unique; each
has a `target_node_id` that exists. (By construction every emitted key then has an
edge — the classifier can't produce an unrouted outcome.)

### 3. UI

In the node sheet, a `classify` node's **CONFIGURATION** becomes an editor: one row
per category with **label**, **key**, **description**, and a **"routes to"**
dropdown of the inbox's steps; **+ Add category**, a remove per row, and **Save**.
Other node types keep the read-only view; the AI-prompt editor is unchanged.
`FlowCanvas` supplies the current category→target mapping (from `config` + edges)
and the target options (all nodes' id + title).

### 4. Prompt cleanup

Rewrite the classify node's `ai_prompt` to be **category-agnostic** — the category
descriptions are already injected as the authoritative guide, so the prompt keeps
only generic classification instructions (drops the stale "three labels" /
`refund_request` rubric). Applied to the live node (dlwc).

### 5. Testing

- Server-action validation: reject duplicate / empty / invalid keys and a missing
  target; accept a valid set and call the RPC with the mapped payload.
- Verify the RPC against dlwc after applying (config + edges in sync).

## Risks

- Mutates **live** classify routing — the RPC keeps it atomic; verify on dlwc.
- Categories are still a "starter" set pending Ben; this makes them self-serve.

## Out of scope

In-app node creation / free-form wiring (full workflow builder); editing other
node types' config.
