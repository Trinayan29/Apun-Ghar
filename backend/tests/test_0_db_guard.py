"""Safety-guard tests: the suite must resolve to the test database."""

import os

import pytest
from sqlalchemy.engine.url import make_url

from tests.conftest import resolve_test_database_url


def test_database_url_is_not_the_development_database():
    db = make_url(os.environ["DATABASE_URL"]).database
    assert db == "rent_test", db
    assert db != "rent"


def test_dev_database_url_is_rewritten_to_test_database():
    rewritten = resolve_test_database_url(
        "postgresql+psycopg://rent:rent@localhost:5433/rent"
    )
    assert make_url(rewritten).database == "rent_test"


def test_explicit_non_dev_database_is_left_alone():
    kept = resolve_test_database_url(
        "postgresql+psycopg://rent:rent@localhost:5433/rent_ci"
    )
    assert make_url(kept).database == "rent_ci"


def test_unrewritable_dev_database_refuses_to_run(monkeypatch):
    class _DevOnly:
        database = "rent"

        def set(self, **kwargs):
            return self

    monkeypatch.setattr("tests.conftest.make_url", lambda raw: _DevOnly())
    with pytest.raises(RuntimeError, match="development database"):
        resolve_test_database_url("postgresql+psycopg://x/y/rent")
