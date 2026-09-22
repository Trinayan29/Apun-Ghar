"""add rental unit layout, independence and food status

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-22
"""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rental_units", sa.Column("layout", sa.String(20), nullable=True)
    )
    op.create_check_constraint(
        "ck_units_layout",
        "rental_units",
        "layout IS NULL OR layout IN ('1 RK', '1 BHK', '2 BHK', "
        "'3 BHK', '4 BHK+')",
    )
    op.add_column(
        "rental_units", sa.Column("is_independent", sa.Boolean(), nullable=True)
    )
    op.add_column(
        "rental_units", sa.Column("food_status", sa.String(20), nullable=True)
    )
    op.create_check_constraint(
        "ck_units_food_status",
        "rental_units",
        "food_status IS NULL OR food_status IN ('INCLUDED', "
        "'SEPARATE', 'NONE')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_units_food_status", "rental_units", type_="check")
    op.drop_column("rental_units", "food_status")
    op.drop_column("rental_units", "is_independent")
    op.drop_constraint("ck_units_layout", "rental_units", type_="check")
    op.drop_column("rental_units", "layout")
