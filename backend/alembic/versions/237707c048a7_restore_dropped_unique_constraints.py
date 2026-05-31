"""restore dropped unique constraints

Revision ID: 237707c048a7
Revises: 12a36d8e6419
Create Date: 2026-05-28 12:33:12.960484

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '237707c048a7'
down_revision: Union[str, None] = '12a36d8e6419'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint('coupons_code_key', 'coupons', ['code'])
    op.create_unique_constraint(
        'market_data_cache_cache_key_key',
        'market_data_cache',
        ['cache_key'],
    )
    op.create_unique_constraint(
        'payment_events_provider_event_id_key',
        'payment_events',
        ['provider_event_id'],
    )
    op.create_unique_constraint('stocks_isin_key', 'stocks', ['isin'])


def downgrade() -> None:
    op.drop_constraint('stocks_isin_key', 'stocks', type_='unique')
    op.drop_constraint(
        'payment_events_provider_event_id_key',
        'payment_events',
        type_='unique',
    )
    op.drop_constraint(
        'market_data_cache_cache_key_key',
        'market_data_cache',
        type_='unique',
    )
    op.drop_constraint('coupons_code_key', 'coupons', type_='unique')
