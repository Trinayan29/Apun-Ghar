"""create rental_units and rental_unit_amenities tables

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-15
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rental_units",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "property_id",
            sa.Integer(),
            sa.ForeignKey("properties.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("unit_type", sa.String(30), nullable=False),
        sa.Column("occupancy_type", sa.String(20), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("sharing", sa.String(20), nullable=False),
        sa.Column("furnishing", sa.String(20), nullable=False),
        sa.Column(
            "gender_scope",
            sa.String(20),
            nullable=False,
            server_default="ANY",
        ),
        sa.Column("bathrooms", sa.Integer(), nullable=True),
        sa.Column("floor_number", sa.Integer(), nullable=True),
        sa.Column("carpet_area_sqft", sa.Integer(), nullable=True),
        sa.Column("couple_friendly", sa.Boolean(), nullable=True),
        sa.Column("visitors_allowed", sa.Boolean(), nullable=True),
        sa.Column("pets_allowed", sa.Boolean(), nullable=True),
        sa.Column("smoking_allowed", sa.Boolean(), nullable=True),
        sa.Column("alcohol_allowed", sa.Boolean(), nullable=True),
        sa.Column("house_rules", sa.Text(), nullable=True),
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
            "unit_type IN ('PRIVATE_ROOM', 'SHARED_ROOM_BED', 'ENTIRE_FLAT', "
            "'ENTIRE_STUDIO', 'PG_BED', 'OTHER')",
            name="ck_units_type",
        ),
        sa.CheckConstraint(
            "occupancy_type IN ('SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD_PLUS')",
            name="ck_units_occupancy",
        ),
        sa.CheckConstraint("capacity > 0", name="ck_units_capacity"),
        sa.CheckConstraint(
            "sharing IN ('PRIVATE', 'SHARED')", name="ck_units_sharing"
        ),
        sa.CheckConstraint(
            "furnishing IN ('UNFURNISHED', 'SEMI_FURNISHED', 'FURNISHED')",
            name="ck_units_furnishing",
        ),
        sa.CheckConstraint(
            "gender_scope IN ('ANY', 'MALE', 'FEMALE')",
            name="ck_units_gender_scope",
        ),
        sa.CheckConstraint(
            "occupancy_type != 'SINGLE' OR (capacity = 1 AND sharing = 'PRIVATE')",
            name="ck_units_single_consistent",
        ),
        sa.CheckConstraint(
            "sharing != 'SHARED' OR capacity >= 2",
            name="ck_units_shared_consistent",
        ),
        sa.CheckConstraint(
            "sharing != 'PRIVATE' OR capacity = 1",
            name="ck_units_private_consistent",
        ),
        sa.CheckConstraint(
            "bathrooms IS NULL OR bathrooms >= 0", name="ck_units_bathrooms"
        ),
        sa.CheckConstraint(
            "floor_number IS NULL OR floor_number >= 0",
            name="ck_units_floor_number",
        ),
        sa.CheckConstraint(
            "carpet_area_sqft IS NULL OR carpet_area_sqft > 0",
            name="ck_units_carpet_area",
        ),
    )
    op.create_index("ix_units_property", "rental_units", ["property_id"])
    op.create_index(
        "ix_units_type_occ", "rental_units", ["unit_type", "occupancy_type"]
    )
    op.create_index("ix_units_gender", "rental_units", ["gender_scope"])
    op.create_index(
        "ix_units_couple",
        "rental_units",
        ["couple_friendly"],
        postgresql_where=sa.text("couple_friendly IS NOT NULL"),
    )
    op.create_index(
        "ix_units_visitors",
        "rental_units",
        ["visitors_allowed"],
        postgresql_where=sa.text("visitors_allowed IS NOT NULL"),
    )
    op.create_index(
        "ix_units_pets",
        "rental_units",
        ["pets_allowed"],
        postgresql_where=sa.text("pets_allowed IS NOT NULL"),
    )
    op.create_index(
        "ix_units_smoking",
        "rental_units",
        ["smoking_allowed"],
        postgresql_where=sa.text("smoking_allowed IS NOT NULL"),
    )
    op.create_index(
        "ix_units_alcohol",
        "rental_units",
        ["alcohol_allowed"],
        postgresql_where=sa.text("alcohol_allowed IS NOT NULL"),
    )

    op.create_table(
        "rental_unit_amenities",
        sa.Column(
            "rental_unit_id",
            sa.Integer(),
            sa.ForeignKey("rental_units.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "amenity_id",
            sa.Integer(),
            sa.ForeignKey("amenities.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
    )
    op.create_index(
        "ix_ru_amenities_amenity_unit",
        "rental_unit_amenities",
        ["amenity_id", "rental_unit_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_ru_amenities_amenity_unit", table_name="rental_unit_amenities")
    op.drop_table("rental_unit_amenities")
    op.drop_index("ix_units_alcohol", table_name="rental_units")
    op.drop_index("ix_units_smoking", table_name="rental_units")
    op.drop_index("ix_units_pets", table_name="rental_units")
    op.drop_index("ix_units_visitors", table_name="rental_units")
    op.drop_index("ix_units_couple", table_name="rental_units")
    op.drop_index("ix_units_gender", table_name="rental_units")
    op.drop_index("ix_units_type_occ", table_name="rental_units")
    op.drop_index("ix_units_property", table_name="rental_units")
    op.drop_table("rental_units")