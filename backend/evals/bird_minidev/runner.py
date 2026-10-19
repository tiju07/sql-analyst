"""BIRD Mini-Dev runner: ablations x evidence, scored by the official BIRD evaluation code.

    uv run --group evals python -m evals.bird_minidev.runner \\
        --data ../data/bird/extracted/minidev/MINIDEV --ablations e_full --evidence with \\
        --limit 20 --estimate-only

Results go to evals/results/bird/<run-id>/: one JSONL per (ablation, evidence) with a line per
question (resumable), the official-format predictions, the official scorer's logs, and
summary.json. A cost estimate prints first; runs estimated above $5 need --yes.

Few-shot ablation (d): BIRD's train databases differ from the dev ones, so there is no real pool
of verified queries for these schemas. We use two-fold cross-validation instead: each database
gets two connections; questions with an even id run against fold 0, whose verified examples are
the gold SQL of the odd-id questions (and vice versa). A question never sees its own gold SQL.
"""

import argparse
import asyncio
import csv
import json
import re
import subprocess
import sys
import time
import uuid
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path
from typing import Any

from langgraph.checkpoint.memory import InMemorySaver
from sqlalchemy import delete, select

from app.config import Settings, get_settings
from app.graph.build import AgentGraph, build_graph
from app.graph.context import agent_config, agent_context
from app.graph.runner import RunOutcome, stream_run
from app.graph.state import AgentState
from app.llm.client import LLMClient
from app.llm.pricing import PRICES
from app.models import CatalogTable, Connection, User, VerifiedQuery
from app.runtime import Runtime
from app.sql.dialects import Dialect
from app.sql.executor import SqliteExecutor
from app.sql.introspect import TableMeta, introspect_sqlite
from app.workers.catalog_sync import sync_catalog
from evals.common import RESULTS_DIR, Ablation, LlmMode, RecordingLLM, load_ablations, percentile

OFFICIAL = Path(__file__).parent / "official_eval"
SEPARATOR = "\t----- bird -----\t"
# Benchmark answers can be large; a low cap would truncate correct results and fail EX.
ROW_LIMIT = 100_000
TIMEOUT_MS = 30_000  # the official scorer's meta_time_out


@dataclass(frozen=True)
class Question:
    idx: int  # position in the official file (the scorer's key)
    question_id: int
    db_id: str
    question: str
    evidence: str
    gold: str
    difficulty: str
    gold_line: str  # verbatim line from the official gold file ("SQL\tdb_id\n")

    @property
    def fold(self) -> int:
        return self.question_id % 2


@dataclass
class ItemResult:
    idx: int
    question_id: int
    db_id: str
    difficulty: str
    ablation: str
    evidence: bool
    sql: str
    status: str
    error: str | None
    latency_ms: int
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cost_usd: float
    repairs: int
    candidates_ok: int
    match: bool | None = None  # filled after scoring (same set semantics as the official EX)
    extra: dict[str, Any] = field(default_factory=dict)


def load_questions(data: Path) -> list[Question]:
    raw = json.loads((data / "mini_dev_sqlite.json").read_text())
    gold = (data / "mini_dev_sqlite_gold.sql").read_text().splitlines(keepends=True)
    assert len(gold) == len(raw), "gold file and questions are out of step"
    return [
        Question(
            i,
            q["question_id"],
            q["db_id"],
            q["question"],
            q["evidence"] or "",
            q["SQL"],
            q["difficulty"],
            gold[i],
        )
        for i, q in enumerate(raw)
    ]


def db_path(data: Path, db_id: str) -> Path:
    return data / "dev_databases" / db_id / f"{db_id}.sqlite"


