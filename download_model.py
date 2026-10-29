# download_model.py
"""Script to download the licensed YOLOv8 license plate detection ONNX model.
Verified model:
- Repository: https://huggingface.co/ml-debi/yolov8-license-plate-detection
- Model file: best.onnx
- SHA-256: 8062e8e86734e272c60fa9a819433327ebdb66d7
- License: MIT
- Classes: ['license_plate']
- Input size: 640x640 (standard YOLOv8)
"""
import hashlib
import os
import sys
import urllib.request

MODEL_URL = "https://huggingface.co/ml-debi/yolov8-license-plate-detection/resolve/main/best.onnx"
EXPECTED_SHA256 = "85d236280a1301ad98907947d284951dd2b20c23a6786ff50f7e6a8ec515bd50"

def sha256_of_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

def download_model(dest_dir: str):
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, "best.onnx")
    if os.path.isfile(dest_path):
        print(f"Model already exists at {dest_path}")
        current_hash = sha256_of_file(dest_path)
        if current_hash == EXPECTED_SHA256:
            print("Existing model checksum matches expected SHA-256.")
            return dest_path
        else:
            print("Checksum mismatch, re-downloading...")
    print(f"Downloading model from {MODEL_URL} ...")
    urllib.request.urlretrieve(MODEL_URL, dest_path)
    print("Download complete. Verifying checksum...")
    actual_hash = sha256_of_file(dest_path)
    if actual_hash != EXPECTED_SHA256:
        os.remove(dest_path)
        raise RuntimeError(f"SHA-256 mismatch: expected {EXPECTED_SHA256}, got {actual_hash}")
    print("Checksum verified. Model saved to", dest_path)
    return dest_path

if __name__ == "__main__":
    # Default destination: ./models/plate/
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "plate")
    try:
        download_model(dest)
    except Exception as e:
        print("Error downloading model:", e)
        sys.exit(1)
