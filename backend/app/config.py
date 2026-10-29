import os
from pydantic_settings import BaseSettings
from typing import List, Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "TrafficEye AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"

    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    # Security
    SECRET_KEY: str = "trafficeye-super-secret-key-change-in-production-2026!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Database
    DATABASE_URL: str = "sqlite:////tmp/trafficeye.db" if os.environ.get("VERCEL") else "sqlite:///./trafficeye.db"

    # Inference & Vision
    MODEL_PATH: str = "models/yolov8n.pt"
    CONFIDENCE_THRESHOLD: float = 0.45
    IOU_THRESHOLD: float = 0.50
    DEVICE: str = "cpu"

    # OCR
    OCR_ENGINE: str = "easyocr"  # easyocr or pytesseract
    OCR_CONFIDENCE_THRESHOLD: float = 0.60

    # Storage (use /tmp on Vercel where root FS is read-only)
    UPLOAD_DIRECTORY: str = "/tmp/uploads" if os.environ.get("VERCEL") else "uploads"
    EVIDENCE_DIRECTORY: str = "/tmp/evidence" if os.environ.get("VERCEL") else "evidence"
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
