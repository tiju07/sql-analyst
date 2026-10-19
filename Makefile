.PHONY: env up down logs seed smoke types test test-unit e2e e2e-stack eval-smoke eval-record-smoke lint fmt typecheck check

COMPOSE := docker compose
BACKEND := cd backend && uv run

env: ## Create .env from .env.example with random secrets (never overwrites)
	@test ! -f .env || { echo ".env already exists"; exit 1; }
	@while IFS= read -r line; do \
	  case "$$line" in *change-me*) printf '%s\n' "$${line%%change-me*}$$(openssl rand -hex 24)";; *) printf '%s\n' "$$line";; esac; \
	done < .env.example > .env
	@echo "Wrote .env. Add ANTHROPIC_API_KEY before Phase 3."

up: ## Build and start the stack, wait until healthy
	$(COMPOSE) up -d --build --wait

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

seed: ## Load Olist + RLS, seed users/connection, sync the catalog
	$(COMPOSE) run --rm --build seed python -m scripts.load_olist --data-dir /data/olist
	$(COMPOSE) run --rm seed python -m scripts.seed_users
	$(COMPOSE) run --rm seed python -m scripts.sync_catalog

smoke: ## Scripted curl session against the running stack (demo login, stream, clarification)
	scripts/curl_demo.sh

types: ## Regenerate the frontend API types from the backend OpenAPI schema
	cd backend && uv run python -m scripts.export_openapi ../frontend/lib/api/openapi.json
	cd frontend && pnpm exec openapi-typescript lib/api/openapi.json -o lib/api/schema.d.ts

# Fake LLM, generous limits, and non-Secure cookies (WebKit drops Secure cookies on http://localhost).
E2E_ENV := FAKE_LLM=true RATE_LIMIT_PER_MIN=1000 DEMO_LOGIN_PER_MIN=1000 COOKIE_SECURE=false

e2e-stack: ## Stack configured for end-to-end tests
	$(E2E_ENV) $(COMPOSE) up -d --build --wait
	$(COMPOSE) exec -T redis redis-cli FLUSHDB

e2e: e2e-stack ## Playwright on iPhone 13, Pixel 7, iPad and desktop (with axe checks)
	cd frontend && pnpm exec playwright test

eval-smoke: ## Eval harness checks + replayed 20-question BIRD smoke (no paid API calls)
	$(BACKEND) pytest tests/evals -q

eval-record-smoke: ## Record real model responses for the smoke subset (costs a few cents)
	cd backend && uv run python -m evals.bird_minidev.runner --data evals/bird_minidev/smoke/MINIDEV \
	  --ablations e_full --evidence with --llm record --recordings evals/recorded/bird_smoke.jsonl \
	  --run-id smoke-record --yes
	cd backend && python3 -c "import json; print(json.load(open('evals/results/bird/smoke-record/summary.json'))['runs'][0]['ex'])" \
	  > evals/recorded/bird_smoke.ex

test: ## All backend tests (integration tests start Postgres via testcontainers)
	$(BACKEND) pytest --cov=app --cov-report=term-missing

test-unit:
	$(BACKEND) pytest -m "not integration"

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .

fmt:
	cd backend && uv run ruff check --fix . && uv run ruff format .

typecheck:
	$(BACKEND) mypy

check: lint typecheck test
