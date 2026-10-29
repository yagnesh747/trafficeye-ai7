from datetime import datetime, date
from typing import Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.app.database import get_db
from backend.app.models.models import Violation, ViolationStatus, Challan, ChallanStatus, ViolationType
from backend.app.schemas.schemas import DashboardMetricsResponse

router = APIRouter(prefix="/dashboard", tags=["Municipal Analytics Dashboard"])

@router.get("/metrics", response_model=DashboardMetricsResponse)
def get_dashboard_metrics(db: Session = Depends(get_db)):
    today_start = datetime.combine(date.today(), datetime.min.time())

    # Count today's detections
    violations_detected_today = db.query(func.count(Violation.id)).filter(Violation.timestamp >= today_start).scalar() or 0
    
    # Total violations count if today count is zero (for demo data visibility)
    total_violations_count = db.query(func.count(Violation.id)).scalar() or 0
    display_today_count = max(violations_detected_today, total_violations_count)

    pending_reviews = db.query(func.count(Violation.id)).filter(Violation.status == ViolationStatus.PENDING_REVIEW).scalar() or 0
    confirmed_violations = db.query(func.count(Violation.id)).filter(Violation.status == ViolationStatus.CONFIRMED).scalar() or 0
    
    challans_generated = db.query(func.count(Challan.id)).scalar() or 0

    total_fines_levied = db.query(func.sum(Challan.fine_amount)).scalar() or 0
    total_fines_collected = db.query(func.sum(Challan.fine_amount)).filter(Challan.status == ChallanStatus.PAID).scalar() or 0

    avg_conf = db.query(func.avg(Violation.violation_confidence)).scalar() or 0.0

    # Category breakdown distribution
    dist_query = db.query(Violation.violation_type, func.count(Violation.id)).group_by(Violation.violation_type).all()
    dist_map = {
        ViolationType.NO_HELMET.value: 0,
        ViolationType.TRIPLE_RIDING.value: 0,
        ViolationType.WRONG_PARKING.value: 0,
        ViolationType.RED_LIGHT.value: 0
    }
    for v_type, count in dist_query:
        if v_type:
            dist_map[v_type.value if hasattr(v_type, 'value') else str(v_type)] = count

    # Hourly infractions based on actual database entries for today
    hourly = [0] * 24
    today_violations = db.query(Violation.timestamp).filter(Violation.timestamp >= today_start).all()
    for (ts,) in today_violations:
        if ts and 0 <= ts.hour < 24:
            hourly[ts.hour] += 1

    return {
        "violations_detected_today": int(violations_detected_today),
        "pending_reviews": int(pending_reviews),
        "confirmed_violations": int(confirmed_violations),
        "challans_generated": int(challans_generated),
        "total_fines_levied": int(total_fines_levied or 0),
        "total_fines_collected": int(total_fines_collected or 0),
        "average_confidence": round(float(avg_conf), 2) if avg_conf else 0.0,
        "violation_distribution": dist_map,
        "hourly_infractions": hourly
    }
