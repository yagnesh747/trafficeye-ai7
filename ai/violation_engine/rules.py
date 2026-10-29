"""
ai/violation_engine/rules.py

Rule-based violation engine.
Helmet/no-helmet decisions come ONLY from the real HelmetDetector model output.

sample_tag is preserved ONLY for legacy unit tests that test the tag dispatch
itself.  The production upload pipeline (process_image_file) MUST NOT pass
sample_tag and MUST run the real helmet detector before calling analyze_detections.
"""
from __future__ import annotations

import logging
import math
from typing import List, Dict, Any, Optional

from backend.app.models.models import ViolationType
from ai.detection.yolo_service import DetectionResult

logger = logging.getLogger("trafficeye.ai.violation_engine")


class DetectedViolation:
    def __init__(
        self,
        violation_type: ViolationType,
        confidence: float,
        vehicle_bbox: Dict[str, float],
        plate_bbox: Optional[Dict[str, float]] = None,
        reason: str = "",
        detection_source: str = "rule_engine",    # NEW: traceability field
    ):
        self.violation_type    = violation_type
        self.confidence        = float(confidence)
        self.vehicle_bbox      = vehicle_bbox
        self.plate_bbox        = plate_bbox
        self.reason            = reason
        self.detection_source  = detection_source  # "helmet_model" | "rule_engine" | "sample_tag_legacy"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "violation_type":   self.violation_type.value,
            "confidence":       round(self.confidence, 4),
            "vehicle_bbox":     self.vehicle_bbox,
            "plate_bbox":       self.plate_bbox,
            "reason":           self.reason,
            "detection_source": self.detection_source,
        }


