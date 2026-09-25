"""nullable property name (owner-defined place identity)

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-25

Adds properties.name: human-facing identity of the physical place
("Ashim's House"), distinct from address_line (location truth) and
Listing.title (offer title). Nullable with no default so existing rows
stay valid with NULL ("not named yet"); no backfill, no uniqueness.
Application validation (blank rejection, 120 chars) lives in the API
schemas, matching the existing city/locality conventions.
"""

import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "properties", sa.Column("name", sa.String(120), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("properties", "name")
