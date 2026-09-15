import os

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.models import (
    Amenity,
    Listing,
    ListingPhoto,
    ListingPriceComponent,
    Location,
    Property,
    RentalUnit,
    User,
)

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
    if not inspect(eng).has_table("listings"):
        pytest.skip("listen tables missing: run 'alembic upgrade head' first")
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


def _user(db, tag):
    user = User(firebase_uid=f"uid-2b-{tag}", email=f"2b-{tag}@example.com")
    db.add(user)
    db.flush()
    return user


def _area_location(db, tag):
    loc = Location(type="area", name=f"Area {tag}", city="Guwahati")
    db.add(loc)
    db.flush()
    return loc


def _property(db, tag, owner_id=None, **kw):
    if owner_id is None:
        owner_id = _user(db, tag).id
    defaults = dict(property_type="PG", address_line="1 Test Road")
    defaults.update(kw)
    prop = Property(owner_user_id=owner_id, **defaults)
    db.add(prop)
    db.flush()
    return prop


def _unit(db, tag, property_id=None, **kw):
    if property_id is None:
        property_id = _property(db, tag).id
    defaults = dict(
        unit_type="PG_BED",
        occupancy_type="DOUBLE",
        capacity=2,
        sharing="SHARED",
        furnishing="SEMI_FURNISHED",
        gender_scope="ANY",
    )
    defaults.update(kw)
    unit = RentalUnit(property_id=property_id, **defaults)
    db.add(unit)
    db.flush()
    return unit


def _listing(db, tag, unit_id=None, **kw):
    if unit_id is None:
        unit_id = _unit(db, tag).id
    defaults = dict(
        title=f"Listing {tag}",
        rent_basis="PER_PERSON",
        status="DRAFT",
        availability_status="AVAILABLE_NOW",
    )
    defaults.update(kw)
    listing = Listing(rental_unit_id=unit_id, **defaults)
    db.add(listing)
    db.flush()
    return listing


def _photo(db, listing_id, key, **kw):
    defaults = dict(listing_id=listing_id, storage_key=key)
    defaults.update(kw)
    photo = ListingPhoto(**defaults)
    db.add(photo)
    db.flush()
    return photo


def _lpc(db, listing_id, **kw):
    defaults = dict(
        charge_type="RENT",
        calculation_basis="PER_PERSON",
        billing_frequency="MONTHLY",
        variability="FIXED",
        amount_paise=800_000,
        payment_timing="PER_PERIOD",
    )
    defaults.update(kw)
    comp = ListingPriceComponent(listing_id=listing_id, **defaults)
    db.add(comp)
    return comp


# ---- Properties --------------------------------------------------------------


def test_property_created_with_minimal_fields(db):
    prop = _property(db, "p-min")
    assert prop.property_type == "PG"
    assert prop.city == "Guwahati"
    assert prop.is_independent is None
    assert prop.gate_closing_time is None


def test_property_invalid_type_rejected(db):
    with pytest.raises(IntegrityError):
        _property(db, "p-type", property_type="VILLA")


def test_property_latitude_without_longitude_rejected(db):
    with pytest.raises(IntegrityError):
        _property(db, "p-lat", latitude=26.1)


def test_property_negative_floor_rejected(db):
    with pytest.raises(IntegrityError):
        _property(db, "p-floor", total_floors=0)


def test_property_invalid_built_year_rejected(db):
    with pytest.raises(IntegrityError):
        _property(db, "p-year", built_year=1400)


def test_property_stores_geo_and_area(db):
    area = _area_location(db, "p-area")
    prop = _property(db, "p-geo", area_location_id=area.id, latitude=26.1, longitude=91.6)
    assert prop.latitude == 26.1
    assert prop.longitude == 91.6
    assert prop.area_location_id == area.id


def test_property_fk_requires_user(db):
    with pytest.raises(IntegrityError):
        db.add(
            Property(owner_user_id=999999, property_type="PG", address_line="x")
        )
        db.flush()


# ---- Rental units / policies -------------------------------------------------


def test_policy_booleans_default_to_null(db):
    unit = _unit(db, "pol-null")
    assert unit.couple_friendly is None
    assert unit.visitors_allowed is None
    assert unit.pets_allowed is None
    assert unit.smoking_allowed is None
    assert unit.alcohol_allowed is None
    assert unit.house_rules is None


