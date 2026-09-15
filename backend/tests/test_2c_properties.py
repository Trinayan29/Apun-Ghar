import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from app import auth as auth_module
from app.main import app
from app.models import Location, Property, User, UserProfile

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://rent:rent@localhost:5433/rent",
)

UID = "t2c-owner-1"
OTHER_UID = "t2c-owner-2"
USER_UID = "t2c-user-1"
ADMIN_UID = "t2c-admin-1"


def claims(**kwargs):
    uid = kwargs.get("uid", UID)
    base = {
        "uid": uid,
        "email": f"{uid}@example.com",
        "email_verified": False,
        "name": "T2C Owner",
        "aud": "demo-apun-ghar",
    }
    base.update(kwargs)
    return base


def authed(client, **kwargs):
    app.dependency_overrides[auth_module.get_firebase_claims] = lambda: claims(
        **kwargs
    )
    return client


def valid_payload(**kwargs):
    base = {
        "property_type": "PG",
        "address_line": "  12 Test Road, Guwahati  ",
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
    if not inspect(eng).has_table("properties"):
        pytest.skip("properties table missing: run 'alembic upgrade head' first")
    yield eng
    eng.dispose()


def cleanup(engine):
    db = sessionmaker(bind=engine)()
    try:
        user_ids = db.query(User.id).filter(User.firebase_uid.like("t2c-%"))
        db.query(Property).filter(
            Property.owner_user_id.in_(user_ids)
        ).delete(synchronize_session=False)
        user_ids = db.query(User.id).filter(User.firebase_uid.like("t2c-%"))
        db.query(UserProfile).filter(
            UserProfile.user_id.in_(user_ids)
        ).delete(synchronize_session=False)
        db.query(User).filter(User.firebase_uid.like("t2c-%")).delete(
            synchronize_session=False
        )
        db.query(Location).filter(Location.name.like("2C Test %")).delete(
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


def insert_location(engine, type_, name):
    db = sessionmaker(bind=engine)()
    try:
        loc = Location(type=type_, name=f"2C Test {name}", city="Guwahati")
        db.add(loc)
        db.commit()
        db.refresh(loc)
        return loc.id
    finally:
        db.close()


def provision_owner(client, uid, email=None):
    if email is None:
        email = f"{uid}@example.com"
    res = authed(client, uid=uid, email=email).post(
        "/api/v1/owners/signup",
        json={"display_name": "T2C Owner", "phone_number": "+911234567890"},
    )
    assert res.status_code == 201, res.text


def provision_user(client, uid, email=None):
    if email is None:
        email = f"{uid}@example.com"
    res = authed(client, uid=uid, email=email).get("/api/v1/users/me")
    assert res.status_code == 200, res.text


def test_unauthenticated_401(client):
    payload = valid_payload()
    assert client.post("/api/v1/owner/properties", json=payload).status_code == 401
    assert client.get("/api/v1/owner/properties").status_code == 401
    assert client.get("/api/v1/owner/properties/1").status_code == 401
    assert (
        client.patch("/api/v1/owner/properties/1", json={}).status_code == 401
    )


def test_user_forbidden_403(client, engine):
    provision_user(client, USER_UID)
    res = authed(client, uid=USER_UID).post(
        "/api/v1/owner/properties", json=valid_payload()
    )
    assert res.status_code == 403
    assert authed(client, uid=USER_UID).get(
        "/api/v1/owner/properties"
    ).status_code == 403
    assert authed(client, uid=USER_UID).get(
        "/api/v1/owner/properties/1"
    ).status_code == 403
    assert authed(client, uid=USER_UID).patch(
        "/api/v1/owner/properties/1", json={"total_floors": 2}
    ).status_code == 403


def test_admin_forbidden_403(client, engine):
    provision_user(client, ADMIN_UID)
    set_role(engine, ADMIN_UID, "ADMIN")
    res = authed(client, uid=ADMIN_UID).post(
        "/api/v1/owner/properties", json=valid_payload()
    )
    assert res.status_code == 403
    assert authed(client, uid=ADMIN_UID).get(
        "/api/v1/owner/properties"
    ).status_code == 403
    assert authed(client, uid=ADMIN_UID).get(
        "/api/v1/owner/properties/1"
    ).status_code == 403
    assert authed(client, uid=ADMIN_UID).patch(
        "/api/v1/owner/properties/1", json={"total_floors": 2}
    ).status_code == 403


def test_create_property_201(client, engine):
    provision_owner(client, UID)
    area_id = insert_location(engine, "area", "Beltola")
    college_id = insert_location(engine, "college", "Cotton University 2C")
    workplace_id = insert_location(engine, "workplace", "GNRC 2C")
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json=valid_payload(
            locality="Basistha",
            area_location_id=area_id,
            pincode="781028",
            gate_closing_time="22:00:00",
            is_independent=True,
            latitude=26.1,
            longitude=91.7,
            nearest_college_id=college_id,
            nearest_workplace_id=workplace_id,
            total_floors=3,
            built_year=2015,
        ),
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["property_type"] == "PG"
    assert data["address_line"] == "12 Test Road, Guwahati"
    assert data["locality"] == "Basistha"
    assert data["city"] == "Guwahati"
    assert data["area_location_id"] == area_id
    assert data["pincode"] == "781028"
    assert data["gate_closing_time"] == "22:00:00"
    assert data["is_independent"] is True
    assert data["latitude"] == 26.1
    assert data["longitude"] == 91.7
    assert data["nearest_college_id"] == college_id
    assert data["nearest_workplace_id"] == workplace_id
    assert data["total_floors"] == 3
    assert data["built_year"] == 2015
    assert isinstance(data["owner_user_id"], int)
    assert data["created_at"] and data["updated_at"]


def test_create_response_shape(client, engine):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload()
    )
    assert res.status_code == 201
    assert set(res.json()) == {
        "id",
        "owner_user_id",
        "property_type",
        "address_line",
        "locality",
        "area_location_id",
        "area_location",
        "city",
        "pincode",
        "gate_closing_time",
        "is_independent",
        "latitude",
        "longitude",
        "nearest_college_id",
        "nearest_college",
        "nearest_workplace_id",
        "nearest_workplace",
        "total_floors",
        "built_year",
        "created_at",
        "updated_at",
    }


def test_default_city(client, engine):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload()
    )
    assert res.status_code == 201
    assert res.json()["city"] == "Guwahati"


