import os
import uuid
import json
import time
import base64
import cv2
import numpy as np
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.models.models import (
    Detection, Violation, Evidence, Vehicle, Camera,
    ViolationType, ViolationStatus, MediaType
)
from ai.detection.yolo_service import YOLODetectionService
from ai.plate_detection.detector import LicensePlateDetector
from ai.helmet_detection.detector import HelmetDetector
from ai.ocr.plate_ocr import LicensePlateOCR
from ai.violation_engine.rules import ViolationEngine, det_to_bbox_dict
from ai.tracking.tracker import VehicleTracker, calculate_iou

yolo_service = YOLODetectionService(model_path=settings.MODEL_PATH, confidence_threshold=settings.CONFIDENCE_THRESHOLD)
plate_detector = LicensePlateDetector()
ocr_engine = LicensePlateOCR(engine_name=settings.OCR_ENGINE, confidence_threshold=settings.OCR_CONFIDENCE_THRESHOLD)
helmet_detector = HelmetDetector()
violation_engine = ViolationEngine()

def process_image_file(db: Session, image_bytes: bytes, filename: str, sample_tag: Optional[str] = None) -> Dict[str, Any]:
    start_time = time.time()
    detection_uuid = str(uuid.uuid4())

    # Ensure upload and evidence directories exist
    os.makedirs(settings.UPLOAD_DIRECTORY, exist_ok=True)
    os.makedirs(settings.EVIDENCE_DIRECTORY, exist_ok=True)

    # 1. Save raw upload image
    ext = os.path.splitext(filename)[1] or ".jpg"
    upload_filename = f"{detection_uuid}_orig{ext}"
    raw_image_path = os.path.join(settings.UPLOAD_DIRECTORY, upload_filename)
    with open(raw_image_path, "wb") as f:
        f.write(image_bytes)

    # 2. Decode image for OpenCV
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image file provided.")

    h, w = image.shape[:2]

    # 3. Perform YOLO Detections
    raw_detections = yolo_service.detect(image)

    # 4. Perform Real ML Helmet Detections (never faked or hardcoded)
    helmet_detections, _ = helmet_detector.detect(image)

    # 5. Evaluate Violation Rules using real model outputs
    detected_violations = violation_engine.analyze_detections(
        detections=raw_detections,
        sample_tag=None,
        helmet_detections=helmet_detections
    )

    # 5. Dynamic License Plate Detection & OCR Pipeline
    plate_crop_path = None
    ocr_result = {
        "raw_ocr_text": "",
        "normalized_plate_text": "NOT_DETECTED",
        "ocr_confidence": 0.0,
        "is_valid": False
    }
    plate_bbox_dict = None

    # Collect vehicle bounding boxes in percentage coordinates
    vehicle_boxes_pct = [
        {"x": d.bbox[0], "y": d.bbox[1], "w": d.bbox[2], "h": d.bbox[3]}
        for d in raw_detections if d.class_name in ["car", "motorcycle", "bus", "truck"]
    ]

    # Run dynamic License Plate Detector
    plate_det = plate_detector.detect_plate(image, vehicle_boxes_pct=vehicle_boxes_pct)

    if plate_det is not None:
        px1, py1, px2, py2 = plate_det.x1, plate_det.y1, plate_det.x2, plate_det.y2
        plate_bbox_dict = {
            "x": plate_det.bbox_pct[0],
            "y": plate_det.bbox_pct[1],
            "w": plate_det.bbox_pct[2],
            "h": plate_det.bbox_pct[3]
        }

        if px2 > px1 and py2 > py1:
            plate_crop = image[max(0, py1):min(h, py2), max(0, px1):min(w, px2)]
            if plate_crop.size > 0:
                crop_filename = f"{detection_uuid}_plate.png"
                full_crop_path = os.path.join(settings.EVIDENCE_DIRECTORY, crop_filename)
                cv2.imwrite(full_crop_path, plate_crop)
                plate_crop_path = f"evidence/{crop_filename}"
                ocr_result = ocr_engine.recognize_plate(plate_crop)

    # 6. Draw annotated image with bounding boxes
    annotated_img = yolo_service.draw_detections(image, raw_detections)

    # Draw real helmet detections if any
    for hd in helmet_detections:
        # Green for helmet (class_id == 0), Red for no_helmet (class_id == 1)
        hd_color = (0, 200, 0) if hd.class_id == 0 else (0, 0, 230)
        cv2.rectangle(
            annotated_img,
            (hd.x1, hd.y1),
            (hd.x2, hd.y2),
            hd_color,
            2
        )
        hd_label = f"{hd.class_name} ({hd.confidence:.2f})"
        cv2.putText(
            annotated_img,
            hd_label,
            (hd.x1, max(hd.y1 - 6, 12)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            hd_color,
            2
        )

    if plate_det is not None:
        # Draw plate box accent on annotated evidence frame
        cv2.rectangle(
            annotated_img,
            (plate_det.x1, plate_det.y1),
            (plate_det.x2, plate_det.y2),
            (0, 255, 0),
            2
        )
        plate_label = f"Plate ({ocr_result['normalized_plate_text']})"
        cv2.putText(
            annotated_img,
            plate_label,
            (plate_det.x1, max(plate_det.y1 - 6, 12)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 255, 0),
            2
        )

    annotated_filename = f"{detection_uuid}_annotated.jpg"
    annotated_path = os.path.join(settings.EVIDENCE_DIRECTORY, annotated_filename)
    cv2.imwrite(annotated_path, annotated_img)

    # 7. Create DB Records
    raw_meta = {
        "vehicles": [d.to_dict() for d in raw_detections],
        "helmets": [hd.to_dict() for hd in helmet_detections]
    }
    db_detection = Detection(
        detection_uuid=detection_uuid,
        media_type=MediaType.IMAGE,
        media_path=f"uploads/{upload_filename}",
        status="PROCESSED",
        raw_metadata_json=json.dumps(raw_meta)
    )
    db.add(db_detection)
    db.flush()

    violations_output = []
    for v in detected_violations:
        # Check or create vehicle
        norm_plate = ocr_result["normalized_plate_text"]
        db_vehicle = db.query(Vehicle).filter(Vehicle.registration_number == norm_plate).first()
        if not db_vehicle:
            db_vehicle = Vehicle(
                registration_number=norm_plate,
                vehicle_type="Two-Wheeler" if v.violation_type in [ViolationType.NO_HELMET, ViolationType.TRIPLE_RIDING] else "Four-Wheeler",
                owner_name="Registered Owner",
                owner_phone="+91 98765 43210"
            )
            db.add(db_vehicle)
            db.flush()

        db_violation = Violation(
            violation_uuid=str(uuid.uuid4()),
            detection_id=db_detection.id,
            vehicle_id=db_vehicle.id,
            violation_type=v.violation_type,
            violation_confidence=v.confidence,
            status=ViolationStatus.PENDING_REVIEW,
            location_name="Bengaluru Municipal Traffic Zone",
            timestamp=datetime.utcnow()
        )
        db.add(db_violation)
        db.flush()

        db_evidence = Evidence(
            violation_id=db_violation.id,
            original_image_path=f"uploads/{upload_filename}",
            annotated_image_path=f"evidence/{annotated_filename}",
            plate_crop_path=plate_crop_path,
            vehicle_bbox_json=json.dumps(v.vehicle_bbox),
            plate_bbox_json=json.dumps(v.plate_bbox or plate_bbox_dict),
            raw_ocr_text=ocr_result["raw_ocr_text"],
            normalized_plate_text=ocr_result["normalized_plate_text"],
            ocr_confidence=ocr_result["ocr_confidence"]
        )
        db.add(db_evidence)
        violations_output.append(v.to_dict())

    db.commit()
    elapsed_ms = round((time.time() - start_time) * 1000.0, 2)

    # Encode annotated image as base64 for instant, serverless-safe browser rendering
    annotated_base64 = None
    try:
        _, buf = cv2.imencode(".jpg", annotated_img)
        annotated_base64 = f"data:image/jpeg;base64,{base64.b64encode(buf).decode('utf-8')}"
    except Exception as e:
        logger.warning(f"Failed to generate base64 for annotated image: {e}")

    return {
        "detection_uuid": detection_uuid,
        "media_path": f"uploads/{upload_filename}",
        "annotated_image_path": f"evidence/{annotated_filename}",
        "annotated_image_base64": annotated_base64,
        "detections": [d.to_dict() for d in raw_detections],
        "helmet_detections": [hd.to_dict() for hd in helmet_detections],
        "violations": violations_output,
        "processing_time_ms": elapsed_ms
    }


def process_video_file(
    db: Session,
    video_path: str,
    filename: str,
    frame_interval: int = 15,
    max_frames: int = 30,
) -> Dict[str, Any]:
    """
    Process an uploaded video file frame-by-frame with a sampling interval.
    Uses real YOLO + helmet + plate detection and lightweight IoU tracking to
    prevent duplicate violation alerts for the same vehicle across frames.
    """
    import shutil
    start_time = time.time()
    detection_uuid = str(uuid.uuid4())

    os.makedirs(settings.UPLOAD_DIRECTORY, exist_ok=True)
    os.makedirs(settings.EVIDENCE_DIRECTORY, exist_ok=True)

    dest_video_name = f"{detection_uuid}_{os.path.basename(filename)}"
    dest_video_path = os.path.join(settings.UPLOAD_DIRECTORY, dest_video_name)
    if os.path.abspath(video_path) != os.path.abspath(dest_video_path):
        shutil.copyfile(video_path, dest_video_path)

    cap = cv2.VideoCapture(dest_video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video file {filename}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = float(cap.get(cv2.CAP_PROP_FPS)) or 30.0
    duration_sec = round(total_frames / fps, 2) if fps > 0 else 0.0

    tracker = VehicleTracker(iou_threshold=0.25, max_age=3)
    frame_count = 0
    sampled_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frame_count += 1

        if (frame_count - 1) % frame_interval != 0:
            continue

        sampled_count += 1
        h, w = frame.shape[:2]

        # 1. Real YOLO Vehicle & Person Detections
        raw_detections = yolo_service.detect(frame)

        # 2. Real Helmet Detections
        helmet_detections, _ = helmet_detector.detect(frame)

        # 3. Filter vehicles for tracking
        vehicle_dets = [
            d for d in raw_detections if d.class_name in ["car", "motorcycle", "bus", "truck"]
        ]

        # 4. Associate with active vehicle tracks
        matched_pairs = tracker.update_frame(vehicle_dets, frame_count, frame)

        # 5. Evaluate Violations for current frame
        frame_violations = violation_engine.analyze_detections(
            detections=raw_detections,
            helmet_detections=helmet_detections
        )

        # 6. Draw annotations on frame
        annotated_frame = yolo_service.draw_detections(frame, raw_detections)
        for hd in helmet_detections:
            hd_color = (0, 200, 0) if hd.class_id == 0 else (0, 0, 230)
            cv2.rectangle(annotated_frame, (hd.x1, hd.y1), (hd.x2, hd.y2), hd_color, 2)
            cv2.putText(
                annotated_frame,
                f"{hd.class_name} ({hd.confidence:.2f})",
                (hd.x1, max(hd.y1 - 6, 12)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                hd_color,
                2,
            )

        # 7. Update each track observation
        for track, det in matched_pairs:
            bx, by, bw, bh = det.bbox
            tx1 = int((bx / 100.0) * w)
            ty1 = int((by / 100.0) * h)
            cv2.putText(
                annotated_frame,
                f"ID:{track.track_id} {track.class_name}",
                (tx1, max(ty1 - 10, 15)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (255, 200, 0),
                2,
            )

            # Associate violations specific to this vehicle
            track_violations = [
                v for v in frame_violations
                if calculate_iou(
                    (v.vehicle_bbox["x"], v.vehicle_bbox["y"], v.vehicle_bbox["w"], v.vehicle_bbox["h"]),
                    det.bbox
                ) >= 0.40
            ]

            # Attempt plate detection on this vehicle if not already recognized with high confidence
            best_plate = track.get_best_plate_observation()
            p_text = best_plate.plate_text if best_plate else None
            p_conf = best_plate.plate_confidence if best_plate else 0.0
            p_crop = best_plate.plate_crop if best_plate else None

            if p_conf < 0.70:
                plate_box = [{"x": det.bbox[0], "y": det.bbox[1], "w": det.bbox[2], "h": det.bbox[3]}]
                p_det = plate_detector.detect_plate(frame, vehicle_boxes_pct=plate_box)
                if p_det is not None and p_det.x2 > p_det.x1 and p_det.y2 > p_det.y1:
                    crop = frame[max(0, p_det.y1):min(h, p_det.y2), max(0, p_det.x1):min(w, p_det.x2)]
                    if crop.size > 0:
                        ocr_res = ocr_engine.recognize_plate(crop)
                        if ocr_res["is_valid"] and ocr_res["ocr_confidence"] > p_conf:
                            p_text = ocr_res["normalized_plate_text"]
                            p_conf = ocr_res["ocr_confidence"]
                            p_crop = crop

            track.update(
                det=det,
                frame_idx=frame_count,
                frame_img=frame,
                annotated_img=annotated_frame.copy(),
                violations=track_violations,
                plate_text=p_text,
                plate_conf=p_conf,
                plate_crop=p_crop,
            )

        if sampled_count >= max_frames:
            break

    cap.release()

    # 8. Create Video Detection record in DB
    db_detection = Detection(
        detection_uuid=detection_uuid,
        media_type=MediaType.VIDEO,
        media_path=f"uploads/{dest_video_name}",
        status="PROCESSED",
        raw_metadata_json=json.dumps({
            "total_frames_read": frame_count,
            "sampled_frames": sampled_count,
            "fps": fps,
            "duration_seconds": duration_sec,
            "tracks_count": len(tracker.all_tracks)
        })
    )
    db.add(db_detection)
    db.flush()

    # 9. Consolidate violation events per track (prevents duplicate violations across frames)
    consolidated_violations = []
    for track in tracker.all_tracks:
        observed_vtypes = set(
            v.violation_type for obs in track.observations for v in obs.violations
        )

        best_plate_obs = track.get_best_plate_observation()
        if best_plate_obs and best_plate_obs.plate_crop is not None:
            norm_plate = best_plate_obs.plate_text or "NOT_DETECTED"
            plate_conf = best_plate_obs.plate_confidence
            crop_filename = f"{detection_uuid}_track{track.track_id}_plate.png"
            full_crop_path = os.path.join(settings.EVIDENCE_DIRECTORY, crop_filename)
            cv2.imwrite(full_crop_path, best_plate_obs.plate_crop)
            plate_crop_path = f"evidence/{crop_filename}"
        else:
            norm_plate = "NOT_DETECTED"
            plate_conf = 0.0
            plate_crop_path = None

        for v_type in observed_vtypes:
            best_obs = track.get_best_observation_for_violation(
                v_type.value if hasattr(v_type, "value") else str(v_type)
            )
            if not best_obs:
                continue

            matching_viols = [
                v for v in best_obs.violations
                if (v.violation_type.value if hasattr(v.violation_type, "value") else str(v.violation_type)) == (v_type.value if hasattr(v_type, "value") else str(v_type))
            ]
            if not matching_viols:
                continue
            best_v = max(matching_viols, key=lambda x: x.confidence)

            v_type_slug = (v_type.value if hasattr(v_type, "value") else str(v_type)).lower()
            annotated_filename = f"{detection_uuid}_track{track.track_id}_{v_type_slug}_annotated.jpg"
            annotated_path = os.path.join(settings.EVIDENCE_DIRECTORY, annotated_filename)
            if best_obs.annotated_frame is not None:
                cv2.imwrite(annotated_path, best_obs.annotated_frame)

            db_vehicle = db.query(Vehicle).filter(Vehicle.registration_number == norm_plate).first()
            if not db_vehicle:
                db_vehicle = Vehicle(
                    registration_number=norm_plate,
                    vehicle_type="Two-Wheeler" if v_type in [ViolationType.NO_HELMET, ViolationType.TRIPLE_RIDING] else "Four-Wheeler",
                    owner_name="Registered Owner",
                    owner_phone="+91 98765 43210"
                )
                db.add(db_vehicle)
                db.flush()

            db_violation = Violation(
                violation_uuid=str(uuid.uuid4()),
                detection_id=db_detection.id,
                vehicle_id=db_vehicle.id,
                violation_type=best_v.violation_type,
                violation_confidence=best_v.confidence,
                status=ViolationStatus.PENDING_REVIEW,
                location_name="Bengaluru Municipal Traffic Zone",
                timestamp=datetime.utcnow()
            )
            db.add(db_violation)
            db.flush()

            db_evidence = Evidence(
                violation_id=db_violation.id,
                original_image_path=f"uploads/{dest_video_name}",
                annotated_image_path=f"evidence/{annotated_filename}",
                plate_crop_path=plate_crop_path,
                vehicle_bbox_json=json.dumps(best_v.vehicle_bbox),
                plate_bbox_json=json.dumps(best_v.plate_bbox),
                raw_ocr_text=norm_plate,
                normalized_plate_text=norm_plate,
                ocr_confidence=plate_conf
            )
            db.add(db_evidence)

            v_dict = best_v.to_dict()
            v_dict["track_id"] = track.track_id
            v_dict["annotated_frame_path"] = f"evidence/{annotated_filename}"
            v_dict["plate_crop_path"] = plate_crop_path
            v_dict["license_plate"] = norm_plate
            consolidated_violations.append(v_dict)

    db.commit()
    elapsed_ms = round((time.time() - start_time) * 1000.0, 2)

    return {
        "status": "COMPLETED",
        "detection_uuid": detection_uuid,
        "media_type": "VIDEO",
        "media_path": f"uploads/{dest_video_name}",
        "total_frames_read": frame_count,
        "processed_frames_count": sampled_count,
        "fps": fps,
        "duration_seconds": duration_sec,
        "vehicles_tracked_count": len(tracker.all_tracks),
        "tracks": [
            {
                "track_id": t.track_id,
                "class_name": t.class_name,
                "hits": t.hits,
                "violations_detected": [
                    v.value if hasattr(v, "value") else str(v)
                    for v in set(v.violation_type for obs in t.observations for v in obs.violations)
                ],
                "license_plate": (t.get_best_plate_observation().plate_text if t.get_best_plate_observation() else "NOT_DETECTED")
            }
            for t in tracker.all_tracks
        ],
        "violations": consolidated_violations,
        "processing_time_ms": elapsed_ms
    }
