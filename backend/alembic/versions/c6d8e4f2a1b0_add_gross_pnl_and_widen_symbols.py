"""Add gross pnl field and widen trade symbols

Revision ID: c6d8e4f2a1b0
Revises: b3f9c2d7a4e1
Create Date: 2026-05-26 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c6d8e4f2a1b0"
down_revision: Union[str, None] = "b3f9c2d7a4e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "completed_trades",
        sa.Column("gross_pnl", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.execute("UPDATE completed_trades SET gross_pnl = pnl WHERE gross_pnl IS NULL OR gross_pnl = 0")
    op.alter_column("completed_trades", "gross_pnl", server_default=None)
    op.alter_column("trades", "stock_symbol", type_=sa.String(length=40), existing_type=sa.String(length=20))
    op.alter_column(
        "completed_trades",
        "stock_symbol",
        type_=sa.String(length=40),
        existing_type=sa.String(length=20),
    )


def downgrade() -> None:
    op.alter_column(
        "completed_trades",
        "stock_symbol",
        type_=sa.String(length=20),
        existing_type=sa.String(length=40),
    )
    op.alter_column("trades", "stock_symbol", type_=sa.String(length=20), existing_type=sa.String(length=40))
    op.drop_column("completed_trades", "gross_pnl")
