import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { IconPencil } from "@tabler/icons-react"

// Per-row edit affordance → the product page (which is view + edit in one).
export function EditProductButton({ productId }: { productId: string }) {
  return (
    <Button asChild variant="outline" size="icon-sm">
      <Link href={`/products/${productId}`} aria-label="Edit product">
        <IconPencil />
      </Link>
    </Button>
  )
}
