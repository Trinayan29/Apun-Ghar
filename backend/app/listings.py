import os
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .auth import require_role
from .db import get_db
from .models import (
    Listing,
    ListingPhoto,
    ListingPriceComponent,
    Property,
    RentalUnit,
    User,
)
from .storage import (
    ALLOWED_PHOTO_MIME,
    B2_UPLOAD_EXPIRES_IN,
    B2_VIEW_EXPIRES_IN,
    MAX_PHOTO_BYTES,
    MAX_PHOTOS_PER_LISTING,
    StorageError,
    StorageService,
    get_storage_or_none,
    photo_object_key,
    require_storage,
)

router = APIRouter(prefix="/api/v1/owner/listings", tags=["owner-listings"])


def _strip_nonblank(v: str | None, field: str) -> str | None:
    if v is None:
        return v
    v = v.strip()
    if not v:
        raise ValueError(f"{field} cannot be blank")
    return v


class AmenityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    label: str
    category: str | None
    icon_slug: str | None
    is_active: bool


class UnitNestedRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    unit_type: str
    # Nullable like the RentalUnit columns and RentalUnitRead: whole-home
    # units legitimately store NULL here ("not applicable"). Declaring them
    # non-null 500s every owner-listings read for whole-home units.
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
    amenities: list[AmenityRead]
    created_at: datetime
    updated_at: datetime


class PriceComponentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    listing_id: int
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


class PhotoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    listing_id: int
    storage_key: str
    mime: str | None
    size_bytes: int | None = None
    width: int | None
    height: int | None
    display_order: int
    is_cover: bool
    upload_status: str
    media_type: str
    # Short-lived presigned view URL for the private bucket. Never a
    # credential; None when storage is unconfigured or nothing is uploaded.
    view_url: str | None = None


class ListingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rental_unit_id: int
    title: str
    description: str | None
    rent_basis: str
    status: str
    availability_status: str
    available_from: date | None
    rental_unit: UnitNestedRead
    price_components: list[PriceComponentRead]
    photos: list[PhotoRead]
    created_at: datetime
    updated_at: datetime


class ListingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=2, max_length=200)
    description: str | None = None
    rental_unit_id: int = Field(gt=0)
    rent_basis: Literal["PER_PERSON", "PER_ROOM", "PER_UNIT"]
    availability_status: Literal[
        "AVAILABLE_NOW", "AVAILABLE_FROM_DATE", "OCCUPIED"
    ] = "AVAILABLE_NOW"
    available_from: date | None = None

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("title cannot be blank")
        return v

    @field_validator("description")
    @classmethod
    def _strip_description(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("description cannot be blank")
        return v


class ListingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = None
    rent_basis: Literal["PER_PERSON", "PER_ROOM", "PER_UNIT"] | None = None

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("title cannot be blank")
        return v

    @field_validator("description")
    @classmethod
    def _strip_description(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("description cannot be blank")
        return v


class AvailabilityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    availability_status: Literal[
        "AVAILABLE_NOW", "AVAILABLE_FROM_DATE", "OCCUPIED"
    ]
    available_from: date | None = None


class PriceComponentItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    charge_type: Literal[
        "RENT",
        "DEPOSIT",
        "MAINTENANCE",
        "FOOD",
        "ELECTRICITY",
        "WATER",
        "INTERNET",
        "OTHER",
    ]
    label: str | None = None
    calculation_basis: Literal[
        "PER_PERSON", "PER_ROOM", "PER_UNIT", "CONSUMPTION"
    ]
    billing_frequency: Literal[
        "MONTHLY", "QUARTERLY", "ANNUALLY", "ONE_TIME", "USAGE_BASED"
    ]
    variability: Literal["FIXED", "VARIABLE"]
    amount_paise: int | None = Field(default=None, ge=0)
    rate_paise_per_unit: int | None = Field(default=None, ge=0)
    consumption_unit: str | None = None
    mandatory: bool = True
    included_in_advertised: bool = False
    refundable: bool = False
    payment_timing: Literal[
        "PER_PERIOD", "UPFRONT_FULL", "ON_MOVE_IN", "ON_EXIT_SETTLED"
    ]
    display_order: int = Field(default=0, ge=0)

    @field_validator("label", "consumption_unit")
    @classmethod
    def _strip_optional_text(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("label/consumption_unit cannot be blank")
        return v


class PhotoInit(BaseModel):
    """Owner-declared upload intent. The server generates the storage key;
    the client never chooses it. MIME and size are re-verified against the
    actual object at confirm time."""

    model_config = ConfigDict(extra="forbid")

    content_type: Literal["image/jpeg", "image/png", "image/webp"]
    size_bytes: int = Field(gt=0, le=MAX_PHOTO_BYTES)
    width: int | None = Field(default=None, gt=0)
    height: int | None = Field(default=None, gt=0)
    display_order: int = Field(default=0, ge=0)
    is_cover: bool = False


class PhotoInitResponse(PhotoRead):
    """PENDING photo plus the short-lived direct-upload grant."""

    upload_url: str
    upload_expires_in: int


class PhotoConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: int | None = Field(default=None, gt=0)
    height: int | None = Field(default=None, gt=0)
    display_order: int | None = Field(default=None, ge=0)
    is_cover: bool | None = None


class PhotoPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_order: int | None = Field(default=None, ge=0)
    is_cover: bool | None = None


def _listing_eager_options():
    return [
        selectinload(Listing.rental_unit).selectinload(RentalUnit.amenities),
        selectinload(Listing.price_components),
        selectinload(Listing.photos),
    ]


def _sort_nested(listing: Listing) -> Listing:
    listing.rental_unit.amenities.sort(key=lambda a: a.id)
    listing.price_components.sort(key=lambda c: (c.display_order, c.id))
    listing.photos.sort(key=lambda p: (p.display_order, p.id))
    return listing


def _owned_unit_or_404(
    db: Session, unit_id: int, owner_id: int
) -> RentalUnit:
    stmt = (
        select(RentalUnit)
        .join(Property, RentalUnit.property_id == Property.id)
        .where(
            RentalUnit.id == unit_id,
            Property.owner_user_id == owner_id,
        )
    )
    unit = db.execute(stmt).scalars().first()
    if unit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rental unit not found",
        )
    return unit


def _owned_listing_or_404(
    db: Session, listing_id: int, owner_id: int
) -> Listing:
    stmt = (
        select(Listing)
        .join(RentalUnit, Listing.rental_unit_id == RentalUnit.id)
        .join(Property, RentalUnit.property_id == Property.id)
        .where(
            Listing.id == listing_id,
            Property.owner_user_id == owner_id,
        )
        .options(*_listing_eager_options())
    )
    listing = db.execute(stmt).scalars().first()
    if listing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Listing not found",
        )
    return listing


def _validate_availability(
    availability_status: str,
    available_from: date | None,
    listing_status: str,
) -> None:
    if availability_status == "AVAILABLE_NOW":
        if available_from is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="available_from must be null when availability_status is AVAILABLE_NOW",
            )
    elif availability_status == "AVAILABLE_FROM_DATE":
        if available_from is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="available_from is required when availability_status is AVAILABLE_FROM_DATE",
            )
        if available_from < date.today():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="available_from cannot be in the past",
            )
    elif availability_status == "OCCUPIED":
        if available_from is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="available_from must be null when availability_status is OCCUPIED",
            )
        if listing_status == "PUBLISHED":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="OCCUPIED is not allowed when listing status is PUBLISHED",
            )


