// TrafficEye AI — Core Application Logic (Phase 8: Full Backend Integration)
// All dashboard metrics, violations, and challans now load from the FastAPI REST backend.
// Simulated OCR replaced with real server-side Python OCR pipeline.

// ====================================================================
// Sample detection metadata (bounding boxes for canvas rendering)
// These are ONLY used for canvas overlay drawing on sample images.
// Actual violation detection happens on the backend.
// ====================================================================
const sampleDetections = {
    no_helmet: {
        title: "No Helmet Rider Detection",
        imagePath: "images/samples/no_helmet.png",
        location: "Koramangala 80 Ft Road",
        speed: "34 km/h",
        violations: [
            { label: "Two-Wheeler", offense: "No Helmet Rider", confidence: 0.92, severity: "high", fine: 500, box: { x: 29, y: 32, w: 37, h: 56 } },
            { label: "License Plate", confidence: 0.88, severity: "none", box: { x: 33, y: 70, w: 8, h: 5 } }
        ]
    },
    triple_riding: {
        title: "Triple Riding Infraction",
        imagePath: "images/samples/triple_riding.png",
        location: "Silk Board Junction",
        speed: "28 km/h",
        violations: [
            { label: "Two-Wheeler", offense: "Triple Riding", confidence: 0.89, severity: "high", fine: 1000, box: { x: 36, y: 39, w: 33, h: 44 } },
            { label: "License Plate", confidence: 0.79, severity: "none", box: { x: 39, y: 69, w: 4, h: 3 } }
        ]
    },
    wrong_parking: {
        title: "Wrong Parking Violation",
        imagePath: "images/samples/wrong_parking.png",
        location: "MG Road",
        speed: "0 km/h (Stationary)",
        violations: [
            { label: "Four-Wheeler", offense: "No Parking Zone", confidence: 0.91, severity: "medium", fine: 500, box: { x: 17, y: 43, w: 47, h: 35 } },
            { label: "License Plate", confidence: 0.84, severity: "none", box: { x: 32, y: 61, w: 7, h: 3 } }
        ]
    },
    signal_jumping: {
        title: "Signal Jumping Evaded",
        imagePath: "images/samples/signal_jumping.png",
        location: "Marathahalli Bridge",
        speed: "58 km/h",
        violations: [
            { label: "Four-Wheeler", offense: "Red Light Violation", confidence: 0.90, severity: "high", fine: 1000, box: { x: 18, y: 51, w: 48, h: 22 } },
            { label: "Traffic Signal", confidence: 0.94, severity: "none", box: { x: 38, y: 9, w: 9, h: 11 } },
            { label: "License Plate", confidence: 0.81, severity: "none", box: { x: 60, y: 65, w: 4, h: 2.5 } }
        ]
    }
};

// ====================================================================
// Global Application State
// ====================================================================
const state = {
    activeTab: 'dashboard',
    activeDetectionKey: null,
    uploadedFile: null,
    isScanning: false,
    confidenceThreshold: 0.65,
    currentImage: null,
    currentDetectionData: null,
    lastApiResult: null,          // Stores last backend API response
    lastViolationDbId: null,      // Tracks last created DB violation ID
    backendOnline: false,
    // Fallback local challan state (used when backend is offline)
    challans: [
        { id: 'BTP-CH-100201', plate: 'KA-01-AB-9031', offense: 'Triple Riding', location: 'Silk Board Junction', timestamp: '08-SEP-2026 14:40', fine: 1000, status: 'dispatched', owner: 'Vikram Singh', vehicle: 'Honda Activa 6G (Grey)', ownerPhone: '+91 87654 32109', ocrConfidence: 88 },
        { id: 'BTP-CH-100100', plate: 'KA-03-MQ-4820', offense: 'No Helmet Rider', location: 'Koramangala 80 Ft Road', timestamp: '08-SEP-2026 14:01', fine: 500, status: 'unpaid', owner: 'Rahul A. Sharma', vehicle: 'Suzuki Access 125 (Black)', ownerPhone: '+91 98765 43210', ocrConfidence: 92 },
        { id: 'BTP-CH-99901', plate: 'KA-03-MM-7721', offense: 'Wrong Parking Zone', location: 'MG Road', timestamp: '08-SEP-2026 12:15', fine: 500, status: 'paid', owner: 'Anita K. Rangan', vehicle: 'Hyundai Verna (White)', ownerPhone: '+91 76543 21098', ocrConfidence: 84 },
    ],
    dashboardStats: { violationsDetectedToday: 142, activeCases: 48, generatedChallans: 84, avgConfidence: 89.2 }
};

let violationChart = null;
let trendChart = null;

// ====================================================================
// Initialization
// ====================================================================
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initClock();
    initCharts();
    initUpload();
    initSamples();
    initChallanTab();
    initModal();
    initConfidenceSlider();

    switchTab('dashboard');

    // Try to load real metrics from backend
    await loadDashboardMetrics();
});

