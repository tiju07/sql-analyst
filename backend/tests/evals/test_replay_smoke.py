"""20-question BIRD smoke eval replayed from recorded model responses (no paid API calls)."""

import argparse
from pathlib import Path

import pytest

from app.runtime import Runtime
from evals.bird_minidev.runner import run

pytestmark = pytest.mark.integration

ROOT = Path(__file__).resolve().parents[2]
SMOKE = ROOT / "evals" / "bird_minidev" / "smoke" / "MINIDEV"
RECORDINGS = ROOT / "evals" / "recorded" / "bird_smoke.jsonl"


@pytest.mark.skipif(
    not RECORDINGS.exists(), reason="no recordings yet: run `make eval-record-smoke`"
)
async def test_replayed_smoke_eval(
    rt: Runtime, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("evals.bird_minidev.runner.RESULTS_DIR", tmp_path)
    args = argparse.Namespace(
        data=SMOKE, ablations="e_full", evidence="with", limit=None, db=None, concurrency=4,
        run_id="smoke", resume=False, llm="replay", recordings=RECORDINGS, estimate_only=False, yes=True,
    )  # fmt: skip
    summary = await run(args, settings=rt.settings)
    full = summary["runs"][0]
    assert full["n"] == 20
    assert full["ex_source"] == "official"
    # Replaying the same responses must reproduce the recorded accuracy exactly.
    expected = float((RECORDINGS.with_suffix(".ex")).read_text())
    assert full["ex"] == pytest.approx(expected, abs=1e-6)
