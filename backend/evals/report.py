"""Assemble EVALS.md and summary.json from recorded runs. Nothing here is estimated.

    uv run python -m evals.report --bird <run-id> --golden <run-id> --safety <run-id> \\
        --safety-compromised <run-id> [--failures 50]

Writes evals/results/summary.json, frontend/lib/evals/summary.json (read by the static /evals and
landing pages) and ../EVALS.md. Sections without a run are reported as not run.
"""

import argparse
import csv
import json
import time
from pathlib import Path
from typing import Any

from app.config import get_settings
from evals.common import RESULTS_DIR

ROOT = Path(__file__).resolve().parents[2]
FRONTEND_SUMMARY = ROOT / "frontend" / "lib" / "evals" / "summary.json"
EVALS_MD = ROOT / "EVALS.md"
FAILURE_COLUMNS = [
    "schema_linking_miss",
    "wrong_join",
    "aggregation_error",
    "value_mismatch",
    "gold_sql_wrong",
    "other",
    "notes",
]
LIMITATIONS = [
    "BIRD Mini-Dev is 500 questions over 11 databases; differences of a point or two between "
    "ablations are within run-to-run noise.",
    "The few-shot step uses two-fold cross-validation over Mini-Dev itself (BIRD's train databases "
    "differ from the dev ones), so it measures in-domain examples, not a separate pool.",
    "Benchmark runs cap results at 100,000 rows and 30 s per query, matching the official scorer's "
    "timeout; the demo uses tighter limits.",
    "The golden Olist set was written for this project and reviewed by its author; it is small "
    "and not a public benchmark.",
]


def load(kind: str, run_id: str | None) -> dict[str, Any] | None:
    if not run_id:
        return None
    path = RESULTS_DIR / kind / run_id / "summary.json"
    if not path.exists():
        raise SystemExit(f"no summary at {path}")
    data: dict[str, Any] = json.loads(path.read_text())
    return data


def latency_histogram(ms: list[float]) -> list[dict[str, Any]]:
    edges = [(0, 5_000, "under 5 s"), (5_000, 10_000, "5 to 10 s"), (10_000, 20_000, "10 to 20 s"),
             (20_000, 40_000, "20 to 40 s"), (40_000, float("inf"), "over 40 s")]  # fmt: skip
    return [{"bucket": label, "count": sum(lo <= v < hi for v in ms)} for lo, hi, label in edges]


def export_failures(bird_run: str, limit: int) -> int:
    """First N wrong answers of the full system (with evidence), for manual categorisation."""
    items_path = RESULTS_DIR / "bird" / bird_run / "e_full__evidence" / "items.jsonl"
    if not items_path.exists():
        return 0
    failures = [
        json.loads(line)
        for line in items_path.read_text().splitlines()
        if line.strip() and not json.loads(line).get("match")
    ][:limit]
    out = RESULTS_DIR / "failures.csv"
    with out.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            ["question_id", "db_id", "difficulty", "status", "predicted_sql", *FAILURE_COLUMNS]
        )
        for r in failures:
            w.writerow(
                [r["question_id"], r["db_id"], r["difficulty"], r["status"], r["sql"]]
                + [""] * len(FAILURE_COLUMNS)
            )
    return len(failures)


def audited_categories() -> dict[str, Any] | None:
    """Counts from failures.csv once someone has filled in the category columns."""
    path = RESULTS_DIR / "failures.csv"
    if not path.exists():
        return None
    rows = list(csv.DictReader(path.open()))
    counts = {c: sum(1 for r in rows if r.get(c, "").strip()) for c in FAILURE_COLUMNS[:-1]}
    if not any(counts.values()):
        return None  # exported but not yet categorised
    labels = {"schema_linking_miss": "Schema-linking miss", "wrong_join": "Wrong join",
              "aggregation_error": "Aggregation error", "value_mismatch": "Value mismatch",
              "gold_sql_wrong": "Gold SQL wrong", "other": "Other"}  # fmt: skip
    return {
        "audited": len(rows),
        "categories": [{"category": labels[k], "count": v} for k, v in counts.items() if v],
    }


def md_table(rows: list[list[str]]) -> str:
    head, *body = rows
    out = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    out += ["| " + " | ".join(r) + " |" for r in body]
    return "\n".join(out)


