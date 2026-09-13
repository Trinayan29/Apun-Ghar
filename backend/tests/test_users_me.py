import os

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session, sessionmaker

from app import auth as auth_module
from app.main import app
from app.models import User, UserProfile

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://rent:rent@localhost:5433/rent",
)

UID = "t2c-user-1"


def claims(**kwargs):
    base = {
        "uid": UID,
        "email": "t2c-user-1@example.com",
        "email_verified": False,
        "name": "T2C User",
        "aud": "demo-apun-ghar",
        "extra_secret": "must-never-leak",
    }
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
                db.query(User.id).filter(User.firebase_uid.like("t2c-%"))
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(User.firebase_uid.like("t2c-%")).delete()
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
        }
    finally:
        db.close()


def test_unauthenticated_returns_401_no_user_created(client, engine):
    res = client.get("/api/v1/users/me")
    assert res.status_code == 401
    assert user_count(engine, UID) == 0


def test_first_login_creates_user_and_profile(client, engine):
    res = authed(client).get("/api/v1/users/me")
    assert res.status_code == 200
    body = res.json()
    assert body["firebase_uid"] == UID
    assert body["role"] == "USER"
    assert body["email"] == "t2c-user-1@example.com"
    assert set(body) == {
        "id",
        "firebase_uid",
        "email",
        "email_verified",
        "role",
        "display_name",
        "created_at",
        "updated_at",
    }
    assert user_count(engine, UID) == 1
    assert profile_count(engine, UID) == 1


def test_repeat_login_reuses_user(client, engine):
    c = authed(client)
    c.get("/api/v1/users/me")
    res = c.get("/api/v1/users/me")
    assert res.status_code == 200
    assert user_count(engine, UID) == 1
    assert profile_count(engine, UID) == 1


def test_email_sync_and_display_name_policy(client, engine):
    c = authed(client)
    c.get("/api/v1/users/me")
    assert fetch(engine, UID)["display_name"] == "T2C User"
    res = authed(
        client, email="t2c-new@example.com", email_verified=True, name="Changed"
    ).get("/api/v1/users/me")
    assert res.status_code == 200
    state = fetch(engine, UID)
    assert state["email"] == "t2c-new@example.com"
    assert state["email_verified"] is True
    assert state["display_name"] == "T2C User"


def test_uid_is_identity_key_not_email(client, engine):
    authed(client).get("/api/v1/users/me")
    res = authed(client, uid="t2c-user-2", email="t2c-second@example.com").get(
        "/api/v1/users/me"
    )
    assert res.status_code == 200
    assert user_count(engine, UID) == 1
    assert user_count(engine, "t2c-user-2") == 1


def test_email_collision_on_create_stores_null(client, engine):
    authed(client).get("/api/v1/users/me")
    res = authed(client, uid="t2c-user-3").get("/api/v1/users/me")
    assert res.status_code == 200
    assert res.json()["email"] is None
    assert user_count(engine, "t2c-user-3") == 1


def test_email_collision_on_update_keeps_old(client, engine):
    authed(client).get("/api/v1/users/me")
    authed(client, uid="t2c-user-4", email="t2c-other@example.com").get(
        "/api/v1/users/me"
    )
    res = authed(client, email="t2c-other@example.com").get("/api/v1/users/me")
    assert res.status_code == 200
    assert res.json()["email"] == "t2c-user-1@example.com"


def test_race_recovers_existing_user(client, engine, monkeypatch):
    real_commit = Session.commit
    state = {"raised": False}

    def flaky_commit(self):
        if not state["raised"]:
            state["raised"] = True
            winner = session_for(engine)
            try:
                row = User(firebase_uid="t2c-user-5", email="t2c-fresh@example.com")
                row.profile = UserProfile()
                winner.add(row)
                winner.commit()
            finally:
                winner.close()
            raise IntegrityError("INSERT", {}, Exception("duplicate key"))
        return real_commit(self)

    monkeypatch.setattr(Session, "commit", flaky_commit)
    res = authed(client, uid="t2c-user-5", email="t2c-fresh@example.com").get(
        "/api/v1/users/me"
    )
    assert res.status_code == 200
    assert res.json()["firebase_uid"] == "t2c-user-5"
    assert user_count(engine, "t2c-user-5") == 1
    assert profile_count(engine, "t2c-user-5") == 1


def test_database_failure_is_500_not_401(client, monkeypatch):
    import app.db as db_module

    def broken():
        raise OperationalError("SELECT", {}, Exception("db down"))

    monkeypatch.setattr(db_module, "SessionLocal", broken)
    res = authed(client).get("/api/v1/users/me")
    assert res.status_code == 500
