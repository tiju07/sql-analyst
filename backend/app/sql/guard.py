"""Deterministic SQL safety policy. No LLM involved.

The guard parses with sqlglot, rejects anything that isn't a single read-only SELECT over
catalogued tables, caps LIMIT, and returns SQL *re-rendered from the validated AST*. Executing
the re-rendered text (not the model's text) means a parser differential between sqlglot and the
database can't smuggle in something the guard never saw. The DB role and RLS remain the
backstop if this module has a bug.
"""

from dataclasses import dataclass
from typing import Literal

import sqlglot
from sqlglot import expressions as exp
from sqlglot.errors import ParseError

from app.sql.dialects import Dialect

GuardCode = Literal["parse_error", "unsafe", "unknown_table"]

# Anything that writes, changes session state, or isn't a query at all.
_FORBIDDEN_NODES: tuple[type[exp.Expression], ...] = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Merge,
    exp.Create,
    exp.Drop,
    exp.Alter,
    exp.TruncateTable,
    exp.Copy,
    exp.Command,  # sqlglot's fallback for EXPLAIN, DO, CALL, VACUUM, ...
    exp.Set,
    exp.Grant,
    exp.Revoke,
    exp.Pragma,
    exp.Transaction,
    exp.Commit,
    exp.Use,
    exp.Attach,
    exp.Detach,
    exp.Analyze,
    exp.Into,  # SELECT ... INTO creates a table
    exp.Lock,  # FOR UPDATE / FOR SHARE
)

_DENIED_FUNCTIONS = frozenset(
    {
        "current_setting",
        "set_config",  # read/alter the RLS scope
        "version",
        "current_version",
        "nextval",
        "setval",
        "currval",
        "lastval",
        "ts_stat",  # executes a query string
        "load_extension",
        "readfile",
        "writefile",
        "edit",
        "fts3_tokenizer",  # sqlite
    }
)
_DENIED_PREFIXES = (
    "pg_",  # pg_sleep, pg_read_file, pg_ls_dir, pg_terminate_backend, pg_advisory_lock, ...
    "lo_",
    "dblink",
    "txid_",
    "inet_",
    # query_to_xml & friends execute arbitrary SQL text the guard never parsed.
    "query_to_xml",
    "table_to_xml",
    "cursor_to_xml",
    "schema_to_xml",
    "database_to_xml",
)


@dataclass(frozen=True)
class GuardResult:
    ok: bool
    sql: str | None = None
    code: GuardCode | None = None
    message: str | None = None
    tables: tuple[str, ...] = ()
    # True when the guard added or lowered LIMIT, so a full page means "maybe more rows".
    limited: bool = False

    @property
    def repairable(self) -> bool:
        """Parse errors and unknown tables are model mistakes worth a repair attempt."""
        return self.code in ("parse_error", "unknown_table")


def _reject(code: GuardCode, message: str) -> GuardResult:
    return GuardResult(ok=False, code=code, message=message)


def _function_names(node: exp.Func, dialect: Dialect) -> set[str]:
    # sqlglot normalises known functions (version() -> CurrentVersion); check every spelling.
    names = {node.sql_name().lower()}
    if isinstance(node, exp.Anonymous):
        names.add(node.name.lower())
    rendered = node.sql(dialect=dialect.value)
    names.add(rendered.split("(", 1)[0].strip().strip('"').lower())
    return names


def _is_denied(name: str) -> bool:
    return name in _DENIED_FUNCTIONS or name.startswith(_DENIED_PREFIXES)


def _apply_limit(root: exp.Query, row_limit: int) -> bool:
    limit = root.args.get("limit")
    if limit is None:
        root.set("limit", exp.Limit(expression=exp.Literal.number(row_limit)))
        return True
    value = limit.expression
    if isinstance(value, exp.Literal) and value.is_int and int(value.this) <= row_limit:
        return False
    # Too large, or not a plain integer (an expression, a parameter): replace it.
    limit.set("expression", exp.Literal.number(row_limit))
    return True


def guard(
    sql: str,
    *,
    dialect: Dialect,
    allowed_tables: frozenset[str],
    default_schema: str | None,
    row_limit: int,
) -> GuardResult:
    """Validate `sql`. `allowed_tables` holds lowercase "schema.table" (or "table") names."""
    try:
        statements = [s for s in sqlglot.parse(sql, read=dialect.value) if s is not None]
    except ParseError as e:
        return _reject("parse_error", f"SQL could not be parsed: {e.errors[0]['description']}")
    if len(statements) != 1:
        return _reject("unsafe", f"Exactly one statement is allowed, got {len(statements)}.")
    root = statements[0]

    if not isinstance(root, (exp.Select, exp.Union, exp.Intersect, exp.Except)):
        return _reject("unsafe", f"Only SELECT queries are allowed, got {root.key.upper()}.")

    for node in root.walk():
        if isinstance(node, _FORBIDDEN_NODES):
            return _reject("unsafe", f"{node.key.upper()} is not allowed in a read-only query.")
        if isinstance(node, exp.Func):
            if isinstance(node.parent, exp.Dot):
                return _reject("unsafe", "Schema-qualified function calls are not allowed.")
            for name in _function_names(node, dialect):
                if _is_denied(name):
                    return _reject("unsafe", f"Function {name}() is not allowed.")

    cte_names = {cte.alias_or_name.lower() for cte in root.find_all(exp.CTE)}
    tables: set[str] = set()
    for table in root.find_all(exp.Table):
        if not table.name:  # table-valued function, e.g. generate_series(); checked above
            continue
        name = table.name.lower()
        if not table.db and name in cte_names:
            continue
        if table.catalog:
            return _reject("unsafe", "Cross-database references are not allowed.")
        if not table.db and default_schema:
            # Qualify in the AST so execution never depends on the role's search_path.
            table.set("db", exp.to_identifier(default_schema))
        schema = table.db.lower()
        qualified = f"{schema}.{name}" if schema else name
        if qualified not in allowed_tables:
            return _reject("unknown_table", f"Table {qualified} does not exist or is not allowed.")
        tables.add(qualified)

    limited = _apply_limit(root, row_limit)
    return GuardResult(
        ok=True,
        sql=root.sql(dialect=dialect.value, pretty=True, comments=False),
        tables=tuple(sorted(tables)),
        limited=limited,
    )
