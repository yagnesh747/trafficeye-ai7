from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from backend.app.models.models import UserRole, ViolationType, ViolationStatus, ChallanStatus, MediaType

# Token & Auth
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    role: UserRole

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[UserRole] = None

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    role: UserRole = UserRole.OPERATOR

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    role: UserRole
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Evidence Schemas
class BoundingBox(BaseModel):
    x: float = Field(..., description="Top left X percentage (0-100)")
    y: float = Field(..., description="Top left Y percentage (0-100)")
    w: float = Field(..., description="Width percentage (0-100)")
    h: float = Field(..., description="Height percentage (0-100)")

class EvidenceResponse(BaseModel):
    id: int
    violation_id: int
    original_image_path: str
    annotated_image_path: Optional[str] = None
    plate_crop_path: Optional[str] = None
    vehicle_bbox_json: Optional[str] = None
    plate_bbox_json: Optional[str] = None
    raw_ocr_text: Optional[str] = None
    normalized_plate_text: Optional[str] = None
    ocr_confidence: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Vehicle Schemas
class VehicleResponse(BaseModel):
    id: int
    registration_number: str
    vehicle_type: Optional[str] = None
    make_model: Optional[str] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None

    class Config:
        from_attributes = True

# Violation Schemas
class ViolationReviewRequest(BaseModel):
    status: ViolationStatus
    edited_plate_text: Optional[str] = None
    rejection_reason: Optional[str] = None

class ViolationResponse(BaseModel):
    id: int
    violation_uuid: str
    detection_id: Optional[int] = None
    camera_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    violation_type: ViolationType
    violation_confidence: float
    status: ViolationStatus
    location_name: Optional[str] = None
    timestamp: datetime
    created_at: datetime
    
    evidence: Optional[EvidenceResponse] = None
    vehicle: Optional[VehicleResponse] = None

    class Config:
        from_attributes = True

# Challan Schemas
class ChallanCreate(BaseModel):
    violation_id: int
    vehicle_registration: str
    violation_type: ViolationType
    fine_amount: int

class ChallanResponse(BaseModel):
    id: int
    challan_number: str
    violation_id: int
    vehicle_registration: str
    violation_type: ViolationType
    fine_amount: int
    status: ChallanStatus
    issued_at: datetime
    paid_at: Optional[datetime] = None
    receipt_number: Optional[str] = None

    class Config:
        from_attributes = True

# Detection & Analysis Schemas
class DetectionItem(BaseModel):
    class_name: str
    confidence: float
    bbox: BoundingBox

class ViolationCandidate(BaseModel):
    violation_type: ViolationType
    confidence: float
    vehicle_bbox: BoundingBox
    plate_bbox: Optional[BoundingBox] = None
    raw_ocr_text: Optional[str] = None
    normalized_plate_text: Optional[str] = None
    ocr_confidence: Optional[float] = None

class ImageAnalysisResponse(BaseModel):
    detection_uuid: str
    media_path: str
    annotated_image_path: str
    detections: List[DetectionItem]
    violations: List[ViolationCandidate]
    processing_time_ms: float

# Dashboard & Analytics Schemas
class DashboardMetricsResponse(BaseModel):
    violations_detected_today: int
    pending_reviews: int
    confirmed_violations: int
    challans_generated: int
    total_fines_levied: int
    total_fines_collected: int
    average_confidence: float
    violation_distribution: Dict[str, int]
    hourly_infractions: List[int]
