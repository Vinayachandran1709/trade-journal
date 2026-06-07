"""add waitlist entries table

Revision ID: 9c6a5f8e2b11
Revises: 237707c048a7
Create Date: 2026-06-06 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "9c6a5f8e2b11"
down_revision: Union[str, None] = "237707c048a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "waitlist_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("normalized_email", sa.String(length=255), nullable=False),
        sa.Column("broker", sa.String(length=50), nullable=False),
        sa.Column("early_access", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("source", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "normalized_email",
            name="uq_waitlist_entries_normalized_email",
        ),
    )
    op.create_index(op.f("ix_waitlist_entries_id"), "waitlist_entries", ["id"], unique=False)
    op.create_index(
        op.f("ix_waitlist_entries_normalized_email"),
        "waitlist_entries",
        ["normalized_email"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_waitlist_entries_normalized_email"), table_name="waitlist_entries")
    op.drop_index(op.f("ix_waitlist_entries_id"), table_name="waitlist_entries")
    op.drop_table("waitlist_entries")