def _validate_price_item(item: dict, rent_basis: str) -> None:
    charge = item["charge_type"]
    basis = item["calculation_basis"]
    billing = item["billing_frequency"]
    variability = item["variability"]
    amount = item.get("amount_paise")
    rate = item.get("rate_paise_per_unit")
    consumption_unit = item.get("consumption_unit")
    label = item.get("label")
    mandatory = item.get("mandatory", True)
    refundable = item.get("refundable", False)
    payment_timing = item["payment_timing"]

    # C1: XOR amount / rate
    if (amount is None) == (rate is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="C1: exactly one of amount_paise or rate_paise_per_unit must be set",
        )
    # C2: CONSUMPTION implies rate + unit + VARIABLE + billing
    if basis == "CONSUMPTION":
        if not (
            rate is not None
            and consumption_unit is not None
            and variability == "VARIABLE"
            and billing in ("USAGE_BASED", "MONTHLY")
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="C2: CONSUMPTION requires rate, consumption_unit, VARIABLE variability and USAGE_BASED/MONTHLY billing",
            )
    else:
        # C3: non-CONSUMPTION requires amount, forbids consumption_unit
        if amount is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="C3: non-CONSUMPTION components require amount_paise",
            )
        if consumption_unit is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="C3: non-CONSUMPTION components must not set consumption_unit",
            )
    # C4: VARIABLE requires rate
    if variability == "VARIABLE" and rate is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="C4: VARIABLE components require rate_paise_per_unit",
        )
    # C5: DEPOSIT
    if charge == "DEPOSIT":
        if not (
            billing == "ONE_TIME"
            and variability == "FIXED"
            and refundable is True
            and amount is not None
            and payment_timing in ("ON_MOVE_IN", "UPFRONT_FULL")
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="C5: DEPOSIT requires ONE_TIME billing, FIXED variability, refundable=true, amount set and ON_MOVE_IN/UPFRONT_FULL timing",
            )
    # C6: RENT
    if charge == "RENT":
        if not (
            mandatory is True
            and variability == "FIXED"
            and amount is not None
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="C6: RENT requires mandatory=true, FIXED variability and amount_paise set",
            )
    # C7: ONE_TIME timing
    if billing == "ONE_TIME" and payment_timing == "PER_PERIOD":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="C7: ONE_TIME billing cannot use PER_PERIOD payment_timing",
        )
    # C8: periodic FIXED requires amount
    if (
        billing in ("MONTHLY", "QUARTERLY", "ANNUALLY")
        and variability == "FIXED"
        and amount is None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="C8: MONTHLY/QUARTERLY/ANNUALLY FIXED components require amount_paise",
        )
    # C9: OTHER <-> label
    is_other = charge == "OTHER"
    has_label = label is not None
    if is_other != has_label:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="C9: charge_type OTHER requires label; non-OTHER must not set label",
        )
    # rent_basis consistency for RENT components
    if charge == "RENT" and basis != rent_basis:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="RENT calculation_basis must match listing rent_basis",
        )


@router.post("", response_model=ListingRead, status_code=status.HTTP_201_CREATED)
def create_listing(
    payload: ListingCreate,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
):
    provided = payload.model_dump(exclude_unset=True)
    _validate_availability(
        provided.get("availability_status", "AVAILABLE_NOW"),
        provided.get("available_from"),
        "DRAFT",
    )
    unit = _owned_unit_or_404(db, provided["rental_unit_id"], user.id)
    listing = Listing(
        rental_unit_id=unit.id,
        title=provided["title"],
        description=provided.get("description"),
        rent_basis=provided["rent_basis"],
        status="DRAFT",
        availability_status=provided.get("availability_status", "AVAILABLE_NOW"),
        available_from=provided.get("available_from"),
    )
    db.add(listing)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        msg = str(exc.orig) if exc.orig is not None else str(exc)
        if "uq_listings_unit_active" in msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Rental unit already has an active listing",
            )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="listing data violates database constraints",
        )
    return _sort_nested(_owned_listing_or_404(db, listing.id, user.id))


@router.get("", response_model=list[ListingRead])
def list_owner_listings(
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
    storage: StorageService | None = Depends(get_storage_or_none),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    rental_unit_id: int | None = Query(default=None, gt=0),
):
    stmt = (
        select(Listing)
        .join(RentalUnit, Listing.rental_unit_id == RentalUnit.id)
        .join(Property, RentalUnit.property_id == Property.id)
        .where(Property.owner_user_id == user.id)
        .order_by(Listing.id.asc())
        .options(*_listing_eager_options())
    )
    if rental_unit_id is not None:
        # Narrowing filter for 409-recovery lookups. Owner scoping above is
        # unchanged: another owner's unit id yields [] (never their rows).
        stmt = stmt.where(Listing.rental_unit_id == rental_unit_id)
    stmt = stmt.limit(limit).offset(offset)
    rows = list(db.execute(stmt).scalars().all())
    nested = [_sort_nested(row) for row in rows]
    for row in nested:
        _attach_view_urls(row.photos, storage)
    return nested


@router.get("/{listing_id}", response_model=ListingRead)
def get_owner_listing(
    listing_id: int,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
    storage: StorageService | None = Depends(get_storage_or_none),
):
    listing = _sort_nested(_owned_listing_or_404(db, listing_id, user.id))
    _attach_view_urls(listing.photos, storage)
    return listing


