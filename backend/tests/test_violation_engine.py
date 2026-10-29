import pytest
from backend.app.models.models import ViolationType
from ai.violation_engine.rules import ViolationEngine
from ai.detection.yolo_service import DetectionResult

def test_sample_tag_no_helmet():
    engine = ViolationEngine()
    violations = engine.analyze_detections([], sample_tag="no_helmet")
    assert len(violations) == 1
    assert violations[0].violation_type == ViolationType.NO_HELMET
    assert violations[0].confidence == 0.92

def test_triple_riding_detection():
    engine = ViolationEngine()
    detections = [
        DetectionResult(3, "motorcycle", 0.90, (30.0, 30.0, 30.0, 40.0)),
        DetectionResult(0, "person", 0.88, (32.0, 25.0, 10.0, 25.0)),
        DetectionResult(0, "person", 0.87, (38.0, 25.0, 10.0, 25.0)),
        DetectionResult(0, "person", 0.85, (44.0, 25.0, 10.0, 25.0))
    ]
    violations = engine.analyze_detections(detections)
    assert len(violations) == 1
    v = violations[0]
    assert v.violation_type == ViolationType.TRIPLE_RIDING
    expected_conf = round((0.90 + 0.88 + 0.87 + 0.85) / 4.0, 4)
    assert v.confidence == expected_conf
    assert v.vehicle_bbox == {"x": 30.0, "y": 30.0, "w": 30.0, "h": 40.0}
    assert v.detection_source == "yolo_model"

def test_triple_riding_two_riders_no_violation():
    """Two occupants on a motorcycle must NOT trigger a TRIPLE_RIDING violation."""
    engine = ViolationEngine()
    detections = [
        DetectionResult(3, "motorcycle", 0.92, (30.0, 30.0, 30.0, 40.0)),
        DetectionResult(0, "person", 0.89, (33.0, 25.0, 10.0, 25.0)),
        DetectionResult(0, "person", 0.86, (42.0, 25.0, 10.0, 25.0)),
    ]
    violations = engine.analyze_detections(detections)
    triple_riding = [v for v in violations if v.violation_type == ViolationType.TRIPLE_RIDING]
    assert len(triple_riding) == 0

def test_triple_riding_separate_motorcycles_no_pooling():
    """Persons on different motorcycles must not be pooled together into triple riding."""
    engine = ViolationEngine()
    detections = [
        # Bike 1 at x=10 with 2 riders
        DetectionResult(3, "motorcycle", 0.91, (10.0, 40.0, 25.0, 35.0)),
        DetectionResult(0, "person", 0.87, (12.0, 35.0, 10.0, 22.0)),
        DetectionResult(0, "person", 0.85, (20.0, 35.0, 10.0, 22.0)),
        # Bike 2 at x=60 with 1 rider
        DetectionResult(3, "motorcycle", 0.89, (60.0, 40.0, 25.0, 35.0)),
        DetectionResult(0, "person", 0.88, (65.0, 35.0, 10.0, 22.0)),
    ]
    violations = engine.analyze_detections(detections)
    triple_riding = [v for v in violations if v.violation_type == ViolationType.TRIPLE_RIDING]
    assert len(triple_riding) == 0
