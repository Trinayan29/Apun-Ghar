"""add locations search index

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-13
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_locations_type_name", "locations", ["type", "name"]
    )


def downgrade() -> None:
    op.drop_index("ix_locations_type_name", table_name="locations")
