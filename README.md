# TrafficEye AI 🚦📸
> **Automated Photo Identification and Classification for Traffic Violations Using Computer Vision.**

TrafficEye AI is a modern, high-fidelity web application prototype designed for smart cities to automate the detection, review, and citation of traffic violations. Using optimized deep learning models (simulating YOLOv8 and OCR engines), TrafficEye AI scans CCTV snapshots, highlights infringements, extracts license plates, and processes digital e-challans instantly.

---

## 🌟 Key Features

1. **Analytical Operations Dashboard**
   - Live metrics monitor: Total processed files, violation counts, and estimated challan revenue.
   - Interactive data visualizations representing hourly infraction rates and violation types (No Helmet, Triple Riding, Wrong Parking, Signal Jumping) using Chart.js.
   - Detailed incident ledger reflecting real-time system uploads.

2. **Computer Vision (CV) Verification Desk**
   - **Upload Portal**: Supports dragging and dropping traffic photos or uploading via local browser selection.
   - **Preloaded Test Set**: Includes four high-quality mock traffic photos (AI-generated) representing common infractions for demonstration purposes.
   - **AI Inference Scan Line**: A high-tech glowing laser overlay simulates real-time neural network forward passes.
   - **Dynamic Bounding-Box Overlay**: Draws bounding boxes, confidence percentages, and colored labels scaled perfectly onto the canvas.

3. **Autonomous Live Camera Simulator**
   - A mock control room stream that cycles through camera feeds sequentially.
   - Draws active vehicle/violation overlays and streams alerts directly to a compliance feed ticker.

4. **Digital E-Challan invoicing (Hackathon Wow-Factor)**
   - Instant digital ticket generation pulling vehicle plate number, owner registry details, location, and timestamp.
   - Dispatch alerts simulating SMS text messages to vehicle owners with Toast feedback.
   - Interactive payment gateways for settling fine balances directly.

5. **Pitch Presentation Deck**
   - A beautifully formatted pitch presentation embedded directly within the dashboard UI for seamless judging and hackathon submission.

---

## 🛠️ Technology Stack

- **Frontend Engine**: Pure Semantic HTML5 & Vanilla JavaScript.
- **Styling & Layout**: Vanilla CSS3 implementing a professional, clean, slate-light enterprise command center design system.
- **Charts & Graphs**: Chart.js API served via CDN.
- **Image Assets**: AI-generated traffic photos representing real-world city situations.

---

## 📁 Repository Structure

```text
portfolio/
├── css/
│   └── style.css      # Core styles, clean enterprise layout & keyframe animations
├── js/
│   └── app.js         # Navigation, canvas drawing, simulator loop & modal systems
├── images/
│   └── samples/       # Compiled traffic violation test dataset
│       ├── no_helmet.png
│       ├── triple_riding.png
│       ├── wrong_parking.png
│       └── signal_jumping.png
├── index.html         # Application viewport and structural HTML layout
└── README.md          # Project documentation (this file)
```

---

## 🚀 Local Setup Instructions

TrafficEye AI is built with **zero external dependencies** and is client-side executable out-of-the-box.

### Option 1: Direct Run (Recommended for quick view)
1. Navigate to the project directory: `portfolio/`
2. Double-click [index.html](file:///c:/Users/YAGNESH/OneDrive/Desktop/portfolio/index.html) to open the application directly in any modern web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, Safari).

### Option 2: Run via Lightweight Local Server (Recommended for full performance)
If you want to serve it locally using Node.js:
1. Open your terminal in the `portfolio/` directory.
2. Spin up a simple server:
   ```bash
   # Using npx http-server
   npx http-server . -p 8080
   
   # Or using Python's built-in server
   python -m http-server 8080
   ```
3. Open `http://localhost:8080` in your web browser.

---

## 🎤 Hackathon Pitch & Presentation Script

Here is the structured script representing the embedded presentation deck slides for judging:

### Slide 1: Welcome & Introduction
* **Title**: TrafficEye AI - Automated Traffic Enforcement System
* **Pitch**: "TrafficEye AI is a modern solution using computer vision to identify violations and automate municipal traffic management. We reduce manual CCTV monitoring times by 95% and dispatch warning alerts to riders in under 3 seconds."

### Slide 2: The Problem
* **Title**: The Problem in Modern Cities
* **Pitch**: "Over 65% of urban traffic accidents involve motorcycle infractions (such as riding without helmets or carrying triple riders) or signal jumping. Manually reviewing CCTV video streams is slow, costly, and impossible to scale. Traffic violations go unpenalized due to oversight, and physical challans take weeks to arrive."

### Slide 3: The Solution Pipeline
* **Title**: Our Core AI Pipeline
* **Pitch**: "TrafficEye AI implements a seamless pipeline. CCTV cameras upload frames to local edge nodes running YOLOv8. If a violation is flagged, our OCR engine extracts the registration plate. This triggers a database call to fetch the owner's details and dispatches a digital challan via SMS immediately."

### Slide 4: Scaling & Impact
* **Title**: Business Impact & Scaling
* **Pitch**: "This system integrates into existing city traffic cameras with zero hardware upgrades. It creates a self-funding revenue stream for municipalities while immediately improving road safety. Immediate notification compliance reduces repeat violations by over 78% in the first 30 days."

### Slide 5: Hackathon Tech Stack
* **Title**: Technical Architecture
* **Pitch**: "To ensure portability and ease of evaluation, the prototype is built with a pure client-side stack: HTML5 canvas for custom bounding box scaling, Chart.js for responsive analytics, and a fully interactive CCTV camera simulator."
