"""create listing_price_components table

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-15
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "listing_price_components",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "listing_id",
            sa.Integer(),
            sa.ForeignKey("listings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("charge_type", sa.String(20), nullable=False),
        sa.Column("label", sa.Text(), nullable=True),
        sa.Column("calculation_basis", sa.String(20), nullable=False),
        sa.Column("billing_frequency", sa.String(20), nullable=False),
        sa.Column("variability", sa.String(20), nullable=False),
        sa.Column("amount_paise", sa.BigInteger(), nullable=True),
        sa.Column("rate_paise_per_unit", sa.BigInteger(), nullable=True),
        sa.Column("consumption_unit", sa.Text(), nullable=True),
        sa.Column(
            "mandatory", sa.Boolean(), nullable=False, server_default="true"
        ),
        sa.Column(
            "included_in_advertised",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "refundable", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column("payment_timing", sa.String(20), nullable=False),
        sa.Column(
            "display_order", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.CheckConstraint(
            "charge_type IN ('RENT', 'DEPOSIT', 'MAINTENANCE', 'FOOD', "
            "'ELECTRICITY', 'WATER', 'INTERNET', 'OTHER')",
            name="ck_lpc_charge_type",
        ),
        sa.CheckConstraint(
            "calculation_basis IN ('PER_PERSON', 'PER_ROOM', 'PER_UNIT', 'CONSUMPTION')",
            name="ck_lpc_calculation_basis",
        ),
        sa.CheckConstraint(
            "billing_frequency IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY', "
            "'ONE_TIME', 'USAGE_BASED')",
            name="ck_lpc_billing_frequency",
        ),
        sa.CheckConstraint(
            "variability IN ('FIXED', 'VARIABLE')", name="ck_lpc_variability"
        ),
        sa.CheckConstraint(
            "payment_timing IN ('PER_PERIOD', 'UPFRONT_FULL', "
            "'ON_MOVE_IN', 'ON_EXIT_SETTLED')",
            name="ck_lpc_payment_timing",
        ),
        sa.CheckConstraint(
            "display_order >= 0", name="ck_lpc_display_order"
        ),
        sa.CheckConstraint(
            "amount_paise IS NULL OR amount_paise >= 0",
            name="ck_lpc_amount_nonneg",
        ),
        sa.CheckConstraint(
            "rate_paise_per_unit IS NULL OR rate_paise_per_unit >= 0",
            name="ck_lpc_rate_nonneg",
        ),
        sa.CheckConstraint(
            "(amount_paise IS NOT NULL) IS DISTINCT FROM (rate_paise_per_unit IS NOT NULL)",
            name="ck_lpc_c1_xor",
        ),
        sa.CheckConstraint(
            "calculation_basis != 'CONSUMPTION' OR (rate_paise_per_unit IS NOT NULL "
            "AND consumption_unit IS NOT NULL AND variability = 'VARIABLE' "
            "AND billing_frequency IN ('USAGE_BASED', 'MONTHLY'))",
            name="ck_lpc_c2_consumption_implies_rate",
        ),
        sa.CheckConstraint(
            "calculation_basis = 'CONSUMPTION' OR amount_paise IS NOT NULL",
            name="ck_lpc_c3_nonconsumption_amount",
        ),
        sa.CheckConstraint(
            "calculation_basis = 'CONSUMPTION' OR consumption_unit IS NULL",
            name="ck_lpc_c3_nonconsumption_no_unit",
        ),
        sa.CheckConstraint(
            "variability != 'VARIABLE' OR rate_paise_per_unit IS NOT NULL",
            name="ck_lpc_c4_variable_rate",
        ),
        sa.CheckConstraint(
            "charge_type != 'DEPOSIT' OR (billing_frequency = 'ONE_TIME' "
            "AND variability = 'FIXED' AND refundable = true "
            "AND amount_paise IS NOT NULL "
            "AND payment_timing IN ('ON_MOVE_IN', 'UPFRONT_FULL'))",
            name="ck_lpc_c5_deposit",
        ),
        sa.CheckConstraint(
            "charge_type != 'RENT' OR (mandatory = true AND variability = 'FIXED' "
            "AND amount_paise IS NOT NULL)",
            name="ck_lpc_c6_rent",
        ),
        sa.CheckConstraint(
            "billing_frequency != 'ONE_TIME' OR payment_timing != 'PER_PERIOD'",
            name="ck_lpc_c7_one_time_timing",
        ),
        sa.CheckConstraint(
            "NOT (billing_frequency IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY') "
            "AND variability = 'FIXED') OR amount_paise IS NOT NULL",
            name="ck_lpc_c8_periodic_fixed_amount",
        ),
        sa.CheckConstraint(
            "(charge_type = 'OTHER') = (label IS NOT NULL)",
            name="ck_lpc_c9_other_label",
        ),
        sa.UniqueConstraint(
            "listing_id",
            "charge_type",
            "calculation_basis",
            "billing_frequency",
            name="uq_lpc_c10_unique",
        ),
    )
    op.create_index("ix_lpc_listing", "listing_price_components", ["listing_id"])
    op.create_index(
        "ix_lpc_listing_flags",
        "listing_price_components",
        ["listing_id", "mandatory", "variability", "billing_frequency"],
    )


def downgrade() -> None:
    op.drop_index("ix_lpc_listing_flags", table_name="listing_price_components")
    op.drop_index("ix_lpc_listing", table_name="listing_price_components")
    op.drop_table("listing_price_components")