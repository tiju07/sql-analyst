"use client"

import { Moon, Sun } from "lucide-react"

import { IconButton } from "@/design-system"
import { setTheme, useResolvedTheme } from "@/lib/theme"

/** Foundry theme toggle wired to the shared theme store, so every themed component follows it. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useResolvedTheme()
  const next = theme === "dark" ? "light" : "dark"
  return (
    <IconButton label={`Switch to ${next} theme`} className={className} onClick={() => setTheme(next)}>
      {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </IconButton>
  )
}
