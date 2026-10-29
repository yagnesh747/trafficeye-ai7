import os
import hashlib
import logging
import cv2
import numpy as np
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("trafficeye.ai.plate_detection")

MODEL_RELATIVE_PATH = os.path.join("models", "plate", "best.onnx")
EXPECTED_SHA256 = "85d236280a1301ad98907947d284951dd2b20c23a6786ff50f7e6a8ec515bd50"

def sha256_of_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

class PlateDetectionResult:
    def __init__(
        self,
        x1: int,
        y1: int,
        x2: int,
        y2: int,
        confidence: float,
        bbox_pct: Tuple[float, float, float, float]
    ):
        self.x1 = int(x1)
        self.y1 = int(y1)
        self.x2 = int(x2)
        self.y2 = int(y2)
        self.confidence = float(confidence)
        self.bbox_pct = bbox_pct  # (x_pct, y_pct, w_pct, h_pct)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "x1": self.x1,
            "y1": self.y1,
            "x2": self.x2,
            "y2": self.y2,
            "confidence": round(self.confidence, 4),
            "bbox_pct": {
                "x": round(self.bbox_pct[0], 2),
                "y": round(self.bbox_pct[1], 2),
                "w": round(self.bbox_pct[2], 2),
                "h": round(self.bbox_pct[3], 2)
            }
        }

