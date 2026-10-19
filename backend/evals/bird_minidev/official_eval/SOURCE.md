# Official BIRD Mini-Dev evaluation code (vendored, unmodified)

- Source: https://github.com/bird-bench/mini_dev, directory `evaluation/`
- Commit: abd11b6db92a1c9f809b32f7564c7c71b34d67f0 (2026-09-05)
- Files: `evaluation_ex.py` (execution accuracy), `evaluation_f1.py` (soft F1), `evaluation_utils.py`
- Licence: the repository is published under Creative Commons Attribution-ShareAlike 4.0
  (CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/), as stated in its README.
  These files are redistributed unchanged under that licence, with attribution to the BIRD team
  (Li et al., "Can LLM Already Serve as A Database Interface? A BIg Bench for Large-Scale
  Database Grounded Text-to-SQLs", NeurIPS 2023).

The runner calls these scripts as subprocesses with their documented arguments, so headline
EX and soft-F1 numbers come from the benchmark's own code. Do not edit them; if a fix is needed,
re-vendor from upstream and update the commit above.

Their `evaluation_utils.py` imports `psycopg2` and `pymysql` at module level even for SQLite,
so the `evals` dependency group installs both (plus `func-timeout`).
