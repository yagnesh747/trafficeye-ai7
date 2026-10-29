from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models.models import (
    Violation, ViolationStatus, ViolationType, Evidence, Challan, ChallanStatus, Vehicle
)
from backend.app.schemas.schemas import ViolationResponse, ViolationReviewRequest

router = APIRouter(prefix="/violations", tags=["Violation Review System"])

@router.get("", response_model=List[ViolationResponse])
def get_violations(
    status: Optional[ViolationStatus] = None,
    violation_type: Optional[ViolationType] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    query = db.query(Violation)
    if status:
        query = query.filter(Violation.status == status)
    if violation_type:
        query = query.filter(Violation.violation_type == violation_type)
    
    return query.order_by(Violation.created_at.desc()).offset(skip).limit(limit).all()

@router.get("/{violation_id}", response_model=ViolationResponse)
def get_violation(violation_id: int, db: Session = Depends(get_db)):
    violation = db.query(Violation).filter(Violation.id == violation_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation record not found.")
    return violation

@router.post("/{violation_id}/confirm", response_model=ViolationResponse)
def confirm_violation(
    violation_id: int,
    payload: Optional[ViolationReviewRequest] = None,
    db: Session = Depends(get_db)
):
    violation = db.query(Violation).filter(Violation.id == violation_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation record not found.")

    violation.status = ViolationStatus.CONFIRMED
    violation.reviewed_at = datetime.utcnow()

    # Update plate registration if operator edited OCR result
    if payload and payload.edited_plate_text:
        evidence = violation.evidence
        if evidence:
            evidence.normalized_plate_text = payload.edited_plate_text
        if violation.vehicle:
            violation.vehicle.registration_number = payload.edited_plate_text

    # Generate MOCK E-Challan automatically on confirmation if not already created
    existing_challan = db.query(Challan).filter(Challan.violation_id == violation_id).first()
    if not existing_challan:
        reg = (violation.vehicle.registration_number if violation.vehicle and violation.vehicle.registration_number else "UNREGISTERED")
        
        # Fine calculation lookup based on Motor Vehicles Act schedule
        fine_map = {
            ViolationType.NO_HELMET: settings.FINE_NO_HELMET,
            ViolationType.TRIPLE_RIDING: settings.FINE_TRIPLE_RIDING,
            ViolationType.WRONG_PARKING: settings.FINE_WRONG_PARKING,
            ViolationType.RED_LIGHT: settings.FINE_RED_LIGHT
        }
        fine_amount = fine_map.get(violation.violation_type, 500)
        challan_num = f"BTP-CH-{int(datetime.utcnow().timestamp())}-{violation.id}"

        new_challan = Challan(
            challan_number=challan_num,
            violation_id=violation.id,
            vehicle_id=violation.vehicle_id,
            vehicle_registration=reg,
            violation_type=violation.violation_type,
            fine_amount=fine_amount,
            status=ChallanStatus.DISPATCHED
        )
        db.add(new_challan)

    db.commit()
    db.refresh(violation)
    return violation

@router.post("/{violation_id}/reject", response_model=ViolationResponse)
def reject_violation(
    violation_id: int,
    payload: Optional[ViolationReviewRequest] = None,
    db: Session = Depends(get_db)
):
    violation = db.query(Violation).filter(Violation.id == violation_id).first()
    if not violation:
        raise HTTPException(status_code=404, detail="Violation record not found.")

    violation.status = ViolationStatus.REJECTED
    violation.reviewed_at = datetime.utcnow()
    if payload and payload.rejection_reason:
        violation.rejection_reason = payload.rejection_reason

    db.commit()
    db.refresh(violation)
    return violation
