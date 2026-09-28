"""Real photo upload lifecycle (Phase 2H): server-generated keys, presigned
B2 uploads, verified confirmation, delete/order/cover, READY-gated publish.

Storage is fully mocked via FakeStorageService: no network, no credentials.
"""
import os
import uuid

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
    Property,
    RentalUnit,
    RentalUnitAmenity,
    User,
    UserProfile,
)
from app.storage import FakeStorageService, get_storage_or_none

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://rent:rent@localhost:5433/rent",
)

UID = "t2h-owner-1"
OTHER_UID = "t2h-owner-2"
USER_UID = "t2h-user-1"

MAX_BYTES = 5 * 1024 * 1024


def claims(**kwargs):
    uid = kwargs.get("uid", UID)
    base = {
        "uid": uid,
        "email": f"{uid}@example.com",
        "email_verified": False,
        "name": "T2H Owner",
        "aud": "demo-apun-ghar",
    }
    base.update(kwargs)
    return base


def authed(client, **kwargs):
    app.dependency_overrides[auth_module.get_firebase_claims] = lambda: claims(
        **kwargs
    )
    return client


def _fake():
    return app.dependency_overrides[get_storage_or_none]()


@pytest.fixture(scope="module")
def engine():
    eng = create_engine(DATABASE_URL)
    try:
        with eng.connect():
            pass
    except Exception:
        pytest.skip("local PostgreSQL is not reachable")
    if not inspect(eng).has_table("listing_photos"):
        pytest.skip("listing_photos table missing: run 'alembic upgrade head' first")
    yield eng
    eng.dispose()


def cleanup(engine):
    db = sessionmaker(bind=engine)()
    try:
        t2h_users = db.query(User.id).filter(User.firebase_uid.like("t2h-%"))
        t2h_props = db.query(Property.id).filter(
            Property.owner_user_id.in_(t2h_users)
        )
        t2h_units = db.query(RentalUnit.id).filter(
            RentalUnit.property_id.in_(t2h_props)
        )
        t2h_listings = db.query(Listing.id).filter(
            Listing.rental_unit_id.in_(t2h_units)
        )
        db.query(ListingPhoto).filter(
            ListingPhoto.listing_id.in_(t2h_listings)
        ).delete(synchronize_session=False)
        db.query(ListingPriceComponent).filter(
            ListingPriceComponent.listing_id.in_(t2h_listings)
        ).delete(synchronize_session=False)
        db.query(Listing).filter(Listing.id.in_(t2h_listings)).delete(
            synchronize_session=False
        )
        db.query(RentalUnitAmenity).filter(
            RentalUnitAmenity.rental_unit_id.in_(t2h_units)
        ).delete(synchronize_session=False)
        db.query(RentalUnit).filter(RentalUnit.id.in_(t2h_units)).delete(
            synchronize_session=False
        )
        t2h_users = db.query(User.id).filter(User.firebase_uid.like("t2h-%"))
        db.query(Property).filter(
            Property.owner_user_id.in_(t2h_users)
        ).delete(synchronize_session=False)
        t2h_users = db.query(User.id).filter(User.firebase_uid.like("t2h-%"))
        db.query(UserProfile).filter(
            UserProfile.user_id.in_(t2h_users)
        ).delete(synchronize_session=False)
        db.query(User).filter(User.firebase_uid.like("t2h-%")).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def storage_fake():
    return FakeStorageService()


@pytest.fixture()
def client(engine, storage_fake):
    app.dependency_overrides[get_storage_or_none] = lambda: storage_fake
    cleanup(engine)
    c = TestClient(app, raise_server_exceptions=False)
    yield c
    app.dependency_overrides.clear()
    cleanup(engine)


def provision_owner(client, uid):
    res = authed(client, uid=uid).post(
        "/api/v1/owners/signup",
        json={"display_name": "T2H Owner", "phone_number": "+911234567890"},
    )
    assert res.status_code == 201, res.text


