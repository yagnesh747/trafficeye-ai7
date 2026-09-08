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
    assert len(violations) >= 1
    assert violations[0].violation_type == ViolationType.TRIPLE_RIDING
