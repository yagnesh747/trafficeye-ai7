// TrafficEye AI - Core JavaScript Logic

// Database of mock detections for sample traffic images
const sampleDetections = {
    no_helmet: {
        title: "No Helmet Detection",
        imagePath: "images/samples/no_helmet.png",
        plate: "MH12-KP-4820",
        vehicle: "Scooter (Suzuki Access - Black)",
        location: "Senapati Bapat Road, Zone 3",
        speed: "34 km/h",
        owner: "Rahul A. Sharma",
        ownerPhone: "+91 98765 43210",
        violations: [
            {
                label: "Bike",
                offense: "No Helmet Rider",
                confidence: 0.94,
                severity: "high",
                fine: 100,
                // percentage coordinates x, y, width, height
                box: { x: 35, y: 30, w: 30, h: 60 }
            },
            {
                label: "License Plate",
                confidence: 0.92,
                severity: "none",
                box: { x: 47, y: 79.5, w: 6, h: 3 }
            }
        ]
    },
    triple_riding: {
        title: "Triple Riding Violation",
        imagePath: "images/samples/triple_riding.png",
        plate: "DL3C-AY-9031",
        vehicle: "Scooter (Honda Activa - Grey)",
        location: "Connaught Place Outer Ring",
        speed: "28 km/h",
        owner: "Vikram Singh",
        ownerPhone: "+91 87654 32109",
        violations: [
            {
                label: "Bike",
                offense: "Triple Riding",
                confidence: 0.96,
                severity: "high",
                fine: 150,
                box: { x: 30, y: 20, w: 40, h: 70 }
            },
            {
                label: "License Plate",
                confidence: 0.95,
                severity: "none",
                box: { x: 49, y: 81, w: 6, h: 3 }
            }
        ]
    },
    wrong_parking: {
        title: "Wrong Parking Violation",
        imagePath: "images/samples/wrong_parking.png",
        plate: "KA03-MM-7721",
        vehicle: "Sedan (Hyundai Verna - White)",
        location: "Koramangala 80ft Road",
        speed: "0 km/h (Stationary)",
        owner: "Anita K. Rangan",
        ownerPhone: "+91 76543 21098",
        violations: [
            {
                label: "Car",
                offense: "Wrong Parking Violation",
                confidence: 0.98,
                severity: "medium",
                fine: 100,
                box: { x: 20, y: 35, w: 55, h: 45 }
            },
            {
                label: "License Plate",
                confidence: 0.94,
                severity: "none",
                box: { x: 51, y: 63, w: 6, h: 3 }
            }
        ]
    },
    signal_jumping: {
        title: "Red Light Infringement",
        imagePath: "images/samples/signal_jumping.png",
        plate: "HR26-CN-5512",
        vehicle: "Hatchback (Maruti Swift - Red)",
        location: "IFFCO Chowk, Sector 29",
        speed: "58 km/h",
        owner: "Devender Yadav",
        ownerPhone: "+91 99999 88888",
        violations: [
            {
                label: "Car",
                offense: "Red Light Violation",
                confidence: 0.97,
                severity: "high",
                fine: 250,
                box: { x: 25, y: 40, w: 45, h: 40 }
            },
            {
                label: "Traffic Signal",
                confidence: 0.99,
                severity: "none",
                box: { x: 68, y: 10, w: 8, h: 22 }
            },
            {
                label: "License Plate",
                confidence: 0.96,
                severity: "none",
                box: { x: 44, y: 69, w: 6, h: 3 }
            }
        ]
    }
};

// Global App State
const state = {
    activeTab: 'dashboard',
    activeDetectionKey: null,
    uploadedImageSrc: null,
    uploadedImageName: null,
    isScanning: false,
    confidenceThreshold: 0.65, // Default confidence threshold (65%)
    currentImage: null,        // Reference to the active loaded HTMLImageElement
    currentDetectionData: null,// Reference to active loaded detection metadata
    dashboardStats: {
        processedCount: 1420,
        violationCount: 462,
        challanRevenue: 48500, // in dollars or local currency units
        accuracy: 94.2
    },
    sim: {
        isRunning: false,
        intervalId: null,
        currentFrameIndex: 0,
        cameraLogs: [],
        cameraKeys: ['no_helmet', 'triple_riding', 'wrong_parking', 'signal_jumping']
    },
    pitchSlide: 0
};

// Chart instances
let violationChart = null;
let trendChart = null;

// Initialize on DOM Load
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initClock();
    initCharts();
    initUpload();
    initSamples();
    initSimulator();
    initPresentation();
    initModal();
    initConfidenceSlider();
    
    // Set active tab to dashboard
    switchTab('dashboard');
    updateDashboardUI();
});

