import os
import shutil
import logging
from pydantic_settings import BaseSettings
from typing import List, Optional

logger = logging.getLogger("trafficeye.config")

# Project root directory (absolute path)
BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

IS_VERCEL: bool = bool(os.environ.get("VERCEL"))

# Initialize SQLite database file path
if IS_VERCEL:
    TMP_DB = "/tmp/trafficeye.db"
    REPO_DB = os.path.join(BASE_DIR, "trafficeye.db")
    # Copy pre-seeded SQLite database to writable /tmp on cold start
    if not os.path.exists(TMP_DB) and os.path.exists(REPO_DB):
        try:
            shutil.copy2(REPO_DB, TMP_DB)
            logger.info("Copied pre-seeded trafficeye.db to /tmp/trafficeye.db for Vercel execution.")
        except Exception as e:
            logger.warning(f"Could not copy database to /tmp: {e}")
    DEFAULT_DATABASE_URL = "sqlite:////tmp/trafficeye.db"
    DEFAULT_UPLOAD_DIR = "/tmp/uploads"
    DEFAULT_EVIDENCE_DIR = "/tmp/evidence"
else:
    DEFAULT_DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'trafficeye.db')}"
    DEFAULT_UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
    DEFAULT_EVIDENCE_DIR = os.path.join(BASE_DIR, "evidence")

class Settings(BaseSettings):
    PROJECT_NAME: str = "TrafficEye AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"

    ENVIRONMENT: str = "production" if IS_VERCEL else "development"
    DEBUG: bool = False if IS_VERCEL else True
    LOG_LEVEL: str = "INFO"

    # Base directory reference
    BASE_DIR: str = BASE_DIR
    FRONTEND_DIR: str = os.path.join(BASE_DIR, "frontend")
    SAMPLES_DIR: str = os.path.join(BASE_DIR, "frontend", "images", "samples")

    # Security
    SECRET_KEY: str = "trafficeye-super-secret-key-change-in-production-2026!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Database
    DATABASE_URL: str = DEFAULT_DATABASE_URL

    # Inference & Vision
    MODEL_PATH: str = os.path.join(BASE_DIR, "models", "yolov8n.pt")
    CONFIDENCE_THRESHOLD: float = 0.45
    IOU_THRESHOLD: float = 0.50
    DEVICE: str = "cpu"

    # OCR
    OCR_ENGINE: str = "easyocr"  # easyocr or pytesseract
    OCR_CONFIDENCE_THRESHOLD: float = 0.60

    # Storage (use /tmp on Vercel where root FS is read-only)
    UPLOAD_DIRECTORY: str = DEFAULT_UPLOAD_DIR
    EVIDENCE_DIRECTORY: str = DEFAULT_EVIDENCE_DIR
    MAX_UPLOAD_SIZE_MB: int = 50

    # Fine Schedule (INR ₹)
    FINE_NO_HELMET: int = 500
    FINE_TRIPLE_RIDING: int = 1000
    FINE_WRONG_PARKING: int = 500
    FINE_RED_LIGHT: int = 1000

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
