import type { Step } from "./types.js"
import { SpamFilterStep } from "./steps/spam-filter.js"
import { ClassifyStep } from "./steps/classify.js"
import { LookupGateStep } from "./steps/lookup-gate.js"
import { EnrichStep } from "./steps/enrich.js"
import { DecideStep } from "./steps/decide.js"
import { DraftStep } from "./steps/draft.js"

// Maps a flow_steps.step_key to its code-defined Step implementation.
export const STEP_REGISTRY: Record<string, Step> = {
  [SpamFilterStep.key]: SpamFilterStep,
  [ClassifyStep.key]: ClassifyStep,
  [LookupGateStep.key]: LookupGateStep,
  [EnrichStep.key]: EnrichStep,
  [DecideStep.key]: DecideStep,
  [DraftStep.key]: DraftStep,
}
