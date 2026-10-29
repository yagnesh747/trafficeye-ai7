import os
import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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

# Mount uploads and evidence as static directories
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIRECTORY), name="uploads")
app.mount("/evidence", StaticFiles(directory=settings.EVIDENCE_DIRECTORY), name="evidence")

@app.get("/health")
def health_check():
    return {
        "status": "online",
        "system": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT
    }

# Mount the frontend LAST so all API routes take priority.
# html=True makes StaticFiles serve index.html for / automatically.
# Relative paths (css/style.css, js/app.js) in the HTML will resolve correctly.
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "frontend")
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
elif os.path.isdir("frontend"):
    app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")


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

        db.commit()
    except Exception as e:
        logger.error(f"Error seeding user accounts: {e}")
        db.rollback()
    finally:
        db.close()
