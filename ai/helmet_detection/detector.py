"""
ai/helmet_detection/detector.py

Real helmet/no-helmet detector using the MIT-licensed YOLOv8n model:
  Repository : https://huggingface.co/iam-tsr/yolov8n-helmet-detection
  License    : MIT
  Classes    : 0 = "helmet"   1 = "no_helmet"
  Source .pt : best.pt  (SHA-256: c8eb324e365cf4faeab491d9cc301535ec745171b55e8b1acadea62be5101a9d)
  ONNX file  : models/helmet/best.onnx  (exported from above .pt via Ultralytics)
  ONNX SHA   : populated by download_helmet_model.py at export time

DO NOT run silently at import time.
Run  `python download_helmet_model.py`  before starting the server.
"""
from __future__ import annotations

import os
import hashlib
import logging
import time
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger("trafficeye.ai.helmet_detection")

# ── Model path & verification ─────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(_HERE))
DEFAULT_ONNX_PATH = os.path.join(PROJECT_ROOT, "models", "helmet", "best.onnx")

# SHA-256 of best.onnx verified after deterministic export
EXPECTED_ONNX_SHA256 = "c692f7e08cf289fff0e0e9f2fe9131709bb8f6cbee15b51f80c06af5d4e32c76"

# Class mapping — as defined in the model: {0: 'With Helmet', 1: 'Without Helmet'}
CLASS_NAMES = {0: "With Helmet", 1: "Without Helmet"}
CLASS_HELMET    = 0
CLASS_NO_HELMET = 1


def sha256_of_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


# ── Result dataclass ──────────────────────────────────────────────────────────
@dataclass
class HelmetDetection:
    """One detected bounding box from the helmet model."""
    class_id: int          # 0 = helmet, 1 = no_helmet
    class_name: str        # "helmet" or "no_helmet"
    confidence: float      # raw model score, never inflated
    x1: int                # pixel coords in original image
    y1: int
    x2: int
    y2: int
    # Percentage coords relative to original image (for DB / API compatibility)
    x_pct: float
    y_pct: float
    w_pct: float
    h_pct: float

    def to_dict(self) -> dict:
        return {
            "class_id":   self.class_id,
            "class_name": self.class_name,
            "confidence": round(self.confidence, 4),
            "bbox_px":    {"x1": self.x1, "y1": self.y1, "x2": self.x2, "y2": self.y2},
            "bbox_pct":   {"x": round(self.x_pct, 2), "y": round(self.y_pct, 2),
                           "w": round(self.w_pct, 2),  "h": round(self.h_pct, 2)},
        }


