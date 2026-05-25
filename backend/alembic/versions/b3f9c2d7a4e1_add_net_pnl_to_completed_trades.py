"""Add net pnl fields to completed trades

Revision ID: b3f9c2d7a4e1
Revises: a7c9e2f4b6d8
Create Date: 2026-05-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b3f9c2d7a4e1"
down_revision: Union[str, None] = "a7c9e2f4b6d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "completed_trades",
        sa.Column("total_charges", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.add_column(
        "completed_trades",
        sa.Column("net_pnl", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.execute("UPDATE completed_trades SET total_charges = 0 WHERE total_charges IS NULL")
    op.execute("UPDATE completed_trades SET net_pnl = pnl WHERE net_pnl IS NULL OR net_pnl = 0")
    op.alter_column("completed_trades", "total_charges", server_default=None)
    op.alter_column("completed_trades", "net_pnl", server_default=None)


def downgrade() -> None:
    op.drop_column("completed_trades", "net_pnl")
    op.drop_column("completed_trades", "total_charges")
