"""Add user preferences JSON column

Revision ID: f1a2c3d4e5f6
Revises: d5a7c2f9b8e1
Create Date: 2026-05-06 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2c3d4e5f6"
down_revision: Union[str, None] = "d5a7c2f9b8e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("preferences", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "preferences")
