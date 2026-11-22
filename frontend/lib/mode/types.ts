import type { ComponentType } from "react"

import type { StreamEvent } from "@/lib/answer"
import type { Schemas } from "@/lib/api/errors"

/**
 * Everything the screens need from the backend, typed with the generated OpenAPI schemas.
 * lib/mode/real.tsx implements it with the HTTP client; lib/mode/static.tsx with fixtures.
 * Every method throws ApiError on failure.
 */
export interface DataApi {
  me(): Promise<Schemas["UserOut"]>

  conversations(q?: string): Promise<Schemas["ConversationOut"][]>
  conversation(id: string): Promise<Schemas["ConversationDetail"]>
  renameConversation(id: string, title: string): Promise<Schemas["ConversationOut"]>
  deleteConversation(id: string): Promise<void>

  /** Streams the events of a new run. Ends after `done`; aborting the signal stops it. */
  chat(body: Schemas["ChatIn"], signal: AbortSignal): AsyncIterable<StreamEvent>
  /** Resumes a run paused on a clarifying question. */
  clarify(runId: string, body: Schemas["ClarifyIn"], signal: AbortSignal): AsyncIterable<StreamEvent>
  cancelRun(runId: string): Promise<void>

  run(id: string): Promise<Schemas["RunOut"]>
  rows(id: string, page?: { offset: number; limit: number }): Promise<Schemas["RowsPage"]>
  /** Starts a CSV download of a run's rows. */
  downloadCsv(runId: string): Promise<void>

  feedback(body: Schemas["FeedbackIn"]): Promise<Schemas["FeedbackOut"]>
  verified(status?: Schemas["VerifiedOut"]["status"]): Promise<Schemas["VerifiedOut"][]>
  proposeVerified(body: Schemas["VerifiedIn"]): Promise<Schemas["VerifiedOut"]>
  approveVerified(id: string): Promise<Schemas["VerifiedOut"]>
  rejectVerified(id: string): Promise<void>

  tables(): Promise<Schemas["TableSummary"][]>
  table(id: string): Promise<Schemas["TableDetail"]>
  patchTable(id: string, body: Schemas["DescriptionPatch"]): Promise<Schemas["TableDetail"]>
  patchColumn(id: string, body: Schemas["ColumnPatch"]): Promise<Schemas["app__schemas__catalog__ColumnOut"]>
  metrics(): Promise<Schemas["SemanticLayerOut"]>
  saveMetrics(body: Schemas["SemanticLayerIn"]): Promise<Schemas["SemanticLayerOut"]>
  connections(): Promise<Schemas["ConnectionOut"][]>
  syncConnection(id: string): Promise<Schemas["JobOut"]>
  job(id: string): Promise<Schemas["JobOut"]>
}

export type Mode = {
  /** True in the static demo build. Screens use it to label simulated values. */
  isDemo: boolean
  data: DataApi
  /** Body of /login: the real sign-in form, or the closed card in the demo. */
  SignIn: ComponentType
  /** Suggested questions per role. The demo only suggests questions its script answers. */
  examples: Record<Schemas["UserOut"]["role"], string[]>
  /** Bottom of the sidebar: the account menu, or the demo's "View as" persona switch. */
  AccountMenu: ComponentType<{ compact?: boolean; onDone?: () => void }>
}
