"""Public, unauthenticated renter marketplace reads.

Only listings whose lifecycle status is PUBLISHED are ever selected, and
the status predicate is part of every database query. No owner identity,
contact detail, exact address, or non-READY photo is exposed.
"""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from .db import get_db
from .listings import (
    _attach_view_urls,
    _sort_nested,
)
from .models import (
    Listing,
    ListingPriceComponent,
    Property,
    RentalUnit,
)
from .storage import StorageService, get_storage_or_none

router = APIRouter(prefix="/api/v1/listings", tags=["public-listings"])

PUBLIC_STATUS = "PUBLISHED"
PERIOD_MONTHS = {"MONTHLY": 1, "QUARTERLY": 3, "ANNUALLY": 12}

PropertyTypeFilter = Literal[
    "PG",
    "HOSTEL",
    "APARTMENT_FLAT",
    "INDEPENDENT_HOUSE",
    "ASSAM_TYPE_HOUSE",
    "STUDIO_BUILDING",
    "OTHER",
]


class PublicPropertyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str | None
    property_type: str
    locality: str | None
    city: str
    area_name: str | None


class PublicUnitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    unit_type: str
    layout: str | None
    occupancy_type: str | None
    capacity: int | None
    sharing: str | None
    furnishing: str
    gender_scope: str
    bathrooms: int | None
    floor_number: int | None
    carpet_area_sqft: int | None
    couple_friendly: bool | None
    visitors_allowed: bool | None
    pets_allowed: bool | None
    smoking_allowed: bool | None
    alcohol_allowed: bool | None
    house_rules: str | None
    amenities: list[str]


class PublicPhotoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    display_order: int
    is_cover: bool
    view_url: str | None


