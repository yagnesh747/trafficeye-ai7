# TrafficEye AI 🚦📸
> **AI-Powered Traffic Violation Detection, License Plate Recognition & E-Challan Management System (Engineering Prototype)**

[![Python 3.11](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110.0-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.14-EE4C2C?style=flat&logo=pytorch&logoColor=white)](https://pytorch.org)
[![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-1.17+-005CED?style=flat)](https://onnxruntime.ai)
[![YOLOv8](https://img.shields.io/badge/Ultralytics-YOLOv8-00FFFF?style=flat)](https://ultralytics.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

TrafficEye AI is a full-stack municipal traffic enforcement engineering prototype. Powered by genuine Computer Vision (YOLOv8 object detection, dedicated ONNX helmet detection, dedicated ONNX license plate localization, optical character recognition, and multi-frame IoU tracking), the system processes CCTV snapshots and video recordings to detect infractions, recognize license plates, assist operators with human-in-the-loop review, and manage digital citations.

> [!IMPORTANT]
> **DISCLAIMER: DEMO & PROTOTYPE ONLY**  
> TrafficEye AI is an engineering and research prototype. **No real government vehicle registries (e.g. VAHAN / Parivahan), online banking payment gateways, or live SMS gateways are connected.** All e-challan dispatching, citation notifications, citizen phone numbers, and payment settlements in this application are simulated demonstrations clearly designated as **`[DEMO]`**.

---

## 📌 Project Overview & Problem Statement

Urban traffic congestion and safety non-compliance—especially **riding without a helmet, triple riding on two-wheelers, wrong parking, and signal jumping**—pose serious road safety hazards. Manual policing is difficult to scale across major arterial roads and complex junctions.

**TrafficEye AI demonstrates an automated solution:**
1. **Edge Computer Vision Ingestion**: Ingests traffic snapshot images and video streams.
2. **Multi-Stage Real ML Pipeline**: Detects vehicles/riders, performs dedicated helmet classification, localizes license plates with ONNX models, and performs OCR plate recognition.
3. **Multi-Frame Video Tracking**: Tracks vehicles across sampled video frames using IoU tracking to eliminate duplicate counts and consolidate multi-frame evidence.
4. **Human-in-the-Loop Audit Center**: Provides officers with an interactive portal to inspect candidate violations, bounding boxes, plate crops, and edit OCR text before confirming citations.
5. **E-Challan Management Ledger [DEMO]**: Demonstrates statutory fine calculation (Motor Vehicles Act schedules) and digital citation workflows.

---

## ⚙️ System Architecture

```mermaid
graph TD
    A[CCTV Snapshots / MP4 Videos] --> B[FastAPI REST API Ingestion]
    B --> C[YOLOv8 Base Vehicle & Person Detector]
    B --> D[YOLOv8n ONNX Helmet Detector]
    C & D --> E[Violation Engine Rules & Association]
    E --> F[YOLOv8 ONNX License Plate Detector]
    F --> G[OpenCV Crop & OCR Engine]
    G --> H[SQLAlchemy DB - SQLite / PostgreSQL]
    H --> I[Officer Review & Audit Console]
    I -->|Confirm Violation| J[E-Challan Ledger Subsystem [DEMO]]
    J --> K[Simulated SMS & Payment Settlement [DEMO]]
```

---

## 🌟 Key Features

### 1. Computer Vision & ML Pipeline
- **Vehicle & Pedestrian Detection**: Real-time detection of cars, motorcycles, buses, trucks, and pedestrians using YOLOv8.
- **Genuine Helmet Detection**: Dedicated YOLOv8n ONNX model identifying `With Helmet` vs `Without Helmet` with genuine composite confidence scores.
- **Real Triple-Riding Detection**: Detects 3 or more persons associated with the same motorcycle based on spatial overlap and IoU bounds.
- **Dedicated License Plate Localization**: Verified YOLOv8 ONNX plate detector running inference over vehicle ROIs.
- **Optical Character Recognition (OCR)**: Extracts registration strings using PyTesseract / EasyOCR with regex normalization for Indian plate standards (e.g. `KA-03-AB-1234`).
- **Multi-Frame Video Tracking**: Lightweight IoU tracker (`ai/tracking/tracker.py`) preserving vehicle identity across sampled frames to deduplicate violations.

### 2. Officer Audit & Review Center
- Real-time display of detection bounding boxes, confidence values, plate crops, and violation tags.
- Human-in-the-loop review actions (`CONFIRM`, `REJECT`) with plate text correction.
- JWT-based authentication for enforcement officers.

### 3. E-Challan Ledger [DEMO]
- Automated fine schedule mapping (Motor Vehicles Act):
  - No Helmet: ₹500
  - Triple Riding: ₹1,000
  - Wrong Parking: ₹500
  - Signal Jumping: ₹1,000
- Simulated citation registry with status filtering (`Unpaid`, `Dispatched`, `Paid`).

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Backend Framework** | Python 3.11, FastAPI, Pydantic v2, Uvicorn |
| **Database & ORM** | SQLAlchemy, SQLite (default) / PostgreSQL compatible |
| **Authentication** | OAuth2 with JWT (python-jose, passlib bcrypt) |
| **Computer Vision** | OpenCV (Headless), Ultralytics YOLOv8, ONNX Runtime (CPU) |
| **OCR Engines** | PyTesseract, EasyOCR |
| **Frontend** | HTML5, Vanilla CSS3 (Dark Slate Theme), Modern ES6 JavaScript, Chart.js |
| **Testing** | Pytest, FastAPI TestClient |

---

## 🧠 Real Machine Learning Models & Licenses

All inference in TrafficEye AI runs on verified open-source models with verified SHA-256 integrity:

| Task | Model Source | Format | License | Location | SHA-256 Hash |
|---|---|---|---|---|---|
| **Base Vehicle / Person** | `ultralytics/yolov8n.pt` | PyTorch | AGPL-3.0 | Auto-cached | Official Ultralytics Weights |
| **License Plate Detection** | `ml-debi/yolov8-license-plate-detection` | ONNX | MIT | `models/plate/best.onnx` | `85d236280a1301ad98907947d284951dd2b20c23a6786ff50f7e6a8ec515bd50` |
| **Helmet Detection** | `iam-tsr/yolov8n-helmet-detection` | ONNX | MIT | `models/helmet/best.onnx` | `c692f7e08cf289fff0e0e9f2fe9131709bb8f6cbee15b51f80c06af5d4e32c76` |

Helper scripts to download/verify models:
- License Plate Model: `python download_model.py`
- Helmet Model: `python download_helmet_model.py` & `python export_helmet_onnx.py`

---

## 🔄 Workflows

### Image Analysis Workflow (`POST /api/analyze/image`)
1. User uploads image (`.jpg`, `.png`, `.webp`, `.bmp`).
2. Input validation verifies extension, size (<=15 MB), and filename safety.
3. Base YOLO detects vehicles and occupants.
4. Helmet ONNX model analyzes head/occupant regions for helmet wear.
5. Violation Engine evaluates rules (No Helmet, Triple Riding).
6. Plate ONNX model scans vehicle ROIs and crops detected plates.
7. OCR normalizes registration string or flags `NOT_DETECTED` / `UNREADABLE`.
8. Result stored in database and rendered in frontend with exact bounding boxes.

### Video Analysis Workflow (`POST /api/analyze/video`)
1. User uploads video (`.mp4`, `.avi`, `.mov`, `.mkv`).
2. File validated for allowed video extensions and size (<=100 MB).
3. OpenCV samples frames at user-specified interval (default: 1 frame every 15 frames).
4. For sampled frames, runs YOLO + helmet + plate detection pipeline.
5. `VehicleTracker` associates detections across frames using IoU tracking.
6. Multi-frame violations deduplicated per vehicle track ID.
7. Summary returned: processed frames count, total vehicles tracked, tracks list, deduplicated violations.

---

## 🚀 Installation & Setup

### 1. Prerequisites
- Python 3.11+
- Tesseract OCR installed on host system (if utilizing Tesseract engine)

### 2. Clone & Install Dependencies
```bash
# Clone the repository
git clone https://github.com/trafficeye-ai7/trafficeye-ai.git
cd trafficeye-ai

# Create and activate virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install backend dependencies
pip install -r backend/requirements.txt
```

### 3. Model Verification
Ensure verified ONNX models are present in their designated folders:
```bash
# Download and verify plate detection model
python download_model.py

# Download and export helmet detection model
python download_helmet_model.py
python export_helmet_onnx.py
```

### 4. Running the Backend Server
```bash
python -m uvicorn backend.app.main:app --reload --port 8000
```
- API Documentation (Swagger): [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Health Check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

### 5. Running the Frontend
The FastAPI backend serves the frontend static files at root:
- Access [http://127.0.0.1:8000](http://127.0.0.1:8000) directly in your browser.
- Alternatively, open `frontend/index.html` via any modern web browser or local HTTP server.

Default officer login credentials for review testing:
- **Admin**: `admin` / `admin123`
- **Operator**: `operator` / `operator123`

---

## 🔌 API Endpoints Reference

### Authentication
- `POST /api/auth/login`: Authenticate officer and receive JWT access token.
- `GET /api/auth/me`: Retrieve current logged-in officer profile.

### AI Detection & Analysis
- `POST /api/analyze/image`: Upload image or specify sample tag for multi-model violation analysis.
- `POST /api/analyze/video`: Upload traffic video for sampled frame analysis and vehicle tracking.
- `GET /api/detections`: List recent detection sessions.
- `GET /api/detections/{id}`: Retrieve detailed detection session by ID.

### Violation Review System
- `GET /api/violations`: Query violations with optional status (`PENDING_REVIEW`, `CONFIRMED`, `REJECTED`) and type filters.
- `GET /api/violations/{id}`: Retrieve individual violation details and evidence links.
- `POST /api/violations/{id}/confirm`: Confirm violation and generate citation in ledger.
- `POST /api/violations/{id}/reject`: Reject violation with optional reason.

### E-Challan Ledger [DEMO]
- `GET /api/challans`: Query generated citations by status or vehicle registration.
- `GET /api/challans/{id}`: Retrieve citation details.
- `POST /api/challans`: Issue manual citation.
- `POST /api/challans/{id}/pay`: Settle citation in demo ledger.

### Municipal Analytics Dashboard
- `GET /api/dashboard/metrics`: Real aggregate counts (today's violations, pending reviews, active cases, category distribution, hourly timeline).

---

## 🧪 Automated Testing

Run the comprehensive Pytest suite:
```bash
python -m pytest -v
```

**Test Suite Coverage (22 passed tests):**
- `backend/tests/test_api.py`: Health check, metrics, violations query, and image analysis endpoints.
- `backend/tests/test_helmet_detection.py`: Model SHA-256 integrity, runtime inference, empty image handling, rule engine with real helmet detections.
- `backend/tests/test_plate_detection.py`: License plate localization, empty image handling, OCR integration without fake fallbacks.
- `backend/tests/test_ocr.py`: Indian registration plate regex normalization and character correction.
- `backend/tests/test_video_processing.py`: IoU bounding box calculations, multi-frame vehicle tracking association, video endpoint frame processing.
- `backend/tests/test_violation_engine.py`: Triple riding association (single rider, 2 riders, 3+ riders, separate motorcycles isolation).

---

## ⚠️ Known Limitations

1. **Simulated External Services**:
   - VAHAN / Parivahan vehicle registration lookups are simulated for demonstration purposes.
   - Payment settlements and SMS notifications are simulated within the prototype and marked `[DEMO]`.
2. **Camera Angles & Severe Occlusion**:
   - Dense bumper-to-bumper occlusion or steep top-down CCTV camera angles can obstruct license plate visibility or rider heads.
3. **Hardware Acceleration**:
   - Models run on CPU by default via ONNX Runtime and PyTorch. For high-throughput production CCTV stream processing, GPU hardware acceleration (CUDA/TensorRT) is recommended.
4. **Static Geometric Zones**:
   - Signal jumping and wrong parking detection rely on camera calibration and defined ROI polygon coordinates.

---

## 📝 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.
