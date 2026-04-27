"""Release 3A AI query logs

Revision ID: c4f7a9b2d1e3
Revises: b8e2f1a3c9d0
Create Date: 2026-04-27 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4f7a9b2d1e3"
down_revision: Union[str, None] = "b8e2f1a3c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_query_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("query_type", sa.String(length=50), nullable=False),
        sa.Column("symbol", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_query_logs_created_at"), "ai_query_logs", ["created_at"], unique=False)
    op.create_index(op.f("ix_ai_query_logs_id"), "ai_query_logs", ["id"], unique=False)
    op.create_index(op.f("ix_ai_query_logs_user_id"), "ai_query_logs", ["user_id"], unique=False)
    op.create_index(
        "ix_ai_query_logs_user_type_created_at",
        "ai_query_logs",
        ["user_id", "query_type", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ai_query_logs_user_type_created_at", table_name="ai_query_logs")
    op.drop_index(op.f("ix_ai_query_logs_user_id"), table_name="ai_query_logs")
    op.drop_index(op.f("ix_ai_query_logs_id"), table_name="ai_query_logs")
    op.drop_index(op.f("ix_ai_query_logs_created_at"), table_name="ai_query_logs")
    op.drop_table("ai_query_logs")
