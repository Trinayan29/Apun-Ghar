from datetime import datetime, time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import require_role
from .db import get_db
from .locations import LocationRead, validate_location_reference
from .models import Property, User

router = APIRouter(prefix="/api/v1/owner/properties", tags=["owner-properties"])

PINCODE_RE = r"^[1-9][0-9]{5}$"

NOT_NULL_FIELDS = ("property_type", "address_line", "city")


def _strip_nonblank(v: str | None, field: str) -> str | None:
    if v is None:
        return v
    v = v.strip()
    if not v:
        raise ValueError(f"{field} cannot be blank")
    return v


class PropertyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    property_type: Literal[
        "PG",
        "HOSTEL",
        "APARTMENT_FLAT",
        "INDEPENDENT_HOUSE",
        "STUDIO_BUILDING",
        "OTHER",
    ]
    address_line: str = Field(min_length=1, max_length=2000)
    locality: str | None = Field(default=None, max_length=2000)
    area_location_id: int | None = None
    city: str | None = Field(default=None, max_length=100)
    pincode: str | None = Field(default=None, pattern=PINCODE_RE)
    gate_closing_time: time | None = None
    is_independent: bool | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    nearest_college_id: int | None = None
    nearest_workplace_id: int | None = None
    total_floors: int | None = Field(default=None, ge=1)
    built_year: int | None = Field(default=None, ge=1800, le=2100)

    @field_validator("address_line")
    @classmethod
    def _strip_address_line(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("address_line cannot be blank")
        return v

    @field_validator("city", "locality")
    @classmethod
    def _strip_city_locality(
        cls, v: str | None, info: ValidationInfo
    ) -> str | None:
        return _strip_nonblank(v, info.field_name)


class PropertyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    property_type: Literal[
        "PG",
        "HOSTEL",
        "APARTMENT_FLAT",
        "INDEPENDENT_HOUSE",
        "STUDIO_BUILDING",
        "OTHER",
    ] | None = None
    address_line: str | None = Field(default=None, min_length=1, max_length=2000)
    locality: str | None = Field(default=None, max_length=2000)
    area_location_id: int | None = None
    city: str | None = Field(default=None, max_length=100)
    pincode: str | None = Field(default=None, pattern=PINCODE_RE)
    gate_closing_time: time | None = None
    is_independent: bool | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    nearest_college_id: int | None = None
    nearest_workplace_id: int | None = None
    total_floors: int | None = Field(default=None, ge=1)
    built_year: int | None = Field(default=None, ge=1800, le=2100)

    @field_validator("address_line")
    @classmethod
    def _strip_address_line(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("address_line cannot be blank")
        return v

    @field_validator("city", "locality")
    @classmethod
    def _strip_city_locality(
        cls, v: str | None, info: ValidationInfo
    ) -> str | None:
        return _strip_nonblank(v, info.field_name)


class PropertyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_user_id: int
    property_type: str
    address_line: str
    locality: str | None
    area_location_id: int | None
    area_location: LocationRead | None
    city: str
    pincode: str | None
    gate_closing_time: time | None
    is_independent: bool | None
    latitude: float | None
    longitude: float | None
    nearest_college_id: int | None
    nearest_college: LocationRead | None
    nearest_workplace_id: int | None
    nearest_workplace: LocationRead | None
    total_floors: int | None
    built_year: int | None
    created_at: datetime
    updated_at: datetime


def _validate_geo(latitude: float | None, longitude: float | None) -> None:
    if (latitude is None) != (longitude is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="latitude and longitude must both be set or both be null",
        )


def _ensure_not_null_fields(provided: dict) -> None:
    for field in NOT_NULL_FIELDS:
        if field in provided and provided[field] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field} cannot be null",
            )


def _validate_location_refs(db: Session, provided: dict) -> None:
    if provided.get("area_location_id") is not None:
        validate_location_reference(
            db, provided["area_location_id"], "area", "area_location_id"
        )
    if provided.get("nearest_college_id") is not None:
        validate_location_reference(
            db, provided["nearest_college_id"], "college", "nearest_college_id"
        )
    if provided.get("nearest_workplace_id") is not None:
        validate_location_reference(
            db,
            provided["nearest_workplace_id"],
            "workplace",
            "nearest_workplace_id",
        )


def _owned_or_404(db: Session, property_id: int, owner_id: int) -> Property:
    prop = db.get(Property, property_id)
    if prop is None or prop.owner_user_id != owner_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Property not found"
        )
    return prop


@router.post("", response_model=PropertyRead, status_code=status.HTTP_201_CREATED)
def create_property(
    payload: PropertyCreate,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
):
    provided = payload.model_dump(exclude_unset=True)
    _ensure_not_null_fields(provided)
    _validate_geo(provided.get("latitude"), provided.get("longitude"))
    _validate_location_refs(db, provided)
    prop = Property(owner_user_id=user.id, **provided)
    db.add(prop)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="property data violates database constraints",
        )
    db.refresh(prop)
    return prop


@router.get("", response_model=list[PropertyRead])
def list_owner_properties(
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
):
    stmt = (
        select(Property)
        .where(Property.owner_user_id == user.id)
        .order_by(Property.id.asc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.execute(stmt).scalars().all())


@router.get("/{property_id}", response_model=PropertyRead)
def get_owner_property(
    property_id: int,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
):
    return _owned_or_404(db, property_id, user.id)


@router.patch("/{property_id}", response_model=PropertyRead)
def update_owner_property(
    property_id: int,
    payload: PropertyUpdate,
    user: User = Depends(require_role("OWNER")),
    db: Session = Depends(get_db),
):
    prop = _owned_or_404(db, property_id, user.id)
    provided = payload.model_dump(exclude_unset=True)
    _ensure_not_null_fields(provided)
    _validate_location_refs(db, provided)
    _validate_geo(
        provided.get("latitude", prop.latitude),
        provided.get("longitude", prop.longitude),
    )
    for key, value in provided.items():
        setattr(prop, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="property data violates database constraints",
        )
    db.refresh(prop)
    return prop