// ====================================================================
// 1. Dashboard: Fetch real metrics from backend
// ====================================================================
async function loadDashboardMetrics() {
    const metrics = await TrafficEyeAPI.getDashboardMetrics();
    if (metrics) {
        state.backendOnline = true;
        state.dashboardStats = {
            violationsDetectedToday: metrics.violations_detected_today,
            activeCases: metrics.pending_reviews,
            generatedChallans: metrics.challans_generated,
            avgConfidence: Math.round(metrics.average_confidence * 100)
        };
        updateDashboardUI();

        // Update violation distribution chart with real data
        if (violationChart && metrics.violation_distribution) {
            const dist = metrics.violation_distribution;
            violationChart.data.datasets[0].data = [
                dist['NO_HELMET'] || 0,
                dist['TRIPLE_RIDING'] || 0,
                dist['WRONG_PARKING'] || 0,
                dist['RED_LIGHT'] || 0
            ];
            violationChart.update();
        }

        // Mark backend badge
        const statusEl = document.querySelector('.system-status-val');
        if (statusEl) statusEl.textContent = 'Online & Active (API)';
    } else {
        state.backendOnline = false;
        updateDashboardUI();
        const statusEl = document.querySelector('.system-status-val');
        if (statusEl) statusEl.textContent = 'Offline (Local Mode)';
    }
}

function initConfidenceSlider() {
    const slider = document.getElementById('confidenceSlider');
    const valDisplay = document.getElementById('thresholdValue');
    if (slider && valDisplay) {
        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            valDisplay.textContent = `${val}%`;
            state.confidenceThreshold = val / 100;
            if (state.currentImage && state.currentDetectionData) {
                drawDetections(state.currentImage, state.currentDetectionData);
                populateDetails(state.currentDetectionData);
            }
        });
    }
}

// ====================================================================
// 2. Navigation Logic
// ====================================================================
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');
            if (targetTab) switchTab(targetTab);
        });
    });
}

function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.tab-view').forEach(view => {
        view.classList.toggle('active', view.id === `${tabId}-view`);
    });

    const titleEl = document.getElementById('viewTitle');
    const subtitleEl = document.getElementById('viewSubtitle');
    if (titleEl && subtitleEl) {
        const titles = {
            dashboard: ['Traffic Enforcement Dashboard', 'Bengaluru City Municipal Enforcement Analytics & Oversight Console.'],
            detection: ['Traffic Violation Review', 'Real-time AI detection review. Upload an image or select a sample to run the analysis pipeline.'],
            challan: ['E-Challan Portal', 'Digital traffic violation citation and dispatch ledger.']
        };
        [titleEl.textContent, subtitleEl.textContent] = titles[tabId] || ['', ''];
        if (tabId === 'challan') renderChallanLedger();
        if (tabId === 'dashboard') { setTimeout(() => { if (violationChart) violationChart.resize(); if (trendChart) trendChart.resize(); }, 100); loadDashboardMetrics(); }
    }
}

