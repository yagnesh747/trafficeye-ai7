# TrafficEye AI — Datasets & Model Training Guide

This document outlines legal dataset acquisition, annotation formats, and training workflows for customized computer vision models in TrafficEye.

---

## 1. Dataset Categories & Open Sources

### A. Helmet & Motorcycle Detection
- **Roboflow Universe (Public License Datasets)**:
  - *Helmet Detection Datasets*: Roboflow search for `helmet-detection` / `motorcycle-helmet`.
  - *Format*: YOLO v8 PyTorch format (`images/`, `labels/`, `data.yaml`).
- **Kaggle Datasets**:
  - *Hard Hat / Helmet Detection Dataset* (Open Database License).

### B. License Plate Detection (ALPR)
- **Indian Vehicle License Plate Dataset**:
  - Open datasets on Kaggle & Roboflow containing Indian registration format plates (e.g. `KA-03-MQ-4820`).
- **UFPR-ALPR**: Unconstrained License Plate Recognition dataset for academic research.

### C. Person & Traffic Signal Detection
- **COCO Dataset** (Common Objects in Context):
  - Pre-trained weights (`yolov8n.pt`, `yolov8s.pt`) natively include COCO classes:
    - Class `0`: `person`
    - Class `2`: `car`
    - Class `3`: `motorcycle`
    - Class `5`: `bus`
    - Class `7`: `truck`
    - Class `9`: `traffic light`

---

## 2. Dataset Folder Structure

When adding custom fine-tuning datasets, organize them as follows:

```
datasets/
├── helmet_detection/
│   ├── data.yaml
│   ├── train/
│   │   ├── images/
│   │   └── labels/
│   ├── valid/
│   │   ├── images/
│   │   └── labels/
│   └── test/
│       ├── images/
│       └── labels/
└── license_plates/
    ├── data.yaml
    └── ...
```

---

## 3. Training Script Example

To train a custom YOLO model on your dataset:

```python
from ultralytics import YOLO

# Load base model
model = YOLO('yolov8n.pt')

# Train on custom dataset
results = model.train(
    data='datasets/helmet_detection/data.yaml',
    epochs=50,
    imgsz=640,
    batch=16,
    device=0  # Use GPU 0 or 'cpu'
)

# Evaluate model performance
metrics = model.val()
print(f"mAP50-95: {metrics.box.map}")
print(f"mAP50: {metrics.box.map50}")
print(f"Precision: {metrics.box.mp}")
print(f"Recall: {metrics.box.mr}")

# Export weights to PyTorch / ONNX
model.export(format='onnx')
```

---

## 4. Evaluation Metrics Checklist

Always evaluate custom trained models before deploying to TrafficEye:
- **Precision**: Measure of false positive suppression.
- **Recall**: Measure of missed detections (false negatives).
- **mAP@0.5**: mean Average Precision at 0.5 IoU threshold.
- **F1 Score**: Harmonic mean of Precision and Recall.

*Note: In TrafficEye AI, all raw detection outputs require operator verification before an official citation is issued.*
