import os
import shutil
import tempfile
import cv2
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models.models import Detection
from backend.app.services.detection_service import process_image_file, process_video_file

router = APIRouter(tags=["Detections & Analysis"])

import logging

logger = logging.getLogger("trafficeye.detections")

ALLOWED_SAMPLE_TAGS = {"no_helmet", "triple_riding", "wrong_parking", "signal_jumping"}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv"}
MAX_IMAGE_SIZE = 15 * 1024 * 1024     # 15 MB
MAX_VIDEO_SIZE = 100 * 1024 * 1024   # 100 MB

@router.post("/analyze/image")
async def analyze_image(
    file: Optional[UploadFile] = File(None),
    sample_tag: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Analyze uploaded traffic snapshot image for vehicles, license plates, and violations."""
    if file is None and not sample_tag:
        raise HTTPException(status_code=400, detail="Either an image file or a sample_tag must be provided.")

    if sample_tag:
        if sample_tag not in ALLOWED_SAMPLE_TAGS:
            raise HTTPException(status_code=400, detail="Invalid sample_tag specified.")

        sample_path = os.path.join(settings.SAMPLES_DIR, f"{sample_tag}.png")
        if not os.path.exists(sample_path):
            sample_path = os.path.join(settings.SAMPLES_DIR, "no_helmet.png")

        if not os.path.exists(sample_path):
            raise HTTPException(status_code=404, detail="Sample image asset not found.")

        try:
            with open(sample_path, "rb") as f:
                image_bytes = f.read()
            return process_image_file(db, image_bytes, f"{sample_tag}.png", sample_tag=sample_tag)
        except Exception as e:
            logger.error(f"Sample analysis error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to process sample image.")

    # Validate file extension
    raw_filename = os.path.basename(file.filename or "upload.jpg")
    ext = os.path.splitext(raw_filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image format '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}"
        )

    # Read and validate file size
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")
    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Image file size exceeds maximum limit of {MAX_IMAGE_SIZE // (1024 * 1024)} MB."
        )

    try:
        return process_image_file(db, contents, raw_filename)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Image analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal image analysis failed. Please check image format.")

@router.post("/analyze/video")
async def analyze_video(
    file: UploadFile = File(...),
    frame_interval: int = Form(15),  # Process 1 frame every N frames
    db: Session = Depends(get_db)
):
    """Extract frames from uploaded traffic video and analyze traffic violations with tracking."""
    raw_filename = os.path.basename(file.filename or "traffic_video.mp4")
    ext = os.path.splitext(raw_filename)[1].lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video format '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))}"
        )

    # Bound frame_interval safely
    frame_interval = max(1, min(frame_interval, 120))

    # Stream video to temporary file enforcing size limit
    total_size = 0
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext or ".mp4") as tmp:
        tmp_path = tmp.name
        chunk_size = 1024 * 1024  # 1MB
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > MAX_VIDEO_SIZE:
                tmp.close()
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
                raise HTTPException(
                    status_code=413,
                    detail=f"Video file size exceeds maximum limit of {MAX_VIDEO_SIZE // (1024 * 1024)} MB."
                )
            tmp.write(chunk)

    if total_size == 0:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise HTTPException(status_code=400, detail="Empty video file uploaded.")

    try:
        result = process_video_file(
            db=db,
            video_path=tmp_path,
            filename=raw_filename,
            frame_interval=frame_interval,
            max_frames=30
        )
        return result
    except Exception as e:
        logger.error(f"Video analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process video stream. Verify video codec.")
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

@router.get("/detections")
def list_detections(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    detections = db.query(Detection).order_by(Detection.created_at.desc()).offset(skip).limit(limit).all()
    return detections

@router.get("/detections/{detection_id}")
def get_detection(detection_id: int, db: Session = Depends(get_db)):
    det = db.query(Detection).filter(Detection.id == detection_id).first()
    if not det:
        raise HTTPException(status_code=404, detail="Detection record not found.")
    return det
