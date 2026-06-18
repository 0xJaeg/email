import { getInboxes, type ProductOption } from "@/lib/inboxes"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { TablePagination } from "@/components/shared/table-pagination"
import { EditInboxButton } from "./edit-inbox-button"
import { DeleteInboxButton } from "./delete-inbox-button"

export async function InboxesTable({
  query,
  page,
  size,
  products,
}: {
  query: string
  page: number
  size: number
  products: ProductOption[]
}) {
  const { data, count } = await getInboxes(query, page, size)
  const nameById = new Map(products.map((p) => [p.id, p.name]))

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent Mail inbox</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  No inboxes found.
                </TableCell>
              </TableRow>
            ) : (
              data.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">
                    {i.agent_mail_inbox_id}
                  </TableCell>
                  <TableCell>{nameById.get(i.product_id) ?? "—"}</TableCell>
                  <TableCell>{i.is_active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <EditInboxButton inbox={i} products={products} />
                    <DeleteInboxButton
                      id={i.id}
                      agentMailInboxId={i.agent_mail_inbox_id}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination page={page} pageSize={size} totalCount={count} />
    </div>
  )
}
