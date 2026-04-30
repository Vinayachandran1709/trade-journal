"""Release 4 behavioral patterns analytics

Revision ID: e8c1b7f4a2d9
Revises: c4f7a9b2d1e3
Create Date: 2026-04-30 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e8c1b7f4a2d9"
down_revision: Union[str, None] = "c4f7a9b2d1e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("behavioral_patterns", sa.Column("title", sa.String(length=255), nullable=True))
    op.add_column("behavioral_patterns", sa.Column("severity", sa.String(length=10), nullable=True))
    op.add_column("behavioral_patterns", sa.Column("pattern_data", sa.JSON(), nullable=True))
    op.add_column("behavioral_patterns", sa.Column("trade_count_snapshot", sa.Integer(), nullable=True))

    op.execute("UPDATE behavioral_patterns SET title = name")
    op.execute("UPDATE behavioral_patterns SET severity = 'low' WHERE severity IS NULL")
    op.execute("UPDATE behavioral_patterns SET pattern_data = COALESCE(pattern_config, '{}'::json)")
    op.execute("UPDATE behavioral_patterns SET trade_count_snapshot = 0 WHERE trade_count_snapshot IS NULL")

    op.alter_column("behavioral_patterns", "title", nullable=False)
    op.alter_column("behavioral_patterns", "pattern_type", nullable=False)
    op.alter_column("behavioral_patterns", "description", nullable=False)
    op.alter_column("behavioral_patterns", "severity", nullable=False)
    op.alter_column("behavioral_patterns", "pattern_data", nullable=False)
    op.alter_column("behavioral_patterns", "trade_count_snapshot", nullable=False)

    op.drop_column("behavioral_patterns", "name")
    op.drop_column("behavioral_patterns", "pattern_config")

    op.create_unique_constraint(
        "uq_behavioral_patterns_user_pattern_type",
        "behavioral_patterns",
        ["user_id", "pattern_type"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_behavioral_patterns_user_pattern_type",
        "behavioral_patterns",
        type_="unique",
    )

    op.add_column("behavioral_patterns", sa.Column("pattern_config", sa.JSON(), nullable=True))
    op.add_column("behavioral_patterns", sa.Column("name", sa.String(length=100), nullable=True))

    op.execute("UPDATE behavioral_patterns SET name = title")
    op.execute("UPDATE behavioral_patterns SET pattern_config = COALESCE(pattern_data, '{}'::json)")

    op.alter_column("behavioral_patterns", "name", nullable=False)
    op.drop_column("behavioral_patterns", "trade_count_snapshot")
    op.drop_column("behavioral_patterns", "pattern_data")
    op.drop_column("behavioral_patterns", "severity")
    op.drop_column("behavioral_patterns", "title")

