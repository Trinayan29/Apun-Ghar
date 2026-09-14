import os

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app import auth as auth_module
from app.main import app
from app.models import User, UserProfile

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://rent:rent@localhost:5433/rent",
)

UID = "t3o-owner-1"


def claims(**kwargs):
    base = {
        "uid": UID,
        "email": "t3o-owner-1@example.com",
        "email_verified": False,
        "name": "T3O Owner",
        "aud": "demo-apun-ghar",
    }
    base.update(kwargs)
    return base


def body(**kwargs):
    base = {"display_name": "T3O Owner", "phone_number": "+911234567890"}
    base.update(kwargs)
    return base


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


@pytest.fixture()
def client(engine):
    from fastapi.testclient import TestClient

    c = TestClient(app, raise_server_exceptions=False)
    yield c
    app.dependency_overrides.clear()
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    try:
        db.query(UserProfile).filter(
            UserProfile.user_id.in_(
                db.query(User.id).filter(User.firebase_uid.like("t3o-%"))
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(User.firebase_uid.like("t3o-%")).delete()
        db.commit()
    finally:
        db.close()


def authed(client, **kwargs):
    app.dependency_overrides[auth_module.get_firebase_claims] = lambda: claims(**kwargs)
    return client


def session_for(engine):
    return sessionmaker(bind=engine)()


def user_count(engine, uid):
    db = session_for(engine)
    try:
        return db.query(User).filter(User.firebase_uid == uid).count()
    finally:
        db.close()


def profile_count(engine, uid):
    db = session_for(engine)
    try:
        return (
            db.query(UserProfile)
            .join(User, UserProfile.user_id == User.id)
            .filter(User.firebase_uid == uid)
            .count()
        )
    finally:
        db.close()


def fetch(engine, uid):
    db = session_for(engine)
    try:
        user = db.query(User).filter(User.firebase_uid == uid).one()
        return {
            "email": user.email,
            "email_verified": user.email_verified,
            "role": user.role,
            "display_name": user.display_name,
            "phone_number": user.phone_number,
        }
    finally:
        db.close()


def set_role(engine, uid, role):
    db = session_for(engine)
    try:
        db.query(User).filter(User.firebase_uid == uid).update({"role": role})
        db.commit()
    finally:
        db.close()


def test_new_owner_signup_201(client, engine):
    res = authed(client).post("/api/v1/owners/signup", json=body())
    assert res.status_code == 201
    data = res.json()
    assert data["firebase_uid"] == UID
    assert data["role"] == "OWNER"
    assert data["display_name"] == "T3O Owner"
    assert data["phone_number"] == "+911234567890"
    assert data["email"] == "t3o-owner-1@example.com"
    assert set(data) == {
        "id",
        "firebase_uid",
        "email",
        "email_verified",
        "role",
        "display_name",
        "phone_number",
        "created_at",
        "updated_at",
    }
    assert user_count(engine, UID) == 1
    assert profile_count(engine, UID) == 0


def test_repeat_owner_signup_200_idempotent(client, engine):
    c = authed(client)
    assert c.post("/api/v1/owners/signup", json=body()).status_code == 201
    res = c.post("/api/v1/owners/signup", json=body())
    assert res.status_code == 200
    assert res.json()["role"] == "OWNER"
    assert user_count(engine, UID) == 1
    assert profile_count(engine, UID) == 0


def test_missing_token_401_no_user_created(client, engine):
    res = client.post("/api/v1/owners/signup", json=body())
    assert res.status_code == 401
    assert user_count(engine, UID) == 0


def test_invalid_token_401_no_user_created(client, engine):
    res = client.post(
        "/api/v1/owners/signup",
        json=body(),
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert res.status_code == 401
    assert user_count(engine, UID) == 0


def test_existing_user_conflict_409_no_mutation(client, engine):
    c = authed(client)
    c.get("/api/v1/users/me")
    before = fetch(engine, UID)
    assert before["role"] == "USER"
    assert profile_count(engine, UID) == 1
    res = c.post("/api/v1/owners/signup", json=body())
    assert res.status_code == 409
    assert "ACCOUNT_TYPE_CONFLICT" in res.json()["detail"]
    after = fetch(engine, UID)
    assert after == before
    assert profile_count(engine, UID) == 1


def test_existing_admin_conflict_409_no_mutation(client, engine):
    c = authed(client)
    c.post("/api/v1/owners/signup", json=body())
    set_role(engine, UID, "ADMIN")
    res = c.post("/api/v1/owners/signup", json=body())
    assert res.status_code == 409
    assert "ACCOUNT_TYPE_CONFLICT" in res.json()["detail"]
    assert fetch(engine, UID)["role"] == "ADMIN"


def test_role_injection_422(client):
    res = authed(client).post(
        "/api/v1/owners/signup",
        json={**body(), "role": "OWNER"},
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "field", ["firebase_uid", "email", "id", "email_verified", "role"]
)
def test_identity_injection_422(client, field):
    res = authed(client).post(
        "/api/v1/owners/signup", json={**body(), field: "injected"}
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "phone",
    [
        "abcdefg",
        "123456",
        "+91123",
        "1" * 16,
        "+91123456789012345",
        "+91 1234567890",
        "+91-1234567890",
        "(091)1234567890",
    ],
)
def test_invalid_phone_422(client, engine, phone):
    res = authed(client).post("/api/v1/owners/signup", json=body(phone_number=phone))
    assert res.status_code == 422
    assert user_count(engine, UID) == 0


def test_blank_display_name_422(client, engine):
    res = authed(client).post("/api/v1/owners/signup", json=body(display_name="x"))
    assert res.status_code == 422
    assert user_count(engine, UID) == 0


def test_email_collision_owner_email_null(client, engine):
    authed(client, uid="t3o-user-9", email="t3o-shared@example.com").get(
        "/api/v1/users/me"
    )
    res = authed(client, uid="t3o-owner-9", email="t3o-shared@example.com").post(
        "/api/v1/owners/signup", json=body(display_name="Shared Owner")
    )
    assert res.status_code == 201
    assert res.json()["email"] is None
    assert res.json()["role"] == "OWNER"
    db = session_for(engine)
    try:
        existing = (
            db.query(User).filter(User.firebase_uid == "t3o-user-9").one()
        )
        assert existing.email == "t3o-shared@example.com"
        assert existing.role == "USER"
    finally:
        db.close()


def test_race_recovers_existing_owner(client, engine, monkeypatch):
    real_commit = Session.commit
    state = {"raised": False}

    def flaky_commit(self):
        if not state["raised"]:
            state["raised"] = True
            winner = session_for(engine)
            try:
                row = User(
                    firebase_uid="t3o-race-1",
                    email="t3o-race-1@example.com",
                    role="OWNER",
                )
                winner.add(row)
                winner.commit()
            finally:
                winner.close()
            raise IntegrityError("INSERT", {}, Exception("duplicate key"))
        return real_commit(self)

    monkeypatch.setattr(Session, "commit", flaky_commit)
    res = authed(client, uid="t3o-race-1", email="t3o-race-1@example.com").post(
        "/api/v1/owners/signup", json=body()
    )
    assert res.status_code == 200
    assert res.json()["firebase_uid"] == "t3o-race-1"
    assert user_count(engine, "t3o-race-1") == 1
    assert profile_count(engine, "t3o-race-1") == 0


def test_race_recovery_conflicting_user_returns_409(client, engine, monkeypatch):
    real_commit = Session.commit
    state = {"raised": False}

    def flaky_commit(self):
        if not state["raised"]:
            state["raised"] = True
            winner = session_for(engine)
            try:
                row = User(
                    firebase_uid="t3o-race-2",
                    email="t3o-race-2@example.com",
                )
                row.profile = UserProfile()
                winner.add(row)
                winner.commit()
            finally:
                winner.close()
            raise IntegrityError("INSERT", {}, Exception("duplicate key"))
        return real_commit(self)

    monkeypatch.setattr(Session, "commit", flaky_commit)
    res = authed(client, uid="t3o-race-2", email="t3o-race-2@example.com").post(
        "/api/v1/owners/signup", json=body()
    )
    assert res.status_code == 409
    assert "ACCOUNT_TYPE_CONFLICT" in res.json()["detail"]
    assert fetch(engine, "t3o-race-2")["role"] == "USER"
    assert user_count(engine, "t3o-race-2") == 1
    assert profile_count(engine, "t3o-race-2") == 1


def test_cors_preflight_allows_post(client):
    res = client.options(
        "/api/v1/owners/signup",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "POST" in res.headers["access-control-allow-methods"]


def test_renter_provisioning_unchanged(client, engine):
    res = authed(client, uid="t3o-renter-1", email="t3o-renter-1@example.com").get(
        "/api/v1/users/me"
    )
    assert res.status_code == 200
    assert res.json()["role"] == "USER"
    assert res.json()["phone_number"] is None
    assert user_count(engine, "t3o-renter-1") == 1
    assert profile_count(engine, "t3o-renter-1") == 1


def test_user_cannot_become_owner(client, engine):
    c = authed(client, uid="t3o-user-2", email="t3o-user-2@example.com")
    c.get("/api/v1/users/me")
    res = c.post("/api/v1/owners/signup", json=body())
    assert res.status_code == 409
    assert fetch(engine, "t3o-user-2")["role"] == "USER"
    me = c.get("/api/v1/users/me")
    assert me.status_code == 200
    assert me.json()["role"] == "USER"


def test_no_role_mutation_routes():
    from app.owners import router as owners_router
    from app.users import router as users_router

    user_paths = sorted(
        {r.path for r in users_router.routes if getattr(r, "path", None)}
    )
    assert user_paths == ["/api/v1/users/me", "/api/v1/users/me/profile"]
    owner_paths = sorted(
        {r.path for r in owners_router.routes if getattr(r, "path", None)}
    )
    assert owner_paths == ["/api/v1/owners/signup"]
