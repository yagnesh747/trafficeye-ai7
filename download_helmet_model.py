"""
download_helmet_model.py
Downloads iam-tsr/yolov8n-helmet-detection best.pt from HuggingFace,
verifies SHA-256, then exports to ONNX (640x640) using Ultralytics.
Must be run explicitly before starting the server.

Verified model source:
  Repository  : https://huggingface.co/iam-tsr/yolov8n-helmet-detection
  License     : MIT
  Model file  : best.pt  (LFS oid = c8eb324e365cf4faeab491d9cc301535ec745171b55e8b1acadea62be5101a9d)
  Classes     : 0=helmet, 1=no_helmet
  Architecture: YOLOv8n fine-tuned on Roboflow helmet-detection dataset

SHA-256 values:
  best.pt   : verified from HuggingFace LFS oid (64-char hex)
  best.onnx : computed after deterministic export and stored here for future verification

DO NOT import this at runtime. Run explicitly:
    python download_helmet_model.py
"""
import os
import sys
import hashlib
import urllib.request

# ── Source & destination ──────────────────────────────────────────────────────
PT_URL = (
    "https://huggingface.co/iam-tsr/yolov8n-helmet-detection"
    "/resolve/main/best.pt"
)
# SHA-256 of best.pt as recorded by HuggingFace LFS
EXPECTED_PT_SHA256 = "c8eb324e365cf4faeab491d9cc301535ec745171b55e8b1acadea62be5101a9d"

DEST_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "models", "helmet"
)
PT_PATH   = os.path.join(DEST_DIR, "best.pt")
ONNX_PATH = os.path.join(DEST_DIR, "best.onnx")


def sha256_of_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def download_pt():
    os.makedirs(DEST_DIR, exist_ok=True)
    if os.path.isfile(PT_PATH):
        print(f"[INFO] {PT_PATH} already exists. Verifying checksum ...")
        actual = sha256_of_file(PT_PATH)
        if actual == EXPECTED_PT_SHA256:
            print("[OK]   SHA-256 matches. Using cached file.")
            return
        else:
            print(f"[WARN] SHA-256 mismatch (got {actual}). Re-downloading ...")
            os.remove(PT_PATH)

    print(f"[INFO] Downloading {PT_URL} ...")
    urllib.request.urlretrieve(PT_URL, PT_PATH)
    print("[INFO] Download complete. Verifying checksum ...")
    actual = sha256_of_file(PT_PATH)
    if actual != EXPECTED_PT_SHA256:
        os.remove(PT_PATH)
        raise RuntimeError(
            f"SHA-256 mismatch for best.pt!\n"
            f"  expected: {EXPECTED_PT_SHA256}\n"
            f"  actual  : {actual}"
        )
    print(f"[OK]   SHA-256 verified: {actual}")


def export_to_onnx():
    if os.path.isfile(ONNX_PATH):
        print(f"[INFO] {ONNX_PATH} already exists. Computing its SHA-256 ...")
        onnx_sha = sha256_of_file(ONNX_PATH)
        print(f"[INFO] ONNX SHA-256: {onnx_sha}")
        return onnx_sha

    print("[INFO] Exporting best.pt -> best.onnx (imgsz=640, opset=17) ...")
    try:
        from ultralytics import YOLO
        model = YOLO(PT_PATH)
        # Export deterministically; dynamic=False for fixed [1,8,6300]-style output
        model.export(format="onnx", imgsz=640, opset=17, simplify=True, dynamic=False)
        # Ultralytics places the .onnx next to the .pt
        exported_path = PT_PATH.replace(".pt", ".onnx")
        if exported_path != ONNX_PATH and os.path.isfile(exported_path):
            os.rename(exported_path, ONNX_PATH)
        print(f"[OK]   Exported to {ONNX_PATH}")
    except Exception as e:
        raise RuntimeError(f"ONNX export failed: {e}")

    onnx_sha = sha256_of_file(ONNX_PATH)
    print(f"[INFO] ONNX SHA-256: {onnx_sha}")
    print(f"[INFO] Record this hash in ai/helmet_detection/detector.py -> EXPECTED_ONNX_SHA256")
    return onnx_sha


if __name__ == "__main__":
    try:
        download_pt()
        onnx_sha = export_to_onnx()

        # Print class names from the model so they are visible in output
        from ultralytics import YOLO
        model = YOLO(PT_PATH)
        print("[INFO] Class names:", model.names)

        print("\n[SUMMARY]")
        print(f"  PT  path  : {PT_PATH}")
        print(f"  ONNX path : {ONNX_PATH}")
        print(f"  ONNX SHA  : {onnx_sha}")
        print("\nPaste ONNX SHA into detector.py -> EXPECTED_ONNX_SHA256")
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)
