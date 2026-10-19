.PHONY: env up down logs seed test test-unit lint fmt typecheck check

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
