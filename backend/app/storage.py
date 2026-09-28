"""S3-compatible object storage (Backblaze B2) for listing photos.

Configuration follows the existing backend pattern: plain ``os.getenv``
with development-friendly defaults (see ``db.py``). Real credentials live
only in ``backend/.env`` (gitignored) — never in source, tests, or logs.

The browser NEVER receives B2 credentials: it gets short-lived presigned
URLs only. The bucket stays private; reads go through presigned GET URLs.
"""

import os
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status

B2_ENDPOINT_URL = os.getenv(
    "B2_ENDPOINT_URL", "https://s3.us-east-005.backblazeb2.com"
)
B2_BUCKET_NAME = os.getenv("B2_BUCKET_NAME", "apun-ghar-listing-photos")
B2_ACCESS_KEY_ID = os.getenv("B2_ACCESS_KEY_ID", "")
B2_SECRET_ACCESS_KEY = os.getenv("B2_SECRET_ACCESS_KEY", "")
B2_REGION = os.getenv("B2_REGION", "us-east-005")
B2_UPLOAD_EXPIRES_IN = int(os.getenv("B2_UPLOAD_EXPIRES_IN", "900"))
B2_VIEW_EXPIRES_IN = int(os.getenv("B2_VIEW_EXPIRES_IN", "3600"))

MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_PHOTOS_PER_LISTING = 15
MIN_READY_PHOTOS_FOR_PUBLISH = 3

ALLOWED_PHOTO_MIME: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def storage_configured() -> bool:
    return bool(B2_ACCESS_KEY_ID and B2_SECRET_ACCESS_KEY)


def photo_object_key(listing_id: int, photo_id: int, extension: str) -> str:
    """Server-generated key. Never built from user filenames."""
    return f"listings/{listing_id}/photos/{photo_id}.{extension}"


@dataclass
class StoredObject:
    size_bytes: int
    content_type: str | None


class StorageError(Exception):
    """Storage/auth/configuration failure (bad credentials, bad endpoint,
    missing bucket, permissions, network). Never carries credentials —
    messages are static; the original exception is chained, never quoted."""


def _error_code(exc: Exception) -> str | None:
    try:
        from botocore.exceptions import ClientError
    except ImportError:
        return None
    if not isinstance(exc, ClientError):
        return None
    code = exc.response.get("Error", {}).get("Code", "")
    return str(code) if code else None


def _is_not_found(exc: Exception) -> bool:
    """Genuine missing object only. A missing bucket is a configuration
    failure, never 'object missing'."""
    return _error_code(exc) in ("404", "NoSuchKey", "NotFound")


class StorageService:
    """Provider-neutral surface used by listing endpoints."""

    def presign_upload(
        self, key: str, content_type: str, expires_in: int
    ) -> str:
        raise NotImplementedError

    def presign_view(self, key: str, expires_in: int) -> str:
        raise NotImplementedError

    def object_exists(self, key: str) -> StoredObject | None:
        raise NotImplementedError

    def delete_object(self, key: str) -> None:
        raise NotImplementedError


class B2StorageService(StorageService):
    def __init__(self) -> None:
        import boto3

        self._client = boto3.client(
            "s3",
            endpoint_url=B2_ENDPOINT_URL,
            aws_access_key_id=B2_ACCESS_KEY_ID,
            aws_secret_access_key=B2_SECRET_ACCESS_KEY,
            region_name=B2_REGION,
        )

    def presign_upload(
        self, key: str, content_type: str, expires_in: int
    ) -> str:
        return self._client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": B2_BUCKET_NAME,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
            HttpMethod="PUT",
        )

    def presign_view(self, key: str, expires_in: int) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": B2_BUCKET_NAME, "Key": key},
            ExpiresIn=expires_in,
            HttpMethod="GET",
        )

    def object_exists(self, key: str) -> StoredObject | None:
        try:
            head = self._client.head_object(Bucket=B2_BUCKET_NAME, Key=key)
        except Exception as exc:
            if _is_not_found(exc):
                return None
            raise StorageError("photo storage lookup failed") from exc
        return StoredObject(
            size_bytes=int(head.get("ContentLength", 0)),
            content_type=head.get("ContentType"),
        )

    def delete_object(self, key: str) -> None:
        try:
            self._client.delete_object(Bucket=B2_BUCKET_NAME, Key=key)
        except Exception as exc:
            if _is_not_found(exc):
                return
            raise StorageError("photo storage delete failed") from exc


class FakeStorageService(StorageService):
    """In-memory fake for automated tests. No network, no credentials."""

    def __init__(self) -> None:
        self.objects: dict[str, StoredObject] = {}
        self.deleted: list[str] = []
        # Keys that raise StorageError, simulating auth/config/network
        # failures (as opposed to genuinely missing objects).
        self.fail_keys: set[str] = set()

    def presign_upload(
        self, key: str, content_type: str, expires_in: int
    ) -> str:
        return f"https://fake-b2.test/upload/{key}?expires={expires_in}"

    def presign_view(self, key: str, expires_in: int) -> str:
        return f"https://fake-b2.test/view/{key}?expires={expires_in}"

    def object_exists(self, key: str) -> StoredObject | None:
        if key in self.fail_keys:
            raise StorageError("photo storage lookup failed")
        return self.objects.get(key)

    def delete_object(self, key: str) -> None:
        if key in self.fail_keys:
            raise StorageError("photo storage delete failed")
        self.deleted.append(key)
        self.objects.pop(key, None)

    def put_object(
        self, key: str, size_bytes: int, content_type: str | None
    ) -> None:
        self.objects[key] = StoredObject(
            size_bytes=size_bytes, content_type=content_type
        )


def get_storage_or_none() -> StorageService | None:
    if not storage_configured():
        return None
    return B2StorageService()


def require_storage(
    storage: StorageService | None = Depends(get_storage_or_none),
) -> StorageService:
    if storage is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="photo storage is not configured",
        )
    return storage
