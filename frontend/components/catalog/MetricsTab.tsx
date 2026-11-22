"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { parse } from "yaml"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { mode } from "app-mode"

import { Callout } from "@/design-system"
import { ApiError } from "@/lib/api/errors"
import { keys } from "@/lib/api/queries"
import { saved } from "@/lib/notify"

const MetricsEditor = dynamic(() => import("@/components/catalog/MetricsEditor"), {
  ssr: false,
  loading: () => <Skeleton className="h-80 w-full" />,
})

export function MetricsTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient()
  const metrics = useQuery({
    queryKey: keys.metrics,
    queryFn: () => mode.data.metrics(),
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
    mutationFn: (yaml: string) => mode.data.saveMetrics({ yaml }),
    onSuccess: (data) => {
      qc.setQueryData(keys.metrics, data)
      setEditing(false)
      setDraft(null)
      saved("Metrics saved", `${data.layer.metrics.length} metrics are live for new questions.`)
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Save failed"),
  })

  if (metrics.isPending) return <Skeleton className="h-64 w-full" />
  if (metrics.isError)
    return (
      <Callout tone="danger" title="Metrics did not load">
        <Button variant="outline" size="sm" className="mt-2" onClick={() => metrics.refetch()}>
          Try again
        </Button>
      </Callout>
    )

  if (editing) {
    const value = draft ?? metrics.data.yaml
    return (
      <div className="space-y-3">
        <p className="text-fg-muted text-sm">
          Edits are validated (YAML syntax, metric names, SQL expressions) before they go live.
        </p>
        <MetricsEditor value={value} onChange={setDraft} />
        {syntaxError && (
          <p role="alert" className="text-danger text-sm">
            YAML error: {syntaxError}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            disabled={Boolean(syntaxError) || save.isPending || draft === null}
            onClick={() => save.mutate(value)}
          >
            {save.isPending ? "Saving" : "Save metrics"}
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
      <ul className="divide-line border-line bg-surface divide-y overflow-hidden rounded-lg border">
        {layer.metrics.map((m) => (
          <li key={m.name} className="space-y-1.5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-mono text-sm font-medium">{m.name}</h3>
              <Badge variant="secondary">{m.semantic_type}</Badge>
            </div>
            <p className="text-sm">{m.description}</p>
            <code className="border-line bg-bg-subtle text-fg-2 block overflow-x-auto rounded-sm border px-2 py-1 font-mono text-xs">
              {m.sql_expr}
            </code>
            {(m.synonyms ?? []).length > 0 && (
              <p className="text-fg-muted text-xs">Also matches: {(m.synonyms ?? []).join(", ")}</p>
            )}
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <section>
          <h3 className="text-sm font-medium">Notes the agent follows</h3>
          <ul className="text-fg-muted mt-2 list-disc space-y-1 pl-5 text-sm">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