function initConfidenceSlider() {
    const slider = document.getElementById('confidenceSlider');
    const valDisplay = document.getElementById('thresholdValue');
    if (slider && valDisplay) {
        slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            valDisplay.textContent = `${val}%`;
            state.confidenceThreshold = val / 100;
            
            // Re-render detections if we have loaded an active image
            if (state.currentImage && state.currentDetectionData) {
                drawDetections(state.currentImage, state.currentDetectionData);
                populateDetails(state.currentDetectionData);
            }
        });
    }
}

// 1. Navigation Logic
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const targetTab = item.getAttribute('data-tab');
            if (targetTab) {
                // If switching away from simulator, pause simulator
                if (targetTab !== 'simulator' && state.sim.isRunning) {
                    toggleSimulator(false);
                }
                switchTab(targetTab);
            }
        });
    });
}

function switchTab(tabId) {
    state.activeTab = tabId;
    
    // Update active nav item class
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Update visible view
    const tabViews = document.querySelectorAll('.tab-view');
    tabViews.forEach(view => {
        if (view.id === `${tabId}-view`) {
            view.classList.add('active');
        } else {
            view.classList.remove('active');
        }
    });

    // Update view titles dynamically
    const titleEl = document.getElementById('viewTitle');
    const subtitleEl = document.getElementById('viewSubtitle');
    if (titleEl && subtitleEl) {
        switch(tabId) {
            case 'dashboard':
                titleEl.textContent = "Control Dashboard";
                subtitleEl.textContent = "Real-time highway and city violation analytics cockpit.";
                break;
            case 'detection':
                titleEl.textContent = "Detection Center";
                subtitleEl.textContent = "Computer Vision inspection and enforcement terminal.";
                break;
            case 'simulator':
                titleEl.textContent = "Camera Simulator";
                subtitleEl.textContent = "Live edge-AI compliance feeds.";
                break;
            case 'presentation':
                titleEl.textContent = "Pitch Presentation";
                subtitleEl.textContent = "Slide deck overview for hackathon evaluation.";
                break;
        }
    }

    // Handle charts resizing/re-rendering upon display
    if (tabId === 'dashboard') {
        setTimeout(() => {
            if (violationChart) violationChart.resize();
            if (trendChart) trendChart.resize();
        }, 100);
    }
}

// 2. Real-Time Clock
function initClock() {
    const clockEl = document.getElementById('currentTime');
    const updateTime = () => {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        clockEl.textContent = `${hours}:${minutes}:${seconds} | 15-JUN-2026`;
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// 3. Initialize Dashboard Charts (Chart.js)
function initCharts() {
    const violationCtx = document.getElementById('violationChartEl').getContext('2d');
    const trendCtx = document.getElementById('trendChartEl').getContext('2d');
    
    // Blue gradient for line chart
    const blueGradient = trendCtx.createLinearGradient(0, 0, 0, 200);
    blueGradient.addColorStop(0, 'rgba(37, 99, 235, 0.15)');
    blueGradient.addColorStop(1, 'rgba(37, 99, 235, 0.0)');

    // 1. Violation Distribution (Bar Chart)
    violationChart = new Chart(violationCtx, {
        type: 'bar',
        data: {
            labels: ['No Helmet', 'Triple Riding', 'Wrong Parking', 'Signal Jumping'],
            datasets: [{
                label: 'Cases Detected',
                data: [142, 88, 172, 60],
                backgroundColor: [
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(220, 38, 38, 0.8)',
                    'rgba(37, 99, 235, 0.8)',
                    'rgba(139, 92, 246, 0.8)'
                ],
                borderColor: [
                    '#f59e0b',
                    '#dc2626',
                    '#2563eb',
                    '#8b5cf6'
                ],
                borderWidth: 1,
                borderRadius: 4,
                barPercentage: 0.55
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#ffffff',
                    bodyColor: '#e2e8f0',
                    borderColor: '#cbd5e1',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#475569', font: { family: 'Inter', size: 11 } }
                },
                y: {
                    grid: { color: '#f1f5f9' },
                    ticks: { color: '#475569', font: { family: 'Inter', size: 11 } }
                }
            }
        }
    });

    // 2. Incident Trends over last 6 hours (Area Line Chart)
    trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'],
            datasets: [{
                label: 'Violations Rate',
                data: [35, 48, 52, 28, 41, 18],
                fill: true,
                backgroundColor: blueGradient,
                borderColor: '#2563eb',
                borderWidth: 2,
                tension: 0.35,
                pointBackgroundColor: '#2563eb',
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#ffffff',
                    bodyColor: '#e2e8f0',
                    borderColor: '#cbd5e1',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#475569', font: { family: 'Inter', size: 11 } }
                },
                y: {
                    grid: { color: '#f1f5f9' },
                    ticks: { color: '#475569', font: { family: 'Inter', size: 11 } }
                }
            }
        }
    });
}

