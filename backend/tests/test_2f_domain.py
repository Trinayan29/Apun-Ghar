import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from app import auth as auth_module
from app.main import app
from app.models import Location, Property, RentalUnit, User, UserProfile

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://rent:rent@localhost:5433/rent",
)

UID = "t2f-owner-1"
OTHER_UID = "t2f-owner-2"
USER_UID = "t2f-user-1"


def claims(**kwargs):
    uid = kwargs.get("uid", UID)
    base = {
        "uid": uid,
        "email": f"{uid}@example.com",
        "email_verified": False,
        "name": "T2F Owner",
        "aud": "demo-apun-ghar",
    }
    base.update(kwargs)
    return base


def authed(client, **kwargs):
    app.dependency_overrides[auth_module.get_firebase_claims] = lambda: claims(
        **kwargs
    )
    return client


def valid_unit(**kwargs):
    base = {
        "unit_type": "PRIVATE_ROOM",
        "occupancy_type": "SINGLE",
        "capacity": 1,
        "sharing": "PRIVATE",
        "furnishing": "FURNISHED",
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
    if not inspect(eng).has_table("rental_units"):
        pytest.skip("rental_units table missing: run 'alembic upgrade head' first")
    yield eng
    eng.dispose()


def cleanup(engine):
    db = sessionmaker(bind=engine)()
    try:
        t2f_users = db.query(User.id).filter(User.firebase_uid.like("t2f-%"))
        t2f_props = db.query(Property.id).filter(
            Property.owner_user_id.in_(t2f_users)
        )
        t2f_units = db.query(RentalUnit.id).filter(
            RentalUnit.property_id.in_(t2f_props)
        )
        db.query(RentalUnit).filter(
            RentalUnit.id.in_(t2f_units)
        ).delete(synchronize_session=False)
        t2f_users = db.query(User.id).filter(User.firebase_uid.like("t2f-%"))
        db.query(Property).filter(
            Property.owner_user_id.in_(t2f_users)
        ).delete(synchronize_session=False)
        t2f_users = db.query(User.id).filter(User.firebase_uid.like("t2f-%"))
        db.query(UserProfile).filter(
            UserProfile.user_id.in_(t2f_users)
        ).delete(synchronize_session=False)
        db.query(User).filter(User.firebase_uid.like("t2f-%")).delete(
            synchronize_session=False
        )
        db.query(Location).filter(Location.name.like("2F Test %")).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def client(engine):
    cleanup(engine)
    c = TestClient(app, raise_server_exceptions=False)
    yield c
    app.dependency_overrides.clear()
    cleanup(engine)


def set_role(engine, uid, role):
    db = sessionmaker(bind=engine)()
    try:
        db.query(User).filter(User.firebase_uid == uid).update({"role": role})
        db.commit()
    finally:
        db.close()


def provision_owner(client, uid):
    res = authed(client, uid=uid).post(
        "/api/v1/owners/signup",
        json={"display_name": "T2F Owner", "phone_number": "+911234567890"},
    )
    assert res.status_code == 201, res.text


def provision_user(client, uid):
    res = authed(client, uid=uid).get("/api/v1/users/me")
    assert res.status_code == 200, res.text


def create_property(client, uid, **kwargs):
    payload = {"property_type": "PG", "address_line": f"  {uid} Test Road  "}
    payload.update(kwargs)
    res = authed(client, uid=uid).post(
        "/api/v1/owner/properties", json=payload
    )
    assert res.status_code == 201, res.text
    return res.json()


def insert_location(engine, type_, name):
    db = sessionmaker(bind=engine)()
    try:
        loc = Location(type=type_, name=f"2F Test {name}", city="Guwahati")
        db.add(loc)
        db.commit()
        db.refresh(loc)
        return loc.id
    finally:
        db.close()


def test_unauthenticated_401(client):
    assert (
        client.post(
            "/api/v1/owner/properties/1/units", json=valid_unit()
        ).status_code
        == 401
    )


def test_user_forbidden_403(client):
    provision_user(client, USER_UID)
    assert (
        authed(client, uid=USER_UID)
        .post("/api/v1/owner/properties/1/units", json=valid_unit())
        .status_code
        == 403
    )


def test_whole_home_create_201(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json={
            "unit_type": "ENTIRE_FLAT",
            "furnishing": "SEMI_FURNISHED",
            "layout": "2 BHK",
            "is_independent": True,
            "food_status": "NONE",
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["layout"] == "2 BHK"
    assert data["capacity"] is None
    assert data["sharing"] is None
    assert data["occupancy_type"] is None
    assert data["is_independent"] is True
    assert data["food_status"] == "NONE"


def test_whole_home_with_capacity_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json={
            "unit_type": "ENTIRE_FLAT",
            "furnishing": "FURNISHED",
            "layout": "1 BHK",
            "capacity": 1,
            "sharing": "PRIVATE",
        },
    )
    assert res.status_code == 422, res.text


def test_whole_home_with_occupancy_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json={
            "unit_type": "ENTIRE_FLAT",
            "occupancy_type": "SINGLE",
            "furnishing": "FURNISHED",
        },
    )
    assert res.status_code == 422, res.text


def test_layout_on_room_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json={**valid_unit(), "layout": "2 BHK"},
    )
    assert res.status_code == 422, res.text


