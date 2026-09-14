from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from .auth import get_firebase_claims, get_or_create_owner
from .db import get_db
from .users import UserRead

router = APIRouter(prefix="/api/v1/owners", tags=["owners"])


class OwnerSignupIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=2, max_length=200)
    phone_number: str = Field(pattern=r"^\+?[0-9]{7,15}$")


@router.post("/signup", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def owner_signup(
    payload: OwnerSignupIn,
    response: Response,
    db: Session = Depends(get_db),
    claims: dict = Depends(get_firebase_claims),
):
    user, created = get_or_create_owner(
        db, claims, payload.display_name, payload.phone_number
    )
    if not created:
        response.status_code = status.HTTP_200_OK
    return user
