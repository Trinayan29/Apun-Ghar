import os
import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from app import auth as auth_module
from app.main import app
from app.models import (
    Listing,
    ListingPhoto,
    ListingPriceComponent,
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

UID = "t2e-owner-1"
OTHER_UID = "t2e-owner-2"
USER_UID = "t2e-user-1"
ADMIN_UID = "t2e-admin-1"


def claims(**kwargs):
    uid = kwargs.get("uid", UID)
    base = {
        "uid": uid,
        "email": f"{uid}@example.com",
        "email_verified": False,
        "name": "T2E Owner",
        "aud": "demo-apun-ghar",
    }
    base.update(kwargs)
    return base


def authed(client, **kwargs):
    app.dependency_overrides[auth_module.get_firebase_claims] = lambda: claims(
        **kwargs
    )
    return client


def valid_listing(unit_id, **kwargs):
    base = {
        "title": "Sunny PG near campus",
        "description": "Spacious room with attached bath",
        "rental_unit_id": unit_id,
        "rent_basis": "PER_PERSON",
        "availability_status": "AVAILABLE_NOW",
    }
    base.update(kwargs)
    return base


def valid_price(**kwargs):
    base = {
        "charge_type": "RENT",
        "calculation_basis": "PER_PERSON",
        "billing_frequency": "MONTHLY",
        "variability": "FIXED",
        "amount_paise": 800000,
        "payment_timing": "PER_PERIOD",
        "mandatory": True,
        "included_in_advertised": True,
        "refundable": False,
        "display_order": 0,
    }
    base.update(kwargs)
    return base


def valid_photo_init(**kwargs):
    base = {
        "media_type": "PHOTO",
        "storage_key": f"t2e-photo-{uuid.uuid4().hex}",
        "mime": "image/jpeg",
        "width": 1920,
        "height": 1080,
        "display_order": 0,
        "is_cover": False,
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
    if not inspect(eng).has_table("listings"):
        pytest.skip("listings table missing: run 'alembic upgrade head' first")
    yield eng
    eng.dispose()


def cleanup(engine):
    db = sessionmaker(bind=engine)()
    try:
        t2e_users = db.query(User.id).filter(User.firebase_uid.like("t2e-%"))
        t2e_props = db.query(Property.id).filter(
            Property.owner_user_id.in_(t2e_users)
        )
        t2e_units = db.query(RentalUnit.id).filter(
            RentalUnit.property_id.in_(t2e_props)
        )
        t2e_listings = db.query(Listing.id).filter(
            Listing.rental_unit_id.in_(t2e_units)
        )
        db.query(ListingPhoto).filter(
            ListingPhoto.listing_id.in_(t2e_listings)
        ).delete(synchronize_session=False)
        db.query(ListingPriceComponent).filter(
            ListingPriceComponent.listing_id.in_(t2e_listings)
        ).delete(synchronize_session=False)
        db.query(Listing).filter(Listing.id.in_(t2e_listings)).delete(
            synchronize_session=False
        )
        db.query(RentalUnitAmenity).filter(
            RentalUnitAmenity.rental_unit_id.in_(t2e_units)
        ).delete(synchronize_session=False)
        db.query(RentalUnit).filter(RentalUnit.id.in_(t2e_units)).delete(
            synchronize_session=False
        )
        t2e_users = db.query(User.id).filter(User.firebase_uid.like("t2e-%"))
        db.query(Property).filter(
            Property.owner_user_id.in_(t2e_users)
        ).delete(synchronize_session=False)
        t2e_users = db.query(User.id).filter(User.firebase_uid.like("t2e-%"))
        db.query(UserProfile).filter(
            UserProfile.user_id.in_(t2e_users)
        ).delete(synchronize_session=False)
        db.query(User).filter(User.firebase_uid.like("t2e-%")).delete(
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


def set_listing_status(engine, listing_id, new_status):
    db = sessionmaker(bind=engine)()
    try:
        db.query(Listing).filter(Listing.id == listing_id).update(
            {"status": new_status}
        )
        db.commit()
    finally:
        db.close()


def provision_owner(client, uid):
    res = authed(client, uid=uid).post(
        "/api/v1/owners/signup",
        json={"display_name": "T2E Owner", "phone_number": "+911234567890"},
    )
    assert res.status_code == 201, res.text


def provision_user(client, uid):
    res = authed(client, uid=uid).get("/api/v1/users/me")
    assert res.status_code == 200, res.text


def create_property(client, uid):
    res = authed(client, uid=uid).post(
        "/api/v1/owner/properties",
        json={"property_type": "PG", "address_line": f"  {uid} Test Road  "},
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def create_unit(client, uid, pid):
    res = authed(client, uid=uid).post(
        f"/api/v1/owner/properties/{pid}/units",
        json={
            "unit_type": "PRIVATE_ROOM",
            "occupancy_type": "SINGLE",
            "capacity": 1,
            "sharing": "PRIVATE",
            "furnishing": "FURNISHED",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def create_listing(client, uid, unit_id, **kwargs):
    res = authed(client, uid=uid).post(
        "/api/v1/owner/listings", json=valid_listing(unit_id, **kwargs)
    )
    assert res.status_code == 201, res.text
    return res.json()


# AUTH


def test_unauthenticated_401(client):
    assert (
        client.post(
            "/api/v1/owner/listings", json={"title": "x", "rental_unit_id": 1}
        ).status_code
        == 401
    )
    assert client.get("/api/v1/owner/listings").status_code == 401
    assert client.get("/api/v1/owner/listings/1").status_code == 401
    assert client.patch("/api/v1/owner/listings/1", json={}).status_code == 401
    assert (
        client.post(
            "/api/v1/owner/listings/1/availability", json={}
        ).status_code
        == 401
    )
    assert (
        client.put("/api/v1/owner/listings/1/price-components", json=[]).status_code
        == 401
    )
    assert (
        client.post("/api/v1/owner/listings/1/photos:init", json={}).status_code
        == 401
    )
    assert (
        client.post("/api/v1/owner/listings/1/photos:confirm", json={}).status_code
        == 401
    )


def test_user_forbidden_403(client):
    provision_user(client, USER_UID)
    assert (
        authed(client, uid=USER_UID)
        .post("/api/v1/owner/listings", json={"title": "x"})
        .status_code
        == 403
    )
    assert (
        authed(client, uid=USER_UID).get("/api/v1/owner/listings").status_code
        == 403
    )
    assert (
        authed(client, uid=USER_UID).get("/api/v1/owner/listings/1").status_code
        == 403
    )
    assert (
        authed(client, uid=USER_UID)
        .patch("/api/v1/owner/listings/1", json={})
        .status_code
        == 403
    )
    assert (
        authed(client, uid=USER_UID)
        .post("/api/v1/owner/listings/1/availability", json={})
        .status_code
        == 403
    )
    assert (
        authed(client, uid=USER_UID)
        .put("/api/v1/owner/listings/1/price-components", json=[])
        .status_code
        == 403
    )
    assert (
        authed(client, uid=USER_UID)
        .post("/api/v1/owner/listings/1/photos:init", json={})
        .status_code
        == 403
    )
    assert (
        authed(client, uid=USER_UID)
        .post("/api/v1/owner/listings/1/photos:confirm", json={})
        .status_code
        == 403
    )


def test_admin_forbidden_403(client, engine):
    provision_user(client, ADMIN_UID)
    set_role(engine, ADMIN_UID, "ADMIN")
    assert (
        authed(client, uid=ADMIN_UID)
        .post("/api/v1/owner/listings", json={"title": "x"})
        .status_code
        == 403
    )
    assert (
        authed(client, uid=ADMIN_UID).get("/api/v1/owner/listings").status_code
        == 403
    )
    assert (
        authed(client, uid=ADMIN_UID).get("/api/v1/owner/listings/1").status_code
        == 403
    )
    assert (
        authed(client, uid=ADMIN_UID)
        .patch("/api/v1/owner/listings/1", json={})
        .status_code
        == 403
    )
    assert (
        authed(client, uid=ADMIN_UID)
        .post("/api/v1/owner/listings/1/availability", json={})
        .status_code
        == 403
    )
    assert (
        authed(client, uid=ADMIN_UID)
        .put("/api/v1/owner/listings/1/price-components", json=[])
        .status_code
        == 403
    )
    assert (
        authed(client, uid=ADMIN_UID)
        .post("/api/v1/owner/listings/1/photos:init", json={})
        .status_code
        == 403
    )
    assert (
        authed(client, uid=ADMIN_UID)
        .post("/api/v1/owner/listings/1/photos:confirm", json={})
        .status_code
        == 403
    )


# CREATE / LIST


def test_create_listing_201(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    data = create_listing(client, UID, unit_id)
    assert data["rental_unit_id"] == unit_id
    assert data["title"] == "Sunny PG near campus"
    assert data["status"] == "DRAFT"
    assert data["rent_basis"] == "PER_PERSON"
    assert data["price_components"] == []
    assert data["photos"] == []
    assert data["rental_unit"]["id"] == unit_id


def test_create_response_shape(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    data = create_listing(client, UID, unit_id)
    assert set(data) == {
        "id",
        "rental_unit_id",
        "title",
        "description",
        "rent_basis",
        "status",
        "availability_status",
        "available_from",
        "rental_unit",
        "price_components",
        "photos",
        "created_at",
        "updated_at",
    }


def test_create_status_field_forbidden_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/listings",
        json={**valid_listing(unit_id), "status": "PUBLISHED"},
    )
    assert res.status_code == 422, res.text  # extra forbid rejects status


def test_create_missing_title_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    payload = valid_listing(unit_id)
    del payload["title"]
    res = authed(client, uid=UID).post("/api/v1/owner/listings", json=payload)
    assert res.status_code == 422, res.text


def test_create_null_title_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/listings",
        json=valid_listing(unit_id, title=None),
    )
    assert res.status_code == 422, res.text


def test_create_title_too_short_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/listings", json=valid_listing(unit_id, title="A")
    )
    assert res.status_code == 422, res.text


def test_create_title_too_long_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/listings", json=valid_listing(unit_id, title="x" * 201)
    )
    assert res.status_code == 422, res.text


def test_create_blank_title_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/listings", json=valid_listing(unit_id, title="   ")
    )
    assert res.status_code == 422, res.text


def test_create_extra_fields_forbidden_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/listings",
        json={**valid_listing(unit_id), "owner_id": 999},
    )
    assert res.status_code == 422, res.text


def test_create_invalid_rent_basis_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/listings",
        json=valid_listing(unit_id, rent_basis="PER_NIGHT"),
    )
    assert res.status_code == 422, res.text


def test_create_invalid_availability_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/listings",
        json=valid_listing(unit_id, availability_status="SOON"),
    )
    assert res.status_code == 422, res.text


