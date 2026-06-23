import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { IconPencil } from "@tabler/icons-react"
import type { ProductRow } from "@/lib/products"

// Links to the full-page editor (replaces the old cramped Sheet popup).
export function EditProductButton({ product }: { product: ProductRow }) {
  return (
    <Button asChild variant="outline" size="icon-sm">
      <Link href={`/products/${product.id}/edit`} aria-label="Edit product">
        <IconPencil />
      </Link>
    </Button>
  )
}
