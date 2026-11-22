"use client"

import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useTheme } from "@/design-system"

/** Toasts in Foundry surfaces: hairline border, pop shadow, small radius. */
export function Toaster(props: ToasterProps) {
  const [theme] = useTheme()
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheck className="text-success size-4" />,
        info: <Info className="text-info size-4" />,
        warning: <TriangleAlert className="text-warning size-4" />,
        error: <OctagonX className="text-danger size-4" />,
        loading: <LoaderCircle className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--fg)",
          "--normal-border": "var(--line-strong)",
          "--border-radius": "var(--radius-lg)",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: "shadow-pop text-[13px]", description: "!text-fg-muted" } }}
      {...props}
    />
  )
}
