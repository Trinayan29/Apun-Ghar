from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .auth import require_role
from .db import get_db
from .models import Amenity, Property, RentalUnit, User

property_units_router = APIRouter(
    prefix="/api/v1/owner/properties", tags=["owner-rental-units"]
)
units_router = APIRouter(prefix="/api/v1/owner/units", tags=["owner-rental-units"])

NOT_NULL_FIELDS = (
    "unit_type",
    "furnishing",
    "gender_scope",
)

ROOM_UNIT_TYPES = ("PRIVATE_ROOM", "SHARED_ROOM_BED", "PG_BED")
WHOLE_UNIT_TYPES = ("ENTIRE_FLAT", "ENTIRE_STUDIO")
LAYOUT_VALUES = ("1 RK", "1 BHK", "2 BHK", "3 BHK", "4 BHK+")
FOOD_VALUES = ("INCLUDED", "SEPARATE", "NONE")
COMPOSITION_FIELDS = (
    "unit_type",
    "occupancy_type",
    "capacity",
    "sharing",
    "layout",
)


class AmenityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    label: str
    category: str | None
    icon_slug: str | None
    is_active: bool


class RentalUnitCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    unit_type: Literal[
        "PRIVATE_ROOM",
        "SHARED_ROOM_BED",
        "ENTIRE_FLAT",
        "ENTIRE_STUDIO",
        "PG_BED",
        "OTHER",
    ]
    occupancy_type: Literal["SINGLE", "DOUBLE", "TRIPLE", "QUAD_PLUS"] | None = (
        None
    )
    capacity: int | None = Field(default=None, ge=1)
    sharing: Literal["PRIVATE", "SHARED"] | None = None
    layout: Literal["1 RK", "1 BHK", "2 BHK", "3 BHK", "4 BHK+"] | None = None
    is_independent: bool | None = None
    food_status: Literal["INCLUDED", "SEPARATE", "NONE"] | None = None
    furnishing: Literal["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"]
    gender_scope: Literal["ANY", "MALE", "FEMALE"] = "ANY"
    bathrooms: int | None = Field(default=None, ge=0)
    floor_number: int | None = Field(default=None, ge=0)
    carpet_area_sqft: int | None = Field(default=None, ge=1)
    couple_friendly: bool | None = None
    visitors_allowed: bool | None = None
    pets_allowed: bool | None = None
    smoking_allowed: bool | None = None
    alcohol_allowed: bool | None = None
    house_rules: str | None = Field(default=None, max_length=5000)
    amenity_ids: list[int] | None = None

    @field_validator("house_rules")
    @classmethod
    def _strip_house_rules(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("house_rules cannot be blank")
        return v


class RentalUnitUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    unit_type: (
        Literal[
            "PRIVATE_ROOM",
            "SHARED_ROOM_BED",
            "ENTIRE_FLAT",
            "ENTIRE_STUDIO",
            "PG_BED",
            "OTHER",
        ]
        | None
    ) = None
    occupancy_type: Literal["SINGLE", "DOUBLE", "TRIPLE", "QUAD_PLUS"] | None = (
        None
    )
    capacity: int | None = Field(default=None, ge=1)
    sharing: Literal["PRIVATE", "SHARED"] | None = None
    layout: Literal["1 RK", "1 BHK", "2 BHK", "3 BHK", "4 BHK+"] | None = None
    is_independent: bool | None = None
    food_status: Literal["INCLUDED", "SEPARATE", "NONE"] | None = None
    furnishing: Literal["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"] | None = (
        None
    )
    gender_scope: Literal["ANY", "MALE", "FEMALE"] | None = None
    bathrooms: int | None = Field(default=None, ge=0)
    floor_number: int | None = Field(default=None, ge=0)
    carpet_area_sqft: int | None = Field(default=None, ge=1)
    couple_friendly: bool | None = None
    visitors_allowed: bool | None = None
    pets_allowed: bool | None = None
    smoking_allowed: bool | None = None
    alcohol_allowed: bool | None = None
    house_rules: str | None = Field(default=None, max_length=5000)
    amenity_ids: list[int] | None = None

    @field_validator("house_rules")
    @classmethod
    def _strip_house_rules(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("house_rules cannot be blank")
        return v


class RentalUnitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    unit_type: str
    occupancy_type: str | None
    capacity: int | None
    sharing: str | None
    layout: str | None
    is_independent: bool | None
    food_status: str | None
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


def _ensure_not_null_fields(provided: dict) -> None:
    for field in NOT_NULL_FIELDS:
        if field in provided and provided[field] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field} cannot be null",
            )


