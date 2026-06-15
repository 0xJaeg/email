import type { Step, StepContext, FlowStepConfig } from "./types.js"

// Walk the configured steps in position order, threading a shared context.
// Each step returns a patch merged into the context; `halt` stops early.
// Unknown step_keys are skipped (forward-compatible: a DB row can name a step
// the running worker doesn't have yet).
export async function runFlow(
  steps: FlowStepConfig[],
  registry: Record<string, Step>,
  ctx: StepContext
): Promise<StepContext> {
  const ordered = [...steps].sort((a, b) => a.position - b.position)
  for (const cfg of ordered) {
    const step = registry[cfg.step_key]
    if (!step) {
      console.warn(`[flow] unknown step_key '${cfg.step_key}' — skipping`)
      continue
    }
    const patch = await step.run(ctx, cfg)
    Object.assign(ctx, patch)
    if (patch.halt) break
  }
  return ctx
}
