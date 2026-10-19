"""Golden Olist set: 60 business questions with reviewed gold SQL, run with the product config.

    uv run --env-file ../.env python -m evals.golden.runner [--limit N] [--llm real|record|replay]

Metrics
- execution match: the agent's result contains the gold result. Every gold column must map to a
  distinct predicted column so that the projected rows are equal as multisets (extra columns and
  different names are fine; row order is ignored).
- clarification accuracy: the agent asked a clarifying question exactly when the case expects it.
  When it asks, the run resumes with the case's chosen reading (or the first option).
"""

import argparse
import asyncio
import itertools
import json
import time
import uuid
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from sqlalchemy import select

from app.config import Settings, get_settings
from app.graph import results
from app.graph.build import AgentGraph, build_graph
from app.graph.context import agent_context
from app.graph.events import ClarifyEvent
from app.graph.runner import RunOutcome, stream_run
from app.graph.state import AgentState
from app.llm.client import LLMClient
from app.models import Connection
from app.runtime import Runtime
from app.sql.executor import QueryError
from evals.common import RESULTS_DIR, RecordingLLM, percentile

GOLDEN = Path(__file__).parent / "golden_set.jsonl"


@dataclass
class GoldenResult:
    id: str
    category: str
    question: str
    expect_clarify: bool
    asked: bool
    status: str
    sql: str
    match: bool
    latency_ms: int
    cost_usd: float
    error: str | None


def _norm(v: Any) -> Any:
    return round(v, 4) if isinstance(v, float) else v


def contains_result(pred_cols: int, pred: list[list[Any]], gold: list[list[Any]]) -> bool:
    """True if some injective mapping gold column -> pred column makes the row multisets equal."""
    if len(pred) != len(gold):
        return False
    if not gold:
        return True
    g_cols = len(gold[0])
    pred_n = [[_norm(v) for v in r] for r in pred]
    gold_n = [[_norm(v) for v in r] for r in gold]
    col_vals = [Counter(json.dumps(r[k], default=str) for r in pred_n) for k in range(pred_cols)]
    options = []
    for j in range(g_cols):
        want = Counter(json.dumps(r[j], default=str) for r in gold_n)
        cands = [k for k in range(pred_cols) if col_vals[k] == want]
        if not cands:
            return False
        options.append(cands)
    target = Counter(tuple(json.dumps(v, default=str) for v in r) for r in gold_n)
    for mapping in itertools.product(*options):
        if len(set(mapping)) != len(mapping):
            continue
        got = Counter(tuple(json.dumps(r[k], default=str) for k in mapping) for r in pred_n)
        if got == target:
            return True
    return False


async def run_case(
    rt: Runtime, graph: AgentGraph, conn_id: uuid.UUID, case: dict[str, Any]
) -> GoldenResult:
    ctx = agent_context(rt, conn_id)
    run_id = str(uuid.uuid4())
    t0 = time.perf_counter()
    asked = False
    outcome = RunOutcome(status="failed")
    start: AgentState | Command[str] = AgentState(
        run_id=run_id, question=case["question"], history=[], allowed_states=None
    )
    for _ in range(2):  # at most one clarification round
        clarify: ClarifyEvent | None = None
        async for item in stream_run(graph, ctx, run_id, start):
            if isinstance(item, ClarifyEvent):
                clarify = item
            elif isinstance(item, RunOutcome):
                outcome = item
        if outcome.status != "clarifying" or clarify is None:
            break
        asked = True
        start = Command(resume=case.get("clarify_answer") or clarify.options[0])

    chosen = next(
        (
            c
            for c in outcome.values.get("candidates", [])
            if c["index"] == outcome.values.get("chosen")
        ),
        None,
    )
    match = False
    if chosen and outcome.status in ("ok", "repaired"):
        payload = await results.load(rt.redis, results.rows_key(run_id)) or {}
        try:
            gold = await rt.executor.execute(
                case["sql"], allowed_states=None, timeout_ms=60_000, row_limit=100_000
            )
            match = contains_result(
                len(payload.get("columns", [])), payload.get("rows", []), gold.rows
            )
        except QueryError as e:
            raise RuntimeError(f"gold SQL for {case['id']} failed: {e.message}") from e
    return GoldenResult(
        id=case["id"],
        category=case["category"],
        question=case["question"],
        expect_clarify=bool(case.get("expect_clarify")),
        asked=asked,
        status=outcome.status,
        sql=(chosen or {}).get("safe_sql", ""),
        match=match,
        latency_ms=round((time.perf_counter() - t0) * 1000),
        cost_usd=ctx.llm.usage.cost_usd,
        error=outcome.error["code"] if outcome.error else None,
    )


async def run(
    args: argparse.Namespace,
    llm_override: LLMClient | None = None,
    settings: Settings | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    cases = [json.loads(line) for line in GOLDEN.read_text().splitlines() if line.strip()]
    if args.limit:
        cases = cases[: args.limit]
    rt = await Runtime.create(settings)
    if llm_override is not None:
        rt.llm = llm_override
    elif args.llm != "real":
        rt.llm = RecordingLLM(rt.llm if args.llm == "record" else None, args.recordings, args.llm)
    graph = build_graph(InMemorySaver())
    out = RESULTS_DIR / "golden" / args.run_id
    out.mkdir(parents=True, exist_ok=True)
    try:
        async with rt.sessions() as s:
            conn_id = await s.scalar(select(Connection.id).where(Connection.name == "olist"))
        assert conn_id is not None, "run make seed first"
        sem = asyncio.Semaphore(args.concurrency)

        async def one(case: dict[str, Any]) -> GoldenResult:
            async with sem:
                return await run_case(rt, graph, conn_id, case)

        items = await asyncio.gather(*(one(c) for c in cases))
        (out / "items.jsonl").write_text("".join(json.dumps(asdict(r)) + "\n" for r in items))
        lat = [r.latency_ms for r in items]
        summary = {
            "questions": len(items),
            "ex": sum(r.match for r in items) / len(items),
            "clarify_accuracy": sum(r.asked == r.expect_clarify for r in items) / len(items),
            "cost_per_question_usd": sum(r.cost_usd for r in items) / len(items),
            "p50_ms": percentile(lat, 0.5),
            "p95_ms": percentile(lat, 0.95),
            "by_category": {
                c: sum(r.match for r in items if r.category == c)
                / sum(1 for r in items if r.category == c)
                for c in sorted({r.category for r in items})
            },
        }
        (out / "summary.json").write_text(json.dumps(summary, indent=2))
        print(json.dumps(summary, indent=2))
        return summary
    finally:
        await rt.close()


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--limit", type=int)
    p.add_argument("--concurrency", type=int, default=4)
    p.add_argument("--run-id", default=time.strftime("%Y%m%d-%H%M%S"))
    p.add_argument("--llm", choices=["real", "record", "replay"], default="real")
    p.add_argument(
        "--recordings", type=Path, default=RESULTS_DIR.parent / "recorded" / "golden.jsonl"
    )
    asyncio.run(run(p.parse_args()))


if __name__ == "__main__":
    main()
