from datetime import date, time

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (Index("ix_locations_type_name", "type", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100))


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('USER', 'OWNER', 'ADMIN')", name="ck_users_role"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True)
    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    email_verified: Mapped[bool] = mapped_column(default=False)
    role: Mapped[str] = mapped_column(String(20), default="USER")
    display_name: Mapped[str | None] = mapped_column(String(200))
    phone_number: Mapped[str | None] = mapped_column(String(32))
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
    college_location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id", ondelete="RESTRICT")
    )
    workplace_location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id", ondelete="RESTRICT")
    )
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
    college_location: Mapped[Location | None] = relationship(
        foreign_keys=[college_location_id]
    )
    workplace_location: Mapped[Location | None] = relationship(
        foreign_keys=[workplace_location_id]
    )


class Amenity(Base):
    __tablename__ = "amenities"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    label: Mapped[str] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(Text)
    icon_slug: Mapped[str | None] = mapped_column(String(60))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    rental_units: Mapped[list["RentalUnit"]] = relationship(
        secondary="rental_unit_amenities",
        back_populates="amenities",
        passive_deletes=True,
    )


class Property(Base):
    __tablename__ = "properties"
    __table_args__ = (
        CheckConstraint(
            "property_type IN ('PG', 'HOSTEL', 'APARTMENT_FLAT', "
            "'INDEPENDENT_HOUSE', 'STUDIO_BUILDING', 'OTHER')",
            name="ck_properties_type",
        ),
        CheckConstraint(
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)",
            name="ck_properties_lat_range",
        ),
        CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="ck_properties_lng_range",
        ),
        CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR "
            "(latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_properties_geo_both_or_neither",
        ),
        CheckConstraint(
            "total_floors IS NULL OR total_floors > 0",
            name="ck_properties_floors",
        ),
        CheckConstraint(
            "built_year IS NULL OR (built_year >= 1800 AND built_year <= 2100)",
            name="ck_properties_built_year",
        ),
        Index("ix_properties_owner", "owner_user_id"),
        Index("ix_properties_area", "area_location_id"),
        Index("ix_properties_city_area", "city", "area_location_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    property_type: Mapped[str] = mapped_column(String(30))
    address_line: Mapped[str] = mapped_column(Text)
    locality: Mapped[str | None] = mapped_column(Text)
    area_location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id", ondelete="RESTRICT")
    )
    city: Mapped[str] = mapped_column(String(100), default="Guwahati")
    pincode: Mapped[str | None] = mapped_column(String(10))
    gate_closing_time: Mapped[time | None] = mapped_column(Time)
    is_independent: Mapped[bool | None] = mapped_column(Boolean)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    nearest_college_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id", ondelete="RESTRICT")
    )
    nearest_workplace_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id", ondelete="RESTRICT")
    )
    total_floors: Mapped[int | None]
    built_year: Mapped[int | None]
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped[User] = relationship()
    area_location: Mapped[Location | None] = relationship(
        foreign_keys=[area_location_id]
    )
    nearest_college: Mapped[Location | None] = relationship(
        foreign_keys=[nearest_college_id]
    )
    nearest_workplace: Mapped[Location | None] = relationship(
        foreign_keys=[nearest_workplace_id]
    )
    rental_units: Mapped[list["RentalUnit"]] = relationship(
        back_populates="property", cascade="all, delete-orphan"
    )


