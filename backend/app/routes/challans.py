from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.models import Challan, ChallanStatus, Violation, ViolationType
from backend.app.schemas.schemas import ChallanResponse, ChallanCreate

router = APIRouter(prefix="/challans", tags=["E-Challan Management Ledger"])

@router.get("", response_model=List[ChallanResponse])
def get_challans(
    status: Optional[ChallanStatus] = None,
    registration: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    query = db.query(Challan)
    if status:
        query = query.filter(Challan.status == status)
    if registration:
        query = query.filter(Challan.vehicle_registration.ilike(f"%{registration}%"))
    
    return query.order_by(Challan.created_at.desc()).offset(skip).limit(limit).all()

@router.get("/{challan_id}", response_model=ChallanResponse)
def get_challan(challan_id: int, db: Session = Depends(get_db)):
    challan = db.query(Challan).filter(Challan.id == challan_id).first()
    if not challan:
        raise HTTPException(status_code=404, detail="Challan record not found.")
    return challan

@router.post("", response_model=ChallanResponse)
def create_challan(payload: ChallanCreate, db: Session = Depends(get_db)):
    existing = db.query(Challan).filter(Challan.violation_id == payload.violation_id).first()
    if existing:
        return existing

    challan_num = f"BTP-CH-{int(datetime.utcnow().timestamp())}-{payload.violation_id}"
    new_challan = Challan(
        challan_number=challan_num,
        violation_id=payload.violation_id,
        vehicle_registration=payload.vehicle_registration,
        violation_type=payload.violation_type,
        fine_amount=payload.fine_amount,
        status=ChallanStatus.DISPATCHED
    )
    db.add(new_challan)
    db.commit()
    db.refresh(new_challan)
    return new_challan

@router.post("/{challan_id}/pay", response_model=ChallanResponse)
def pay_challan(challan_id: int, db: Session = Depends(get_db)):
    challan = db.query(Challan).filter(Challan.id == challan_id).first()
    if not challan:
        raise HTTPException(status_code=404, detail="Challan record not found.")

    challan.status = ChallanStatus.PAID
    challan.paid_at = datetime.utcnow()
    challan.receipt_number = f"PAY-BTP-{int(datetime.utcnow().timestamp())}"
    
    db.commit()
    db.refresh(challan)
    return challan
