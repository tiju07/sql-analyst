"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { mode } from "app-mode"
import { ArrowLeft, KeyRound, Link2, RefreshCw, Search, Table2 } from "lucide-react"
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
import { Callout, EmptyState, PageHeader } from "@/design-system"
import type { Schemas } from "@/lib/api/errors"
import { keys, useMe, useTables } from "@/lib/api/queries"
import { formatValue } from "@/lib/format"
import { saved } from "@/lib/notify"
import { cn } from "@/lib/utils"

type TableDetail = Schemas["TableDetail"]

async function pollJob(jobId: string): Promise<Schemas["JobOut"]> {
  for (;;) {
    await new Promise((r) => setTimeout(r, 1000))
    const job = await mode.data.job(jobId)
    if (job.status === "complete" || job.status === "failed" || job.status === "not_found") return job
  }
}

function SyncButton() {
  const qc = useQueryClient()
  const [running, setRunning] = useState(false)
  async function sync() {
    setRunning(true)
    const id = toast.loading("Syncing the catalog", { description: "Reading tables, samples and descriptions." })
    try {
      const [connection] = await mode.data.connections()
      const job = await mode.data.syncConnection(connection.id)
      const done = await pollJob(job.job_id)
      if (done.status === "complete") {
        toast.dismiss(id)
        saved(
          "Catalog synced",
          `${String(done.result?.tables ?? "")} tables, ${String(done.result?.columns ?? "")} columns.`,
        )
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
      {running ? "Syncing" : "Re-sync"}
    </Button>
  )
}

function Detail({ tableId, isAdmin }: { tableId: string; isAdmin: boolean }) {
  const qc = useQueryClient()
  const detail = useQuery({ queryKey: keys.table(tableId), queryFn: () => mode.data.table(tableId) })
  // Optimistic edits: show the new text at once, roll back if the server refuses.
  const optimistic = (patch: (t: TableDetail) => TableDetail) => async () => {
    await qc.cancelQueries({ queryKey: keys.table(tableId) })
    const prev = qc.getQueryData<TableDetail>(keys.table(tableId))
    qc.setQueryData<TableDetail>(keys.table(tableId), (t) => t && patch(t))
    return { prev }
  }
  const rollback = (_e: Error, _v: unknown, ctx?: { prev?: TableDetail }) => {
    if (ctx?.prev) qc.setQueryData(keys.table(tableId), ctx.prev)
    toast.error("Description not saved", { description: `${_e.message} Your change was undone.` })
  }
  const editColumn = useMutation({
    mutationFn: ({ id, description }: { id: string; description: string }) =>
      mode.data.patchColumn(id, { description }),
    onMutate: ({ id, description }) =>
      optimistic((t) => ({
        ...t,
        columns: t.columns.map((c) =>
          c.id === id
            ? { ...c, description: description || null, description_source: description ? "human" : null }
            : c,
        ),
      }))(),
    onError: rollback,
    onSuccess: () => saved("Description saved"),
  })
  const editTable = useMutation({
    mutationFn: (description: string) => mode.data.patchTable(tableId, { description }),
    onMutate: (description) =>
      optimistic((t) => ({
        ...t,
        description: description || null,
        description_source: description ? "human" : null,
      }))(),
    onError: rollback,
    onSuccess: () => {
      saved("Description saved")
      void qc.invalidateQueries({ queryKey: keys.tables })
    },
  })

  if (detail.isPending)
    return (
      <div className="grid gap-3">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  if (detail.isError)
    return (
      <Callout tone="danger" title="This table did not load">
        <Button variant="outline" size="sm" className="mt-2" onClick={() => detail.refetch()}>
          Try again
        </Button>
      </Callout>
    )
  const t = detail.data
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-fg font-mono text-lg font-medium">
            {t.schema_name}.{t.name}
          </h2>
          <span className="text-fg-muted tabular text-sm">
            {t.row_count?.toLocaleString("en-US") ?? "Unknown"} rows, {t.column_count} columns
          </span>
        </div>
        <EditableDescription
          value={t.description}
          source={t.description_source}
          canEdit={isAdmin}
          label={t.name}
          onSave={(d) => editTable.mutate(d)}
        />
      </div>
      <ul className="divide-line border-line bg-surface divide-y overflow-hidden rounded-lg border">
        {t.columns.map((c) => (
          <li key={c.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(10rem,15rem)_1fr]">
            <div className="min-w-0">
              <p className="text-fg flex items-center gap-1.5 font-mono text-[13px] font-medium break-all">
                {c.is_pk && <KeyRound aria-label="Primary key" className="text-accent-ink size-3.5 shrink-0" />}
                {c.fk_ref && (
                  <Link2 aria-label={`References ${c.fk_ref}`} className="text-fg-muted size-3.5 shrink-0" />
                )}
                {c.name}
              </p>
              <p className="text-fg-muted mt-0.5 font-mono text-xs">{c.data_type}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {c.semantic_type && <Badge variant="secondary">{c.semantic_type}</Badge>}
                {c.fk_ref && (
                  <Badge variant="outline" className="font-mono">
                    {c.fk_ref}
                  </Badge>
                )}
              </div>
            </div>
            <div className="grid min-w-0 content-start gap-1.5 text-sm">
              <EditableDescription
                value={c.description}
                source={c.description_source}
                canEdit={isAdmin}
                label={c.name}
                onSave={(d) => editColumn.mutate({ id: c.id, description: d })}
              />
              {c.sample_values.length > 0 && (
                <p className="text-fg-muted text-xs break-words">
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
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Data catalog"
          description={`What the agent knows about the database. ${isAdmin ? "Edit descriptions to improve answers." : "Read-only for your role."}`}
          actions={isAdmin ? <SyncButton /> : undefined}
        />
        <Tabs defaultValue="tables">
          <TabsList>
            <TabsTrigger value="tables">Tables</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
          </TabsList>
          <TabsContent value="tables">
            <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
              <div className={cn("grid content-start gap-3", selected && "hidden lg:grid")}>
                <div className="relative">
                  <Search
                    aria-hidden
                    className="text-fg-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
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
                <ul className="grid gap-0.5">
                  {tables.isPending && [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
                  {tables.isError && (
                    <li>
                      <Callout tone="danger" title="Tables did not load">
                        <Button variant="outline" size="sm" className="mt-2" onClick={() => tables.refetch()}>
                          Try again
                        </Button>
                      </Callout>
                    </li>
                  )}
                  {filtered?.length === 0 && (
                    <li className="text-fg-muted px-2 py-1 text-sm">No table matches &ldquo;{q}&rdquo;.</li>
                  )}
                  {filtered?.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => router.replace(`?t=${t.id}`)}
                        aria-current={t.id === selected ? "true" : undefined}
                        className={cn(
                          "flex h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-[13px] transition-colors",
                          t.id === selected
                            ? "bg-surface-3 text-fg font-medium"
                            : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                        )}
                      >
                        <span className="truncate font-mono">{t.name}</span>
                        <span className="text-fg-muted tabular shrink-0 text-xs">
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
                      className="mb-3 -ml-2 lg:hidden"
                      onClick={() => router.replace("?")}
                    >
                      <ArrowLeft aria-hidden />
                      All tables
                    </Button>
                    <Detail tableId={selected} isAdmin={isAdmin} />
                  </>
                ) : (
                  <div className="hidden lg:block">
                    <EmptyState
                      icon={<Table2 className="size-5" />}
                      title="Choose a table"
                      description="See its columns, sample values and descriptions."
                    />
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="metrics">
            <MetricsTab isAdmin={isAdmin} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
