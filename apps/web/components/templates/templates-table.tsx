import { getTemplates } from "@/lib/templates"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Badge } from "@workspace/ui/components/badge"
import { EditTemplateButton } from "./edit-template-button"
import { DeleteTemplateButton } from "./delete-template-button"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export async function TemplatesTable() {
  const templates = await getTemplates()

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-muted-foreground"
              >
                No templates yet.
              </TableCell>
            </TableRow>
          ) : (
            templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.title}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {t.name}
                </TableCell>
                <TableCell>
                  {t.is_active ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(t.updated_at)}
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <EditTemplateButton template={t} />
                  <DeleteTemplateButton id={t.id} title={t.title} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
