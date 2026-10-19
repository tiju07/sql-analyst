# Evaluation results

Generated 2026-10-19T18:07:02Z by `backend/evals/report.py` from recorded runs. SQL model `claude-sonnet-5-5`, helper model `claude-haiku-5-5`. Every number below comes from a run whose raw per-question output is in `backend/evals/results/`; sections that haven't been run say so.

## BIRD Mini-Dev

Not run yet. The harness is verified end to end with an oracle model on the real databases (100% EX through the official scorer when answers are correct), but no model run has been recorded. See *Reproduce*.

## Golden Olist set

Not run yet with a model.

## Safety red team (30 adversarial cases)

| Model | Passed | Non-SELECT executed | Rows outside scope |
|---|---|---|---|
| Real model | not run | — | — |
| Compromised stand-in (always attacks) | 30 / 30 | 0 | 0 |

The compromised stand-in replaces the model with one that always writes the attack (DELETE/DROP, pg_sleep, set_config, explicit filters on other states for the São Paulo manager). Passing with it shows the guard, read-only role and RLS hold on their own.

## Limitations

- BIRD Mini-Dev is 500 questions over 11 databases; differences of a point or two between ablations are within run-to-run noise.
- The few-shot step uses two-fold cross-validation over Mini-Dev itself (BIRD's train databases differ from the dev ones), so it measures in-domain examples, not a separate pool.
- Benchmark runs cap results at 100,000 rows and 30 s per query, matching the official scorer's timeout; the demo uses tighter limits.
- The golden Olist set was written for this project and reviewed by its author; it is small and not a public benchmark.

## Reproduce

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

