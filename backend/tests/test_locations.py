import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from app import auth as auth_module
from app.main import app
from app.models import Location

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://rent:rent@localhost:5433/rent",
)

MIN_CATALOG = [
    {"type": "college", "name": "Assam Down Town University", "city": "Guwahati"},
    {"type": "workplace", "name": "GNRC Hospital", "city": "Guwahati"},
    {"type": "area", "name": "Six Mile", "city": "Guwahati"},
]


@pytest.fixture(scope="module")
def engine():
    eng = create_engine(DATABASE_URL)
    try:
        with eng.connect():
            pass
    except Exception:
        pytest.skip("local PostgreSQL is not reachable")
    if not inspect(eng).has_table("locations"):
        pytest.skip("locations table missing: run 'alembic upgrade head' first")
    # Ensure minimal catalog rows exist for deterministic tests.
    db = sessionmaker(bind=eng)()
    try:
        for row in MIN_CATALOG:
            exists = (
                db.query(Location.id)
                .filter(
                    Location.type == row["type"], Location.name == row["name"]
                )
                .first()
            )
            if exists is None:
                db.add(Location(**row))
        db.commit()
    finally:
        db.close()
    yield eng
    eng.dispose()


@pytest.fixture()
def client(engine):
    c = TestClient(app, raise_server_exceptions=False)
    yield c
    app.dependency_overrides.clear()


def test_public_access_without_auth(client):
    res = client.get("/api/v1/locations")
    assert res.status_code == 200


def test_basic_listing_shape(client):
    res = client.get("/api/v1/locations")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    for item in body:
        assert set(item) == {"id", "type", "name", "city"}


def test_college_filtering(client):
    res = client.get("/api/v1/locations", params={"type": "college"})
    assert res.status_code == 200
    assert len(res.json()) >= 1
    assert all(r["type"] == "college" for r in res.json())


def test_workplace_filtering(client):
    res = client.get("/api/v1/locations", params={"type": "workplace"})
    assert res.status_code == 200
    assert len(res.json()) >= 1
    assert all(r["type"] == "workplace" for r in res.json())


def test_area_filtering(client):
    res = client.get("/api/v1/locations", params={"type": "area"})
    assert res.status_code == 200
    assert len(res.json()) >= 1
    assert all(r["type"] == "area" for r in res.json())


def test_name_search(client):
    res = client.get(
        "/api/v1/locations", params={"type": "college", "search": "down"}
    )
    assert res.status_code == 200
    names = [r["name"] for r in res.json()]
    assert any("Down" in n for n in names)


def test_case_insensitive_search(client):
    lower = client.get(
        "/api/v1/locations", params={"type": "college", "search": "down"}
    ).json()
    upper = client.get(
        "/api/v1/locations", params={"type": "college", "search": "DOWN"}
    ).json()
    mixed = client.get(
        "/api/v1/locations", params={"type": "college", "search": "DoWn"}
    ).json()
    assert lower == upper == mixed
    assert len(lower) >= 1


def test_city_search(client):
    res = client.get("/api/v1/locations", params={"search": "guwahati"})
    assert res.status_code == 200
    assert len(res.json()) >= 1


def test_empty_result_returns_200_empty_list(client):
    res = client.get(
        "/api/v1/locations",
        params={"type": "college", "search": "DOESNOTEXISTXYZ"},
    )
    assert res.status_code == 200
    assert res.json() == []


def test_whitespace_only_search_behaves_as_no_search(client):
    blank = client.get(
        "/api/v1/locations", params={"type": "college", "search": "   "}
    )
    plain = client.get("/api/v1/locations", params={"type": "college"})
    assert blank.status_code == 200
    assert blank.json() == plain.json()


def test_default_limit_is_20(client):
    defaulted = client.get("/api/v1/locations")
    explicit = client.get("/api/v1/locations", params={"limit": 20})
    assert defaulted.status_code == 200
    assert defaulted.json() == explicit.json()


def test_limit_one(client):
    res = client.get("/api/v1/locations", params={"limit": 1})
    assert res.status_code == 200
    assert len(res.json()) <= 1


def test_limit_max_enforced(client):
    res = client.get("/api/v1/locations", params={"limit": 51})
    assert res.status_code == 422


def test_invalid_type_422(client):
    res = client.get("/api/v1/locations", params={"type": "planet"})
    assert res.status_code == 422


def test_deterministic_ordering(client):
    first = client.get("/api/v1/locations", params={"limit": 50}).json()
    second = client.get("/api/v1/locations", params={"limit": 50}).json()
    assert first == second
    keys = [(r["name"], r["id"]) for r in first]
    assert keys == sorted(keys)


def test_does_not_require_firebase_auth(client):
    # No Authorization header and no dependency override: must still succeed.
    app.dependency_overrides.clear()
    res = client.get("/api/v1/locations", params={"type": "area"})
    assert res.status_code == 200
    # Sanity: protected route still requires auth.
    assert client.get("/api/v1/users/me").status_code == 401


def test_router_has_no_auth_dependency():
    from app.locations import router as locations_router

    for route in locations_router.routes:
        dep = getattr(route, "dependant", None)
        if dep is None:
            continue
        for sub in dep.dependencies:
            assert sub.call not in (
                auth_module.get_current_user,
                auth_module.get_firebase_claims,
            )


def test_adtu_canonical_naming(engine):
    """ADTU = Assam Down Town University; Don Bosco must not carry (ADTU)."""
    from app import seed as seed_module

    # Code-level: canonical catalog must not attach (ADTU) to Don Bosco.
    seed_names = [
        (r["type"], r["name"]) for r in seed_module.SEED_LOCATIONS
    ]
    assert ("college", "Assam Down Town University") in seed_names
    assert ("college", "Assam Don Bosco University") in seed_names
    assert not any("(ADTU)" in name for _, name in seed_names)
    # The incorrect legacy row must map to the canonical name via RENAMES.
    assert (
        seed_module.RENAMES[("college", "Assam Don Bosco University (ADTU)")]
        == "Assam Don Bosco University"
    )

    # DB-level: after seeding, each canonical institution exists exactly once,
    # so repeated seeding cannot create duplicates.
    seed_module.main()
    db = sessionmaker(bind=engine)()
    try:
        down_town = (
            db.query(Location.id)
            .filter(
                Location.type == "college",
                Location.name == "Assam Down Town University",
            )
            .all()
        )
        don_bosco = (
            db.query(Location.id)
            .filter(
                Location.type == "college",
                Location.name == "Assam Don Bosco University",
            )
            .all()
        )
        assert len(down_town) == 1
        assert len(don_bosco) == 1
    finally:
        db.close()


def test_seed_idempotent(engine):
    from app import seed as seed_module

    def snapshot():
        db = sessionmaker(bind=engine)()
        try:
            rows = (
                db.query(Location.type, Location.name)
                .filter(
                    Location.type.in_(["college", "workplace", "area"]),
                )
                .all()
            )
            seen: dict = {}
            for t, n in rows:
                seen[(t, n)] = seen.get((t, n), 0) + 1
            return seen
        finally:
            db.close()

    seed_module.main()
    before = snapshot()
    # Every canonical seed row must exist exactly once (seed owns these keys).
    for row in seed_module.SEED_LOCATIONS:
        assert before.get((row["type"], row["name"]), 0) == 1
    seed_module.main()
    after = snapshot()
    assert before == after
