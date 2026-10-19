"""Seed demo personas, an optional password admin, and the Olist connection. Idempotent.

Env: APP_DATABASE_URL; optional SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD for a password login.
"""

import asyncio
import os

from sqlalchemy.dialects.postgresql import insert

from app.auth.personas import PERSONAS
from app.auth.security import hash_password
from app.db import make_engine
from app.models import Connection, Role, User


async def main() -> None:
    engine = make_engine(os.environ["APP_DATABASE_URL"])
    rows = [
        {
            "email": p.email,
            "password_hash": None,
            "display_name": p.display_name,
            "role": p.role,
            "allowed_states": p.allowed_states,
            "is_demo": True,
        }
        for p in PERSONAS.values()
    ]
    if email := os.environ.get("SEED_ADMIN_EMAIL"):
        rows.append(
            {
                "email": email,
                "password_hash": hash_password(os.environ["SEED_ADMIN_PASSWORD"]),
                "display_name": "Admin",
                "role": Role.admin,
                "allowed_states": None,
                "is_demo": False,
            }
        )
    async with engine.begin() as conn:
        stmt = insert(User).values(rows)
        await conn.execute(
            stmt.on_conflict_do_update(
                index_elements=[User.email],
                set_={c: stmt.excluded[c] for c in rows[0] if c != "email"},
            )
        )
        await conn.execute(
            insert(Connection)
            .values(
                name="olist",
                dialect="postgres",
                dsn_secret_ref="TARGET_DATABASE_URL",  # noqa: S106 (env var name, not a secret)
                readonly_role="analyst_ro",
            )
            .on_conflict_do_nothing(index_elements=[Connection.name])
        )
    await engine.dispose()
    print(f"Seeded {len(rows)} users and the olist connection")


if __name__ == "__main__":
    asyncio.run(main())
