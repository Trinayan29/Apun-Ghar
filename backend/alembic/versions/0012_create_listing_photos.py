"""create listing_photos table

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-15
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "listing_photos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "listing_id",
            sa.Integer(),
            sa.ForeignKey("listings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("storage_key", sa.Text(), nullable=False, unique=True),
        sa.Column("mime", sa.String(100), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column(
            "display_order", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "is_cover", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column(
            "upload_status",
            sa.String(20),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column(
            "media_type",
            sa.String(20),
            nullable=False,
            server_default="PHOTO",
        ),
        sa.CheckConstraint(
            "width IS NULL OR width > 0", name="ck_photos_width"
        ),
        sa.CheckConstraint(
            "height IS NULL OR height > 0", name="ck_photos_height"
        ),
        sa.CheckConstraint(
            "display_order >= 0", name="ck_photos_display_order"
        ),
        sa.CheckConstraint(
            "upload_status IN ('PENDING', 'READY', 'FAILED')",
            name="ck_photos_upload_status",
        ),
        sa.CheckConstraint(
            "media_type IN ('PHOTO', 'VIDEO')", name="ck_photos_media_type"
        ),
    )
    op.create_index(
        "ix_photos_listing_order",
        "listing_photos",
        ["listing_id", "display_order"],
    )


def downgrade() -> None:
    op.drop_index("ix_photos_listing_order", table_name="listing_photos")
    op.drop_table("listing_photos")