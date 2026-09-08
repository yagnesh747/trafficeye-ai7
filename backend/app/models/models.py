import uuid
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
import enum
from backend.app.database import Base

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    OPERATOR = "OPERATOR"

class ViolationType(str, enum.Enum):
    NO_HELMET = "NO_HELMET"
    TRIPLE_RIDING = "TRIPLE_RIDING"
    WRONG_PARKING = "WRONG_PARKING"
    RED_LIGHT = "RED_LIGHT"

class ViolationStatus(str, enum.Enum):
    PENDING_REVIEW = "PENDING_REVIEW"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"

class ChallanStatus(str, enum.Enum):
    UNPAID = "UNPAID"
    DISPATCHED = "DISPATCHED"
    PAID = "PAID"

class MediaType(str, enum.Enum):
    IMAGE = "IMAGE"
    VIDEO = "VIDEO"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)
    role = Column(SQLEnum(UserRole), default=UserRole.OPERATOR, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    violations_reviewed = relationship("Violation", back_populates="reviewer")

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    camera_code = Column(String(50), unique=True, index=True, nullable=False)
    location_name = Column(String(150), nullable=False)
    ip_address = Column(String(50), nullable=True)
    status = Column(String(20), default="ACTIVE")
    parking_zone_json = Column(Text, nullable=True)  # Polygon coordinates JSON string
    stop_line_json = Column(Text, nullable=True)     # Stop line ROI coordinates JSON string
    created_at = Column(DateTime, default=datetime.utcnow)

    detections = relationship("Detection", back_populates="camera")
    violations = relationship("Violation", back_populates="camera")

class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    detection_uuid = Column(String(36), default=lambda: str(uuid.uuid4()), unique=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), nullable=True)
    media_type = Column(SQLEnum(MediaType), default=MediaType.IMAGE, nullable=False)
    media_path = Column(String(255), nullable=False)
    status = Column(String(50), default="PROCESSED")
    raw_metadata_json = Column(Text, nullable=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    camera = relationship("Camera", back_populates="detections")
    violations = relationship("Violation", back_populates="detection")

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    registration_number = Column(String(20), unique=True, index=True, nullable=False)
    vehicle_type = Column(String(50), nullable=True)
    make_model = Column(String(100), nullable=True)
    owner_name = Column(String(100), nullable=True)
    owner_phone = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    violations = relationship("Violation", back_populates="vehicle")
    challans = relationship("Challan", back_populates="vehicle")

class Violation(Base):
    __tablename__ = "violations"

    id = Column(Integer, primary_key=True, index=True)
    violation_uuid = Column(String(36), default=lambda: str(uuid.uuid4()), unique=True, index=True)
    detection_id = Column(Integer, ForeignKey("detections.id"), nullable=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), nullable=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    
    violation_type = Column(SQLEnum(ViolationType), nullable=False)
    violation_confidence = Column(Float, nullable=False, default=0.0)
    status = Column(SQLEnum(ViolationStatus), default=ViolationStatus.PENDING_REVIEW, nullable=False)
    
    location_name = Column(String(150), nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    rejection_reason = Column(String(255), nullable=True)
    
    timestamp = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    detection = relationship("Detection", back_populates="violations")
    camera = relationship("Camera", back_populates="violations")
    vehicle = relationship("Vehicle", back_populates="violations")
    reviewer = relationship("User", back_populates="violations_reviewed")
    evidence = relationship("Evidence", back_populates="violation", uselist=False)
    challan = relationship("Challan", back_populates="violation", uselist=False)

class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(Integer, primary_key=True, index=True)
    violation_id = Column(Integer, ForeignKey("violations.id"), unique=True, nullable=False)
    
    original_image_path = Column(String(255), nullable=False)
    annotated_image_path = Column(String(255), nullable=True)
    plate_crop_path = Column(String(255), nullable=True)
    
    vehicle_bbox_json = Column(Text, nullable=True)
    plate_bbox_json = Column(Text, nullable=True)
    
    raw_ocr_text = Column(String(50), nullable=True)
    normalized_plate_text = Column(String(50), nullable=True)
    ocr_confidence = Column(Float, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    violation = relationship("Violation", back_populates="evidence")

class Challan(Base):
    __tablename__ = "challans"

    id = Column(Integer, primary_key=True, index=True)
    challan_number = Column(String(50), unique=True, index=True, nullable=False)
    violation_id = Column(Integer, ForeignKey("violations.id"), unique=True, nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    
    vehicle_registration = Column(String(20), nullable=False)
    violation_type = Column(SQLEnum(ViolationType), nullable=False)
    fine_amount = Column(Integer, nullable=False)
    status = Column(SQLEnum(ChallanStatus), default=ChallanStatus.DISPATCHED, nullable=False)
    
    issued_at = Column(DateTime, default=datetime.utcnow)
    paid_at = Column(DateTime, nullable=True)
    receipt_number = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    violation = relationship("Violation", back_populates="challan")
    vehicle = relationship("Vehicle", back_populates="challans")
