"use client"

import { useRef } from "react"
import { IconSearch } from "@tabler/icons-react"
import { Input } from "@workspace/ui/components/input"
import { useSearchParams, usePathname, useRouter } from "next/navigation"

// URL-driven, debounced search. Sets ?query= and resets ?page= so results
// start from page 1. The server component reads `query` and refetches.
export function SearchBar({ placeholder }: { placeholder?: string }) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { replace } = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function handleSearch(value: string) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams)
      if (value) params.set("query", value)
      else params.delete("query")
      params.delete("page")
      replace(`${pathname}?${params.toString()}`)
    }, 300)
  }

  return (
    <div className="relative w-full">
      <IconSearch className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
      <Input
        onChange={(e) => handleSearch(e.target.value)}
        defaultValue={searchParams.get("query")?.toString()}
        type="text"
        placeholder={placeholder ?? "Search..."}
        className="w-full rounded-md pl-8 md:w-100"
      />
    </div>
  )
}
