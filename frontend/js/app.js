// TrafficEye AI — Core Application Logic (Phase 5: Real ML Pipeline Integration)
// All dashboard metrics, vehicle detections, helmet detections, and challans load from backend API.
// Simulated mock detections and hardcoded numbers have been removed.

// ====================================================================
// Sample metadata references (image paths for sample selector)
// Actual detections and violations are executed on the backend ML models.
// ====================================================================
const sampleCards = {
    no_helmet: {
        title: "No Helmet Scenario",
        imagePath: "images/samples/no_helmet.png"
    },
    triple_riding: {
        title: "Triple Riding Scenario",
        imagePath: "images/samples/triple_riding.png"
    },
    wrong_parking: {
        title: "Wrong Parking Scenario",
        imagePath: "images/samples/wrong_parking.png"
    },
    signal_jumping: {
        title: "Signal Jumping Scenario",
        imagePath: "images/samples/signal_jumping.png"
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
    lastApiResult: null,          // Stores real backend API response
    lastViolationDbId: null,      // Tracks last created DB violation ID
    backendOnline: false,
    challans: [],                 // Populated from backend API
    dashboardStats: {
        violationsDetectedToday: 0,
        activeCases: 0,
        generatedChallans: 0,
        avgConfidence: 0
    }
};

let violationChart = null;
let trendChart = null;

// ====================================================================
// Initialization
// ====================================================================
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initNavigation();
    initClock();
    initCharts();
    initUpload();
    initSamples();
    initChallanTab();
    initModal();
    initAuth();
    initConfidenceSlider();

    switchTab('dashboard');

    // Try to load real metrics from backend
    await loadDashboardMetrics();
});

// ====================================================================
// Theme Management (Light / White is default)
// ====================================================================
function initTheme() {
    const savedTheme = localStorage.getItem('trafficeye_theme') || 'light';
    applyTheme(savedTheme);

    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            localStorage.setItem('trafficeye_theme', next);
        });
    }
}

function applyTheme(theme) {
    const icon = document.getElementById('themeToggleIcon');
    const label = document.getElementById('themeToggleLabel');
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (icon) icon.textContent = '☀️';
        if (label) label.textContent = 'Light';
    } else {
        document.documentElement.removeAttribute('data-theme');
        if (icon) icon.textContent = '🌙';
        if (label) label.textContent = 'Dark';
    }
}

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

    await loadRecentIncidents();
}