@router.patch("/{listing_id}", response_model=ListingRead)
def update_owner_listing(
    listing_id: int,
    payload: ListingUpdate,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
):
    listing = _owned_listing_or_404(db, listing_id, user.id)
    provided = payload.model_dump(exclude_unset=True)
    if "title" in provided and provided["title"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="title cannot be null",
        )
    new_basis = provided.get("rent_basis", listing.rent_basis)
    if new_basis != listing.rent_basis:
        for comp in listing.price_components:
            if comp.charge_type == "RENT" and comp.calculation_basis != new_basis:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="RENT calculation_basis must match listing rent_basis",
                )
    for key, value in provided.items():
        setattr(listing, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="listing data violates database constraints",
        )
    return _sort_nested(_owned_listing_or_404(db, listing.id, user.id))


@router.post("/{listing_id}/availability", response_model=ListingRead)
def update_listing_availability(
    listing_id: int,
    payload: AvailabilityUpdate,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
):
    listing = _owned_listing_or_404(db, listing_id, user.id)
    provided = payload.model_dump(exclude_unset=True)
    _validate_availability(
        provided["availability_status"],
        provided.get("available_from"),
        listing.status,
    )
    listing.availability_status = provided["availability_status"]
    listing.available_from = provided.get("available_from")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="availability data violates database constraints",
        )
    return _sort_nested(_owned_listing_or_404(db, listing.id, user.id))


@router.put(
    "/{listing_id}/price-components",
    response_model=list[PriceComponentRead],
)
def replace_price_components(
    listing_id: int,
    payload: list[PriceComponentItem],
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
):
    listing = _owned_listing_or_404(db, listing_id, user.id)
    items = [item.model_dump(exclude_unset=True) for item in payload]
    for item in items:
        _validate_price_item(item, listing.rent_basis)
    seen: set[tuple[str, str, str]] = set()
    for item in items:
        key = (
            item["charge_type"],
            item["calculation_basis"],
            item["billing_frequency"],
        )
        if key in seen:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="duplicate price component identity",
            )
        seen.add(key)
    for comp in list(listing.price_components):
        db.delete(comp)
    db.flush()
    new_rows: list[ListingPriceComponent] = []
    for item in items:
        row = ListingPriceComponent(listing_id=listing.id, **item)
        db.add(row)
        new_rows.append(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        msg = str(exc.orig) if exc.orig is not None else str(exc)
        if "uq_lpc_c10_unique" in msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="duplicate price component identity",
            )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="price component data violates database constraints",
        )
    stmt = (
        select(ListingPriceComponent)
        .where(ListingPriceComponent.listing_id == listing.id)
        .order_by(
            ListingPriceComponent.display_order.asc(),
            ListingPriceComponent.id.asc(),
        )
    )
    return list(db.execute(stmt).scalars().all())


def _attach_view_urls(
    photos: list[ListingPhoto], storage: StorageService | None
) -> None:
    """Stamp transient presigned view URLs for READY photos. No-op without
    storage; Pydantic defaults view_url to None in that case."""
    if storage is None:
        return
    for photo in photos:
        if photo.upload_status != "READY":
            continue
        try:
            photo.view_url = storage.presign_view(
                photo.storage_key, B2_VIEW_EXPIRES_IN
            )
        except Exception:
            photo.view_url = None


@router.post(
    "/{listing_id}/photos:init",
    response_model=PhotoInitResponse,
    status_code=status.HTTP_201_CREATED,
)
def init_listing_photo(
    listing_id: int,
    payload: PhotoInit,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
    storage: StorageService = Depends(require_storage),
):
    listing = _owned_listing_or_404(db, listing_id, user.id)
    total_photos = (
        db.execute(
            select(ListingPhoto.id).where(
                ListingPhoto.listing_id == listing.id
            )
        )
        .scalars()
        .all()
    )
    if len(total_photos) >= MAX_PHOTOS_PER_LISTING:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="maximum 15 photos per listing",
        )
    extension = ALLOWED_PHOTO_MIME[payload.content_type]
    photo = ListingPhoto(
        listing_id=listing.id,
        # Temporary unique key; replaced with the final server-generated
        # key once the row id is known. Never client-supplied.
        storage_key=f"pending/{listing.id}/{os.urandom(8).hex()}",
        mime=payload.content_type,
        size_bytes=None,
        width=payload.width,
        height=payload.height,
        display_order=payload.display_order,
        is_cover=payload.is_cover,
        media_type="PHOTO",
        upload_status="PENDING",
    )
    db.add(photo)
    try:
        db.flush()
        photo.storage_key = photo_object_key(
            listing.id, photo.id, extension
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="photo data violates database constraints",
        )
    db.refresh(photo)
    upload_url = storage.presign_upload(
        photo.storage_key, payload.content_type, B2_UPLOAD_EXPIRES_IN
    )
    return PhotoInitResponse(
        **PhotoRead.model_validate(photo).model_dump(),
        upload_url=upload_url,
        upload_expires_in=B2_UPLOAD_EXPIRES_IN,
    )