class RentalUnit(Base):
    __tablename__ = "rental_units"
    __table_args__ = (
        CheckConstraint(
            "unit_type IN ('PRIVATE_ROOM', 'SHARED_ROOM_BED', 'ENTIRE_FLAT', "
            "'ENTIRE_STUDIO', 'PG_BED', 'OTHER')",
            name="ck_units_type",
        ),
        CheckConstraint(
            "occupancy_type IN ('SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD_PLUS')",
            name="ck_units_occupancy",
        ),
        CheckConstraint("capacity > 0", name="ck_units_capacity"),
        CheckConstraint(
            "sharing IN ('PRIVATE', 'SHARED')", name="ck_units_sharing"
        ),
        CheckConstraint(
            "furnishing IN ('UNFURNISHED', 'SEMI_FURNISHED', 'FURNISHED')",
            name="ck_units_furnishing",
        ),
        CheckConstraint(
            "gender_scope IN ('ANY', 'MALE', 'FEMALE')",
            name="ck_units_gender_scope",
        ),
        CheckConstraint(
            "occupancy_type != 'SINGLE' OR (capacity = 1 AND sharing = 'PRIVATE')",
            name="ck_units_single_consistent",
        ),
        CheckConstraint(
            "sharing != 'SHARED' OR capacity >= 2",
            name="ck_units_shared_consistent",
        ),
        CheckConstraint(
            "sharing != 'PRIVATE' OR capacity = 1",
            name="ck_units_private_consistent",
        ),
        CheckConstraint(
            "bathrooms IS NULL OR bathrooms >= 0", name="ck_units_bathrooms"
        ),
        CheckConstraint(
            "floor_number IS NULL OR floor_number >= 0",
            name="ck_units_floor_number",
        ),
        CheckConstraint(
            "carpet_area_sqft IS NULL OR carpet_area_sqft > 0",
            name="ck_units_carpet_area",
        ),
        Index("ix_units_property", "property_id"),
        Index("ix_units_type_occ", "unit_type", "occupancy_type"),
        Index("ix_units_gender", "gender_scope"),
        Index(
            "ix_units_couple",
            "couple_friendly",
            postgresql_where=text("couple_friendly IS NOT NULL"),
        ),
        Index(
            "ix_units_visitors",
            "visitors_allowed",
            postgresql_where=text("visitors_allowed IS NOT NULL"),
        ),
        Index(
            "ix_units_pets",
            "pets_allowed",
            postgresql_where=text("pets_allowed IS NOT NULL"),
        ),
        Index(
            "ix_units_smoking",
            "smoking_allowed",
            postgresql_where=text("smoking_allowed IS NOT NULL"),
        ),
        Index(
            "ix_units_alcohol",
            "alcohol_allowed",
            postgresql_where=text("alcohol_allowed IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(
        ForeignKey("properties.id", ondelete="CASCADE")
    )
    unit_type: Mapped[str] = mapped_column(String(30))
    occupancy_type: Mapped[str] = mapped_column(String(20))
    capacity: Mapped[int]
    sharing: Mapped[str] = mapped_column(String(20))
    furnishing: Mapped[str] = mapped_column(String(20))
    gender_scope: Mapped[str] = mapped_column(String(20), default="ANY")
    bathrooms: Mapped[int | None]
    floor_number: Mapped[int | None]
    carpet_area_sqft: Mapped[int | None]
    couple_friendly: Mapped[bool | None] = mapped_column(Boolean)
    visitors_allowed: Mapped[bool | None] = mapped_column(Boolean)
    pets_allowed: Mapped[bool | None] = mapped_column(Boolean)
    smoking_allowed: Mapped[bool | None] = mapped_column(Boolean)
    alcohol_allowed: Mapped[bool | None] = mapped_column(Boolean)
    house_rules: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    property: Mapped[Property] = relationship(back_populates="rental_units")
    amenities: Mapped[list[Amenity]] = relationship(
        secondary="rental_unit_amenities",
        back_populates="rental_units",
        passive_deletes=True,
    )
    listings: Mapped[list["Listing"]] = relationship(
        back_populates="rental_unit", cascade="all, delete-orphan"
    )


class RentalUnitAmenity(Base):
    __tablename__ = "rental_unit_amenities"
    __table_args__ = (
        Index(
            "ix_ru_amenities_amenity_unit",
            "amenity_id",
            "rental_unit_id",
        ),
    )

    rental_unit_id: Mapped[int] = mapped_column(
        ForeignKey("rental_units.id", ondelete="CASCADE"), primary_key=True
    )
    amenity_id: Mapped[int] = mapped_column(
        ForeignKey("amenities.id", ondelete="RESTRICT"), primary_key=True
    )


class Listing(Base):
    __tablename__ = "listings"
    __table_args__ = (
        CheckConstraint(
            "rent_basis IN ('PER_PERSON', 'PER_ROOM', 'PER_UNIT')",
            name="ck_listings_rent_basis",
        ),
        CheckConstraint(
            "status IN ('DRAFT', 'PUBLISHED', 'PAUSED', 'RENTED', 'ARCHIVED')",
            name="ck_listings_status",
        ),
        CheckConstraint(
            "availability_status IN ('AVAILABLE_NOW', 'AVAILABLE_FROM_DATE', 'OCCUPIED')",
            name="ck_listings_availability_status",
        ),
        CheckConstraint(
            "(availability_status = 'AVAILABLE_FROM_DATE' AND available_from IS NOT NULL)"
            " OR (availability_status != 'AVAILABLE_FROM_DATE' AND available_from IS NULL)",
            name="ck_listings_avail_date",
        ),
        Index(
            "ix_listings_status_avail",
            "status",
            "availability_status",
        ),
        Index("ix_listings_unit_status", "rental_unit_id", "status"),
        Index(
            "uq_listings_unit_active",
            "rental_unit_id",
            unique=True,
            postgresql_where=text("status IN ('DRAFT', 'PUBLISHED', 'PAUSED')"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    rental_unit_id: Mapped[int] = mapped_column(
        ForeignKey("rental_units.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    rent_basis: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="DRAFT")
    availability_status: Mapped[str] = mapped_column(
        String(30), default="AVAILABLE_NOW"
    )
    available_from: Mapped[date | None]
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    rental_unit: Mapped[RentalUnit] = relationship(back_populates="listings")
    price_components: Mapped[list["ListingPriceComponent"]] = relationship(
        back_populates="listing", cascade="all, delete-orphan"
    )
    photos: Mapped[list["ListingPhoto"]] = relationship(
        back_populates="listing", cascade="all, delete-orphan"
    )


class ListingPriceComponent(Base):
    __tablename__ = "listing_price_components"
    __table_args__ = (
        CheckConstraint(
            "charge_type IN ('RENT', 'DEPOSIT', 'MAINTENANCE', 'FOOD', "
            "'ELECTRICITY', 'WATER', 'INTERNET', 'OTHER')",
            name="ck_lpc_charge_type",
        ),
        CheckConstraint(
            "calculation_basis IN ('PER_PERSON', 'PER_ROOM', 'PER_UNIT', 'CONSUMPTION')",
            name="ck_lpc_calculation_basis",
        ),
        CheckConstraint(
            "billing_frequency IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY', "
            "'ONE_TIME', 'USAGE_BASED')",
            name="ck_lpc_billing_frequency",
        ),
        CheckConstraint(
            "variability IN ('FIXED', 'VARIABLE')", name="ck_lpc_variability"
        ),
        CheckConstraint(
            "payment_timing IN ('PER_PERIOD', 'UPFRONT_FULL', "
            "'ON_MOVE_IN', 'ON_EXIT_SETTLED')",
            name="ck_lpc_payment_timing",
        ),
        CheckConstraint("display_order >= 0", name="ck_lpc_display_order"),
        CheckConstraint(
            "amount_paise IS NULL OR amount_paise >= 0",
            name="ck_lpc_amount_nonneg",
        ),
        CheckConstraint(
            "rate_paise_per_unit IS NULL OR rate_paise_per_unit >= 0",
            name="ck_lpc_rate_nonneg",
        ),
        CheckConstraint(
            "(amount_paise IS NOT NULL) IS DISTINCT FROM (rate_paise_per_unit IS NOT NULL)",
            name="ck_lpc_c1_xor",
        ),
        CheckConstraint(
            "calculation_basis != 'CONSUMPTION' OR (rate_paise_per_unit IS NOT NULL "
            "AND consumption_unit IS NOT NULL AND variability = 'VARIABLE' "
            "AND billing_frequency IN ('USAGE_BASED', 'MONTHLY'))",
            name="ck_lpc_c2_consumption_implies_rate",
        ),
        CheckConstraint(
            "calculation_basis = 'CONSUMPTION' OR amount_paise IS NOT NULL",
            name="ck_lpc_c3_nonconsumption_amount",
        ),
        CheckConstraint(
            "calculation_basis = 'CONSUMPTION' OR consumption_unit IS NULL",
            name="ck_lpc_c3_nonconsumption_no_unit",
        ),
        CheckConstraint(
            "variability != 'VARIABLE' OR rate_paise_per_unit IS NOT NULL",
            name="ck_lpc_c4_variable_rate",
        ),
        CheckConstraint(
            "charge_type != 'DEPOSIT' OR (billing_frequency = 'ONE_TIME' "
            "AND variability = 'FIXED' AND refundable = true "
            "AND amount_paise IS NOT NULL "
            "AND payment_timing IN ('ON_MOVE_IN', 'UPFRONT_FULL'))",
            name="ck_lpc_c5_deposit",
        ),
        CheckConstraint(
            "charge_type != 'RENT' OR (mandatory = true AND variability = 'FIXED' "
            "AND amount_paise IS NOT NULL)",
            name="ck_lpc_c6_rent",
        ),
        CheckConstraint(
            "billing_frequency != 'ONE_TIME' OR payment_timing != 'PER_PERIOD'",
            name="ck_lpc_c7_one_time_timing",
        ),
        CheckConstraint(
            "NOT (billing_frequency IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY') "
            "AND variability = 'FIXED') OR amount_paise IS NOT NULL",
            name="ck_lpc_c8_periodic_fixed_amount",
        ),
        CheckConstraint(
            "(charge_type = 'OTHER') = (label IS NOT NULL)",
            name="ck_lpc_c9_other_label",
        ),
        UniqueConstraint(
            "listing_id",
            "charge_type",
            "calculation_basis",
            "billing_frequency",
            name="uq_lpc_c10_unique",
        ),
        Index("ix_lpc_listing", "listing_id"),
        Index(
            "ix_lpc_listing_flags",
            "listing_id",
            "mandatory",
            "variability",
            "billing_frequency",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE")
    )
    charge_type: Mapped[str] = mapped_column(String(20))
    label: Mapped[str | None] = mapped_column(Text)
    calculation_basis: Mapped[str] = mapped_column(String(20))
    billing_frequency: Mapped[str] = mapped_column(String(20))
    variability: Mapped[str] = mapped_column(String(20))
    amount_paise: Mapped[int | None] = mapped_column(BigInteger)
    rate_paise_per_unit: Mapped[int | None] = mapped_column(BigInteger)
    consumption_unit: Mapped[str | None] = mapped_column(Text)
    mandatory: Mapped[bool] = mapped_column(default=True)
    included_in_advertised: Mapped[bool] = mapped_column(default=False)
    refundable: Mapped[bool] = mapped_column(default=False)
    payment_timing: Mapped[str] = mapped_column(String(20))
    display_order: Mapped[int] = mapped_column(default=0)

    listing: Mapped[Listing] = relationship(back_populates="price_components")


class ListingPhoto(Base):
    __tablename__ = "listing_photos"
    __table_args__ = (
        CheckConstraint(
            "width IS NULL OR width > 0", name="ck_photos_width"
        ),
        CheckConstraint(
            "height IS NULL OR height > 0", name="ck_photos_height"
        ),
        CheckConstraint(
            "display_order >= 0", name="ck_photos_display_order"
        ),
        CheckConstraint(
            "upload_status IN ('PENDING', 'READY', 'FAILED')",
            name="ck_photos_upload_status",
        ),
        CheckConstraint(
            "media_type IN ('PHOTO', 'VIDEO')", name="ck_photos_media_type"
        ),
        Index("ix_photos_listing_order", "listing_id", "display_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE")
    )
    storage_key: Mapped[str] = mapped_column(Text, unique=True)
    mime: Mapped[str | None] = mapped_column(String(100))
    width: Mapped[int | None]
    height: Mapped[int | None]
    display_order: Mapped[int] = mapped_column(default=0)
    is_cover: Mapped[bool] = mapped_column(default=False)
    upload_status: Mapped[str] = mapped_column(String(20), default="PENDING")
    media_type: Mapped[str] = mapped_column(String(20), default="PHOTO")

    listing: Mapped[Listing] = relationship(back_populates="photos")