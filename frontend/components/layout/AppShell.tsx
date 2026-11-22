"use client"

import { mode } from "app-mode"
import {
  ArrowUpRight,
  Command,
  Database,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense, useCallback, useState, type ReactNode } from "react"

import { CommandPalette } from "@/components/layout/CommandPalette"
import { ConversationList } from "@/components/layout/ConversationList"
import { DemoBar } from "@/components/layout/DemoBar"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ABOUT_ME_URL, IconButton, Kbd, Logo } from "@/design-system"
import { usePersistentFlag } from "@/lib/hooks/useClientFlags"
import { useHotkeys } from "@/lib/hooks/useHotkeys"
import { PRODUCT_NAME } from "@/lib/site"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/app", label: "Ask", icon: MessageSquareText },
  { href: "/app/catalog", label: "Data catalog", icon: Database },
  { href: "/app/verified", label: "Verified queries", icon: ShieldCheck },
] as const

function useSection() {
  const path = (usePathname() ?? "/app").replace(/\/$/, "")
  return NAV.find((n) => n.href === path) ?? NAV[0]
}

function Brand() {
  return (
    <Link href="/app" className="rounded-sm" aria-label={`${PRODUCT_NAME}, new question`}>
      <Logo name={PRODUCT_NAME} />
    </Link>
  )
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const active = useSection()
  return (
    <nav aria-label="Workspace" className="grid gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={active.href === href ? "page" : undefined}
          className={cn(
            "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors duration-100",
            active.href === href ? "bg-surface-3 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
          )}
        >
          <Icon aria-hidden className="size-4 opacity-80" />
          {label}
        </Link>
      ))}
    </nav>
  )
}

function SidebarBody({ onNavigate, onCollapse }: { onNavigate?: () => void; onCollapse?: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-3 py-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <Brand />
        {onCollapse ? (
          <IconButton label="Collapse sidebar" onClick={onCollapse} className="border-transparent">
            <PanelLeftClose className="size-4" aria-hidden />
          </IconButton>
        ) : null}
      </div>
      <Link
        href="/app"
        onClick={onNavigate}
        className="bg-accent text-accent-fg hover:bg-accent-hover focus-visible:outline-accent inline-flex h-8 items-center gap-2 rounded-md border border-transparent px-3 text-[13px] font-medium shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Plus aria-hidden className="size-4" />
        New question
      </Link>
      <NavLinks onNavigate={onNavigate} />
      <div className="border-line flex min-h-0 flex-1 flex-col border-t pt-3">
        <Suspense>
          <ConversationList onNavigate={onNavigate} />
        </Suspense>
      </div>
      <div className="border-line grid gap-3 border-t pt-3">
        <mode.AccountMenu onDone={onNavigate} />
        <div className="flex items-center justify-between gap-2 px-1 text-[13px]">
          <span className="flex gap-3">
            <a href="/evals/" className="text-fg-muted hover:text-fg">
              Method
            </a>
            <a
              href={ABOUT_ME_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg-muted hover:text-fg inline-flex items-center gap-0.5"
            >
              About me
              <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          </span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}

function Rail({ onExpand, onPalette }: { onExpand: () => void; onPalette: () => void }) {
  const active = useSection()
  return (
    <div className="flex h-full flex-col items-center gap-1 py-4">
      <IconButton label="Open sidebar" onClick={onExpand} className="border-transparent">
        <PanelLeftOpen className="size-4" aria-hidden />
      </IconButton>
      <IconButton label="Command palette" onClick={onPalette} className="border-transparent">
        <Command className="size-4" aria-hidden />
      </IconButton>
      <div className="bg-line my-2 h-px w-6" />
      {NAV.map(({ href, label, icon: Icon }) => (
        <Tooltip key={href}>
          <TooltipTrigger asChild>
            <Link
              href={href}
              aria-label={label}
              aria-current={active.href === href ? "page" : undefined}
              className={cn(
                "grid size-8 place-items-center rounded-md transition-colors",
                active.href === href ? "bg-surface-3 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon aria-hidden className="size-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = usePersistentFlag("sidebar-collapsed")
  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const section = useSection()
  useHotkeys(openPalette)

  return (
    <div className="bg-bg flex h-dvh flex-col overflow-hidden">
      {mode.isDemo ? <DemoBar /> : null}
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Sidebar"
          className={cn("border-line bg-bg-subtle hidden shrink-0 border-r lg:block", collapsed ? "w-14" : "w-[232px]")}
        >
          {collapsed ? (
            <Rail onExpand={() => setCollapsed(false)} onPalette={openPalette} />
          ) : (
            <SidebarBody onCollapse={() => setCollapsed(true)} />
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-line flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-5">
            <span className="lg:hidden">
              <IconButton label="Open menu" onClick={() => setDrawerOpen(true)} className="border-transparent">
                <Menu className="size-4" aria-hidden />
              </IconButton>
            </span>
            <span className="lg:hidden">
              <Brand />
            </span>
            <span className="text-fg hidden text-[13px] font-medium lg:inline">{section.label}</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={openPalette}
                className="border-line text-fg-muted hover:border-line-strong hover:text-fg hidden h-8 items-center gap-2 rounded-md border px-2.5 text-[13px] transition-colors sm:inline-flex"
              >
                Search and jump
                <Kbd>⌘K</Kbd>
              </button>
              <Link
                href="/app"
                aria-label="New question"
                className="border-line text-fg-2 hover:border-line-strong hover:text-fg grid size-8 place-items-center rounded-md border lg:hidden"
              >
                <Plus aria-hidden className="size-4" />
              </Link>
            </div>
          </header>
          <main id="main" className="min-h-0 flex-1">
            {children}
          </main>
        </div>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="bg-bg-subtle w-[85vw] max-w-80 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Workspace pages and conversations</SheetDescription>
          </SheetHeader>
          <SidebarBody onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