def test_nested_locations(client, engine):
    provision_owner(client, UID)
    area_id = insert_location(engine, "area", "Dispur")
    college_id = insert_location(engine, "college", "IIT Guwahati 2C")
    workplace_id = insert_location(
        engine, "workplace", "Assam Secretariat 2C"
    )
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json=valid_payload(
            area_location_id=area_id,
            nearest_college_id=college_id,
            nearest_workplace_id=workplace_id,
        ),
    )
    assert res.status_code == 201
    data = res.json()
    assert data["area_location"] == {
        "id": area_id,
        "type": "area",
        "name": "2C Test Dispur",
        "city": "Guwahati",
    }
    assert data["nearest_college"]["type"] == "college"
    assert data["nearest_college"]["name"] == "2C Test IIT Guwahati 2C"
    assert data["nearest_workplace"]["type"] == "workplace"


@pytest.mark.parametrize("property_type", ["VILLA", "ROOM", "flat"])
def test_invalid_property_type_422(client, engine, property_type):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json=valid_payload(property_type=property_type),
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "field", ["area_location_id", "nearest_college_id", "nearest_workplace_id"]
)
def test_unknown_location_id_422(client, engine, field):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload(**{field: 999999})
    )
    assert res.status_code == 422
    assert "invalid" in res.json()["detail"].lower()


@pytest.mark.parametrize(
    ("field", "type_"),
    [
        ("area_location_id", "college"),
        ("nearest_college_id", "area"),
        ("nearest_workplace_id", "college"),
    ],
)
def test_wrong_location_type_422(client, engine, field, type_):
    provision_owner(client, UID)
    loc_id = insert_location(engine, type_, f"Wrong {field}")
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload(**{field: loc_id})
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"latitude": 26.1},
        {"longitude": 91.7},
        {"longitude": None, "latitude": 26.1},
    ],
)
def test_invalid_lat_long_pair_422(client, engine, payload):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload(**payload)
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"latitude": 91, "longitude": 91.7},
        {"latitude": -91, "longitude": 91.7},
        {"latitude": 26.1, "longitude": 181},
        {"latitude": 26.1, "longitude": -181},
    ],
)
def test_out_of_range_coordinates_422(client, engine, payload):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload(**payload)
    )
    assert res.status_code == 422


@pytest.mark.parametrize("total_floors", [0, -1])
def test_invalid_total_floors_422(client, engine, total_floors):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload(total_floors=total_floors)
    )
    assert res.status_code == 422


@pytest.mark.parametrize("built_year", [1700, 2200])
def test_invalid_built_year_422(client, engine, built_year):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload(built_year=built_year)
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "pincode", ["12345", "1234567", "012345", "abc123", "12 345"]
)
def test_invalid_pincode_422(client, engine, pincode):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload(pincode=pincode)
    )
    assert res.status_code == 422