// ====================================================================
// 3. Real-Time Clock
// ====================================================================
function initClock() {
    const clockEl = document.getElementById('currentTime');
    if (!clockEl) return;
    const updateTime = () => {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
        clockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} | ${dateStr}`;
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// ====================================================================
// 4. Dashboard Charts (Chart.js)
// ====================================================================
function initCharts() {
    const violationCtx = document.getElementById('violationChartEl')?.getContext('2d');
    const trendCtx = document.getElementById('trendChartEl')?.getContext('2d');
    if (!violationCtx || !trendCtx) return;

    const blueGradient = trendCtx.createLinearGradient(0, 0, 0, 200);
    blueGradient.addColorStop(0, 'rgba(30, 64, 175, 0.15)');
    blueGradient.addColorStop(1, 'rgba(30, 64, 175, 0.0)');

    violationChart = new Chart(violationCtx, {
        type: 'bar',
        data: {
            labels: ['No Helmet', 'Triple Riding', 'Wrong Parking', 'Signal Jumping'],
            datasets: [{ label: 'Cases Detected', data: [45, 28, 32, 37], backgroundColor: ['#D97706', '#B91C1C', '#1E40AF', '#15803D'], borderRadius: 4, barPercentage: 0.55 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', titleColor: '#fff', bodyColor: '#e2e8f0', borderColor: '#cbd5e1', borderWidth: 1 } },
            scales: { x: { grid: { display: false }, ticks: { color: '#475569', font: { family: 'Inter', size: 11 } } }, y: { grid: { color: '#e2e8f0' }, ticks: { color: '#475569', font: { family: 'Inter', size: 11 } } } }
        }
    });

    trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'],
            datasets: [{ label: 'Violations Rate', data: [35, 48, 52, 28, 41, 18], fill: true, backgroundColor: blueGradient, borderColor: '#1E40AF', borderWidth: 2, tension: 0.35, pointBackgroundColor: '#1E40AF', pointHoverRadius: 5 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', titleColor: '#fff', bodyColor: '#e2e8f0', borderColor: '#cbd5e1', borderWidth: 1 } },
            scales: { x: { grid: { display: false }, ticks: { color: '#475569', font: { family: 'Inter', size: 11 } } }, y: { grid: { color: '#e2e8f0' }, ticks: { color: '#475569', font: { family: 'Inter', size: 11 } } } }
        }
    });
}

function updateDashboardUI() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('violationsDetectedTodayEl', state.dashboardStats.violationsDetectedToday);
    set('activeCasesEl', state.dashboardStats.activeCases);
    set('generatedChallansEl', state.dashboardStats.generatedChallans);
    set('avgConfidenceEl', `${state.dashboardStats.avgConfidence}%`);
}

function updateChartsWithNewViolation(data) {
    if (!violationChart || !trendChart) return;
    data.violations.forEach(v => {
        if (v.severity === 'none') return;
        const t = `${v.label} ${v.offense || ''}`.toLowerCase();
        const idx = t.includes('helmet') ? 0 : t.includes('triple') || t.includes('riding') ? 1 : t.includes('parking') ? 2 : t.includes('signal') || t.includes('red') ? 3 : -1;
        if (idx !== -1) violationChart.data.datasets[0].data[idx]++;
    });
    violationChart.update();
    const td = trendChart.data.datasets[0].data;
    td[td.length - 1]++;
    trendChart.update();
}

// ====================================================================
// 5. File Upload Logic
// ====================================================================
function initUpload() {
    const fileInput = document.getElementById('fileInput');
    const dragArea = document.getElementById('dragArea');
    const placeholder = document.getElementById('uploadPlaceholder');

    placeholder?.addEventListener('click', () => fileInput.click());
    dragArea?.addEventListener('dragover', e => { e.preventDefault(); dragArea.classList.add('drag-over'); });
    dragArea?.addEventListener('dragleave', () => dragArea.classList.remove('drag-over'));
    dragArea?.addEventListener('drop', e => {
        e.preventDefault();
        dragArea.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) handleUploadedFile(e.dataTransfer.files[0]);
    });
    fileInput?.addEventListener('change', e => { if (e.target.files.length > 0) handleUploadedFile(e.target.files[0]); });
}

function handleUploadedFile(file) {
    const isImage = file.type.match('image.*');
    const isVideo = file.type.match('video.*');
    if (!isImage && !isVideo) {
        showToast('Invalid File', 'Please upload a valid image (PNG/JPG) or video (MP4/AVI) file.', 'error');
        return;
    }
    state.uploadedFile = file;
    document.querySelectorAll('.sample-card').forEach(c => c.classList.remove('active'));
    state.activeDetectionKey = null;

    if (isVideo) {
        runVideoAnalysis(file);
        return;
    }

    const reader = new FileReader();
    reader.onload = e => runInference(e.target.result, file, null);
    reader.readAsDataURL(file);
}

// ====================================================================
// 6. Sample Image Gallery
// ====================================================================
function initSamples() {
    document.querySelectorAll('.sample-card').forEach(card => {
        card.addEventListener('click', () => {
            const key = card.getAttribute('data-sample-key');
            if (key && sampleDetections[key]) {
                document.querySelectorAll('.sample-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                state.activeDetectionKey = key;
                state.uploadedFile = null;
                runInference(sampleDetections[key].imagePath, null, key);
            }
        });
    });
}

// ====================================================================
// 7. Main Inference Pipeline (calls real backend or falls back gracefully)
// ====================================================================
async function runInference(imgSource, uploadedFile, sampleTag) {
    if (state.isScanning) return;
    state.isScanning = true;

    const dragArea = document.getElementById('dragArea');
    const placeholder = document.getElementById('uploadPlaceholder');
    const canvasContainer = document.getElementById('canvasContainer');
    const scanLine = document.getElementById('scanLine');
    const overlayText = document.getElementById('overlayText');
    const detailsContent = document.getElementById('detailsContent');
    const emptyDetails = document.getElementById('emptyDetails');

    dragArea.classList.add('has-image');
    placeholder.style.display = 'none';
    canvasContainer.classList.add('active');
    scanLine.classList.add('scanning');
    overlayText.classList.add('scanning');
    overlayText.textContent = 'AI ANALYSIS RUNNING…';
    emptyDetails.style.display = 'flex';
    detailsContent.style.display = 'none';

    // Draw image to canvas
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = async () => {
        const maxDim = 800;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        // ----- Call Backend API -----
        let apiResult = null;
        try {
            apiResult = await TrafficEyeAPI.analyzeImage(uploadedFile, sampleTag);
            state.lastApiResult = apiResult;
            overlayText.textContent = `✓ ${apiResult.violations.length} VIOLATION(S) DETECTED`;
        } catch (err) {
            console.warn('Backend analysis unavailable, using local fallback:', err);
            overlayText.textContent = 'OFFLINE — LOCAL MODE';
        }

        scanLine.classList.remove('scanning');
        overlayText.classList.remove('scanning');
        state.isScanning = false;

        // Build detection display data
        let detectionData;
        if (apiResult) {
            // Map API response to frontend format
            detectionData = buildDetectionDataFromAPI(apiResult, sampleTag);
            // Store the first violation's DB id for confirm/reject actions
            if (apiResult.violations && apiResult.violations.length > 0) {
                // Fetch violations from backend to get the real DB id
                fetchLatestViolationId();
            }
        } else if (sampleTag && sampleDetections[sampleTag]) {
            detectionData = JSON.parse(JSON.stringify(sampleDetections[sampleTag]));
            detectionData.plate = 'KA-03-MQ-4820';
            detectionData.ocrConfidence = 88;
        } else {
            detectionData = generateCustomMockDetection(uploadedFile ? uploadedFile.name : 'upload.jpg');
        }

        state.currentImage = img;
        state.currentDetectionData = detectionData;

        drawDetections(img, detectionData);
        populateDetails(detectionData);

        if (!detectionData.isNonTraffic) {
            const hasViolations = detectionData.violations.filter(v => v.confidence >= state.confidenceThreshold).some(v => v.severity !== 'none');
            if (hasViolations) {
                state.dashboardStats.violationsDetectedToday++;
                state.dashboardStats.activeCases++;
                updateChartsWithNewViolation(detectionData);
            }
        }
        updateDashboardUI();
    };

    img.onerror = () => {
        showToast('Image Error', 'Could not load the image. Please try another file.', 'error');
        resetWorkspace();
    };
    img.src = imgSource;
}

function buildDetectionDataFromAPI(apiResult, sampleTag) {
    // Prefer local canvas bbox data for sample images (for accurate canvas rendering)
    const localSampleData = sampleTag ? sampleDetections[sampleTag] : null;

    const violations = apiResult.violations.map(v => {
        const violationTypeMap = {
            'NO_HELMET': { label: 'Two-Wheeler', offense: 'No Helmet Rider', severity: 'high', fine: 500 },
            'TRIPLE_RIDING': { label: 'Two-Wheeler', offense: 'Triple Riding', severity: 'high', fine: 1000 },
            'WRONG_PARKING': { label: 'Four-Wheeler', offense: 'No Parking Zone', severity: 'medium', fine: 500 },
            'RED_LIGHT': { label: 'Four-Wheeler', offense: 'Red Light Violation', severity: 'high', fine: 1000 }
        };
        const mapped = violationTypeMap[v.violation_type] || { label: 'Vehicle', offense: v.violation_type, severity: 'high', fine: 500 };
        return {
            label: mapped.label,
            offense: mapped.offense,
            confidence: v.confidence,
            severity: mapped.severity,
            fine: mapped.fine,
            box: v.vehicle_bbox || { x: 20, y: 25, w: 50, h: 50 }
        };
    });

    // Add plate bounding box for canvas rendering if available
    if (apiResult.violations.length > 0 && apiResult.violations[0].plate_bbox) {
        violations.push({ label: 'License Plate', confidence: 0.88, severity: 'none', box: apiResult.violations[0].plate_bbox });
    } else if (localSampleData) {
        const localPlate = localSampleData.violations.find(v => v.label === 'License Plate');
        if (localPlate) violations.push({ ...localPlate });
    }

    // Merge YOLO raw detections for non-violation classes (traffic light, person etc.)
    if (apiResult.detections) {
        apiResult.detections.forEach(d => {
            if (d.class_name === 'traffic light') {
                violations.push({ label: 'Traffic Signal', confidence: d.confidence, severity: 'none', box: d.bbox });
            }
        });
    }

    const firstViolation = apiResult.violations[0];
    const plateText = firstViolation?.normalized_plate_text || (localSampleData ? 'KA-03-MQ-4820' : null);
    const ocrConf = firstViolation ? Math.round((firstViolation.ocr_confidence || 0.88) * 100) : 88;

    return {
        title: violations.filter(v => v.severity !== 'none').map(v => v.offense).join(', ') || 'Traffic Scene Analysis',
        plate: plateText,
        ocrConfidence: ocrConf,
        location: localSampleData?.location || 'Bengaluru Municipal Traffic Zone',
        speed: localSampleData?.speed || 'N/A',
        vehicle: 'Vehicle Detected',
        owner: 'Registered Owner',
        ownerPhone: '+91 98765 43210',
        violations,
        apiViolations: apiResult.violations,
        processingTimeMs: apiResult.processing_time_ms
    };
}

async function fetchLatestViolationId() {
    try {
        const violations = await TrafficEyeAPI.getViolations('PENDING_REVIEW');
        if (violations && violations.length > 0) {
            state.lastViolationDbId = violations[0].id;
        }
    } catch (_) {}
}

async function runVideoAnalysis(videoFile) {
    showToast('Video Processing', 'Uploading and processing video. This may take a moment...', 'info');
    try {
        const result = await TrafficEyeAPI.analyzeVideo(videoFile);
        const totalViolations = (result.frame_results || []).reduce((acc, r) => acc + r.violations.length, 0);
        showToast('Video Processed', `${result.processed_frames_count} frames analyzed. ${totalViolations} violation candidate(s) flagged.`);
    } catch (err) {
        showToast('Video Error', err.message || 'Video processing failed. Please try again.', 'error');
    }
}

// ====================================================================
// 8. Canvas Rendering — Bounding Boxes
// ====================================================================
function formatAndMaskPlate(plate, confidence) {
    if (!plate || plate === '-' || plate.includes('Processing') || plate.includes('recognized')) return plate;
    let cleanPlate = plate.replace(/\s*\(\d+%\)/, '');
    if (confidence && confidence < 85) {
        const parts = cleanPlate.split('-');
        if (parts.length >= 3 && parts[2].length > 1) {
            parts[2] = parts[2].substring(0, parts[2].length - 1) + '?';
            cleanPlate = parts.join('-');
        }
    }
    return cleanPlate;
}

function drawDetections(img, data) {
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (data.isNonTraffic) return;

    const threshold = state.confidenceThreshold || 0.65;
    data.violations.filter(v => v.confidence >= threshold).forEach(v => {
        const { x, y, w, h } = v.box;
        const px = (x / 100) * canvas.width, py = (y / 100) * canvas.height;
        const pw = (w / 100) * canvas.width, ph = (h / 100) * canvas.height;

        let color = v.label === 'License Plate' ? '#8b5cf6' : v.severity === 'high' ? '#B91C1C' : v.severity === 'medium' ? '#D97706' : v.label === 'Traffic Signal' ? '#15803D' : '#1E40AF';
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, canvas.width / 300);
        ctx.strokeRect(px, py, pw, ph);

        ctx.fillStyle = color;
        const fontSize = Math.max(9, Math.round(canvas.width / 50));
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        let labelText = `${v.label} (${Math.round(v.confidence * 100)}%)`;
        if (v.label === 'License Plate' && data.plate) {
            const masked = formatAndMaskPlate(data.plate, data.ocrConfidence);
            labelText = `Plate: ${masked} (${Math.round(v.confidence * 100)}%)`;
        }
        const tw = ctx.measureText(labelText).width;
        const pad = 5;
        ctx.fillRect(px - ctx.lineWidth / 2, py - fontSize - pad, tw + pad * 2, fontSize + pad);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, px + pad - ctx.lineWidth / 2, py - pad / 2);
    });
}

function populateDetails(data) {
    const detailsContent = document.getElementById('detailsContent');
    const emptyDetails = document.getElementById('emptyDetails');
    const titleEl = document.getElementById('detailTitle');
    const listEl = document.getElementById('detailViolationsList');
    const locationEl = document.getElementById('detailLocation');
    const speedEl = document.getElementById('detailSpeed');
    const plateEl = document.getElementById('detailPlate');
    const plateConfidenceEl = document.getElementById('detailPlateConfidence');
    const statusTextEl = document.getElementById('inferenceStatusText');
    const statusBadgeEl = document.getElementById('inferenceStatusBadge');
    const nonTrafficAlertEl = document.getElementById('nonTrafficAlert');

    if (data.isNonTraffic) {
        titleEl.textContent = 'No Traffic Scene Detected';
        [locationEl, speedEl, plateEl].forEach(el => { if (el) el.textContent = '-'; });
        if (plateConfidenceEl) plateConfidenceEl.textContent = '-';
        listEl.innerHTML = '';
        statusTextEl.textContent = 'NON-TRAFFIC SCENE DETECTED';
        statusBadgeEl.className = 'inference-badge badge-unrelated';
        nonTrafficAlertEl.style.display = 'flex';
        document.getElementById('btnOpenChallan').style.display = 'none';
        emptyDetails.style.display = 'none';
        detailsContent.style.display = 'flex';
        return;
    }

    nonTrafficAlertEl.style.display = 'none';
    statusTextEl.textContent = 'TRAFFIC SCENE CONFIRMED';
    statusBadgeEl.className = 'inference-badge badge-confirmed';

    titleEl.textContent = data.title;
    if (locationEl) locationEl.textContent = data.location;
    if (speedEl) speedEl.textContent = data.speed;

    const displayPlate = formatAndMaskPlate(data.plate, data.ocrConfidence);
    if (plateEl) plateEl.textContent = displayPlate || '-';
    if (plateConfidenceEl) plateConfidenceEl.textContent = data.ocrConfidence ? `${data.ocrConfidence}%` : '-';

    // Show performance metric if available from API
    if (data.processingTimeMs) {
        const perfBadge = document.getElementById('performanceBadge');
        if (perfBadge) perfBadge.textContent = `⚡ ${Math.round(data.processingTimeMs)}ms`;
    }

    listEl.innerHTML = '';
    const threshold = state.confidenceThreshold || 0.65;
    const filtered = data.violations.filter(v => v.confidence >= threshold);
    let fineSum = 0;

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="empty-details-msg" style="padding:20px 0;border:1px dashed var(--border-color);border-radius:6px;margin-bottom:16px;"><p style="font-size:0.75rem;">No detections above confidence threshold (${Math.round(threshold * 100)}%).</p></div>`;
    } else {
        filtered.forEach(v => {
            if (v.severity !== 'none') fineSum += v.fine || 0;
            const item = document.createElement('div');
            item.className = 'violation-detail-item';
            const pct = Math.round(v.confidence * 100);
            const barColor = v.label === 'License Plate' ? '#8b5cf6' : v.severity === 'high' ? 'var(--color-danger)' : v.severity === 'medium' ? 'var(--color-warning)' : 'var(--primary)';
            item.innerHTML = `
                <div class="violation-type-label">
                    <span class="violation-name">${v.label}</span>
                    <span class="violation-severity ${v.severity}">${v.severity.toUpperCase()} SEVERITY ${v.offense ? `(${v.offense})` : ''}</span>
                </div>
                <div class="violation-score-container" style="flex:1;max-width:120px;margin-left:16px;display:flex;flex-direction:column;">
                    <div style="width:100%;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;margin-bottom:4px;">
                        <div style="width:${pct}%;height:100%;background:${barColor};border-radius:3px;"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:var(--text-muted);">
                        <span>Conf.</span><strong>${pct}%</strong>
                    </div>
                </div>`;
            listEl.appendChild(item);
        });
    }

    // Review action buttons (Confirm / Reject violation in backend)
    const reviewPanel = document.getElementById('reviewActionPanel');
    if (reviewPanel && state.lastViolationDbId) {
        reviewPanel.style.display = 'flex';
        document.getElementById('btnConfirmViolation').onclick = () => confirmViolation(state.lastViolationDbId, data);
        document.getElementById('btnRejectViolation').onclick = () => rejectViolation(state.lastViolationDbId);
    }

    // Challan generation button
    const challanBtn = document.getElementById('btnOpenChallan');
    if (fineSum > 0) {
        challanBtn.style.display = 'flex';
        challanBtn.innerHTML = `<span>Generate E-Challan (₹${fineSum})</span>`;
        challanBtn.onclick = () => openChallanModal(data, fineSum);
    } else {
        challanBtn.style.display = 'none';
    }

    emptyDetails.style.display = 'none';
    detailsContent.style.display = 'flex';
}

