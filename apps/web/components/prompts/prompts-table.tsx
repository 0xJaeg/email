import { getPrompts } from "@/lib/prompts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { EditPromptButton } from "./edit-prompt-button"

const KIND_LABELS: Record<string, string> = {
  overview: "Business overview",
  classifier: "Classifier rubric",
  policy_refund: "Refund policy",
  policy_faq: "FAQ / common questions",
  tone: "Tone of voice",
}

export async function PromptsTable() {
  const data = await getPrompts()

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Prompt</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Last edited</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-muted-foreground py-10 text-center"
              >
                No prompts found — seed them with scripts/seed-prompts.mjs.
              </TableCell>
            </TableRow>
          ) : (
            data.map((p) => {
              const label = KIND_LABELS[p.kind] ?? p.kind
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{label}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {p.kind}
                  </TableCell>
                  <TableCell>v{p.version}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(p.updated_at).toLocaleDateString()}
                    {p.updated_by ? ` · ${p.updated_by}` : ""}
                  </TableCell>
                  <TableCell className="flex justify-end">
                    <EditPromptButton prompt={p} label={label} />
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
