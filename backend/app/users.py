from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import get_firebase_claims
from .db import get_db
from .models import User, UserProfile

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


def _email_taken_by_other(db: Session, email: str, uid: str) -> bool:
    return (
        db.query(User.id)
        .filter(User.email == email, User.firebase_uid != uid)
        .first()
        is not None
    )


def _apply_identity_sync(db: Session, user: User, claims: dict) -> None:
    email = claims.get("email")
    if (
        email
        and email != user.email
        and not _email_taken_by_other(db, email, user.firebase_uid)
    ):
        user.email = email
    verified = claims.get("email_verified")
    if isinstance(verified, bool) and verified != user.email_verified:
        user.email_verified = verified


def get_or_create_current_user(db: Session, claims: dict) -> User:
    uid = claims.get("uid")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase ID token",
        )
    user = db.query(User).filter(User.firebase_uid == uid).first()
    if user is not None:
        _apply_identity_sync(db, user, claims)
        db.commit()
        db.refresh(user)
        return user
    email = claims.get("email")
    if email and _email_taken_by_other(db, email, uid):
        email = None
    user = User(
        firebase_uid=uid,
        email=email,
        email_verified=bool(claims.get("email_verified", False)),
        display_name=claims.get("name"),
    )
    user.profile = UserProfile()
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return db.query(User).filter(User.firebase_uid == uid).one()
    db.refresh(user)
    return user


@router.get("/me", response_model=UserRead)
def read_me(
    claims: dict = Depends(get_firebase_claims),
    db: Session = Depends(get_db),
):
    return get_or_create_current_user(db, claims)
