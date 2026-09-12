import os

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

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
