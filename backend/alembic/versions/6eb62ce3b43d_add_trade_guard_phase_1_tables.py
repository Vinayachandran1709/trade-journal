"""add trade guard phase 1 tables

Revision ID: 6eb62ce3b43d
Revises: c6d8e4f2a1b0
Create Date: 2026-05-28 12:01:34.545863

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6eb62ce3b43d'
down_revision: Union[str, None] = 'c6d8e4f2a1b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('broker_connections',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('broker_name', sa.String(length=50), nullable=False),
    sa.Column('broker_user_id', sa.String(length=255), nullable=True),
    sa.Column('client_id', sa.String(length=255), nullable=True),
    sa.Column('account_label', sa.String(length=255), nullable=True),
    sa.Column('access_token_encrypted', sa.Text(), nullable=True),
    sa.Column('refresh_token_encrypted', sa.Text(), nullable=True),
    sa.Column('token_expires_at', sa.DateTime(), nullable=True),
    sa.Column('auth_status', sa.String(length=50), server_default=sa.text("'disconnected'"), nullable=False),
    sa.Column('sync_status', sa.String(length=50), server_default=sa.text("'never_synced'"), nullable=False),
    sa.Column('last_synced_at', sa.DateTime(), nullable=True),
    sa.Column('last_error_code', sa.String(length=100), nullable=True),
    sa.Column('last_error_message', sa.Text(), nullable=True),
    sa.Column('metadata_json', sa.JSON(), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'broker_name', 'client_id', name='uq_broker_connections_user_broker_client')
    )
    op.create_index(op.f('ix_broker_connections_auth_status'), 'broker_connections', ['auth_status'], unique=False)
    op.create_index(op.f('ix_broker_connections_broker_name'), 'broker_connections', ['broker_name'], unique=False)
    op.create_index(op.f('ix_broker_connections_id'), 'broker_connections', ['id'], unique=False)
    op.create_index(op.f('ix_broker_connections_token_expires_at'), 'broker_connections', ['token_expires_at'], unique=False)
    op.create_index(op.f('ix_broker_connections_user_id'), 'broker_connections', ['user_id'], unique=False)
    op.create_table('trader_behavior_profiles',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('profile_version', sa.Integer(), server_default=sa.text('1'), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('trader_type', sa.String(length=100), nullable=True),
    sa.Column('biggest_leak', sa.Text(), nullable=True),
    sa.Column('strongest_edge', sa.Text(), nullable=True),
    sa.Column('best_time_window', sa.String(length=100), nullable=True),
    sa.Column('worst_time_window', sa.String(length=100), nullable=True),
    sa.Column('sample_completed_trade_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('sample_broker_order_count', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('revenge_score', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('overtrading_score', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('sizing_risk_score', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('expiry_risk_score', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('tilt_score', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('discipline_score', sa.Integer(), server_default=sa.text('0'), nullable=False),
    sa.Column('graveyard_setups', sa.JSON(), nullable=True),
    sa.Column('best_time_buckets', sa.JSON(), nullable=True),
    sa.Column('worst_time_buckets', sa.JSON(), nullable=True),
    sa.Column('profile_summary', sa.JSON(), nullable=True),
    sa.Column('generated_at', sa.DateTime(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'profile_version', name='uq_trader_behavior_profiles_user_profile_version')
    )
    op.create_index(op.f('ix_trader_behavior_profiles_generated_at'), 'trader_behavior_profiles', ['generated_at'], unique=False)
    op.create_index(op.f('ix_trader_behavior_profiles_id'), 'trader_behavior_profiles', ['id'], unique=False)
    op.create_index(op.f('ix_trader_behavior_profiles_is_active'), 'trader_behavior_profiles', ['is_active'], unique=False)
    op.create_index(op.f('ix_trader_behavior_profiles_user_id'), 'trader_behavior_profiles', ['user_id'], unique=False)
    op.create_table('broker_orders',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('broker_connection_id', sa.Integer(), nullable=True),
    sa.Column('broker_name', sa.String(length=50), nullable=False),
    sa.Column('broker_order_id', sa.String(length=255), nullable=False),
    sa.Column('broker_parent_order_id', sa.String(length=255), nullable=True),
    sa.Column('exchange', sa.String(length=50), nullable=True),
    sa.Column('segment', sa.String(length=50), nullable=True),
    sa.Column('product_type', sa.String(length=50), nullable=True),
    sa.Column('order_type', sa.String(length=50), nullable=True),
    sa.Column('side', sa.String(length=20), nullable=True),
    sa.Column('symbol', sa.String(length=50), nullable=False),
    sa.Column('instrument_token', sa.String(length=255), nullable=True),
    sa.Column('instrument_type', sa.String(length=50), nullable=True),
    sa.Column('quantity', sa.Integer(), nullable=True),
    sa.Column('filled_quantity', sa.Integer(), nullable=True),
    sa.Column('remaining_quantity', sa.Integer(), nullable=True),
    sa.Column('price', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('average_price', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('trigger_price', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('status', sa.String(length=50), nullable=True),
    sa.Column('ordered_at', sa.DateTime(), nullable=True),
    sa.Column('executed_at', sa.DateTime(), nullable=True),
    sa.Column('capture_source', sa.String(length=50), server_default=sa.text("'api'"), nullable=False),
    sa.Column('raw_payload', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['broker_connection_id'], ['broker_connections.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('broker_connection_id', 'broker_order_id', name='uq_broker_orders_connection_order_id')
    )
    op.create_index(op.f('ix_broker_orders_broker_connection_id'), 'broker_orders', ['broker_connection_id'], unique=False)
    op.create_index(op.f('ix_broker_orders_executed_at'), 'broker_orders', ['executed_at'], unique=False)
    op.create_index(op.f('ix_broker_orders_id'), 'broker_orders', ['id'], unique=False)
    op.create_index(op.f('ix_broker_orders_status'), 'broker_orders', ['status'], unique=False)
    op.create_index(op.f('ix_broker_orders_symbol'), 'broker_orders', ['symbol'], unique=False)
    op.create_index(op.f('ix_broker_orders_user_id'), 'broker_orders', ['user_id'], unique=False)
    op.create_table('trade_guard_events',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('broker_connection_id', sa.Integer(), nullable=True),
    sa.Column('broker_order_id', sa.Integer(), nullable=True),
    sa.Column('behavior_profile_id', sa.Integer(), nullable=True),
    sa.Column('event_type', sa.String(length=100), nullable=False),
    sa.Column('event_phase', sa.String(length=50), server_default=sa.text("'pre_trade'"), nullable=False),
    sa.Column('rule_code', sa.String(length=100), nullable=True),
    sa.Column('warning_type', sa.String(length=100), nullable=True),
    sa.Column('severity', sa.String(length=20), server_default=sa.text("'medium'"), nullable=False),
    sa.Column('risk_score', sa.Integer(), nullable=True),
    sa.Column('symbol', sa.String(length=50), nullable=True),
    sa.Column('session_date', sa.Date(), nullable=True),
    sa.Column('trigger_price', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('user_action', sa.String(length=100), nullable=True),
    sa.Column('state', sa.String(length=50), server_default=sa.text("'shown'"), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=True),
    sa.Column('message', sa.Text(), nullable=True),
    sa.Column('context', sa.JSON(), nullable=True),
    sa.Column('trigger_source', sa.String(length=50), server_default=sa.text("'extension'"), nullable=False),
    sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
    sa.Column('event_at', sa.DateTime(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['behavior_profile_id'], ['trader_behavior_profiles.id'], ),
    sa.ForeignKeyConstraint(['broker_connection_id'], ['broker_connections.id'], ),
    sa.ForeignKeyConstraint(['broker_order_id'], ['broker_orders.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_trade_guard_events_broker_connection_id'), 'trade_guard_events', ['broker_connection_id'], unique=False)
    op.create_index(op.f('ix_trade_guard_events_event_at'), 'trade_guard_events', ['event_at'], unique=False)
    op.create_index(op.f('ix_trade_guard_events_event_type'), 'trade_guard_events', ['event_type'], unique=False)
    op.create_index(op.f('ix_trade_guard_events_id'), 'trade_guard_events', ['id'], unique=False)
    op.create_index(op.f('ix_trade_guard_events_session_date'), 'trade_guard_events', ['session_date'], unique=False)
    op.create_index(op.f('ix_trade_guard_events_symbol'), 'trade_guard_events', ['symbol'], unique=False)
    op.create_index(op.f('ix_trade_guard_events_user_action'), 'trade_guard_events', ['user_action'], unique=False)
    op.create_index(op.f('ix_trade_guard_events_user_id'), 'trade_guard_events', ['user_id'], unique=False)
    op.create_index(op.f('ix_trade_guard_events_warning_type'), 'trade_guard_events', ['warning_type'], unique=False)
    op.create_table('pnl_saved_events',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('broker_connection_id', sa.Integer(), nullable=True),
    sa.Column('broker_order_id', sa.Integer(), nullable=True),
    sa.Column('trade_guard_event_id', sa.Integer(), nullable=False),
    sa.Column('symbol', sa.String(length=50), nullable=True),
    sa.Column('session_date', sa.Date(), nullable=True),
    sa.Column('trigger_price', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('price_after_15m', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('price_after_30m', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('estimated_saved_amount', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('saved_basis', sa.String(length=100), nullable=True),
    sa.Column('methodology_version', sa.String(length=50), server_default=sa.text("'v1'"), nullable=False),
    sa.Column('details', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['broker_connection_id'], ['broker_connections.id'], ),
    sa.ForeignKeyConstraint(['broker_order_id'], ['broker_orders.id'], ),
    sa.ForeignKeyConstraint(['trade_guard_event_id'], ['trade_guard_events.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pnl_saved_events_id'), 'pnl_saved_events', ['id'], unique=False)
    op.create_index(op.f('ix_pnl_saved_events_session_date'), 'pnl_saved_events', ['session_date'], unique=False)
    op.create_index(op.f('ix_pnl_saved_events_symbol'), 'pnl_saved_events', ['symbol'], unique=False)
    op.create_index(op.f('ix_pnl_saved_events_trade_guard_event_id'), 'pnl_saved_events', ['trade_guard_event_id'], unique=False)
    op.create_index(op.f('ix_pnl_saved_events_user_id'), 'pnl_saved_events', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_pnl_saved_events_user_id'), table_name='pnl_saved_events')
    op.drop_index(op.f('ix_pnl_saved_events_trade_guard_event_id'), table_name='pnl_saved_events')
    op.drop_index(op.f('ix_pnl_saved_events_symbol'), table_name='pnl_saved_events')
    op.drop_index(op.f('ix_pnl_saved_events_session_date'), table_name='pnl_saved_events')
    op.drop_index(op.f('ix_pnl_saved_events_id'), table_name='pnl_saved_events')
    op.drop_table('pnl_saved_events')
    op.drop_index(op.f('ix_trade_guard_events_warning_type'), table_name='trade_guard_events')
    op.drop_index(op.f('ix_trade_guard_events_user_id'), table_name='trade_guard_events')
    op.drop_index(op.f('ix_trade_guard_events_user_action'), table_name='trade_guard_events')
    op.drop_index(op.f('ix_trade_guard_events_symbol'), table_name='trade_guard_events')
    op.drop_index(op.f('ix_trade_guard_events_session_date'), table_name='trade_guard_events')
    op.drop_index(op.f('ix_trade_guard_events_id'), table_name='trade_guard_events')
    op.drop_index(op.f('ix_trade_guard_events_event_type'), table_name='trade_guard_events')
    op.drop_index(op.f('ix_trade_guard_events_event_at'), table_name='trade_guard_events')
    op.drop_index(op.f('ix_trade_guard_events_broker_connection_id'), table_name='trade_guard_events')
    op.drop_table('trade_guard_events')
    op.drop_index(op.f('ix_broker_orders_user_id'), table_name='broker_orders')
    op.drop_index(op.f('ix_broker_orders_symbol'), table_name='broker_orders')
    op.drop_index(op.f('ix_broker_orders_status'), table_name='broker_orders')
    op.drop_index(op.f('ix_broker_orders_id'), table_name='broker_orders')
    op.drop_index(op.f('ix_broker_orders_executed_at'), table_name='broker_orders')
    op.drop_index(op.f('ix_broker_orders_broker_connection_id'), table_name='broker_orders')
    op.drop_table('broker_orders')
    op.drop_index(op.f('ix_trader_behavior_profiles_user_id'), table_name='trader_behavior_profiles')
    op.drop_index(op.f('ix_trader_behavior_profiles_is_active'), table_name='trader_behavior_profiles')
    op.drop_index(op.f('ix_trader_behavior_profiles_id'), table_name='trader_behavior_profiles')
    op.drop_index(op.f('ix_trader_behavior_profiles_generated_at'), table_name='trader_behavior_profiles')
    op.drop_table('trader_behavior_profiles')
    op.drop_index(op.f('ix_broker_connections_user_id'), table_name='broker_connections')
    op.drop_index(op.f('ix_broker_connections_token_expires_at'), table_name='broker_connections')
    op.drop_index(op.f('ix_broker_connections_id'), table_name='broker_connections')
    op.drop_index(op.f('ix_broker_connections_broker_name'), table_name='broker_connections')
    op.drop_index(op.f('ix_broker_connections_auth_status'), table_name='broker_connections')
    op.drop_table('broker_connections')
