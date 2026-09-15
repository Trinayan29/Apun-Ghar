import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from app import auth as auth_module
from app.main import app
from app.models import (
    Amenity,
    Location,
    Property,
    RentalUnit,
    RentalUnitAmenity,
    User,
    UserProfile,
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://rent:rent@localhost:5433/rent",
)

UID = "t2d-owner-1"
OTHER_UID = "t2d-owner-2"
USER_UID = "t2d-user-1"
ADMIN_UID = "t2d-admin-1"


def claims(**kwargs):
    uid = kwargs.get("uid", UID)
    base = {
        "uid": uid,
        "email": f"{uid}@example.com",
        "email_verified": False,
        "name": "T2D Owner",
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
        t2d_users = db.query(User.id).filter(User.firebase_uid.like("t2d-%"))
        t2d_props = db.query(Property.id).filter(
            Property.owner_user_id.in_(t2d_users)
        )
        t2d_units = db.query(RentalUnit.id).filter(
            RentalUnit.property_id.in_(t2d_props)
        )
        db.query(RentalUnitAmenity).filter(
            RentalUnitAmenity.rental_unit_id.in_(t2d_units)
        ).delete(synchronize_session=False)
        t2d_units = db.query(RentalUnit.id).filter(
            RentalUnit.property_id.in_(
                db.query(Property.id).filter(
                    Property.owner_user_id.in_(
                        db.query(User.id).filter(
                            User.firebase_uid.like("t2d-%")
                        )
                    )
                )
            )
        )
        db.query(RentalUnit).filter(
            RentalUnit.id.in_(t2d_units)
        ).delete(synchronize_session=False)
        t2d_users = db.query(User.id).filter(User.firebase_uid.like("t2d-%"))
        db.query(Property).filter(
            Property.owner_user_id.in_(t2d_users)
        ).delete(synchronize_session=False)
        t2d_users = db.query(User.id).filter(User.firebase_uid.like("t2d-%"))
        db.query(UserProfile).filter(
            UserProfile.user_id.in_(t2d_users)
        ).delete(synchronize_session=False)
        db.query(User).filter(User.firebase_uid.like("t2d-%")).delete(
            synchronize_session=False
        )
        db.query(Location).filter(Location.name.like("2D Test %")).delete(
            synchronize_session=False
        )
        db.query(Amenity).filter(Amenity.slug.like("t2d-%")).delete(
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
        json={"display_name": "T2D Owner", "phone_number": "+911234567890"},
    )
    assert res.status_code == 201, res.text


def provision_user(client, uid):
    res = authed(client, uid=uid).get("/api/v1/users/me")
    assert res.status_code == 200, res.text


def create_property(client, uid, **kwargs):
    payload = {
        "property_type": "PG",
        "address_line": f"  {uid} Test Road  ",
    }
    payload.update(kwargs)
    res = authed(client, uid=uid).post(
        "/api/v1/owner/properties", json=payload
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def create_unit(client, uid, pid, **kwargs):
    res = authed(client, uid=uid).post(
        f"/api/v1/owner/properties/{pid}/units", json=valid_unit(**kwargs)
    )
    assert res.status_code == 201, res.text
    return res.json()


def amenity_id(engine, slug):
    db = sessionmaker(bind=engine)()
    try:
        aid = db.query(Amenity.id).filter(Amenity.slug == slug).scalar()
    finally:
        db.close()
    assert aid is not None, f"amenity slug missing: {slug}"
    return aid


def make_inactive_amenity(engine):
    db = sessionmaker(bind=engine)()
    try:
        row = Amenity(
            slug="t2d-inactive",
            label="2D Test Inactive",
            category="test",
            is_active=False,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row.id
    finally:
        db.close()


def test_unauthenticated_401(client):
    payload = valid_unit()
    assert (
        client.post("/api/v1/owner/properties/1/units", json=payload).status_code
        == 401
    )
    assert client.get("/api/v1/owner/properties/1/units").status_code == 401
    assert client.get("/api/v1/owner/units/1").status_code == 401
    assert client.patch("/api/v1/owner/units/1", json={}).status_code == 401


def test_user_forbidden_403(client, engine):
    provision_user(client, USER_UID)
    assert authed(client, uid=USER_UID).post(
        "/api/v1/owner/properties/1/units", json=valid_unit()
    ).status_code == 403
    assert authed(client, uid=USER_UID).get(
        "/api/v1/owner/properties/1/units"
    ).status_code == 403
    assert authed(client, uid=USER_UID).get(
        "/api/v1/owner/units/1"
    ).status_code == 403
    assert authed(client, uid=USER_UID).patch(
        "/api/v1/owner/units/1", json={"capacity": 1}
    ).status_code == 403


def test_admin_forbidden_403(client, engine):
    provision_user(client, ADMIN_UID)
    set_role(engine, ADMIN_UID, "ADMIN")
    assert authed(client, uid=ADMIN_UID).post(
        "/api/v1/owner/properties/1/units", json=valid_unit()
    ).status_code == 403
    assert authed(client, uid=ADMIN_UID).get(
        "/api/v1/owner/properties/1/units"
    ).status_code == 403
    assert authed(client, uid=ADMIN_UID).get(
        "/api/v1/owner/units/1"
    ).status_code == 403
    assert authed(client, uid=ADMIN_UID).patch(
        "/api/v1/owner/units/1", json={"capacity": 1}
    ).status_code == 403


def test_create_unit_201(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    wifi = amenity_id(engine, "wifi")
    ac = amenity_id(engine, "ac")
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(
            unit_type="SHARED_ROOM_BED",
            occupancy_type="DOUBLE",
            capacity=2,
            sharing="SHARED",
            furnishing="SEMI_FURNISHED",
            gender_scope="FEMALE",
            bathrooms=2,
            floor_number=1,
            carpet_area_sqft=350,
            couple_friendly=True,
            visitors_allowed=False,
            pets_allowed=None,
            smoking_allowed=False,
            alcohol_allowed=False,
            house_rules="  No smoking inside.  ",
            amenity_ids=[ac, wifi, wifi],
        ),
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["property_id"] == pid
    assert data["unit_type"] == "SHARED_ROOM_BED"
    assert data["occupancy_type"] == "DOUBLE"
    assert data["capacity"] == 2
    assert data["sharing"] == "SHARED"
    assert data["furnishing"] == "SEMI_FURNISHED"
    assert data["gender_scope"] == "FEMALE"
    assert data["bathrooms"] == 2
    assert data["floor_number"] == 1
    assert data["carpet_area_sqft"] == 350
    assert data["couple_friendly"] is True
    assert data["visitors_allowed"] is False
    assert data["pets_allowed"] is None
    assert data["house_rules"] == "No smoking inside."
    assert [a["id"] for a in data["amenities"]] == sorted([wifi, ac])
    assert data["amenities"][0]["slug"] in ("wifi", "ac")
    assert all("is_active" in a for a in data["amenities"])
    assert data["created_at"] and data["updated_at"]


def test_create_response_shape(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units", json=valid_unit()
    )
    assert res.status_code == 201
    assert set(res.json()) == {
        "id",
        "property_id",
        "unit_type",
        "occupancy_type",
        "capacity",
        "sharing",
        "furnishing",
        "gender_scope",
        "bathrooms",
        "floor_number",
        "carpet_area_sqft",
        "couple_friendly",
        "visitors_allowed",
        "pets_allowed",
        "smoking_allowed",
        "alcohol_allowed",
        "house_rules",
        "amenities",
        "created_at",
        "updated_at",
    }


def test_default_gender_scope_and_empty_amenities(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units", json=valid_unit()
    )
    assert res.status_code == 201
    data = res.json()
    assert data["gender_scope"] == "ANY"
    assert data["amenities"] == []


@pytest.mark.parametrize("unit_type", ["VILLA", "room"])
def test_invalid_unit_type_422(client, engine, unit_type):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(unit_type=unit_type),
    )
    assert res.status_code == 422


@pytest.mark.parametrize("occupancy_type", ["QUAD", "double"])
def test_invalid_occupancy_type_422(client, engine, occupancy_type):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(occupancy_type=occupancy_type),
    )
    assert res.status_code == 422


@pytest.mark.parametrize("sharing", ["SHAREDX", "private"])
def test_invalid_sharing_422(client, engine, sharing):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(sharing=sharing),
    )
    assert res.status_code == 422


@pytest.mark.parametrize("furnishing", ["LUXURY", "furnished"])
def test_invalid_furnishing_422(client, engine, furnishing):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(furnishing=furnishing),
    )
    assert res.status_code == 422


