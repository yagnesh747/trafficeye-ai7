"""
ai/tracking/tracker.py

Lightweight IoU & spatial tracker for traffic video analysis.
Tracks vehicles (motorcycles, cars, etc.) across sampled frames to prevent
duplicate violation events and ensure consistent evidence gathering.
"""
from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple

from ai.detection.yolo_service import DetectionResult
from ai.violation_engine.rules import DetectedViolation


def calculate_iou(box1: Tuple[float, float, float, float], box2: Tuple[float, float, float, float]) -> float:
    """
    Compute Intersection over Union (IoU) of two bounding boxes in (x, y, w, h) format.
    Coordinates can be percentage or pixel values.
    """
    x1, y1, w1, h1 = box1
    x2, y2, w2, h2 = box2

    b1_x2, b1_y2 = x1 + w1, y1 + h1
    b2_x2, b2_y2 = x2 + w2, y2 + h2

    inter_x1 = max(x1, x2)
    inter_y1 = max(y1, y2)
    inter_x2 = min(b1_x2, b2_x2)
    inter_y2 = min(b1_y2, b2_y2)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area1 = max(0.0, w1 * h1)
    area2 = max(0.0, w2 * h2)
    union_area = area1 + area2 - inter_area

    if union_area <= 0:
        return 0.0
    return inter_area / union_area


@dataclass
class TrackObservation:
    frame_idx: int
    bbox_pct: Tuple[float, float, float, float]
    bbox_px: Tuple[int, int, int, int]
    confidence: float
    violations: List[DetectedViolation] = field(default_factory=list)
    plate_text: Optional[str] = None
    plate_confidence: float = 0.0
    plate_crop: Optional[np.ndarray] = None
    frame_img: Optional[np.ndarray] = None
    annotated_frame: Optional[np.ndarray] = None


class VehicleTrack:
    def __init__(self, track_id: int, initial_det: DetectionResult, frame_idx: int, frame_shape: Tuple[int, int]):
        self.track_id = track_id
        self.class_name = initial_det.class_name
        self.class_id = initial_det.class_id
        self.last_bbox_pct = initial_det.bbox  # (x, y, w, h) in %
        self.hits = 0
        self.time_since_update = 0
        self.observations: List[TrackObservation] = []

    def update(
        self,
        det: DetectionResult,
        frame_idx: int,
        frame_img: np.ndarray,
        annotated_img: Optional[np.ndarray] = None,
        violations: Optional[List[DetectedViolation]] = None,
        plate_text: Optional[str] = None,
        plate_conf: float = 0.0,
        plate_crop: Optional[np.ndarray] = None,
    ) -> None:
        self.last_bbox_pct = det.bbox
        self.hits += 1
        self.time_since_update = 0

        h, w = frame_img.shape[:2]
        bx, by, bw, bh = det.bbox
        x1 = int((bx / 100.0) * w)
        y1 = int((by / 100.0) * h)
        x2 = int(((bx + bw) / 100.0) * w)
        y2 = int(((by + bh) / 100.0) * h)

        obs = TrackObservation(
            frame_idx=frame_idx,
            bbox_pct=det.bbox,
            bbox_px=(x1, y1, x2, y2),
            confidence=det.confidence,
            violations=violations or [],
            plate_text=plate_text,
            plate_confidence=plate_conf,
            plate_crop=plate_crop,
            frame_img=frame_img,
            annotated_frame=annotated_img,
        )
        self.observations.append(obs)

    def mark_missed(self) -> None:
        self.time_since_update += 1

    def get_best_observation_for_violation(self, violation_type: str) -> Optional[TrackObservation]:
        """Find the observation where the specified violation had the highest confidence."""
        matching = []
        for obs in self.observations:
            for v in obs.violations:
                v_type_str = v.violation_type.value if hasattr(v.violation_type, "value") else str(v.violation_type)
                if v_type_str == violation_type:
                    matching.append((v.confidence, obs))
        if not matching:
            return None
        matching.sort(key=lambda x: x[0], reverse=True)
        return matching[0][1]

    def get_best_plate_observation(self) -> Optional[TrackObservation]:
        """Find the observation with the highest plate OCR confidence."""
        plate_obs = [obs for obs in self.observations if obs.plate_text and obs.plate_confidence > 0]
        if not plate_obs:
            return None
        return max(plate_obs, key=lambda o: o.plate_confidence)


class VehicleTracker:
    """
    Lightweight online spatial tracker.
    Associates vehicle detections across video frames using IoU matching.
    """
    def __init__(self, iou_threshold: float = 0.25, max_age: int = 3):
        self.iou_threshold = iou_threshold
        self.max_age = max_age
        self.next_track_id = 1
        self.active_tracks: List[VehicleTrack] = []
        self.all_tracks: List[VehicleTrack] = []

    def update_frame(
        self,
        vehicle_detections: List[DetectionResult],
        frame_idx: int,
        frame_img: np.ndarray,
    ) -> List[Tuple[VehicleTrack, DetectionResult]]:
        """
        Match vehicle detections in the current frame to existing active tracks.
        Returns list of (track, matched_detection).
        """
        matched_pairs: List[Tuple[VehicleTrack, DetectionResult]] = []
        unmatched_detections = list(vehicle_detections)

        if self.active_tracks and vehicle_detections:
            # Build IoU cost matrix
            ious = np.zeros((len(self.active_tracks), len(vehicle_detections)), dtype=np.float32)
            for i, track in enumerate(self.active_tracks):
                for j, det in enumerate(vehicle_detections):
                    if track.class_name == det.class_name:
                        ious[i, j] = calculate_iou(track.last_bbox_pct, det.bbox)
                    else:
                        ious[i, j] = 0.0

            matched_track_indices = set()
            matched_det_indices = set()

            # Greedy matching by highest IoU
            while True:
                if len(matched_track_indices) == len(self.active_tracks):
                    break
                if len(matched_det_indices) == len(vehicle_detections):
                    break

                best_idx = np.unravel_index(np.argmax(ious), ious.shape)
                best_iou = ious[best_idx]

                if best_iou < self.iou_threshold:
                    break

                t_idx, d_idx = int(best_idx[0]), int(best_idx[1])
                matched_pairs.append((self.active_tracks[t_idx], vehicle_detections[d_idx]))
                matched_track_indices.add(t_idx)
                matched_det_indices.add(d_idx)

                # Clear rows and cols
                ious[t_idx, :] = -1.0
                ious[:, d_idx] = -1.0

            unmatched_detections = [
                d for idx, d in enumerate(vehicle_detections) if idx not in matched_det_indices
            ]

            # Mark unmatched active tracks as missed
            for idx, track in enumerate(self.active_tracks):
                if idx not in matched_track_indices:
                    track.mark_missed()
        else:
            for track in self.active_tracks:
                track.mark_missed()

        # Create new tracks for unmatched detections
        h, w = frame_img.shape[:2]
        for det in unmatched_detections:
            new_track = VehicleTrack(
                track_id=self.next_track_id,
                initial_det=det,
                frame_idx=frame_idx,
                frame_shape=(h, w)
            )
            self.next_track_id += 1
            self.active_tracks.append(new_track)
            self.all_tracks.append(new_track)
            matched_pairs.append((new_track, det))

        # Remove dead tracks that exceeded max_age
        self.active_tracks = [t for t in self.active_tracks if t.time_since_update <= self.max_age]

        return matched_pairs
