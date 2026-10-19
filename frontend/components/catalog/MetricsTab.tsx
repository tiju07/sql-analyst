"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { parse } from "yaml"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { keys } from "@/lib/api/queries"

const MetricsEditor = dynamic(() => import("@/components/catalog/MetricsEditor"), {
  ssr: false,
  loading: () => <Skeleton className="h-80 w-full" />,
})

export function MetricsTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient()
  const metrics = useQuery({
    queryKey: keys.metrics,
    queryFn: async () => unwrap(await api.GET("/api/semantic/metrics")),
  })
  const [draft, setDraft] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const syntaxError = useMemo(() => {
    if (draft === null) return null
    try {
      parse(draft)
      return null
    } catch (e) {
      return (e as Error).message.split("\n")[0]
    }
  }, [draft])
  const save = useMutation({
    mutationFn: async (yaml: string) => unwrap(await api.PUT("/api/semantic/metrics", { body: { yaml } })),
    onSuccess: (data) => {
      qc.setQueryData(keys.metrics, data)
      setEditing(false)
      setDraft(null)
      toast.success("Metrics saved", {
        description: `${data.layer.metrics.length} metrics are live for new questions.`,
      })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Save failed"),
  })

  if (metrics.isPending) return <Skeleton className="h-64 w-full" />
  if (metrics.isError)
    return (
      <p className="text-sm">
        Metrics didn&apos;t load.{" "}
        <button className="text-primary underline" onClick={() => metrics.refetch()}>
          Retry
        </button>
      </p>
    )

  if (editing) {
    const value = draft ?? metrics.data.yaml
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Edits are validated (YAML syntax, metric names, SQL expressions) before they go live.
        </p>
        <MetricsEditor value={value} onChange={setDraft} />
        {syntaxError && (
          <p role="alert" className="text-destructive text-sm">
            YAML error: {syntaxError}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            disabled={Boolean(syntaxError) || save.isPending || draft === null}
            onClick={() => save.mutate(value)}
          >
            {save.isPending ? "Saving…" : "Save metrics"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setEditing(false)
              setDraft(null)
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  const { layer } = metrics.data
  const notes = layer.notes ?? []
  return (
    <div className="space-y-6">
      {isAdmin && (
        <Button variant="outline" onClick={() => setEditing(true)}>
          Edit definitions
        </Button>
      )}
      <ul className="divide-y rounded-lg border">
        {layer.metrics.map((m) => (
          <li key={m.name} className="space-y-1.5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-mono text-sm font-medium">{m.name}</h3>
              <Badge variant="secondary">{m.semantic_type}</Badge>
            </div>
            <p className="text-sm">{m.description}</p>
            <code className="bg-muted block overflow-x-auto rounded px-2 py-1 font-mono text-xs">{m.sql_expr}</code>
            {(m.synonyms ?? []).length > 0 && (
              <p className="text-muted-foreground text-xs">Also matches: {(m.synonyms ?? []).join(", ")}</p>
            )}
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <section>
          <h3 className="text-sm font-medium">Notes the agent follows</h3>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