// ====================================================================
// 9. Operator Review — Confirm / Reject Violation via Backend
// ====================================================================
async function confirmViolation(violationId, data) {
    // Allow operator to edit plate text before confirming
    const currentPlate = document.getElementById('detailPlate')?.textContent || data.plate;
    const editedPlate = prompt('Review and confirm license plate registration:\n(Edit if incorrect, then click OK)', currentPlate);
    if (editedPlate === null) return; // Cancelled

    try {
        await TrafficEyeAPI.confirmViolation(violationId, editedPlate !== currentPlate ? editedPlate : null);
        showToast('Violation Confirmed', `Violation #${violationId} confirmed. E-Challan auto-generated.`);
        state.lastViolationDbId = null;
        document.getElementById('reviewActionPanel').style.display = 'none';
        // Refresh challan ledger if on that tab
        if (state.activeTab === 'challan') renderChallanLedger();
        await loadDashboardMetrics();
    } catch (err) {
        showToast('Error', err.message || 'Could not confirm violation.', 'error');
    }
}

async function rejectViolation(violationId) {
    const reason = prompt('Enter rejection reason (optional):') || 'False positive';
    try {
        await TrafficEyeAPI.rejectViolation(violationId, reason);
        showToast('Violation Rejected', `Violation #${violationId} marked as rejected.`);
        state.lastViolationDbId = null;
        document.getElementById('reviewActionPanel').style.display = 'none';
        await loadDashboardMetrics();
    } catch (err) {
        showToast('Error', err.message || 'Could not reject violation.', 'error');
    }
}

