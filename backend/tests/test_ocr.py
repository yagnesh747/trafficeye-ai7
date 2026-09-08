import pytest
from ai.ocr.plate_ocr import LicensePlateOCR

def test_indian_plate_normalization_valid():
    ocr = LicensePlateOCR()
    formatted, conf, is_valid = ocr.normalize_and_validate("KA03MQ4820", 0.92)
    assert formatted == "KA-03-MQ-4820"
    assert is_valid is True
    assert conf >= 0.88

def test_indian_plate_uncertain_character():
    ocr = LicensePlateOCR(confidence_threshold=0.80)
    formatted, conf, is_valid = ocr.normalize_and_validate("KA03X?4820", 0.50)
    assert "?" in formatted or is_valid is False
    assert is_valid is False
