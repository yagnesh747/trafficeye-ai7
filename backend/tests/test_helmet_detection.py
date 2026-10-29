import os
import pytest
import numpy as np
import cv2

from ai.helmet_detection.detector import (
    HelmetDetector,
    HelmetDetection,
    EXPECTED_ONNX_SHA256,
    DEFAULT_ONNX_PATH,
    sha256_of_file,
    CLASS_HELMET,
    CLASS_NO_HELMET,
)
from ai.detection.yolo_service import DetectionResult
from ai.violation_engine.rules import ViolationEngine
from backend.app.models.models import ViolationType


def test_helmet_model_file_and_sha256():
    """Verify that models/helmet/best.onnx exists and exactly matches the pinned SHA-256."""
    assert os.path.isfile(DEFAULT_ONNX_PATH), f"Model file missing: {DEFAULT_ONNX_PATH}"
    actual_sha = sha256_of_file(DEFAULT_ONNX_PATH)
    assert actual_sha == EXPECTED_ONNX_SHA256, f"SHA-256 mismatch! Expected {EXPECTED_ONNX_SHA256}, got {actual_sha}"
    assert len(EXPECTED_ONNX_SHA256) == 64


def test_helmet_detector_initialization():
    """Verify HelmetDetector loads the ONNX session with expected shape and output."""
    detector = HelmetDetector()
    shape = detector.get_input_shape()
    assert shape == (1, 3, 640, 640), f"Unexpected input shape: {shape}"
    assert detector.get_output_name() == "output0"


def test_helmet_detector_no_fake_detections_on_blank():
    """Ensure detector returns empty list on blank/noise images — no fabricated boxes or confidence floors."""
    detector = HelmetDetector()

    # Pure black image
    black_img = np.zeros((640, 640, 3), dtype=np.uint8)
    dets, ms = detector.detect(black_img)
    assert dets == [], "Detector must not hallucinate detections on black frame"
    assert ms > 0.0

    # Random noise image
    noise_img = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
    dets_noise, _ = detector.detect(noise_img)
    assert dets_noise == [], "Detector must not hallucinate detections on random noise"

    # Empty / None handling
    dets_empty, _ = detector.detect(np.array([]))
    assert dets_empty == []


def test_violation_engine_with_real_no_helmet():
    """Verify ViolationEngine correctly flags NO_HELMET when real detector finds class_id=1 ('Without Helmet')."""
    engine = ViolationEngine()

    # Motorcycle + rider detections from YOLO
    detections = [
        DetectionResult(3, "motorcycle", 0.90, (30.0, 30.0, 30.0, 40.0)),
        DetectionResult(0, "person", 0.88, (35.0, 25.0, 15.0, 30.0)),
    ]

    # Real helmet detection: without helmet, raw confidence 0.842
    real_helmet_dets = [
        HelmetDetection(
            class_id=CLASS_NO_HELMET,
            class_name="Without Helmet",
            confidence=0.8421,
            x1=200, y1=100, x2=250, y2=160,
            x_pct=35.0, y_pct=25.0, w_pct=10.0, h_pct=12.0
        )
    ]

    violations = engine.analyze_detections(
        detections=detections,
        helmet_detections=real_helmet_dets
    )

    assert len(violations) == 1
    v = violations[0]
    assert v.violation_type == ViolationType.NO_HELMET
    assert v.confidence == 0.8421  # Raw score preserved without inflation
    assert v.detection_source == "helmet_model"
    assert "no_helmet" in v.reason or "Without Helmet" in v.reason or "Helmet model" in v.reason


def test_violation_engine_with_real_with_helmet():
    """Verify ViolationEngine does NOT flag violation when rider has helmet."""
    engine = ViolationEngine()

    detections = [
        DetectionResult(3, "motorcycle", 0.90, (30.0, 30.0, 30.0, 40.0)),
        DetectionResult(0, "person", 0.88, (35.0, 25.0, 15.0, 30.0)),
    ]

    # Real helmet detection: with helmet
    real_helmet_dets = [
        HelmetDetection(
            class_id=CLASS_HELMET,
            class_name="With Helmet",
            confidence=0.915,
            x1=200, y1=100, x2=250, y2=160,
            x_pct=35.0, y_pct=25.0, w_pct=10.0, h_pct=12.0
        )
    ]

    violations = engine.analyze_detections(
        detections=detections,
        helmet_detections=real_helmet_dets
    )

    no_helmet_violations = [v for v in violations if v.violation_type == ViolationType.NO_HELMET]
    assert len(no_helmet_violations) == 0, "No violation should be raised when rider has helmet"


def test_violation_engine_empty_helmet_detections_no_fallback():
    """Verify that when no helmet/no-helmet is detected, engine does NOT fabricate a violation."""
    engine = ViolationEngine()

    detections = [
        DetectionResult(3, "motorcycle", 0.90, (30.0, 30.0, 30.0, 40.0)),
        DetectionResult(0, "person", 0.88, (35.0, 25.0, 15.0, 30.0)),
    ]

    # Model returned nothing (e.g. rider head obscured or distance too great)
    violations = engine.analyze_detections(
        detections=detections,
        helmet_detections=[]
    )

    no_helmet_violations = [v for v in violations if v.violation_type == ViolationType.NO_HELMET]
    assert len(no_helmet_violations) == 0, "Must never invent violations when model detects nothing"