function updateDashboardUI() {
    document.getElementById('processedCountEl').textContent = state.dashboardStats.processedCount;
    document.getElementById('violationCountEl').textContent = state.dashboardStats.violationCount;
    document.getElementById('challanRevenueEl').textContent = `$${state.dashboardStats.challanRevenue.toLocaleString()}`;
    document.getElementById('accuracyEl').textContent = `${state.dashboardStats.accuracy}%`;
}

// 4. File Upload Logic
function initUpload() {
    const fileInput = document.getElementById('fileInput');
    const dragArea = document.getElementById('dragArea');
    const placeholder = document.getElementById('uploadPlaceholder');
    const canvasContainer = document.getElementById('canvasContainer');
    
    // Trigger file select
    placeholder.addEventListener('click', () => fileInput.click());
    
    // Drag-and-drop actions
    dragArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dragArea.classList.add('drag-over');
    });
    
    dragArea.addEventListener('dragleave', () => {
        dragArea.classList.remove('drag-over');
    });
    
    dragArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dragArea.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleUploadedFile(files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleUploadedFile(e.target.files[0]);
        }
    });
}

function handleUploadedFile(file) {
    if (!file.type.match('image.*')) {
        alert('Please upload a valid image file (PNG/JPG).');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        // Clear active samples in UI list
        document.querySelectorAll('.sample-card').forEach(c => c.classList.remove('active'));
        
        state.uploadedImageSrc = e.target.result;
        state.uploadedImageName = file.name;
        state.activeDetectionKey = null; // Custom uploaded image
        
        runInference(e.target.result, true);
    };
    reader.readAsDataURL(file);
}

// 5. Sample Images Gallery Logic
function initSamples() {
    const sampleCards = document.querySelectorAll('.sample-card');
    sampleCards.forEach(card => {
        card.addEventListener('click', () => {
            const key = card.getAttribute('data-sample-key');
            if (key && sampleDetections[key]) {
                // Remove active class from others
                sampleCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                
                state.uploadedImageSrc = null;
                state.uploadedImageName = null;
                state.activeDetectionKey = key;
                
                const detectionData = sampleDetections[key];
                runInference(detectionData.imagePath, false);
            }
        });
    });
}

// 6. Computer Vision Scanning Simulation & Canvas Rendering
function isTrafficImage(filename) {
    if (!filename) return true; // fallback
    const keywords = ['car', 'bike', 'truck', 'traffic', 'road', 'street', 'highway', 'vehicle', 'plate', 'signal', 'helmet', 'riding', 'parking', 'violation', 'speed', 'accident', 'motorcycle', 'scooter', 'intersection', 'junction', 'lane', 'crossing'];
    const lowerName = filename.toLowerCase();
    return keywords.some(kw => lowerName.includes(kw));
}

function runInference(imgSource, isCustomUpload) {
    if (state.isScanning) return;
    
    state.isScanning = true;
    
    // UI elements
    const dragArea = document.getElementById('dragArea');
    const placeholder = document.getElementById('uploadPlaceholder');
    const canvasContainer = document.getElementById('canvasContainer');
    const scanLine = document.getElementById('scanLine');
    const overlayText = document.getElementById('overlayText');
    const detailsContent = document.getElementById('detailsContent');
    const emptyDetails = document.getElementById('emptyDetails');
    
    // Toggle Viewport state
    dragArea.classList.add('has-image');
    placeholder.style.display = 'none';
    canvasContainer.classList.add('active');
    
    // Toggle Scanner Animations
    scanLine.classList.add('scanning');
    overlayText.classList.add('scanning');
    overlayText.textContent = "AI ANALYSIS RUNNING...";
    
    // Clear sidebar details during scan
    emptyDetails.style.display = 'flex';
    detailsContent.style.display = 'none';
    
    // Draw base image to Canvas to calculate dimensions
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
        // Match canvas logical size to image actual size (limiting max dimensions for rendering)
        const maxDim = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
            if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
            } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
            }
        }
        canvas.width = w;
        canvas.height = h;
        
        // Initial drawing of clean image
        ctx.drawImage(img, 0, 0, w, h);
        
        // Simulate inference latency (1.5 seconds)
        setTimeout(() => {
            state.isScanning = false;
            scanLine.classList.remove('scanning');
            overlayText.classList.remove('scanning');
            
            // Increment dashboard stats
            state.dashboardStats.processedCount++;
            
            // Get detection metadata
            let detectionData;
            if (isCustomUpload) {
                // Generate a smart mock violation/detection based on filename keywords
                detectionData = generateCustomMockDetection(state.uploadedImageName);
            } else {
                detectionData = sampleDetections[state.activeDetectionKey];
            }
            
            // Save global state references for threshold filtering redrawing
            state.currentImage = img;
            state.currentDetectionData = detectionData;
            
            // Draw boxes and populate UI
            drawDetections(img, detectionData);
            populateDetails(detectionData);
            
            // Increment statistics on violation count (only if detections exist and pass confidence threshold)
            if (!detectionData.isNonTraffic) {
                const threshold = state.confidenceThreshold || 0.65;
                const hasViolations = detectionData.violations
                    .filter(v => v.confidence >= threshold)
                    .some(v => v.severity !== 'none');
                
                if (hasViolations) {
                    state.dashboardStats.violationCount++;
                    updateChartsWithNewViolation(detectionData);
                }
            }
            updateDashboardUI();
            
        }, 1500);
    };
    
    img.onerror = () => {
        alert("Error loading the image. Please try again.");
        resetWorkspace();
    };
    
    img.src = imgSource;
}