@pytest.mark.parametrize("address_line", ["", "   "])
def test_blank_address_422(client, engine, address_line):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload(address_line=address_line)
    )
    assert res.status_code == 422


@pytest.mark.parametrize("city", ["", "   "])
def test_blank_city_422(client, engine, city):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload(city=city)
    )
    assert res.status_code == 422


@pytest.mark.parametrize("locality", ["", "   "])
def test_blank_locality_422(client, engine, locality):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload(locality=locality)
    )
    assert res.status_code == 422


def test_patch_blank_city_locality_422(client, engine):
    provision_owner(client, UID)
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload()
    ).json()["id"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}", json={"city": "   "}
    )
    assert res.status_code == 422
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}", json={"locality": ""}
    )
    assert res.status_code == 422


def test_extra_fields_forbidden_422(client, engine):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json=valid_payload(owner_user_id=999, extra="nope"),
    )
    assert res.status_code == 422


def test_owner_list_isolation(client, engine):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID, email="t2c-owner-2@example.com")
    assert authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload(address_line="Owner A Road")
    ).status_code == 201
    assert authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json=valid_payload(property_type="HOSTEL", address_line="Owner A Road 2"),
    ).status_code == 201
    assert authed(client, uid=OTHER_UID).post(
        "/api/v1/owner/properties", json=valid_payload(address_line="Owner B Road")
    ).status_code == 201
    data = authed(client, uid=OTHER_UID).get("/api/v1/owner/properties").json()
    assert len(data) == 1
    assert data[0]["address_line"] == "Owner B Road"
    data = authed(client, uid=UID).get("/api/v1/owner/properties").json()
    assert len(data) == 2


def test_get_own_property_200(client, engine):
    provision_owner(client, UID)
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload()
    ).json()["id"]
    res = authed(client, uid=UID).get(f"/api/v1/owner/properties/{pid}")
    assert res.status_code == 200
    assert res.json()["id"] == pid


def test_missing_property_404(client, engine):
    provision_owner(client, UID)
    res = authed(client, uid=UID).get("/api/v1/owner/properties/999999")
    assert res.status_code == 404
    res = authed(client, uid=UID).patch(
        "/api/v1/owner/properties/999999", json={"address_line": "X"}
    )
    assert res.status_code == 404


def test_foreign_owned_property_404(client, engine):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID, email="t2c-owner-2@example.com")
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload()
    ).json()["id"]
    foreign = authed(client, uid=OTHER_UID)
    assert foreign.get(f"/api/v1/owner/properties/{pid}").status_code == 404
    res = foreign.patch(
        f"/api/v1/owner/properties/{pid}", json={"property_type": "HOSTEL"}
    )
    assert res.status_code == 404


def test_patch_only_supplied_fields(client, engine):
    provision_owner(client, UID)
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json=valid_payload(pincode="781028", total_floors=3),
    ).json()["id"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}", json={"total_floors": 5}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_floors"] == 5
    assert data["pincode"] == "781028"
    assert data["property_type"] == "PG"
    assert data["city"] == "Guwahati"
    persisted = authed(client, uid=UID).get(
        f"/api/v1/owner/properties/{pid}"
    ).json()
    assert persisted["total_floors"] == 5
    assert persisted["pincode"] == "781028"
    assert persisted["property_type"] == "PG"


def test_patch_explicit_null_clears_nullable_fields(client, engine):
    provision_owner(client, UID)
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json=valid_payload(
            locality="Disputed",
            pincode="781028",
            gate_closing_time="22:00:00",
            is_independent=True,
            total_floors=2,
        ),
    ).json()["id"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}",
        json={
            "locality": None,
            "pincode": None,
            "gate_closing_time": None,
            "is_independent": None,
            "total_floors": None,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["locality"] is None
    assert data["pincode"] is None
    assert data["gate_closing_time"] is None
    assert data["is_independent"] is None
    assert data["total_floors"] is None
    assert data["property_type"] == "PG"
    persisted = authed(client, uid=UID).get(
        f"/api/v1/owner/properties/{pid}"
    ).json()
    assert persisted["locality"] is None
    assert persisted["pincode"] is None
    assert persisted["gate_closing_time"] is None
    assert persisted["is_independent"] is None
    assert persisted["total_floors"] is None


def test_patch_clears_area_location_id(client, engine):
    provision_owner(client, UID)
    area_id = insert_location(engine, "area", "Clear Area")
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json=valid_payload(area_location_id=area_id),
    ).json()["id"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}", json={"area_location_id": None}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["area_location_id"] is None
    assert data["area_location"] is None
    persisted = authed(client, uid=UID).get(
        f"/api/v1/owner/properties/{pid}"
    ).json()
    assert persisted["area_location_id"] is None
    assert persisted["area_location"] is None


