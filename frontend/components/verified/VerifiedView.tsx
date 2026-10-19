"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, X } from "lucide-react"
import { toast } from "sonner"

import { SqlCode } from "@/components/chat/SqlBlock"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, unwrap, type Schemas } from "@/lib/api/client"
import { keys, useMe } from "@/lib/api/queries"

type Verified = Schemas["VerifiedOut"]

function List({ status, isAdmin }: { status: "proposed" | "approved"; isAdmin: boolean }) {
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: keys.verified(status),
    queryFn: async () => unwrap(await api.GET("/api/verified", { params: { query: { status } } })),
  })
  const approve = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.POST("/api/verified/{verified_id}/approve", { params: { path: { verified_id: id } } })),
    onSuccess: () => {
      toast.success("Approved", { description: "It will guide answers to similar questions." })
      void qc.invalidateQueries({ queryKey: ["verified"] })
    },
    onError: () => toast.error("Approve failed"),
  })
  const reject = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.DELETE("/api/verified/{verified_id}", { params: { path: { verified_id: id } } })
      if (!res.response.ok) throw new Error("reject failed")
    },
    onSuccess: () => {
      toast.success("Rejected and removed")
      void qc.invalidateQueries({ queryKey: ["verified"] })
    },
    onError: () => toast.error("Reject failed"),
  })

  if (list.isPending) return <Skeleton className="h-48 w-full" />
  if (list.isError)
    return (
      <p className="text-sm">
        The list didn&apos;t load.{" "}
        <button className="text-primary underline" onClick={() => list.refetch()}>
          Retry
        </button>
      </p>
    )
  if (!list.data.length)
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        {status === "proposed"
          ? "Nothing waiting for review. Use “Propose as verified” under a good answer to add one."
          : "No approved queries yet. Approved ones become examples for similar questions."}
      </p>
    )
  return (
    <ul className="space-y-4">
      {list.data.map((v: Verified) => (
        <li key={v.id} className="bg-card space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium">{v.question}</p>
            {isAdmin && status === "proposed" && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => approve.mutate(v.id)} disabled={approve.isPending}>
                  <Check aria-hidden />
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => reject.mutate(v.id)} disabled={reject.isPending}>
                  <X aria-hidden />
                  Reject
                </Button>
              </div>
            )}
          </div>
          <SqlCode sql={v.sql} />
          <p className="text-muted-foreground text-xs">
            Proposed by {v.proposed_by ?? "a deleted user"} on{" "}
            {new Date(v.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
            {v.approved_by && `, approved by ${v.approved_by}`}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function VerifiedView() {
  const me = useMe()
  const isAdmin = me.data?.role === "admin"
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Verified queries</h1>
        <p className="text-muted-foreground mt-1 max-w-prose text-sm">
          Answers people marked as correct. {isAdmin ? "Approve the good ones; " : "Admins approve them; "}approved
          queries are shown to the agent as worked examples when a similar question comes in.
        </p>
        <Tabs defaultValue="proposed" className="mt-6">
          <TabsList>
            <TabsTrigger value="proposed">Waiting for review</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
          </TabsList>
          <TabsContent value="proposed" className="mt-4">
            <List status="proposed" isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="approved" className="mt-4">
            <List status="approved" isAdmin={isAdmin} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
