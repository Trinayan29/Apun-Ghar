"""Force every database test onto the dedicated test database.

Automated tests must never touch the development database (`rent`): they
insert, mutate, and delete rows as part of normal setup/teardown. This
module runs before any test module in this directory, so setting
`DATABASE_URL` here takes effect before the per-file
`os.getenv("DATABASE_URL", ...)` defaults are evaluated.

Safety guard: if the resolved database is still the development database,
collection fails loudly instead of running.
"""

import os

from sqlalchemy.engine.url import make_url

DEV_DB_NAME = "rent"
TEST_DB_NAME = "rent_test"
_FALLBACK_URL = "postgresql+psycopg://rent:rent@localhost:5433/rent"


def resolve_test_database_url(raw: str | None = None) -> str:
    """Return the URL tests must use; never the development database."""
    url = make_url(raw or os.getenv("DATABASE_URL", _FALLBACK_URL))
    if url.database == DEV_DB_NAME:
        url = url.set(database=TEST_DB_NAME)
    if url.database == DEV_DB_NAME:
        raise RuntimeError(
            "Refusing to run database tests against the development "
            f"database {DEV_DB_NAME!r}. Set DATABASE_URL to the dedicated "
            f"test database ({TEST_DB_NAME!r})."
        )
    # NOTE: str(url) masks the password as "***" — render it explicitly.
    return url.render_as_string(hide_password=False)


os.environ["DATABASE_URL"] = resolve_test_database_url()