def provision_user(client, uid):
    res = authed(client, uid=uid).get("/api/v1/users/me")
    assert res.status_code == 200, res.text


def create_property(client, uid, **kwargs):
    payload = {
        "property_type": "PG",
        "address_line": f"  {uid} Test Road  ",
        "area_custom_name": "2H Custom Area",
    }
    payload.update(kwargs)
    res = authed(client, uid=uid).post("/api/v1/owner/properties", json=payload)
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


def create_listing(client, uid, unit_id):
    res = authed(client, uid=uid).post(
        "/api/v1/owner/listings",
        json={
            "title": "Sunny PG near campus",
            "description": "Spacious room with attached bath",
            "rental_unit_id": unit_id,
            "rent_basis": "PER_PERSON",
            "availability_status": "AVAILABLE_NOW",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def seed_rent(client, uid, lid):
    res = authed(client, uid=uid).put(
        f"/api/v1/owner/listings/{lid}/price-components",
        json=[
            {
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
        ],
    )
    assert res.status_code == 200, res.text


def init_photo(client, uid, lid, **kwargs):
    base = {"content_type": "image/jpeg", "size_bytes": 1024}
    base.update(kwargs)
    res = authed(client, uid=uid).post(
        f"/api/v1/owner/listings/{lid}/photos:init", json=base
    )
    assert res.status_code == 201, res.text
    return res.json()


def upload_and_confirm(client, uid, lid, photo, size=1024,
                       content_type="image/jpeg", **confirm_kwargs):
    _fake().put_object(photo["storage_key"], size, content_type)
    res = authed(client, uid=uid).post(
        f"/api/v1/owner/listings/{lid}/photos/{photo['id']}/confirm",
        json=confirm_kwargs,
    )
    assert res.status_code == 200, res.text
    return res.json()


def make_listing(client, uid):
    provision_owner(client, uid)
    pid = create_property(client, uid)
    unit_id = create_unit(client, uid, pid)
    return create_listing(client, uid, unit_id)


# INIT


def test_init_returns_server_key_and_upload_url(client):
    created = make_listing(client, UID)
    lid = created["id"]
    data = init_photo(client, UID, lid)
    assert data["upload_status"] == "PENDING"
    assert data["mime"] == "image/jpeg"
    assert data["size_bytes"] is None
    assert data["storage_key"] == (
        f"listings/{lid}/photos/{data['id']}.jpg"
    )
    assert "t2h" not in data["storage_key"]
    assert data["upload_url"].startswith("https://fake-b2.test/upload/")
    assert data["upload_expires_in"] == 900


def test_init_png_extension(client):
    created = make_listing(client, UID)
    data = init_photo(client, UID, created["id"], content_type="image/png")
    assert data["storage_key"].endswith(".png")


def test_init_unauthenticated_401(client):
    assert client.post(
        "/api/v1/owner/listings/1/photos:init", json={}
    ).status_code == 401


def test_init_non_owner_403(client):
    created = make_listing(client, UID)
    provision_user(client, USER_UID)
    res = authed(client, uid=USER_UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:init",
        json={"content_type": "image/jpeg", "size_bytes": 10},
    )
    assert res.status_code == 403, res.text


def test_init_foreign_listing_404(client):
    make_listing(client, UID)
    provision_owner(client, OTHER_UID)
    res = authed(client, uid=OTHER_UID).post(
        "/api/v1/owner/listings/999999/photos:init",
        json={"content_type": "image/jpeg", "size_bytes": 10},
    )
    assert res.status_code == 404, res.text


def test_init_invalid_mime_422(client):
    created = make_listing(client, UID)
    for bad in ["image/gif", "video/mp4", "application/pdf", "text/plain"]:
        res = authed(client, uid=UID).post(
            f"/api/v1/owner/listings/{created['id']}/photos:init",
            json={"content_type": bad, "size_bytes": 10},
        )
        assert res.status_code == 422, (bad, res.text)


def test_init_too_large_422(client):
    created = make_listing(client, UID)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos:init",
        json={"content_type": "image/jpeg", "size_bytes": MAX_BYTES + 1},
    )
    assert res.status_code == 422, res.text


def test_init_16th_rejected(client):
    created = make_listing(client, UID)
    lid = created["id"]
    for _ in range(15):
        init_photo(client, UID, lid)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/photos:init",
        json={"content_type": "image/jpeg", "size_bytes": 10},
    )
    assert res.status_code == 422, res.text
    assert "15" in res.json()["detail"]


# CONFIRM


def test_confirm_ready_with_verified_size(client):
    created = make_listing(client, UID)
    lid = created["id"]
    photo = init_photo(client, UID, lid)
    data = upload_and_confirm(client, UID, lid, photo, size=2048)
    assert data["upload_status"] == "READY"
    assert data["size_bytes"] == 2048
    assert data["view_url"].startswith("https://fake-b2.test/view/")


def test_confirm_without_upload_422_stays_pending(client):
    created = make_listing(client, UID)
    lid = created["id"]
    photo = init_photo(client, UID, lid)
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/photos/{photo['id']}/confirm", json={}
    )
    assert res.status_code == 422, res.text
    assert "retry" in res.json()["detail"]
    row = authed(client, uid=UID).get(
        f"/api/v1/owner/listings/{lid}"
    ).json()["photos"][0]
    assert row["upload_status"] == "PENDING"


