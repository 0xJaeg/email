"use client"

import { IconMoon, IconSun } from "@tabler/icons-react"
import { useTheme } from "next-themes"

import { Button } from "@workspace/ui/components/button"

export default function ThemeToggler() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="relative text-muted-foreground hover:text-foreground"
      aria-label="Toggle theme"
    >
      <IconSun className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <IconMoon className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
