from datetime import date

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100))


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('STUDENT', 'OWNER', 'ADMIN')", name="ck_users_role"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True)
    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    email_verified: Mapped[bool] = mapped_column(default=False)
    role: Mapped[str] = mapped_column(String(20), default="STUDENT")
    display_name: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    profile: Mapped["UserProfile | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )


class UserProfile(Base):
    __tablename__ = "user_profiles"
    __table_args__ = (
        CheckConstraint("budget_min IS NULL OR budget_min >= 0", name="ck_profiles_min"),
        CheckConstraint("budget_max IS NULL OR budget_max >= 0", name="ck_profiles_max"),
        CheckConstraint(
            "budget_max IS NULL OR budget_min IS NULL OR budget_max >= budget_min",
            name="ck_profiles_range",
        ),
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    college: Mapped[str | None] = mapped_column(String(200))
    workplace: Mapped[str | None] = mapped_column(String(200))
    budget_min: Mapped[int | None]
    budget_max: Mapped[int | None]
    move_in_date: Mapped[date | None]
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship(back_populates="profile")
