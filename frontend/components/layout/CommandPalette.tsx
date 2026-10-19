"use client"

import { useQuery } from "@tanstack/react-query"
import { BookOpen, ChartColumn, Database, MessageSquare, Moon, Plus, ShieldCheck } from "lucide-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { api, unwrap } from "@/lib/api/client"
import { keys } from "@/lib/api/queries"

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const conversations = useQuery({
    queryKey: keys.conversations(""),
    queryFn: async () => unwrap(await api.GET("/api/conversations", { params: { query: {} } })),
    enabled: open,
  })
  function go(href: string) {
    onOpenChange(false)
    router.push(href)
  }
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Jump to a page, a conversation, or an action"
    >
      <Command>
        <CommandInput placeholder="Type a command or search conversations" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => go("/app")}>
              <Plus aria-hidden />
              New chat
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
                onOpenChange(false)
              }}
            >
              <Moon aria-hidden />
              Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Go to">
            <CommandItem onSelect={() => go("/app/catalog")}>
              <Database aria-hidden />
              Data catalog
            </CommandItem>
            <CommandItem onSelect={() => go("/app/verified")}>
              <ShieldCheck aria-hidden />
              Verified queries
            </CommandItem>
            <CommandItem onSelect={() => go("/evals")}>
              <ChartColumn aria-hidden />
              Evaluation results
            </CommandItem>
            <CommandItem onSelect={() => go("/")}>
              <BookOpen aria-hidden />
              About this project
            </CommandItem>
          </CommandGroup>
          {conversations.data && conversations.data.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Conversations">
                {conversations.data.slice(0, 20).map((c) => (
                  <CommandItem key={c.id} value={`${c.title} ${c.id}`} onSelect={() => go(`/app?c=${c.id}`)}>
                    <MessageSquare aria-hidden />
                    <span className="truncate">{c.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