class PublicPriceComponentRead(BaseModel):
    """Public price rows omit the redundant parent listing identifier."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    charge_type: str
    label: str | None
    calculation_basis: str
    billing_frequency: str
    variability: str
    amount_paise: int | None
    rate_paise_per_unit: int | None
    consumption_unit: str | None
    mandatory: bool
    included_in_advertised: bool
    refundable: bool
    payment_timing: str
    display_order: int


class PublicListingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    rent_basis: str
    status: Literal["PUBLISHED"]
    availability_status: str
    available_from: date | None
    monthly_total_paise: int | None
    has_variable_charges: bool
    has_usage_charges: bool
    has_optional_charges: bool
    has_one_time_charges: bool
    property: PublicPropertyRead
    unit: PublicUnitRead


class PublicListingSummary(PublicListingRead):
    cover_photo: PublicPhotoRead | None
    photo_count: int


class PublicListingDetail(PublicListingRead):
    price_components: list[PublicPriceComponentRead]
    photos: list[PublicPhotoRead]


def _eligible_monthly_charge(row: ListingPriceComponent) -> bool:
    """Rows that can contribute to a baseline monthly total.

    The rule matches the documented honest-cost calculation: a charge is
    part of the baseline only when it is mandatory, fixed, periodic, and
    has an amount. One-time, usage-based, variable, rate-only, and
    optional charges are shown separately rather than folded into it.
    """

    return (
        row.mandatory is True
        and row.variability == "FIXED"
        and row.billing_frequency in PERIOD_MONTHS
        and row.amount_paise is not None
    )


def _monthly_estimate(
    components: list[ListingPriceComponent],
) -> tuple[int | None, bool, bool, bool, bool]:
    annualized_paise = 0
    baseline_count = 0
    has_variable = False
    has_usage = False
    has_optional = False
    has_one_time = False

    for row in components:
        if row.variability == "VARIABLE":
            has_variable = True
        if row.billing_frequency == "USAGE_BASED":
            has_usage = True
        if row.mandatory is not True and row.charge_type != "DEPOSIT":
            # A deposit is a move-in obligation, not an add-on: a
            # non-mandatory deposit must not read as "optional extras".
            has_optional = True
        if row.billing_frequency == "ONE_TIME":
            has_one_time = True
        if _eligible_monthly_charge(row):
            months = PERIOD_MONTHS[row.billing_frequency]
            annualized_paise += row.amount_paise * (12 // months)
            baseline_count += 1

    monthly_total = (
        (annualized_paise + 6) // 12 if baseline_count else None
    )
    return monthly_total, has_variable, has_usage, has_optional, has_one_time


def _monthly_budget_predicate(max_monthly_paise: int):
    """Exact integer comparison without dividing paise in the database."""

    eligible = and_(
        ListingPriceComponent.mandatory.is_(True),
        ListingPriceComponent.variability == "FIXED",
        ListingPriceComponent.billing_frequency.in_(tuple(PERIOD_MONTHS)),
        ListingPriceComponent.amount_paise.is_not(None),
    )
    annualized = (
        select(
            func.coalesce(
                func.sum(
                    case(
                        (
                            ListingPriceComponent.billing_frequency
                            == "MONTHLY",
                            ListingPriceComponent.amount_paise * 12,
                        ),
                        (
                            ListingPriceComponent.billing_frequency
                            == "QUARTERLY",
                            ListingPriceComponent.amount_paise * 4,
                        ),
                        (
                            ListingPriceComponent.billing_frequency
                            == "ANNUALLY",
                            ListingPriceComponent.amount_paise,
                        ),
                        else_=0,
                    )
                ),
                0,
            )
        )
        .where(
            ListingPriceComponent.listing_id == Listing.id,
            eligible,
        )
        .scalar_subquery()
    )
    baseline_count = (
        select(func.count())
        .where(
            ListingPriceComponent.listing_id == Listing.id,
            eligible,
        )
        .scalar_subquery()
    )
    # A listing with no baseline monthly figure is retained so that a
    # budget cap does not silently remove it. The response marks the
    # monthly total as unknown.
    # Compare the same rounded monthly figure the response displays
    # ((annualized + 6) // 12), so a listing shown at exactly the cap is
    # kept. Integer-only arithmetic: `/` on the sum is numeric division in
    # PostgreSQL, so wrap it in floor() to mirror the display rounding.
    rounded_monthly = func.floor((annualized + 6) / 12)
    return or_(
        baseline_count == 0,
        rounded_monthly <= max_monthly_paise,
    )


def _listing_options():
    return [
        selectinload(Listing.rental_unit)
        .selectinload(RentalUnit.property)
        .selectinload(Property.area_location),
        selectinload(Listing.rental_unit).selectinload(RentalUnit.amenities),
        selectinload(Listing.price_components),
        selectinload(Listing.photos),
    ]


def _public_property(prop: Property) -> dict:
    area_name = (
        prop.area_location.name
        if prop.area_location is not None
        else prop.area_custom_name
    )
    return {
        "name": prop.name,
        "property_type": prop.property_type,
        "locality": prop.locality,
        "city": prop.city,
        "area_name": area_name,
    }


def _public_unit(unit: RentalUnit) -> dict:
    return {
        "unit_type": unit.unit_type,
        "layout": unit.layout,
        "occupancy_type": unit.occupancy_type,
        "capacity": unit.capacity,
        "sharing": unit.sharing,
        "furnishing": unit.furnishing,
        "gender_scope": unit.gender_scope,
        "bathrooms": unit.bathrooms,
        "floor_number": unit.floor_number,
        "carpet_area_sqft": unit.carpet_area_sqft,
        "couple_friendly": unit.couple_friendly,
        "visitors_allowed": unit.visitors_allowed,
        "pets_allowed": unit.pets_allowed,
        "smoking_allowed": unit.smoking_allowed,
        "alcohol_allowed": unit.alcohol_allowed,
        "house_rules": unit.house_rules,
        "amenities": [
            amenity.label for amenity in unit.amenities if amenity.is_active
        ],
    }


def _ready_photos(listing: Listing) -> list:
    return [
        photo
        for photo in listing.photos
        if photo.upload_status == "READY" and photo.media_type == "PHOTO"
    ]


def _select_cover(ready_photos: list) -> object | None:
    explicit = [photo for photo in ready_photos if photo.is_cover]
    if explicit:
        return min(explicit, key=lambda p: (p.display_order, p.id))
    if ready_photos:
        return min(ready_photos, key=lambda p: (p.display_order, p.id))
    return None


def _public_photo(photo) -> dict:
    # view_url is a transient attribute stamped by _attach_view_urls; it is
    # absent when storage is unconfigured, in which case the photo is still
    # listed with a null URL so the UI can render its fallback.
    return {
        "id": photo.id,
        "display_order": photo.display_order,
        "is_cover": photo.is_cover,
        "view_url": getattr(photo, "view_url", None),
    }


def _public_base(listing: Listing) -> dict:
    monthly_total, variable, usage, optional, one_time = _monthly_estimate(
        listing.price_components
    )
    return {
        "id": listing.id,
        "title": listing.title,
        "description": listing.description,
        "rent_basis": listing.rent_basis,
        "status": listing.status,
        "availability_status": listing.availability_status,
        "available_from": listing.available_from,
        "monthly_total_paise": monthly_total,
        "has_variable_charges": variable,
        "has_usage_charges": usage,
        "has_optional_charges": optional,
        "has_one_time_charges": one_time,
        "property": _public_property(listing.rental_unit.property),
        "unit": _public_unit(listing.rental_unit),
    }


def _public_summary(
    listing: Listing, storage: StorageService | None
) -> PublicListingSummary:
    listing = _sort_nested(listing)
    ready = _ready_photos(listing)
    _attach_view_urls(ready, storage)
    cover = _select_cover(ready)
    return PublicListingSummary(
        **_public_base(listing),
        cover_photo=_public_photo(cover) if cover is not None else None,
        photo_count=len(ready),
    )


def _public_detail(
    listing: Listing, storage: StorageService | None
) -> PublicListingDetail:
    listing = _sort_nested(listing)
    ready = _ready_photos(listing)
    _attach_view_urls(ready, storage)
    return PublicListingDetail(
        **_public_base(listing),
        price_components=[
            {
                "id": row.id,
                "charge_type": row.charge_type,
                "label": row.label,
                "calculation_basis": row.calculation_basis,
                "billing_frequency": row.billing_frequency,
                "variability": row.variability,
                "amount_paise": row.amount_paise,
                "rate_paise_per_unit": row.rate_paise_per_unit,
                "consumption_unit": row.consumption_unit,
                "mandatory": row.mandatory,
                "included_in_advertised": row.included_in_advertised,
                "refundable": row.refundable,
                "payment_timing": row.payment_timing,
                "display_order": row.display_order,
            }
            for row in listing.price_components
        ],
        photos=[_public_photo(photo) for photo in ready],
    )


def _public_statement():
    return (
        select(Listing)
        .join(RentalUnit, Listing.rental_unit_id == RentalUnit.id)
        .join(Property, RentalUnit.property_id == Property.id)
        .where(Listing.status == PUBLIC_STATUS)
        .options(*_listing_options())
    )


@router.get("", response_model=list[PublicListingSummary])
def list_public_listings(
    db: Session = Depends(get_db),
    storage: StorageService | None = Depends(get_storage_or_none),
    limit: int = Query(default=20, ge=1, le=50),
    # Anonymous reads are unbounded by authentication, so cap the page
    # window. This bounds database work per request; it is not rate
    # limiting, which remains an open production decision.
    offset: int = Query(default=0, ge=0, le=10000),
    max_monthly_paise: int | None = Query(default=None, ge=0),
    property_type: PropertyTypeFilter | None = Query(default=None),
    area_location_id: int | None = Query(default=None, gt=0),
):
    stmt = _public_statement()
    if property_type is not None:
        stmt = stmt.where(Property.property_type == property_type)
    if area_location_id is not None:
        stmt = stmt.where(Property.area_location_id == area_location_id)
    if max_monthly_paise is not None:
        stmt = stmt.where(_monthly_budget_predicate(max_monthly_paise))
    stmt = stmt.order_by(Listing.id.asc()).limit(limit).offset(offset)
    rows = list(db.execute(stmt).scalars().all())
    return [_public_summary(row, storage) for row in rows]


@router.get("/{listing_id}", response_model=PublicListingDetail)
def get_public_listing(
    # listings.id is a PostgreSQL integer (int4): bound the path so
    # out-of-range values fail validation with 422 instead of raising an
    # unhandled DataError (500) inside the query.
    listing_id: int = Path(ge=1, le=2147483647),
    db: Session = Depends(get_db),
    storage: StorageService | None = Depends(get_storage_or_none),
):
    stmt = _public_statement().where(Listing.id == listing_id)
    listing = db.execute(stmt).scalars().first()
    if listing is None:
        # Published and unpublished/missing IDs share one response, so a
        # direct URL cannot distinguish a non-public listing from a
        # nonexistent one.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found"
        )
    return _public_detail(listing, storage)
