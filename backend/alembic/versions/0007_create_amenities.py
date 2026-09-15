"""create amenities table and seed data

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-15
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

SEED_AMENITIES = [
    ("wifi", "Wi-Fi", "connectivity"),
    ("ac", "Air Conditioning", "comfort"),
    ("parking", "Parking", "comfort"),
    ("power-backup", "Power Backup", "comfort"),
    ("laundry", "Laundry", "comfort"),
    ("food-mess", "Food Mess", "food"),
    ("drinking-water", "Drinking Water", "comfort"),
    ("security-guard", "Security Guard", "safety"),
    ("attached-bath", "Attached Bathroom", "comfort"),
    ("balcony", "Balcony", "space"),
    ("kitchen-access", "Kitchen Access", "space"),
    ("cctv", "CCTV", "safety"),
    ("housekeeping", "Housekeeping", "comfort"),
]

SEED_SLUGS = tuple(s[0] for s in SEED_AMENITIES)


def upgrade() -> None:
    op.create_table(
        "amenities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(60), nullable=False, unique=True),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=True),
        sa.Column("icon_slug", sa.String(60), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
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
    )

    for slug, label, category in SEED_AMENITIES:
        op.execute(
            "INSERT INTO amenities (slug, label, category, icon_slug) "
            f"VALUES ('{slug}', '{label}', '{category}', '{slug}') "
            "ON CONFLICT (slug) DO NOTHING"
        )


def downgrade() -> None:
    op.execute(
        "DELETE FROM amenities WHERE slug IN ({})".format(
            ", ".join(f"'{s}'" for s in SEED_SLUGS)
        )
    )
    op.drop_table("amenities")