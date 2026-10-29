"""
export_helmet_onnx.py
Exports models/helmet/best.pt to models/helmet/best.onnx
using torch.onnx.export directly — avoids Ultralytics pip auto-install and
the Windows MAX_PATH issue with the onnx test data directory.

Run ONCE before starting the server:
    python export_helmet_onnx.py
"""
import os
import sys
import hashlib

DEST_DIR  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "helmet")
PT_PATH   = os.path.join(DEST_DIR, "best.pt")
ONNX_PATH = os.path.join(DEST_DIR, "best.onnx")

EXPECTED_PT_SHA256 = "c8eb324e365cf4faeab491d9cc301535ec745171b55e8b1acadea62be5101a9d"


def sha256_of_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    # 1. Verify .pt file
    if not os.path.isfile(PT_PATH):
        sys.exit(f"ERROR: {PT_PATH} not found. Run download_helmet_model.py first.")
    actual_pt_sha = sha256_of_file(PT_PATH)
    if actual_pt_sha != EXPECTED_PT_SHA256:
        sys.exit(f"ERROR: best.pt SHA-256 mismatch!\n  expected: {EXPECTED_PT_SHA256}\n  actual:   {actual_pt_sha}")
    print(f"[OK] best.pt SHA-256 verified: {actual_pt_sha}")

    if os.path.isfile(ONNX_PATH):
        onnx_sha = sha256_of_file(ONNX_PATH)
        print(f"[OK] best.onnx already exists. SHA-256: {onnx_sha}")
        print(f"[INFO] Model classes from existing ONNX will be read by detector.py at runtime.")
        return onnx_sha

    # 2. Load model with torch
    print("[INFO] Loading model with torch ...")
    import torch
    from ultralytics import YOLO

    model = YOLO(PT_PATH)
    print(f"[INFO] Model class names: {model.names}")
    torch_model = model.model
    torch_model.eval()

    # 3. Export with torch.onnx (bypasses Ultralytics auto-install)
    print("[INFO] Exporting to ONNX via torch.onnx.export ...")
    dummy = torch.zeros(1, 3, 640, 640)
    try:
        torch.onnx.export(
            torch_model,
            dummy,
            ONNX_PATH,
            opset_version=17,
            input_names=["images"],
            output_names=["output0"],
            dynamic_axes=None,
        )
        print(f"[OK] Exported to {ONNX_PATH}")
    except Exception as e:
        sys.exit(f"ERROR: torch.onnx.export failed: {e}")

    onnx_sha = sha256_of_file(ONNX_PATH)
    print(f"[INFO] ONNX SHA-256: {onnx_sha}")
    print(f"[ACTION] Paste this SHA into ai/helmet_detection/detector.py -> EXPECTED_ONNX_SHA256")
    print(f"[INFO]   Class names: {model.names}")
    return onnx_sha


if __name__ == "__main__":
    sha = main()
    print(f"\nONNX SHA-256: {sha}")
