import pytest
import numpy as np
import cv2
from ai.plate_detection.detector import LicensePlateDetector, PlateDetectionResult
from ai.ocr.plate_ocr import LicensePlateOCR

def test_license_plate_detector_synthetic():
    detector = LicensePlateDetector()

    # Create synthetic image with high-contrast license plate rectangle
    img = np.zeros((400, 600, 3), dtype=np.uint8)
    
    # Draw white license plate background rectangle (aspect ratio ~ 3.5:1)
    cv2.rectangle(img, (200, 200), (340, 240), (255, 255, 255), -1)
    # Draw dark characters inside plate
    cv2.putText(img, "KA03MQ4820", (205, 230), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)

    result = detector.detect_plate(img)

    assert result is not None, "PlateDetector should detect synthetic license plate contour"
    assert isinstance(result, PlateDetectionResult)
    assert result.x1 <= 205 and result.x2 >= 335
    assert result.y1 <= 205 and result.y2 >= 235
    assert result.confidence > 0.50

def test_license_plate_detector_no_plate():
    detector = LicensePlateDetector()

    # Blank black image with no rectangular contours
    img = np.zeros((300, 300, 3), dtype=np.uint8)
    result = detector.detect_plate(img)

    assert result is None, "PlateDetector should return None when no plate is present"

def test_ocr_no_fake_fallback():
    ocr = LicensePlateOCR()

    # Unreadable noise crop
    noise_crop = np.random.randint(0, 255, (50, 150, 3), dtype=np.uint8)
    res = ocr.recognize_plate(noise_crop)

    assert "KA-03-MQ-4820" not in res["normalized_plate_text"]
    assert res["is_valid"] is False
