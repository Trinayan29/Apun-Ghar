"""create properties table

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-15
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "properties",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "owner_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("property_type", sa.String(30), nullable=False),
        sa.Column("address_line", sa.Text(), nullable=False),
        sa.Column("locality", sa.Text(), nullable=True),
        sa.Column(
            "area_location_id",
            sa.Integer(),
            sa.ForeignKey("locations.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "city", sa.String(100), nullable=False, server_default="Guwahati"
        ),
        sa.Column("pincode", sa.String(10), nullable=True),
        sa.Column("gate_closing_time", sa.Time(), nullable=True),
        sa.Column("is_independent", sa.Boolean(), nullable=True),
        sa.Column("latitude", sa.Double(), nullable=True),
        sa.Column("longitude", sa.Double(), nullable=True),
        sa.Column(
            "nearest_college_id",
            sa.Integer(),
            sa.ForeignKey("locations.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "nearest_workplace_id",
            sa.Integer(),
            sa.ForeignKey("locations.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("total_floors", sa.Integer(), nullable=True),
        sa.Column("built_year", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "property_type IN ('PG', 'HOSTEL', 'APARTMENT_FLAT', "
            "'INDEPENDENT_HOUSE', 'STUDIO_BUILDING', 'OTHER')",
            name="ck_properties_type",
        ),
        sa.CheckConstraint(
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)",
            name="ck_properties_lat_range",
        ),
        sa.CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="ck_properties_lng_range",
        ),
        sa.CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR "
            "(latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_properties_geo_both_or_neither",
        ),
        sa.CheckConstraint(
            "total_floors IS NULL OR total_floors > 0",
            name="ck_properties_floors",
        ),
        sa.CheckConstraint(
            "built_year IS NULL OR (built_year >= 1800 AND built_year <= 2100)",
            name="ck_properties_built_year",
        ),
    )
    op.create_index(
        "ix_properties_owner", "properties", ["owner_user_id"]
    )
    op.create_index(
        "ix_properties_area", "properties", ["area_location_id"]
    )
    op.create_index(
        "ix_properties_city_area", "properties", ["city", "area_location_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_properties_city_area", table_name="properties")
    op.drop_index("ix_properties_area", table_name="properties")
    op.drop_index("ix_properties_owner", table_name="properties")
    op.drop_table("properties")