def test_policy_booleans_store_true_and_false(db):
    unit = _unit(
        db,
        "pol-val",
        couple_friendly=True,
        pets_allowed=False,
        house_rules="No outside food",
    )
    assert unit.couple_friendly is True
    assert unit.pets_allowed is False
    assert unit.house_rules == "No outside food"


def test_unit_invalid_type_rejected(db):
    with pytest.raises(IntegrityError):
        _unit(db, "u-type", unit_type="TENT")


def test_unit_invalid_occupancy_rejected(db):
    with pytest.raises(IntegrityError):
        _unit(db, "u-occ", occupancy_type="PENTHOUSE")


def test_unit_zero_capacity_rejected(db):
    with pytest.raises(IntegrityError):
        _unit(db, "u-cap", capacity=0)


def test_unit_invalid_gender_scope_rejected(db):
    with pytest.raises(IntegrityError):
        _unit(db, "u-gen", gender_scope="COED")


def test_occupancy_single_requires_capacity_one_private(db):
    with pytest.raises(IntegrityError):
        _unit(
            db,
            "u-single",
            occupancy_type="SINGLE",
            capacity=2,
            sharing="SHARED",
        )


def test_occupancy_shared_requires_capacity_two_or_more(db):
    with pytest.raises(IntegrityError):
        _unit(
            db,
            "u-shared",
            occupancy_type="DOUBLE",
            capacity=1,
            sharing="SHARED",
        )


def test_occupancy_private_requires_capacity_one(db):
    with pytest.raises(IntegrityError):
        _unit(
            db,
            "u-priv",
            sharing="PRIVATE",
            capacity=2,
        )


def test_unit_valid_single_inserts(db):
    _unit(
        db,
        "u-valid",
        unit_type="PRIVATE_ROOM",
        occupancy_type="SINGLE",
        capacity=1,
        sharing="PRIVATE",
        furnishing="FURNISHED",
    )
    assert db.query(RentalUnit).filter(RentalUnit.unit_type == "PRIVATE_ROOM").count() == 1


# ---- Amenities ---------------------------------------------------------------


def test_amenity_seeded_13(db):
    assert db.query(Amenity).filter(Amenity.is_active.is_(True)).count() >= 13


def test_amenity_slug_unique(db):
    with pytest.raises(IntegrityError):
        db.add(Amenity(slug="wifi", label="duplicate"))
        db.flush()


def test_amenity_delete_restricted_when_referenced(db):
    amenity = db.query(Amenity).filter(Amenity.slug == "wifi").first()
    unit = _unit(db, "am-rstr")
    unit.amenities.append(amenity)
    db.flush()
    db.delete(amenity)
    with pytest.raises(IntegrityError):
        db.flush()


def test_unit_amenity_link_written(db):
    amenity = db.query(Amenity).filter(Amenity.slug == "wifi").first()
    unit = _unit(db, "am-link")
    unit.amenities.append(amenity)
    db.flush()
    assert len(unit.amenities) == 1
    assert unit.amenities[0].slug == "wifi"


# ---- Listings ----------------------------------------------------------------


def test_listing_invalid_rent_basis_rejected(db):
    with pytest.raises(IntegrityError):
        _listing(db, "l-basis", rent_basis="PER_BED")


def test_listing_invalid_status_rejected(db):
    with pytest.raises(IntegrityError):
        _listing(db, "l-status", status="DELETED")


def test_listing_invalid_availability_rejected(db):
    with pytest.raises(IntegrityError):
        _listing(db, "l-avail", availability_status="OPEN")


def test_availability_from_date_requires_date(db):
    with pytest.raises(IntegrityError):
        _listing(
            db,
            "l-avail-date",
            availability_status="AVAILABLE_FROM_DATE",
            available_from=None,
        )


def test_availability_now_must_not_have_date(db):
    with pytest.raises(IntegrityError):
        _listing(
            db,
            "l-avail-now",
            availability_status="AVAILABLE_NOW",
            available_from=__import__("datetime").date(2026, 10, 1),
        )


