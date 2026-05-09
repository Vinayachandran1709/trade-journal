from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.database import engine

router = APIRouter()


@router.get("/health")
async def health_check():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    return {"status": "healthy"}