// Draw bounding boxes on canvas
function drawDetections(img, data) {
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');
    
    // Redraw base image first
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    if (data.isNonTraffic) return;
    
    // Filter violations by confidence threshold
    const threshold = state.confidenceThreshold || 0.65;
    const filteredDetections = data.violations.filter(v => v.confidence >= threshold);
    
    // Loop through violations and draw box
    filteredDetections.forEach(v => {
        const box = v.box;
        
        // Calculate coordinates relative to canvas size
        const x = (box.x / 100) * canvas.width;
        const y = (box.y / 100) * canvas.height;
        const w = (box.w / 100) * canvas.width;
        const h = (box.h / 100) * canvas.height;
        
        // Choose color based on label/severity
        let color = '#2563eb'; // Enterprise Blue (Safe / Plate)
        if (v.label === 'License Plate') {
            color = '#8b5cf6'; // Enterprise Violet (OCR / License Plate)
        } else if (v.severity === 'high') {
            color = '#dc2626'; // Enterprise Red (High severity)
        } else if (v.severity === 'medium') {
            color = '#f59e0b'; // Enterprise Amber (Medium severity)
        }
        
        // Draw bounding box
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, canvas.width / 300);
        ctx.strokeRect(x, y, w, h);
        
        // Draw label background
        ctx.fillStyle = color;
        const padding = 5;
        const fontSize = Math.max(9, Math.round(canvas.width / 50));
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        
        let labelText = `${v.label} (${Math.round(v.confidence * 100)}%)`;
        if (v.label === 'License Plate' && data.plate && data.plate !== '-') {
            labelText = `License Plate: ${data.plate} (${Math.round(v.confidence * 100)}%)`;
        }
        const textWidth = ctx.measureText(labelText).width;
        
        // Draw tag background
        ctx.fillRect(x - ctx.lineWidth/2, y - fontSize - padding, textWidth + padding * 2, fontSize + padding);
        
        // Draw label text
        ctx.fillStyle = '#ffffff'; // High contrast white text
        ctx.fillText(labelText, x + padding - ctx.lineWidth/2, y - padding/2);
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
    
    const statusTextEl = document.getElementById('inferenceStatusText');
    const statusBadgeEl = document.getElementById('inferenceStatusBadge');
    const nonTrafficAlertEl = document.getElementById('nonTrafficAlert');
    
    if (data.isNonTraffic) {
        titleEl.textContent = "No Traffic Scene Detected";
        locationEl.textContent = "-";
        speedEl.textContent = "-";
        plateEl.textContent = "-";
        listEl.innerHTML = '';
        
        // Update status badge to unrelated
        statusTextEl.textContent = "NON-TRAFFIC SCENE DETECTED";
        statusBadgeEl.className = "inference-badge badge-unrelated";
        
        // Display warning panel
        nonTrafficAlertEl.style.display = 'flex';
        
        // Hide Challan action
        document.getElementById('btnOpenChallan').style.display = 'none';
        
        emptyDetails.style.display = 'none';
        detailsContent.style.display = 'flex';
        return;
    }
    
    // Hide warning panel for traffic images
    nonTrafficAlertEl.style.display = 'none';
    
    // Update status badge to confirmed
    statusTextEl.textContent = "TRAFFIC SCENE CONFIRMED";
    statusBadgeEl.className = "inference-badge badge-confirmed";
    
    titleEl.textContent = data.title;
    locationEl.textContent = data.location;
    speedEl.textContent = data.speed;
    plateEl.textContent = data.plate;
    
    // Build violation items
    listEl.innerHTML = '';
    
    // Filter violations by confidence threshold
    const threshold = state.confidenceThreshold || 0.65;
    const filteredDetections = data.violations.filter(v => v.confidence >= threshold);
    
    let fineSum = 0;
    
    if (filteredDetections.length === 0) {
        listEl.innerHTML = `
            <div class="empty-details-msg" style="padding: 20px 0; border: 1px dashed var(--border-color); border-radius: 6px; margin-bottom: 16px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 28px; height: 28px; margin-bottom: 8px;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <p style="font-size: 0.75rem;">No detections above confidence threshold (${Math.round(threshold * 100)}%).</p>
            </div>
        `;
    } else {
        filteredDetections.forEach(v => {
            const isViolation = v.severity !== 'none';
            if (isViolation) {
                fineSum += v.fine || 0;
            }
            
            const item = document.createElement('div');
            item.className = 'violation-detail-item';
            
            const pct = Math.round(v.confidence * 100);
            
            item.innerHTML = `
                <div class="violation-type-label">
                    <span class="violation-name">${v.label}</span>
                    <span class="violation-severity ${v.severity}">${v.severity.toUpperCase()} SEVERITY ${isViolation ? `(${v.offense})` : ''}</span>
                </div>
                <div class="violation-score-container" style="flex: 1; max-width: 120px; margin-left: 16px; display: flex; flex-direction: column; align-items: stretch;">
                    <div class="violation-score-bar-wrapper" style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-bottom: 4px;">
                        <div class="violation-score-bar" style="width: ${pct}%; height: 100%; background: ${v.label === 'License Plate' ? '#8b5cf6' : v.severity === 'high' ? 'var(--color-danger)' : v.severity === 'medium' ? 'var(--color-warning)' : 'var(--primary)'}; border-radius: 3px;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted);">
                        <span>Conf.</span>
                        <strong>${pct}%</strong>
                    </div>
                </div>
            `;
            listEl.appendChild(item);
        });
    }
    
    // Enable/Disable Challan Button
    const challanBtn = document.getElementById('btnOpenChallan');
    if (fineSum > 0) {
        challanBtn.style.display = 'flex';
        challanBtn.innerHTML = `<span>Generate E-Challan ($${fineSum})</span>`;
        challanBtn.onclick = () => openChallanModal(data, fineSum);
    } else {
        challanBtn.style.display = 'none';
    }
    
    emptyDetails.style.display = 'none';
    detailsContent.style.display = 'flex';
}

function resetWorkspace() {
    const dragArea = document.getElementById('dragArea');
    const placeholder = document.getElementById('uploadPlaceholder');
    const canvasContainer = document.getElementById('canvasContainer');
    const detailsContent = document.getElementById('detailsContent');
    const emptyDetails = document.getElementById('emptyDetails');
    
    dragArea.classList.remove('has-image');
    placeholder.style.display = 'flex';
    canvasContainer.classList.remove('active');
    emptyDetails.style.display = 'flex';
    detailsContent.style.display = 'none';
    
    state.uploadedImageSrc = null;
    state.uploadedImageName = null;
    state.activeDetectionKey = null;
    state.currentImage = null;
    state.currentDetectionData = null;
    
    // Reset slider in UI
    const slider = document.getElementById('confidenceSlider');
    const valDisplay = document.getElementById('thresholdValue');
    if (slider && valDisplay) {
        slider.value = 65;
        valDisplay.textContent = '65%';
        state.confidenceThreshold = 0.65;
    }
    
    // Clear custom file input value so same file can be uploaded again
    document.getElementById('fileInput').value = '';
    document.querySelectorAll('.sample-card').forEach(c => c.classList.remove('active'));
}

// Generate randomized detection parameters for manual custom file upload
function generateCustomMockDetection(filename) {
    const isTraffic = isTrafficImage(filename);
    
    if (!isTraffic) {
        return {
            title: "Non-Traffic Scene Detected",
            isNonTraffic: true,
            plate: "-",
            vehicle: "-",
            location: "Unknown Location",
            speed: "-",
            owner: "-",
            ownerPhone: "",
            violations: []
        };
    }
    
    const plates = ["DL4S-CQ-1084", "MH14-DA-7788", "HR26-ED-2245", "UP16-AM-4491", "KA51-NB-1090"];
    const randomPlate = plates[Math.floor(Math.random() * plates.length)];
    const locations = ["High Street Intersection", "MG Road Traffic Post 07", "Ring Road Flyover Entrance", "Sector 62 Crossing"];
    const randomLoc = locations[Math.floor(Math.random() * locations.length)];
    const randomSpeedVal = Math.floor(Math.random() * 45) + 35; // 35 to 80 km/h
    
    // Determine random violation
    const violationRnd = Math.random();
    let violations = [];
    let title = "Vehicle Speed Alert";
    let speedLabel = `${randomSpeedVal} km/h`;
    
    if (violationRnd < 0.35) { // Speed violation
        title = "Speed Limit Infringement";
        violations = [
            {
                label: "Car",
                offense: `Overspeeding (${randomSpeedVal}km/h)`,
                confidence: 0.91,
                severity: "high",
                fine: 150,
                box: { x: 20, y: 20, w: 60, h: 60 }
            },
            {
                label: "License Plate",
                confidence: 0.95,
                severity: "none",
                box: { x: 47, y: 66.5, w: 6, h: 3 }
            }
        ];
    } else if (violationRnd < 0.7) { // No Helmet
        title = "No Helmet Flagged";
        violations = [
            {
                label: "Bike",
                offense: "No Helmet Rider",
                confidence: 0.88,
                severity: "high",
                fine: 100,
                box: { x: 30, y: 15, w: 40, h: 70 }
            },
            {
                label: "License Plate",
                confidence: 0.93,
                severity: "none",
                box: { x: 47, y: 73, w: 6, h: 3 }
            }
        ];
    } else { // Generic Clean Vehicle
        title = "Vehicle Verification Scan";
        violations = [
            {
                label: "Car",
                offense: "Safe Vehicle",
                confidence: 0.96,
                severity: "none",
                fine: 0,
                box: { x: 15, y: 25, w: 70, h: 55 }
            },
            {
                label: "Traffic Signal",
                confidence: 0.92,
                severity: "none",
                box: { x: 75, y: 10, w: 8, h: 22 }
            },
            {
                label: "License Plate",
                confidence: 0.98,
                severity: "none",
                box: { x: 47, y: 66.5, w: 6, h: 3 }
            }
        ];
    }
    
    return {
        title: title,
        plate: randomPlate,
        vehicle: "Vehicle Class - Regular",
        location: randomLoc,
        speed: speedLabel,
        owner: "Registration Records (Mock Owner)",
        ownerPhone: "+91 99000 11223",
        violations: violations
    };
}

// 7. Update Charts dynamically when violations are triggered
function updateChartsWithNewViolation(data) {
    if (!violationChart || !trendChart) return;
    
    // 1. Update Breakdown chart values
    // Find the core violation name using label and offense mapping
    data.violations.forEach(v => {
        if (v.severity === 'none') return;
        
        let labelIndex = -1;
        const targetText = (v.label + ' ' + (v.offense || '')).toLowerCase();
        if (targetText.includes("helmet") || targetText.includes("head")) {
            labelIndex = 0; // No Helmet
        } else if (targetText.includes("triple") || targetText.includes("riding")) {
            labelIndex = 1; // Triple Riding
        } else if (targetText.includes("parking") || targetText.includes("curb")) {
            labelIndex = 2; // Wrong Parking
        } else if (targetText.includes("signal") || targetText.includes("crossing") || targetText.includes("red") || targetText.includes("light")) {
            labelIndex = 3; // Signal Jumping
        }
        
        if (labelIndex !== -1) {
            violationChart.data.datasets[0].data[labelIndex]++;
        }
    });
    violationChart.update();
    
    // 2. Update Trend chart (increment the latest hour data point by 1)
    const trendData = trendChart.data.datasets[0].data;
    trendData[trendData.length - 1]++;
    trendChart.update();
    
    // 3. Update dashboard revenue stats
    let fineAmt = 0;
    data.violations.forEach(v => {
        fineAmt += v.fine || 0;
    });
    state.dashboardStats.challanRevenue += fineAmt;
}

// 8. E-Challan Generator & Modal Dialog
function initModal() {
    const overlay = document.getElementById('challanModal');
    const closeBtn = document.getElementById('closeModalBtn');
    
    closeBtn.addEventListener('click', () => {
        overlay.classList.remove('active');
    });
    
    // Close on click outside modal
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
        }
    });
}