@pytest.mark.parametrize("gender_scope", ["OTHER", "any"])
def test_invalid_gender_scope_422(client, engine, gender_scope):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(gender_scope=gender_scope),
    )
    assert res.status_code == 422


@pytest.mark.parametrize("capacity", [0, -2])
def test_invalid_capacity_422(client, engine, capacity):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(capacity=capacity),
    )
    assert res.status_code == 422


def test_missing_capacity_422(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    payload = valid_unit()
    del payload["capacity"]
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units", json=payload
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"occupancy_type": "SINGLE", "capacity": 2, "sharing": "PRIVATE"},
        {"occupancy_type": "SINGLE", "capacity": 1, "sharing": "SHARED"},
        {"occupancy_type": "DOUBLE", "capacity": 1, "sharing": "SHARED"},
        {"occupancy_type": "DOUBLE", "capacity": 2, "sharing": "PRIVATE"},
        {"occupancy_type": "TRIPLE", "capacity": 3, "sharing": "PRIVATE"},
    ],
)
def test_inconsistent_occupancy_422(client, engine, payload):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(**payload),
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"bathrooms": -1},
        {"floor_number": -1},
        {"carpet_area_sqft": 0},
        {"carpet_area_sqft": -50},
    ],
)
def test_invalid_measurements_422(client, engine, payload):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(**payload),
    )
    assert res.status_code == 422


