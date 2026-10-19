"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, KeyRound, Link2, RefreshCw, Search } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { EditableDescription } from "@/components/catalog/EditableDescription"
import { MetricsTab } from "@/components/catalog/MetricsTab"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { keys, useMe, useTables } from "@/lib/api/queries"
import { formatValue } from "@/lib/format"
import { cn } from "@/lib/utils"

type TableDetail = Schemas["TableDetail"]

async function pollJob(jobId: string): Promise<Schemas["JobOut"]> {
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500))
    const job = unwrap(await api.GET("/api/jobs/{job_id}", { params: { path: { job_id: jobId } } }))
    if (job.status === "complete" || job.status === "failed" || job.status === "not_found") return job
  }
}

function SyncButton() {
  const qc = useQueryClient()
  const [running, setRunning] = useState(false)
  async function sync() {
    setRunning(true)
    const id = toast.loading("Syncing the catalog…", { description: "Reading tables, samples and descriptions." })
    try {
      const connections = unwrap(await api.GET("/api/connections"))
      const job = unwrap(
        await api.POST("/api/connections/{connection_id}/sync", {
          params: { path: { connection_id: connections[0].id } },
        }),
      )
      const done = await pollJob(job.job_id)
      if (done.status === "complete") {
        toast.success("Catalog synced", {
          id,
          description: `${String(done.result?.tables ?? "")} tables, ${String(done.result?.columns ?? "")} columns.`,
        })
        void qc.invalidateQueries({ queryKey: ["catalog"] })
      } else {
        toast.error("Sync failed", { id, description: done.error ?? "The job did not finish." })
      }
    } catch (e) {
      toast.error("Sync failed", { id, description: (e as Error).message })
    } finally {
      setRunning(false)
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={sync} disabled={running}>
      <RefreshCw aria-hidden className={running ? "motion-safe:animate-spin" : undefined} />
      {running ? "Syncing…" : "Re-sync"}
    </Button>
  )
}

function Detail({ tableId, isAdmin }: { tableId: string; isAdmin: boolean }) {
  const qc = useQueryClient()
  const detail = useQuery({
    queryKey: keys.table(tableId),
    queryFn: async () =>
      unwrap(await api.GET("/api/catalog/tables/{table_id}", { params: { path: { table_id: tableId } } })),
  })
  // Optimistic edits: show the new text at once, roll back if the server refuses.
  const editColumn = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string }) =>
      unwrap(
        await api.PATCH("/api/catalog/columns/{column_id}", {
          params: { path: { column_id: id } },
          body: { description },
        }),
      ),
    onMutate: async ({ id, description }) => {
      await qc.cancelQueries({ queryKey: keys.table(tableId) })
      const prev = qc.getQueryData<TableDetail>(keys.table(tableId))
      qc.setQueryData<TableDetail>(
        keys.table(tableId),
        (t) =>
          t && {
            ...t,
            columns: t.columns.map((c) =>
              c.id === id
                ? { ...c, description: description || null, description_source: description ? "human" : null }
                : c,
            ),
          },
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.table(tableId), ctx.prev)
      toast.error("Description not saved", { description: "Your change was undone." })
    },
    onSuccess: () => toast.success("Description saved"),
  })
  const editTable = useMutation({
    mutationFn: async (description: string) =>
      unwrap(
        await api.PATCH("/api/catalog/tables/{table_id}", {
          params: { path: { table_id: tableId } },
          body: { description },
        }),
      ),
    onMutate: async (description) => {
      await qc.cancelQueries({ queryKey: keys.table(tableId) })
      const prev = qc.getQueryData<TableDetail>(keys.table(tableId))
      qc.setQueryData<TableDetail>(
        keys.table(tableId),
        (t) => t && { ...t, description: description || null, description_source: description ? "human" : null },
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.table(tableId), ctx.prev)
      toast.error("Description not saved", { description: "Your change was undone." })
    },
    onSuccess: () => {
      toast.success("Description saved")
      void qc.invalidateQueries({ queryKey: keys.tables })
    },
  })

  if (detail.isPending)
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  if (detail.isError)
    return (
      <p className="text-sm">
        This table didn&apos;t load.{" "}
        <button className="text-primary underline" onClick={() => detail.refetch()}>
          Retry
        </button>
      </p>
    )
  const t = detail.data
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-mono text-xl font-semibold">
          {t.schema_name}.{t.name}
        </h2>
        <p className="text-muted-foreground tabular mt-1 text-sm">
          About {t.row_count?.toLocaleString("en-US") ?? "—"} rows
        </p>
        <div className="mt-3">
          <EditableDescription
            value={t.description}
            source={t.description_source}
            canEdit={isAdmin}
            label={t.name}
            onSave={(d) => editTable.mutate(d)}
          />
        </div>
      </div>
      <ul className="divide-y rounded-lg border">
        {t.columns.map((c) => (
          <li key={c.id} className="grid gap-2 p-4 sm:grid-cols-[minmax(10rem,14rem)_1fr]">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-mono text-sm font-medium break-all">
                {c.is_pk && <KeyRound aria-label="Primary key" className="text-primary size-3.5 shrink-0" />}
                {c.fk_ref && (
                  <Link2 aria-label={`References ${c.fk_ref}`} className="text-muted-foreground size-3.5 shrink-0" />
                )}
                {c.name}
              </p>
              <p className="text-muted-foreground mt-1 font-mono text-xs">{c.data_type}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {c.semantic_type && <Badge variant="secondary">{c.semantic_type}</Badge>}
                {c.fk_ref && (
                  <Badge variant="outline" className="font-mono">
                    {c.fk_ref}
                  </Badge>
                )}
              </div>
            </div>
            <div className="min-w-0 space-y-2 text-sm">
              <EditableDescription
                value={c.description}
                source={c.description_source}
                canEdit={isAdmin}
                label={c.name}
                onSave={(d) => editColumn.mutate({ id: c.id, description: d })}
              />
              {c.sample_values.length > 0 && (
                <p className="text-muted-foreground text-xs break-words">
                  Examples:{" "}
                  {c.sample_values
                    .slice(0, 5)
                    .map((v) => formatValue(v, null))
                    .join(", ")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CatalogView() {
  const router = useRouter()
  const params = useSearchParams()
  const selected = params.get("t")
  const me = useMe()
  const isAdmin = me.data?.role === "admin"
  const tables = useTables()
  const [q, setQ] = useState("")
  const filtered = tables.data?.filter((t) =>
    `${t.name} ${t.description ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Data catalog</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              What the agent knows about the database.{" "}
              {isAdmin ? "Edit descriptions to improve answers." : "Read-only for your role."}
            </p>
          </div>
          {isAdmin && <SyncButton />}
        </div>
        <Tabs defaultValue="tables" className="mt-6">
          <TabsList>
            <TabsTrigger value="tables">Tables</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
          </TabsList>
          <TabsContent value="tables" className="mt-4">
            <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
              <div className={cn(selected && "hidden lg:block")}>
                <div className="relative">
                  <Search
                    aria-hidden
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                  />
                  <label htmlFor="table-search" className="sr-only">
                    Search tables
                  </label>
                  <Input
                    id="table-search"
                    type="search"
                    placeholder="Search tables"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <ul className="mt-3 space-y-0.5">
                  {tables.isPending && [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                  {tables.isError && (
                    <li className="text-sm">
                      Tables didn&apos;t load.{" "}
                      <button className="text-primary underline" onClick={() => tables.refetch()}>
                        Retry
                      </button>
                    </li>
                  )}
                  {filtered?.length === 0 && <li className="text-muted-foreground px-2 text-sm">No table matches.</li>}
                  {filtered?.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => router.replace(`/app/catalog?t=${t.id}`)}
                        aria-current={t.id === selected ? "true" : undefined}
                        className={cn(
                          "hover:bg-accent flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm",
                          t.id === selected && "bg-accent font-medium",
                        )}
                      >
                        <span className="truncate font-mono">{t.name}</span>
                        <span className="text-muted-foreground tabular shrink-0 text-xs">
                          {t.row_count?.toLocaleString("en-US")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="min-w-0">
                {selected ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mb-3 lg:hidden"
                      onClick={() => router.replace("/app/catalog")}
                    >
                      <ArrowLeft aria-hidden />
                      All tables
                    </Button>
                    <Detail tableId={selected} isAdmin={isAdmin} />
                  </>
                ) : (
                  <p className="text-muted-foreground hidden rounded-lg border border-dashed p-8 text-center text-sm lg:block">
                    Choose a table to see its columns, sample values and descriptions.
                  </p>
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="metrics" className="mt-4">
            <MetricsTab isAdmin={isAdmin} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