def test_confirm_oversize_object_422(client):
    created = make_listing(client, UID)
    lid = created["id"]
    photo = init_photo(client, UID, lid)
    _fake().put_object(photo["storage_key"], MAX_BYTES + 1, "image/jpeg")
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/photos/{photo['id']}/confirm", json={}
    )
    assert res.status_code == 422, res.text
    assert "5 MB" in res.json()["detail"]


def test_confirm_type_mismatch_422(client):
    created = make_listing(client, UID)
    lid = created["id"]
    photo = init_photo(client, UID, lid, content_type="image/png")
    _fake().put_object(photo["storage_key"], 100, "image/jpeg")
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/photos/{photo['id']}/confirm", json={}
    )
    assert res.status_code == 422, res.text


def test_confirm_wrong_listing_404(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    u1 = create_unit(client, UID, pid)
    u2 = create_unit(client, UID, pid)
    l1 = create_listing(client, UID, u1)
    l2 = create_listing(client, UID, u2)
    photo = init_photo(client, UID, l1["id"])
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{l2['id']}/photos/{photo['id']}/confirm",
        json={},
    )
    assert res.status_code == 404, res.text


def test_confirm_non_owner_403(client):
    created = make_listing(client, UID)
    photo = init_photo(client, UID, created["id"])
    provision_user(client, USER_UID)
    res = authed(client, uid=USER_UID).post(
        f"/api/v1/owner/listings/{created['id']}/photos/{photo['id']}/confirm",
        json={},
    )
    assert res.status_code == 403, res.text


# DELETE / ORDER / COVER


def test_delete_removes_row_and_object(client):
    created = make_listing(client, UID)
    lid = created["id"]
    photo = init_photo(client, UID, lid)
    data = upload_and_confirm(client, UID, lid, photo)
    assert data["upload_status"] == "READY"
    res = authed(client, uid=UID).delete(
        f"/api/v1/owner/listings/{lid}/photos/{photo['id']}"
    )
    assert res.status_code == 204, res.text
    assert photo["storage_key"] in _fake().deleted
    rows = authed(client, uid=UID).get(
        f"/api/v1/owner/listings/{lid}"
    ).json()["photos"]
    assert rows == []


def test_delete_missing_404(client):
    created = make_listing(client, UID)
    res = authed(client, uid=UID).delete(
        f"/api/v1/owner/listings/{created['id']}/photos/999999"
    )
    assert res.status_code == 404, res.text


