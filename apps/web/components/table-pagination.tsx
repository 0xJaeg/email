"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  IconChevronsLeft,
  IconChevronsRight,
  IconChevronRight,
  IconChevronLeft,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { useSearchParams, usePathname, useRouter } from "next/navigation"

interface TablePaginationProps {
  page: number
  pageSize: number
  totalCount: number
}

// URL-driven pagination (?page=&size=). Mirrors the SearchBar approach.
export function TablePagination({
  page,
  pageSize,
  totalCount,
}: TablePaginationProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { replace } = useRouter()

  if (totalCount === 0) return null

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  function goToPage(newPage: number) {
    const params = new URLSearchParams(searchParams)
    if (newPage <= 1) params.delete("page")
    else params.set("page", String(newPage))
    replace(`${pathname}?${params.toString()}`)
  }

  function changePageSize(newSize: string) {
    const params = new URLSearchParams(searchParams)
    params.set("size", newSize)
    params.delete("page")
    replace(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="rows-per-page" className="text-sm font-medium">
          Rows per page
        </Label>
        <Select value={String(pageSize)} onValueChange={changePageSize}>
          <SelectTrigger size="sm" className="w-20" id="rows-per-page">
            <SelectValue placeholder={String(pageSize)} />
          </SelectTrigger>
          <SelectContent side="top">
            {[5, 10, 20, 30, 40, 50].map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex w-fit items-center justify-center text-sm font-medium">
        Page {page} of {totalPages}
      </div>
      <div className="ml-auto flex items-center gap-2 lg:ml-0">
        <Button
          variant="outline"
          size="icon"
          className="hidden lg:flex"
          onClick={() => goToPage(1)}
          disabled={page <= 1}
        >
          <span className="sr-only">Go to first page</span>
          <IconChevronsLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
        >
          <span className="sr-only">Go to previous page</span>
          <IconChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages}
        >
          <span className="sr-only">Go to next page</span>
          <IconChevronRight />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="hidden lg:flex"
          onClick={() => goToPage(totalPages)}
          disabled={page >= totalPages}
        >
          <span className="sr-only">Go to last page</span>
          <IconChevronsRight />
        </Button>
      </div>
    </div>
  )
}