function openChallanModal(data, totalFine) {
    const overlay = document.getElementById('challanModal');
    
    // Mock details
    const challanNum = 'TX-2026-' + Math.floor(Math.random() * 90000 + 10000);
    const dateStr = new Date().toLocaleString('en-US', { hour12: false });
    
    // Map values
    document.getElementById('mChallanNo').textContent = challanNum;
    document.getElementById('mTimestamp').textContent = dateStr;
    document.getElementById('mPlateNo').textContent = data.plate;
    document.getElementById('mOwnerName').textContent = data.owner;
    document.getElementById('mVehicleDetails').textContent = data.vehicle;
    document.getElementById('mOffenseLocation').textContent = data.location;
    
    // List core violations
    const violationsNames = data.violations
        .filter(v => v.severity !== 'none')
        .map(v => v.offense || v.label)
        .join(', ');
    document.getElementById('mOffenseType').textContent = violationsNames;
    document.getElementById('mFineAmount').textContent = `$${totalFine}`;
    
    // Set Snapshot Image (use the canvas rendering image directly)
    const modalImg = document.getElementById('mSnapshotImg');
    
    if (state.uploadedImageSrc) {
        modalImg.src = state.uploadedImageSrc;
    } else if (state.activeDetectionKey) {
        modalImg.src = sampleDetections[state.activeDetectionKey].imagePath;
    } else {
        modalImg.src = "images/samples/no_helmet.png";
    }
    
    // Setup Action Handlers inside Modal
    document.getElementById('btnPayChallan').onclick = () => {
        showToast("Payment Successful", `Challan ${challanNum} has been paid and marked cleared in records.`);
        overlay.classList.remove('active');
    };
    
    document.getElementById('btnDispatchSMS').onclick = () => {
        showToast("E-Challan Dispatched", `Notification alert and payment link sent to ${data.ownerPhone}.`);
        overlay.classList.remove('active');
    };
    
    overlay.classList.add('active');
}