def test_create_from_date_missing_date_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/listings",
        json=valid_listing(unit_id, availability_status="AVAILABLE_FROM_DATE"),
    )
    assert res.status_code == 422, res.text


def test_create_from_date_past_date_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    past = (date.today() - timedelta(days=1)).isoformat()
    res = authed(client, uid=UID).post(
        "/api/v1/owner/listings",
        json=valid_listing(
            unit_id,
            availability_status="AVAILABLE_FROM_DATE",
            available_from=past,
        ),
    )
    assert res.status_code == 422, res.text


def test_create_under_missing_unit_404(client):
    provision_owner(client, UID)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/listings", json=valid_listing(999999)
    )
    assert res.status_code == 404, res.text


def test_create_under_foreign_unit_404(client):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    pid = create_property(client, OTHER_UID)
    foreign_unit = create_unit(client, OTHER_UID, pid)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/listings", json=valid_listing(foreign_unit)
    )
    assert res.status_code == 404, res.text


def test_second_listing_same_unit_409(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    create_listing(client, UID, unit_id)
    res = authed(client, uid=UID).post(
        "/api/v1/owner/listings", json=valid_listing(unit_id)
    )
    assert res.status_code == 409, res.text


def test_list_isolation(client):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    pid1 = create_property(client, UID)
    u1 = create_unit(client, UID, pid1)
    create_listing(client, UID, u1)
    pid2 = create_property(client, OTHER_UID)
    u2 = create_unit(client, OTHER_UID, pid2)
    create_listing(client, OTHER_UID, u2)
    res = authed(client, uid=UID).get("/api/v1/owner/listings")
    assert res.status_code == 200, res.text
    assert len(res.json()) == 1
    assert res.json()[0]["rental_unit_id"] == u1


def test_list_ordering_pagination(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    ids = []
    for _ in range(3):
        u = create_unit(client, UID, pid)
        d = create_listing(client, UID, u)
        ids.append(d["id"])
    ids.sort()
    res = authed(client, uid=UID).get(
        "/api/v1/owner/listings", params={"limit": 2, "offset": 0}
    )
    assert res.status_code == 200
    assert [r["id"] for r in res.json()] == ids[:2]
    res2 = authed(client, uid=UID).get(
        "/api/v1/owner/listings", params={"limit": 2, "offset": 2}
    )
    assert [r["id"] for r in res2.json()] == ids[2:]


def test_get_own_200(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    res = authed(client, uid=UID).get(f"/api/v1/owner/listings/{created['id']}")
    assert res.status_code == 200, res.text
    assert res.json()["id"] == created["id"]


def test_get_missing_404(client):
    provision_owner(client, UID)
    assert (
        authed(client, uid=UID).get("/api/v1/owner/listings/999999").status_code
        == 404
    )


def test_get_foreign_404(client):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    pid = create_property(client, OTHER_UID)
    unit_id = create_unit(client, OTHER_UID, pid)
    created = create_listing(client, OTHER_UID, unit_id)
    assert (
        authed(client, uid=UID)
        .get(f"/api/v1/owner/listings/{created['id']}")
        .status_code
        == 404
    )


def test_patch_foreign_404(client):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    pid = create_property(client, OTHER_UID)
    unit_id = create_unit(client, OTHER_UID, pid)
    created = create_listing(client, OTHER_UID, unit_id)
    assert (
        authed(client, uid=UID)
        .patch(
            f"/api/v1/owner/listings/{created['id']}",
            json={"title": "Hacked title here"},
        )
        .status_code
        == 404
    )
    assert (
        authed(client, uid=UID)
        .patch("/api/v1/owner/listings/999999", json={"title": "Nope"})
        .status_code
        == 404
    )


def test_availability_foreign_404(client):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    pid = create_property(client, OTHER_UID)
    unit_id = create_unit(client, OTHER_UID, pid)
    created = create_listing(client, OTHER_UID, unit_id)
    assert (
        authed(client, uid=UID)
        .post(
            f"/api/v1/owner/listings/{created['id']}/availability",
            json={"availability_status": "AVAILABLE_NOW"},
        )
        .status_code
        == 404
    )
    assert (
        authed(client, uid=UID)
        .post(
            "/api/v1/owner/listings/999999/availability",
            json={"availability_status": "AVAILABLE_NOW"},
        )
        .status_code
        == 404
    )


def test_price_foreign_404(client):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    pid = create_property(client, OTHER_UID)
    unit_id = create_unit(client, OTHER_UID, pid)
    created = create_listing(client, OTHER_UID, unit_id)
    assert (
        authed(client, uid=UID)
        .put(
            f"/api/v1/owner/listings/{created['id']}/price-components",
            json=[valid_price()],
        )
        .status_code
        == 404
    )
    assert (
        authed(client, uid=UID)
        .put("/api/v1/owner/listings/999999/price-components", json=[])
        .status_code
        == 404
    )


def test_photo_init_foreign_404(client):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    pid = create_property(client, OTHER_UID)
    unit_id = create_unit(client, OTHER_UID, pid)
    created = create_listing(client, OTHER_UID, unit_id)
    assert (
        authed(client, uid=UID)
        .post(
            f"/api/v1/owner/listings/{created['id']}/photos:init",
            json=valid_photo_init(),
        )
        .status_code
        == 404
    )
    assert (
        authed(client, uid=UID)
        .post(
            "/api/v1/owner/listings/999999/photos:init",
            json=valid_photo_init(),
        )
        .status_code
        == 404
    )


# PATCH


def test_patch_valid_partial(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/listings/{created['id']}",
        json={"title": "Updated title here"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["title"] == "Updated title here"
    assert res.json()["status"] == "DRAFT"


def test_patch_omitted_preserved(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/listings/{created['id']}",
        json={"description": "New desc"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["description"] == "New desc"
    assert res.json()["title"] == created["title"]


def test_patch_null_title_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/listings/{created['id']}", json={"title": None}
    )
    assert res.status_code == 422, res.text


def test_patch_extra_forbidden_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/listings/{created['id']}", json={"status": "PUBLISHED"}
    )
    assert res.status_code == 422, res.text


def test_patch_rent_basis_inconsistent_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    lid = created["id"]
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{lid}/price-components",
        json=[valid_price()],
    )
    assert res.status_code == 200, res.text
    res2 = authed(client, uid=UID).patch(
        f"/api/v1/owner/listings/{lid}", json={"rent_basis": "PER_ROOM"}
    )
    assert res2.status_code == 422, res2.text


# AVAILABILITY


def test_availability_now(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/availability",
        json={"availability_status": "AVAILABLE_NOW", "available_from": None},
    )
    assert res.status_code == 200, res.text
    assert res.json()["availability_status"] == "AVAILABLE_NOW"


def test_availability_from_date_valid(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    future = (date.today() + timedelta(days=5)).isoformat()
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/availability",
        json={
            "availability_status": "AVAILABLE_FROM_DATE",
            "available_from": future,
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["available_from"] == future


def test_availability_past_rejected(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    past = (date.today() - timedelta(days=1)).isoformat()
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/availability",
        json={
            "availability_status": "AVAILABLE_FROM_DATE",
            "available_from": past,
        },
    )
    assert res.status_code == 422, res.text


def test_availability_occupied_draft_ok(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/availability",
        json={"availability_status": "OCCUPIED"},
    )
    assert res.status_code == 200, res.text


def test_availability_occupied_published_conflict(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    set_listing_status(engine, created["id"], "PUBLISHED")
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/availability",
        json={"availability_status": "OCCUPIED"},
    )
    assert res.status_code == 422, res.text


# PRICE


def test_price_valid_replacement(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{created['id']}/price-components",
        json=[valid_price()],
    )
    assert res.status_code == 200, res.text
    assert len(res.json()) == 1
    assert res.json()[0]["charge_type"] == "RENT"


def test_price_replacement_removes_old(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    lid = created["id"]
    authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{lid}/price-components",
        json=[valid_price()],
    )
    maint = valid_price(
        charge_type="MAINTENANCE",
        calculation_basis="PER_PERSON",
        billing_frequency="MONTHLY",
        variability="FIXED",
        amount_paise=50000,
        payment_timing="PER_PERIOD",
        mandatory=False,
    )
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{lid}/price-components", json=[maint]
    )
    assert res.status_code == 200, res.text
    assert len(res.json()) == 1
    assert res.json()[0]["charge_type"] == "MAINTENANCE"


def test_price_clear_all(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    lid = created["id"]
    authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{lid}/price-components",
        json=[valid_price()],
    )
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{lid}/price-components", json=[]
    )
    assert res.status_code == 200, res.text
    assert res.json() == []


def test_price_duplicate_409(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{created['id']}/price-components",
        json=[valid_price(), valid_price()],
    )
    assert res.status_code == 409, res.text


def test_price_c1_violation_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    bad = valid_price(amount_paise=None, rate_paise_per_unit=None)
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{created['id']}/price-components", json=[bad]
    )
    assert res.status_code == 422, res.text


def test_price_c1_both_set_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    bad = valid_price(amount_paise=100, rate_paise_per_unit=10)
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{created['id']}/price-components", json=[bad]
    )
    assert res.status_code == 422, res.text


def test_price_c5_deposit_violation_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    bad = valid_price(
        charge_type="DEPOSIT",
        calculation_basis="PER_PERSON",
        billing_frequency="MONTHLY",
        variability="FIXED",
        amount_paise=50000,
        payment_timing="PER_PERIOD",
        refundable=True,
    )
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{created['id']}/price-components", json=[bad]
    )
    assert res.status_code == 422, res.text


def test_price_c6_rent_violation_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    bad = valid_price(mandatory=False)
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{created['id']}/price-components", json=[bad]
    )
    assert res.status_code == 422, res.text


