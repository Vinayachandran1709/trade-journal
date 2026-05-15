from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.routes.auth import router as auth_router
from app.routes.ai_agents import router as ai_agents_router
from app.routes.analytics import router as analytics_router
from app.routes.billing import billing_router, webhook_router
from app.routes.health import router as health_router
from app.routes.market_data import router as market_data_router
from app.routes.research import router as research_router
from app.routes.setups import risk_router, router as setups_router
from app.routes.stocks import router as stocks_router
from app.routes.trades import router as trades_router
from app.routes.watchlist import router as watchlist_router

app = FastAPI(title="Trade Intelligence Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_origin_regex=settings.CORS_ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, tags=["health"])
app.include_router(auth_router)
app.include_router(trades_router)
app.include_router(billing_router)
app.include_router(webhook_router)
app.include_router(market_data_router)
app.include_router(research_router)
app.include_router(stocks_router)
app.include_router(ai_agents_router)
app.include_router(setups_router)
app.include_router(risk_router)
app.include_router(analytics_router)
app.include_router(watchlist_router)


@app.get("/")
async def root():
    return {"status": "ok", "message": "Trade Intelligence Platform API"}


@app.on_event("startup")
def warm_database_connection() -> None:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        # Let the app boot even if the remote DB is temporarily slow; requests
        # will surface a normal API error instead of crashing startup.
        pass
