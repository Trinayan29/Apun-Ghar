import os

import pytest
from fastapi import Depends, FastAPI
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from app import auth as auth_module
from app.main import app
from app.models import User

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://rent:rent@localhost:5433/rent",
)

UID = "t2d-user-1"


def claims(**kwargs):
    base = {"uid": UID, "email": "t2d-user-1@example.com", "email_verified": False}
    base.update(kwargs)
    return base


probe = FastAPI()


@probe.get("/owner-only")
def owner_only(user: User = Depends(auth_module.require_role("OWNER"))):
    return {"role": user.role}


@probe.get("/admin-only")
def admin_only(user: User = Depends(auth_module.require_role("ADMIN"))):
    return {"role": user.role}


@pytest.fixture(scope="module")
def engine():
    eng = create_engine(DATABASE_URL)
    try:
        with eng.connect():
            pass
    except Exception:
        pytest.skip("local PostgreSQL is not reachable")
    if not inspect(eng).has_table("users"):
        pytest.skip("users table missing: run 'alembic upgrade head' first")
    yield eng
    eng.dispose()


def clean(engine):
    from app.models import UserProfile

    db = sessionmaker(bind=engine)()
    try:
        db.query(UserProfile).filter(
            UserProfile.user_id.in_(
                db.query(User.id).filter(User.firebase_uid.like("t2d-%"))
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(User.firebase_uid.like("t2d-%")).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def client(engine):
    from fastapi.testclient import TestClient

    c = TestClient(app, raise_server_exceptions=False)
    yield c
    app.dependency_overrides.clear()
    clean(engine)


@pytest.fixture()
def role_client(engine):
    from fastapi.testclient import TestClient

    c = TestClient(probe, raise_server_exceptions=False)
    yield c
    probe.dependency_overrides.clear()
    clean(engine)


def authed(target, **kwargs):
    app.dependency_overrides[auth_module.get_firebase_claims] = lambda: claims(
        **kwargs
    )
    return target


def authed_probe(target, **kwargs):
    probe.dependency_overrides[auth_module.get_firebase_claims] = lambda: claims(
        **kwargs
    )
    return target


def set_role(engine, uid, role):
    db = sessionmaker(bind=engine)()
    try:
        db.query(User).filter(User.firebase_uid == uid).update({"role": role})
        db.commit()
    finally:
        db.close()


def test_unauthenticated_get_profile_401(client):
    assert client.get("/api/v1/users/me/profile").status_code == 401


def test_unauthenticated_patch_profile_401(client):
    res = client.patch("/api/v1/users/me/profile", json={"college": "X"})
    assert res.status_code == 401


def test_get_own_profile(client):
    res = authed(client).get("/api/v1/users/me/profile")
    assert res.status_code == 200
    assert set(res.json()) == {
        "college",
        "workplace",
        "budget_min",
        "budget_max",
        "move_in_date",
        "created_at",
        "updated_at",
    }


def test_profile_data_correct(client):
    c = authed(client)
    c.patch(
        "/api/v1/users/me/profile",
        json={"college": "Test College", "budget_min": 5000, "budget_max": 8000},
    )
    body = c.get("/api/v1/users/me/profile").json()
    assert body["college"] == "Test College"
    assert body["budget_min"] == 5000
    assert body["budget_max"] == 8000
    assert body["workplace"] is None


def test_patch_one_field(client):
    res = authed(client).patch(
        "/api/v1/users/me/profile", json={"workplace": "Test Office"}
    )
    assert res.status_code == 200
    assert res.json()["workplace"] == "Test Office"


def test_patch_multiple_fields(client):
    res = authed(client).patch(
        "/api/v1/users/me/profile",
        json={"college": "A", "workplace": "B", "move_in_date": "2026-10-01"},
    )
    assert res.status_code == 200
    body = res.json()
    assert (body["college"], body["workplace"], body["move_in_date"]) == (
        "A",
        "B",
        "2026-10-01",
    )


def test_omitted_fields_unchanged(client):
    c = authed(client)
    c.patch("/api/v1/users/me/profile", json={"college": "Keep Me"})
    body = c.patch("/api/v1/users/me/profile", json={"budget_min": 7000}).json()
    assert body["college"] == "Keep Me"
    assert body["budget_min"] == 7000


def test_explicit_null_clears_field(client):
    c = authed(client)
    c.patch("/api/v1/users/me/profile", json={"college": "Temp"})
    body = c.patch("/api/v1/users/me/profile", json={"college": None}).json()
    assert body["college"] is None


def test_negative_budget_rejected(client):
    res = authed(client).patch(
        "/api/v1/users/me/profile", json={"budget_min": -100}
    )
    assert res.status_code == 422


def test_min_above_max_rejected(client):
    res = authed(client).patch(
        "/api/v1/users/me/profile", json={"budget_min": 9000, "budget_max": 5000}
    )
    assert res.status_code == 422


def test_effective_range_violation_rejected(client):
    c = authed(client)
    c.patch("/api/v1/users/me/profile", json={"budget_min": 9000})
    res = c.patch("/api/v1/users/me/profile", json={"budget_max": 5000})
    assert res.status_code == 422
    assert c.get("/api/v1/users/me/profile").json()["budget_max"] is None


def test_valid_range_accepted(client):
    res = authed(client).patch(
        "/api/v1/users/me/profile", json={"budget_min": 5000, "budget_max": 9000}
    )
    assert res.status_code == 200


def test_patch_cannot_change_role(client, engine):
    c = authed(client)
    c.get("/api/v1/users/me")
    res = c.patch("/api/v1/users/me/profile", json={"role": "ADMIN"})
    assert res.status_code == 422
    db = sessionmaker(bind=engine)()
    try:
        assert db.query(User).filter(User.firebase_uid == UID).one().role == "STUDENT"
    finally:
        db.close()


def test_patch_cannot_change_identity_fields(client, engine):
    c = authed(client)
    c.get("/api/v1/users/me")
    for body in (
        {"email": "evil@example.com"},
        {"firebase_uid": "t2d-impostor"},
        {"email_verified": True},
    ):
        assert c.patch("/api/v1/users/me/profile", json=body).status_code == 422
    db = sessionmaker(bind=engine)()
    try:
        row = db.query(User).filter(User.firebase_uid == UID).one()
        assert row.email == "t2d-user-1@example.com"
        assert row.email_verified is False
    finally:
        db.close()


def test_users_are_isolated(client):
    authed(client)
    client.patch("/api/v1/users/me/profile", json={"college": "College A"})
    authed(client, uid="t2d-user-2", email="t2d-user-2@example.com")
    client.patch("/api/v1/users/me/profile", json={"college": "College B"})
    authed(client)
    assert client.get("/api/v1/users/me/profile").json()["college"] == "College A"
    authed(client, uid="t2d-user-2", email="t2d-user-2@example.com")
    assert client.get("/api/v1/users/me/profile").json()["college"] == "College B"


def test_no_user_id_based_profile_route(client):
    from app.users import router as users_router

    full = sorted(
        {r.path for r in users_router.routes if getattr(r, "path", None)}
    )
    assert full == ["/api/v1/users/me", "/api/v1/users/me/profile"]
    assert not any("{user" in p for p in full)


def test_student_rejected_by_owner_route(role_client):
    res = authed_probe(role_client).get("/owner-only")
    assert res.status_code == 403


def test_owner_accepted_by_owner_route(role_client, engine):
    authed_probe(role_client, uid="t2d-owner-1", email="t2d-owner-1@example.com").get(
        "/owner-only"
    )
    set_role(engine, "t2d-owner-1", "OWNER")
    res = authed_probe(role_client, uid="t2d-owner-1", email="t2d-owner-1@example.com").get(
        "/owner-only"
    )
    assert res.status_code == 200
    assert res.json() == {"role": "OWNER"}


def test_admin_accepted_by_admin_route(role_client, engine):
    authed_probe(role_client, uid="t2d-admin-1", email="t2d-admin-1@example.com").get(
        "/owner-only"
    )
    set_role(engine, "t2d-admin-1", "ADMIN")
    res = authed_probe(role_client, uid="t2d-admin-1", email="t2d-admin-1@example.com").get(
        "/admin-only"
    )
    assert res.status_code == 200
    assert res.json() == {"role": "ADMIN"}


def test_owner_rejected_by_admin_route(role_client, engine):
    authed_probe(role_client, uid="t2d-owner-2", email="t2d-owner-2@example.com").get(
        "/owner-only"
    )
    set_role(engine, "t2d-owner-2", "OWNER")
    res = authed_probe(role_client, uid="t2d-owner-2", email="t2d-owner-2@example.com").get(
        "/admin-only"
    )
    assert res.status_code == 403


def test_unauthenticated_role_route_401(role_client):
    assert role_client.get("/owner-only").status_code == 401
