"""FakeLLM responders for the agent (tests, CI, e2e). Deterministic Olist SQL chosen by keyword.

Importing this module registers the responders; app.runtime does so whenever FAKE_LLM is on.
"""

import re

from app.graph.llm_models import ClarificationOut, CompositionOut, SqlCandidateOut
from app.llm.fake_client import responder

_REVENUE_BY_STATE = """
SELECT c.customer_state, SUM(i.price) AS revenue
FROM olist.order_items i
JOIN olist.orders o ON o.order_id = i.order_id
JOIN olist.customers c ON c.customer_id = o.customer_id
GROUP BY c.customer_state
ORDER BY revenue DESC
LIMIT 10"""

_MONTHLY_ORDERS = """
SELECT date_trunc('month', o.order_purchase_timestamp) AS order_month,
       COUNT(DISTINCT o.order_id) AS orders
FROM olist.orders o
WHERE o.order_purchase_timestamp < '2018-09-01'
GROUP BY 1
ORDER BY 1"""

_LATE_RATE = """
SELECT AVG(CASE WHEN o.order_delivered_customer_date > o.order_estimated_delivery_date
                THEN 1.0 ELSE 0.0 END) AS late_delivery_rate
FROM olist.orders o
WHERE o.order_status = 'delivered' AND o.order_delivered_customer_date IS NOT NULL"""

_PAYMENT_SHARE = """
SELECT p.payment_type,
       COUNT(*)::numeric / SUM(COUNT(*)) OVER () AS share
FROM olist.order_payments p
GROUP BY p.payment_type
ORDER BY share DESC"""

_SELLERS = """
SELECT i.seller_id, SUM(i.price) AS revenue
FROM olist.order_items i
GROUP BY i.seller_id
ORDER BY revenue DESC
LIMIT 5"""

_ORDERS = "SELECT COUNT(DISTINCT o.order_id) AS orders FROM olist.orders o"

_RULES: list[tuple[str, str]] = [
    (r"\bdrop\b|\bdelete\b", "DROP TABLE olist.orders"),  # exercises the guard
    (r"\bmissing_column\b", "SELECT missing_column FROM olist.orders"),  # exercises repair
    (r"\bnowhere\b", "SELECT o.order_id FROM olist.orders o WHERE o.order_status = 'nowhere'"),
    (r"\blate\b", _LATE_RATE),
    (r"\bpayment", _PAYMENT_SHARE),
    (r"\bseller", _SELLERS),
    (r"\bmonth|\btrend", _MONTHLY_ORDERS),
    (r"\brevenue\b|\bsales\b|\bstate", _REVENUE_BY_STATE),
]


def _question(prompt: str) -> str:
    m = re.search(r"^Question: (.*)$", prompt, re.M)
    return (m.group(1) if m else prompt).lower()


@responder(ClarificationOut)
def _clarify(system: str, context: str | None, prompt: str) -> ClarificationOut:
    if re.search(r"\bbest\b", _question(prompt)):
        return ClarificationOut(
            is_ambiguous=True,
            question="Best by which measure?",
            options=["Revenue", "Number of orders", "Average review score"],
        )
    return ClarificationOut(is_ambiguous=False, question="", options=[])


@responder(SqlCandidateOut)
def _sql(system: str, context: str | None, prompt: str) -> SqlCandidateOut:
    q = _question(prompt)
    if "previous queries for this question failed" in prompt:
        # Repairs fall back to a query that certainly runs.
        q = re.sub(r"missing_column|nowhere", "", q)
    sql = next((s for pat, s in _RULES if re.search(pat, q)), _ORDERS).strip()
    if "User answered: Revenue" in prompt:
        sql = _REVENUE_BY_STATE.strip()
    return SqlCandidateOut(sql=sql, tables_used=[], assumptions=["Fake LLM: canned query."])


@responder(CompositionOut)
def _compose(system: str, context: str | None, prompt: str) -> CompositionOut:
    rows = re.search(r"^Rows returned: ([\d,]+)", prompt, re.M)
    n = rows.group(1) if rows else "0"
    return CompositionOut(
        title=_question(prompt)[:60].capitalize(),
        summary=f"The query returned {n} rows.",
        caveats=["Generated in fake-LLM mode."],
    )