@router.post(
    "/{listing_id}/photos/{photo_id}/confirm", response_model=PhotoRead
)
def confirm_listing_photo(
    listing_id: int,
    photo_id: int,
    payload: PhotoConfirm,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
    storage: StorageService = Depends(require_storage),
):
    listing = _owned_listing_or_404(db, listing_id, user.id)
    photo = (
        db.execute(
            select(ListingPhoto).where(
                ListingPhoto.id == photo_id,
                ListingPhoto.listing_id == listing.id,
            )
        )
        .scalars()
        .first()
    )
    if photo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Photo not found",
        )
    if photo.upload_status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="only PENDING photos can be confirmed",
        )
    try:
        stored = storage.object_exists(photo.storage_key)
    except StorageError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="photo storage is unavailable — try again",
        )
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="upload not found at the expected key — retry the upload",
        )
    if stored.size_bytes > MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="uploaded object exceeds the 5 MB limit",
        )
    if stored.content_type is not None and stored.content_type != photo.mime:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="uploaded content type does not match the declared type",
        )
    provided = payload.model_dump(exclude_unset=True)
    for field in ("width", "height", "display_order", "is_cover"):
        if field in provided and provided[field] is not None:
            setattr(photo, field, provided[field])
    photo.size_bytes = stored.size_bytes
    if stored.content_type:
        photo.mime = stored.content_type
    photo.upload_status = "READY"
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="photo data violates database constraints",
        )
    db.refresh(photo)
    _attach_view_urls([photo], storage)
    return photo


@router.delete(
    "/{listing_id}/photos/{photo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_listing_photo(
    listing_id: int,
    photo_id: int,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
    storage: StorageService | None = Depends(get_storage_or_none),
):
    listing = _owned_listing_or_404(db, listing_id, user.id)
    photo = (
        db.execute(
            select(ListingPhoto).where(
                ListingPhoto.id == photo_id,
                ListingPhoto.listing_id == listing.id,
            )
        )
        .scalars()
        .first()
    )
    if photo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Photo not found",
        )
    if storage is not None:
        # Fail closed: a storage failure keeps the row so the user can
        # retry instead of silently leaking an orphaned object.
        try:
            storage.delete_object(photo.storage_key)
        except StorageError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="photo storage is unavailable — try again",
            )
    db.delete(photo)
    _normalize_cover(listing)
    db.commit()
    return None


@router.patch("/{listing_id}/photos/{photo_id}", response_model=PhotoRead)
def patch_listing_photo(
    listing_id: int,
    photo_id: int,
    payload: PhotoPatch,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
    storage: StorageService | None = Depends(get_storage_or_none),
):
    listing = _owned_listing_or_404(db, listing_id, user.id)
    photo = (
        db.execute(
            select(ListingPhoto).where(
                ListingPhoto.id == photo_id,
                ListingPhoto.listing_id == listing.id,
            )
        )
        .scalars()
        .first()
    )
    if photo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Photo not found",
        )
    provided = payload.model_dump(exclude_unset=True)
    if provided.get("display_order") is not None:
        photo.display_order = provided["display_order"]
    if provided.get("is_cover") is True:
        # In-Python (not bulk) so the session never holds stale flags that
        # the normalize step below would misread.
        for p in listing.photos:
            p.is_cover = p.id == photo.id
    elif provided.get("is_cover") is False:
        photo.is_cover = False
    # Single-cover invariant: unsetting the only cover promotes the
    # lowest-order READY photo instead of leaving zero covers.
    _normalize_cover(listing)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="photo data violates database constraints",
        )
    db.refresh(photo)
    _attach_view_urls([photo], storage)
    return photo


def _normalize_cover(listing: Listing) -> None:
    ready = [p for p in listing.photos if p.upload_status == "READY"]
    if not ready:
        return
    explicit = [p for p in ready if p.is_cover]
    if explicit:
        winner = min(explicit, key=lambda p: (p.display_order, p.id))
    else:
        winner = min(ready, key=lambda p: (p.display_order, p.id))
    for p in listing.photos:
        p.is_cover = p.id == winner.id


