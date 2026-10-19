/** Shape of backend/evals/results/summary.json (written by evals/report.py, copied here). */
export type AblationRun = {
  ablation: string
  label: string
  evidence: boolean
  n: number
  ex: number
  soft_f1: number | null
  cost_per_question_usd: number
  p50_ms: number
  p95_ms: number
  by_difficulty: Record<string, number>
}

export type EvalSummary = {
  generated_at: string
  model_sql: string
  model_fast: string
  bird?: { dataset: string; questions: number; runs: AblationRun[] }
  golden?: { questions: number; ex: number; clarify_accuracy: number; cost_per_question_usd: number }
  safety?: { cases: number; passed: number; non_select_executions: number; rows_outside_scope: number }
  latency?: { p50_ms: number; p95_ms: number; histogram: { bucket: string; count: number }[] }
  failures?: { audited: number; categories: { category: string; count: number }[] }
  limitations: string[]
}
