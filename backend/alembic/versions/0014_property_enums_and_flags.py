"""assam-type property, curfew flag, listing title NOT NULL

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-22
"""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

OLD_PROPERTY_TYPES = (
    "'PG', 'HOSTEL', 'APARTMENT_FLAT', "
    "'INDEPENDENT_HOUSE', 'STUDIO_BUILDING', 'OTHER'"
)
NEW_PROPERTY_TYPES = (
    "'PG', 'HOSTEL', 'APARTMENT_FLAT', "
    "'INDEPENDENT_HOUSE', 'ASSAM_TYPE_HOUSE', 'STUDIO_BUILDING', "
    "'OTHER'"
)


def upgrade() -> None:
    bind = op.get_bind()
    null_ids = [
        row[0]
        for row in bind.execute(sa.text("SELECT id FROM listings WHERE title IS NULL"))
    ]
    if null_ids:
        raise RuntimeError(
            "cannot harden listings.title to NOT NULL: "
            f"{len(null_ids)} legacy row(s) have NULL titles: {null_ids}. "
            "Backfill explicit titles before retrying."
        )
    op.alter_column("listings", "title", existing_type=sa.Text(), nullable=False)

    op.drop_constraint("ck_properties_type", "properties", type_="check")
    op.create_check_constraint(
        "ck_properties_type",
        "properties",
        f"property_type IN ({NEW_PROPERTY_TYPES})",
    )
    op.add_column(
        "properties", sa.Column("has_curfew", sa.Boolean(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("properties", "has_curfew")
    op.drop_constraint("ck_properties_type", "properties", type_="check")
    op.create_check_constraint(
        "ck_properties_type",
        "properties",
        f"property_type IN ({OLD_PROPERTY_TYPES})",
    )
    op.alter_column("listings", "title", existing_type=sa.Text(), nullable=True)
