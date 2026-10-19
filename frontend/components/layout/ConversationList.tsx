"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { keys } from "@/lib/api/queries"
import { cn } from "@/lib/utils"

type Conversation = Schemas["ConversationOut"]

function group(list: Conversation[]): [string, Conversation[]][] {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const day = 86_400_000
  const buckets: Record<string, Conversation[]> = { Today: [], Yesterday: [], "Previous 7 days": [], Older: [] }
  for (const c of list) {
    const t = new Date(c.updated_at).getTime()
    const k =
      t >= +startOfDay
        ? "Today"
        : t >= +startOfDay - day
          ? "Yesterday"
          : t >= +startOfDay - 7 * day
            ? "Previous 7 days"
            : "Older"
    buckets[k].push(c)
  }
  return Object.entries(buckets).filter(([, v]) => v.length > 0)
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function ConversationList({ onNavigate }: { onNavigate?: () => void }) {
  const qc = useQueryClient()
  const router = useRouter()
  const active = useSearchParams().get("c")
  const [q, setQ] = useState("")
  const query = useDebounced(q.trim(), 250)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [deleting, setDeleting] = useState<Conversation | null>(null)

  const list = useQuery({
    queryKey: keys.conversations(query),
    queryFn: async () => unwrap(await api.GET("/api/conversations", { params: { query: query ? { q: query } : {} } })),
  })
  const rename = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) =>
      unwrap(await api.PATCH("/api/conversations/{conv_id}", { params: { path: { conv_id: id } }, body: { title } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversations"] })
      toast.success("Conversation renamed")
    },
    onError: () => toast.error("Rename failed"),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.DELETE("/api/conversations/{conv_id}", { params: { path: { conv_id: id } } })
      if (!res.response.ok) throw new Error("delete failed")
    },
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ["conversations"] })
      toast.success("Conversation deleted")
      if (id === active) router.push("/app")
    },
    onError: () => toast.error("Delete failed"),
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2"
        />
        <label htmlFor="conv-search" className="sr-only">
          Search conversations
        </label>
        <Input
          id="conv-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search conversations"
          className="pl-8"
        />
      </div>
      <nav aria-label="Conversations" className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {list.isPending && (
          <div className="space-y-2 px-1">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}
        {list.isError && (
          <p className="text-muted-foreground px-2 text-sm">
            Couldn&apos;t load conversations.{" "}
            <button className="text-primary underline" onClick={() => list.refetch()}>
              Retry
            </button>
          </p>
        )}
        {list.data?.length === 0 && (
          <p className="text-muted-foreground px-2 text-sm">
            {query ? "No conversations match." : "Your conversations will appear here."}
          </p>
        )}
        {list.data &&
          group(list.data).map(([label, items]) => (
            <section key={label} className="mb-3">
              <h3 className="text-muted-foreground px-2 py-1 text-xs font-medium">{label}</h3>
              <ul>
                {items.map((c) => (
                  <li key={c.id} className="group/item relative">
                    {renaming === c.id ? (
                      <form
                        className="px-1"
                        onSubmit={(e) => {
                          e.preventDefault()
                          if (title.trim()) rename.mutate({ id: c.id, title: title.trim() })
                          setRenaming(null)
                        }}
                      >
                        <label htmlFor={`rename-${c.id}`} className="sr-only">
                          New title
                        </label>
                        <Input
                          id={`rename-${c.id}`}
                          autoFocus
                          value={title}
                          maxLength={200}
                          onChange={(e) => setTitle(e.target.value)}
                          onBlur={() => setRenaming(null)}
                          onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                        />
                      </form>
                    ) : (
                      <>
                        <Link
                          href={`/app?c=${c.id}`}
                          onClick={onNavigate}
                          aria-current={c.id === active ? "page" : undefined}
                          className={cn(
                            "hover:bg-sidebar-accent block truncate rounded-md py-1.5 pr-9 pl-2 text-sm",
                            c.id === active && "bg-sidebar-accent font-medium",
                          )}
                        >
                          {c.title}
                        </Link>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Options for ${c.title}`}
                              className="absolute top-1/2 right-1 -translate-y-1/2 opacity-100 focus-visible:opacity-100 lg:opacity-0 lg:group-hover/item:opacity-100"
                            >
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => {
                                setTitle(c.title)
                                setRenaming(c.id)
                              }}
                            >
                              <Pencil aria-hidden />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(c)}>
                              <Trash2 aria-hidden />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </nav>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleting?.title}&rdquo; and all its answers will be removed. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleting && remove.mutate(deleting.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
