"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { mode } from "app-mode"
import { BadgeCheck, Check, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { SqlCode } from "@/components/chat/SqlBlock"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Callout, EmptyState, PageHeader, StatusPill } from "@/design-system"
import type { Schemas } from "@/lib/api/errors"
import { keys, useMe } from "@/lib/api/queries"
import { saved } from "@/lib/notify"

type Verified = Schemas["VerifiedOut"]
type Status = Verified["status"]

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

function List({ status, isAdmin }: { status: Status; isAdmin: boolean }) {
  const qc = useQueryClient()
  const [rejecting, setRejecting] = useState<Verified | null>(null)
  const list = useQuery({ queryKey: keys.verified(status), queryFn: () => mode.data.verified(status) })
  const done = () => void qc.invalidateQueries({ queryKey: ["verified"] })
  const approve = useMutation({
    mutationFn: (id: string) => mode.data.approveVerified(id),
    onSuccess: () => {
      saved("Approved", "It will guide answers to similar questions.")
      done()
    },
    onError: (e) => toast.error("Approve failed", { description: e.message }),
  })
  const reject = useMutation({
    mutationFn: (id: string) => mode.data.rejectVerified(id),
    onSuccess: () => {
      saved("Rejected and removed")
      done()
    },
    onError: (e) => toast.error("Reject failed", { description: e.message }),
  })

  if (list.isPending)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  if (list.isError)
    return (
      <Callout tone="danger" title="The list did not load">
        <Button variant="outline" size="sm" className="mt-2" onClick={() => list.refetch()}>
          Try again
        </Button>
      </Callout>
    )
  if (!list.data.length)
    return (
      <EmptyState
        icon={<BadgeCheck className="size-5" />}
        title={status === "proposed" ? "Nothing waiting for review" : "No approved queries yet"}
        description={
          status === "proposed"
            ? "Use Propose as verified under a good answer to add one."
            : "Approved queries become examples for similar questions."
        }
      />
    )
  return (
    <>
      <ul className="grid gap-4">
        {list.data.map((v) => {
          const busy =
            (approve.isPending && approve.variables === v.id) || (reject.isPending && reject.variables === v.id)
          return (
            <li key={v.id} className="border-line bg-surface grid gap-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid min-w-0 justify-items-start gap-1.5">
                  <p className="text-fg font-medium text-pretty">{v.question}</p>
                  <StatusPill
                    status={v.status === "approved" ? "Approved" : "Waiting for review"}
                    tone={v.status === "approved" ? "success" : "warning"}
                  />
                </div>
                {isAdmin && status === "proposed" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => approve.mutate(v.id)} disabled={busy}>
                      <Check aria-hidden />
                      {approve.isPending && approve.variables === v.id ? "Approving" : "Approve"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejecting(v)} disabled={busy}>
                      <X aria-hidden />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
              <SqlCode sql={v.sql} />
              <p className="text-fg-muted text-xs">
                Proposed by {v.proposed_by ?? "a deleted user"} on {date(v.created_at)}
                {v.approved_by && `, approved by ${v.approved_by}`}
                {mode.isDemo ? ". Names and dates are simulated." : null}
              </p>
            </li>
          )
        })}
      </ul>
      <AlertDialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this query?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{rejecting?.question}&rdquo; will be removed from the review queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => rejecting && reject.mutate(rejecting.id)}>
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function VerifiedView() {
  const me = useMe()
  const isAdmin = me.data?.role === "admin"
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-4xl gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Verified queries"
          description={`Answers people marked as correct. ${isAdmin ? "Approve the good ones; " : "Admins approve them; "}approved queries become worked examples for similar questions.`}
        />
        <Tabs defaultValue="proposed">
          <TabsList>
            <TabsTrigger value="proposed">Waiting for review</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
          </TabsList>
          <TabsContent value="proposed">
            <List status="proposed" isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="approved">
            <List status="approved" isAdmin={isAdmin} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