def read_descriptions(data: Path, db_id: str) -> dict[str, dict[str, str]]:
    """{table: {column: description}} from BIRD's database_description CSVs."""
    out: dict[str, dict[str, str]] = {}
    folder = data / "dev_databases" / db_id / "database_description"
    for f in folder.glob("*.csv"):
        cols: dict[str, str] = {}
        # A few BIRD CSVs contain bytes that aren't valid UTF-8; replace rather than fail.
        with f.open(encoding="utf-8", errors="replace", newline="") as fh:
            for row in csv.DictReader(fh):
                name = (row.get("original_column_name") or "").strip()
                if not name:
                    continue
                parts = [row.get("column_description") or "", row.get("value_description") or ""]
                text = " ".join(" ".join(p.split()) for p in parts if p and p.strip())
                if text:
                    cols[name.lower()] = text[:600]
        out[f.stem.lower()] = cols
    return out


async def ensure_catalog(
    rt: Runtime, data: Path, db_id: str, folds: list[Question]
) -> dict[int, uuid.UUID]:
    """Two connections per database (folds 0/1): catalog, descriptions, cross-fold examples."""
    ids: dict[int, uuid.UUID] = {}
    metas: list[TableMeta] | None = None
    async with rt.sessions() as s:
        admin = await s.scalar(
            select(User.id).where(User.role == "admin").order_by(User.created_at)
        )
    for fold in (0, 1):
        name = f"bird:{db_id}:f{fold}"
        async with rt.sessions() as s:
            conn = await s.scalar(select(Connection).where(Connection.name == name))
            if conn is None:
                conn = Connection(
                    name=name,
                    dialect=Dialect.sqlite.value,
                    dsn_secret_ref=str(db_path(data, db_id)),
                    readonly_role="sqlite-readonly-file",
                )
                s.add(conn)
                await s.commit()
            ids[fold] = conn.id
            has_catalog = await s.scalar(
                select(CatalogTable.id).where(CatalogTable.connection_id == conn.id).limit(1)
            )
        if has_catalog is None:
            if metas is None:
                print(f"  introspecting {db_id} …", flush=True)
                metas = await introspect_sqlite(db_path(data, db_id))
                docs = read_descriptions(data, db_id)
                for t in metas:
                    for c in t.columns:
                        c.description = docs.get(t.name.lower(), {}).get(c.name.lower())
            await sync_catalog(rt, conn.id, metas=metas, draft_descriptions=False)
        # Verified examples for this fold = gold SQL of the other fold (replaced each run).
        others = [q for q in folds if q.fold != fold]
        async with rt.sessions() as s:
            await s.execute(delete(VerifiedQuery).where(VerifiedQuery.connection_id == conn.id))
            vectors = await rt.embedder.embed_documents([q.question for q in others])
            s.add_all(
                VerifiedQuery(
                    connection_id=conn.id,
                    question=q.question,
                    sql=q.gold,
                    embedding=v,
                    proposed_by=admin,
                    approved_by=admin,
                )
                for q, v in zip(others, vectors, strict=True)
            )
            await s.commit()
    return ids


async def run_one(
    rt: Runtime,
    graph: AgentGraph,
    data: Path,
    q: Question,
    ablation: Ablation,
    evidence: bool,
    conn_id: uuid.UUID,
) -> ItemResult:
    config = replace(
        ablation.config(agent_config(rt)), row_limit=ROW_LIMIT, statement_timeout_ms=TIMEOUT_MS
    )
    ctx = agent_context(
        rt,
        conn_id,
        config=config,
        executor=SqliteExecutor(db_path(data, q.db_id)),
        dialect=Dialect.sqlite,
    )
    run_id = str(uuid.uuid4())
    start = AgentState(
        run_id=run_id,
        question=q.question,
        hint=q.evidence if evidence else None,
        history=[],
        allowed_states=None,
    )
    t0 = time.perf_counter()
    outcome = RunOutcome(status="failed")
    async for item in stream_run(graph, ctx, run_id, start):
        if isinstance(item, RunOutcome):
            outcome = item
    cands = outcome.values.get("candidates", [])
    chosen = next((c for c in cands if c["index"] == outcome.values.get("chosen")), None)
    u = ctx.llm.usage
    return ItemResult(
        idx=q.idx,
        question_id=q.question_id,
        db_id=q.db_id,
        difficulty=q.difficulty,
        ablation=ablation.id,
        evidence=evidence,
        sql=(chosen or {}).get("safe_sql") or "",
        status=outcome.status,
        error=outcome.error["code"] if outcome.error else None,
        latency_ms=round((time.perf_counter() - t0) * 1000),
        input_tokens=u.input_tokens,
        output_tokens=u.output_tokens,
        cache_read_tokens=u.cache_read_tokens,
        cost_usd=u.cost_usd,
        repairs=(chosen or {}).get("repairs", 0),
        candidates_ok=sum(1 for c in cands if c["status"] in ("ok", "empty")),
    )


