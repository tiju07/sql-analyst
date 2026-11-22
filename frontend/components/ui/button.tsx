import { Slot } from "radix-ui"
import * as React from "react"

import { buttonClass, type ButtonVariant } from "@/design-system"
import { cn } from "@/lib/utils"

/**
 * Foundry Button with Radix `asChild`, so links and menu triggers can wear button styles.
 * Variant names follow the original call sites; looks come from the design system.
 */
const VARIANT = {
  default: "primary",
  solid: "solid",
  outline: "outline",
  secondary: "secondary",
  ghost: "ghost",
  destructive: "danger",
} as const satisfies Record<string, ButtonVariant>

const ICON_SIZE = { icon: "size-9", "icon-sm": "size-8", "icon-xs": "size-7", "icon-lg": "size-10" } as const

type Variant = keyof typeof VARIANT | "link"
type Size = "default" | "xs" | "sm" | "lg" | keyof typeof ICON_SIZE

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant; size?: Size; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"
  const icon = size in ICON_SIZE ? ICON_SIZE[size as keyof typeof ICON_SIZE] : null
  const base =
    variant === "link"
      ? "inline-flex items-center gap-1.5 rounded-sm font-medium text-accent-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      : buttonClass(VARIANT[variant], size === "lg" ? "lg" : size === "default" ? "md" : "sm")
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(
        base,
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        size === "xs" && "h-7 px-2 text-xs",
        icon && cn(icon, "px-0"),
        className,
      )}
      {...props}
    />
  )
}

export { Button }