def test_price_c9_other_label_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    bad = valid_price(charge_type="OTHER")
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{created['id']}/price-components", json=[bad]
    )
    assert res.status_code == 422, res.text


def test_price_rent_basis_inconsistent_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    bad = valid_price(calculation_basis="PER_ROOM")
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{created['id']}/price-components", json=[bad]
    )
    assert res.status_code == 422, res.text


def test_price_atomic_rollback_on_invalid(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    lid = created["id"]
    seed = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{lid}/price-components",
        json=[valid_price()],
    )
    assert seed.status_code == 200, seed.text
    assert len(seed.json()) == 1
    bad = valid_price(amount_paise=None, rate_paise_per_unit=None)
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{lid}/price-components",
        json=[valid_price(display_order=1), bad],
    )
    assert res.status_code == 422, res.text
    after = authed(client, uid=UID).get(f"/api/v1/owner/listings/{lid}")
    assert after.status_code == 200, after.text
    comps = after.json()["price_components"]
    assert len(comps) == 1
    assert comps[0]["charge_type"] == "RENT"
    assert comps[0]["amount_paise"] == 800000


# PHOTOS


def test_photo_init_201(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:init",
        json=valid_photo_init(),
    )
    assert res.status_code == 201, res.text
    assert res.json()["upload_status"] == "PENDING"