def _validate_occupancy(
    occupancy_type: str | None, capacity: int | None, sharing: str | None
) -> None:
    if occupancy_type == "SINGLE" and not (
        capacity == 1 and sharing == "PRIVATE"
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="SINGLE occupancy requires capacity 1 and PRIVATE sharing",
        )
    if sharing == "SHARED" and not (capacity is not None and capacity >= 2):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="SHARED units require capacity of at least 2",
        )
    if sharing == "PRIVATE" and capacity != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="PRIVATE units require capacity of 1",
        )


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=detail,
    )


def _validate_composition(
    unit_type: str,
    occupancy_type: str | None,
    capacity: int | None,
    sharing: str | None,
    layout: str | None,
) -> None:
    """Room/bed units require capacity+sharing (+occupancy) with the
    existing occupancy invariants. Whole-home units (layout set, or
    ENTIRE_FLAT/ENTIRE_STUDIO type) must use NULL capacity/sharing/
    occupancy — NULL means "not applicable". OTHER allows both-or-neither
    (with invariants when values are present)."""
    if layout is not None:
        if unit_type not in (*WHOLE_UNIT_TYPES, "OTHER"):
            raise _unprocessable(
                "layout is only valid for whole-home units"
            )
        if (
            capacity is not None
            or sharing is not None
            or occupancy_type is not None
        ):
            raise _unprocessable(
                "whole-home units use layout instead of "
                "occupancy/capacity/sharing (use null)"
            )
        return
    if unit_type in WHOLE_UNIT_TYPES:
        if (
            capacity is not None
            or sharing is not None
            or occupancy_type is not None
        ):
            raise _unprocessable(
                "whole-home units use layout instead of "
                "occupancy/capacity/sharing (use null)"
            )
        return
    if unit_type == "OTHER":
        if (capacity is None) != (sharing is None):
            raise _unprocessable(
                "capacity and sharing must both be set or both be null"
            )
        if capacity is not None:
            if occupancy_type is None:
                raise _unprocessable(
                    "occupancy_type is required when capacity is set"
                )
            _validate_occupancy(occupancy_type, capacity, sharing)
        elif occupancy_type is not None:
            raise _unprocessable(
                "occupancy_type requires capacity and sharing to be set"
            )
        return
    if occupancy_type is None or capacity is None or sharing is None:
        raise _unprocessable(
            "occupancy_type, capacity and sharing are required "
            "for room/bed units"
        )
    _validate_occupancy(occupancy_type, capacity, sharing)


def _resolve_amenities(db: Session, amenity_ids: list[int]) -> list[Amenity]:
    unique_ids = sorted(set(amenity_ids))
    if not unique_ids:
        return []
    rows = (
        db.execute(
            select(Amenity)
            .where(
                Amenity.id.in_(unique_ids),
                Amenity.is_active.is_(True),
            )
            .order_by(Amenity.id.asc())
        )
        .scalars()
        .all()
    )
    found = {row.id for row in rows}
    bad = [amenity_id for amenity_id in unique_ids if amenity_id not in found]
    if bad:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"invalid amenity_ids: {bad} (unknown or inactive)",
        )
    return list(rows)


