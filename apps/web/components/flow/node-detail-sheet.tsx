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
import { NodePromptForm } from "./node-prompt-form"
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

// The wide sheet shown when a node on /flows is clicked: identity + config +
// outgoing branches, and the editable AI prompt for prompt-driven nodes (other
// nodes show their prompt read-only, or nothing if they have none).
export function NodeDetailSheet({
  node,
  branches,
  onClose,
}: {
  node: FlowNodeRow | null
  branches: Branch[]
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