def pct(x: float | None) -> str:
    return "—" if x is None else f"{x:.1%}"


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--bird")
    p.add_argument("--golden")
    p.add_argument("--safety", help="safety run with the real model")
    p.add_argument("--safety-compromised", help="safety run with the hostile stand-in model")
    p.add_argument("--failures", type=int, default=50)
    args = p.parse_args()
    s = get_settings()

    bird, golden = load("bird", args.bird), load("golden", args.golden)
    safety, compromised = load("safety", args.safety), load("safety", args.safety_compromised)

    summary: dict[str, Any] = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model_sql": (bird or {}).get("model_sql", s.llm_model_sql),
        "model_fast": (bird or {}).get("model_fast", s.llm_model_fast),
        "limitations": LIMITATIONS,
    }
    if bird:
        summary["bird"] = {
            "dataset": "BIRD Mini-Dev (SQLite)",
            "questions": bird["runs"][0]["n"],
            "runs": bird["runs"],
        }
        items = RESULTS_DIR / "bird" / args.bird / "e_full__evidence" / "items.jsonl"
        if items.exists():
            ms = [
                json.loads(line)["latency_ms"]
                for line in items.read_text().splitlines()
                if line.strip()
            ]
            full = next(r for r in bird["runs"] if r["ablation"] == "e_full" and r["evidence"])
            summary["latency"] = {
                "p50_ms": full["p50_ms"],
                "p95_ms": full["p95_ms"],
                "histogram": latency_histogram(ms),
            }
        export_failures(args.bird, args.failures)
        if cats := audited_categories():
            summary["failures"] = cats
    if golden:
        summary["golden"] = {
            k: golden[k] for k in ("questions", "ex", "clarify_accuracy", "cost_per_question_usd")
        }
    if safety:
        summary["safety"] = {
            k: safety[k] for k in ("cases", "passed", "non_select_executions", "rows_outside_scope")
        }
    if compromised:
        summary["safety_compromised"] = {
            k: compromised[k]
            for k in ("cases", "passed", "non_select_executions", "rows_outside_scope")
        }

    (RESULTS_DIR / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    FRONTEND_SUMMARY.write_text(json.dumps(summary, indent=2) + "\n")
    EVALS_MD.write_text(render_md(summary))
    print(f"Wrote {RESULTS_DIR / 'summary.json'}, {FRONTEND_SUMMARY} and {EVALS_MD}")


def render_md(s: dict[str, Any]) -> str:
    parts = [
        "# Evaluation results",
        "",
        f"Generated {s['generated_at']} by `backend/evals/report.py` from recorded runs. SQL model "
        f"`{s['model_sql']}`, helper model `{s['model_fast']}`. Every number below comes from a "
        "run "
        "whose raw per-question output is in `backend/evals/results/`; sections that haven't been "
        "run say so.",
        "",
        "## BIRD Mini-Dev",
        "",
    ]
    if "bird" in s:
        rows = [["Step", "Evidence", "EX", "Soft F1", "$/question", "p50", "p95", "Scored by"]]
        for r in s["bird"]["runs"]:
            rows.append([
                r["label"], "yes" if r["evidence"] else "no", pct(r["ex"]), pct(r["soft_f1"]),
                f"${r['cost_per_question_usd']:.4f}", f"{r['p50_ms'] / 1000:.1f} s",
                f"{r['p95_ms'] / 1000:.1f} s", r["ex_source"].split(" (")[0],
            ])  # fmt: skip
        parts += [md_table(rows), ""]
    else:
        parts += [
            "Not run yet. The harness is verified end to end with an oracle model on the real "
            "databases (100% EX through the official scorer when answers are correct), but no "
            "model run has been recorded. See *Reproduce*.",
            "",
        ]
    parts += ["## Golden Olist set", ""]
    if "golden" in s:
        g = s["golden"]
        parts += [
            md_table([
                ["Questions", "Execution match", "Clarification accuracy", "$/question"],
                [str(g["questions"]), pct(g["ex"]), pct(g["clarify_accuracy"]),
                 f"${g['cost_per_question_usd']:.4f}"],
            ]),
            "",
        ]  # fmt: skip
    else:
        parts += ["Not run yet with a model.", ""]
    parts += ["## Safety red team (30 adversarial cases)", ""]
    rows = [["Model", "Passed", "Non-SELECT executed", "Rows outside scope"]]
    for key, label in (
        ("safety", "Real model"),
        ("safety_compromised", "Compromised stand-in (always attacks)"),
    ):
        if key in s:
            x = s[key]
            rows.append(
                [
                    label,
                    f"{x['passed']} / {x['cases']}",
                    str(x["non_select_executions"]),
                    str(x["rows_outside_scope"]),
                ]
            )
        else:
            rows.append([label, "not run", "—", "—"])
    parts += [
        md_table(rows),
        "",
        "The compromised stand-in replaces the model with one that always writes the attack "
        "(DELETE/DROP, pg_sleep, set_config, explicit filters on other states for the São Paulo "
        "manager). Passing with it shows the guard, read-only role and RLS hold on their own.",
        "",
    ]
    if "failures" in s:
        parts += [
            "## Failure audit",
            "",
            md_table(
                [["Category", "Count"]]
                + [[c["category"], str(c["count"])] for c in s["failures"]["categories"]]
            ),
            "",
        ]
    parts += ["## Limitations", ""] + [f"- {x}" for x in s["limitations"]] + ["", REPRODUCE]
    return "\n".join(parts) + "\n"


REPRODUCE = """## Reproduce

```bash
make up && make seed                         # stack + Olist data
cd backend
# BIRD: data from the official mirror (see evals/bird_minidev/download.md)
DATA=../data/bird/extracted/minidev/MINIDEV
uv run python -m evals.bird_minidev.runner --data $DATA --estimate-only
uv run python -m evals.bird_minidev.runner --data $DATA --run-id full
uv run --env-file ../.env python -m evals.golden.runner --run-id golden
uv run --env-file ../.env python -m evals.safety.runner --run-id safety
uv run python -m evals.report --bird full --golden golden --safety safety
```
"""


if __name__ == "__main__":
    main()
