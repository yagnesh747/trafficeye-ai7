import sys
import os

# Add repository root to Python path for serverless environment
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.app.main import app

# Vercel serverless ASGI application entrypoint
handler = app
