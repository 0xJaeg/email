import { getCredentials } from "@/lib/credentials"
import type { ProductOption } from "@/lib/inboxes"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { DeleteCredentialButton } from "./delete-credential-button"

export async function CredentialsTable({
  products,
}: {
  products: ProductOption[]
}) {
  const data = await getCredentials()
  const nameById = new Map(products.map((p) => [p.id, p.name]))

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Secret</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-10 text-center text-muted-foreground"
              >
                No credentials yet.
              </TableCell>
            </TableRow>
          ) : (
            data.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.label}</TableCell>
                <TableCell>{nameById.get(c.product_id) ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {c.platform}
                </TableCell>
                <TableCell className="font-mono text-xs">{c.scope}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  ••••{c.last4 ?? ""}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(c.updated_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="flex justify-end">
                  <DeleteCredentialButton id={c.id} label={c.label} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
