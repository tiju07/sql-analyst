"use client"

import { useEffect } from "react"

export const FOCUS_COMPOSER = "sql-analyst:focus-composer"

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)))
}

/** Global shortcuts: Cmd/Ctrl+K opens the palette, "/" focuses the composer. */
export function useHotkeys(openPalette: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        openPalette()
      } else if (e.key === "/" && !typing(e.target) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        window.dispatchEvent(new Event(FOCUS_COMPOSER))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openPalette])
}