@pytest.mark.parametrize("house_rules", ["", "   "])
def test_blank_house_rules_422(client, engine, house_rules):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(house_rules=house_rules),
    )
    assert res.status_code == 422


def test_long_house_rules_422(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(house_rules="x" * 5001),
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "extra",
    [{"property_id": 1}, {"owner_user_id": 999}, {"id": 999}, {"foo": "bar"}],
)
def test_create_extra_fields_forbidden_422(client, engine, extra):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(**extra),
    )
    assert res.status_code == 422


def test_unknown_amenity_id_422(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(amenity_ids=[999999]),
    )
    assert res.status_code == 422
    assert "invalid" in res.json()["detail"].lower()


def test_inactive_amenity_id_422(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    inactive = make_inactive_amenity(engine)
    wifi = amenity_id(engine, "wifi")
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/properties/{pid}/units",
        json=valid_unit(amenity_ids=[wifi, inactive]),
    )
    assert res.status_code == 422
    assert str(inactive) in res.json()["detail"]


def test_create_under_missing_property_404(client, engine):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties/999999/units", json=valid_unit()
    )
    assert res.status_code == 404


def test_create_under_foreign_property_404(client, engine):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    pid = create_property(client, UID)
    res = authed(client, uid=OTHER_UID).post(
        f"/api/v1/owner/properties/{pid}/units", json=valid_unit()
    )
    assert res.status_code == 404


