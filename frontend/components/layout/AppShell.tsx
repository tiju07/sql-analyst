"use client"

import { ChartColumn, Command, Database, Menu, PanelLeftClose, PanelLeftOpen, Plus, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense, useCallback, useState, type ReactNode } from "react"

import { CommandPalette } from "@/components/layout/CommandPalette"
import { ConversationList } from "@/components/layout/ConversationList"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { UserMenu } from "@/components/layout/UserMenu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMe } from "@/lib/api/queries"
import { usePersistentFlag } from "@/lib/hooks/useClientFlags"
import { useHotkeys } from "@/lib/hooks/useHotkeys"
import { ROLE_LABEL, scopeLabel } from "@/lib/personas"
import { PRODUCT_NAME } from "@/lib/site"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/app/catalog", label: "Data catalog", icon: Database },
  { href: "/app/verified", label: "Verified queries", icon: ShieldCheck },
] as const

function Brand() {
  return (
    <Link href="/app" className="flex items-center gap-2 rounded-md px-1 font-semibold tracking-tight">
      <span
        aria-hidden
        className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md font-mono text-xs"
      >
        Σ
      </span>
      {PRODUCT_NAME}
    </Link>
  )
}

function PersonaBadge() {
  const me = useMe()
  if (!me.data) return null
  return (
    <div className="px-3 text-xs">
      <Badge variant="secondary">{ROLE_LABEL[me.data.role]}</Badge>
      <p className="text-muted-foreground mt-1">Sees: {scopeLabel(me.data.allowed_states)}</p>
    </div>
  )
}

function SidebarBody({ onNavigate, onCollapse }: { onNavigate?: () => void; onCollapse?: () => void }) {
  const pathname = usePathname()
  return (
    <div className="flex h-full flex-col gap-3 py-3">
      <div className="flex items-center justify-between gap-2 px-3">
        <Brand />
        {onCollapse && (
          <Button variant="ghost" size="icon-sm" aria-label="Collapse sidebar" onClick={onCollapse}>
            <PanelLeftClose aria-hidden />
          </Button>
        )}
      </div>
      <div className="px-3">
        <Button asChild className="w-full justify-start" onClick={onNavigate}>
          <Link href="/app">
            <Plus aria-hidden />
            New chat
          </Link>
        </Button>
      </div>
      <Suspense>
        <ConversationList onNavigate={onNavigate} />
      </Suspense>
      <nav aria-label="Workspace" className="space-y-0.5 border-t px-2 pt-3">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={pathname === href ? "page" : undefined}
            className={cn(
              "hover:bg-sidebar-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              pathname === href && "bg-sidebar-accent font-medium",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </Link>
        ))}
        <a href="/evals" className="hover:bg-sidebar-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
          <ChartColumn aria-hidden className="size-4" />
          Evaluation results
        </a>
      </nav>
      <PersonaBadge />
      <div className="flex items-center gap-1 px-2">
        <div className="min-w-0 flex-1">
          <UserMenu />
        </div>
        <ThemeToggle compact />
      </div>
    </div>
  )
}

function Rail({ onExpand, onPalette }: { onExpand: () => void; onPalette: () => void }) {
  const items = [{ label: "New chat", href: "/app", icon: Plus }, ...NAV]
  return (
    <div className="flex h-full flex-col items-center gap-1 py-3">
      <Button variant="ghost" size="icon" aria-label="Open sidebar" onClick={onExpand}>
        <PanelLeftOpen aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Command palette" onClick={onPalette}>
        <Command aria-hidden />
      </Button>
      {items.map(({ label, href, icon: Icon }) => (
        <Tooltip key={href}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" asChild>
              <Link href={href} aria-label={label}>
                <Icon aria-hidden />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
      <div className="mt-auto flex flex-col items-center gap-1">
        <ThemeToggle compact />
        <UserMenu compact />
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsedPersist] = usePersistentFlag("sidebar-collapsed")
  const openPalette = useCallback(() => setPaletteOpen(true), [])
  useHotkeys(openPalette)

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* desktop sidebar or rail */}
      <aside
        aria-label="Sidebar"
        className={cn("bg-sidebar hidden shrink-0 border-r sm:block", collapsed ? "w-14" : "w-14 lg:w-64")}
      >
        <div className={cn("h-full", collapsed ? "block" : "lg:hidden")}>
          <Rail
            onExpand={() =>
              window.matchMedia("(min-width: 1024px)").matches ? setCollapsedPersist(false) : setDrawerOpen(true)
            }
            onPalette={openPalette}
          />
        </div>
        {!collapsed && (
          <div className="hidden h-full lg:block">
            <SidebarBody onCollapse={() => setCollapsedPersist(true)} />
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* phone top bar */}
        <header
          className="flex items-center gap-2 border-b px-2 py-1.5 sm:hidden"
          style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}
        >
          <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
            <Menu aria-hidden />
          </Button>
          <Brand />
          <Button variant="ghost" size="icon" className="ml-auto" aria-label="New chat" asChild>
            <Link href="/app">
              <Plus aria-hidden />
            </Link>
          </Button>
        </header>
        <main id="main" className="min-h-0 flex-1">
          {children}
        </main>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="bg-sidebar w-[85vw] max-w-80 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Conversations and workspace pages</SheetDescription>
          </SheetHeader>
          <SidebarBody onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
