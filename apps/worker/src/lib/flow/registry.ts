import type { Step } from "./types.js"
import { ClassifyStep } from "./steps/classify.js"
import { EnrichStep } from "./steps/enrich.js"
import { DecideStep } from "./steps/decide.js"
import { DraftStep } from "./steps/draft.js"

// Maps a flow_steps.step_key to its code-defined Step implementation.
export const STEP_REGISTRY: Record<string, Step> = {
  [ClassifyStep.key]: ClassifyStep,
  [EnrichStep.key]: EnrichStep,
  [DecideStep.key]: DecideStep,
  [DraftStep.key]: DraftStep,
}