# --- scoring --------------------------------------------------------------------------------


def write_official_inputs(
    out: Path, questions: list[Question], results: dict[int, ItemResult]
) -> dict[str, Path]:
    pred = {
        str(i): (results[q.idx].sql if q.idx in results else " ") + SEPARATOR + q.db_id
        for i, q in enumerate(questions)
    }
    paths = {
        "pred": out / "predictions.json",
        "gold": out / "gold.sql",
        "diff": out / "difficulty.jsonl",
    }
    paths["pred"].write_text(json.dumps(pred, indent=1))
    # Gold lines are copied verbatim from the official file (never re-serialised).
    paths["gold"].write_text("".join(q.gold_line for q in questions))
    paths["diff"].write_text(
        "".join(
            json.dumps({"difficulty": q.difficulty, "db_id": q.db_id}) + "\n" for q in questions
        )
    )
    return paths


_ROW = re.compile(
    r"^(EX|F1 Score|Soft-F1|Soft F1)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)", re.M
)


def run_official(
    script: str, paths: dict[str, Path], data: Path, out: Path, cpus: int
) -> dict[str, float] | None:
    """Run an official scorer unmodified. Returns {simple, moderate, challenging, total} in %."""
    log = out / f"{script.removesuffix('.py')}.log"
    log.unlink(missing_ok=True)
    cmd = [
        sys.executable, script,
        "--predicted_sql_path", str(paths["pred"].resolve()),
        "--ground_truth_path", str(paths["gold"].resolve()),
        "--db_root_path", str((data / "dev_databases").resolve()) + "/",
        "--diff_json_path", str(paths["diff"].resolve()),
        "--num_cpus", str(cpus),
        "--meta_time_out", str(TIMEOUT_MS / 1000),
        "--sql_dialect", "SQLite",
        "--output_log_path", str(log.resolve()),
    ]  # fmt: skip
    proc = subprocess.run(cmd, cwd=OFFICIAL, capture_output=True, text=True, check=False)  # noqa: S603
    (out / f"{script.removesuffix('.py')}.stdout").write_text(proc.stdout + proc.stderr)
    m = _ROW.search(proc.stdout)
    if proc.returncode != 0 or m is None:
        return None  # e.g. a subset missing a difficulty level divides by zero upstream
    return dict(
        zip(("simple", "moderate", "challenging", "total"), map(float, m.groups()[1:]), strict=True)
    )


def set_match(pred: str, gold: str, path: Path) -> bool:
    """Per-question EX with the official semantics (set equality), for the failure audit."""
    import sqlite3

    if not pred.strip():
        return False
    try:
        with sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=30) as db:
            return set(db.execute(pred).fetchall()) == set(db.execute(gold).fetchall())
    except sqlite3.Error:
        return False


# --- cost estimate --------------------------------------------------------------------------

# Input sizes measured by running only the retrieve step on 60 sampled Mini-Dev questions
# (mean prompt 8,235 chars full-schema, 8,001 linked incl. values and examples; ~3.5 chars/token).
# Output size is the main unknown until a pilot run: thinking at effort=medium is billed as output.
EST_INPUT_TOKENS = {"full": 2400, "linked": 2300}
EST_OUTPUT_TOKENS_SQL = 1500  # SQL + adaptive thinking at effort=medium; deliberately generous
EST_COMPOSE = (1500, 300)
EST_REPAIR_RATE = 0.3  # share of candidates needing one repair, when repairs are on


