import os
import shutil
import tempfile
import cv2
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.models import Detection
from backend.app.services.detection_service import process_image_file

router = APIRouter(tags=["Detections & Analysis"])

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
        # Load sample image from frontend assets
        sample_path = os.path.join("frontend", "images", "samples", f"{sample_tag}.png")
        if not os.path.exists(sample_path):
            sample_path = os.path.join("frontend", "images", "samples", "no_helmet.png")

        if os.path.exists(sample_path):
            with open(sample_path, "rb") as f:
                image_bytes = f.read()
            return process_image_file(db, image_bytes, f"{sample_tag}.png", sample_tag=sample_tag)

    # Process uploaded image file
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    return process_image_file(db, contents, file.filename or "upload.jpg")

@router.post("/analyze/video")
async def analyze_video(
    file: UploadFile = File(...),
    frame_interval: int = Form(15),  # Process 1 frame every N frames
    db: Session = Depends(get_db)
):
    """Extract frames from uploaded MP4 video and analyze traffic violations."""
    if not file.filename.endswith(('.mp4', '.avi', '.mov', '.mkv')):
        raise HTTPException(status_code=400, detail="Unsupported video format. Please upload MP4, AVI, or MOV.")

    # Save uploaded video to temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        cap = cv2.VideoCapture(tmp_path)
        frame_count = 0
        analyzed_frames = []

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frame_count % frame_interval == 0:
                is_success, buffer = cv2.imencode(".jpg", frame)
                if is_success:
                    res = process_image_file(db, buffer.tobytes(), f"video_frame_{frame_count}.jpg")
                    analyzed_frames.append(res)

            frame_count += 1
            if len(analyzed_frames) >= 10:  # Cap at 10 processed frames per video request
                break

        cap.release()
        return {
            "status": "COMPLETED",
            "total_frames_read": frame_count,
            "processed_frames_count": len(analyzed_frames),
            "frame_results": analyzed_frames
        }
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

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
