import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

def test_health_endpoint():
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "online"
        assert data["system"] == "TrafficEye AI"

def test_dashboard_metrics_endpoint():
    with TestClient(app) as client:
        response = client.get("/api/dashboard/metrics")
        assert response.status_code == 200
        data = response.json()
        assert "violations_detected_today" in data
        assert "pending_reviews" in data
        assert "total_fines_levied" in data

def test_violations_list_endpoint():
    with TestClient(app) as client:
        # First trigger sample image analysis to guarantee DB has violations
        client.post("/api/analyze/image", data={"sample_tag": "no_helmet"})
        response = client.get("/api/violations")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

def test_sample_image_analysis():
    with TestClient(app) as client:
        response = client.post("/api/analyze/image", data={"sample_tag": "no_helmet"})
        assert response.status_code == 200
        data = response.json()
        assert "detection_uuid" in data
        assert "detections" in data
        assert isinstance(data["violations"], list)
