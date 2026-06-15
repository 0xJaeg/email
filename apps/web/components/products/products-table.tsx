import Link from "next/link"
import { getProducts } from "@/lib/products"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { TablePagination } from "@/components/shared/table-pagination"
import { EditProductButton } from "./edit-product-button"
import { DeleteProductButton } from "./delete-product-button"

export async function ProductsTable({
  query,
  page,
  size,
}: {
  query: string
  page: number
  size: number
}) {
  const { data, count } = await getProducts(query, page, size)

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Adapter</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/products/${p.id}`}
                      className="hover:underline"
                    >
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.slug}
                  </TableCell>
                  <TableCell>{p.platform}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {p.adapter_key ?? "—"}
                  </TableCell>
                  <TableCell>{p.is_active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <EditProductButton product={p} />
                    {p.slug !== "default" && (
                      <DeleteProductButton id={p.id} name={p.name} />
                    )}
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