def test_list_ordering_and_pagination(client, engine):
    provision_owner(client, UID)
    ids = [
        authed(client, uid=UID).post(
            "/api/v1/owner/properties",
            json=valid_payload(address_line=f"Paginated Road {n}"),
        ).json()["id"]
        for n in range(3)
    ]
    assert ids == sorted(ids)
    data = authed(client, uid=UID).get("/api/v1/owner/properties").json()
    assert [p["id"] for p in data] == ids
    data = authed(client, uid=UID).get(
        "/api/v1/owner/properties", params={"limit": 2}
    ).json()
    assert [p["id"] for p in data] == ids[:2]
    data = authed(client, uid=UID).get(
        "/api/v1/owner/properties", params={"limit": 2, "offset": 1}
    ).json()
    assert [p["id"] for p in data] == ids[1:]


@pytest.mark.parametrize("field", ["property_type", "address_line", "city"])
def test_patch_explicit_null_not_null_field_422(client, engine, field):
    provision_owner(client, UID)
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload()
    ).json()["id"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}", json={field: None}
    )
    assert res.status_code == 422


def test_patch_unknown_location_id_422(client, engine):
    provision_owner(client, UID)
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload()
    ).json()["id"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}", json={"area_location_id": 999999}
    )
    assert res.status_code == 422
    assert "invalid" in res.json()["detail"].lower()


@pytest.mark.parametrize(
    ("field", "type_"),
    [
        ("area_location_id", "college"),
        ("nearest_college_id", "area"),
        ("nearest_workplace_id", "college"),
    ],
)
def test_patch_wrong_location_type_422(client, engine, field, type_):
    provision_owner(client, UID)
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload()
    ).json()["id"]
    loc_id = insert_location(engine, type_, f"Patch Wrong {field}")
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}", json={field: loc_id}
    )
    assert res.status_code == 422


def test_patch_invalid_property_type_422(client, engine):
    provision_owner(client, UID)
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload()
    ).json()["id"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}", json={"property_type": "VILLA"}
    )
    assert res.status_code == 422


def test_patch_invalid_pincode_422(client, engine):
    provision_owner(client, UID)
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload()
    ).json()["id"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}", json={"pincode": "012345"}
    )
    assert res.status_code == 422


def test_patch_owner_user_id_forbidden_422(client, engine):
    provision_owner(client, UID)
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties", json=valid_payload()
    ).json()["id"]
    owner_before = authed(client, uid=UID).get(
        f"/api/v1/owner/properties/{pid}"
    ).json()["owner_user_id"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}", json={"owner_user_id": 999999}
    )
    assert res.status_code == 422
    data = authed(client, uid=UID).get(
        f"/api/v1/owner/properties/{pid}"
    ).json()
    assert data["owner_user_id"] == owner_before


def test_patch_effective_lat_long_validation(client, engine):
    provision_owner(client, UID)
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json=valid_payload(latitude=26.1, longitude=91.7),
    ).json()["id"]
    # changing one side of an existing valid pair to a valid value stays valid
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}", json={"longitude": 92.0}
    )
    assert res.status_code == 200
    assert res.json()["longitude"] == 92.0
    # nulling one side while the other remains set breaks the pair
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}", json={"longitude": None}
    )
    assert res.status_code == 422
    # clearing both sides is allowed
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}",
        json={"latitude": None, "longitude": None},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["latitude"] is None
    assert data["longitude"] is None
    persisted = authed(client, uid=UID).get(
        f"/api/v1/owner/properties/{pid}"
    ).json()
    assert persisted["latitude"] is None
    assert persisted["longitude"] is None


def test_invalid_patch_leaves_db_unchanged(client, engine):
    provision_owner(client, UID)
    pid = authed(client, uid=UID).post(
        "/api/v1/owner/properties",
        json=valid_payload(
            pincode="781028", total_floors=3, latitude=26.1, longitude=91.7
        ),
    ).json()["id"]
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}", json={"longitude": None}
    )
    assert res.status_code == 422
    data = authed(client, uid=UID).get(
        f"/api/v1/owner/properties/{pid}"
    ).json()
    assert data["pincode"] == "781028"
    assert data["total_floors"] == 3
    assert data["latitude"] == 26.1
    assert data["longitude"] == 91.7