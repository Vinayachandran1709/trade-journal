from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.trade_checklist import TradeChecklist
from app.models.trade_setup import TradeSetup
from app.models.user import User
from app.schemas.setups import (
    ChecklistTemplateCreate,
    ChecklistTemplateResponse,
    RiskAlertResponse,
    SetupReportCardResponse,
    TradeSetupCreate,
    TradeSetupResponse,
    TradeSetupScoreResponse,
)
from app.services.checklist_service import (
    create_checklist_template,
    create_trade_setup,
    get_or_create_default_template,
    get_setup_report_card,
    is_pro_active,
    link_setup_to_trade,
    score_trade_setup,
)
from app.services.risk_alert_service import generate_risk_alerts
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/setups", tags=["setups"])
risk_router = APIRouter(prefix="/api/risk-alerts", tags=["risk-alerts"])


@router.post("/templates", response_model=ChecklistTemplateResponse)
def create_template(
    request: ChecklistTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistTemplateResponse:
    try:
        return create_checklist_template(current_user.id, request.name, request.items, db)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("/templates", response_model=list[ChecklistTemplateResponse])
def list_templates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ChecklistTemplateResponse]:
    get_or_create_default_template(current_user.id, db)
    return (
        db.query(TradeChecklist)
        .filter(TradeChecklist.user_id == current_user.id, TradeChecklist.is_active.is_(True))
        .order_by(TradeChecklist.created_at.desc())
        .all()
    )


@router.post("/create", response_model=TradeSetupResponse)
def create_setup(
    request: TradeSetupCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TradeSetupResponse:
    try:
        setup = create_trade_setup(current_user.id, request.model_dump(), db)
        return TradeSetupResponse(
            id=setup.id,
            user_id=setup.user_id,
            symbol=setup.symbol,
            thesis=setup.thesis,
            entry_price=float(setup.entry_price) if setup.entry_price else None,
            stop_loss_price=float(setup.stop_loss_price) if setup.stop_loss_price else None,
            target_price=float(setup.target_price) if setup.target_price else None,
            target2_price=float(setup.target2_price) if setup.target2_price else None,
            conviction_score=setup.conviction_score,
            checklist_responses=setup.checklist_responses,
            position_size=setup.position_size,
            risk_amount=float(setup.risk_amount) if setup.risk_amount else None,
            risk_score=setup.risk_score,
            risk_level=setup.risk_level,
            linked_trade_id=setup.linked_trade_id,
            linked_at=setup.linked_at,
            created_at=setup.created_at,
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create setup: {str(exc)}",
        ) from exc


@router.get("/my-setups", response_model=list[TradeSetupResponse])
def list_setups(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TradeSetupResponse]:
    return (
        db.query(TradeSetup)
        .filter(TradeSetup.user_id == current_user.id, TradeSetup.symbol.isnot(None))
        .order_by(TradeSetup.created_at.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )


@router.get("/{setup_id}/score", response_model=TradeSetupScoreResponse)
def get_setup_score(
    setup_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TradeSetupScoreResponse:
    if not is_pro_active(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Pro feature: risk assessment is available on Pro",
        )
    setup = (
        db.query(TradeSetup)
        .filter(TradeSetup.id == setup_id, TradeSetup.user_id == current_user.id)
        .first()
    )
    if setup is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup not found")
    try:
        return score_trade_setup(current_user.id, setup, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{setup_id}/report-card", response_model=SetupReportCardResponse)
def get_report_card(
    setup_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SetupReportCardResponse:
    if not is_pro_active(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Pro feature: setup report cards are available on Pro",
        )
    try:
        return get_setup_report_card(setup_id, current_user.id, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/link/{trade_id}")
def link_trade_setup(
    trade_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    return {"linked": link_setup_to_trade(current_user.id, trade_id, db)}


@risk_router.get("", response_model=list[RiskAlertResponse])
def get_risk_alerts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RiskAlertResponse]:
    return generate_risk_alerts(current_user.id, db)
