"""create listings table

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-15
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "listings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "rental_unit_id",
            sa.Integer(),
            sa.ForeignKey("rental_units.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("rent_basis", sa.String(20), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="DRAFT",
        ),
        sa.Column(
            "availability_status",
            sa.String(30),
            nullable=False,
            server_default="AVAILABLE_NOW",
        ),
        sa.Column("available_from", sa.Date(), nullable=True),
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
            "rent_basis IN ('PER_PERSON', 'PER_ROOM', 'PER_UNIT')",
            name="ck_listings_rent_basis",
        ),
        sa.CheckConstraint(
            "status IN ('DRAFT', 'PUBLISHED', 'PAUSED', 'RENTED', 'ARCHIVED')",
            name="ck_listings_status",
        ),
        sa.CheckConstraint(
            "availability_status IN ('AVAILABLE_NOW', 'AVAILABLE_FROM_DATE', 'OCCUPIED')",
            name="ck_listings_availability_status",
        ),
        sa.CheckConstraint(
            "(availability_status = 'AVAILABLE_FROM_DATE' AND available_from IS NOT NULL)"
            " OR (availability_status != 'AVAILABLE_FROM_DATE' AND available_from IS NULL)",
            name="ck_listings_avail_date",
        ),
    )
    op.create_index(
        "ix_listings_status_avail",
        "listings",
        ["status", "availability_status"],
    )
    op.create_index(
        "ix_listings_unit_status", "listings", ["rental_unit_id", "status"]
    )
    op.create_index(
        "uq_listings_unit_active",
        "listings",
        ["rental_unit_id"],
        unique=True,
        postgresql_where=sa.text(
            "status IN ('DRAFT', 'PUBLISHED', 'PAUSED')"
        ),
    )


def downgrade() -> None:
    op.drop_index("uq_listings_unit_active", table_name="listings")
    op.drop_index("ix_listings_unit_status", table_name="listings")
    op.drop_index("ix_listings_status_avail", table_name="listings")
    op.drop_table("listings")