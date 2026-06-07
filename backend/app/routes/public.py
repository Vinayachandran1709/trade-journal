from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.waitlist_entry import WaitlistEntry
from app.schemas.public import WaitlistRequest, WaitlistResponse

router = APIRouter(prefix="/api/public", tags=["public"])


@router.post("/waitlist", response_model=WaitlistResponse, status_code=status.HTTP_200_OK)
def submit_waitlist(request: WaitlistRequest, db: Session = Depends(get_db)):
    normalized_email = str(request.email).strip().lower()
    existing_entry = (
        db.query(WaitlistEntry)
        .filter(WaitlistEntry.normalized_email == normalized_email)
        .first()
    )

    if existing_entry:
        existing_entry.name = request.name
        existing_entry.email = str(request.email)
        existing_entry.normalized_email = normalized_email
        existing_entry.broker = request.broker
        existing_entry.early_access = request.early_access
        existing_entry.source = request.source
        db.add(existing_entry)
        db.commit()
        db.refresh(existing_entry)
        return WaitlistResponse(
            success=True,
            id=existing_entry.id,
            email=existing_entry.email,
            broker=existing_entry.broker,
            early_access=existing_entry.early_access,
            created_at=existing_entry.created_at,
        )

    entry = WaitlistEntry(
        name=request.name,
        email=str(request.email),
        normalized_email=normalized_email,
        broker=request.broker,
        early_access=request.early_access,
        source=request.source,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return WaitlistResponse(
        success=True,
        id=entry.id,
        email=entry.email,
        broker=entry.broker,
        early_access=entry.early_access,
        created_at=entry.created_at,
    )
