import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Build breadcrumb segments from a dashboard pathname.
// The dashboard is the root page ("/"), so an empty path gets a default
// "Dashboard" crumb instead of a blank one.
export function getBreadcrumbs(
  pathname: string
): { title: string; href: string }[] {
  // e.g. "/resources/leads" → ["resources", "leads"]; "/" → []
  const segments = pathname.replace(/^\//, "").split("/").filter(Boolean)

  if (segments.length === 0) {
    return [{ title: "Dashboard", href: "/" }]
  }

  return segments.map((segment, index) => ({
    title: segment
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" "),
    href: "/" + segments.slice(0, index + 1).join("/"),
  }))
}
