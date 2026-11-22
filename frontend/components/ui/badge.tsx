import * as React from "react"

import { cn } from "@/lib/utils"

/** Foundry badge look (small radius, hairline) under the original variant names. */
const VARIANT = {
  default: "bg-accent-soft text-accent-ink border-transparent",
  secondary: "bg-surface-2 text-fg-2 border-line",
  destructive: "bg-danger-soft text-danger border-transparent",
  outline: "border-line-strong text-fg-2",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
} as const

function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & { variant?: keyof typeof VARIANT }) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-sm border px-2 py-0.5 text-xs leading-5 font-medium whitespace-nowrap [&>svg]:size-3",
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  )
}

export { Badge }
