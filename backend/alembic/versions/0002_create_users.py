"""create users and user_profiles tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("firebase_uid", sa.String(128), nullable=False, unique=True),
        sa.Column("email", sa.String(320), nullable=True, unique=True),
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("role", sa.String(20), nullable=False, server_default="STUDENT"),
        sa.Column("display_name", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('STUDENT', 'OWNER', 'ADMIN')", name="ck_users_role"),
    )
    op.create_table(
        "user_profiles",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("college", sa.String(200), nullable=True),
        sa.Column("workplace", sa.String(200), nullable=True),
        sa.Column("budget_min", sa.Integer(), nullable=True),
        sa.Column("budget_max", sa.Integer(), nullable=True),
        sa.Column("move_in_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("budget_min IS NULL OR budget_min >= 0", name="ck_profiles_min"),
        sa.CheckConstraint("budget_max IS NULL OR budget_max >= 0", name="ck_profiles_max"),
        sa.CheckConstraint(
            "budget_max IS NULL OR budget_min IS NULL OR budget_max >= budget_min",
            name="ck_profiles_range",
        ),
    )


def downgrade() -> None:
    op.drop_table("user_profiles")
    op.drop_table("users")
