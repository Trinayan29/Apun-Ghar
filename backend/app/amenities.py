from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Amenity

router = APIRouter(prefix="/api/v1/amenities", tags=["amenities"])


class AmenityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    label: str
    category: str | None
    icon_slug: str | None
    is_active: bool


@router.get("", response_model=list[AmenityRead])
def list_amenities(db: Session = Depends(get_db)):
    """Public reference catalog of active amenities.

    Read-only and non-sensitive: the same active rows already surface on
    owner unit reads and public listing reads. Inactive rows are excluded
    so the catalog exactly matches what `_resolve_amenities` accepts on
    write (a client can never resolve an id the write path would reject).
    """
    stmt = (
        select(Amenity)
        .where(Amenity.is_active.is_(True))
        .order_by(Amenity.id.asc())
    )
    return list(db.execute(stmt).scalars().all())
