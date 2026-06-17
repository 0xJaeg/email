"use client"

import { useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Button } from "@workspace/ui/components/button"
import { IconPencil } from "@tabler/icons-react"
import { NodePromptForm } from "./node-prompt-form"
import type { FlowNodeRow } from "@/lib/flow-graph"

export function EditNodeButton({ node }: { node: FlowNodeRow }) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`Edit ${node.title}`}
        onClick={() => setOpen(true)}
      >
        <IconPencil />
      </Button>
      <SheetContent className="gap-4 overflow-y-auto sm:max-w-275">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <IconPencil size={18} strokeWidth={1.2} />
            Edit: {node.title}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {node.node_type}
          </SheetDescription>
        </SheetHeader>
        <NodePromptForm node={node} closeSheet={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
