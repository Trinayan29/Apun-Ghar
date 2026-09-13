"""rename default STUDENT role to USER

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-13
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

OLD_ROLES = "role IN ('STUDENT', 'OWNER', 'ADMIN')"
NEW_ROLES = "role IN ('USER', 'OWNER', 'ADMIN')"


def upgrade() -> None:
    # Drop the old CHECK first: it would reject the new 'USER' value.
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.execute(sa.text("UPDATE users SET role = 'USER' WHERE role = 'STUDENT'"))
    op.alter_column("users", "role", server_default="USER")
    op.create_check_constraint("ck_users_role", "users", NEW_ROLES)


def downgrade() -> None:
    # Drop the new CHECK first: it would reject the restored 'STUDENT' value.
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.execute(sa.text("UPDATE users SET role = 'STUDENT' WHERE role = 'USER'"))
    op.alter_column("users", "role", server_default="STUDENT")
    op.create_check_constraint("ck_users_role", "users", OLD_ROLES)
