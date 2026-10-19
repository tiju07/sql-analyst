import type { Schemas } from "@/lib/api/client"

type Role = Schemas["UserOut"]["role"]

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", analyst: "Analyst", regional: "Regional manager" }

export function scopeLabel(states: string[] | null | undefined): string {
  return states?.length ? `Customers in ${states.join(", ")}` : "All states"
}

/** Starter questions per persona; the regional set stays meaningful inside one state. */
export const EXAMPLES: Record<Role, string[]> = {
  admin: [
    "Which 5 states had the highest revenue in 2018 Q2?",
    "What is the late delivery rate by state for delivered orders?",
    "Monthly orders and revenue for 2017",
    "Which product categories have the lowest average review score?",
    "What share of payments are credit card, boleto, voucher and debit card?",
    "Top 10 sellers by GMV, with their state",
  ],
  analyst: [
    "Which 5 states had the highest revenue in 2018 Q2?",
    "How did average order value change month by month in 2018?",
    "What is the late delivery rate by state for delivered orders?",
    "Which product categories have the lowest average review score?",
    "How many unique customers ordered more than once?",
    "Average delivery time in days by customer state",
  ],
  regional: [
    "What was our revenue by month in 2018?",
    "Which cities have the most orders?",
    "What is our late delivery rate?",
    "Top 10 product categories by revenue",
    "How are customers paying, by payment type?",
    "What is the average review score by month?",
  ],
}
