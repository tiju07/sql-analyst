# Walkthrough storyboard

The animated tour on the landing page. Eight scenes, 57.5 seconds, looping. It is built from the
real Explore-workspace components (`StageStepper`, `ClarifyCard`, `SqlCode`, the answer layout)
inside the Foundry `AppShell`, driven only by `t`.

Window: 1120 x 680 design pixels on desktop (content area 1120 x 640 under the 40 px browser bar;
the app shell has a 216 px sidebar and a 48 px top bar). Compact: 420 x 700 (content 420 x 660),
`AppShell compact`, single column, no sidebar.

Every number in a result comes from `frontend/fixtures/olist-aggregates.json` (computed offline
from the public Olist CSVs). Timings, tokens and cost are simulated and labelled so on screen.

Cursor coordinates are design pixels inside the window content (origin at the top left of the
area under the browser bar). Every click target is defined once as a constant in
`frontend/components/walkthrough/scenes.tsx` (`DESK`, `PHONE`, `REVENUE_OPTION`, `VIEW_AS`,
`THUMB`, `PROPOSE`, `APPROVE`) and was checked against frame captures of the built scenes at the
click times, desktop and phone, light and dark (Playwright with a fake clock).

Changes from the first draft, made while building:
- The persona in the sidebar is Ana Admin (not Bruno Analyst), so the approval in scene 8 is done
  by someone who may approve. Scene 7 switches to Carla Regional (SP).
- Scene 4 shows the chart and table side by side on desktop and the chart only on phones, where
  the table would not fit; the footer carries the "Simulated" label.
- The stage trail is the product's own `StageStepper`; when a run is finished it adds a
  "Simulated timings" label.
- Total length 57.5 s, eight scenes, as planned.

---

## 1. Start in the workspace (5.5 s)

Caption: "The Explore workspace opens on the Olist marketplace data: 99,441 orders from 2016 to
2018, with the tables the agent can read."

| Time | On screen |
|---|---|
| 0.0 s | Shell: sidebar (Ask, Data catalog, Verified queries, View as: Ana Admin), top bar "Explore workspace". Page header "Ask the Olist marketplace". |
| 0.2 to 1.8 s | Stat strip counts up: Orders 99,441; Order items 112,650; Customers 99,441; Sellers 3,095. |
| 1.2 s | "Try one of these" list of four questions appears. |
| 2.0 s | Composer appears at the bottom. |
| 2.4 to 4.6 s | Cursor travels from the centre to the composer (desktop 520, 586; phone 200, 618); click at 4.6 s; the composer gets a focus ring. |

Fixtures: `row_counts`.

## 2. Ask in plain English (8 s)

Caption: "Type a question. Retrieval finds the tables, the metric definition and the note that
the data ends in August 2018, so 'last quarter' means 2018 Q2."

| Time | On screen |
|---|---|
| 0.3 to 1.9 s | "Which 5 states had the highest revenue last quarter?" types into the composer (34 characters per second). |
| 2.3 s | Cursor clicks Send (desktop 1004, 596; phone 384, 620); the question moves above the answer. |
| 2.5 to 3.3 s | Stage trail: Retrieve active, then done (780 ms). |
| 3.3 s | Context card: tables `order_items`, `orders`, `customers`; metric `revenue = SUM(order_items.price)`; note "Last full quarter is 2018 Q2". |
| 3.6 s | Clarify done (not ambiguous). |
| 3.8 s | Generate active. |
| 4.5, 5.0, 5.5 s | Three candidate rows appear: "Direct query", "Joins planned with CTEs", "From the metric definitions". |
| 5.5 to 8.0 s | Hold for reading. |

## 3. Check, run, repair (8 s)

Caption: "A parser-based guard allows only one read-only SELECT over known tables. One candidate
fails, so the exact database error goes back to the model and the repaired query runs."

| Time | On screen |
|---|---|
| 0.3 s | Generate done; Guard active. |
| 0.9 s | Candidates 1 and 2: "Passed guard"; candidate 3: "Passed guard". LIMIT note: "LIMIT 5 kept". |
| 1.6 s | Execute active. Candidates 1 and 2 return 5 rows. |
| 2.4 s | Candidate 3 fails: `column i.revenue does not exist` (danger tone, with the text). |
| 3.2 s | Repair active; candidate 3 shows "Repair 1" and the corrected `SUM(i.price) AS revenue`. |
| 4.4 s | Candidate 3 passes guard and returns 5 rows. |
| 5.0 s | Select done: callout "3 of 3 candidates agree. Repaired once." |
| 5.0 to 8.0 s | Hold. |

## 4. The answer (8 s)

Caption: "The answer arrives as a table, a chart chosen from the shape of the result, and a short
explanation with its caveats."