def test_two_active_listings_same_unit_rejected(db):
    unit = _unit(db, "l-unique")
    _listing(db, "l-unique", unit_id=unit.id, status="DRAFT")
    db.add(
        Listing(
            rental_unit_id=unit.id,
            title="Second",
            rent_basis="PER_PERSON",
            status="DRAFT",
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()


def test_draft_and_archived_same_unit_allowed(db):
    unit = _unit(db, "l-arch")
    _listing(db, "l-arch", unit_id=unit.id, status="DRAFT")
    _listing(db, "l-arch2", unit_id=unit.id, status="ARCHIVED")
    assert db.query(Listing).filter(Listing.rental_unit_id == unit.id).count() == 2


def test_delete_unit_cascades_listings(db):
    unit = _unit(db, "l-cascade")
    _listing(db, "l-cascade", unit_id=unit.id)
    db.delete(unit)
    db.flush()
    assert db.query(Listing).count() == 0


# ---- Pricing components ------------------------------------------------------


def test_valid_rent_component_inserts(db):
    listing = _listing(db, "pc-rent")
    _lpc(db, listing.id)
    db.flush()
    assert db.query(ListingPriceComponent).filter_by(listing_id=listing.id).count() == 1


def test_c1_both_amount_and_rate_rejected(db):
    listing = _listing(db, "pc-c1a")
    _lpc(db, listing.id, amount_paise=1000, rate_paise_per_unit=10)
    with pytest.raises(IntegrityError):
        db.flush()


def test_c1_neither_amount_nor_rate_rejected(db):
    listing = _listing(db, "pc-c1b")
    _lpc(db, listing.id, amount_paise=None, rate_paise_per_unit=None)
    with pytest.raises(IntegrityError):
        db.flush()


def test_c2_consumption_requires_rate_and_unit(db):
    listing = _listing(db, "pc-c2")
    _lpc(
        db,
        listing.id,
        charge_type="ELECTRICITY",
        calculation_basis="CONSUMPTION",
        billing_frequency="USAGE_BASED",
        variability="VARIABLE",
        amount_paise=1000,
        consumption_unit=None,
        rate_paise_per_unit=None,
    )
    with pytest.raises(IntegrityError):
        db.flush()


def test_c3_consumption_rate_must_be_variable(db):
    listing = _listing(db, "pc-c3")
    _lpc(
        db,
        listing.id,
        charge_type="ELECTRICITY",
        calculation_basis="CONSUMPTION",
        billing_frequency="USAGE_BASED",
        variability="FIXED",
        amount_paise=None,
        rate_paise_per_unit=10,
        consumption_unit="kWh",
    )
    with pytest.raises(IntegrityError):
        db.flush()


def test_c3_nonconsumption_rejects_consumption_unit(db):
    listing = _listing(db, "pc-c3b")
    _lpc(
        db,
        listing.id,
        billing_frequency="USAGE_BASED",
        variability="VARIABLE",
        consumption_unit="kWh",
        amount_paise=None,
        rate_paise_per_unit=10,
    )
    with pytest.raises(IntegrityError):
        db.flush()


def test_c4_variable_requires_rate(db):
    listing = _listing(db, "pc-c4")
    _lpc(db, listing.id, variability="VARIABLE", amount_paise=1000)
    with pytest.raises(IntegrityError):
        db.flush()


def test_c5_deposit_requires_one_time_fixed_refundable(db):
    listing = _listing(db, "pc-c5")
    _lpc(
        db,
        listing.id,
        charge_type="DEPOSIT",
        billing_frequency="MONTHLY",
        amount_paise=800_000,
        refundable=True,
        payment_timing="ON_MOVE_IN",
    )
    with pytest.raises(IntegrityError):
        db.flush()


def test_c6_rent_must_be_mandatory_fixed(db):
    listing = _listing(db, "pc-c6")
    _lpc(
        db,
        listing.id,
        charge_type="RENT",
        variability="VARIABLE",
        amount_paise=800_000,
        rate_paise_per_unit=None,
    )
    with pytest.raises(IntegrityError):
        db.flush()


def test_c7_one_time_cannot_be_per_period(db):
    listing = _listing(db, "pc-c7")
    _lpc(
        db,
        listing.id,
        charge_type="MAINTENANCE",
        billing_frequency="ONE_TIME",
        payment_timing="PER_PERIOD",
    )
    with pytest.raises(IntegrityError):
        db.flush()


def test_c8_periodic_fixed_requires_amount(db):
    listing = _listing(db, "pc-c8")
    _lpc(
        db,
        listing.id,
        billing_frequency="MONTHLY",
        amount_paise=None,
        rate_paise_per_unit=100,
    )
    with pytest.raises(IntegrityError):
        db.flush()


def test_c9_other_requires_label(db):
    listing = _listing(db, "pc-c9a")
    _lpc(db, listing.id, charge_type="OTHER", label=None)
    with pytest.raises(IntegrityError):
        db.flush()


def test_c9_non_other_must_not_have_label(db):
    listing = _listing(db, "pc-c9b")
    _lpc(db, listing.id, charge_type="RENT", label="Extra")
    with pytest.raises(IntegrityError):
        db.flush()


def test_c10_unique_combo(db):
    listing = _listing(db, "pc-c10")
    _lpc(db, listing.id, charge_type="FOOD", label=None)
    _lpc(db, listing.id, charge_type="FOOD", label=None)
    with pytest.raises(IntegrityError):
        db.flush()


def test_annual_pg_example_valid(db):
    listing = _listing(db, "pc-annual")
    _lpc(
        db, listing.id,
        charge_type="RENT", billing_frequency="ANNUALLY",
        amount_paise=8_000_000, payment_timing="UPFRONT_FULL",
    )
    _lpc(
        db, listing.id,
        charge_type="FOOD", amount_paise=200_000,
    )
    _lpc(
        db, listing.id,
        charge_type="MAINTENANCE", calculation_basis="PER_UNIT",
        amount_paise=50_000,
    )
    _lpc(
        db, listing.id,
        charge_type="ELECTRICITY", calculation_basis="CONSUMPTION",
        billing_frequency="USAGE_BASED", variability="VARIABLE",
        amount_paise=None, rate_paise_per_unit=1000, consumption_unit="kWh",
    )
    _lpc(
        db, listing.id,
        charge_type="DEPOSIT", calculation_basis="PER_UNIT",
        billing_frequency="ONE_TIME", amount_paise=1_000_000,
        refundable=True, payment_timing="ON_MOVE_IN",
    )
    db.flush()
    assert db.query(ListingPriceComponent).filter_by(listing_id=listing.id).count() == 5


def test_monthly_pg_example_valid(db):
    listing = _listing(db, "pc-monthly")
    _lpc(db, listing.id, charge_type="RENT", amount_paise=800_000)
    _lpc(db, listing.id, charge_type="FOOD", amount_paise=200_000)
    _lpc(
        db, listing.id,
        charge_type="MAINTENANCE", calculation_basis="PER_UNIT",
        amount_paise=50_000,
    )
    _lpc(
        db, listing.id,
        charge_type="DEPOSIT", calculation_basis="PER_UNIT",
        billing_frequency="ONE_TIME", amount_paise=800_000,
        refundable=True, payment_timing="ON_MOVE_IN",
    )
    db.flush()
    assert db.query(ListingPriceComponent).filter_by(listing_id=listing.id).count() == 4


def test_delete_listing_cascades_components(db):
    listing = _listing(db, "pc-del")
    _lpc(db, listing.id)
    db.flush()
    db.delete(listing)
    db.flush()
    assert db.query(ListingPriceComponent).count() == 0


# ---- Photos ------------------------------------------------------------------


def test_photo_defaults(db):
    listing = _listing(db, "ph-defaults")
    photo = _photo(db, listing.id, "photos/1.jpg")
    assert photo.upload_status == "PENDING"
    assert photo.media_type == "PHOTO"
    assert photo.is_cover is False
    assert photo.display_order == 0


def test_photo_storage_key_unique(db):
    listing = _listing(db, "ph-unique")
    _photo(db, listing.id, "photos/dup.jpg")
    db.add(ListingPhoto(listing_id=listing.id, storage_key="photos/dup.jpg"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_photo_invalid_upload_status_rejected(db):
    listing = _listing(db, "ph-status")
    db.add(
        ListingPhoto(
            listing_id=listing.id,
            storage_key="photos/bad.jpg",
            upload_status="UPLOADING",
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()


def test_photo_invalid_media_type_rejected(db):
    listing = _listing(db, "ph-media")
    db.add(
        ListingPhoto(
            listing_id=listing.id,
            storage_key="photos/bad2.jpg",
            media_type="AUDIO",
        )
    )
    with pytest.raises(IntegrityError):
        db.flush()


def test_delete_listing_cascades_photos(db):
    listing = _listing(db, "ph-del")
    _photo(db, listing.id, "photos/del.jpg")
    db.flush()
    db.delete(listing)
    db.flush()
    assert db.query(ListingPhoto).count() == 0


# ---- Delete chain ------------------------------------------------------------


def test_delete_property_cascades_to_units_listings(db):
    prop = _property(db, "dc-prop")
    unit = _unit(db, "dc-prop", property_id=prop.id)
    listing = _listing(db, "dc-prop", unit_id=unit.id)
    db.delete(prop)
    db.flush()
    assert db.query(RentalUnit).count() == 0
    assert db.query(Listing).count() == 0
    assert listing.id is not None