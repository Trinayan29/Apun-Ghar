"""listing photo size evidence

Revision ID: 0018
Revises: 0017
Create Date: 2026-09-28

Adds listing_photos.size_bytes (nullable integer, no backfill) so photo
confirmation can persist the backend-verified object size alongside the
READY status. Existing photo rows are untouched.
"""

import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "listing_photos", sa.Column("size_bytes", sa.Integer(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("listing_photos", "size_bytes")
