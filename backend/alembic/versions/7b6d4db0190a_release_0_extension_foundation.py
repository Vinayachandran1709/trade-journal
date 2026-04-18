"""Release 0 extension foundation

Revision ID: 7b6d4db0190a
Revises: 4333c1cfe0d1
Create Date: 2026-04-18 13:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7b6d4db0190a"
down_revision: Union[str, None] = "4333c1cfe0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("subscription_status", sa.String(length=50), nullable=True))
    op.add_column("users", sa.Column("subscription_plan", sa.String(length=50), nullable=True))
    op.add_column("users", sa.Column("subscription_expires_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("razorpay_customer_id", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("razorpay_subscription_id", sa.String(length=255), nullable=True))

    op.add_column("trades", sa.Column("emotion_tag", sa.String(length=50), nullable=True))
    op.add_column("trades", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("trades", sa.Column("screenshot_url", sa.String(length=500), nullable=True))
    op.add_column("trades", sa.Column("entry_method", sa.String(length=100), nullable=True))
    op.add_column("trades", sa.Column("trade_time", sa.Time(), nullable=True))
    op.add_column("trades", sa.Column("instrument_type", sa.String(length=50), nullable=True))

    op.create_table(
        "behavioral_patterns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("pattern_type", sa.String(length=50), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("pattern_config", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_behavioral_patterns_id"),
        "behavioral_patterns",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_behavioral_patterns_user_id"),
        "behavioral_patterns",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "trade_setups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("setup_config", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_trade_setups_id"), "trade_setups", ["id"], unique=False)
    op.create_index(
        op.f("ix_trade_setups_user_id"),
        "trade_setups",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "trade_checklists",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("trade_setup_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("checklist_items", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["trade_setup_id"], ["trade_setups.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_trade_checklists_id"),
        "trade_checklists",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_trade_checklists_trade_setup_id"),
        "trade_checklists",
        ["trade_setup_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_trade_checklists_user_id"),
        "trade_checklists",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "market_data_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cache_key", sa.String(length=255), nullable=False),
        sa.Column("symbol", sa.String(length=50), nullable=False),
        sa.Column("timeframe", sa.String(length=50), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cache_key"),
    )
    op.create_index(
        op.f("ix_market_data_cache_cache_key"),
        "market_data_cache",
        ["cache_key"],
        unique=True,
    )
    op.create_index(
        op.f("ix_market_data_cache_id"),
        "market_data_cache",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_market_data_cache_symbol"),
        "market_data_cache",
        ["symbol"],
        unique=False,
    )

    op.create_table(
        "payment_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("provider_event_id", sa.String(length=255), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_event_id"),
    )
    op.create_index(
        op.f("ix_payment_events_id"),
        "payment_events",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_payment_events_provider_event_id"),
        "payment_events",
        ["provider_event_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_payment_events_user_id"),
        "payment_events",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "coupons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("discount_type", sa.String(length=50), nullable=False),
        sa.Column("discount_value", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index(op.f("ix_coupons_code"), "coupons", ["code"], unique=True)
    op.create_index(op.f("ix_coupons_id"), "coupons", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_coupons_id"), table_name="coupons")
    op.drop_index(op.f("ix_coupons_code"), table_name="coupons")
    op.drop_table("coupons")

    op.drop_index(op.f("ix_payment_events_user_id"), table_name="payment_events")
    op.drop_index(
        op.f("ix_payment_events_provider_event_id"),
        table_name="payment_events",
    )
    op.drop_index(op.f("ix_payment_events_id"), table_name="payment_events")
    op.drop_table("payment_events")

    op.drop_index(op.f("ix_market_data_cache_symbol"), table_name="market_data_cache")
    op.drop_index(
        op.f("ix_market_data_cache_id"),
        table_name="market_data_cache",
    )
    op.drop_index(
        op.f("ix_market_data_cache_cache_key"),
        table_name="market_data_cache",
    )
    op.drop_table("market_data_cache")

    op.drop_index(
        op.f("ix_trade_checklists_user_id"),
        table_name="trade_checklists",
    )
    op.drop_index(
        op.f("ix_trade_checklists_trade_setup_id"),
        table_name="trade_checklists",
    )
    op.drop_index(op.f("ix_trade_checklists_id"), table_name="trade_checklists")
    op.drop_table("trade_checklists")

    op.drop_index(op.f("ix_trade_setups_user_id"), table_name="trade_setups")
    op.drop_index(op.f("ix_trade_setups_id"), table_name="trade_setups")
    op.drop_table("trade_setups")

    op.drop_index(
        op.f("ix_behavioral_patterns_user_id"),
        table_name="behavioral_patterns",
    )
    op.drop_index(
        op.f("ix_behavioral_patterns_id"),
        table_name="behavioral_patterns",
    )
    op.drop_table("behavioral_patterns")

    op.drop_column("trades", "instrument_type")
    op.drop_column("trades", "trade_time")
    op.drop_column("trades", "entry_method")
    op.drop_column("trades", "screenshot_url")
    op.drop_column("trades", "notes")
    op.drop_column("trades", "emotion_tag")

    op.drop_column("users", "razorpay_subscription_id")
    op.drop_column("users", "razorpay_customer_id")
    op.drop_column("users", "subscription_expires_at")
    op.drop_column("users", "subscription_plan")
    op.drop_column("users", "subscription_status")
