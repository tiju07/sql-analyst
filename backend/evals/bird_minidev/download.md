# Getting BIRD Mini-Dev

The SQLite version (500 questions, 11 databases, ~800 MB zipped) comes from the BIRD team's own
mirror, linked from https://github.com/bird-bench/mini_dev:

```bash
mkdir -p data/bird && cd data/bird
curl -L -o minidev.zip https://bird-bench.oss-cn-beijing.aliyuncs.com/minidev.zip
unzip -q minidev.zip -d extracted
# questions: extracted/minidev/MINIDEV/mini_dev_sqlite.json
# gold SQL:  extracted/minidev/MINIDEV/mini_dev_sqlite_gold.sql
# databases: extracted/minidev/MINIDEV/dev_databases/<db_id>/<db_id>.sqlite
```

The data is CC BY-SA 4.0 (BIRD, Li et al., NeurIPS 2023) and is git-ignored here. Each database
folder's `database_description/*.csv` is loaded into the catalog as human-written column
descriptions.