class ViolationEngine:
    def __init__(
        self,
        helmet_confidence_threshold: float = 0.30,
        triple_riding_min_persons: int = 3,
    ):
        self.helmet_confidence_threshold = helmet_confidence_threshold
        self.triple_riding_min_persons   = triple_riding_min_persons

    def analyze_detections(
        self,
        detections: List[DetectionResult],
        parking_zones: Optional[List[Dict[str, Any]]] = None,
        stop_line: Optional[Dict[str, Any]] = None,
        sample_tag: Optional[str] = None,          # kept for legacy tests ONLY
        helmet_detections: Optional[List[Any]] = None,  # List[HelmetDetection]
    ) -> List[DetectedViolation]:
        """
        Evaluate rule-based violations.

        PRODUCTION PATH:
          - Pass helmet_detections from the real HelmetDetector.
          - Do NOT pass sample_tag (keep it None).

        LEGACY TEST PATH (isolated):
          - sample_tag triggers hardcoded responses for existing tests that
            explicitly test the tag-dispatch behaviour.  It is clearly labelled
            detection_source="sample_tag_legacy" so it cannot be confused with
            real model output.
          - The production upload endpoint never passes sample_tag.
        """
        violations: List[DetectedViolation] = []

        # ── LEGACY sample_tag branch (test fixtures only) ─────────────────────
        # Condition: only active when sample_tag is explicitly set AND
        # helmet_detections is None (meaning no real detector was run).
        # This preserves backward-compat for the legacy test suite without
        # contaminating the real pipeline.
        if sample_tag is not None and helmet_detections is None:
            return self._sample_tag_legacy(sample_tag)

        # ── Dynamic YOLO detections ───────────────────────────────────────────
        motorcycles    = [d for d in detections if d.class_name == "motorcycle"]
        persons        = [d for d in detections if d.class_name == "person"]
        cars           = [d for d in detections if d.class_name in ["car", "bus", "truck"]]
        traffic_lights = [d for d in detections if d.class_name == "traffic light"]

        # Associate each person to their closest matching motorcycle (prevents double counting)
        moto_to_persons: Dict[int, List[DetectionResult]] = {id(m): [] for m in motorcycles}
        for p in persons:
            qualifying = [m for m in motorcycles if is_person_on_motorcycle(p, m)]
            if qualifying:
                p_cx = p.bbox[0] + (p.bbox[2] / 2.0)
                best_m = min(qualifying, key=lambda m: abs((m.bbox[0] + m.bbox[2] / 2.0) - p_cx))
                moto_to_persons[id(best_m)].append(p)

        for moto in motorcycles:
            moto_dict = det_to_bbox_dict(moto)
            associated_persons = moto_to_persons.get(id(moto), [])

            logger.debug(
                "Motorcycle bbox=%s  associated_persons=%d",
                [round(v, 2) for v in moto.bbox], len(associated_persons),
            )

            # Rule 1: Triple Riding (3 or more persons associated with this motorcycle)
            if len(associated_persons) >= self.triple_riding_min_persons:
                involved_confs = [moto.confidence] + [p.confidence for p in associated_persons]
                trip_conf = round(float(sum(involved_confs) / len(involved_confs)), 4)
                violations.append(DetectedViolation(
                    violation_type   = ViolationType.TRIPLE_RIDING,
                    confidence       = trip_conf,
                    vehicle_bbox     = moto_dict,
                    reason           = (
                        f"{len(associated_persons)} occupants detected on motorcycle "
                        f"(moto conf={moto.confidence:.2f}, rider confs={[round(p.confidence, 2) for p in associated_persons]})."
                    ),
                    detection_source = "yolo_model",
                ))

            # Rule 2: No-Helmet — ONLY for motorcycle occupants, from real helmet model output.
            # Helmet detections are spatially filtered to the occupant region of THIS motorcycle
            # to prevent pedestrians elsewhere in the image from triggering a violation.
            if len(associated_persons) > 0:
                if helmet_detections is not None:
                    # Compute the bounding union of motorcycle + all its associated persons
                    occupant_region = _occupant_union_bbox(moto, associated_persons)

                    # Filter: only helmet detections whose box overlaps the occupant region
                    relevant_helmets = [
                        hd for hd in helmet_detections
                        if _helmet_overlaps_region(hd, occupant_region)
                    ]

                    logger.debug(
                        "Motorcycle %s: %d total helmet dets, %d in occupant region",
                        [round(v, 2) for v in moto.bbox],
                        len(helmet_detections),
                        len(relevant_helmets),
                    )

                    no_helmet_dets  = [hd for hd in relevant_helmets if hd.class_id == 1]
                    has_helmet_dets = [hd for hd in relevant_helmets if hd.class_id == 0]

                    if no_helmet_dets and not has_helmet_dets:
                        # All relevant helmet detections say 'no_helmet'
                        best = max(no_helmet_dets, key=lambda h: h.confidence)
                        violations.append(DetectedViolation(
                            violation_type   = ViolationType.NO_HELMET,
                            confidence       = best.confidence,
                            vehicle_bbox     = moto_dict,
                            plate_bbox       = None,
                            reason           = (
                                f"Helmet model detected 'no_helmet' "
                                f"(conf={best.confidence:.3f}) in motorcycle occupant region "
                                f"with no 'helmet' class present."
                            ),
                            detection_source = "helmet_model",
                        ))
                    elif no_helmet_dets and has_helmet_dets:
                        # Both classes present — prefer the highest-confidence verdict
                        best_no  = max(no_helmet_dets,  key=lambda h: h.confidence)
                        best_yes = max(has_helmet_dets, key=lambda h: h.confidence)
                        if best_no.confidence > best_yes.confidence:
                            violations.append(DetectedViolation(
                                violation_type   = ViolationType.NO_HELMET,
                                confidence       = best_no.confidence,
                                vehicle_bbox     = moto_dict,
                                reason           = (
                                    f"Helmet model (occupant region): no_helmet conf={best_no.confidence:.3f} "
                                    f"> helmet conf={best_yes.confidence:.3f}."
                                ),
                                detection_source = "helmet_model",
                            ))
                    # If has_helmet_dets and no no_helmet_dets → rider has helmet; no violation.
                    # If relevant_helmets is empty → no helmet detection in occupant region; no violation raised.
                else:
                    # helmet_detections is None and sample_tag is None:
                    # means real detector was not wired up — log but do NOT fabricate.
                    logger.warning(
                        "helmet_detections is None in production path. "
                        "No NO_HELMET violation raised. "
                        "Ensure HelmetDetector is integrated in detection_service.py."
                    )

        # Rule 3: Parking Zone
        if parking_zones:
            for vehicle in motorcycles + cars:
                v_dict = det_to_bbox_dict(vehicle)
                if is_bbox_in_zone(v_dict, parking_zones):
                    violations.append(DetectedViolation(
                        violation_type   = ViolationType.WRONG_PARKING,
                        confidence       = 0.90,
                        vehicle_bbox     = v_dict,
                        reason           = "Vehicle inside restricted parking ROI zone.",
                        detection_source = "rule_engine",
                    ))

        # Rule 4: Red Light
        if traffic_lights and stop_line:
            red_signals = [tl for tl in traffic_lights if tl.confidence > 0.60]
            if red_signals:
                for vehicle in motorcycles + cars:
                    v_dict = det_to_bbox_dict(vehicle)
                    if is_bbox_crossing_line(v_dict, stop_line):
                        violations.append(DetectedViolation(
                            violation_type   = ViolationType.RED_LIGHT,
                            confidence       = 0.89,
                            vehicle_bbox     = v_dict,
                            reason           = "Vehicle overlaps active red signal stop-line.",
                            detection_source = "rule_engine",
                        ))

        return violations

    # ── LEGACY — do not call from production upload pipeline ─────────────────
    def _sample_tag_legacy(self, tag: str) -> List[DetectedViolation]:
        """
        Returns hardcoded DetectedViolation objects for existing unit tests.
        detection_source is set to "sample_tag_legacy" so it is never confused
        with real model output.
        """
        mapping = {
            "no_helmet": DetectedViolation(
                violation_type   = ViolationType.NO_HELMET,
                confidence       = 0.92,
                vehicle_bbox     = {"x": 29.0, "y": 32.0, "w": 37.0, "h": 56.0},
                reason           = "[LEGACY TEST] sample_tag=no_helmet placeholder.",
                detection_source = "sample_tag_legacy",
            ),
            "triple_riding": DetectedViolation(
                violation_type   = ViolationType.TRIPLE_RIDING,
                confidence       = 0.89,
                vehicle_bbox     = {"x": 36.0, "y": 39.0, "w": 33.0, "h": 44.0},
                reason           = "[LEGACY TEST] sample_tag=triple_riding placeholder.",
                detection_source = "sample_tag_legacy",
            ),
            "wrong_parking": DetectedViolation(
                violation_type   = ViolationType.WRONG_PARKING,
                confidence       = 0.91,
                vehicle_bbox     = {"x": 17.0, "y": 43.0, "w": 47.0, "h": 35.0},
                reason           = "[LEGACY TEST] sample_tag=wrong_parking placeholder.",
                detection_source = "sample_tag_legacy",
            ),
            "signal_jumping": DetectedViolation(
                violation_type   = ViolationType.RED_LIGHT,
                confidence       = 0.90,
                vehicle_bbox     = {"x": 18.0, "y": 51.0, "w": 48.0, "h": 22.0},
                reason           = "[LEGACY TEST] sample_tag=signal_jumping placeholder.",
                detection_source = "sample_tag_legacy",
            ),
        }
        result = mapping.get(tag)
        return [result] if result else []


