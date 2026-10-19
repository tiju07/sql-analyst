"use client"

import { useMutation } from "@tanstack/react-query"
import { BadgeCheck, PanelRight, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, unwrap } from "@/lib/api/client"

export function AnswerActions({
  runId,
  question,
  canPropose,
  onInspect,
  onRerun,
}: {
  runId: string
  question: string
  canPropose: boolean
  onInspect: () => void
  onRerun: () => void
}) {
  const [rating, setRating] = useState<1 | -1 | null>(null)
  const [commentFor, setCommentFor] = useState<1 | -1 | null>(null)
  const [comment, setComment] = useState("")
  const [proposeOpen, setProposeOpen] = useState(false)
  const [proposedQuestion, setProposedQuestion] = useState(question)

  const feedback = useMutation({
    mutationFn: async (body: { rating: 1 | -1; comment?: string }) =>
      unwrap(await api.POST("/api/feedback", { body: { run_id: runId, ...body } })),
    onSuccess: (data) => {
      setRating(data.rating as 1 | -1)
      toast.success("Thanks, feedback saved")
    },
    onError: () => toast.error("Feedback wasn't saved. Try again."),
  })
  const propose = useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/api/verified", { body: { run_id: runId, question: proposedQuestion } })),
    onSuccess: () => {
      setProposeOpen(false)
      toast.success("Proposed as a verified query", { description: "An admin reviews it before it's used." })
    },
    onError: (e) => toast.error(e.message),
  })

  function rate(r: 1 | -1) {
    feedback.mutate({ rating: r })
    if (r === -1) setCommentFor(-1)
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Good answer"
            aria-pressed={rating === 1}
            onClick={() => rate(1)}
            className={rating === 1 ? "text-primary" : undefined}
          >
            <ThumbsUp aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Good answer</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Bad answer"
            aria-pressed={rating === -1}
            onClick={() => rate(-1)}
            className={rating === -1 ? "text-destructive" : undefined}
          >
            <ThumbsDown aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Bad answer</TooltipContent>
      </Tooltip>
      {canPropose && (
        <Button variant="ghost" size="sm" onClick={() => setProposeOpen(true)}>
          <BadgeCheck aria-hidden />
          Propose as verified
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onInspect}>
        <PanelRight aria-hidden />
        Inspect
      </Button>
      <Button variant="ghost" size="sm" onClick={onRerun}>
        <RotateCcw aria-hidden />
        Ask again
      </Button>

      <Dialog open={commentFor !== null} onOpenChange={(o) => !o && setCommentFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What was wrong?</DialogTitle>
            <DialogDescription>Optional. A sentence helps us fix the definition or the prompt.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="fb-comment" className="sr-only">
            Comment
          </Label>
          <Textarea
            id="fb-comment"
            value={comment}
            maxLength={1000}
            onChange={(e) => setComment(e.target.value)}
            placeholder="For example: revenue should exclude cancelled orders"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCommentFor(null)}>
              Skip
            </Button>
            <Button
              disabled={!comment.trim() || feedback.isPending}
              onClick={() => {
                feedback.mutate({ rating: -1, comment: comment.trim() })
                setCommentFor(null)
              }}
            >
              Send comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={proposeOpen} onOpenChange={setProposeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propose as a verified query</DialogTitle>
            <DialogDescription>
              Approved queries become examples the agent learns from for similar questions. Phrase the question the way
              people will ask it.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="vq-question">Question</Label>
          <Textarea
            id="vq-question"
            value={proposedQuestion}
            maxLength={1000}
            onChange={(e) => setProposedQuestion(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProposeOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!proposedQuestion.trim() || propose.isPending} onClick={() => propose.mutate()}>
              Propose
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
