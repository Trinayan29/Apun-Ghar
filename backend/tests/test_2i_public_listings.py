"""Public renter marketplace reads (Phase 2I): PUBLISHED-only visibility,
budget/property/area filters, READY-only photos, pagination, and direct-URL
isolation.

Public endpoints take no auth: the client fixture below issues requests
without dependency overrides, exactly like an anonymous renter. The
owner-side setup helpers reuse the authenticated owner endpoints.
"""
import json
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
    Amenity,
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
from app.storage import FakeStorageService, get_storage_or_none

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://rent:rent@localhost:5433/rent",
)

UID = "t2i-owner-1"
OTHER_UID = "t2i-owner-2"
USER_UID = "t2i-user-1"


def claims(**kwargs):
    uid = kwargs.get("uid", UID)
    base = {
        "uid": uid,
        "email": f"{uid}@example.com",
        "email_verified": False,
        "name": "T2I Owner",
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
    if not inspect(eng).has_table("listings"):
        pytest.skip("listings table missing: run 'alembic upgrade head' first")
    yield eng
    eng.dispose()


def cleanup(engine):
    db = sessionmaker(bind=engine)()
    try:
        t2i_users = db.query(User.id).filter(User.firebase_uid.like("t2i-%"))
        t2i_props = db.query(Property.id).filter(
            Property.owner_user_id.in_(t2i_users)
        )
        t2i_units = db.query(RentalUnit.id).filter(
            RentalUnit.property_id.in_(t2i_props)
        )
        t2i_listings = db.query(Listing.id).filter(
            Listing.rental_unit_id.in_(t2i_units)
        )
        db.query(ListingPhoto).filter(
            ListingPhoto.listing_id.in_(t2i_listings)
        ).delete(synchronize_session=False)
        db.query(ListingPriceComponent).filter(
            ListingPriceComponent.listing_id.in_(t2i_listings)
        ).delete(synchronize_session=False)
        db.query(Listing).filter(Listing.id.in_(t2i_listings)).delete(
            synchronize_session=False
        )
        db.query(RentalUnitAmenity).filter(
            RentalUnitAmenity.rental_unit_id.in_(t2i_units)
        ).delete(synchronize_session=False)
        db.query(RentalUnit).filter(RentalUnit.id.in_(t2i_units)).delete(
            synchronize_session=False
        )
        t2i_users = db.query(User.id).filter(User.firebase_uid.like("t2i-%"))
        db.query(Property).filter(
            Property.owner_user_id.in_(t2i_users)
        ).delete(synchronize_session=False)
        t2i_users = db.query(User.id).filter(User.firebase_uid.like("t2i-%"))
        db.query(UserProfile).filter(
            UserProfile.user_id.in_(t2i_users)
        ).delete(synchronize_session=False)
        db.query(User).filter(User.firebase_uid.like("t2i-%")).delete(
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
        json={"display_name": "T2I Owner", "phone_number": "+911234567890"},
    )
    assert res.status_code == 201, res.text


def provision_user(client, uid):
    res = authed(client, uid=uid).get("/api/v1/users/me")
    assert res.status_code == 200, res.text


def create_property(client, uid, **kwargs):
    payload = {
        "property_type": "PG",
        "address_line": f"  {uid} Test Road  ",
        "locality": "T2I Locality",
        "city": "Guwahati",
        "area_custom_name": "T2I Custom Area",
    }
    payload.update(kwargs)
    res = authed(client, uid=uid).post("/api/v1/owner/properties", json=payload)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def create_unit(client, uid, pid, **kwargs):
    payload = {
        "unit_type": "PRIVATE_ROOM",
        "occupancy_type": "SINGLE",
        "capacity": 1,
        "sharing": "PRIVATE",
        "furnishing": "FURNISHED",
    }
    payload.update(kwargs)
    res = authed(client, uid=uid).post(
        f"/api/v1/owner/properties/{pid}/units", json=payload
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def create_listing(client, uid, unit_id, **kwargs):
    payload = {
        "title": "Sunny PG near campus",
        "description": "Spacious room with attached bath",
        "rental_unit_id": unit_id,
        "rent_basis": "PER_PERSON",
        "availability_status": "AVAILABLE_NOW",
    }
    payload.update(kwargs)
    res = authed(client, uid=uid).post("/api/v1/owner/listings", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


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


def put_prices(client, uid, listing_id, rows):
    res = authed(client, uid=uid).put(
        f"/api/v1/owner/listings/{listing_id}/price-components", json=rows
    )
    assert res.status_code == 200, res.text
    return res.json()


def add_ready_photo(client, uid, lid, display_order=0, is_cover=False):
    init = authed(client, uid=uid).post(
        f"/api/v1/owner/listings/{lid}/photos:init",
        json={
            "content_type": "image/jpeg",
            "size_bytes": 1024,
            "display_order": display_order,
            "is_cover": is_cover,
        },
    )
    assert init.status_code == 201, init.text
    _fake().put_object(init.json()["storage_key"], 1024, "image/jpeg")
    conf = authed(client, uid=uid).post(
        f"/api/v1/owner/listings/{lid}/photos/{init.json()['id']}/confirm",
        json={},
    )
    assert conf.status_code == 200, conf.text
    return conf.json()


def add_pending_photo(client, uid, lid, display_order=0):
    init = authed(client, uid=uid).post(
        f"/api/v1/owner/listings/{lid}/photos:init",
        json={"content_type": "image/jpeg", "size_bytes": 1024,
              "display_order": display_order},
    )
    assert init.status_code == 201, init.text
    return init.json()


def set_listing_status(engine, listing_id, new_status):
    db = sessionmaker(bind=engine)()
    try:
        db.query(Listing).filter(Listing.id == listing_id).update(
            {"status": new_status}
        )
        db.commit()
    finally:
        db.close()


def set_photo_status(engine, photo_id, new_status):
    db = sessionmaker(bind=engine)()
    try:
        db.query(ListingPhoto).filter(ListingPhoto.id == photo_id).update(
            {"upload_status": new_status}
        )
        db.commit()
    finally:
        db.close()


def set_photo_media(engine, photo_id, media_type, upload_status):
    """Direct media/status write: the API only ever creates PHOTO rows,
    so a VIDEO row is seedable only through the database."""
    db = sessionmaker(bind=engine)()
    try:
        db.query(ListingPhoto).filter(ListingPhoto.id == photo_id).update(
            {"media_type": media_type, "upload_status": upload_status}
        )
        db.commit()
    finally:
        db.close()


def insert_area(engine, name):
    db = sessionmaker(bind=engine)()
    try:
        loc = Location(
            type="area", name=f"2I Test {name} {uuid.uuid4().hex[:6]}",
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


def insert_typed_location(engine, loc_type, name):
    """Seed a college/workplace Location (mirrors insert_area)."""
    db = sessionmaker(bind=engine)()
    try:
        loc = Location(
            type=loc_type,
            name=f"2I Test {name} {uuid.uuid4().hex[:6]}",
            city="Guwahati",
        )
        db.add(loc)
        db.commit()
        db.refresh(loc)
        return loc.id
    finally:
        db.close()


def first_active_amenity(engine):
    """An existing active amenity (id, label), or None when unseeded."""
    db = sessionmaker(bind=engine)()
    try:
        row = (
            db.query(Amenity)
            .filter(Amenity.is_active.is_(True))
            .order_by(Amenity.id.asc())
            .first()
        )
        return (row.id, row.label) if row is not None else None
    finally:
        db.close()


def make_published(client, engine, uid, **kwargs):
    """Owner chain through the API, then a direct status flip.

    Publish-gate coverage lives in test_2e; here the status write is the
    fastest honest way to seed each lifecycle state under test.
    """
    provision_owner(client, uid)
    pid = create_property(client, uid, **kwargs.pop("property", {}))
    unit_id = create_unit(client, uid, pid, **kwargs.pop("unit", {}))
    created = create_listing(client, uid, unit_id, **kwargs.pop("listing", {}))
    put_prices(client, uid, created["id"], kwargs.pop("prices", [valid_price()]))
    set_listing_status(engine, created["id"], kwargs.pop("status", "PUBLISHED"))
    return pid, unit_id, created["id"]


# VISIBILITY


def test_public_list_and_detail_need_no_auth(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    set_listing_status(engine, created["id"], "PUBLISHED")

    res = client.get("/api/v1/listings")
    assert res.status_code == 200, res.text
    ids = [row["id"] for row in res.json()]
    assert created["id"] in ids

    res = client.get(f"/api/v1/listings/{created['id']}")
    assert res.status_code == 200, res.text
    assert res.json()["id"] == created["id"]
    assert res.json()["status"] == "PUBLISHED"


@pytest.mark.parametrize("hidden_status", ["DRAFT", "PAUSED", "RENTED", "ARCHIVED"])
def test_non_published_statuses_are_invisible(client, engine, hidden_status):
    _, _, lid = make_published(client, engine, UID, status=hidden_status)

    res = client.get("/api/v1/listings")
    assert res.status_code == 200, res.text
    assert lid not in [row["id"] for row in res.json()]

    res = client.get(f"/api/v1/listings/{lid}")
    assert res.status_code == 404, res.text
    assert res.json()["detail"] == "Listing not found"


def test_detail_missing_and_malformed_ids(client):
    assert client.get("/api/v1/listings/999999999").status_code == 404
    assert client.get("/api/v1/listings/abc").status_code == 422
    assert client.get("/api/v1/listings/0").status_code == 422
    assert client.get("/api/v1/listings/-4").status_code == 422


def test_detail_out_of_range_ids_are_422_not_500(client):
    # listings.id is a PostgreSQL integer (int4): values above 2147483647
    # must fail path validation instead of raising DataError inside the
    # query (regression: these returned unhandled 500s).
    for bad_id in ("2147483648", "3000000000", "99999999999999999999"):
        res = client.get(f"/api/v1/listings/{bad_id}")
        assert res.status_code == 422, (bad_id, res.status_code, res.text)
    assert client.get("/api/v1/listings/2147483647").status_code == 404


def test_signed_in_user_and_owner_are_not_rejected(client, engine):
    _, _, lid = make_published(client, engine, UID)
    provision_user(client, USER_UID)

    res = authed(client, uid=USER_UID).get("/api/v1/listings")
    assert res.status_code == 200, res.text
    res = authed(client, uid=USER_UID).get(f"/api/v1/listings/{lid}")
    assert res.status_code == 200, res.text
    res = authed(client, uid=UID).get(f"/api/v1/listings/{lid}")
    assert res.status_code == 200, res.text


def test_cross_owner_detail_shows_only_its_own_rows(client, engine):
    _, _, lid_a = make_published(
        client, engine, UID, property={"area_custom_name": "T2I Area A"}
    )
    photo_a = add_ready_photo(client, UID, lid_a)
    _, _, lid_b = make_published(
        client, engine, OTHER_UID, property={"area_custom_name": "T2I Area B"}
    )
    add_ready_photo(client, OTHER_UID, lid_b)

    data = client.get(f"/api/v1/listings/{lid_a}").json()
    assert data["property"]["area_name"] == "T2I Area A"
    assert [p["id"] for p in data["photos"]] == [photo_a["id"]]


# NO LEAKAGE


def test_public_payloads_expose_no_owner_or_exact_address(client, engine):
    _, _, lid = make_published(client, engine, UID)
    add_ready_photo(client, UID, lid)

    forbidden = {
        "owner_user_id", "rental_unit_id", "property_id", "address_line",
        "pincode", "latitude", "longitude", "nearest_college_id",
        "nearest_workplace_id", "storage_key", "firebase_uid", "phone_number",
        "email",
    }

    summaries = client.get("/api/v1/listings").json()
    summary = next(row for row in summaries if row["id"] == lid)
    assert not (set(summary) & forbidden), summary.keys()
    assert not (set(summary["property"]) & forbidden)
    assert not (set(summary["unit"]) & forbidden)
    assert summary["status"] == "PUBLISHED"

    detail = client.get(f"/api/v1/listings/{lid}").json()
    assert not (set(detail) & forbidden)
    for photo in detail["photos"]:
        assert set(photo) == {"id", "display_order", "is_cover", "view_url"}


def test_only_ready_photos_are_exposed(client, engine):
    _, _, lid = make_published(client, engine, UID)
    ready = add_ready_photo(client, UID, lid)
    pending = add_pending_photo(client, UID, lid, display_order=1)
    failed_init = add_pending_photo(client, UID, lid, display_order=2)
    set_photo_status(engine, failed_init["id"], "FAILED")

    data = client.get(f"/api/v1/listings/{lid}").json()
    assert [p["id"] for p in data["photos"]] == [ready["id"]]
    assert all(p["view_url"].startswith("https://fake-b2.test/view/")
               for p in data["photos"])
    assert len(data["photos"]) == 1
    assert pending["id"] not in [p["id"] for p in data["photos"]]

    summaries = client.get("/api/v1/listings").json()
    summary = next(row for row in summaries if row["id"] == lid)
    assert summary["cover_photo"]["id"] == ready["id"]
    assert summary["photo_count"] == 1


def test_ready_video_is_not_exposed_as_photo(client, engine):
    # A READY row with media_type VIDEO must not appear in the public
    # gallery, count, or cover: the UI renders these URLs in <img>.
    _, _, lid = make_published(client, engine, UID)
    ready = add_ready_photo(client, UID, lid)
    pending = add_pending_photo(client, UID, lid, display_order=1)
    set_photo_media(engine, pending["id"], "VIDEO", "READY")

    data = client.get(f"/api/v1/listings/{lid}").json()
    assert [p["id"] for p in data["photos"]] == [ready["id"]]

    summaries = client.get("/api/v1/listings").json()
    summary = next(row for row in summaries if row["id"] == lid)
    assert summary["cover_photo"]["id"] == ready["id"]
    assert summary["photo_count"] == 1


def test_storage_unconfigured_degrades_to_null_view_url(client, engine):
    _, _, lid = make_published(client, engine, UID)
    add_ready_photo(client, UID, lid)

    original = app.dependency_overrides[get_storage_or_none]
    app.dependency_overrides[get_storage_or_none] = lambda: None
    try:
        data = client.get(f"/api/v1/listings/{lid}").json()
        assert [p["view_url"] for p in data["photos"]] == [None]
        summaries = client.get("/api/v1/listings").json()
        summary = next(row for row in summaries if row["id"] == lid)
        assert summary["cover_photo"]["view_url"] is None
    finally:
        app.dependency_overrides[get_storage_or_none] = original


# FILTERS


def test_property_type_and_area_filters(client, engine):
    area_a = insert_area(engine, "Alpha")
    area_b = insert_area(engine, "Beta")
    provision_owner(client, UID)
    pid_a = create_property(client, UID)
    set_property_area(client, UID, pid_a, area_a)
    unit_a = create_unit(client, UID, pid_a)
    lid_a = create_listing(client, UID, unit_a)["id"]
    set_listing_status(engine, lid_a, "PUBLISHED")

    provision_owner(client, OTHER_UID)
    pid_b = create_property(client, OTHER_UID, property_type="HOSTEL")
    set_property_area(client, OTHER_UID, pid_b, area_b)
    unit_b = create_unit(client, OTHER_UID, pid_b)
    lid_b = create_listing(client, OTHER_UID, unit_b)["id"]
    set_listing_status(engine, lid_b, "PUBLISHED")

    res = client.get("/api/v1/listings", params={"property_type": "PG"})
    ids = [row["id"] for row in res.json()]
    assert lid_a in ids and lid_b not in ids
    res = client.get("/api/v1/listings", params={"property_type": "HOSTEL"})
    ids = [row["id"] for row in res.json()]
    assert lid_b in ids and lid_a not in ids
    res = client.get("/api/v1/listings", params={"area_location_id": area_a})
    ids = [row["id"] for row in res.json()]
    assert lid_a in ids and lid_b not in ids
    res = client.get("/api/v1/listings",
                      params={"property_type": "HOSTEL",
                              "area_location_id": area_a})
    ids = [row["id"] for row in res.json()]
    assert lid_a not in ids and lid_b not in ids


def test_invalid_filters_and_pagination_422(client):
    assert client.get("/api/v1/listings",
                      params={"max_monthly_paise": -1}).status_code == 422
    assert client.get("/api/v1/listings",
                      params={"area_location_id": 0}).status_code == 422
    assert client.get("/api/v1/listings",
                      params={"property_type": "VILLA"}).status_code == 422
    assert client.get("/api/v1/listings",
                      params={"limit": 0}).status_code == 422
    assert client.get("/api/v1/listings",
                      params={"limit": 51}).status_code == 422
    assert client.get("/api/v1/listings",
                      params={"offset": -1}).status_code == 422
    assert client.get("/api/v1/listings",
                      params={"offset": 10001}).status_code == 422


def test_offset_boundary_10000_is_allowed(client):
    assert client.get("/api/v1/listings",
                      params={"offset": 10000}).status_code == 200


# MONTHLY MATH


def test_monthly_total_and_budget_boundary(client, engine):
    # 8000 monthly + 9000 quarterly (=3000/mo) + 12000 annual (=1000/mo)
    # Baseline: exactly 12000.00/mo = 1200000 paise.
    prices = [
        valid_price(),
        valid_price(charge_type="MAINTENANCE", calculation_basis="PER_UNIT",
                    billing_frequency="QUARTERLY", amount_paise=900000,
                    payment_timing="PER_PERIOD", display_order=1),
        valid_price(charge_type="FOOD", calculation_basis="PER_PERSON",
                    billing_frequency="ANNUALLY", amount_paise=1200000,
                    payment_timing="PER_PERIOD", display_order=2),
    ]
    _, _, lid = make_published(client, engine, UID, prices=prices)

    data = client.get(f"/api/v1/listings/{lid}").json()
    assert data["monthly_total_paise"] == 1200000
    assert data["has_variable_charges"] is False
    assert data["has_usage_charges"] is False

    res = client.get("/api/v1/listings",
                     params={"max_monthly_paise": 1200000})
    assert lid in [row["id"] for row in res.json()]
    res = client.get("/api/v1/listings",
                     params={"max_monthly_paise": 1199999})
    assert lid not in [row["id"] for row in res.json()]


def test_budget_filter_matches_displayed_rounded_total(client, engine):
    # annualized = 100000 * 12 + 1 = 1200001: the response rounds this to
    # exactly 100000 paise/month, so a cap of 100000 must keep the
    # listing (the unrounded comparison used to drop it).
    prices = [
        valid_price(amount_paise=100000),
        valid_price(charge_type="FOOD", calculation_basis="PER_PERSON",
                    billing_frequency="ANNUALLY", amount_paise=1,
                    payment_timing="PER_PERIOD", display_order=1),
    ]
    _, _, lid = make_published(client, engine, UID, prices=prices)

    data = client.get(f"/api/v1/listings/{lid}").json()
    assert data["monthly_total_paise"] == 100000

    res = client.get("/api/v1/listings",
                     params={"max_monthly_paise": 100000})
    assert lid in [row["id"] for row in res.json()]
    res = client.get("/api/v1/listings",
                     params={"max_monthly_paise": 99999})
    assert lid not in [row["id"] for row in res.json()]


def test_variable_usage_optional_onetime_excluded_but_listed(client, engine):
    prices = [
        valid_price(),
        valid_price(charge_type="ELECTRICITY",
                    calculation_basis="CONSUMPTION",
                    billing_frequency="USAGE_BASED", variability="VARIABLE",
                    amount_paise=None, rate_paise_per_unit=900,
                    consumption_unit="kWh", mandatory=True,
                    payment_timing="PER_PERIOD", display_order=1),
        valid_price(charge_type="INTERNET",
                    calculation_basis="PER_UNIT",
                    billing_frequency="MONTHLY", variability="FIXED",
                    amount_paise=50000, mandatory=False,
                    payment_timing="PER_PERIOD", display_order=2),
        valid_price(charge_type="DEPOSIT", calculation_basis="PER_UNIT",
                    billing_frequency="ONE_TIME", variability="FIXED",
                    amount_paise=800000, refundable=True,
                    payment_timing="ON_MOVE_IN", display_order=3),
    ]
    _, _, lid = make_published(client, engine, UID, prices=prices)

    data = client.get(f"/api/v1/listings/{lid}").json()
    assert data["monthly_total_paise"] == 800000
    assert data["has_variable_charges"] is True
    assert data["has_usage_charges"] is True
    assert data["has_optional_charges"] is True
    assert data["has_one_time_charges"] is True

    # Baseline (interest-free of the unknown extras) is under the cap, so
    # the listing is retained rather than silently dropped.
    res = client.get("/api/v1/listings",
                     params={"max_monthly_paise": 800000})
    assert lid in [row["id"] for row in res.json()]


def test_unknown_monthly_is_retained_and_marked(client, engine):
    # A RENT row billed ONE_TIME leaves no monthly baseline. The listing
    # must still surface (marked unknown), never vanish under a cap.
    prices = [
        valid_price(billing_frequency="ONE_TIME",
                    payment_timing="ON_MOVE_IN", amount_paise=800000),
    ]
    _, _, lid = make_published(client, engine, UID, prices=prices)

    data = client.get(f"/api/v1/listings/{lid}").json()
    assert data["monthly_total_paise"] is None
    assert data["has_one_time_charges"] is True
    res = client.get("/api/v1/listings",
                     params={"max_monthly_paise": 100})
    assert lid in [row["id"] for row in res.json()]


def test_deposit_alone_is_not_optional_extras(client, engine):
    # A non-mandatory DEPOSIT is a move-in obligation, not an add-on: it
    # must not flip has_optional_charges by itself.
    prices = [
        valid_price(),
        valid_price(charge_type="DEPOSIT", calculation_basis="PER_UNIT",
                    billing_frequency="ONE_TIME", variability="FIXED",
                    amount_paise=800000, mandatory=False, refundable=True,
                    payment_timing="ON_MOVE_IN", display_order=1),
    ]
    _, _, lid = make_published(client, engine, UID, prices=prices)

    data = client.get(f"/api/v1/listings/{lid}").json()
    assert data["has_one_time_charges"] is True
    assert data["has_optional_charges"] is False


def test_genuinely_optional_charge_sets_optional_flag(client, engine):
    prices = [
        valid_price(),
        valid_price(charge_type="INTERNET",
                    calculation_basis="PER_UNIT",
                    billing_frequency="MONTHLY", variability="FIXED",
                    amount_paise=50000, mandatory=False,
                    payment_timing="PER_PERIOD", display_order=1),
    ]
    _, _, lid = make_published(client, engine, UID, prices=prices)

    data = client.get(f"/api/v1/listings/{lid}").json()
    assert data["has_optional_charges"] is True


def test_public_price_rows_carry_no_listing_id(client, engine):
    _, _, lid = make_published(client, engine, UID)

    data = client.get(f"/api/v1/listings/{lid}").json()
    assert len(data["price_components"]) == 1
    for row in data["price_components"]:
        assert "listing_id" not in row, row.keys()


# PAGINATION


def test_pagination_orders_by_id(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    lids = []
    for _ in range(3):
        unit_id = create_unit(client, UID, pid)
        created = create_listing(client, UID, unit_id)
        set_listing_status(engine, created["id"], "PUBLISHED")
        lids.append(created["id"])
    lids.sort()

    everything = client.get("/api/v1/listings",
                            params={"limit": 50, "offset": 0}).json()
    mine = [row["id"] for row in everything if row["id"] in lids]
    assert mine == lids

    shifted = client.get("/api/v1/listings",
                         params={"limit": 50, "offset": 2}).json()
    assert [row["id"] for row in shifted] == [
        row["id"] for row in everything[2:]
    ]


# END-TO-END THROUGH THE REAL PUBLISH GATE


def test_owner_publish_then_anonymous_discovery(client, engine):
    provision_owner(client, UID)
    pid = create_property(client, UID)
    area = insert_area(engine, "Market")
    set_property_area(client, UID, pid, area)
    unit_id = create_unit(client, UID, pid)
    created = create_listing(client, UID, unit_id)
    put_prices(client, UID, created["id"], [valid_price()])
    for i in range(3):
        add_ready_photo(client, UID, created["id"], display_order=i)

    res = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{created['id']}/publish"
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "PUBLISHED"

    found = client.get("/api/v1/listings").json()
    assert created["id"] in [row["id"] for row in found]
    detail = client.get(f"/api/v1/listings/{created['id']}").json()
    assert detail["title"] == "Sunny PG near campus"
    assert detail["property"]["city"] == "Guwahati"
    assert detail["property"]["area_name"].startswith("2I Test Market")
    assert detail["unit"]["unit_type"] == "PRIVATE_ROOM"
    assert len(detail["photos"]) == 3
    assert all(p["view_url"].startswith("https://fake-b2.test/view/")
               for p in detail["photos"])


# OWNER EDITS FLOW TO PUBLIC READS


def test_owner_edits_of_a_published_listing_flow_to_public_reads(client, engine):
    """The seam between the owner edit endpoints and the public reads.

    Supported edits to a PUBLISHED listing (property, unit + policies,
    pricing, rent basis, listing text, availability) must appear in the
    public list and detail responses, while private fields stay hidden.
    test_2e covers the owner write endpoints and test_2i the public reads;
    this exercises both together through the real API.
    """
    college = insert_typed_location(engine, "college", "College")
    workplace = insert_typed_location(engine, "workplace", "Workplace")
    amenity = first_active_amenity(engine)
    assert amenity is not None, "amenity catalog is empty"
    amenity_id, amenity_label = amenity

    provision_owner(client, UID)
    pid = create_property(
        client,
        UID,
        address_line="  12 Old Street  ",
        pincode="781014",
        nearest_college_id=college,
        nearest_workplace_id=workplace,
    )
    unit_id = create_unit(client, UID, pid)
    listing = create_listing(
        client,
        UID,
        unit_id,
        title="Old title",
        description="Old description",
        rent_basis="PER_PERSON",
    )
    lid = listing["id"]
    put_prices(client, UID, lid, [valid_price(amount_paise=800000)])
    set_listing_status(engine, lid, "PUBLISHED")

    # Baseline: the public detail reflects the original values.
    before = client.get(f"/api/v1/listings/{lid}").json()
    assert before["title"] == "Old title"
    assert before["description"] == "Old description"
    assert before["rent_basis"] == "PER_PERSON"
    assert before["monthly_total_paise"] == 800000
    assert before["availability_status"] == "AVAILABLE_NOW"
    assert before["property"]["name"] is None
    assert before["unit"]["house_rules"] is None

    # --- Owner edits ---
    prop_patch = authed(client, uid=UID).patch(
        f"/api/v1/owner/properties/{pid}",
        json={
            "name": "Edited Property Name",
            "locality": "Edited Locality",
            "area_custom_name": "Edited Area",
            "address_line": "99 Secret Lane",
            "pincode": "781099",
            "nearest_college_id": college,
            "nearest_workplace_id": workplace,
        },
    )
    assert prop_patch.status_code == 200, prop_patch.text

    unit_patch = authed(client, uid=UID).patch(
        f"/api/v1/owner/units/{unit_id}",
        json={
            "house_rules": "No loud music after 10pm.",
            "couple_friendly": True,
            "visitors_allowed": False,
            "pets_allowed": True,
            "smoking_allowed": False,
            "alcohol_allowed": False,
            "amenity_ids": [amenity_id],
        },
    )
    assert unit_patch.status_code == 200, unit_patch.text

    # A rent-basis change mirrors the client save orchestration: clear the
    # old-basis rows, PATCH the basis, then PUT the full intended set.
    clear = authed(client, uid=UID).put(
        f"/api/v1/owner/listings/{lid}/price-components", json=[]
    )
    assert clear.status_code == 200, clear.text
    basis_patch = authed(client, uid=UID).patch(
        f"/api/v1/owner/listings/{lid}",
        json={
            "title": "Edited title",
            "description": "Edited description",
            "rent_basis": "PER_ROOM",
        },
    )
    assert basis_patch.status_code == 200, basis_patch.text
    put_prices(
        client,
        UID,
        lid,
        [valid_price(calculation_basis="PER_ROOM", amount_paise=900000)],
    )

    future = date.today() + timedelta(days=14)
    avail = authed(client, uid=UID).post(
        f"/api/v1/owner/listings/{lid}/availability",
        json={
            "availability_status": "AVAILABLE_FROM_DATE",
            "available_from": future.isoformat(),
        },
    )
    assert avail.status_code == 200, avail.text

    # --- Public list now reflects every public edit. ---
    summary = next(
        row
        for row in client.get("/api/v1/listings", params={"limit": 50}).json()
        if row["id"] == lid
    )
    assert summary["title"] == "Edited title"
    assert summary["description"] == "Edited description"
    assert summary["rent_basis"] == "PER_ROOM"
    assert summary["monthly_total_paise"] == 900000
    assert summary["availability_status"] == "AVAILABLE_FROM_DATE"
    assert summary["available_from"] == future.isoformat()
    assert summary["property"]["name"] == "Edited Property Name"
    assert summary["property"]["locality"] == "Edited Locality"
    assert summary["property"]["area_name"] == "Edited Area"
    assert summary["unit"]["house_rules"] == "No loud music after 10pm."
    assert summary["unit"]["couple_friendly"] is True
    assert summary["unit"]["pets_allowed"] is True
    assert summary["unit"]["visitors_allowed"] is False
    assert summary["unit"]["smoking_allowed"] is False
    assert summary["unit"]["alcohol_allowed"] is False
    assert amenity_label in summary["unit"]["amenities"]

    # --- Public detail agrees, including the replaced pricing row. ---
    detail = client.get(f"/api/v1/listings/{lid}").json()
    assert detail["title"] == "Edited title"
    assert detail["rent_basis"] == "PER_ROOM"
    assert detail["monthly_total_paise"] == 900000
    assert detail["unit"]["house_rules"] == "No loud music after 10pm."
    rent_rows = [
        row
        for row in detail["price_components"]
        if row["charge_type"] == "RENT"
    ]
    assert len(rent_rows) == 1
    assert rent_rows[0]["amount_paise"] == 900000
    assert rent_rows[0]["calculation_basis"] == "PER_ROOM"
    # Editing never changes lifecycle.
    assert detail["status"] == "PUBLISHED"

    # --- Private fields stay hidden, and their values never leak. ---
    forbidden = {
        "owner_user_id", "rental_unit_id", "property_id", "address_line",
        "pincode", "latitude", "longitude", "nearest_college_id",
        "nearest_workplace_id", "storage_key", "firebase_uid", "phone_number",
        "email",
    }
    assert not (set(detail) & forbidden), detail.keys()
    assert not (set(detail["property"]) & forbidden)
    assert not (set(detail["unit"]) & forbidden)
    serialized = json.dumps(detail)
    assert "99 Secret Lane" not in serialized
    assert "781099" not in serialized


@pytest.mark.parametrize("hidden_status", ["DRAFT", "PAUSED", "RENTED", "ARCHIVED"])
def test_owner_edits_of_unpublished_listing_stay_hidden(
    client, engine, hidden_status
):
    """Editing a non-PUBLISHED listing must never make it publicly visible."""
    _, _, lid = make_published(client, engine, UID, status=hidden_status)

    res = authed(client, uid=UID).patch(
        f"/api/v1/owner/listings/{lid}",
        json={"title": "Edited but still hidden"},
    )
    assert res.status_code == 200, res.text

    listed = client.get("/api/v1/listings", params={"limit": 50}).json()
    assert lid not in [row["id"] for row in listed]
    assert client.get(f"/api/v1/listings/{lid}").status_code == 404