| Time | On screen |
|---|---|
| 0.2 s | Compose done; stage trail fully green. |
| 0.4 to 1.6 s | Bar chart: SP R$1.18M, RJ R$353k, MG R$321k, PR R$155k, RS R$147k (bars grow). |
| 1.0 s | Table with the same five rows (desktop: beside the chart; compact: below). |
| 2.0 to 5.5 s | Summary streams: "São Paulo led 2018 Q2 with R$1.18M in product revenue, more than Rio de Janeiro, Minas Gerais and Paraná combined. The five states account for 75% of the quarter's revenue." |
| 5.6 s | Caveat: "'Last quarter' read as 2018 Q2, because the data ends in August 2018." |
| 6.0 s | Footer: "4.2 s, $0.012" with a "Simulated" badge. |
| 6.0 to 8.0 s | Hold. |

Fixtures: `revenue_by_state_2018_q2`.

## 5. Ask when it is ambiguous (7 s)

Caption: "When a question could mean several things, the agent asks first instead of guessing."

| Time | On screen |
|---|---|
| 0.3 to 1.4 s | "Which are our best product categories?" types and is sent. |
| 1.6 s | Retrieve done; Clarify active. |
| 2.2 s | Clarify card: "Best by which measure?" with Revenue, Number of orders, Average review score. |
| 2.4 to 3.8 s | Cursor moves to "Revenue" (desktop 365, 256; phone 64, 252); click at 3.8 s. |
| 4.0 s | Card collapses to "Best by which measure? Revenue"; Generate, Guard, Execute run. |
| 5.4 s | Top three categories: health_beauty R$1.26M, watches_gifts R$1.21M, bed_bath_table R$1.04M. |
| 5.4 to 7.0 s | Hold. |

Fixtures: `revenue_by_category`.

## 6. Unsafe SQL never runs (7 s)

Caption: "Asked to delete data, the guard blocks the query before it reaches the database. Even if
it got through, the database role can only read."

| Time | On screen |
|---|---|
| 0.3 to 1.2 s | "Delete all canceled orders" types and is sent. |
| 1.5 s | Retrieve, Clarify, Generate done. |
| 2.0 s | Candidate: `DELETE FROM olist.orders WHERE order_status = 'canceled'`. |
| 2.6 s | Guard: candidate badge "Blocked"; reason "Only a single read-only SELECT is allowed". |
| 3.2 s | Danger callout: "Blocked by the safety checks, so nothing ran." Rows executed: 0. |
| 3.8 s | Second line: "Three layers: guard, read-only role, row-level security." |
| 3.8 to 7.0 s | Hold. |

## 7. Each person sees only their rows (7.5 s)

Caption: "Switch to the São Paulo regional manager and ask again. Row-level security in Postgres
returns only SP, whatever the SQL says."

| Time | On screen |
|---|---|
| 0.4 to 1.6 s | Cursor moves to "View as" in the sidebar (desktop 108, 590; compact: the persona chip at the top of the content, 330, 77); click at 1.6 s. |
| 1.8 s | Persona changes to "Carla Regional (SP)"; badge "Customers in SP". |
| 2.2 to 3.2 s | "Revenue by state last quarter" types and is sent. |
| 3.6 to 4.6 s | Stage trail runs. |
| 4.8 s | Result: one row, SP R$1,179,247.29. |
| 5.4 s | Note: "Row scope SP, signed and checked by the database." |
| 5.4 to 7.5 s | Hold. |

Fixtures: `revenue_by_state_2018_q2[0]`.

## 8. Good answers teach the agent (6.5 s)

Caption: "A thumbs-up and 'Propose as verified' send the query to an admin. Approved queries
become worked examples for similar questions."

| Time | On screen |
|---|---|
| 0.3 to 1.2 s | Cursor to the thumbs-up under the earlier answer (desktop 325, 461; phone 33, 497); click at 1.2 s; it turns accent. |
| 1.6 to 2.4 s | Cursor to "Propose as verified" (desktop 452, 461; phone 162, 497); click at 2.4 s. |
| 2.8 s | Verified queries page, "Waiting for review" tab: the question and its SQL. |
| 3.2 to 4.4 s | Cursor to Approve (desktop 895, 216; phone 78, 285); click at 4.4 s. |
| 4.6 s | Status pill "Approved"; note "Used as an example for similar questions." |
| 4.6 to 6.5 s | Hold, then loop. |

## Reduced motion

`Walkthrough` renders each scene at its final state, does not autoplay, and offers Previous and
Next. Every scene's final frame is readable on its own: scene 2 ends with the context and the
three candidates, scene 3 with the agreement callout, scene 4 with the complete answer, and so on.
