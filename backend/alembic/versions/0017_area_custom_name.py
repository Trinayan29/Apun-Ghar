"""custom area name for properties

Revision ID: 0017
Revises: 0016
Create Date: 2026-09-27

Adds properties.area_custom_name (nullable text, no backfill) so owners
whose area is missing from the locations catalog are never blocked.
Canonical area_location_id is untouched; setting a canonical area clears
the custom text at the API layer. No rows are auto-created in locations.
"""

import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "properties", sa.Column("area_custom_name", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("properties", "area_custom_name")
