#!/usr/bin/env bash
# Scripted session against a running stack: demo login, one streamed answer, one clarification.
# Usage: scripts/curl_demo.sh [base_url] [question]
set -euo pipefail
BASE="${1:-http://localhost:8080}"
Q="${2:-Which 5 states had the highest revenue?}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

curl -sf -c "$JAR" -X POST "$BASE/api/auth/demo/analyst" -o /dev/null
echo "== Streaming: $Q"
curl -sN -b "$JAR" -X POST "$BASE/api/chat" -H 'content-type: application/json' \
  -d "$(printf '{"question": %s}' "$(printf '%s' "$Q" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')")"

echo; echo "== Clarification flow"
OUT="$(curl -sN -b "$JAR" -X POST "$BASE/api/chat" -H 'content-type: application/json' \
  -d '{"question": "Which are our best products?"}')"
echo "$OUT" | grep -A1 '^event: clarify' || true
RUN_ID="$(echo "$OUT" | grep -m1 -o '"run_id":"[^"]*"' | cut -d'"' -f4)"
STATUS="$(echo "$OUT" | grep -A1 '^event: done' | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"
if [ "$STATUS" = "clarifying" ]; then
  curl -sN -b "$JAR" -X POST "$BASE/api/runs/$RUN_ID/clarify" -H 'content-type: application/json' \
    -d '{"answer": "Revenue"}' | grep -E '^event: (summary|done|error)' -A1
else
  echo "(the model answered without asking: status=$STATUS)"
fi
