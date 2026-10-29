FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies for OpenCV and Tesseract OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    tesseract-ocr \
    tesseract-ocr-eng \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements first (cached layer)
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy model download scripts and run them to fetch ONNX weights
COPY download_model.py /app/download_model.py
COPY download_helmet_model.py /app/download_helmet_model.py
COPY export_helmet_onnx.py /app/export_helmet_onnx.py

# Download license plate ONNX model from HuggingFace
RUN python download_model.py

# Download helmet .pt and export to ONNX
RUN python download_helmet_model.py

# Download base YOLOv8n model (auto-cached by ultralytics on first import)
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')" \
    && mkdir -p /app/models \
    && mv yolov8n.pt /app/models/yolov8n.pt 2>/dev/null || true

# Copy all source code
COPY backend/ /app/backend/
COPY ai/ /app/ai/
COPY frontend/ /app/frontend/

# Copy any remaining model config files (like .gitkeep)
COPY models/ /app/models/

# Create runtime directories
RUN mkdir -p /app/uploads /app/evidence

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
