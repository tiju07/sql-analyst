from enum import StrEnum


class Dialect(StrEnum):
    """Dialects the agent supports. Values double as sqlglot dialect names."""

    postgres = "postgres"
    sqlite = "sqlite"