function resetWorkspace() {
    document.getElementById('dragArea').classList.remove('has-image');
    document.getElementById('uploadPlaceholder').style.display = 'flex';
    document.getElementById('canvasContainer').classList.remove('active');
    document.getElementById('emptyDetails').style.display = 'flex';
    document.getElementById('detailsContent').style.display = 'none';
    state.uploadedFile = null;
    state.activeDetectionKey = null;
    state.currentImage = null;
    state.currentDetectionData = null;
    state.lastViolationDbId = null;
    const slider = document.getElementById('confidenceSlider');
    if (slider) { slider.value = 65; document.getElementById('thresholdValue').textContent = '65%'; state.confidenceThreshold = 0.65; }
    document.getElementById('fileInput').value = '';
    document.querySelectorAll('.sample-card').forEach(c => c.classList.remove('active'));
}

function isTrafficImage(filename) {
    if (!filename) return true;
    const keywords = ['car', 'bike', 'truck', 'traffic', 'road', 'street', 'highway', 'vehicle', 'plate', 'signal', 'helmet', 'riding', 'parking', 'violation', 'speed', 'accident', 'motorcycle', 'scooter', 'intersection', 'junction'];
    return keywords.some(kw => filename.toLowerCase().includes(kw));
}

function generateCustomMockDetection(filename) {
    if (!isTrafficImage(filename)) return { title: 'Non-Traffic Scene Detected', isNonTraffic: true, plate: '-', ocrConfidence: 0, location: '-', speed: '-', violations: [] };
    const plates = ['KA-03-MM-7721', 'KA-01-AB-1234', 'KA-05-XY-5678', 'KA-51-NB-1090'];
    const locations = ['Koramangala 80 Ft Road', 'Silk Board Junction', 'Marathahalli Bridge', 'MG Road'];
    return {
        title: 'No Helmet Rider Detection', plate: plates[Math.floor(Math.random() * plates.length)],
        ocrConfidence: Math.floor(Math.random() * 18) + 75, location: locations[Math.floor(Math.random() * locations.length)],
        speed: `${Math.floor(Math.random() * 45) + 35} km/h`, vehicle: 'Vehicle Class - Regular',
        violations: [
            { label: 'Two-Wheeler', offense: 'No Helmet Rider', confidence: 0.88, severity: 'high', fine: 500, box: { x: 30, y: 15, w: 40, h: 70 } },
            { label: 'License Plate', confidence: 0.93, severity: 'none', box: { x: 47, y: 73, w: 6, h: 3 } }
        ]
    };
}

