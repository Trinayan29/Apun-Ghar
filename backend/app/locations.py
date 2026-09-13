from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Location

router = APIRouter(prefix="/api/v1/locations", tags=["locations"])

ALLOWED_LOCATION_TYPES = ("college", "workplace", "area")


class LocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    name: str
    city: str


@router.get("", response_model=list[LocationRead])
def list_locations(
    type: str | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    if type is not None and type not in ALLOWED_LOCATION_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"unsupported location type: {type}",
        )

    stmt = select(Location)
    if type is not None:
        stmt = stmt.where(Location.type == type)

    cleaned = search.strip() if search is not None else ""
    if cleaned:
        pattern = f"%{cleaned}%"
        stmt = stmt.where(
            or_(Location.name.ilike(pattern), Location.city.ilike(pattern))
        )

    stmt = stmt.order_by(Location.name.asc(), Location.id.asc()).limit(limit)
    return list(db.execute(stmt).scalars().all())
