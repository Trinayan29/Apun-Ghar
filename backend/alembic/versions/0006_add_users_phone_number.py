"""add nullable users.phone_number

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-14
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone_number", sa.String(32), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "phone_number")