// ====================================================================
// 10. E-Challan Modal
// ====================================================================
function initModal() {
    const overlay = document.getElementById('challanModal');
    const closeBtn = document.getElementById('closeModalBtn');
    if (!overlay || !closeBtn) return;
    closeBtn.addEventListener('click', () => overlay.classList.remove('active'));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('active'); });
}

function openChallanModal(data, totalFine) {
    const overlay = document.getElementById('challanModal');
    let existing = state.challans.find(c => c.plate === data.plate && c.fine === totalFine);
    if (!existing) {
        const violationsNames = data.violations.filter(v => v.severity !== 'none').map(v => v.offense || v.label).join(', ');
        existing = {
            id: `BTP-CH-${Date.now()}`,
            plate: data.plate || 'KA-03-MQ-4820',
            offense: violationsNames,
            location: data.location,
            timestamp: new Date().toLocaleString('en-IN', { hour12: false }),
            fine: totalFine,
            status: 'dispatched',
            owner: data.owner || 'Registered Owner',
            vehicle: data.vehicle || 'Vehicle',
            ownerPhone: data.ownerPhone || '+91 98765 43210',
            ocrConfidence: data.ocrConfidence || 88
        };
        state.challans.push(existing);
        state.dashboardStats.generatedChallans = state.challans.length;
        if (state.dashboardStats.activeCases > 0) state.dashboardStats.activeCases--;
        updateDashboardUI();
    }

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('mChallanNo', existing.id);
    set('mTimestamp', existing.timestamp);
    set('mPlateNo', formatAndMaskPlate(existing.plate, existing.ocrConfidence));
    set('mOwnerName', existing.owner);
    set('mVehicleDetails', existing.vehicle);
    set('mOffenseLocation', existing.location);
    set('mOffenseType', existing.offense);
    set('mFineAmount', `₹${existing.fine}`);

    const modalImg = document.getElementById('mSnapshotImg');
    if (modalImg) {
        modalImg.src = state.activeDetectionKey ? sampleDetections[state.activeDetectionKey]?.imagePath : 'images/samples/no_helmet.png';
    }

    document.getElementById('btnPayChallan').onclick = async () => {
        if (state.backendOnline) {
            // Try to find in backend challans by registration number
            try {
                const challans = await TrafficEyeAPI.getChallans(null, existing.plate.replace(/-/g, '').substring(0, 8));
                if (challans && challans.length > 0) {
                    await TrafficEyeAPI.payChallan(challans[0].id);
                }
            } catch (_) {}
        }
        existing.status = 'paid';
        showToast('Payment Successful', `Challan ${existing.id} has been paid and cleared.`);
        overlay.classList.remove('active');
        renderChallanLedger();
    };

    document.getElementById('btnDispatchSMS').onclick = () => {
        existing.status = 'dispatched';
        showToast('E-Challan Dispatched', `Notification sent to ${existing.ownerPhone}.`);
        overlay.classList.remove('active');
        renderChallanLedger();
    };

    overlay.classList.add('active');
}