def estimate(
    ablations: list[Ablation],
    n_questions: int,
    evidence_modes: int,
    model_sql: str,
    model_fast: str,
) -> list[tuple[str, float]]:
    sql, fast = PRICES[model_sql], PRICES[model_fast]
    rows = []
    for a in ablations:
        o = a.overrides
        inp = EST_INPUT_TOKENS["linked" if o.get("schema_linking") else "full"]
        calls = o.get("n_candidates", 1) * (1 + (EST_REPAIR_RATE if o.get("max_repairs", 0) else 0))
        per_q = calls * (inp * sql.input + EST_OUTPUT_TOKENS_SQL * sql.output) / 1e6
        per_q += (EST_COMPOSE[0] * fast.input + EST_COMPOSE[1] * fast.output) / 1e6
        rows.append((a.id, per_q * n_questions * evidence_modes))
    return rows


# --- main -----------------------------------------------------------------------------------


async def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument(
        "--data",
        type=Path,
        required=True,
        help="MINIDEV folder (mini_dev_sqlite.json, dev_databases/)",
    )
    p.add_argument("--ablations", default="all", help="comma-separated ids, or 'all'")
    p.add_argument("--evidence", choices=["with", "without", "both"], default="both")
    p.add_argument("--limit", type=int, help="first N questions only")
    p.add_argument("--db", help="only questions for this db_id")
    p.add_argument("--concurrency", type=int, default=4)
    p.add_argument("--run-id", default=time.strftime("%Y%m%d-%H%M%S"))
    p.add_argument(
        "--resume", action="store_true", help="skip questions already in the run's JSONL"
    )
    p.add_argument("--llm", choices=["real", "record", "replay"], default="real")
    p.add_argument(
        "--recordings", type=Path, default=RESULTS_DIR / ".." / "recorded" / "bird.jsonl"
    )
    p.add_argument("--estimate-only", action="store_true")
    p.add_argument("--yes", action="store_true", help="skip the >$5 confirmation")
    args = p.parse_args()
    await run(args)


