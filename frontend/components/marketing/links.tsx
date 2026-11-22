"use client"

import { ArrowUpRight } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { ABOUT_ME_URL, buttonClass, LinkButton, type ButtonSize, type ButtonVariant } from "@/design-system"

/**
 * The design system exports buttonClass and ABOUT_ME_URL from "use client" modules, so server
 * components cannot read them. These wrappers let server pages use both.
 */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  children,
}: {
  href: string
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}) {
  return (
    // No prefetch: marketing pages stay light; the workspace bundle loads when someone opens it.
    <Link href={href} prefetch={false} className={buttonClass(variant, size)}>
      {children}
    </Link>
  )
}

export function AboutMeButton({ variant = "primary", size = "lg" }: { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <LinkButton href={ABOUT_ME_URL} variant={variant} size={size}>
      About me
    </LinkButton>
  )
}

export function AboutMeLink({ className }: { className?: string }) {
  return (
    <a
      href={ABOUT_ME_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-fg-muted hover:text-fg inline-flex items-center gap-1 text-sm"}
    >
      About me <ArrowUpRight className="size-3.5" aria-hidden />
    </a>
  )
}
