from dataclasses import dataclass

from app.models import Role


@dataclass(frozen=True)
class Persona:
    key: str
    email: str
    display_name: str
    role: Role
    allowed_states: list[str] | None  # None = all states
    blurb: str


PERSONAS: dict[str, Persona] = {
    p.key: p
    for p in (
        Persona(
            "admin",
            "admin@demo.sql-analyst.dev",
            "Ana Admin",
            Role.admin,
            None,
            "All states. Can edit the catalog and metrics and approve verified queries.",
        ),
        Persona(
            "analyst",
            "analyst@demo.sql-analyst.dev",
            "Bruno Analyst",
            Role.analyst,
            None,
            "All states. Read-only catalog.",
        ),
        Persona(
            "regional",
            "regional-sp@demo.sql-analyst.dev",
            "Carla Regional (SP)",
            Role.regional,
            ["SP"],
            "Only customers in São Paulo (SP), enforced by the database whatever SQL runs.",
        ),
    )
}
