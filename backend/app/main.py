import os
import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database import engine, Base, SessionLocal
from backend.app.models.models import User, UserRole, Camera, Vehicle, Violation, Evidence, Challan, ViolationType, ViolationStatus, ChallanStatus
from backend.app.routes.auth import get_password_hash, router as auth_router
from backend.app.routes.detections import router as detections_router
from backend.app.routes.violations import router as violations_router
from backend.app.routes.challans import router as challans_router
from backend.app.routes.analytics import router as analytics_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("trafficeye.main")

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="TrafficEye AI — AI-Powered Traffic Violation Detection, License Plate Recognition and E-Challan Management System"
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(detections_router, prefix=settings.API_V1_STR)
app.include_router(violations_router, prefix=settings.API_V1_STR)
app.include_router(challans_router, prefix=settings.API_V1_STR)
app.include_router(analytics_router, prefix=settings.API_V1_STR)

# Ensure directories exist
os.makedirs(settings.UPLOAD_DIRECTORY, exist_ok=True)
os.makedirs(settings.EVIDENCE_DIRECTORY, exist_ok=True)

# Mount static directories
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIRECTORY), name="uploads")
app.mount("/evidence", StaticFiles(directory=settings.EVIDENCE_DIRECTORY), name="evidence")

if os.path.exists("frontend"):
    app.mount("/static", StaticFiles(directory="frontend"), name="frontend_static")

@app.get("/health")
def health_check():
    return {
        "status": "online",
        "system": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT
    }

@app.get("/")
def read_root():
    # Serve index.html from frontend if exists
    frontend_index = os.path.join("frontend", "index.html")
    if os.path.exists(frontend_index):
        return FileResponse(frontend_index)
    return {"message": "TrafficEye AI Backend Server Online. Visit /docs for API Swagger documentation."}

@app.on_event("startup")
def startup_db_seed():
    db = SessionLocal()
    try:
        # Seed default Admin and Operator accounts if none exist
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            logger.info("Seeding default admin user (admin / admin123)...")
            admin_user = User(
                username="admin",
                email="admin@trafficeye.btp.gov.in",
                hashed_password=get_password_hash("admin123"),
                full_name="BTP Chief Operator",
                role=UserRole.ADMIN
            )
            db.add(admin_user)

        operator = db.query(User).filter(User.username == "operator").first()
        if not operator:
            logger.info("Seeding default operator user (operator / operator123)...")
            op_user = User(
                username="operator",
                email="operator@trafficeye.btp.gov.in",
                hashed_password=get_password_hash("operator123"),
                full_name="Traffic Auditing Officer",
                role=UserRole.OPERATOR
            )
            db.add(op_user)

        # Seed sample seed violations if database is empty
        if db.query(Violation).count() == 0:
            logger.info("Seeding baseline initial violations into database...")
            
            # Seed 1: No Helmet
            v1_vehicle = Vehicle(registration_number="KA-03-MQ-4820", vehicle_type="Two-Wheeler", owner_name="Rahul A. Sharma", owner_phone="+91 98765 43210")
            db.add(v1_vehicle)
            db.flush()
            
            v1 = Violation(
                violation_uuid="v-seed-001",
                vehicle_id=v1_vehicle.id,
                violation_type=ViolationType.NO_HELMET,
                violation_confidence=0.92,
                status=ViolationStatus.PENDING_REVIEW,
                location_name="Koramangala 80 Ft Road"
            )
            db.add(v1)
            db.flush()
            
            e1 = Evidence(
                violation_id=v1.id,
                original_image_path="frontend/images/samples/no_helmet.png",
                annotated_image_path="frontend/images/samples/no_helmet.png",
                plate_crop_path="frontend/images/samples/no_helmet.png",
                vehicle_bbox_json='{"x":29,"y":32,"w":37,"h":56}',
                plate_bbox_json='{"x":33,"y":70,"w":8,"h":5}',
                raw_ocr_text="KA03MQ4820",
                normalized_plate_text="KA-03-MQ-4820",
                ocr_confidence=0.88
            )
            db.add(e1)

            # Seed 2: Triple Riding
            v2_vehicle = Vehicle(registration_number="KA-01-AB-9031", vehicle_type="Two-Wheeler", owner_name="Vikram Singh", owner_phone="+91 87654 32109")
            db.add(v2_vehicle)
            db.flush()
            
            v2 = Violation(
                violation_uuid="v-seed-002",
                vehicle_id=v2_vehicle.id,
                violation_type=ViolationType.TRIPLE_RIDING,
                violation_confidence=0.89,
                status=ViolationStatus.CONFIRMED,
                location_name="Silk Board Junction"
            )
            db.add(v2)
            db.flush()
            
            e2 = Evidence(
                violation_id=v2.id,
                original_image_path="frontend/images/samples/triple_riding.png",
                annotated_image_path="frontend/images/samples/triple_riding.png",
                plate_crop_path="frontend/images/samples/triple_riding.png",
                vehicle_bbox_json='{"x":36,"y":39,"w":33,"h":44}',
                plate_bbox_json='{"x":39,"y":69,"w":4,"h":3}',
                raw_ocr_text="KA01AB9031",
                normalized_plate_text="KA-01-AB-9031",
                ocr_confidence=0.79
            )
            db.add(e2)

            ch2 = Challan(
                challan_number="BTP-CH-100201",
                violation_id=v2.id,
                vehicle_id=v2_vehicle.id,
                vehicle_registration="KA-01-AB-9031",
                violation_type=ViolationType.TRIPLE_RIDING,
                fine_amount=1000,
                status=ChallanStatus.DISPATCHED
            )
            db.add(ch2)

        db.commit()
    except Exception as e:
        logger.error(f"Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()
