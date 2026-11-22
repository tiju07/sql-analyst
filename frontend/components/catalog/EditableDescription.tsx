"use client"

import { Pencil } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function EditableDescription({
  value,
  source,
  canEdit,
  label,
  onSave,
}: {
  value: string | null
  source: string | null
  canEdit: boolean
  label: string
  onSave: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? "")
  if (editing) {
    return (
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(draft.trim())
          setEditing(false)
        }}
      >
        <label className="sr-only" htmlFor={`desc-${label}`}>
          Description of {label}
        </label>
        <Textarea
          id={`desc-${label}`}
          autoFocus
          value={draft}
          maxLength={1000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    )
  }
  return (
    <div className="group/desc flex items-start gap-1">
      <p className={value ? "" : "text-fg-muted italic"}>
        {value ?? "No description yet."}
        {source === "llm" && <span className="text-fg-muted ml-1 text-xs not-italic">(drafted by AI)</span>}
      </p>
      {canEdit && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Edit description of ${label}`}
          onClick={() => {
            setDraft(value ?? "")
            setEditing(true)
          }}
        >
          <Pencil aria-hidden />
        </Button>
      )}
    </div>
  )
}