def test_delete_non_owner_403(client):
    created = make_listing(client, UID)
    photo = init_photo(client, UID, created["id"])
    provision_user(client, USER_UID)
    res = authed(client, uid=USER_UID).delete(
        f"/api/v1/owner/listings/{created['id']}/photos/{photo['id']}"
    )
    assert res.status_code == 403, res.text


def test_patch_order_reflected_in_reads(client):
    created = make_listing(client, UID)
    lid = created["id"]
    first = upload_and_confirm(
        client, UID, lid, init_photo(client, UID, lid, display_order=0)
    )
    second = upload_and_confirm(
        client, UID, lid, init_photo(client, UID, lid, display_order=1)
    )
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/listings/{lid}/photos/{first['id']}",
        json={"display_order": 5},
    )
    assert res.status_code == 200, res.text
    assert res.json()["display_order"] == 5
    ids = [
        p["id"]
        for p in authed(client, uid=UID).get(
            f"/api/v1/owner/listings/{lid}"
        ).json()["photos"]
    ]
    assert ids == [second["id"], first["id"]]


def test_patch_cover_clears_others(client):
    created = make_listing(client, UID)
    lid = created["id"]
    first = upload_and_confirm(client, UID, lid, init_photo(client, UID, lid))
    second = upload_and_confirm(client, UID, lid, init_photo(client, UID, lid))
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/listings/{lid}/photos/{second['id']}",
        json={"is_cover": True},
    )
    assert res.status_code == 200, res.text
    covers = [
        p
        for p in authed(client, uid=UID).get(
            f"/api/v1/owner/listings/{lid}"
        ).json()["photos"]
        if p["is_cover"]
    ]
    assert [c["id"] for c in covers] == [second["id"]]
    assert first["id"] not in [c["id"] for c in covers]


# PUBLISH GATING


def make_publishable(client, uid):
    provision_owner(client, uid)
    pid = create_property(client, uid)
    unit_id = create_unit(client, uid, pid)
    created = create_listing(client, uid, unit_id)
    seed_rent(client, uid, created["id"])
    return created["id"]


def test_three_pending_photos_not_publishable(client):
    lid = make_publishable(client, UID)
    for _ in range(3):
        init_photo(client, UID, lid)
    res = authed(client, uid=UID).post(f"/api/v1/owner/listings/{lid}/publish")
    assert res.status_code == 422, res.text
    assert "3 READY" in res.json()["detail"]


def test_two_ready_one_pending_not_publishable(client):
    lid = make_publishable(client, UID)
    for _ in range(2):
        photo = init_photo(client, UID, lid)
        upload_and_confirm(client, UID, lid, photo)
    init_photo(client, UID, lid)
    res = authed(client, uid=UID).post(f"/api/v1/owner/listings/{lid}/publish")
    assert res.status_code == 422, res.text


def test_three_ready_publish_200_with_custom_area(client):
    lid = make_publishable(client, UID)
    for _ in range(3):
        photo = init_photo(client, UID, lid)
        data = upload_and_confirm(client, UID, lid, photo)
        assert data["upload_status"] == "READY"
    res = authed(client, uid=UID).post(f"/api/v1/owner/listings/{lid}/publish")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "PUBLISHED"
    assert len([p for p in body["photos"] if p["upload_status"] == "READY"]) == 3
    assert all(p["view_url"] for p in body["photos"])


def test_confirm_storage_error_503_stays_pending(client):
    created = make_listing(client, UID)
    lid = created["id"]
    photo = init_photo(client, UID, lid)
    _fake().fail_keys.add(photo["storage_key"])
    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/photos/{photo['id']}/confirm", json={}
    )
    assert res.status_code == 503, res.text
    assert "unavailable" in res.json()["detail"]
    row = authed(client, uid=UID).get(
        f"/api/v1/owner/listings/{lid}"
    ).json()["photos"][0]
    assert row["upload_status"] == "PENDING"


