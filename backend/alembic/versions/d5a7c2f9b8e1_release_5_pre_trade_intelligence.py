"""Release 5 pre-trade intelligence

Revision ID: d5a7c2f9b8e1
Revises: e8c1b7f4a2d9
Create Date: 2026-05-01 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d5a7c2f9b8e1"
down_revision: Union[str, None] = "e8c1b7f4a2d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("trade_setups", sa.Column("symbol", sa.String(length=50), nullable=True))
    op.add_column("trade_setups", sa.Column("thesis", sa.Text(), nullable=True))
    op.add_column("trade_setups", sa.Column("entry_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("trade_setups", sa.Column("stop_loss_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("trade_setups", sa.Column("target_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("trade_setups", sa.Column("target2_price", sa.Numeric(12, 2), nullable=True))
    op.add_column("trade_setups", sa.Column("conviction_score", sa.Integer(), nullable=True))
    op.add_column("trade_setups", sa.Column("checklist_responses", sa.JSON(), nullable=True))
    op.add_column("trade_setups", sa.Column("position_size", sa.Integer(), nullable=True))
    op.add_column("trade_setups", sa.Column("risk_amount", sa.Numeric(12, 2), nullable=True))
    op.add_column("trade_setups", sa.Column("risk_score", sa.Integer(), nullable=True))
    op.add_column("trade_setups", sa.Column("risk_level", sa.String(length=20), nullable=True))
    op.add_column("trade_setups", sa.Column("linked_trade_id", sa.Integer(), nullable=True))
    op.add_column("trade_setups", sa.Column("linked_at", sa.DateTime(), nullable=True))
    op.create_index(op.f("ix_trade_setups_symbol"), "trade_setups", ["symbol"], unique=False)
    op.create_index(op.f("ix_trade_setups_linked_trade_id"), "trade_setups", ["linked_trade_id"], unique=False)
    op.create_foreign_key(
        "fk_trade_setups_linked_trade_id_completed_trades",
        "trade_setups",
        "completed_trades",
        ["linked_trade_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_trade_setups_linked_trade_id_completed_trades", "trade_setups", type_="foreignkey")
    op.drop_index(op.f("ix_trade_setups_linked_trade_id"), table_name="trade_setups")
    op.drop_index(op.f("ix_trade_setups_symbol"), table_name="trade_setups")
    op.drop_column("trade_setups", "linked_at")
    op.drop_column("trade_setups", "linked_trade_id")
    op.drop_column("trade_setups", "risk_level")
    op.drop_column("trade_setups", "risk_score")
    op.drop_column("trade_setups", "risk_amount")
    op.drop_column("trade_setups", "position_size")
    op.drop_column("trade_setups", "checklist_responses")
    op.drop_column("trade_setups", "conviction_score")
    op.drop_column("trade_setups", "target2_price")
    op.drop_column("trade_setups", "target_price")
    op.drop_column("trade_setups", "stop_loss_price")
    op.drop_column("trade_setups", "entry_price")
    op.drop_column("trade_setups", "thesis")
    op.drop_column("trade_setups", "symbol")