def test_list_units_ordering_and_pagination(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    wifi = amenity_id(engine, "wifi")
    ids = [
        create_unit(
            client,
            UID,
            pid,
            occupancy_type="DOUBLE",
            capacity=2,
            sharing="SHARED",
            amenity_ids=[wifi] if n == 0 else [],
        )["id"]
        for n in range(3)
    ]
    assert ids == sorted(ids)
    data = authed(client, uid=UID).get(
        f"/api/v1/owner/properties/{pid}/units"
    ).json()
    assert [u["id"] for u in data] == ids
    assert data[0]["amenities"][0]["slug"] == "wifi"
    data = authed(client, uid=UID).get(
        f"/api/v1/owner/properties/{pid}/units", params={"limit": 2}
    ).json()
    assert [u["id"] for u in data] == ids[:2]
    data = authed(client, uid=UID).get(
        f"/api/v1/owner/properties/{pid}/units",
        params={"limit": 2, "offset": 1},
    ).json()
    assert [u["id"] for u in data] == ids[1:]


def test_list_units_empty(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    res = authed(client, uid=UID).get(
        f"/api/v1/owner/properties/{pid}/units"
    )
    assert res.status_code == 200
    assert res.json() == []


def test_list_units_missing_property_404(client, engine):
    provision_owner(client, UID)
    res = authed(client, uid=UID).get("/api/v1/owner/properties/999999/units")
    assert res.status_code == 404


def test_list_units_foreign_property_404(client, engine):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    pid = create_property(client, UID)
    res = authed(client, uid=OTHER_UID).get(
        f"/api/v1/owner/properties/{pid}/units"
    )
    assert res.status_code == 404


def test_owner_unit_list_isolation(client, engine):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    pid_a = create_property(client, UID)
    pid_b = create_property(client, OTHER_UID)
    create_unit(client, UID, pid_a)
    create_unit(
        client,
        UID,
        pid_a,
        unit_type="PG_BED",
        occupancy_type="DOUBLE",
        capacity=2,
        sharing="SHARED",
    )
    create_unit(client, OTHER_UID, pid_b)
    data = authed(client, uid=OTHER_UID).get(
        f"/api/v1/owner/properties/{pid_b}/units"
    ).json()
    assert len(data) == 1
    data = authed(client, uid=UID).get(
        f"/api/v1/owner/properties/{pid_a}/units"
    ).json()
    assert len(data) == 2


def test_get_own_unit_200(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    wifi = amenity_id(engine, "wifi")
    created = create_unit(client, UID, pid, amenity_ids=[wifi])
    res = authed(client, uid=UID).get(f"/api/v1/owner/units/{created['id']}")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == created["id"]
    assert data["property_id"] == pid
    assert [a["slug"] for a in data["amenities"]] == ["wifi"]


def test_missing_unit_404(client, engine):
    provision_owner(client, UID)
    assert authed(client, uid=UID).get("/api/v1/owner/units/999999").status_code == (
        404
    )
    assert authed(client, uid=UID).patch(
        "/api/v1/owner/units/999999", json={"capacity": 1}
    ).status_code == 404


def test_foreign_unit_404(client, engine):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    pid = create_property(client, UID)
    created = create_unit(client, UID, pid)
    assert authed(client, uid=OTHER_UID).get(
        f"/api/v1/owner/units/{created['id']}"
    ).status_code == 404
    assert authed(client, uid=OTHER_UID).patch(
        f"/api/v1/owner/units/{created['id']}", json={"bathrooms": 1}
    ).status_code == 404


def test_patch_only_supplied_fields(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    created = create_unit(
        client, UID, pid, bathrooms=1, furnishing="SEMI_FURNISHED"
    )
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}", json={"bathrooms": 3}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["bathrooms"] == 3
    assert data["furnishing"] == "SEMI_FURNISHED"
    assert data["capacity"] == 1
    persisted = authed(client, uid=UID).get(
        f"/api/v1/owner/units/{created['id']}"
    ).json()
    assert persisted["bathrooms"] == 3
    assert persisted["furnishing"] == "SEMI_FURNISHED"


def test_patch_null_clears_nullable_fields(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    created = create_unit(
        client,
        UID,
        pid,
        bathrooms=2,
        floor_number=1,
        carpet_area_sqft=300,
        couple_friendly=True,
        visitors_allowed=True,
        pets_allowed=True,
        smoking_allowed=True,
        alcohol_allowed=True,
        house_rules="Keep it clean.",
    )
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}",
        json={
            "bathrooms": None,
            "floor_number": None,
            "carpet_area_sqft": None,
            "couple_friendly": None,
            "visitors_allowed": None,
            "pets_allowed": None,
            "smoking_allowed": None,
            "alcohol_allowed": None,
            "house_rules": None,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["bathrooms"] is None
    assert data["floor_number"] is None
    assert data["carpet_area_sqft"] is None
    assert data["couple_friendly"] is None
    assert data["visitors_allowed"] is None
    assert data["pets_allowed"] is None
    assert data["smoking_allowed"] is None
    assert data["alcohol_allowed"] is None
    assert data["house_rules"] is None
    assert data["unit_type"] == "PRIVATE_ROOM"
    persisted = authed(client, uid=UID).get(
        f"/api/v1/owner/units/{created['id']}"
    ).json()
    assert persisted["bathrooms"] is None
    assert persisted["house_rules"] is None
    assert persisted["couple_friendly"] is None


@pytest.mark.parametrize(
    "field",
    [
        "unit_type",
        "occupancy_type",
        "capacity",
        "sharing",
        "furnishing",
        "gender_scope",
    ],
)
def test_patch_null_not_null_field_422(client, engine, field):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    created = create_unit(client, UID, pid)
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}", json={field: None}
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"capacity": 2},
        {"sharing": "SHARED"},
        {"occupancy_type": "DOUBLE", "capacity": 1, "sharing": "SHARED"},
        {"occupancy_type": "DOUBLE", "capacity": 2, "sharing": "PRIVATE"},
    ],
)
def test_patch_breaks_occupancy_consistency_422(client, engine, payload):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    created = create_unit(client, UID, pid)
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}", json=payload
    )
    assert res.status_code == 422