// 9. Toast Notification system
function showToast(title, body) {
    const toast = document.getElementById('toast');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastBody').textContent = body;
    
    toast.classList.add('active');
    setTimeout(() => {
        toast.classList.remove('active');
    }, 4000);
}

// 10. Live Traffic Camera Feed Simulator
function initSimulator() {
    const toggleBtn = document.getElementById('btnToggleSim');
    
    toggleBtn.addEventListener('click', () => {
        if (state.sim.isRunning) {
            toggleSimulator(false);
        } else {
            toggleSimulator(true);
        }
    });
    
    // Pre-populate camera logs list
    const logFeed = document.getElementById('logFeed');
    logFeed.innerHTML = `
        <div class="log-item">
            <div class="log-header">
                <span class="log-title">System Initialized</span>
                <span class="log-time">23:05:00</span>
            </div>
            <div class="log-desc">AI Edge processing nodes listening to Camera Feed 01-04.</div>
        </div>
    `;
}

function toggleSimulator(start) {
    const toggleBtn = document.getElementById('btnToggleSim');
    const simStatusEl = document.getElementById('simStatusText');
    const dotEl = document.getElementById('simPulseDot');
    
    if (start) {
        state.sim.isRunning = true;
        toggleBtn.innerHTML = `
            <svg style="width:18px;height:18px;stroke:currentColor;fill:none;" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect></svg>
            <span>Pause Camera Feed</span>
        `;
        toggleBtn.classList.remove('btn-ctrl-primary');
        toggleBtn.classList.add('btn-ctrl-secondary');
        simStatusEl.textContent = "Feed Active (Simulating)";
        simStatusEl.style.color = "var(--primary)";
        dotEl.style.backgroundColor = "var(--primary)";
        dotEl.style.boxShadow = "none";
        
        // Start simulation timer
        state.sim.intervalId = setInterval(runSimulationStep, 2500); // Step every 2.5 seconds
        runSimulationStep(); // Immediate run
    } else {
        state.sim.isRunning = false;
        toggleBtn.innerHTML = `
            <svg style="width:18px;height:18px;stroke:#070a13;fill:none;" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Start Camera Feed</span>
        `;
        toggleBtn.classList.remove('btn-ctrl-secondary');
        toggleBtn.classList.add('btn-ctrl-primary');
        simStatusEl.textContent = "Feed Paused";
        simStatusEl.style.color = "var(--text-muted)";
        dotEl.style.backgroundColor = "var(--text-dark)";
        dotEl.style.boxShadow = "none";
        
        clearInterval(state.sim.intervalId);
    }
}