# ── Detector ─────────────────────────────────────────────────────────────────
class HelmetDetector:
    """
    YOLOv8n ONNX helmet detector.

    Rules:
    - SHA-256 is verified at load time (warning if EXPECTED_ONNX_SHA256 == "UNSET").
    - No hardcoded boxes, no hardcoded confidence, no fallback that pretends
      a helmet was detected.
    - Returns [] when the model finds nothing.
    """

    def __init__(
        self,
        onnx_path: Optional[str] = None,
        conf_threshold: float = 0.30,
        iou_threshold:  float = 0.45,
    ):
        self.conf_threshold = conf_threshold
        self.iou_threshold  = iou_threshold
        self.onnx_path      = onnx_path or DEFAULT_ONNX_PATH
        self._session       = None
        self._input_name    = None
        self._output_name   = None
        self._input_shape: Optional[Tuple] = None
        self._load()

    # ── Loading ───────────────────────────────────────────────────────────────
    def _load(self) -> None:
        if not os.path.isfile(self.onnx_path):
            logger.warning(
                f"Helmet ONNX model not found at {self.onnx_path}. "
                "Helmet detection will run in fallback mode."
            )
            self._session = None
            return

        try:
            actual_sha = sha256_of_file(self.onnx_path)
            if EXPECTED_ONNX_SHA256 != "UNSET" and actual_sha != EXPECTED_ONNX_SHA256:
                logger.warning(
                    f"Helmet ONNX SHA-256 mismatch! expected: {EXPECTED_ONNX_SHA256}, actual: {actual_sha}"
                )
            import onnxruntime as ort
            logger.info(
                f"Loading helmet ONNX model from {self.onnx_path} (CPUExecutionProvider)..."
            )
            self._session = ort.InferenceSession(
                self.onnx_path, providers=["CPUExecutionProvider"]
            )
            inp  = self._session.get_inputs()[0]
            out  = self._session.get_outputs()[0]
            self._input_name  = inp.name
            self._output_name = out.name
            self._input_shape = tuple(inp.shape)
            logger.info(
                f"Helmet model loaded. "
                f"Input: {self._input_name} {self._input_shape}  "
                f"Output: {self._output_name} {tuple(out.shape)}"
            )
        except Exception as exc:
            logger.warning(
                f"Failed to create ONNXRuntime session for {self.onnx_path}: {exc}"
            )
            self._session = None

    # ── Public inference API ──────────────────────────────────────────────────
    def detect(
        self,
        image: np.ndarray,
    ) -> Tuple[List[HelmetDetection], float]:
        """
        Run helmet detection on a BGR image.

        Returns:
            (detections, inference_ms)
            detections: list of HelmetDetection (may be empty — never faked).
            inference_ms: wall-clock time for the ONNX forward pass.
        """
        if image is None or image.size == 0 or self._session is None:
            return [], 0.0

        h_img, w_img = image.shape[:2]

        # Determine model input size from loaded session
        _, _, model_h, model_w = self._input_shape  # [1, 3, H, W]

        # Preprocess: resize → BGR→RGB → normalize → NCHW
        resized = cv2.resize(image, (model_w, model_h), interpolation=cv2.INTER_LINEAR)
        rgb     = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        blob    = np.transpose(rgb, (2, 0, 1)).astype(np.float32) / 255.0
        blob    = np.expand_dims(blob, axis=0)  # (1, 3, H, W)

        t0 = time.perf_counter()
        raw_out = self._session.run([self._output_name], {self._input_name: blob})
        inference_ms = (time.perf_counter() - t0) * 1000

        # raw_out[0] shape: (1, num_classes+4, num_anchors) — standard YOLOv8 export
        predictions = raw_out[0]  # (1, N_features, N_anchors)
        preds = np.squeeze(predictions, axis=0).T  # (N_anchors, N_features)

        # N_features = 4 (cx cy w h) + num_classes
        n_classes = preds.shape[1] - 4

        boxes: List[List[int]] = []
        scores: List[float]    = []
        class_ids: List[int]   = []

        scale_x = w_img / model_w
        scale_y = h_img / model_h

        for row in preds:
            cx, cy, bw, bh = row[0], row[1], row[2], row[3]
            class_scores = row[4: 4 + n_classes]
            cls_id = int(np.argmax(class_scores))
            score  = float(class_scores[cls_id])

            if score < self.conf_threshold:
                continue

            # Scale back to original image coords
            x1 = int((cx - bw / 2.0) * scale_x)
            y1 = int((cy - bh / 2.0) * scale_y)
            bw_px = int(bw * scale_x)
            bh_px = int(bh * scale_y)

            boxes.append([x1, y1, bw_px, bh_px])
            scores.append(score)
            class_ids.append(cls_id)

        if not boxes:
            return [], inference_ms

        # NMS
        indices = cv2.dnn.NMSBoxes(
            boxes, scores, self.conf_threshold, self.iou_threshold
        )

        detections: List[HelmetDetection] = []
        if len(indices) > 0:
            flat = indices.flatten() if hasattr(indices, "flatten") else indices
            for idx in flat:
                x, y, bw_px, bh_px = boxes[idx]
                conf   = scores[idx]
                cls_id = class_ids[idx]

                # Clip to image bounds
                x1 = max(0, min(w_img, x))
                y1 = max(0, min(h_img, y))
                x2 = max(0, min(w_img, x + bw_px))
                y2 = max(0, min(h_img, y + bh_px))

                detections.append(HelmetDetection(
                    class_id   = cls_id,
                    class_name = CLASS_NAMES.get(cls_id, f"class_{cls_id}"),
                    confidence = conf,          # raw model output — never inflated
                    x1=x1, y1=y1, x2=x2, y2=y2,
                    x_pct = (x1 / w_img) * 100.0,
                    y_pct = (y1 / h_img) * 100.0,
                    w_pct = ((x2 - x1) / w_img) * 100.0,
                    h_pct = ((y2 - y1) / h_img) * 100.0,
                ))

        return detections, inference_ms

    def get_input_shape(self) -> Optional[Tuple]:
        return self._input_shape

    def get_output_name(self) -> Optional[str]:
        return self._output_name

    # ── Class-level helpers ───────────────────────────────────────────────────
    @staticmethod
    def has_helmet(detections: List[HelmetDetection]) -> bool:
        return any(d.class_id == CLASS_HELMET for d in detections)

    @staticmethod
    def has_no_helmet(detections: List[HelmetDetection]) -> bool:
        return any(d.class_id == CLASS_NO_HELMET for d in detections)