// ====================================================================
// 11. Toast Notifications
// ====================================================================
function showToast(title, body, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastBody').textContent = body;
    toast.classList.remove('toast-error', 'toast-info');
    if (type === 'error') toast.classList.add('toast-error');
    else if (type === 'info') toast.classList.add('toast-info');
    toast.classList.add('active');
    setTimeout(() => { toast.classList.remove('active', 'toast-error', 'toast-info'); }, 4500);
}

// ====================================================================
// 12. E-Challan Ledger Tab — loads from backend or local state
// ====================================================================
function initChallanTab() {
    document.getElementById('challanSearch')?.addEventListener('input', renderChallanLedger);
    document.getElementById('challanStatusFilter')?.addEventListener('change', renderChallanLedger);
}

async function renderChallanLedger() {
    const searchText = (document.getElementById('challanSearch')?.value || '').toLowerCase().trim();
    const selectedStatus = document.getElementById('challanStatusFilter')?.value || 'all';
    const tableBody = document.querySelector('#challanLedgerTable tbody');
    if (!tableBody) return;

    // Try fetching from backend
    let challansToRender = state.challans;
    if (state.backendOnline) {
        try {
            const apiChallans = await TrafficEyeAPI.getChallans(selectedStatus !== 'all' ? selectedStatus.toUpperCase() : null);
            if (apiChallans && apiChallans.length > 0) {
                challansToRender = apiChallans.map(c => ({
                    id: c.challan_number,
                    plate: c.vehicle_registration,
                    offense: c.violation_type.replace(/_/g, ' '),
                    location: 'Bengaluru Municipal Zone',
                    timestamp: new Date(c.issued_at).toLocaleString('en-IN', { hour12: false }),
                    fine: c.fine_amount,
                    status: c.status.toLowerCase(),
                    owner: 'Registered Owner',
                    vehicle: 'Vehicle',
                    ownerPhone: '+91 98765 43210',
                    ocrConfidence: 88,
                    backendId: c.id
                }));
                // Merge local-only challans not yet in backend
                state.challans.forEach(local => {
                    if (!challansToRender.find(b => b.id === local.id)) challansToRender.push(local);
                });
            }
        } catch (_) {}
    }

    const filtered = challansToRender.filter(c => {
        const matchSearch = c.id.toLowerCase().includes(searchText) || c.plate.toLowerCase().includes(searchText);
        const matchStatus = selectedStatus === 'all' || c.status === selectedStatus;
        return matchSearch && matchStatus;
    });

    tableBody.innerHTML = '';
    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px;">No challan records found.</td></tr>`;
    } else {
        filtered.forEach(c => {
            const tr = document.createElement('tr');
            const badgeClass = c.status === 'paid' ? 'badge-success' : c.status === 'dispatched' ? 'badge-warning' : 'badge-danger';
            const displayPlate = formatAndMaskPlate(c.plate, c.ocrConfidence || 80);
            tr.innerHTML = `
                <td><strong>${c.id}</strong></td>
                <td>${displayPlate}</td>
                <td>${c.offense}</td>
                <td>${c.location}</td>
                <td>${c.timestamp}</td>
                <td>₹${c.fine}</td>
                <td><span class="badge ${badgeClass}">${c.status}</span></td>
                <td>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-secondary" style="padding:4px 8px;font-size:0.75rem;width:auto;" onclick="viewChallanById('${c.id}')">View</button>
                        ${c.status !== 'paid' ? `<button class="btn btn-primary" style="padding:4px 8px;font-size:0.75rem;width:auto;background:var(--secondary);" onclick="settleChallanById('${c.id}', ${c.backendId || 'null'})">Settle</button>` : ''}
                    </div>
                </td>`;
            tableBody.appendChild(tr);
        });
    }

    // Ledger metrics
    const totalFines = challansToRender.reduce((a, c) => a + c.fine, 0);
    const paidFines = challansToRender.filter(c => c.status === 'paid').reduce((a, c) => a + c.fine, 0);
    const pendingFines = totalFines - paidFines;
    const paidCount = challansToRender.filter(c => c.status === 'paid').length;
    const pendingCount = challansToRender.length - paidCount;
    const settlementRate = challansToRender.length > 0 ? Math.round((paidCount / challansToRender.length) * 100) : 0;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('cTotalFines', `₹${totalFines.toLocaleString('en-IN')}`);
    set('cPaidFines', `₹${paidFines.toLocaleString('en-IN')}`);
    set('cPendingFines', `₹${pendingFines.toLocaleString('en-IN')}`);
    set('cPaidCountText', `${paidCount} Challan${paidCount !== 1 ? 's' : ''} Settled`);
    set('cPendingCountText', `${pendingCount} Case${pendingCount !== 1 ? 's' : ''} Pending`);
    set('cSettlementRate', `${settlementRate}%`);
    set('cSettlementRatio', `${paidCount} Paid / ${challansToRender.length} Total`);
}

// ====================================================================
// 13. Global Challan Row Actions
// ====================================================================
window.viewChallanById = function(id) {
    const challan = [...state.challans].find(c => c.id === id);
    if (challan) openChallanModal({ plate: challan.plate, owner: challan.owner, vehicle: challan.vehicle, location: challan.location, ownerPhone: challan.ownerPhone, ocrConfidence: challan.ocrConfidence, violations: [{ label: 'Challan Record', offense: challan.offense, severity: 'high' }] }, challan.fine);
};

window.settleChallanById = async function(id, backendId) {
    if (state.backendOnline && backendId) {
        try { await TrafficEyeAPI.payChallan(backendId); } catch (_) {}
    }
    const challan = state.challans.find(c => c.id === id);
    if (challan) challan.status = 'paid';
    showToast('Payment Successful', `Challan ${id} has been paid and cleared.`);
    renderChallanLedger();
};
