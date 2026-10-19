# Smoke subset (committed)

20 BIRD Mini-Dev questions on the `superhero` database (7 simple, 9 moderate, 4 challenging),
copied unchanged from the official release with their gold SQL and the database's description
CSVs. CI replays recorded model responses over this subset (`tests/evals/test_replay_smoke.py`),
so it exercises the real pipeline and the official scorer without calling a paid API.

Source: BIRD Mini-Dev, https://github.com/bird-bench/mini_dev (Li et al., NeurIPS 2023),
licensed CC BY-SA 4.0. This subset is redistributed under the same licence.

Record (or refresh) the responses with a real key, then commit `evals/recorded/bird_smoke.jsonl`:

    make eval-record-smoke
