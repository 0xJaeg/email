"use client"

import { Fragment } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Badge } from "@workspace/ui/components/badge"
import { IconArrowRight } from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import {
  ROUTING_SPEC,
  type ResponseKind,
  type ApiState,
} from "@workspace/actions/api-routing-spec"
import { NodePromptForm } from "./node-prompt-form"
import {
  ClassifyConfigForm,
  type CategoryRow,
  type TargetOption,
} from "./classify-config-form"
import { PROMPT_DRIVEN_NODES, type FlowNodeRow } from "@/lib/flow-graph-types"

type Branch = { outcome: string; to: string }
type Category = { key: string; label?: string; description?: string }

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 px-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function ConfigBlock({ config }: { config: Record<string, unknown> }) {
  const categories = config.categories as Category[] | undefined
  if (Array.isArray(categories) && categories.length) {
    return (
      <div className="flex flex-col gap-2">
        {categories.map((c) => (
          <div key={c.key} className="rounded-md border p-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{c.label ?? c.key}</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                {c.key}
              </Badge>
            </div>
            {c.description ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {c.description}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    )
  }
  const entries = Object.entries(config)
  if (!entries.length) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No configuration for this node.
      </p>
    )
  }
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
      {entries.map(([k, v]) => (
        <Fragment key={k}>
          <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
          <dd className="font-mono text-xs break-all">
            {typeof v === "string" ? v : JSON.stringify(v)}
          </dd>
        </Fragment>
      ))}
    </dl>
  )
}

// Semantic colors for the API response/outcome badges (dark-aware).
const KIND_CLASSES: Record<ResponseKind, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400",
  empty: "border-border bg-muted/50 text-muted-foreground",
  error:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400",
  pending:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400",
  gap: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-400",
}
const STATE_TO_KIND: Record<ApiState, ResponseKind> = {
  live: "ok",
  pending: "pending",
  gap: "gap",
}
const STATE_LABEL: Record<ApiState, string> = {
  live: "live",
  pending: "pending keys",
  gap: "design gap",
}

// Ben's ask: surface, per API this step calls, the HTTP request + every
// possible response + the branch each routes to — read from ROUTING_SPEC (the
// code), joined with this node's actual edges (outcome -> target). A spec
// outcome with no matching edge renders as "no route" so gaps are visible.
function ApiRoutingSection({
  nodeType,
  branches,
}: {
  nodeType: string
  branches: Branch[]
}) {
  const spec = ROUTING_SPEC[nodeType]
  if (!spec) return null
  const targetFor = (outcome: string) =>
    branches.find((b) => b.outcome === outcome)?.to

  return (
    <Section title="API request → responses → routing">
      <p className="text-xs text-muted-foreground">
        Every response each API can return and the branch it routes to — read
        from the routing spec in code.
      </p>
      <div className="flex flex-col gap-2.5">
        {spec.apis.map((api) => (
          <div
            key={`${api.adapter}-${api.operation}`}
            className="flex flex-col gap-2 rounded-md border p-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm">{api.adapter}</span>
              <span className="font-mono text-xs text-muted-foreground">
                · {api.operation}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "ml-auto font-mono text-[10px]",
                  KIND_CLASSES[STATE_TO_KIND[api.state]]
                )}
              >
                {STATE_LABEL[api.state]}
              </Badge>
            </div>

            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                request
              </span>
              <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-xs break-all">
                {api.request}
              </code>
              {api.auth ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  auth: {api.auth}
                </span>
              ) : null}
            </div>

            {api.note ? (
              <p
                className={cn(
                  "text-xs",
                  api.state === "gap"
                    ? "text-orange-700 dark:text-orange-400"
                    : "text-muted-foreground"
                )}
              >
                {api.note}
              </p>
            ) : null}

            <div className="flex flex-col">
              {api.responses.map((r) => {
                const to = targetFor(r.outcome)
                return (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-2 border-t py-1.5 text-sm first:border-t-0"
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-[10px]",
                        KIND_CLASSES[r.kind]
                      )}
                    >
                      {r.http}
                    </Badge>
                    <span className="font-mono text-xs">{r.label}</span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <IconArrowRight className="size-3.5 text-muted-foreground" />
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono text-[10px]",
                          KIND_CLASSES[r.kind]
                        )}
                      >
                        {r.outcome}
                      </Badge>
                      <IconArrowRight className="size-3.5 text-muted-foreground" />
                      {to ? (
                        <span className="font-mono text-xs">{to}</span>
                      ) : (
                        <span className="font-mono text-xs text-destructive">
                          no route
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

// The wide sheet shown when a node on /flows is clicked: identity + config +
// outgoing branches, and the editable AI prompt for prompt-driven nodes (other
// nodes show their prompt read-only, or nothing if they have none).
export type ClassifyEditor = {
  nodeId: string
  categories: CategoryRow[]
  targets: TargetOption[]
}

export function NodeDetailSheet({
  node,
  branches,
  classifyEditor,
  onClose,
}: {
  node: FlowNodeRow | null
  branches: Branch[]
  classifyEditor?: ClassifyEditor | null
  onClose: () => void
}) {
  const editable = node ? PROMPT_DRIVEN_NODES.includes(node.node_type) : false

  return (
    <Sheet open={!!node} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-4 overflow-y-auto sm:max-w-275">
        {node ? (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {node.title}
                {node.is_start ? (
                  <Badge variant="outline" className="text-[10px]">
                    start
                  </Badge>
                ) : null}
                {!node.is_active ? (
                  <Badge variant="secondary" className="text-[10px]">
                    inactive
                  </Badge>
                ) : null}
              </SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {node.node_type} · {node.node_key}
                {node.model ? ` · ${node.model}` : ""}
              </SheetDescription>
            </SheetHeader>

            {node.description ? (
              <Section title="Description">
                <p className="text-sm text-muted-foreground">
                  {node.description}
                </p>
              </Section>
            ) : null}

            <ApiRoutingSection nodeType={node.node_type} branches={branches} />

            {classifyEditor ? (
              <div className="flex flex-col gap-2">
                <h3 className="px-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Categories &amp; branches
                </h3>
                <ClassifyConfigForm
                  nodeId={classifyEditor.nodeId}
                  initial={classifyEditor.categories}
                  targets={classifyEditor.targets}
                  closeSheet={onClose}
                />
              </div>
            ) : (
              <>
                <Section title="Configuration">
                  <ConfigBlock config={node.config} />
                </Section>

                <Section title="Branches">
                  {branches.length ? (
                    <ul className="flex flex-col gap-1.5">
                      {branches.map((b) => (
                        <li
                          key={`${b.outcome}->${b.to}`}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Badge
                            variant="secondary"
                            className="font-mono text-[10px]"
                          >
                            {b.outcome}
                          </Badge>
                          <IconArrowRight className="size-3.5 text-muted-foreground" />
                          <span>{b.to}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Terminal node — no outgoing branches.
                    </p>
                  )}
                </Section>
              </>
            )}

            {editable ? (
              // NodePromptForm carries its own px-4 padding + save button.
              <div className="flex flex-col gap-2">
                <h3 className="px-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  AI prompt
                </h3>
                <NodePromptForm node={node} closeSheet={onClose} />
              </div>
            ) : (
              <Section title="AI prompt">
                {node.ai_prompt && node.ai_prompt.trim() ? (
                  <pre className="max-h-[40vh] overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
                    {node.ai_prompt}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    This node type doesn’t use an AI prompt.
                  </p>
                )}
              </Section>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
