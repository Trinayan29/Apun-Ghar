"""nullable capacity/sharing/occupancy with whole-home aware checks

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-22

Room/bed units keep required capacity/sharing (enforced by the API);
whole-home units (layout set, or ENTIRE_FLAT/ENTIRE_STUDIO type) use
NULL, meaning "not applicable". Existing CHECK expressions are NULL
tolerant (only FALSE violates), so they are kept unchanged; two new
CHECKs scope NULL to whole-home contexts. Existing rows all carry
capacity+sharing, so both new CHECKs hold for legacy data.
"""

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("rental_units", "capacity", existing_type=sa.Integer(), nullable=True)
    op.alter_column(
        "rental_units", "sharing", existing_type=sa.String(20), nullable=True
    )
    op.alter_column(
        "rental_units",
        "occupancy_type",
        existing_type=sa.String(20),
        nullable=True,
    )
    op.create_check_constraint(
        "ck_units_layout_scope",
        "rental_units",
        "(layout IS NULL) OR "
        "(unit_type IN ('ENTIRE_FLAT', 'ENTIRE_STUDIO', 'OTHER'))",
    )
    op.create_check_constraint(
        "ck_units_capacity_required",
        "rental_units",
        "((capacity IS NOT NULL) AND (sharing IS NOT NULL)) OR "
        "(layout IS NOT NULL) OR "
        "(unit_type IN ('ENTIRE_FLAT', 'ENTIRE_STUDIO', 'OTHER'))",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_units_capacity_required", "rental_units", type_="check"
    )
    op.drop_constraint("ck_units_layout_scope", "rental_units", type_="check")
    # Fails loudly if NULL rows exist (e.g. whole-home units created
    # after this upgrade) instead of silently corrupting them.
    op.alter_column(
        "rental_units", "occupancy_type", existing_type=sa.String(20), nullable=False
    )
    op.alter_column(
        "rental_units", "sharing", existing_type=sa.String(20), nullable=False
    )
    op.alter_column("rental_units", "capacity", existing_type=sa.Integer(), nullable=False)
