import os
import subprocess
import sys
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://rent:rent@localhost:5433/rent",
)
TEST_DB_NAME = "rent_test_2b"

EXPECTED_TABLES = {
    "amenities": [
        "id", "slug", "label", "category", "icon_slug", "is_active",
        "created_at", "updated_at",
    ],
    "properties": [
        "id", "owner_user_id", "property_type", "address_line", "locality",
        "area_location_id", "city", "pincode", "gate_closing_time",
        "is_independent", "latitude", "longitude", "nearest_college_id",
        "nearest_workplace_id", "total_floors", "built_year", "created_at",
        "updated_at",
    ],
    "rental_units": [
        "id", "property_id", "unit_type", "occupancy_type", "capacity",
        "sharing", "furnishing", "gender_scope", "bathrooms", "floor_number",
        "carpet_area_sqft", "couple_friendly", "visitors_allowed",
        "pets_allowed", "smoking_allowed", "alcohol_allowed", "house_rules",
        "created_at", "updated_at",
    ],
    "rental_unit_amenities": ["rental_unit_id", "amenity_id"],
    "listings": [
        "id", "rental_unit_id", "title", "description", "rent_basis",
        "status", "availability_status", "available_from", "created_at",
        "updated_at",
    ],
    "listing_price_components": [
        "id", "listing_id", "charge_type", "label", "calculation_basis",
        "billing_frequency", "variability", "amount_paise",
        "rate_paise_per_unit", "consumption_unit", "mandatory",
        "included_in_advertised", "refundable", "payment_timing",
        "display_order",
    ],
    "listing_photos": [
        "id", "listing_id", "storage_key", "mime", "width", "height",
        "display_order", "is_cover", "upload_status", "media_type",
    ],
}

RESERVED_COLUMNS_REMOVED = [
    "minimum_stay_months", "notice_period_days",
    "verification_status", "moderation_notes",
]


def _test_db_url() -> str:
    return DATABASE_URL.rsplit("/", 1)[0] + "/" + TEST_DB_NAME


@pytest.fixture(scope="module")
def test_db_url():
    original = os.environ.get("DATABASE_URL")
    try:
        admin = create_engine(DATABASE_URL, isolation_level="AUTOCOMMIT")
        try:
            with admin.connect():
                pass
        except OperationalError:
            pytest.skip("local PostgreSQL is not reachable")
        try:
            with admin.connect() as conn:
                conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}" WITH (FORCE)'))
        except Exception as exc:
            pytest.skip(f"cannot manage test database {TEST_DB_NAME}: {exc}")
        try:
            with admin.connect() as conn:
                conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
        except Exception as exc:
            pytest.skip(f"cannot create test database {TEST_DB_NAME}: {exc}")
        admin.dispose()

        url = _test_db_url()
        os.environ["DATABASE_URL"] = url
        upgrade_head(url)
        yield url
    finally:
        if original is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = original
        admin = create_engine(DATABASE_URL, isolation_level="AUTOCOMMIT")
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}" WITH (FORCE)'))
        admin.dispose()


def _alembic_config(url: str) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    os.environ["DATABASE_URL"] = url
    return cfg


def upgrade_head(url: str) -> None:
    command.upgrade(_alembic_config(url), "head")


def downgrade(url: str, revision: str) -> None:
    command.downgrade(_alembic_config(url), revision)


def _version(url: str) -> list[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return list(conn.execute(text("SELECT version_num FROM alembic_version")).scalars())
    finally:
        engine.dispose()


def _heads(url: str) -> set[str]:
    return set(ScriptDirectory.from_config(_alembic_config(url)).get_heads())


def _tables(url: str) -> set[str]:
    return set(inspect(create_engine(url)).get_table_names())


def _columns(url: str, table: str) -> list[str]:
    return [c["name"] for c in inspect(create_engine(url)).get_columns(table)]


def _amenity_count(url: str) -> int:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return conn.execute(text("SELECT count(*) FROM amenities")).scalar()
    finally:
        engine.dispose()


def test_single_head_and_upgrade_reaches_0012(test_db_url):
    assert _heads(test_db_url) == {"0012"}
    upgrade_head(test_db_url)
    assert _version(test_db_url) == ["0012"]


def test_all_tables_and_columns_exist_at_head(test_db_url):
    upgrade_head(test_db_url)
    tables = _tables(test_db_url)
    for table, cols in EXPECTED_TABLES.items():
        assert table in tables, f"missing table {table}"
        actual = _columns(test_db_url, table)
        for col in cols:
            assert col in actual, f"missing column {table}.{col}"


def test_listings_has_no_reserved_columns(test_db_url):
    upgrade_head(test_db_url)
    listing_cols = set(_columns(test_db_url, "listings"))
    for col in RESERVED_COLUMNS_REMOVED:
        assert col not in listing_cols, f"reserved column {col} must not exist"


def test_amenity_seed_data_present(test_db_url):
    upgrade_head(test_db_url)
    assert _amenity_count(test_db_url) == 13


def test_round_trip_downgrade_to_0006_and_upgrade(test_db_url):
    upgrade_head(test_db_url)
    downgrade(test_db_url, "0006")
    assert _version(test_db_url) == ["0006"]
    tables = _tables(test_db_url)
    for table in EXPECTED_TABLES:
        assert table not in tables, f"table {table} should be gone at 0006"
    upgrade_head(test_db_url)
    assert _version(test_db_url) == ["0012"]


def test_seed_script_idempotent(test_db_url):
    upgrade_head(test_db_url)
    env = os.environ.copy()
    env["DATABASE_URL"] = test_db_url
    for _ in range(2):
        result = subprocess.run(
            [sys.executable, "-m", "app.seed"],
            cwd=str(BACKEND_DIR),
            env=env,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr
    assert _amenity_count(test_db_url) == 13