def test_photo_init_invalid_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:init",
        json=valid_photo_init(width=-5),
    )
    assert res.status_code == 422, res.text


def test_photo_duplicate_key_409(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    payload = valid_photo_init(storage_key="t2e-dup-key-1")
    res1 = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:init", json=payload
    )
    assert res1.status_code == 201, res1.text
    res2 = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:init", json=payload
    )
    assert res2.status_code == 409, res2.text


def test_photo_confirm_ready(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    key = f"t2e-confirm-{uuid.uuid4().hex}"
    init = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:init",
        json=valid_photo_init(storage_key=key),
    )
    assert init.status_code == 201, init.text
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:confirm",
        json={"storage_key": key},
    )
    assert res.status_code == 200, res.text
    assert res.json()["upload_status"] == "READY"


def test_photo_confirm_missing_404(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:confirm",
        json={"storage_key": "t2e-no-such-key"},
    )
    assert res.status_code == 404, res.text


def test_photo_confirm_wrong_listing_404(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    u1 = create_unit(client, UID, pid)
    u2 = create_unit(client, UID, pid)
    l1 = create_listing(client, UID, u1)
    l2 = create_listing(client, UID, u2)
    key = f"t2e-wrong-{uuid.uuid4().hex}"
    init = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{l1['id']}/photos:init",
        json=valid_photo_init(storage_key=key),
    )
    assert init.status_code == 201, init.text
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{l2['id']}/photos:confirm",
        json={"storage_key": key},
    )
    assert res.status_code == 404, res.text


