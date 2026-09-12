import os

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.models import User, UserProfile

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://rent:rent@localhost:5433/rent",
)


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
def db(engine):
    conn = engine.connect()
    tx = conn.begin()
    session = sessionmaker(bind=conn)()
    try:
        yield session
    finally:
        session.close()
        tx.rollback()
        conn.close()


def _user(**kwargs):
    kwargs.setdefault("firebase_uid", "uid-1")
    return User(**kwargs)


def test_default_role_is_student(db):
    db.add(_user())
    db.flush()
    row = db.query(User).one()
    assert row.role == "STUDENT"
    assert row.created_at is not None
    assert row.updated_at is not None


def test_invalid_role_rejected(db):
    db.add(_user(role="SUPERUSER"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_firebase_uid_unique(db):
    db.add(_user(firebase_uid="dup"))
    db.flush()
    db.add(_user(firebase_uid="dup"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_email_nullable_and_unique(db):
    db.add(_user(firebase_uid="a", email=None))
    db.add(_user(firebase_uid="b", email=None))
    db.flush()
    assert db.query(User).count() == 2
    db.add(_user(firebase_uid="c", email="x@example.com"))
    db.flush()
    db.add(_user(firebase_uid="d", email="x@example.com"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_negative_budgets_rejected(db):
    db.add(_user())
    db.flush()
    user_id = db.query(User).one().id
    db.add(UserProfile(user_id=user_id, budget_min=-100))
    with pytest.raises(IntegrityError):
        db.flush()


def test_budget_max_below_min_rejected(db):
    db.add(_user())
    db.flush()
    user_id = db.query(User).one().id
    db.add(UserProfile(user_id=user_id, budget_min=9000, budget_max=5000))
    with pytest.raises(IntegrityError):
        db.flush()


def test_empty_profile_is_valid(db):
    db.add(_user())
    db.flush()
    user_id = db.query(User).one().id
    db.add(UserProfile(user_id=user_id))
    db.flush()
    profile = db.query(UserProfile).one()
    assert profile.college is None
    assert profile.budget_min is None


def test_profile_fk_requires_user(db):
    db.add(UserProfile(user_id=999999))
    with pytest.raises(IntegrityError):
        db.flush()


def test_delete_user_cascades_profile(db):
    user = _user()
    user.profile = UserProfile(college="Test College")
    db.add(user)
    db.flush()
    assert db.query(UserProfile).count() == 1
    db.delete(user)
    db.flush()
    assert db.query(UserProfile).count() == 0