def _owned_property_or_404(
    db: Session, property_id: int, owner_id: int
) -> Property:
    prop = db.get(Property, property_id)
    if prop is None or prop.owner_user_id != owner_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Property not found"
        )
    return prop


def _owned_unit_or_404(db: Session, unit_id: int, owner_id: int) -> RentalUnit:
    stmt = (
        select(RentalUnit)
        .join(Property, RentalUnit.property_id == Property.id)
        .where(
            RentalUnit.id == unit_id,
            Property.owner_user_id == owner_id,
        )
        .options(selectinload(RentalUnit.amenities))
    )
    unit = db.execute(stmt).scalars().first()
    if unit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rental unit not found"
        )
    return unit


def _sort_amenities(unit: RentalUnit) -> RentalUnit:
    unit.amenities.sort(key=lambda amenity: amenity.id)
    return unit


@property_units_router.post(
    "/{property_id}/units",
    response_model=RentalUnitRead,
    status_code=status.HTTP_201_CREATED,
)
def create_rental_unit(
    property_id: int,
    payload: RentalUnitCreate,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
):
    prop = _owned_property_or_404(db, property_id, user.id)
    provided = payload.model_dump(exclude_unset=True)
    _ensure_not_null_fields(provided)
    _validate_composition(
        provided["unit_type"],
        provided.get("occupancy_type"),
        provided.get("capacity"),
        provided.get("sharing"),
        provided.get("layout"),
    )
    amenity_ids = provided.pop("amenity_ids", None)
    amenities = (
        _resolve_amenities(db, amenity_ids) if amenity_ids is not None else []
    )
    unit = RentalUnit(property_id=prop.id, **provided)
    unit.amenities = amenities
    db.add(unit)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="rental unit data violates database constraints",
        )
    db.refresh(unit)
    return _sort_amenities(unit)


@property_units_router.get(
    "/{property_id}/units", response_model=list[RentalUnitRead]
)
def list_property_units(
    property_id: int,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
):
    _owned_property_or_404(db, property_id, user.id)
    stmt = (
        select(RentalUnit)
        .where(RentalUnit.property_id == property_id)
        .order_by(RentalUnit.id.asc())
        .limit(limit)
        .offset(offset)
        .options(selectinload(RentalUnit.amenities))
    )
    units = list(db.execute(stmt).scalars().all())
    return [_sort_amenities(unit) for unit in units]


@units_router.get("/{unit_id}", response_model=RentalUnitRead)
def get_rental_unit(
    unit_id: int,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
):
    return _sort_amenities(_owned_unit_or_404(db, unit_id, user.id))


@units_router.patch("/{unit_id}", response_model=RentalUnitRead)
def update_rental_unit(
    unit_id: int,
    payload: RentalUnitUpdate,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
):
    unit = _owned_unit_or_404(db, unit_id, user.id)
    provided = payload.model_dump(exclude_unset=True)
    _ensure_not_null_fields(provided)
    if "amenity_ids" in provided and provided["amenity_ids"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="amenity_ids cannot be null; use [] to clear all amenities",
        )
    if any(key in provided for key in COMPOSITION_FIELDS):
        # Strict composition rules on the merged values whenever the
        # caller touches occupancy/capacity/sharing/layout/unit_type.
        # Untouched legacy rows keep working without modification.
        _validate_composition(
            provided.get("unit_type", unit.unit_type),
            provided.get("occupancy_type", unit.occupancy_type),
            provided.get("capacity", unit.capacity),
            provided.get("sharing", unit.sharing),
            provided.get("layout", unit.layout),
        )
    amenity_ids = provided.pop("amenity_ids", None)
    new_amenities = (
        _resolve_amenities(db, amenity_ids) if amenity_ids is not None else None
    )
    for key, value in provided.items():
        setattr(unit, key, value)
    if new_amenities is not None:
        unit.amenities = new_amenities
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="rental unit data violates database constraints",
        )
    db.refresh(unit)
    return _sort_amenities(unit)