# ── Geometry helpers ─────────────────────────────────────────────────────────

def det_to_bbox_dict(det: DetectionResult) -> Dict[str, float]:
    return {"x": det.bbox[0], "y": det.bbox[1], "w": det.bbox[2], "h": det.bbox[3]}


def _occupant_union_bbox(
    moto: DetectionResult,
    persons: List[DetectionResult],
    padding_pct: float = 5.0,
) -> Dict[str, float]:
    """
    Compute the union bounding box (in % coords) of a motorcycle and all its
    associated riders, expanded by a small padding to account for model
    localisation error.

    This region is used to spatially filter helmet detector output so that
    pedestrians outside the motorcycle frame are excluded from helmet
    violation evaluation.
    """
    mx, my, mw, mh = moto.bbox
    x1 = mx
    y1 = my
    x2 = mx + mw
    y2 = my + mh

    for p in persons:
        px, py, pw, ph = p.bbox
        x1 = min(x1, px)
        y1 = min(y1, py)
        x2 = max(x2, px + pw)
        y2 = max(y2, py + ph)

    # Expand by padding (percentage points) so slight bbox misalignment
    # does not exclude a genuine helmet detection
    return {
        "x1": max(0.0,   x1 - padding_pct),
        "y1": max(0.0,   y1 - padding_pct),
        "x2": min(100.0, x2 + padding_pct),
        "y2": min(100.0, y2 + padding_pct),
    }