def test_photo_confirm_twice_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    key = f"t2e-twice-{uuid.uuid4().hex}"
    authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:init",
        json=valid_photo_init(storage_key=key),
    )
    first = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:confirm",
        json={"storage_key": key},
    )
    assert first.status_code == 200, first.text
    second = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:confirm",
        json={"storage_key": key},
    )
    assert second.status_code == 422, second.text


# 2E-B HELPERS


def insert_area(engine, name):
    db = sessionmaker(bind=engine)()
    try:
        loc = Location(
            type="area", name=f"2E Test {name} {uuid.uuid4().hex[:6]}",
            city="Guwahati",
        )
        db.add(loc)
        db.commit()
        db.refresh(loc)
        return loc.id
    finally:
        db.close()


def set_property_area(client, uid, pid, area_id):
    res = authed(client, uid=uid).patch(
        f"/api/v1/owner/properties/{pid}",
        json={"area_location_id": area_id},
    )
    assert res.status_code == 200, res.text


def blank_property_field(engine, pid, field, value):
    db = sessionmaker(bind=engine)()
    try:
        db.query(Property).filter(Property.id == pid).update({field: value})
        db.commit()
    finally:
        db.close()


def add_ready_photo(client, uid, lid, display_order=0, is_cover=False):
    key = f"t2e-2b-{uuid.uuid4().hex}"
    init = authed(client, uid=uid).post(
        f"/api/v1/owner/listings/{lid}/photos:init",
        json=valid_photo_init(
            storage_key=key,
            display_order=display_order,
            is_cover=is_cover,
        ),
    )
    assert init.status_code == 201, init.text
    conf = authed(client, uid=uid).post(
        f"/api/v1/owner/listings/{lid}/photos:confirm",
        json={"storage_key": key},
    )
    assert conf.status_code == 200, conf.text
    return conf.json()


def add_pending_photo(client, uid, lid, display_order=0, is_cover=False):
    key = f"t2e-2b-{uuid.uuid4().hex}"
    init = authed(client, uid=uid).post(
        f"/api/v1/owner/listings/{lid}/photos:init",
        json=valid_photo_init(
            storage_key=key,
            display_order=display_order,
            is_cover=is_cover,
        ),
    )
    assert init.status_code == 201, init.text
    return init.json()


def seed_rent(client, uid, lid):
    res = authed(client, uid=uid).put(
        f"/api/v1/owner/listings/{lid}/price-components",
        json=[valid_price()],
    )
    assert res.status_code == 200, res.text


def make_publishable(client, engine, uid):
    pid = create_property(client, uid)
    set_property_area(client, uid, pid, insert_area(engine, "area"))
    unit_id = create_unit(client, uid, pid)
    created = create_listing(client, uid, unit_id)
    lid = created["id"]
    seed_rent(client, uid, lid)
    for i in range(3):
        add_ready_photo(client, uid, lid, display_order=i)
    return pid, lid


# 2E-B AUTH


def test_publish_pause_unauthenticated_401(client):
    assert (
        client.post("/api/v1/owner/listings/1/publish").status_code == 401
    )
    assert client.post("/api/v1/owner/listings/1/pause").status_code == 401


def test_publish_pause_user_403(client):
    provision_user(client, USER_UID)
    assert (
        authed(client, uid=USER_UID)
        .post("/api/v1/owner/listings/1/publish")
        .status_code
        == 403
    )
    assert (
        authed(client, uid=USER_UID)
        .post("/api/v1/owner/listings/1/pause")
        .status_code
        == 403
    )


def test_publish_pause_admin_403(client, engine):
    provision_user(client, ADMIN_UID)
    set_role(engine, ADMIN_UID, "ADMIN")
    assert (
        authed(client, uid=ADMIN_UID)
        .post("/api/v1/owner/listings/1/publish")
        .status_code
        == 403
    )
    assert (
        authed(client, uid=ADMIN_UID)
        .post("/api/v1/owner/listings/1/pause")
        .status_code
        == 403
    )


def test_publish_foreign_404(client, engine):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    _, foreign_lid = make_publishable(client, engine, OTHER_UID)
    assert (
        authed(client, uid=UID)
        .post(f"/api/v1/owner/listings/{foreign_lid}/publish")
        .status_code
        == 404
    )
    assert (
        authed(client, uid=UID)
        .post("/api/v1/owner/listings/999999/publish")
        .status_code
        == 404
    )


def test_pause_foreign_404(client, engine):
    provision_owner(client, UID)
    provision_owner(client, OTHER_UID)
    _, foreign_lid = make_publishable(client, engine, OTHER_UID)
    assert (
        authed(client, uid=UID)
        .post(f"/api/v1/owner/listings/{foreign_lid}/pause")
        .status_code
        == 404
    )
    assert (
        authed(client, uid=UID)
        .post("/api/v1/owner/listings/999999/pause")
        .status_code
        == 404
    )


# 2E-B PUBLISH


def test_publish_happy_path(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/publish"
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "PUBLISHED"
    assert len(data["price_components"]) == 1
    assert len([p for p in data["photos"] if p["upload_status"] == "READY"]) >= 3


def test_publish_from_paused(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    assert (
        authed(client, uid=UID)
        .post(f"/api/v1/owner/listings/{lid}/publish")
        .status_code
        == 200
    )
    assert (
        authed(client, uid=UID)
        .post(f"/api/v1/owner/listings/{lid}/pause")
        .status_code
        == 200
    )
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/publish"
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "PUBLISHED"


def test_publish_fewer_than_3_ready_422(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    set_property_area(client, UID, pid, insert_area(engine, "area"))
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    lid = created["id"]
    seed_rent(client, UID, lid)
    add_ready_photo(client, UID, lid, display_order=0)
    add_ready_photo(client, UID, lid, display_order=1)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/publish"
    )
    assert res.status_code == 422, res.text
    after = authed(client, uid=UID).get(f"/api/v1/owner/listings/{lid}")
    assert after.json()["status"] == "DRAFT"


def test_publish_no_rent_422(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{lid}/price-components", json=[]
    )
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/publish"
    )
    assert res.status_code == 422, res.text
    after = authed(client, uid=UID).get(f"/api/v1/owner/listings/{lid}")
    assert after.json()["status"] == "DRAFT"


def test_publish_missing_area_422(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    lid = created["id"]
    seed_rent(client, UID, lid)
    for i in range(3):
        add_ready_photo(client, UID, lid, display_order=i)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/publish"
    )
    assert res.status_code == 422, res.text


def test_publish_blank_address_422(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    db = sessionmaker(bind=engine)()
    try:
        pid = (
            db.query(RentalUnit.property_id)
            .join(Listing, Listing.rental_unit_id == RentalUnit.id)
            .filter(Listing.id == lid)
            .scalar()
        )
    finally:
        db.close()
    blank_property_field(engine, pid, "address_line", "   ")
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/publish"
    )
    assert res.status_code == 422, res.text


def test_publish_blank_city_422(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    db = sessionmaker(bind=engine)()
    try:
        pid = (
            db.query(RentalUnit.property_id)
            .join(Listing, Listing.rental_unit_id == RentalUnit.id)
            .filter(Listing.id == lid)
            .scalar()
        )
    finally:
        db.close()
    blank_property_field(engine, pid, "city", "  ")
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/publish"
    )
    assert res.status_code == 422, res.text


def test_publish_occupied_422(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/availability",
        json={"availability_status": "OCCUPIED"},
    )
    assert res.status_code == 200, res.text
    pub = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/publish"
    )
    assert pub.status_code == 422, pub.text


def test_publish_already_published_422(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    assert (
        authed(client, uid=UID)
        .post(f"/api/v1/owner/listings/{lid}/publish")
        .status_code
        == 200
    )
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/publish"
    )
    assert res.status_code == 422, res.text


# 2E-B PHOTO RULES


