import os

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .models import User, UserProfile

_bearer = HTTPBearer(auto_error=False)


def project_id() -> str:
    return os.getenv("FIREBASE_PROJECT_ID", "demo-apun-ghar")


def init_firebase() -> None:
    if firebase_admin._apps:
        return
    if os.getenv("FIREBASE_AUTH_EMULATOR_HOST"):
        firebase_admin.initialize_app(options={"projectId": project_id()})
        return
    service_account = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if service_account:
        firebase_admin.initialize_app(
            credentials.Certificate(service_account),
            options={"projectId": project_id()},
        )
        return
    firebase_admin.initialize_app(options={"projectId": project_id()})


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_firebase_claims(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    if creds is None or creds.scheme.lower() != "bearer" or not creds.credentials:
        raise _unauthorized("Missing or malformed Authorization header")
    init_firebase()
    try:
        return firebase_auth.verify_id_token(creds.credentials)
    except Exception:
        raise _unauthorized("Invalid Firebase ID token")


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


def get_current_user(
    db: Session = Depends(get_db),
    claims: dict = Depends(get_firebase_claims),
) -> User:
    return get_or_create_current_user(db, claims)


def require_role(*allowed: str):
    allowed_roles = set(allowed)

    def check(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return check
