import os
import tempfile
import pytest
import numpy as np
import cv2
from fastapi.testclient import TestClient

from backend.app.main import app
from ai.tracking.tracker import VehicleTracker, calculate_iou
from ai.detection.yolo_service import DetectionResult


def test_calculate_iou():
    """Verify IoU calculation on overlapping and non-overlapping boxes."""
    # Exact overlap
    assert calculate_iou((10, 10, 20, 20), (10, 10, 20, 20)) == 1.0

    # Half overlap
    iou = calculate_iou((0, 0, 10, 10), (5, 0, 10, 10))
    # Intersection: 5x10 = 50. Union: 100 + 100 - 50 = 150. IoU = 50/150 = 1/3
    assert abs(iou - 0.3333) < 0.01

    # Disjoint
    assert calculate_iou((0, 0, 10, 10), (20, 20, 10, 10)) == 0.0


def test_vehicle_tracker_association():
    """Verify that tracker matches the same vehicle across frames and assigns new ID for distinct vehicle."""
    tracker = VehicleTracker(iou_threshold=0.25, max_age=3)
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

    # Frame 1: Motorcycle at (30, 30, 20, 20)
    det_f1 = [DetectionResult(3, "motorcycle", 0.90, (30.0, 30.0, 20.0, 20.0))]
    matched_f1 = tracker.update_frame(det_f1, frame_idx=1, frame_img=dummy_frame)
    assert len(matched_f1) == 1
    t1, _ = matched_f1[0]
    initial_id = t1.track_id
    assert initial_id == 1
    assert t1.hits == 0  # will increment on track.update

    # Simulate observation
    t1.update(det_f1[0], frame_idx=1, frame_img=dummy_frame)
    assert t1.hits == 1

    # Frame 2: Same motorcycle moved slightly to (32, 31, 20, 20)
    det_f2 = [DetectionResult(3, "motorcycle", 0.88, (32.0, 31.0, 20.0, 20.0))]
    matched_f2 = tracker.update_frame(det_f2, frame_idx=2, frame_img=dummy_frame)
    assert len(matched_f2) == 1
    t2, _ = matched_f2[0]
    assert t2.track_id == initial_id, "Tracker must re-identify the same vehicle across frames"

    # Frame 3: A completely different car appears at (70, 70, 20, 20)
    det_f3 = [
        DetectionResult(3, "motorcycle", 0.87, (34.0, 32.0, 20.0, 20.0)),
        DetectionResult(2, "car", 0.92, (70.0, 70.0, 20.0, 20.0)),
    ]
    matched_f3 = tracker.update_frame(det_f3, frame_idx=3, frame_img=dummy_frame)
    assert len(matched_f3) == 2
    track_ids = [t.track_id for t, _ in matched_f3]
    assert initial_id in track_ids
    assert len(set(track_ids)) == 2


def test_video_endpoint_processing():
    """Verify that the /api/analyze/video endpoint accepts and processes video frames."""
    # Generate a small 10-frame synthetic MP4 video
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_video:
        video_path = tmp_video.name

    try:
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(video_path, fourcc, 10.0, (320, 240))
        for i in range(10):
            frame = np.zeros((240, 320, 3), dtype=np.uint8)
            # Draw moving white rectangle to simulate motion
            cv2.rectangle(frame, (20 + i * 5, 50), (80 + i * 5, 120), (200, 200, 200), -1)
            out.write(frame)
        out.release()

        with TestClient(app) as client:
            with open(video_path, "rb") as vf:
                response = client.post(
                    "/api/analyze/video",
                    files={"file": ("test_traffic.mp4", vf, "video/mp4")},
                    data={"frame_interval": "2"}
                )

            assert response.status_code == 200, response.text
            data = response.json()

            assert data["status"] == "COMPLETED"
            assert data["media_type"] == "VIDEO"
            assert "detection_uuid" in data
            assert data["total_frames_read"] == 10
            assert data["processed_frames_count"] == 5  # 10 frames sampled every 2 frames
            assert isinstance(data["tracks"], list)
            assert isinstance(data["violations"], list)
            assert data["processing_time_ms"] > 0
    finally:
        if os.path.exists(video_path):
            try:
                os.remove(video_path)
            except Exception:
                pass
