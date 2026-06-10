import { getTriggers } from "@/lib/triggers"
import type { ProductOption } from "@/lib/inboxes"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { EditTriggerButton } from "./edit-trigger-button"
import { DeleteTriggerButton } from "./delete-trigger-button"

export async function TriggersTable({
  products,
}: {
  products: ProductOption[]
}) {
  const data = await getTriggers()
  const nameById = new Map(products.map((p) => [p.id, p.name]))

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="text-muted-foreground py-10 text-center"
              >
                No triggers — products use the default refund threshold (3
                requests).
              </TableCell>
            </TableRow>
          ) : (
            data.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  {t.product_id ? (nameById.get(t.product_id) ?? "—") : "Global"}
                </TableCell>
                <TableCell className="text-sm">
                  Refund after {t.after_n_requests ?? "?"} requests
                </TableCell>
                <TableCell>{t.is_active ? "Active" : "Inactive"}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <EditTriggerButton trigger={t} products={products} />
                  <DeleteTriggerButton id={t.id} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
