import re
import logging
import cv2
import numpy as np
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger("trafficeye.ai.ocr")

class LicensePlateOCR:
    # Standard Indian Vehicle Registration Pattern: e.g. KA03MQ4820, DL01AB1234, MH12DE5678
    INDIAN_PLATE_REGEX = re.compile(r'^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$')

    def __init__(self, engine_name: str = "easyocr", confidence_threshold: float = 0.60):
        self.engine_name = engine_name.lower()
        self.confidence_threshold = confidence_threshold
        self.easyocr_reader = None
        self._init_ocr_engine()

    def _init_ocr_engine(self):
        if self.engine_name == "easyocr":
            try:
                import easyocr
                logger.info("Initializing EasyOCR reader for English...")
                self.easyocr_reader = easyocr.Reader(['en'], gpu=False)
                logger.info("EasyOCR initialized successfully.")
            except Exception as e:
                logger.warning(f"EasyOCR initialization failed ({e}). Falling back to Tesseract / OpenCV pipeline.")
                self.easyocr_reader = None

    def preprocess_plate_image(self, plate_crop: np.ndarray) -> np.ndarray:
        """Apply image processing: grayscale, bilateral filter, adaptive thresholding"""
        if plate_crop is None or plate_crop.size == 0:
            return plate_crop

        # 1. Resize if tiny
        h, w = plate_crop.shape[:2]
        if h < 50 or w < 120:
            scale = max(120 / max(w, 1), 50 / max(h, 1))
            plate_crop = cv2.resize(plate_crop, (0, 0), fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

        # 2. Convert to Grayscale
        if len(plate_crop.shape) == 3:
            gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
        else:
            gray = plate_crop.copy()

        # 3. Noise reduction & contrast enhancement
        denoised = cv2.bilateralFilter(gray, 11, 17, 17)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(denoised)

        # 4. Otsu Thresholding
        _, thresh = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return thresh

    def recognize_plate(self, plate_crop: np.ndarray) -> Dict[str, Any]:
        """Runs OCR on crop and returns raw_text, normalized_text, and ocr_confidence"""
        if plate_crop is None or plate_crop.size == 0:
            return {
                "raw_ocr_text": "",
                "normalized_plate_text": "",
                "ocr_confidence": 0.0,
                "is_valid": False
            }

        preprocessed = self.preprocess_plate_image(plate_crop)

        raw_text = ""
        confidence = 0.0

        # Try EasyOCR
        if self.easyocr_reader is not None:
            try:
                ocr_results = self.easyocr_reader.readtext(preprocessed)
                if ocr_results:
                    # Pick highest confidence result
                    best_res = max(ocr_results, key=lambda item: item[2])
                    raw_text = best_res[1]
                    confidence = float(best_res[2])
            except Exception as e:
                logger.error(f"EasyOCR error: {e}")

        # Fallback to PyTesseract if EasyOCR is empty or uninitialized
        if not raw_text:
            try:
                import pytesseract
                raw_text = pytesseract.image_to_string(preprocessed, config='--psm 8 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
                confidence = 0.78 if raw_text.strip() else 0.0
            except Exception:
                pass

        # Cleanup raw text
        cleaned_raw = re.sub(r'[^A-Z0-9]', '', raw_text.upper().strip())
        
        # Apply normalization & uncertainty masking
        normalized_text, final_conf, is_valid = self.normalize_and_validate(cleaned_raw, confidence)

        return {
            "raw_ocr_text": cleaned_raw,
            "normalized_plate_text": normalized_text,
            "ocr_confidence": round(final_conf, 4),
            "is_valid": is_valid
        }

    def normalize_and_validate(self, text: str, confidence: float) -> Tuple[str, float, bool]:
        """Format Indian registration text or return unreadable status without fake placeholders"""
        if not text:
            return "UNREADABLE", 0.0, False

        # Format as State Code (2) - District Code (2) - Series (1-3) - Unique Number (4)
        match = self.INDIAN_PLATE_REGEX.match(text)
        if match:
            state = text[:2]
            district = text[2:4]
            rest = text[4:]
            formatted = f"{state}-{district}-{rest[:-4]}-{rest[-4:]}"
            return formatted, confidence, True

        # If partial text detected, format as much as available
        if len(text) >= 6:
            state = text[:2]
            district = text[2:4]
            rest = text[4:]
            formatted = f"{state}-{district}-{rest}"
            return formatted, confidence, False

        # Return raw text if non-standard or unvalidated
        return text, confidence, False