function runSimulationStep() {
    const canvas = document.getElementById('simulatorCanvas');
    const ctx = canvas.getContext('2d');
    
    // Load next image in cycle
    const key = state.sim.cameraKeys[state.sim.currentFrameIndex];
    const data = sampleDetections[key];
    const img = new Image();
    
    img.onload = () => {
        // Draw to simulator canvas
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        // Draw Bounding boxes on the Simulator Feed
        data.violations.forEach(v => {
            const box = v.box;
            const x = (box.x / 100) * canvas.width;
            const y = (box.y / 100) * canvas.height;
            const w = (box.w / 100) * canvas.width;
            const h = (box.h / 100) * canvas.height;
            
            let color = '#059669'; // Enterprise Green (Safe / Compliance)
            if (v.label === 'License Plate') {
                color = '#8b5cf6'; // Enterprise Violet (OCR / License Plate)
            } else if (v.severity === 'high') {
                color = '#dc2626'; // Enterprise Red (High severity)
            } else if (v.severity === 'medium') {
                color = '#f59e0b'; // Enterprise Amber (Medium severity)
            }
            
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(2.5, canvas.width / 180);
            ctx.strokeRect(x, y, w, h);
            
            // Text tag background
            ctx.fillStyle = color;
            const fontSize = Math.max(10, Math.round(canvas.width / 45));
            ctx.font = `bold ${fontSize}px Inter, sans-serif`;
            
            let tagStr = `${v.label}`;
            if (v.label === 'License Plate' && data.plate && data.plate !== '-') {
                tagStr = `Plate: ${data.plate}`;
            }
            const labelWidth = ctx.measureText(tagStr).width;
            ctx.fillRect(x - ctx.lineWidth/2, y - fontSize - 5, labelWidth + 10, fontSize + 5);
            
            // Text color white
            ctx.fillStyle = '#ffffff';
            ctx.fillText(tagStr, x + 5 - ctx.lineWidth/2, y - 4);
        });
        
        // Output live camera log
        logCameraIncident(data);
        
        // Update stats
        state.dashboardStats.processedCount++;
        const hasViolations = data.violations.some(v => v.severity !== 'none');
        if (hasViolations) {
            state.dashboardStats.violationCount++;
            state.dashboardStats.challanRevenue += data.violations.reduce((sum, v) => sum + (v.fine || 0), 0);
            updateChartsWithNewViolation(data);
        }
        updateDashboardUI();
        
        // Cycle frame pointer
        state.sim.currentFrameIndex = (state.sim.currentFrameIndex + 1) % state.sim.cameraKeys.length;
    };
    img.src = data.imagePath;
}

