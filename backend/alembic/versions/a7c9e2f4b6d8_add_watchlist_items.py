"""Add watchlist items

Revision ID: a7c9e2f4b6d8
Revises: f1a2c3d4e5f6
Create Date: 2026-05-09 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7c9e2f4b6d8"
down_revision: Union[str, None] = "f1a2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "watchlist_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("symbol", sa.String(length=50), nullable=False),
        sa.Column("added_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("alert_price_above", sa.String(length=20), nullable=True),
        sa.Column("alert_price_below", sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_watchlist_items_id"), "watchlist_items", ["id"], unique=False)
    op.create_index(op.f("ix_watchlist_items_symbol"), "watchlist_items", ["symbol"], unique=False)
    op.create_index(op.f("ix_watchlist_items_user_id"), "watchlist_items", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_watchlist_items_user_id"), table_name="watchlist_items")
    op.drop_index(op.f("ix_watchlist_items_symbol"), table_name="watchlist_items")
    op.drop_index(op.f("ix_watchlist_items_id"), table_name="watchlist_items")
    op.drop_table("watchlist_items")
