"""The BIRD harness end to end on a synthetic database in the official layout, scored by the
vendored official scripts. An oracle LLM answers with gold SQL, so the expected numbers are exact."""

import argparse
import json
import sqlite3
from pathlib import Path

import pytest

from app.runtime import Runtime
from evals.bird_minidev.runner import load_questions, run
from evals.oracle import OracleLLM

pytestmark = pytest.mark.integration

QUESTIONS = [
    ("simple", "How many heroes are there?", "SELECT COUNT(*) FROM hero"),
    (
        "simple",
        "List the names of heroes from Gotham.",
        "SELECT name FROM hero WHERE city = 'Gotham'",
    ),
    (
        "moderate",
        "Which publisher has the most heroes?",
        "SELECT p.name FROM hero h JOIN publisher p ON p.id = h.publisher_id GROUP BY p.name ORDER BY COUNT(*) DESC LIMIT 1",
    ),
    (
        "moderate",
        "What is the average power of DC heroes?",
        "SELECT AVG(h.power) FROM hero h JOIN publisher p ON p.id = h.publisher_id WHERE p.name = 'DC'",
    ),
    (
        "challenging",
        "What share of heroes have power above 50?",
        "SELECT CAST(SUM(power > 50) AS REAL) / COUNT(*) FROM hero",
    ),
    (
        "challenging",
        "Name the strongest hero of each publisher.",
        "SELECT p.name, h.name FROM hero h JOIN publisher p ON p.id = h.publisher_id WHERE h.power = (SELECT MAX(power) FROM hero h2 WHERE h2.publisher_id = h.publisher_id)",
    ),
]


@pytest.fixture
def minidev(tmp_path: Path) -> Path:
    root = tmp_path / "MINIDEV"
    db_dir = root / "dev_databases" / "heroes"
    (db_dir / "database_description").mkdir(parents=True)
    with sqlite3.connect(db_dir / "heroes.sqlite") as db:
        db.executescript(
            """
            CREATE TABLE publisher (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE hero (id INTEGER PRIMARY KEY, name TEXT, city TEXT, power INTEGER,
                               publisher_id INTEGER REFERENCES publisher(id));
            INSERT INTO publisher VALUES (1, 'DC'), (2, 'Marvel');
            INSERT INTO hero VALUES (1, 'Batman', 'Gotham', 40, 1), (2, 'Robin', 'Gotham', 20, 1),
              (3, 'Superman', 'Metropolis', 100, 1), (4, 'Thor', 'Asgard', 95, 2),
              (5, 'Hawkeye', 'New York', 30, 2);
            """
        )
    (db_dir / "database_description" / "hero.csv").write_text(
        "original_column_name,column_name,column_description,data_format,value_description\n"
        "power,,strength score from 0 to 100,integer,\n"
    )
    raw = [
        {
            "question_id": i,
            "db_id": "heroes",
            "question": q,
            "evidence": "",
            "SQL": sql,
            "difficulty": d,
        }
        for i, (d, q, sql) in enumerate(QUESTIONS)
    ]
    (root / "mini_dev_sqlite.json").write_text(json.dumps(raw))
    (root / "mini_dev_sqlite_gold.sql").write_text(
        "".join(f"{sql}\theroes\n" for _, _, sql in QUESTIONS)
    )
    return root


def args(data: Path, ablations: str, run_id: str) -> argparse.Namespace:
    return argparse.Namespace(
        data=data, ablations=ablations, evidence="without", limit=None, db=None, concurrency=3,
        run_id=run_id, resume=False, llm="real", recordings=None, estimate_only=False, yes=True,
    )  # fmt: skip


async def test_oracle_scores_exactly_through_official_scorer(
    rt: Runtime, minidev: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("evals.bird_minidev.runner.RESULTS_DIR", tmp_path / "results")
    gold = {q.question: q.gold for q in load_questions(minidev)}
    broken = frozenset({QUESTIONS[2][1]})  # a moderate question: wrong first, fixed by repair
    summary = await run(
        args(minidev, "a_full_schema,e_full", f"test-{tmp_path.name}"),
        llm_override=OracleLLM(gold, break_first=broken),
        settings=rt.settings,
    )
    runs = {r["ablation"]: r for r in summary["runs"]}
    a, e = runs["a_full_schema"], runs["e_full"]
    assert a["ex_source"] == "official" and e["ex_source"] == "official"
    assert a["ex"] == pytest.approx(5 / 6, abs=1e-4)  # no repair: the broken query stays wrong
    assert a["by_difficulty"]["moderate"] == pytest.approx(0.5, abs=1e-4)
    assert e["ex"] == pytest.approx(1.0)  # repair fixes it
    assert e["soft_f1"] == pytest.approx(1.0)
    assert a["ex_per_question_check"] == pytest.approx(a["ex"], abs=1e-4)
    assert e["statuses"] == {"ok": 5, "repaired": 1}


async def test_estimate_only_spends_nothing(rt: Runtime, minidev: Path) -> None:
    ns = args(minidev, "all", "estimate")
    ns.estimate_only = True
    out = await run(ns, settings=rt.settings)
    assert out["estimate_usd"] > 0
