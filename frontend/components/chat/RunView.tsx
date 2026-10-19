"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { AnswerCard } from "@/components/chat/AnswerCard"
import { Inspector } from "@/components/inspector/Inspector"
import { Skeleton } from "@/components/ui/skeleton"
import { fromRun } from "@/lib/answer"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { keys } from "@/lib/api/queries"
import { PRODUCT_NAME } from "@/lib/site"

/** Read-only page for one run (owner or admin). */
export function RunView({ runId }: { runId: string }) {
  const [inspect, setInspect] = useState(false)
  const router = useRouter()
  const run = useQuery({
    queryKey: keys.run(runId),
    queryFn: async () => unwrap(await api.GET("/api/runs/{run_id}", { params: { path: { run_id: runId } } })),
  })
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <Link href="/app" className="font-semibold tracking-tight">
          {PRODUCT_NAME}
        </Link>
        <Link href="/app" className="text-primary text-sm font-medium underline-offset-4 hover:underline">
          Open the app
        </Link>
      </header>
      <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 pb-16">
        {run.isPending && <Skeleton className="h-96 w-full" />}
        {run.isError && (
          <div className="py-16 text-center">
            <h1 className="text-xl font-semibold">
              {run.error instanceof ApiError && run.error.status === 404 ? "Run not found" : "This run didn't load"}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Runs are visible to the person who asked and to admins.
            </p>
          </div>
        )}
        {run.data && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">{run.data.question}</h1>
            <p className="text-muted-foreground text-sm">
              Asked {new Date(run.data.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            </p>
            <AnswerCard
              readOnly
              answer={fromRun(run.data)}
              live={false}
              busy
              onClarify={() => undefined}
              onInspect={() => setInspect((v) => !v)}
              onRerun={() => router.push("/app")}
            />
            {inspect && (
              <section aria-label="Inspector" className="bg-card rounded-lg border">
                <Inspector runId={runId} />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
