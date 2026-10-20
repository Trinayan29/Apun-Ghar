"""Amenity catalog + end-to-end amenity pipeline (Phase 2J).

Covers the missing link that dropped every owner amenity selection: the
public reference catalog (`GET /api/v1/amenities`) that turns the owner's
label choice into the numeric `amenity_ids` the write path requires.

The end-to-end test drives the exact sequence the frontend performs --
resolve slugs through the catalog endpoint, create the unit with those
ids -- then proves persistence through an independent database session
and the renter-facing public read.
"""
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from app import auth as auth_module
from app.main import app
from app.models import (
    Amenity,
    Listing,
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

UID = "t2j-owner-1"


def claims(**kwargs):
    uid = kwargs.get("uid", UID)
    base = {
        "uid": uid,
        "email": f"{uid}@example.com",
        "email_verified": False,
        "name": "T2J Owner",
        "aud": "demo-apun-ghar",
    }
    base.update(kwargs)
    return base


def authed(client, **kwargs):
    app.dependency_overrides[auth_module.get_firebase_claims] = lambda: claims(
        **kwargs
    )
    return client


@pytest.fixture(scope="module")
def engine():
    eng = create_engine(DATABASE_URL)
    try:
        with eng.connect():
            pass
    except Exception:
        pytest.skip("local PostgreSQL is not reachable")
    if not inspect(eng).has_table("amenities"):
        pytest.skip("amenities table missing: run 'alembic upgrade head' first")
    yield eng
    eng.dispose()


def cleanup(engine):
    db = sessionmaker(bind=engine)()
    try:
        t2j_users = db.query(User.id).filter(User.firebase_uid.like("t2j-%"))
        t2j_props = db.query(Property.id).filter(
            Property.owner_user_id.in_(t2j_users)
        )
        t2j_units = db.query(RentalUnit.id).filter(
            RentalUnit.property_id.in_(t2j_props)
        )
        t2j_listings = db.query(Listing.id).filter(
            Listing.rental_unit_id.in_(t2j_units)
        )
        db.query(ListingPriceComponent).filter(
            ListingPriceComponent.listing_id.in_(t2j_listings)
        ).delete(synchronize_session=False)
        db.query(Listing).filter(Listing.id.in_(t2j_listings)).delete(
            synchronize_session=False
        )
        db.query(RentalUnitAmenity).filter(
            RentalUnitAmenity.rental_unit_id.in_(t2j_units)
        ).delete(synchronize_session=False)
        db.query(RentalUnit).filter(RentalUnit.id.in_(t2j_units)).delete(
            synchronize_session=False
        )
        t2j_users = db.query(User.id).filter(User.firebase_uid.like("t2j-%"))
        db.query(Property).filter(
            Property.owner_user_id.in_(t2j_users)
        ).delete(synchronize_session=False)
        t2j_users = db.query(User.id).filter(User.firebase_uid.like("t2j-%"))
        db.query(UserProfile).filter(
            UserProfile.user_id.in_(t2j_users)
        ).delete(synchronize_session=False)
        db.query(User).filter(User.firebase_uid.like("t2j-%")).delete(
            synchronize_session=False
        )
        db.query(Amenity).filter(Amenity.slug.like("t2j-%")).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def client(engine):
    app.dependency_overrides[get_storage_or_none] = lambda: FakeStorageService()
    cleanup(engine)
    c = TestClient(app, raise_server_exceptions=False)
    yield c
    app.dependency_overrides.clear()
    cleanup(engine)


def provision_owner(client, uid):
    res = authed(client, uid=uid).post(
        "/api/v1/owners/signup",
        json={"display_name": "T2J Owner", "phone_number": "+911234567890"},
    )
    assert res.status_code == 201, res.text


def create_property(client, uid, **kwargs):
    payload = {
        "property_type": "PG",
        "address_line": f"  {uid} Test Road  ",
        "locality": "T2J Locality",
        "city": "Guwahati",
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
    return res.json()


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


def set_listing_status(engine, listing_id, new_status):
    db = sessionmaker(bind=engine)()
    try:
        db.query(Listing).filter(Listing.id == listing_id).update(
            {"status": new_status}
        )
        db.commit()
    finally:
        db.close()


def active_amenity_rows(engine):
    db = sessionmaker(bind=engine)()
    try:
        return (
            db.query(Amenity)
            .filter(Amenity.is_active.is_(True))
            .order_by(Amenity.id.asc())
            .all()
        )
    finally:
        db.close()


def insert_amenity(engine, slug, label, is_active):
    db = sessionmaker(bind=engine)()
    try:
        row = Amenity(
            slug=f"t2j-{slug}",
            label=label,
            category="test",
            is_active=is_active,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row.id
    finally:
        db.close()


def unit_amenity_slugs(engine, unit_id):
    """Independent-session read of the persisted join rows."""
    db = sessionmaker(bind=engine)()
    try:
        rows = (
            db.query(Amenity.slug)
            .join(RentalUnitAmenity, RentalUnitAmenity.amenity_id == Amenity.id)
            .filter(RentalUnitAmenity.rental_unit_id == unit_id)
            .order_by(Amenity.id.asc())
            .all()
        )
        return [slug for (slug,) in rows]
    finally:
        db.close()


# CATALOG ENDPOINT


def test_catalog_is_public_and_matches_active_db_rows(client, engine):
    res = client.get("/api/v1/amenities")
    assert res.status_code == 200, res.text
    rows = res.json()

    active = active_amenity_rows(engine)
    assert [(r["id"], r["slug"]) for r in rows] == [
        (r.id, r.slug) for r in active
    ]
    # Deterministic ascending id order.
    assert [r["id"] for r in rows] == sorted(r["id"] for r in rows)
    # Full read shape, and only active rows are ever exposed.
    for row in rows:
        assert set(row) == {
            "id",
            "slug",
            "label",
            "category",
            "icon_slug",
            "is_active",
        }
        assert row["is_active"] is True
    # The catalog that the frontend resolves against is non-empty.
    assert rows, "amenity catalog is empty: run the seed"


def test_catalog_excludes_inactive_amenities(client, engine):
    hidden = insert_amenity(engine, "inactive", "2J Test Inactive", False)
    shown = insert_amenity(engine, "active", "2J Test Active", True)

    rows = client.get("/api/v1/amenities").json()
    ids = [r["id"] for r in rows]
    assert hidden not in ids
    assert shown in ids
    # An inactive row must never resolve: the catalog is exactly the set a
    # write would accept.
    assert all(r["is_active"] for r in rows)


# OWNER SELECTION -> DB PERSISTENCE -> PUBLIC READ


def test_owner_selection_via_catalog_flows_to_public_labels(client, engine):
    catalog = client.get("/api/v1/amenities").json()
    by_slug = {row["slug"]: row for row in catalog}
    assert "wifi" in by_slug and "ac" in by_slug, catalog
    chosen = [by_slug["wifi"], by_slug["ac"]]
    chosen_ids = [row["id"] for row in chosen]
    chosen_labels = {row["label"] for row in chosen}

    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit = create_unit(client, UID, pid, amenity_ids=chosen_ids)
    lid = create_listing(client, UID, unit["id"])["id"]
    set_listing_status(engine, lid, "PUBLISHED")

    # 1. Persisted: join rows exist, read through an independent session.
    persisted = unit_amenity_slugs(engine, unit["id"])
    assert sorted(persisted) == ["ac", "wifi"]

    # 2. Public API exposes the labels, not raw ids.
    detail = client.get(f"/api/v1/listings/{lid}").json()
    assert set(detail["unit"]["amenities"]) == chosen_labels
    summary = next(
        row
        for row in client.get("/api/v1/listings", params={"limit": 50}).json()
        if row["id"] == lid
    )
    assert set(summary["unit"]["amenities"]) == chosen_labels


def test_every_catalog_entry_is_accepted_by_the_write_path(client, engine):
    """The catalog must never offer an id the unit write rejects."""
    catalog = client.get("/api/v1/amenities").json()
    ids = [row["id"] for row in catalog]
    assert ids

    provision_owner(client, UID)
    pid = create_property(client, UID)
    unit = create_unit(client, UID, pid, amenity_ids=ids)
    assert [a["id"] for a in unit["amenities"]] == sorted(ids)
