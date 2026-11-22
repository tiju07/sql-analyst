"use client"

import { mode } from "app-mode"
import { toast } from "sonner"

const SIMULATED = "Simulated. Nothing is saved; a reload resets the demo."

/** Success toast for a write. In the static demo it says the write was simulated. */
export function saved(title: string, description?: string) {
  toast.success(title, { description: mode.isDemo ? [description, SIMULATED].filter(Boolean).join(" ") : description })
}
