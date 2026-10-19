#!/usr/bin/env bash
# Nightly logical backup of the app DB (conversations, catalog edits, verified queries) to S3.
# The Olist target DB is reloadable from the public dataset, so it isn't backed up.
# Needs: aws CLI with an instance role allowed s3:PutObject on BACKUP_S3_URI.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${BACKUP_S3_URI:?e.g. s3://my-bucket/sql-analyst}"
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
docker compose exec -T app-db pg_dump -U app -d app --format=custom --no-owner \
  | aws s3 cp - "${BACKUP_S3_URI}/app-db-${stamp}.dump" --sse AES256 --only-show-errors
echo "backup ok: ${BACKUP_S3_URI}/app-db-${stamp}.dump"