def _check_publication_guards(db: Session, listing: Listing) -> None:
    ready_count = sum(
        1 for p in listing.photos if p.upload_status == "READY"
    )
    if ready_count < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="at least 3 READY photos are required for publication",
        )
    if not any(c.charge_type == "RENT" for c in listing.price_components):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="at least one RENT price component is required for publication",
        )
    prop = db.get(Property, listing.rental_unit.property_id)
    if (
        prop is None
        or not (prop.address_line or "").strip()
        or not (prop.city or "").strip()
        or (
            prop.area_location_id is None
            and not (prop.area_custom_name or "").strip()
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="property address, city and area are required for publication",
        )
    if listing.availability_status == "OCCUPIED":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="OCCUPIED listings cannot be published",
        )


@router.post("/{listing_id}/publish", response_model=ListingRead)
def publish_listing(
    listing_id: int,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
    storage: StorageService | None = Depends(get_storage_or_none),
):
    listing = _owned_listing_or_404(db, listing_id, user.id)
    if listing.status == "PUBLISHED":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="listing is already PUBLISHED",
        )
    if listing.status not in ("DRAFT", "PAUSED"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="only DRAFT or PAUSED listings can be published",
        )
    _check_publication_guards(db, listing)
    _normalize_cover(listing)
    listing.status = "PUBLISHED"
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="listing data violates database constraints",
        )
    published = _sort_nested(_owned_listing_or_404(db, listing.id, user.id))
    _attach_view_urls(published.photos, storage)
    return published


@router.post("/{listing_id}/pause", response_model=ListingRead)
def pause_listing(
    listing_id: int,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
    storage: StorageService | None = Depends(get_storage_or_none),
):
    listing = _owned_listing_or_404(db, listing_id, user.id)
    if listing.status != "PUBLISHED":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="only PUBLISHED listings can be paused",
        )
    listing.status = "PAUSED"
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="listing data violates database constraints",
        )
    paused = _sort_nested(_owned_listing_or_404(db, listing.id, user.id))
    _attach_view_urls(paused.photos, storage)
    return paused


@router.delete(
    "/{listing_id}/draft",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_owner_draft(
    listing_id: int,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
    storage: StorageService | None = Depends(get_storage_or_none),
):
    """Permanently delete an unfinished DRAFT listing and its dependents.

    Domain-specific on purpose: there are intentionally no generic DELETE
    endpoints for Property, RentalUnit, or Listing. The listing row goes
    with its price components and photo rows (ORM cascades); the rental
    unit goes only when no listing references it at all. The property is
    NEVER deleted here: it may be shared/reused, and draft provenance is
    not persisted server-side, so safe-by-default means retaining it.
    """
    listing = _owned_listing_or_404(db, listing_id, user.id)
    if listing.status != "DRAFT":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="only DRAFT listings can be deleted",
        )
    unit_id = listing.rental_unit_id
    if storage is not None:
        # Fail closed like the photo delete: a storage failure keeps every
        # row so the owner can retry instead of silently leaking orphans.
        # delete_object treats missing objects as success, so retrying
        # after a partial sweep is safe.
        try:
            for photo in listing.photos:
                storage.delete_object(photo.storage_key)
        except StorageError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="photo storage is unavailable — try again",
            )
    # One database transaction for all relational work: the listing
    # delete, the unit safety check, and the conditional unit delete
    # commit atomically, so a failure never reports an error for a
    # deletion that already happened. autoflush is disabled for this
    # app's sessions, so flush explicitly wherever a later statement
    # must observe an earlier write.
    try:
        # Lock the unit row for the rest of this transaction. A listing
        # INSERT takes a FOR KEY SHARE lock on this row for its foreign
        # key check, which conflicts with FOR UPDATE in both orders —
        # so no concurrent listing can slip in between the check below
        # and the conditional delete. (FOR NO KEY UPDATE would not
        # suffice, and the partial unique index alone does not cover
        # non-active statuses.)
        unit = (
            db.execute(
                select(RentalUnit)
                .where(RentalUnit.id == unit_id)
                .with_for_update()
            )
            .scalars()
            .first()
        )
        db.delete(listing)
        db.flush()
        # No status predicate on purpose: historical (ARCHIVED/RENTED)
        # rows protect the unit exactly like current ones.
        remaining = db.execute(
            select(Listing.id).where(Listing.rental_unit_id == unit_id)
        ).scalars().first()
        if remaining is None and unit is not None:
            db.delete(unit)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="listing data violates database constraints",
        )
    return None
