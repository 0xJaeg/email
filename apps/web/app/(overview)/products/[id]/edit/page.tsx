import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"
import { getActionSupabase } from "@/lib/supabase/server"
import { getServerSupabase } from "@/lib/supabase/admin"
import { getProduct } from "@/lib/products"
import { ProductForm } from "@/components/products/product-form"

export const dynamic = "force-dynamic"

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { user } = await getActionSupabase()
  const admin = getServerSupabase()
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (caller?.role !== "admin") redirect("/")

  const { id } = await params
  const product = await getProduct(id)
  if (!product) notFound()

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/products/${id}`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft size={14} /> {product.name}
        </Link>
        <h1 className="text-xl font-semibold">Edit product</h1>
      </div>
      <ProductForm
        mode="update"
        product={product}
        redirectTo={`/products/${id}`}
      />
    </div>
  )
}
