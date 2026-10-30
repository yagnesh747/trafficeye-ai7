import os
import logging
from fastapi import FastAPI, Depends, HTTPException
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

def seed_default_users():
    """Seed default Admin and Operator accounts if none exist in the database."""
    db = SessionLocal()
    try:
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

        db.commit()
    except Exception as e:
        logger.error(f"Error seeding user accounts: {e}")
        db.rollback()
    finally:
        db.close()

# Seed immediately on load so serverless functions are pre-seeded
try:
    seed_default_users()
except Exception as e:
    logger.warning(f"Initial seed execution check: {e}")

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

# Health check endpoints
@app.get("/health")
@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "system": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT
    }

# Dedicated multi-tier file resolution endpoints (prevents 404s on Vercel)
@app.get("/evidence/{file_path:path}")
def get_evidence_file(file_path: str):
    # 1. Primary writeable directory (/tmp/evidence on Vercel)
    p1 = os.path.join(settings.EVIDENCE_DIRECTORY, file_path)
    if os.path.isfile(p1):
        return FileResponse(p1)
    # 2. Repository pre-seeded evidence directory
    p2 = os.path.join(settings.BASE_DIR, "evidence", file_path)
    if os.path.isfile(p2):
        return FileResponse(p2)
    # 3. Sample image directory fallback
    p3 = os.path.join(settings.SAMPLES_DIR, file_path)
    if os.path.isfile(p3):
        return FileResponse(p3)
    # 4. Universal fallback sample
    fallback = os.path.join(settings.SAMPLES_DIR, "no_helmet.png")
    if os.path.isfile(fallback):
        return FileResponse(fallback)
    raise HTTPException(status_code=404, detail="Evidence image not found")

@app.get("/uploads/{file_path:path}")
def get_upload_file(file_path: str):
    p1 = os.path.join(settings.UPLOAD_DIRECTORY, file_path)
    if os.path.isfile(p1):
        return FileResponse(p1)
    p2 = os.path.join(settings.BASE_DIR, "uploads", file_path)
    if os.path.isfile(p2):
        return FileResponse(p2)
    fallback = os.path.join(settings.SAMPLES_DIR, "no_helmet.png")
    if os.path.isfile(fallback):
        return FileResponse(fallback)
    raise HTTPException(status_code=404, detail="Upload file not found")

# Mount static directories
if os.path.isdir(settings.FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=settings.FRONTEND_DIR, html=True), name="frontend")
elif os.path.isdir("frontend"):
    app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")

@app.on_event("startup")
def startup_db_seed():
    seed_default_users()
