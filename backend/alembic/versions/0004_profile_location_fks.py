"""replace profile college/workplace text with location FKs

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-13
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_profiles",
        sa.Column("college_location_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "user_profiles",
        sa.Column("workplace_location_id", sa.Integer(), nullable=True),
    )
    # Defensive exact-match backfill. Unmatched legacy values stay NULL.
    # Never fuzzy-matches and never fails the migration on unmapped values.
    op.execute(
        sa.text(
            """
            UPDATE user_profiles
            SET college_location_id = (
                SELECT l.id FROM locations AS l
                WHERE l.type = 'college' AND l.name = user_profiles.college
                LIMIT 1
            )
            WHERE user_profiles.college IS NOT NULL
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE user_profiles
            SET workplace_location_id = (
                SELECT l.id FROM locations AS l
                WHERE l.type = 'workplace' AND l.name = user_profiles.workplace
                LIMIT 1
            )
            WHERE user_profiles.workplace IS NOT NULL
            """
        )
    )
    op.create_foreign_key(
        "fk_user_profiles_college_location",
        "user_profiles",
        "locations",
        ["college_location_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_user_profiles_workplace_location",
        "user_profiles",
        "locations",
        ["workplace_location_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.drop_column("user_profiles", "college")
    op.drop_column("user_profiles", "workplace")


def downgrade() -> None:
    op.add_column(
        "user_profiles",
        sa.Column("college", sa.String(200), nullable=True),
    )
    op.add_column(
        "user_profiles",
        sa.Column("workplace", sa.String(200), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE user_profiles
            SET college = (
                SELECT l.name FROM locations AS l
                WHERE l.id = user_profiles.college_location_id
            )
            WHERE user_profiles.college_location_id IS NOT NULL
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE user_profiles
            SET workplace = (
                SELECT l.name FROM locations AS l
                WHERE l.id = user_profiles.workplace_location_id
            )
            WHERE user_profiles.workplace_location_id IS NOT NULL
            """
        )
    )
    op.drop_constraint(
        "fk_user_profiles_college_location", "user_profiles", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_user_profiles_workplace_location", "user_profiles", type_="foreignkey"
    )
    op.drop_column("user_profiles", "college_location_id")
    op.drop_column("user_profiles", "workplace_location_id")