def test_delete_storage_error_503_row_kept(client):
    created = make_listing(client, UID)
    lid = created["id"]
    photo = init_photo(client, UID, lid)
    data = upload_and_confirm(client, UID, lid, photo)
    assert data["upload_status"] == "READY"
    _fake().fail_keys.add(photo["storage_key"])
    res = authed(client, uid=UID).delete(
        f"/api/v1/owner/listings/{lid}/photos/{photo['id']}"
    )
    assert res.status_code == 503, res.text
    assert photo["storage_key"] not in _fake().deleted
    rows = authed(client, uid=UID).get(
        f"/api/v1/owner/listings/{lid}"
    ).json()["photos"]
    assert [p["id"] for p in rows] == [photo["id"]]


def test_delete_missing_object_still_deletes_row(client):
    created = make_listing(client, UID)
    lid = created["id"]
    photo = init_photo(client, UID, lid)
    res = authed(client, uid=UID).delete(
        f"/api/v1/owner/listings/{lid}/photos/{photo['id']}"
    )
    assert res.status_code == 204, res.text
    rows = authed(client, uid=UID).get(
        f"/api/v1/owner/listings/{lid}"
    ).json()["photos"]
    assert rows == []


def test_photo_delete_unauthenticated_401(client):
    assert client.delete("/api/v1/owner/listings/1/photos/1").status_code == 401


def test_photo_patch_unauthenticated_401(client):
    assert client.patch(
        "/api/v1/owner/listings/1/photos/1", json={}
    ).status_code == 401


def test_photo_patch_non_owner_403(client):
    created = make_listing(client, UID)
    photo = init_photo(client, UID, created["id"])
    provision_user(client, USER_UID)
    res = authed(client, uid=USER_UID).patch(
        f"/api/v1/owner/listings/{created['id']}/photos/{photo['id']}",
        json={"display_order": 3},
    )
    assert res.status_code == 403, res.text


def test_photo_patch_wrong_listing_404(client):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    u1 = create_unit(client, UID, pid)
    u2 = create_unit(client, UID, pid)
    l1 = create_listing(client, UID, u1)
    l2 = create_listing(client, UID, u2)
    photo = init_photo(client, UID, l1["id"])
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/listings/{l2['id']}/photos/{photo['id']}",
        json={"display_order": 3},
    )
    assert res.status_code == 404, res.text


def test_patch_unset_only_cover_promotes_other(client):
    created = make_listing(client, UID)
    lid = created["id"]
    first = upload_and_confirm(
        client, UID, lid, init_photo(client, UID, lid, is_cover=True)
    )
    second = upload_and_confirm(client, UID, lid, init_photo(client, UID, lid))
    # Move the cover last so unsetting it must promote the other photo.
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/listings/{lid}/photos/{first['id']}",
        json={"display_order": 5},
    )
    assert res.status_code == 200, res.text
    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/listings/{lid}/photos/{first['id']}",
        json={"is_cover": False},
    )
    assert res.status_code == 200, res.text
    covers = [
        p
        for p in authed(client, uid=UID).get(
            f"/api/v1/owner/listings/{lid}"
        ).json()["photos"]
        if p["is_cover"]
    ]
    assert [c["id"] for c in covers] == [second["id"]]


def test_published_listing_read_has_view_urls(client):
    lid = make_publishable(client, UID)
    for _ in range(3):
        upload_and_confirm(client, UID, lid, init_photo(client, UID, lid))
    authed(client, uid=UID).post(f"/api/v1/owner/listings/{lid}/publish")
    rows = authed(client, uid=UID).get("/api/v1/owner/listings").json()
    mine = [r for r in rows if r["id"] == lid][0]
    assert all(
        p["view_url"].startswith("https://fake-b2.test/view/")
        for p in mine["photos"]
    )