def test_patch_occupancy_transition_200(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    created = create_unit(client, UID, pid)
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}",
        json={
            "occupancy_type": "DOUBLE",
            "capacity": 2,
            "sharing": "SHARED",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["occupancy_type"] == "DOUBLE"
    assert data["capacity"] == 2
    assert data["sharing"] == "SHARED"


def test_patch_amenities_replace_and_clear(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    wifi = amenity_id(engine, "wifi")
    ac = amenity_id(engine, "ac")
    parking = amenity_id(engine, "parking")
    created = create_unit(client, UID, pid, amenity_ids=[wifi, ac])
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}", json={"amenity_ids": [parking]}
    )
    assert res.status_code == 200
    assert [a["slug"] for a in res.json()["amenities"]] == ["parking"]
    persisted = authed(client, uid=UID).get(
        f"/api/v1/owner/units/{created['id']}"
    ).json()
    assert [a["slug"] for a in persisted["amenities"]] == ["parking"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}", json={"amenity_ids": []}
    )
    assert res.status_code == 200
    assert res.json()["amenities"] == []


def test_patch_omitted_amenity_ids_preserves_amenities(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    wifi = amenity_id(engine, "wifi")
    created = create_unit(client, UID, pid, amenity_ids=[wifi])
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}", json={"bathrooms": 5}
    )
    assert res.status_code == 200
    assert [a["slug"] for a in res.json()["amenities"]] == ["wifi"]
    persisted = authed(client, uid=UID).get(
        f"/api/v1/owner/units/{created['id']}"
    ).json()
    assert persisted["bathrooms"] == 5
    assert [a["slug"] for a in persisted["amenities"]] == ["wifi"]


def test_invalid_amenity_ids_leaves_amenities_unchanged(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    wifi = amenity_id(engine, "wifi")
    created = create_unit(client, UID, pid, amenity_ids=[wifi])
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}",
        json={"bathrooms": 5, "amenity_ids": [999999]},
    )
    assert res.status_code == 422
    persisted = authed(client, uid=UID).get(
        f"/api/v1/owner/units/{created['id']}"
    ).json()
    assert persisted["bathrooms"] is None
    assert [a["slug"] for a in persisted["amenities"]] == ["wifi"]


def test_patch_amenity_ids_null_422(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    created = create_unit(client, UID, pid)
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}", json={"amenity_ids": None}
    )
    assert res.status_code == 422


def test_patch_unknown_amenity_422(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    created = create_unit(client, UID, pid)
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}",
        json={"amenity_ids": [999999]},
    )
    assert res.status_code == 422


def test_patch_inactive_amenity_422(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    created = create_unit(client, UID, pid)
    inactive = make_inactive_amenity(engine)
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}",
        json={"amenity_ids": [inactive]},
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"unit_type": "VILLA"},
        {"furnishing": "LUXURY"},
        {"gender_scope": "OTHER"},
        {"capacity": 0},
        {"house_rules": "   "},
    ],
)
def test_patch_invalid_fields_422(client, engine, payload):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    created = create_unit(client, UID, pid)
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}", json=payload
    )
    assert res.status_code == 422


def test_patch_owner_user_id_forbidden_422(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    created = create_unit(client, UID, pid)
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}", json={"owner_user_id": 999999}
    )
    assert res.status_code == 422
    data = authed(client, uid=UID).get(
        f"/api/v1/owner/units/{created['id']}"
    ).json()
    assert data["property_id"] == pid


def test_invalid_patch_leaves_db_unchanged(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    wifi = amenity_id(engine, "wifi")
    created = create_unit(
        client, UID, pid, bathrooms=2, amenity_ids=[wifi]
    )
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{created['id']}",
        json={"capacity": 2, "amenity_ids": [999999]},
    )
    assert res.status_code == 422
    data = authed(client, uid=UID).get(
        f"/api/v1/owner/units/{created['id']}"
    ).json()
    assert data["capacity"] == 1
    assert data["bathrooms"] == 2
    assert [a["slug"] for a in data["amenities"]] == ["wifi"]