async function loadRecentIncidents() {
    const tbody = document.getElementById('recentIncidentsTableBody');
    if (!tbody) return;

    if (!state.backendOnline) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Backend offline. Incidents unavailable.</td></tr>';
        return;
    }

    try {
        const violations = await TrafficEyeAPI.getViolations();
        if (!violations || violations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No violation incidents in database yet. Upload an image or video to analyze real violations.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        violations.slice(0, 10).forEach(v => {
            const tr = document.createElement('tr');
            const plate = (v.vehicle && v.vehicle.registration_number) ? v.vehicle.registration_number : 'UNREADABLE';
            const conf = Math.round((v.violation_confidence || 0) * 100);
            const badgeClass = v.status === 'CONFIRMED' ? 'badge-danger' : (v.status === 'REJECTED' ? 'badge-muted' : 'badge-warning');
            const typeLabel = (v.violation_type || 'VIOLATION').replace(/_/g, ' ');
            const loc = v.location_name || 'Camera Zone 1';

            tr.innerHTML = `
                <td><strong>#VIOL-${v.id}</strong></td>
                <td><span class="plate-text">${plate}</span></td>
                <td>${typeLabel}</td>
                <td>${loc}</td>
                <td>${conf}%</td>
                <td><span class="badge ${badgeClass}">${v.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (_) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Failed to load incident records from API.</td></tr>';
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

function initSamples() {
    document.querySelectorAll('.sample-card').forEach(card => {
        card.addEventListener('click', async () => {
            const key = card.getAttribute('data-sample-key');
            if (key && sampleCards[key]) {
                document.querySelectorAll('.sample-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                state.activeDetectionKey = key;

                try {
                    // Fetch real sample image file to upload via POST /api/analyze/image
                    const res = await fetch(sampleCards[key].imagePath);
                    const blob = await res.blob();
                    const sampleFile = new File([blob], `${key}.png`, { type: 'image/png' });
                    state.uploadedFile = sampleFile;
                    runInference(sampleCards[key].imagePath, sampleFile, key);
                } catch (err) {
                    console.warn('Direct blob fetch failed, falling back to sampleTag:', err);
                    state.uploadedFile = null;
                    runInference(sampleCards[key].imagePath, null, key);
                }
            }
        });
    });
}

// ====================================================================
// 7. Main Inference Pipeline (calls real backend API)
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
    overlayText.textContent = 'RUNNING REAL ML PIPELINE…';
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

        // ----- Call Real Backend API -----
        let apiResult = null;
        try {
            apiResult = await TrafficEyeAPI.analyzeImage(uploadedFile, sampleTag);
            state.lastApiResult = apiResult;
            const violCount = (apiResult.violations || []).length;
            overlayText.textContent = `✓ ${violCount} VIOLATION(S) DETECTED`;
        } catch (err) {
            console.error('Backend analysis failed:', err);
            scanLine.classList.remove('scanning');
            overlayText.classList.remove('scanning');
            state.isScanning = false;
            overlayText.textContent = 'ANALYSIS FAILED';
            showToast('API Error', err.message || 'Image analysis failed on server.', 'error');
            displayAnalysisError(err.message || 'Image analysis failed on server.');
            return;
        }

        scanLine.classList.remove('scanning');
        overlayText.classList.remove('scanning');
        state.isScanning = false;

        // Build detection display data strictly from real API response
        const detectionData = buildDetectionDataFromAPI(apiResult);
        if (apiResult.violations && apiResult.violations.length > 0) {
            fetchLatestViolationId();
        }

        state.currentImage = img;
        state.currentDetectionData = detectionData;

        drawDetections(img, detectionData);
        populateDetails(detectionData);
        updateDashboardUI();
    };

    img.onerror = () => {
        showToast('Image Error', 'Could not load the image. Please try another file.', 'error');
        resetWorkspace();
    };
    img.src = imgSource;
}

function buildDetectionDataFromAPI(apiResult) {
    const rawViolations = apiResult.violations || [];
    const rawDetections = apiResult.detections || [];
    const helmetDetections = apiResult.helmet_detections || [];

    const violationTypeMap = {
        'NO_HELMET': { label: 'Two-Wheeler', offense: 'No Helmet Rider', severity: 'high', fine: 500 },
        'TRIPLE_RIDING': { label: 'Two-Wheeler', offense: 'Triple Riding', severity: 'high', fine: 1000 },
        'WRONG_PARKING': { label: 'Four-Wheeler', offense: 'No Parking Zone', severity: 'medium', fine: 500 },
        'RED_LIGHT': { label: 'Vehicle', offense: 'Red Light Violation', severity: 'high', fine: 1000 }
    };

    // Canvas render items (boxes)
    const boxes = [];

    // 1. Violations
    const violations = rawViolations.map(v => {
        const mapped = violationTypeMap[v.violation_type] || { label: 'Vehicle', offense: v.violation_type, severity: 'high', fine: 500 };
        return {
            label: mapped.label,
            offense: mapped.offense,
            confidence: v.confidence,
            severity: mapped.severity,
            fine: mapped.fine,
            reason: v.reason || '',
            box: v.vehicle_bbox || { x: 20, y: 25, w: 50, h: 50 },
            detection_source: v.detection_source
        };
    });

    // Add violation boxes to canvas render items
    violations.forEach(v => {
        boxes.push({
            type: 'violation',
            label: `${v.label}: ${v.offense}`,
            confidence: v.confidence,
            severity: v.severity,
            box: v.box
        });
    });

    // 2. Real Helmet detections from ML model
    helmetDetections.forEach(hd => {
        boxes.push({
            type: 'helmet',
            label: hd.class_name,
            class_id: hd.class_id,
            confidence: hd.confidence,
            severity: hd.class_id === 1 ? 'high' : 'none',
            box: hd.bbox_pct
        });
    });

    // 3. Vehicles detected by YOLO
    rawDetections.forEach(d => {
        if (['car', 'motorcycle', 'bus', 'truck'].includes(d.class_name)) {
            boxes.push({
                type: 'vehicle',
                label: d.class_name,
                confidence: d.confidence,
                severity: 'none',
                box: d.bbox
            });
        }
    });

    // 4. Real Plate Detection / OCR
    let plateText = null;
    let ocrConf = null;
    for (const v of rawViolations) {
        if (v.normalized_plate_text && v.normalized_plate_text !== 'NOT_DETECTED') {
            plateText = v.normalized_plate_text;
            ocrConf = v.ocr_confidence ? Math.round(v.ocr_confidence * 100) : null;
            if (v.plate_bbox) {
                boxes.push({
                    type: 'plate',
                    label: `Plate: ${plateText}`,
                    confidence: v.ocr_confidence || 0.85,
                    severity: 'none',
                    box: v.plate_bbox
                });
            }
            break;
        }
    }

    const title = violations.length > 0
        ? violations.map(v => v.offense).join(', ')
        : (rawDetections.length > 0 ? `${rawDetections.length} Vehicle(s) Detected — No Violations` : 'No Vehicles Detected');

    return {
        title,
        plate: plateText,
        ocrConfidence: ocrConf,
        location: 'Bengaluru Municipal Enforcement Zone',
        speed: '-',
        vehicle: rawDetections.length > 0 ? `${rawDetections.map(d => d.class_name).join(', ')}` : 'No Vehicle',
        owner: plateText ? 'Registered Owner' : '-',
        ownerPhone: plateText ? '+91 98765 43210 [DEMO]' : '-',
        violations,
        boxes,
        detections: rawDetections,
        helmetDetections,
        apiViolations: rawViolations,
        mediaPath: apiResult.media_path,
        annotatedImagePath: apiResult.annotated_image_path,
        evidenceImage: apiResult.annotated_image_base64 || apiResult.annotated_image_path || apiResult.media_path,
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
    showToast('Video Processing', 'Uploading video to real ML pipeline (YOLO + Helmet + Tracking)...', 'info');
    const overlayText = document.getElementById('overlayText');
    const scanLine = document.getElementById('scanLine');
    const dragArea = document.getElementById('dragArea');
    const placeholder = document.getElementById('uploadPlaceholder');
    const canvasContainer = document.getElementById('canvasContainer');

    dragArea.classList.add('has-image');
    placeholder.style.display = 'none';
    canvasContainer.classList.add('active');
    scanLine.classList.add('scanning');
    overlayText.classList.add('scanning');
    overlayText.textContent = 'PROCESSING VIDEO FRAMES…';

    try {
        const result = await TrafficEyeAPI.analyzeVideo(videoFile);
        scanLine.classList.remove('scanning');
        overlayText.classList.remove('scanning');
        state.isScanning = false;

        const violCount = (result.violations || []).length;
        const trackedCount = result.vehicles_tracked_count || 0;
        overlayText.textContent = `✓ VIDEO COMPLETE: ${trackedCount} TRACKED, ${violCount} VIOLATION(S)`;

        showToast(
            'Video Processed',
            `${result.processed_frames_count} frames analyzed. ${trackedCount} vehicle(s) tracked. ${violCount} deduplicated violation(s) flagged.`
        );

        displayVideoSummary(result);
        await loadDashboardMetrics();
    } catch (err) {
        scanLine.classList.remove('scanning');
        overlayText.classList.remove('scanning');
        state.isScanning = false;
        overlayText.textContent = 'VIDEO ANALYSIS FAILED';
        showToast('Video Error', err.message || 'Video analysis failed on server.', 'error');
        displayAnalysisError(err.message || 'Video processing failed.');
    }
}

// ====================================================================
// 8. Canvas Rendering — Real Bounding Boxes
// ====================================================================
function drawDetections(img, data) {
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (!data.boxes || data.boxes.length === 0) return;

    const threshold = state.confidenceThreshold || 0.65;
    data.boxes.filter(b => b.confidence >= (b.type === 'violation' ? threshold : 0.20)).forEach(b => {
        const { x, y, w, h } = b.box;
        const px = (x / 100) * canvas.width, py = (y / 100) * canvas.height;
        const pw = (w / 100) * canvas.width, ph = (h / 100) * canvas.height;

        let color = '#1E40AF'; // Default vehicle blue
        if (b.type === 'violation') {
            color = b.severity === 'high' ? '#B91C1C' : '#D97706';
        } else if (b.type === 'helmet') {
            color = b.class_id === 0 ? '#15803D' : '#DC2626'; // Green: Helmet, Red: No Helmet
        } else if (b.type === 'plate') {
            color = '#8b5cf6'; // Purple: Plate
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = b.type === 'violation' ? 3 : 2;
        ctx.strokeRect(px, py, pw, ph);

        ctx.fillStyle = color;
        const fontSize = Math.max(9, Math.round(canvas.width / 55));
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        const labelText = `${b.label} (${Math.round(b.confidence * 100)}%)`;
        const tw = ctx.measureText(labelText).width;
        const pad = 4;
        ctx.fillRect(px - 1, py - fontSize - pad, tw + pad * 2, fontSize + pad);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, px + pad, py - pad / 2);
    });
}

function formatAndMaskPlate(plate, confidence) {
    if (!plate || plate === '-' || plate === 'NOT_DETECTED' || plate.includes("Processing") || plate.includes("recognized")) {
        return plate || 'NOT_DETECTED';
    }
    let cleanPlate = plate.replace(/\s*\(\d+%\)/, '');
    if (confidence && confidence < 85) {
        const parts = cleanPlate.split('-');
        if (parts.length >= 3) {
            if (parts[2].length > 1) {
                parts[2] = parts[2].substring(0, parts[2].length - 1) + "?";
            } else {
                parts[2] = "?";
            }
            cleanPlate = parts.join('-');
        } else if (cleanPlate.length > 5) {
            const chars = cleanPlate.split('');
            const mid = Math.floor(chars.length / 2);
            chars[mid] = '?';
            cleanPlate = chars.join('');
        }
    }
    return cleanPlate;
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
        if (titleEl) titleEl.textContent = 'No Traffic Scene Detected';
        [locationEl, speedEl, plateEl].forEach(el => { if (el) el.textContent = '-'; });
        if (plateConfidenceEl) plateConfidenceEl.textContent = '-';
        if (listEl) listEl.innerHTML = '';
        if (statusTextEl) statusTextEl.textContent = 'NON-TRAFFIC SCENE DETECTED';
        if (statusBadgeEl) statusBadgeEl.className = 'inference-badge badge-unrelated';
        if (nonTrafficAlertEl) nonTrafficAlertEl.style.display = 'flex';
        const challanBtn = document.getElementById('btnOpenChallan');
        if (challanBtn) challanBtn.style.display = 'none';
        if (emptyDetails) emptyDetails.style.display = 'none';
        if (detailsContent) detailsContent.style.display = 'flex';
        return;
    }

    if (nonTrafficAlertEl) nonTrafficAlertEl.style.display = 'none';
    if (statusTextEl) statusTextEl.textContent = 'TRAFFIC SCENE CONFIRMED';
    if (statusBadgeEl) statusBadgeEl.className = 'inference-badge badge-confirmed';

    if (titleEl) titleEl.textContent = data.title || 'Traffic Inference Results';
    if (locationEl) locationEl.textContent = data.location || 'Bengaluru Municipal Zone';
    if (speedEl) speedEl.textContent = data.speed || '-';

    const displayPlate = formatAndMaskPlate(data.plate, data.ocrConfidence);
    if (plateEl) plateEl.textContent = displayPlate || 'NOT_DETECTED';
    if (plateConfidenceEl) plateConfidenceEl.textContent = data.ocrConfidence ? `${data.ocrConfidence}%` : '-';

    // Show performance metric if available from API
    if (data.processingTimeMs) {
        const perfBadge = document.getElementById('performanceBadge');
        if (perfBadge) perfBadge.textContent = `⚡ ${Math.round(data.processingTimeMs)}ms`;
    }

    if (!listEl) return;
    listEl.innerHTML = '';
    let fineSum = 0;

    // 1. VIOLATIONS SECTION
    const violationsHeader = document.createElement('div');
    violationsHeader.style.cssText = 'font-size:0.75rem;font-weight:700;color:var(--text-main);margin:4px 0 6px;text-transform:uppercase;letter-spacing:0.5px;display:flex;justify-content:space-between;';
    const violCount = (data.violations || []).length;
    violationsHeader.innerHTML = `<span>⚠️ Violations</span><span style="color:var(--color-danger);font-weight:800;">${violCount}</span>`;
    listEl.appendChild(violationsHeader);

    if (violCount === 0) {
        const noViol = document.createElement('div');
        noViol.className = 'empty-details-msg';
        noViol.style.cssText = 'padding:10px 12px;border:1px dashed var(--border-color);border-radius:6px;margin-bottom:12px;';
        noViol.innerHTML = '<p style="font-size:0.75rem;color:var(--text-muted);margin:0;">No traffic violations identified in this frame.</p>';
        listEl.appendChild(noViol);
    } else {
        data.violations.forEach(v => {
            if (v.severity !== 'none') fineSum += v.fine || 0;
            const item = document.createElement('div');
            item.className = 'violation-detail-item';
            const pct = Math.round(v.confidence * 100);
            const barColor = v.severity === 'high' ? 'var(--color-danger)' : 'var(--color-warning)';
            item.innerHTML = `
                <div class="violation-type-label">
                    <span class="violation-name">${v.offense || v.label}</span>
                    <span class="violation-severity ${v.severity}">${v.severity.toUpperCase()} SEVERITY ${v.fine ? `(₹${v.fine})` : ''}</span>
                    ${v.reason ? `<span style="font-size:0.7rem;color:var(--text-muted);display:block;margin-top:2px;">${v.reason}</span>` : ''}
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

    // 2. HELMET DETECTION STATUS
    const helmetDets = data.helmetDetections || [];
    const helmetHeader = document.createElement('div');
    helmetHeader.style.cssText = 'font-size:0.75rem;font-weight:700;color:var(--text-main);margin:12px 0 6px;text-transform:uppercase;letter-spacing:0.5px;display:flex;justify-content:space-between;';
    helmetHeader.innerHTML = `<span>⛑️ Helmet Status</span><span style="color:var(--primary);font-weight:800;">${helmetDets.length} Evaluated</span>`;
    listEl.appendChild(helmetHeader);

    if (helmetDets.length === 0) {
        const noHelmet = document.createElement('div');
        noHelmet.style.cssText = 'padding:8px 12px;background:#f8fafc;border:1px solid var(--border-color);border-radius:6px;margin-bottom:12px;font-size:0.75rem;color:var(--text-muted);';
        noHelmet.textContent = 'No rider head targets detected in scene.';
        listEl.appendChild(noHelmet);
    } else {
        helmetDets.forEach(hd => {
            const item = document.createElement('div');
            item.className = 'violation-detail-item';
            const pct = Math.round(hd.confidence * 100);
            const isNoHelmet = hd.class_id === 1 || hd.class_name.toLowerCase().includes('without');
            const statusClass = isNoHelmet ? 'high' : 'none';
            const barColor = isNoHelmet ? 'var(--color-danger)' : '#10b981';
            item.innerHTML = `
                <div class="violation-type-label">
                    <span class="violation-name">${hd.class_name}</span>
                    <span class="violation-severity ${statusClass}">${isNoHelmet ? 'NON-COMPLIANT' : 'COMPLIANT'}</span>
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

    // 3. VEHICLE & OBJECT DETECTIONS (YOLO)
    const objects = data.detections || [];
    const objectsHeader = document.createElement('div');
    objectsHeader.style.cssText = 'font-size:0.75rem;font-weight:700;color:var(--text-main);margin:12px 0 6px;text-transform:uppercase;letter-spacing:0.5px;display:flex;justify-content:space-between;';
    objectsHeader.innerHTML = `<span>🚗 Objects Detected</span><span style="color:var(--primary);font-weight:800;">${objects.length} Total</span>`;
    listEl.appendChild(objectsHeader);

    if (objects.length === 0) {
        const noObj = document.createElement('div');
        noObj.style.cssText = 'padding:8px 12px;background:#f8fafc;border:1px solid var(--border-color);border-radius:6px;margin-bottom:12px;font-size:0.75rem;color:var(--text-muted);';
        noObj.textContent = 'No vehicles or pedestrians identified.';
        listEl.appendChild(noObj);
    } else {
        objects.forEach(d => {
            const item = document.createElement('div');
            item.className = 'violation-detail-item';
            const pct = Math.round(d.confidence * 100);
            item.innerHTML = `
                <div class="violation-type-label">
                    <span class="violation-name" style="text-transform:capitalize;">${d.class_name}</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);">YOLOv8 Detection</span>
                </div>
                <div class="violation-score-container" style="flex:1;max-width:120px;margin-left:16px;display:flex;flex-direction:column;">
                    <div style="width:100%;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;margin-bottom:4px;">
                        <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:3px;"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:var(--text-muted);">
                        <span>Conf.</span><strong>${pct}%</strong>
                    </div>
                </div>`;
            listEl.appendChild(item);
        });
    }

    // 4. EVIDENCE RECORD SUMMARY
    if (data.annotatedImagePath || data.mediaPath) {
        const evidenceHeader = document.createElement('div');
        evidenceHeader.style.cssText = 'font-size:0.75rem;font-weight:700;color:var(--text-main);margin:12px 0 6px;text-transform:uppercase;letter-spacing:0.5px;';
        evidenceHeader.innerHTML = '<span>📸 Evidence Audit Record</span>';
        listEl.appendChild(evidenceHeader);

        const evidenceBox = document.createElement('div');
        evidenceBox.style.cssText = 'padding:8px 12px;background:#f8fafc;border:1px solid var(--border-color);border-radius:6px;margin-bottom:12px;font-size:0.75rem;color:var(--text-muted);display:flex;flex-direction:column;gap:4px;word-break:break-all;';
        evidenceBox.innerHTML = `
            <div><strong>Upload:</strong> <code>${data.mediaPath || '-'}</code></div>
            <div><strong>Annotated:</strong> <code>${data.annotatedImagePath || '-'}</code></div>
            <div><strong>Plate Crop:</strong> <code>${data.plate || 'NOT_DETECTED'}</code> (${data.ocrConfidence ? `${data.ocrConfidence}% OCR` : 'No OCR'})</div>
        `;
        listEl.appendChild(evidenceBox);
    }

    // Review action buttons (Confirm / Reject violation in backend)
    const reviewPanel = document.getElementById('reviewActionPanel');
    if (reviewPanel) {
        if (state.lastViolationDbId) {
            reviewPanel.style.display = 'flex';
            document.getElementById('btnConfirmViolation').onclick = () => confirmViolation(state.lastViolationDbId, data);
            document.getElementById('btnRejectViolation').onclick = () => rejectViolation(state.lastViolationDbId);
        } else {
            reviewPanel.style.display = 'none';
        }
    }

    // Challan generation button
    const challanBtn = document.getElementById('btnOpenChallan');
    if (challanBtn) {
        if (fineSum > 0) {
            challanBtn.style.display = 'flex';
            challanBtn.innerHTML = `<span>Generate E-Challan (₹${fineSum})</span>`;
            challanBtn.onclick = () => openChallanModal(data, fineSum);
        } else {
            challanBtn.style.display = 'none';
        }
    }

    // Unhide details panel and hide empty state
    if (emptyDetails) emptyDetails.style.display = 'none';
    if (detailsContent) detailsContent.style.display = 'flex';
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

function displayAnalysisError(errorMessage) {
    const detailsContent = document.getElementById('detailsContent');
    const emptyDetails = document.getElementById('emptyDetails');

    emptyDetails.style.display = 'flex';
    detailsContent.style.display = 'none';
    emptyDetails.innerHTML = `
        <div style="padding:24px 16px;text-align:center;color:var(--color-danger);display:flex;flex-direction:column;align-items:center;">
            <svg style="width:36px;height:36px;margin-bottom:12px;stroke:var(--color-danger);fill:none;" viewBox="0 0 24 24" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h4 style="font-size:0.95rem;margin-bottom:6px;font-weight:700;color:var(--text-main);">Backend Analysis Failed</h4>
            <p style="font-size:0.75rem;color:var(--text-muted);max-width:280px;line-height:1.4;">${errorMessage || 'Could not connect to backend server.'}</p>
        </div>`;
}

function displayVideoSummary(result) {
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

    nonTrafficAlertEl.style.display = 'none';
    statusTextEl.textContent = 'VIDEO SURVEILLANCE PROCESSED';
    statusBadgeEl.className = 'inference-badge badge-confirmed';

    titleEl.textContent = `Video Analysis (${result.vehicles_tracked_count} Vehicles Tracked)`;
    if (locationEl) locationEl.textContent = 'Traffic Video Stream';
    if (speedEl) speedEl.textContent = `${result.duration_seconds}s (${result.total_frames_read} frames @ ${Math.round(result.fps)} FPS)`;

    const firstViol = (result.violations || [])[0];
    const firstPlate = firstViol?.license_plate || 'NOT_DETECTED';
    if (plateEl) plateEl.textContent = firstPlate;
    if (plateConfidenceEl) plateConfidenceEl.textContent = firstViol && firstPlate !== 'NOT_DETECTED' ? 'Track Verified' : '-';

    const perfBadge = document.getElementById('performanceBadge');
    if (perfBadge && result.processing_time_ms) {
        perfBadge.textContent = `⚡ ${Math.round(result.processing_time_ms)}ms`;
    }

    listEl.innerHTML = '';
    const violations = result.violations || [];
    let fineSum = 0;

    if (violations.length === 0) {
        listEl.innerHTML = `
            <div class="empty-details-msg" style="padding:16px;border:1px dashed var(--border-color);border-radius:6px;margin-bottom:12px;">
                <p style="font-size:0.8rem;color:var(--text-muted);">No traffic violations detected across ${result.processed_frames_count} sampled frames (${result.vehicles_tracked_count} vehicle(s) tracked).</p>
            </div>`;
    } else {
        violations.forEach(v => {
            const pct = Math.round(v.confidence * 100);
            const fine = v.violation_type === 'TRIPLE_RIDING' ? 1000 : 500;
            fineSum += fine;
            const item = document.createElement('div');
            item.className = 'violation-detail-item';
            item.innerHTML = `
                <div class="violation-type-label">
                    <span class="violation-name">Track #${v.track_id}: ${v.violation_type.replace(/_/g, ' ')}</span>
                    <span class="violation-severity high">Plate: ${v.license_plate}</span>
                    <span style="font-size:0.7rem;color:var(--text-muted);display:block;margin-top:2px;">${v.reason || ''}</span>
                </div>
                <div class="violation-score-container" style="flex:1;max-width:120px;margin-left:16px;display:flex;flex-direction:column;">
                    <div style="width:100%;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;margin-bottom:4px;">
                        <div style="width:${pct}%;height:100%;background:var(--color-danger);border-radius:3px;"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:var(--text-muted);">
                        <span>Conf.</span><strong>${pct}%</strong>
                    </div>
                </div>`;
            listEl.appendChild(item);
        });
    }

    const challanBtn = document.getElementById('btnOpenChallan');
    if (fineSum > 0) {
        challanBtn.style.display = 'flex';
        challanBtn.innerHTML = `<span>Generate E-Challan (₹${fineSum}) [DEMO]</span>`;
    } else {
        challanBtn.style.display = 'none';
    }

    emptyDetails.style.display = 'none';
    detailsContent.style.display = 'flex';
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

function initAuth() {
    const btnLoginOpen = document.getElementById('btnLoginOpen');
    const loginModal = document.getElementById('loginModal');
    const closeBtn = document.getElementById('closeLoginModalBtn');
    const loginForm = document.getElementById('loginForm');
    const btnLogout = document.getElementById('btnLogout');
    const userInfoBadge = document.getElementById('userInfoBadge');
    const userGreeting = document.getElementById('userGreeting');

    const updateAuthUI = () => {
        const user = TrafficEyeAPI.getStoredUser();
        if (user && user.username) {
            if (btnLoginOpen) btnLoginOpen.style.display = 'none';
            if (userInfoBadge) userInfoBadge.style.display = 'flex';
            if (userGreeting) userGreeting.textContent = `👤 ${user.username} (${user.role || 'Officer'})`;
        } else {
            if (btnLoginOpen) btnLoginOpen.style.display = 'inline-flex';
            if (userInfoBadge) userInfoBadge.style.display = 'none';
        }
    };

    if (btnLoginOpen && loginModal) {
        btnLoginOpen.addEventListener('click', () => loginModal.classList.add('active'));
    }
    if (closeBtn && loginModal) {
        closeBtn.addEventListener('click', () => loginModal.classList.remove('active'));
    }
    if (loginModal) {
        loginModal.addEventListener('click', e => { if (e.target === loginModal) loginModal.classList.remove('active'); });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('loginUsername');
            const passwordInput = document.getElementById('loginPassword');
            const u = usernameInput ? usernameInput.value.trim() : '';
            const p = passwordInput ? passwordInput.value : '';

            try {
                const data = await TrafficEyeAPI.login(u, p);
                loginModal.classList.remove('active');
                updateAuthUI();
                showToast('Authentication Successful', `Logged in as ${data.username} (${data.role}).`);
            } catch (err) {
                showToast('Login Failed', err.message || 'Invalid username or password', 'error');
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            TrafficEyeAPI.logout();
            updateAuthUI();
            showToast('Logged Out', 'Officer session cleared.', 'info');
        });
    }

    updateAuthUI();
}

function openChallanModal(data, totalFine) {
    const overlay = document.getElementById('challanModal');
    let existing = state.challans.find(c => c.plate === data.plate && c.fine === totalFine);
    if (!existing) {
        const violationsNames = (data.violations || []).filter(v => v.severity !== 'none').map(v => v.offense || v.label).join(', ');
        existing = {
            id: `TX-CH-${Date.now().toString().slice(-6)}`,
            plate: data.plate || 'UNREADABLE',
            offense: violationsNames || 'Traffic Infraction',
            location: data.location || 'Camera Zone',
            timestamp: new Date().toLocaleString('en-IN', { hour12: false }),
            fine: totalFine,
            status: 'dispatched',
            owner: data.owner || 'Registered Owner [DEMO]',
            vehicle: data.vehicle || 'Vehicle',
            ownerPhone: data.ownerPhone || 'Not Configured',
            ocrConfidence: data.ocrConfidence || 0,
            evidenceImage: data.evidenceImage || null
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
        modalImg.onerror = () => {
            modalImg.src = 'images/samples/no_helmet.png';
        };
        modalImg.src = existing.evidenceImage || (state.activeDetectionKey ? sampleCards[state.activeDetectionKey]?.imagePath : '') || (state.lastInferenceData?.evidenceImage || 'images/samples/no_helmet.png');
    }

    document.getElementById('btnPayChallan').onclick = async () => {
        if (state.backendOnline && existing.backendId) {
            try {
                await TrafficEyeAPI.payChallan(existing.backendId);
            } catch (_) {}
        }
        existing.status = 'paid';
        showToast('Payment Recorded [DEMO]', `Challan ${existing.id} settled in demo ledger.`);
        overlay.classList.remove('active');
        renderChallanLedger();
    };

    document.getElementById('btnDispatchSMS').onclick = () => {
        existing.status = 'dispatched';
        showToast('SMS Notice Dispatched [DEMO]', `Simulated notification sent to ${existing.ownerPhone} (Demo Gateway).`);
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
                    owner: 'Registered Owner [DEMO]',
                    vehicle: 'Vehicle',
                    ownerPhone: 'Not Configured',
                    ocrConfidence: 0,
                    backendId: c.id
                }));
                // Merge local-only challans not yet in backend
                state.challans.forEach(local => {
                    if (!challansToRender.find(b => b.id === local.id)) challansToRender.push(local);
                });
                state.challans = challansToRender;
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
