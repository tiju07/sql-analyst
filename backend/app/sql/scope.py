"""Signed RLS scope for the target DB (see scripts/sql/olist_security.sql)."""

import hashlib
import hmac
import re

ALL_STATES = "*"
_STATE = re.compile(r"[A-Z]{2}")


def scope_token(allowed_states: list[str] | None, key: str) -> str:
    """Value for `SET LOCAL app.allowed_states`. None means every state (explicit "*")."""
    if allowed_states is None:
        states = ALL_STATES
    else:
        # Reject anything that could smuggle a separator; an empty list grants nothing.
        if not allowed_states or not all(_STATE.fullmatch(s) for s in allowed_states):
            raise ValueError(f"invalid state scope: {allowed_states!r}")
        states = ",".join(sorted(set(allowed_states)))
    sig = hmac.new(key.encode(), states.encode(), hashlib.sha256).hexdigest()
    return f"{states}.{sig}"
