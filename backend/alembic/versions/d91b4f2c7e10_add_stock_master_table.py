"""Add stock master table

Revision ID: d91b4f2c7e10
Revises: c4f7a9b2d1e3
Create Date: 2026-04-29 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d91b4f2c7e10"
down_revision: Union[str, None] = "c4f7a9b2d1e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stocks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("isin", sa.String(length=32), nullable=True),
        sa.Column("company_name", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("normalized_company_name", sa.String(length=255), nullable=False),
        sa.Column("nse_symbol", sa.String(length=32), nullable=True),
        sa.Column("bse_code", sa.String(length=32), nullable=True),
        sa.Column("exchanges", sa.JSON(), nullable=False),
        sa.Column("aliases", sa.JSON(), nullable=False),
        sa.Column("alias_blob", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("last_updated", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("isin"),
    )
    op.create_index(op.f("ix_stocks_id"), "stocks", ["id"], unique=False)
    op.create_index(op.f("ix_stocks_isin"), "stocks", ["isin"], unique=True)
    op.create_index(op.f("ix_stocks_nse_symbol"), "stocks", ["nse_symbol"], unique=False)
    op.create_index(op.f("ix_stocks_bse_code"), "stocks", ["bse_code"], unique=False)
    op.create_index(
        op.f("ix_stocks_normalized_company_name"),
        "stocks",
        ["normalized_company_name"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_stocks_normalized_company_name"), table_name="stocks")
    op.drop_index(op.f("ix_stocks_bse_code"), table_name="stocks")
    op.drop_index(op.f("ix_stocks_nse_symbol"), table_name="stocks")
    op.drop_index(op.f("ix_stocks_isin"), table_name="stocks")
    op.drop_index(op.f("ix_stocks_id"), table_name="stocks")
    op.drop_table("stocks")
