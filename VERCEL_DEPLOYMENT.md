# TrafficEye AI — Vercel Deployment Guide

TrafficEye AI is fully configured and optimized for direct deployment to **Vercel** with a unified serverless architecture (Static Frontend on Vercel Edge CDN + FastAPI ML/Backend on Vercel Serverless Functions).

---

## 🚀 Quick Deployment Methods

### Method 1: Deploy via GitHub (Recommended)

1. **Commit and Push your project to GitHub**:
   ```bash
   git add .
   git commit -m "Configure project for Vercel deployment and fix all errors"
   git push origin main
   ```

2. **Import into Vercel**:
   - Go to [Vercel Dashboard](https://vercel.com/new).
   - Select your GitHub repository (`trafficeye`).
   - Leave the default settings:
     - **Framework Preset**: `Other`
     - **Root Directory**: `./` (default)
     - **Build Command**: *(leave empty)*
     - **Output Directory**: *(leave empty)*
   - Click **Deploy**.

3. **Done!** Vercel will:
   - Detect `requirements.txt` and install Python dependencies.
   - Detect `api/index.py` and build the FastAPI Serverless Function.
   - Deploy `frontend/` static assets directly to Vercel's global CDN.
   - Apply routing rules defined in `vercel.json`.

---

### Method 2: Deploy via Vercel CLI

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel --prod
   ```

---

## ⚙️ Architecture & Features Configured for Vercel

| Component | Local Development | Vercel Serverless Production |
|---|---|---|
| **Frontend** | StaticFiles mounted at `/` | Vercel Edge CDN rewrites to `/frontend/` |
| **API Endpoints** | FastAPI at `/api/*` | `@vercel/python` Serverless at `api/index.py` |
| **Database** | `sqlite:///./trafficeye.db` | Auto-copied to writable `/tmp/trafficeye.db` on cold start |
| **Evidence & Images** | `evidence/` directory | Multi-tier resolution (`/tmp` -> repo assets -> sample fallbacks) + Base64 payload |
| **Model Inference** | Local YOLO / ONNX | ONNXRuntime + resilient CPU heuristic fallback |

---

## 🔑 Default Enforcement Accounts

- **Admin Account**:
  - Username: `admin`
  - Password: `admin123`
- **Operator Account**:
  - Username: `operator`
  - Password: `operator123`

---

## 🛠️ Verification & Health Checks

Once deployed, you can verify your live URL:
- **Web App**: `https://<your-project>.vercel.app/`
- **Health Check**: `https://<your-project>.vercel.app/health`
- **API Metrics**: `https://<your-project>.vercel.app/api/dashboard/metrics`
- **Challans Ledger**: `https://<your-project>.vercel.app/api/challans`
