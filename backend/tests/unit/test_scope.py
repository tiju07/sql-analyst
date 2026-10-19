import pytest

from app.sql.scope import scope_token


def test_all_states_is_explicit_star() -> None:
    assert scope_token(None, "k").startswith("*.")


def test_states_sorted_and_deduped() -> None:
    assert scope_token(["SP", "RJ", "SP"], "k").split(".")[0] == "RJ,SP"


def test_signature_depends_on_key() -> None:
    assert scope_token(["SP"], "a") != scope_token(["SP"], "b")


@pytest.mark.parametrize("bad", [[], ["sp"], ["SP,RJ"], ["S.P"], ["*"], ["SPX"]])
def test_rejects_malformed(bad: list[str]) -> None:
    with pytest.raises(ValueError, match="invalid state scope"):
        scope_token(bad, "k")