function logCameraIncident(data) {
    const logFeed = document.getElementById('logFeed');
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    // Core violation name
    const activeViolations = data.violations.filter(v => v.severity !== 'none');
    
    let isDanger = activeViolations.some(v => v.severity === 'high');
    let isWarning = activeViolations.some(v => v.severity === 'medium') && !isDanger;
    
    let classModifier = '';
    let logTitle = 'Vehicle Checked';
    let logDesc = `Plate ${data.plate} scanned successfully. No violation identified.`;
    
    if (activeViolations.length > 0) {
        logTitle = `Violation Detected!`;
        const names = activeViolations.map(v => v.label).join(' & ');
        logDesc = `${names} flagged on ${data.plate} at ${data.location}.`;
        
        if (isDanger) {
            classModifier = 'log-danger';
        } else if (isWarning) {
            classModifier = 'log-warning';
        }
    }
    
    const logItem = document.createElement('div');
    logItem.className = `log-item ${classModifier}`;
    logItem.innerHTML = `
        <div class="log-header">
            <span class="log-title">${logTitle}</span>
            <span class="log-time">${timeStr}</span>
        </div>
        <div class="log-desc">${logDesc}</div>
    `;
    
    logFeed.insertBefore(logItem, logFeed.firstChild);
    
    // Keep max 20 logs
    while (logFeed.children.length > 20) {
        logFeed.removeChild(logFeed.lastChild);
    }
}

// 11. Presentation/Pitch Deck Navigation Logic
function initPresentation() {
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    const prevBtn = document.getElementById('btnPrevSlide');
    const nextBtn = document.getElementById('btnNextSlide');
    
    const showSlide = (index) => {
        state.pitchSlide = index;
        
        slides.forEach((slide, i) => {
            if (i === index) slide.classList.add('active');
            else slide.classList.remove('active');
        });
        
        dots.forEach((dot, i) => {
            if (i === index) dot.classList.add('active');
            else dot.classList.remove('active');
        });
        
        // Button states
        prevBtn.disabled = index === 0;
        nextBtn.disabled = index === slides.length - 1;
    };
    
    // Event handlers for arrows
    prevBtn.addEventListener('click', () => {
        if (state.pitchSlide > 0) showSlide(state.pitchSlide - 1);
    });
    
    nextBtn.addEventListener('click', () => {
        if (state.pitchSlide < slides.length - 1) showSlide(state.pitchSlide + 1);
    });
    
    // Event handlers for dots
    dots.forEach((dot, i) => {
        dot.addEventListener('click', () => showSlide(i));
    });
    
    // Show first slide
    showSlide(0);
}
