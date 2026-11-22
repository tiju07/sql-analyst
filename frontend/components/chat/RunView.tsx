"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { AnswerCard } from "@/components/chat/AnswerCard"
import { Inspector } from "@/components/inspector/Inspector"
import { Skeleton } from "@/components/ui/skeleton"
import { fromRun } from "@/lib/answer"
import { mode } from "app-mode"
import Link from "next/link"

import { ApiError } from "@/lib/api/errors"
import { keys } from "@/lib/api/queries"
import { DemoBar } from "@/components/layout/DemoBar"
import { AboutMeLink, ButtonLink } from "@/components/marketing/links"
import { Callout, Logo } from "@/design-system"
import { PRODUCT_NAME } from "@/lib/site"

/** Read-only page for one run (owner or admin). */
export function RunView({ runId }: { runId: string }) {
  const [inspect, setInspect] = useState(false)
  const router = useRouter()
  const run = useQuery({
    queryKey: keys.run(runId),
    queryFn: () => mode.data.run(runId),
  })
  return (
    <div className="min-h-dvh">
      {mode.isDemo ? <DemoBar /> : null}
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <Link href="/" className="rounded-sm" aria-label={`${PRODUCT_NAME} home`}>
          <Logo name={PRODUCT_NAME} />
        </Link>
        <span className="flex items-center gap-4">
          <AboutMeLink />
          <ButtonLink href="/app" variant="outline" size="sm">
            Open the app
          </ButtonLink>
        </span>
      </header>
      <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 pb-16">
        {run.isPending && <Skeleton className="h-96 w-full" />}
        {run.isError && (
          <div className="py-12">
            <h1 className="sr-only">Answer</h1>
            <Callout
              tone="danger"
              title={
                run.error instanceof ApiError && run.error.status === 404 ? "Run not found" : "This run did not load"
              }
            >
              Runs are visible to the person who asked and to admins.
            </Callout>
          </div>
        )}
        {run.data && (
          <>
            <h1 className="text-2xl font-medium tracking-tight">{run.data.question}</h1>
            <p className="text-fg-muted text-sm">
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
              <section aria-label="Inspector" className="border-line bg-surface rounded-lg border">
                <Inspector runId={runId} />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
