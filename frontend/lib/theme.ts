"use client"

import { useSyncExternalStore } from "react"

/**
 * Shared theme state on top of Foundry's `data-theme` attribute. Foundry's `useTheme` keeps its
 * state per component, so two components using it drift apart; this store follows the attribute
 * and the system setting, so every subscriber (charts, code blocks, toasts) re-renders together.
 */
export type Theme = "light" | "dark"
const KEY = "foundry-theme" // same storage key as the design system's themeInitScript

function subscribe(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
  const mq = window.matchMedia("(prefers-color-scheme: dark)")
  mq.addEventListener("change", onChange)
  return () => {
    mo.disconnect()
    mq.removeEventListener("change", onChange)
  }
}

function current(): Theme {
  const attr = document.documentElement.getAttribute("data-theme")
  if (attr === "light" || attr === "dark") return attr
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function useResolvedTheme(): Theme {
  return useSyncExternalStore(subscribe, current, () => "light")
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // storage blocked: the theme still applies for this visit
  }
}