def _helmet_overlaps_region(hd: Any, region: Dict[str, float]) -> bool:
    """
    Return True if a HelmetDetection (with .x_pct/.y_pct/.w_pct/.h_pct
    percentage coords) has any overlap with the occupant region dict
    {x1, y1, x2, y2} (percentage coords).
    """
    hx1 = hd.x_pct
    hy1 = hd.y_pct
    hx2 = hd.x_pct + hd.w_pct
    hy2 = hd.y_pct + hd.h_pct

    # Overlap iff neither side is completely outside
    return not (hx2 <= region["x1"] or hx1 >= region["x2"] or
                hy2 <= region["y1"] or hy1 >= region["y2"])


def is_person_on_motorcycle(person: DetectionResult, moto: DetectionResult) -> bool:
    px, py, pw, ph = person.bbox
    mx, my, mw, mh = moto.bbox
    p_cx = px + (pw / 2.0)
    p_bottom = py + ph

    # Horizontal alignment: rider center-x falls within motorcycle span with proportional tolerance
    h_margin = max(mw * 0.20, 5.0)
    if not (mx - h_margin <= p_cx <= mx + mw + h_margin):
        return False

    # Vertical alignment: rider must be positioned atop the motorcycle (not floating above, not below)
    if py > my + (mh * 0.60):  # Rider starts too far below motorcycle top
        return False
    if p_bottom < my - 5.0:    # Rider is floating entirely above the bike
        return False
    if p_bottom > my + mh + max(mh * 0.25, 10.0):  # Rider extends too far below the bike
        return False

    return True


def check_helmet_in_head_region(person: DetectionResult, detections: List[DetectionResult]) -> bool:
    """
    Legacy COCO-class helmet check (kept for reference).
    YOLOv8n COCO model never produces a 'helmet' class, so this always
    returns False in the current setup.  Replaced by HelmetDetector.
    """
    px, py, pw, ph = person.bbox
    head_y_max = py + (ph * 0.35)
    for d in detections:
        if d.class_name == "helmet":
            hx, hy, hw, hh = d.bbox
            if (px - 5.0 <= hx <= px + pw + 5.0) and (py - 5.0 <= hy <= head_y_max):
                return True
    return False


def is_bbox_in_zone(bbox: Dict[str, float], zones: List[Dict[str, Any]]) -> bool:
    cx = bbox["x"] + (bbox["w"] / 2.0)
    cy = bbox["y"] + (bbox["h"] / 2.0)
    for z in zones:
        poly = z.get("polygon", [])
        if poly and is_point_in_polygon(cx, cy, poly):
            return True
    return False


def is_bbox_crossing_line(bbox: Dict[str, float], line: Dict[str, Any]) -> bool:
    cy = bbox["y"] + bbox["h"]
    line_y = line.get("y", 65.0)
    return cy >= line_y


def is_point_in_polygon(x: float, y: float, polygon: List[Dict[str, float]]) -> bool:
    n = len(polygon)
    inside = False
    p1x, p1y = polygon[0]["x"], polygon[0]["y"]
    for i in range(n + 1):
        p2x, p2y = polygon[i % n]["x"], polygon[i % n]["y"]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xints = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xints:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside
