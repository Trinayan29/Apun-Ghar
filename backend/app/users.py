from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from .auth import get_current_user
from .db import get_db
from .locations import LocationRead
from .models import Location, User, UserProfile

router = APIRouter(prefix="/api/v1/users", tags=["users"])


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    firebase_uid: str
    email: str | None
    email_verified: bool
    role: str
    display_name: str | None
    created_at: datetime
    updated_at: datetime


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    college_location_id: int | None
    college_location: LocationRead | None
    workplace_location_id: int | None
    workplace_location: LocationRead | None
    budget_min: int | None
    budget_max: int | None
    move_in_date: date | None
    created_at: datetime
    updated_at: datetime


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    college_location_id: int | None = None
    workplace_location_id: int | None = None
    budget_min: int | None = Field(default=None, ge=0)
    budget_max: int | None = Field(default=None, ge=0)
    move_in_date: date | None = None


def _validate_location(
    db: Session, location_id: int, expected_type: str, field: str
) -> Location:
    row = db.get(Location, location_id)
    if row is None or row.type != expected_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"invalid {field}: must reference a '{expected_type}' location",
        )
    return row


@router.get("/me", response_model=UserRead)
def read_me(user: User = Depends(get_current_user)):
    return user


@router.get("/me/profile", response_model=ProfileRead)
def read_own_profile(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = (
        db.query(UserProfile).filter(UserProfile.user_id == user.id).one()
    )
    return profile


@router.patch("/me/profile", response_model=ProfileRead)
def update_own_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    provided = payload.model_dump(exclude_unset=True)
    profile = db.query(UserProfile).filter(UserProfile.user_id == user.id).one()
    if (
        "college_location_id" in provided
        and provided["college_location_id"] is not None
    ):
        _validate_location(
            db,
            provided["college_location_id"],
            "college",
            "college_location_id",
        )
    if (
        "workplace_location_id" in provided
        and provided["workplace_location_id"] is not None
    ):
        _validate_location(
            db,
            provided["workplace_location_id"],
            "workplace",
            "workplace_location_id",
        )
    effective_min = provided.get("budget_min", profile.budget_min)
    effective_max = provided.get("budget_max", profile.budget_max)
    if (
        effective_min is not None
        and effective_max is not None
        and effective_min > effective_max
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="budget_min cannot exceed budget_max",
        )
    for key, value in provided.items():
        setattr(profile, key, value)
    db.commit()
    db.refresh(profile)
    return profile
