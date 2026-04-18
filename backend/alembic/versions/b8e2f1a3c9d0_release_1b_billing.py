"""Release 1B billing — coupon redemption columns + FOUNDING seed

Revision ID: b8e2f1a3c9d0
Revises: 7b6d4db0190a
Create Date: 2026-04-19 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8e2f1a3c9d0"
down_revision: Union[str, None] = "7b6d4db0190a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "coupons",
        sa.Column("max_redemptions", sa.Integer(), nullable=True),
    )
    op.add_column(
        "coupons",
        sa.Column(
            "current_redemptions",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    # Seed the FOUNDING coupon (idempotent — skip if already exists)
    conn = op.get_bind()
    result = conn.execute(
        sa.text("SELECT id FROM coupons WHERE code = 'FOUNDING' LIMIT 1")
    )
    if result.fetchone() is None:
        conn.execute(
            sa.text(
                """
                INSERT INTO coupons
                    (code, description, discount_type, discount_value,
                     is_active, max_redemptions, current_redemptions)
                VALUES
                    ('FOUNDING',
                     'Founding Member — 3 months Pro free',
                     'free_months',
                     3,
                     true,
                     100,
                     0)
                """
            )
        )


def downgrade() -> None:
    op.drop_column("coupons", "current_redemptions")
    op.drop_column("coupons", "max_redemptions")