def test_15_total_photos_ok(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    for _ in range(12):
        add_pending_photo(client, UID, lid)
    res = authed(client, uid=UID).get(f"/api/v1/owner/listings/{lid}")
    assert len(res.json()["photos"]) == 15


def test_16th_photo_rejected(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    for _ in range(12):
        add_pending_photo(client, UID, lid)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/photos:init",
        json=valid_photo_init(),
    )
    assert res.status_code == 422, res.text


# 2E-B COVER


def test_cover_explicit_single(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    set_property_area(client, UID, pid, insert_area(engine, "area"))
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    lid = created["id"]
    seed_rent(client, UID, lid)
    add_ready_photo(client, UID, lid, display_order=0, is_cover=False)
    add_ready_photo(client, UID, lid, display_order=1, is_cover=False)
    winner = add_ready_photo(client, UID, lid, display_order=2, is_cover=True)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/publish"
    )
    assert res.status_code == 200, res.text
    covers = [p for p in res.json()["photos"] if p["is_cover"]]
    assert len(covers) == 1
    assert covers[0]["id"] == winner["id"]


def test_cover_multiple_lowest_wins(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    set_property_area(client, UID, pid, insert_area(engine, "area"))
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    lid = created["id"]
    seed_rent(client, UID, lid)
    add_ready_photo(client, UID, lid, display_order=0, is_cover=False)
    low = add_ready_photo(client, UID, lid, display_order=1, is_cover=True)
    add_ready_photo(client, UID, lid, display_order=5, is_cover=True)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/publish"
    )
    assert res.status_code == 200, res.text
    covers = [p for p in res.json()["photos"] if p["is_cover"]]
    assert len(covers) == 1
    assert covers[0]["id"] == low["id"]


def test_cover_none_lowest_ready(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    set_property_area(client, UID, pid, insert_area(engine, "area"))
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    lid = created["id"]
    seed_rent(client, UID, lid)
    add_ready_photo(client, UID, lid, display_order=2, is_cover=False)
    add_ready_photo(client, UID, lid, display_order=0, is_cover=False)
    add_ready_photo(client, UID, lid, display_order=1, is_cover=False)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/publish"
    )
    assert res.status_code == 200, res.text
    covers = [p for p in res.json()["photos"] if p["is_cover"]]
    assert len(covers) == 1
    assert covers[0]["display_order"] == 0


def test_cover_pending_ignored(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    set_property_area(client, UID, pid, insert_area(engine, "area"))
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    lid = created["id"]
    seed_rent(client, UID, lid)
    first = add_ready_photo(client, UID, lid, display_order=1, is_cover=False)
    add_ready_photo(client, UID, lid, display_order=2, is_cover=False)
    add_ready_photo(client, UID, lid, display_order=3, is_cover=False)
    pending = add_pending_photo(client, UID, lid, display_order=0, is_cover=True)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/publish"
    )
    assert res.status_code == 200, res.text
    covers = [p for p in res.json()["photos"] if p["is_cover"]]
    assert len(covers) == 1
    assert covers[0]["id"] == first["id"]
    pend = [p for p in res.json()["photos"] if p["id"] == pending["id"]][0]
    assert pend["is_cover"] is False


# 2E-B PAUSE / LIFECYCLE


def test_pause_published_to_paused(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    authed(client, uid=UID).post(f"/api/v1/owner/listings/{lid}/publish")
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/pause"
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "PAUSED"
    assert data["title"]
    assert len(data["price_components"]) == 1
    assert len(data["photos"]) >= 3


def test_pause_draft_422(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/pause"
    )
    assert res.status_code == 422, res.text


def test_pause_twice_422(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    authed(client, uid=UID).post(f"/api/v1/owner/listings/{lid}/publish")
    assert (
        authed(client, uid=UID)
        .post(f"/api/v1/owner/listings/{lid}/pause")
        .status_code
        == 200
    )
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/pause"
    )
    assert res.status_code == 422, res.text


def test_lifecycle_full_cycle(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    assert (
        authed(client, uid=UID)
        .post(f"/api/v1/owner/listings/{lid}/publish")
        .json()["status"]
        == "PUBLISHED"
    )
    assert (
        authed(client, uid=UID)
        .post(f"/api/v1/owner/listings/{lid}/pause")
        .json()["status"]
        == "PAUSED"
    )
    assert (
        authed(client, uid=UID)
        .post(f"/api/v1/owner/listings/{lid}/publish")
        .json()["status"]
        == "PUBLISHED"
    )


# 2E-B OCCUPIED


def test_paused_occupied_valid(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    authed(client, uid=UID).post(f"/api/v1/owner/listings/{lid}/publish")
    authed(client, uid=UID).post(f"/api/v1/owner/listings/{lid}/pause")
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/availability",
        json={"availability_status": "OCCUPIED"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["availability_status"] == "OCCUPIED"
    assert res.json()["status"] == "PAUSED"


def test_occupied_to_available_paused_ok(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/availability",
        json={"availability_status": "OCCUPIED"},
    )
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/availability",
        json={"availability_status": "AVAILABLE_NOW", "available_from": None},
    )
    assert res.status_code == 200, res.text
    assert res.json()["availability_status"] == "AVAILABLE_NOW"


# 2E-B PRICE C2/C4/C7/C8


def test_price_c2_consumption_422(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    bad = valid_price(
        charge_type="ELECTRICITY",
        calculation_basis="CONSUMPTION",
        billing_frequency="MONTHLY",
        variability="FIXED",
        amount_paise=1000,
    )
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{lid}/price-components", json=[bad]
    )
    assert res.status_code == 422, res.text


def test_price_c4_variable_422(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    bad = valid_price(
        charge_type="MAINTENANCE",
        calculation_basis="PER_PERSON",
        billing_frequency="MONTHLY",
        variability="VARIABLE",
        amount_paise=50000,
        payment_timing="PER_PERIOD",
    )
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{lid}/price-components", json=[bad]
    )
    assert res.status_code == 422, res.text


def test_price_c7_one_time_422(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    bad = valid_price(
        charge_type="MAINTENANCE",
        calculation_basis="PER_PERSON",
        billing_frequency="ONE_TIME",
        variability="FIXED",
        amount_paise=50000,
        payment_timing="PER_PERIOD",
    )
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{lid}/price-components", json=[bad]
    )
    assert res.status_code == 422, res.text


def test_price_c8_periodic_422(client, engine):
    provision_owner(client, UID)
    _, lid = make_publishable(client, engine, UID)
    bad = valid_price(
        charge_type="MAINTENANCE",
        calculation_basis="PER_PERSON",
        billing_frequency="MONTHLY",
        variability="FIXED",
        amount_paise=None,
        rate_paise_per_unit=50,
        payment_timing="PER_PERIOD",
    )
    res = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{lid}/price-components", json=[bad]
    )
    assert res.status_code == 422, res.text


# 2E-B PHOTO CONFIRM METADATA


def test_photo_confirm_metadata_persists(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    key = f"t2e-meta-{uuid.uuid4().hex}"
    authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:init",
        json=valid_photo_init(storage_key=key),
    )
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:confirm",
        json={
            "storage_key": key,
            "mime": "image/png",
            "width": 800,
            "height": 600,
            "display_order": 4,
            "is_cover": True,
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["mime"] == "image/png"
    assert data["width"] == 800
    assert data["height"] == 600
    assert data["display_order"] == 4
    assert data["is_cover"] is True
    assert data["upload_status"] == "READY"