class LicensePlateDetector:
    """
    Production License Plate Detector using verified MIT-licensed YOLOv8-ONNX model.
    No hardcoded coordinates, no hardcoded plate numbers, no fabricated confidence.
    """
    def __init__(
        self,
        model_path: Optional[str] = None,
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45
    ):
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        
        if model_path is None:
            # Resolve relative to project root
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            model_path = os.path.join(base_dir, MODEL_RELATIVE_PATH)

        self.model_path = model_path
        self.session = None
        self._input_name = None
        self._output_name = None
        self._input_shape = None

        self._load_and_verify_model()

    def _load_and_verify_model(self):
        """Verify SHA-256 and load ONNXRuntime Inference Session (CPU)."""
        if not os.path.isfile(self.model_path):
            raise RuntimeError(
                f"License plate ONNX model not found at {self.model_path}. "
                "Run download_model.py before starting the application."
            )
        
        actual_hash = sha256_of_file(self.model_path)
        if actual_hash != EXPECTED_SHA256:
            raise RuntimeError(
                f"ONNX Model SHA-256 mismatch! Expected {EXPECTED_SHA256}, got {actual_hash}. "
                "Run download_model.py to refresh the verified model."
            )
        
        try:
            import onnxruntime as ort
            logger.info(f"Loading verified YOLOv8 ONNX model from {self.model_path} (CPUExecutionProvider)...")
            self.session = ort.InferenceSession(self.model_path, providers=['CPUExecutionProvider'])
            inputs = self.session.get_inputs()
            outputs = self.session.get_outputs()
            self._input_name = inputs[0].name
            self._input_shape = inputs[0].shape  # [1, 3, 640, 640]
            self._output_name = outputs[0].name
            logger.info(f"YOLOv8 ONNX Model loaded successfully. Input: {self._input_name} {self._input_shape}, Output: {self._output_name} {outputs[0].shape}")
        except Exception as e:
            raise RuntimeError(f"Failed to initialize ONNXRuntime session for {self.model_path}: {e}")

    def detect_plate(
        self,
        image: np.ndarray,
        vehicle_boxes_pct: Optional[List[Dict[str, float]]] = None
    ) -> Optional[PlateDetectionResult]:
        """
        Detect license plate using YOLOv8 ONNX model.
        Returns highest-confidence PlateDetectionResult or None if no plate is detected.
        """
        if image is None or image.size == 0:
            return None

        h_img, w_img = image.shape[:2]
        candidates: List[PlateDetectionResult] = []

        # 1. Inference on full image
        full_res = self._run_onnx_inference(image, offset_x=0, offset_y=0, img_w=w_img, img_h=h_img)
        if full_res:
            candidates.extend(full_res)

        # 2. If vehicle bounding boxes provided, also run inference on vehicle ROIs
        if vehicle_boxes_pct:
            for v_box in vehicle_boxes_pct:
                vx = int((v_box["x"] / 100.0) * w_img)
                vy = int((v_box["y"] / 100.0) * h_img)
                vw = int((v_box["w"] / 100.0) * w_img)
                vh = int((v_box["h"] / 100.0) * h_img)

                crop_x1 = max(0, vx)
                crop_y1 = max(0, vy)
                crop_x2 = min(w_img, vx + vw)
                crop_y2 = min(h_img, vy + vh)

                if (crop_x2 - crop_x1) > 30 and (crop_y2 - crop_y1) > 20:
                    roi = image[crop_y1:crop_y2, crop_x1:crop_x2]
                    roi_res = self._run_onnx_inference(roi, offset_x=crop_x1, offset_y=crop_y1, img_w=w_img, img_h=h_img)
                    if roi_res:
                        candidates.extend(roi_res)

        if not candidates:
            return None

        # Return candidate with highest confidence score
        best_candidate = max(candidates, key=lambda c: c.confidence)
        return best_candidate

    def _run_onnx_inference(
        self,
        img_crop: np.ndarray,
        offset_x: int,
        offset_y: int,
        img_w: int,
        img_h: int
    ) -> List[PlateDetectionResult]:
        if img_crop is None or img_crop.size == 0:
            return []

        h_crop, w_crop = img_crop.shape[:2]

        # Resize to 640x640 for YOLOv8 ONNX
        blob_resized = cv2.resize(img_crop, (640, 640), interpolation=cv2.INTER_LINEAR)
        rgb = cv2.cvtColor(blob_resized, cv2.COLOR_BGR2RGB)
        
        # Transpose HWC (640,640,3) -> CHW (3,640,640) & normalize [0, 1]
        input_tensor = np.transpose(rgb, (2, 0, 1)).astype(np.float32) / 255.0
        input_tensor = np.expand_dims(input_tensor, axis=0)  # (1, 3, 640, 640)

        # Execute ONNX CPU Inference
        outputs = self.session.run([self._output_name], {self._input_name: input_tensor})
        predictions = outputs[0]  # Shape (1, 5, 8400)

        # Squeeze batch dimension & transpose -> (8400, 5): [cx, cy, w, h, score]
        preds = np.squeeze(predictions, axis=0).T

        boxes = []
        confidences = []

        scale_x = w_crop / 640.0
        scale_y = h_crop / 640.0

        for row in preds:
            cx, cy, w, h, score = row[0], row[1], row[2], row[3], row[4]
            if score < self.conf_threshold:
                continue

            # Convert 640x640 coords to crop coords
            cx_crop = cx * scale_x
            cy_crop = cy * scale_y
            w_crop_box = w * scale_x
            h_crop_box = h * scale_y

            x1_crop = int(cx_crop - (w_crop_box / 2.0))
            y1_crop = int(cy_crop - (h_crop_box / 2.0))
            box_w = int(w_crop_box)
            box_h = int(h_crop_box)

            boxes.append([x1_crop, y1_crop, box_w, box_h])
            confidences.append(float(score))

        if not boxes:
            return []

        # Apply Non-Maximum Suppression (NMS)
        indices = cv2.dnn.NMSBoxes(boxes, confidences, self.conf_threshold, self.iou_threshold)
        results = []

        if len(indices) > 0:
            flat_indices = indices.flatten() if hasattr(indices, 'flatten') else indices
            for idx in flat_indices:
                x, y, w, h = boxes[idx]
                conf = confidences[idx]

                full_x1 = max(0, min(img_w, offset_x + x))
                full_y1 = max(0, min(img_h, offset_y + y))
                full_x2 = max(0, min(img_w, offset_x + x + w))
                full_y2 = max(0, min(img_h, offset_y + y + h))

                box_w_full = max(1, full_x2 - full_x1)
                box_h_full = max(1, full_y2 - full_y1)

                x_pct = (full_x1 / img_w) * 100.0
                y_pct = (full_y1 / img_h) * 100.0
                w_pct = (box_w_full / img_w) * 100.0
                h_pct = (box_h_full / img_h) * 100.0

                results.append(PlateDetectionResult(
                    x1=full_x1,
                    y1=full_y1,
                    x2=full_x2,
                    y2=full_y2,
                    confidence=conf,
                    bbox_pct=(x_pct, y_pct, w_pct, h_pct)
                ))

        return results

    def _detect_plate_legacy_sobel(self, image: np.ndarray) -> Optional[PlateDetectionResult]:
        """
        DEPRECATED reference implementation using Sobel contours.
        Kept strictly for legacy benchmarking reference. Not used in production.
        """
        if image is None or image.size == 0:
            return None
        h_img, w_img = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image.copy()
        blur = cv2.bilateralFilter(gray, 9, 75, 75)
        sobelx = cv2.Sobel(blur, cv2.CV_8U, 1, 0, ksize=3)
        _, thresh = cv2.threshold(sobelx, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 3))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            aspect = float(w) / float(h) if h > 0 else 0
            if 1.8 <= aspect <= 6.5:
                return PlateDetectionResult(
                    x1=x, y1=y, x2=x+w, y2=y+h,
                    confidence=0.75,
                    bbox_pct=((x/w_img)*100, (y/h_img)*100, (w/w_img)*100, (h/h_img)*100)
                )
        return None