def test_invalid_layout_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json={
            "unit_type": "ENTIRE_FLAT",
            "furnishing": "FURNISHED",
            "layout": "5 BHK",
        },
    )
    assert res.status_code == 422, res.text


def test_other_nulls_201(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json={"unit_type": "OTHER", "furnishing": "UNFURNISHED"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["capacity"] is None


def test_other_partial_capacity_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json={"unit_type": "OTHER", "furnishing": "UNFURNISHED", "capacity": 2},
    )
    assert res.status_code == 422, res.text


def test_room_missing_capacity_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    payload = valid_unit()
    del payload["capacity"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units", json=payload
    )
    assert res.status_code == 422, res.text


def test_room_bad_occupancy_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(occupancy_type="DOUBLE", capacity=1, sharing="SHARED"),
    )
    assert res.status_code == 422, res.text


def test_independence_roundtrip(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units", json=valid_unit()
    )
    assert res.status_code == 201, res.text
    uid = res.json()["id"]
    assert res.json()["is_independent"] is None
    for value in (True, False):
        res = authed(client, uid=UID).patch(
            f"/api/v1/owner/units/{uid}", json={"is_independent": value}
        )
        assert res.status_code == 200, res.text
        assert res.json()["is_independent"] is value
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{uid}", json={"is_independent": None}
    )
    assert res.status_code == 200, res.text
    assert res.json()["is_independent"] is None


def test_independence_invalid_type_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    # Pydantic coerces "yes"/"no" strings to bool; a non-scalar is rejected.
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(is_independent=[1]),
    )
    assert res.status_code == 422, res.text


def test_food_status_values(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    for value in ("INCLUDED", "SEPARATE", "NONE"):
        res = authed(client, uid=UID).post(
            f"/api/v1/owner/properties/{pid}/units",
            json=valid_unit(food_status=value),
        )
        assert res.status_code == 201, res.text
        assert res.json()["food_status"] == value
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(food_status="SOMETIMES"),
    )
    assert res.status_code == 422, res.text


def test_assam_type_house_201(client):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json={
            "property_type": "ASSAM_TYPE_HOUSE",
            "address_line": "12 Test Road",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["property_type"] == "ASSAM_TYPE_HOUSE"


def test_invalid_property_type_422(client):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json={"property_type": "CASTLE", "address_line": "12 Test Road"},
    )
    assert res.status_code == 422, res.text


def test_curfew_combinations(client):
    provision_owner(client, UID)
    base = {"property_type": "PG", "address_line": "12 Test Road"}
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json={**base, "has_curfew": True, "gate_closing_time": "22:00:00"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["has_curfew"] is True
    assert res.json()["gate_closing_time"] == "22:00:00"
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json={**base, "has_curfew": False}
    )
    assert res.status_code == 201, res.text
    assert res.json()["has_curfew"] is False
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json={**base, "has_curfew": False, "gate_closing_time": "22:00:00"},
    )
    assert res.status_code == 422, res.text


def test_college_workplace_roundtrip(client, engine):
    provision_owner(client, UID)
    college = insert_location(engine, "college", "Cotton College 2F")
    workplace = insert_location(engine, "workplace", "GNRC 2F")
    data = create_property(
        client,
        UID,
        nearest_college_id=college,
        nearest_workplace_id=workplace,
    )
    assert data["nearest_college_id"] == college
    assert data["nearest_workplace_id"] == workplace
    assert data["nearest_college"]["id"] == college
    assert data["nearest_workplace"]["id"] == workplace


def test_patch_non_composition_skips_strict_rules(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units", json=valid_unit()
    )
    assert res.status_code == 201, res.text
    uid = res.json()["id"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{uid}", json={"house_rules": "Quiet after 10pm"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["capacity"] == 1


def test_patch_capacity_null_on_room_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units", json=valid_unit()
    )
    uid = res.json()["id"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{uid}", json={"capacity": None}
    )
    assert res.status_code == 422, res.text


def test_patch_convert_other_to_layout_200(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)["id"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json={"unit_type": "OTHER", "furnishing": "UNFURNISHED"},
    )
    uid = res.json()["id"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{uid}",
        json={
            "unit_type": "ENTIRE_FLAT",
            "occupancy_type": None,
            "capacity": None,
            "sharing": None,
            "layout": "1 BHK",
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["layout"] == "1 BHK"
    assert res.json()["capacity"] is None


def test_foreign_unit_patch_404(client):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    pid = create_property(client, OTHER_UID)["id"]
    res = authed(client, uid=OTHER_UID).post(
        f"/api/v1/owner/properties/{pid}/units", json=valid_unit()
    )
    uid = res.json()["id"]
    assert (
        authed(client, uid=UID)
        .patch(f"/api/v1/owner/units/{uid}", json={"layout": "2 BHK"})
        .status_code
        == 404
    )