async def run(
    args: argparse.Namespace,
    llm_override: LLMClient | None = None,
    settings: Settings | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    all_ab = load_ablations()
    ablations = (
        all_ab
        if args.ablations == "all"
        else [a for a in all_ab if a.id in args.ablations.split(",")]
    )
    questions = load_questions(args.data)
    if args.db:
        questions = [q for q in questions if q.db_id == args.db]
    if args.limit:
        questions = questions[: args.limit]
    modes = {"with": [True], "without": [False], "both": [True, False]}[args.evidence]

    est = estimate(
        ablations, len(questions), len(modes), settings.llm_model_sql, settings.llm_model_fast
    )
    total = sum(c for _, c in est)
    n_q, n_a, n_m = len(questions), len(ablations), len(modes)
    print(f"Plan: {n_q} questions x {n_a} ablations x {n_m} evidence settings")
    for aid, c in est:
        print(f"  {aid:<20} est. ${c:,.2f}")
    print(f"  {'total':<20} est. ${total:,.2f}")
    print(f"  (assumes ~{EST_OUTPUT_TOKENS_SQL} output tokens per SQL call and no cache hits)")
    mode: LlmMode = args.llm
    if args.estimate_only:
        return {"estimate_usd": total}
    if mode in ("real", "record") and llm_override is None and total > 5 and not args.yes:
        prompt = f"Estimated cost ${total:,.2f} exceeds $5. Continue? [y/N] "
        answer = await asyncio.to_thread(input, prompt)
        if answer.strip().lower() != "y":
            raise SystemExit("Aborted.")

    rt = await Runtime.create(settings)
    if llm_override is not None:
        rt.llm = llm_override
    elif mode != "real":
        rt.llm = RecordingLLM(rt.llm if mode == "record" else None, args.recordings, mode)
    graph = build_graph(InMemorySaver())
    out_root = RESULTS_DIR / "bird" / args.run_id
    out_root.mkdir(parents=True, exist_ok=True)
    try:
        by_db: dict[str, list[Question]] = {}
        for q in questions:
            by_db.setdefault(q.db_id, []).append(q)
        conns: dict[str, dict[int, uuid.UUID]] = {}
        all_qs = load_questions(args.data)
        for db_id in by_db:
            conns[db_id] = await ensure_catalog(
                rt, args.data, db_id, [q for q in all_qs if q.db_id == db_id]
            )

        summary: dict[str, Any] = {
            "run_id": args.run_id,
            "model_sql": settings.llm_model_sql,
            "model_fast": settings.llm_model_fast,
            "runs": [],
        }
        sem = asyncio.Semaphore(args.concurrency)
        for ablation in ablations:
            for evidence in modes:
                key = f"{ablation.id}__{'evidence' if evidence else 'no_evidence'}"
                out = out_root / key
                out.mkdir(exist_ok=True)
                jsonl = out / "items.jsonl"
                done: dict[int, ItemResult] = {}
                if args.resume and jsonl.exists():
                    for line in jsonl.read_text().splitlines():
                        r = ItemResult(**json.loads(line))
                        done[r.idx] = r
                todo = [q for q in questions if q.idx not in done]
                print(f"[{key}] {len(done)} done, {len(todo)} to run", flush=True)

                async def task(
                    q: Question, ab: Ablation = ablation, ev: bool = evidence, fh: Path = jsonl
                ) -> ItemResult:
                    async with sem:
                        r = await run_one(rt, graph, args.data, q, ab, ev, conns[q.db_id][q.fold])
                    with fh.open("a") as f:
                        f.write(json.dumps(asdict(r)) + "\n")
                    return r

                for r in await asyncio.gather(*(task(q) for q in todo)):
                    done[r.idx] = r

                for q in questions:
                    done[q.idx].match = set_match(
                        done[q.idx].sql, q.gold, db_path(args.data, q.db_id)
                    )
                paths = write_official_inputs(out, questions, done)
                ex = run_official(
                    "evaluation_ex.py", paths, args.data, out, min(8, args.concurrency * 2)
                )
                f1 = run_official(
                    "evaluation_f1.py", paths, args.data, out, min(8, args.concurrency * 2)
                )
                items = [done[q.idx] for q in questions]
                own_ex = sum(1 for r in items if r.match) / len(items)
                by_diff: dict[str, float] = {}
                for d in ("simple", "moderate", "challenging"):
                    sub = [r for r in items if r.difficulty == d]
                    if sub:
                        by_diff[d] = sum(1 for r in sub if r.match) / len(sub)
                lat = [r.latency_ms for r in items]
                run_summary: dict[str, Any] = {
                    "ablation": ablation.id,
                    "label": ablation.label,
                    "evidence": evidence,
                    "n": len(items),
                    "ex": (ex["total"] / 100) if ex else own_ex,
                    "ex_source": "official"
                    if ex
                    else "same set semantics (official scorer needs all three difficulty levels)",
                    "ex_per_question_check": own_ex,
                    "soft_f1": (f1["total"] / 100) if f1 else None,
                    "by_difficulty": {k: v / 100 for k, v in ex.items() if k != "total"}
                    if ex
                    else by_diff,
                    "cost_per_question_usd": sum(r.cost_usd for r in items) / len(items),
                    "p50_ms": percentile(lat, 0.5),
                    "p95_ms": percentile(lat, 0.95),
                    "statuses": {
                        s: sum(1 for r in items if r.status == s) for s in {r.status for r in items}
                    },
                }
                (out / "summary.json").write_text(json.dumps(run_summary, indent=2))
                summary["runs"].append(run_summary)
                rs = run_summary
                f1_text = "—" if rs["soft_f1"] is None else f"{rs['soft_f1']:.1%}"
                print(
                    f"[{key}] EX {rs['ex']:.1%} ({rs['ex_source'].split(' ')[0]}), "
                    f"soft-F1 {f1_text}, ${rs['cost_per_question_usd']:.4f}/q, "
                    f"p50 {rs['p50_ms'] / 1000:.1f}s",
                    flush=True,
                )
        (out_root / "summary.json").write_text(json.dumps(summary, indent=2))
        return summary
    finally:
        await rt.close()


if __name__ == "__main__":
    asyncio.run(main())
