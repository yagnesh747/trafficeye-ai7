// TrafficEye AI - Core JavaScript Logic

// TrafficEye BTP - Core JavaScript Logic

// Database of mock detections for sample traffic images
const sampleDetections = {
    no_helmet: {
        title: "No Helmet Rider Detection",
        imagePath: "images/samples/no_helmet.png",
        plate: "KA-03-MQ-4820",
        vehicle: "Suzuki Access 125 (Black)",
        location: "Koramangala 80 Ft Road",
        speed: "34 km/h",
        owner: "Rahul A. Sharma",
        ownerPhone: "+91 98765 43210",
        violations: [
            {
                label: "Two-Wheeler",
                offense: "No Helmet Rider",
                confidence: 0.92,
                severity: "high",
                fine: 500,
                // percentage coordinates x, y, width, height
                box: { x: 29, y: 32, w: 37, h: 56 }
            },
            {
                label: "License Plate",
                confidence: 0.88,
                severity: "none",
                box: { x: 33, y: 70, w: 8, h: 5 }
            }
        ]
    },
    triple_riding: {
        title: "Triple Riding Infraction",
        imagePath: "images/samples/triple_riding.png",
        plate: "KA-01-AB-9031",
        vehicle: "Honda Activa 6G (Grey)",
        location: "Silk Board Junction",
        speed: "28 km/h",
        owner: "Vikram Singh",
        ownerPhone: "+91 87654 32109",
        violations: [
            {
                label: "Two-Wheeler",
                offense: "Triple Riding",
                confidence: 0.89,
                severity: "high",
                fine: 1000,
                box: { x: 36, y: 39, w: 33, h: 44 }
            },
            {
                label: "License Plate",
                confidence: 0.79,
                severity: "none",
                box: { x: 39, y: 69, w: 4, h: 3 }
            }
        ]
    },
    wrong_parking: {
        title: "Wrong Parking Violation",
        imagePath: "images/samples/wrong_parking.png",
        plate: "KA-03-MM-7721",
        vehicle: "Hyundai Verna (White)",
        location: "MG Road",
        speed: "0 km/h (Stationary)",
        owner: "Anita K. Rangan",
        ownerPhone: "+91 76543 21098",
        violations: [
            {
                label: "Four-Wheeler",
                offense: "No Parking Zone",
                confidence: 0.91,
                severity: "medium",
                fine: 500,
                box: { x: 17, y: 43, w: 47, h: 35 }
            },
            {
                label: "License Plate",
                confidence: 0.84,
                severity: "none",
                box: { x: 32, y: 61, w: 7, h: 3 }
            }
        ]
    },
    signal_jumping: {
        title: "Signal Jumping Evaded",
        imagePath: "images/samples/signal_jumping.png",
        plate: "KA-05-ND-5512",
        vehicle: "Maruti Suzuki Swift (Red)",
        location: "Marathahalli Bridge",
        speed: "58 km/h",
        owner: "Devender Yadav",
        ownerPhone: "+91 99999 88888",
        violations: [
            {
                label: "Four-Wheeler",
                offense: "Red Light Violation",
                confidence: 0.90,
                severity: "high",
                fine: 1000,
                box: { x: 18, y: 51, w: 48, h: 22 }
            },
            {
                label: "Traffic Signal",
                confidence: 0.94,
                severity: "none",
                box: { x: 38, y: 9, w: 9, h: 11 }
            },
            {
                label: "License Plate",
                confidence: 0.81,
                severity: "none",
                box: { x: 60, y: 65, w: 4, h: 2.5 }
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
        violationsDetectedToday: 142,
        activeCases: 48,
        generatedChallans: 94,
        avgConfidence: 84.6
    },
    challans: [
        {
            id: 'BLR-TE-2026-8812',
            plate: 'KA-03-MQ-4820',
            offense: 'No Helmet Rider',
            location: 'Koramangala 80 Ft Road',
            timestamp: '15-JUN-2026 21:04',
            fine: 500,
            status: 'unpaid',
            owner: 'Rahul A. Sharma',
            vehicle: 'Suzuki Access 125 (Black)',
            ownerPhone: '+91 98765 43210'
        },
        {
            id: 'BLR-TE-2026-8794',
            plate: 'KA-01-AB-9031',
            offense: 'Triple Riding',
            location: 'Silk Board Junction',
            timestamp: '15-JUN-2026 20:30',
            fine: 1000,
            status: 'unpaid',
            owner: 'Vikram Singh',
            vehicle: 'Honda Activa 6G (Grey)',
            ownerPhone: '+91 87654 32109'
        },
        {
            id: 'BLR-TE-2026-8744',
            plate: 'KA-03-MM-7721',
            offense: 'No Parking Zone',
            location: 'MG Road',
            timestamp: '15-JUN-2026 19:15',
            fine: 500,
            status: 'paid',
            owner: 'Anita K. Rangan',
            vehicle: 'Hyundai Verna (White)',
            ownerPhone: '+91 76543 21098'
        },
        {
            id: 'BLR-TE-2026-8691',
            plate: 'KA-05-ND-5512',
            offense: 'Red Light Violation',
            location: 'Marathahalli Bridge',
            timestamp: '15-JUN-2026 18:45',
            fine: 1000,
            status: 'dispatched',
            owner: 'Devender Yadav',
            vehicle: 'Maruti Suzuki Swift (Red)',
            ownerPhone: '+91 99999 88888'
        }
    ]
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
    initChallanTab();
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
                titleEl.textContent = "Traffic Enforcement Dashboard";
                subtitleEl.textContent = "Bengaluru City Municipal Enforcement Analytics & Oversight Console.";
                break;
            case 'detection':
                titleEl.textContent = "Traffic Violation Review";
                subtitleEl.textContent = "Enforcement review system for automated detections and OCR verification.";
                break;
            case 'challan':
                titleEl.textContent = "E-Challan Portal";
                subtitleEl.textContent = "Digital traffic violation report and dispatch ledger.";
                renderChallanLedger();
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
    blueGradient.addColorStop(0, 'rgba(30, 64, 175, 0.15)');
    blueGradient.addColorStop(1, 'rgba(30, 64, 175, 0.0)');

    // 1. Violation Distribution (Bar Chart)
    violationChart = new Chart(violationCtx, {
        type: 'bar',
        data: {
            labels: ['No Helmet', 'Triple Riding', 'Wrong Parking', 'Signal Jumping'],
            datasets: [{
                label: 'Cases Detected',
                data: [142, 88, 172, 60],
                backgroundColor: [
                    '#D97706', // Warning Amber
                    '#B91C1C', // Danger Red
                    '#1E40AF', // Primary Blue
                    '#15803D'  // Success Green
                ],
                borderColor: [
                    '#D97706',
                    '#B91C1C',
                    '#1E40AF',
                    '#15803D'
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
                    grid: { color: '#e2e8f0' },
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
                borderColor: '#1E40AF',
                borderWidth: 2,
                tension: 0.35,
                pointBackgroundColor: '#1E40AF',
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
                    grid: { color: '#e2e8f0' },
                    ticks: { color: '#475569', font: { family: 'Inter', size: 11 } }
                }
            }
        }
    });
}

function updateDashboardUI() {
    document.getElementById('violationsDetectedTodayEl').textContent = state.dashboardStats.violationsDetectedToday;
    document.getElementById('activeCasesEl').textContent = state.dashboardStats.activeCases;
    document.getElementById('generatedChallansEl').textContent = state.dashboardStats.generatedChallans;
    document.getElementById('avgConfidenceEl').textContent = `${state.dashboardStats.avgConfidence}%`;
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
            
            // Detections are evaluated dynamically below
            
            // Get detection metadata
            let detectionData;
            if (isCustomUpload) {
                // Generate a smart mock violation/detection based on filename keywords
                detectionData = generateCustomMockDetection(state.uploadedImageName);
            } else {
                // Clone the sample data to avoid permanently mutating the template values
                detectionData = JSON.parse(JSON.stringify(sampleDetections[state.activeDetectionKey]));
            }
            
            // Save global state references for threshold filtering redrawing
            state.currentImage = img;
            state.currentDetectionData = detectionData;
            
            // Detect the license plate region
            const plateViolation = detectionData.isNonTraffic ? null : detectionData.violations.find(v => v.label === 'License Plate');
            
            if (plateViolation && plateViolation.box) {
                // Set intermediate loading state
                detectionData.plate = "Processing OCR...";
                
                // Draw initial detections and populate details (showing "Processing OCR...")
                drawDetections(img, detectionData);
                populateDetails(detectionData);
                
                // Crop the license plate region using a temporary canvas
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                
                const cropX = (plateViolation.box.x / 100) * img.naturalWidth;
                const cropY = (plateViolation.box.y / 100) * img.naturalHeight;
                const cropW = (plateViolation.box.w / 100) * img.naturalWidth;
                const cropH = (plateViolation.box.h / 100) * img.naturalHeight;
                
                tempCanvas.width = cropW;
                tempCanvas.height = cropH;
                
                tempCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                
                // Run OCR using Tesseract.js
                Tesseract.recognize(
                    tempCanvas,
                    'eng',
                    {
                        logger: m => console.log(m)
                    }
                ).then(({ data: { text, confidence } }) => {
                    console.log("OCR Result Text:", text, "Confidence:", confidence);
                    
                    // Clean text (remove whitespace and non-alphanumeric/hyphen/space characters)
                    const cleanedText = text.trim().replace(/[^A-Za-z0-9\- ]/g, '');
                    
                    if (cleanedText.length >= 3 && confidence >= 35) {
                        detectionData.plate = `${cleanedText} (${Math.round(confidence)}%)`;
                    } else {
                        detectionData.plate = "Plate could not be confidently recognized.";
                    }
                    
                    // Update UI only if this detection is still the active one
                    if (state.currentDetectionData === detectionData) {
                        drawDetections(img, detectionData);
                        populateDetails(detectionData);
                    }
                }).catch(err => {
                    console.error("OCR Error:", err);
                    detectionData.plate = "Plate could not be confidently recognized.";
                    if (state.currentDetectionData === detectionData) {
                        drawDetections(img, detectionData);
                        populateDetails(detectionData);
                    }
                });
            } else {
                // If there's no license plate region or it's a non-traffic scene
                if (!detectionData.isNonTraffic) {
                    detectionData.plate = "Plate could not be confidently recognized.";
                }
                
                drawDetections(img, detectionData);
                populateDetails(detectionData);
            }
            
            // Increment statistics on violation count (only if detections exist and pass confidence threshold)
            if (!detectionData.isNonTraffic) {
                const threshold = state.confidenceThreshold || 0.65;
                const hasViolations = detectionData.violations
                    .filter(v => v.confidence >= threshold)
                    .some(v => v.severity !== 'none');
                
                if (hasViolations) {
                    state.dashboardStats.violationsDetectedToday++;
                    state.dashboardStats.activeCases++;
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
// Mask uncertain characters if OCR confidence is low (< 85%)
function formatAndMaskPlate(plate, confidence) {
    if (!plate || plate === '-' || plate.includes("Processing") || plate.includes("recognized")) return plate;
    let cleanPlate = plate.replace(/\s*\(\d+%\)/, '');
    if (confidence && confidence < 85) {
        // Mask a middle character (e.g. KA-03-MQ-4820 -> KA-03-M?-4820)
        const parts = cleanPlate.split('-');
        if (parts.length >= 3) {
            // Usually the third part contains alphabetical series, e.g. "MQ"
            if (parts[2].length > 1) {
                parts[2] = parts[2].substring(0, parts[2].length - 1) + "?";
            } else {
                parts[2] = "?";
            }
            cleanPlate = parts.join('-');
        } else if (cleanPlate.length > 5) {
            // Generic fallback masking
            const chars = cleanPlate.split('');
            const mid = Math.floor(chars.length / 2);
            chars[mid] = '?';
            cleanPlate = chars.join('');
        }
    }
    return cleanPlate;
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
        let color = '#1E40AF'; // Primary Blue (Safe / Plate)
        if (v.label === 'License Plate') {
            color = '#8b5cf6'; // Enterprise Violet (OCR / License Plate)
        } else if (v.severity === 'high') {
            color = '#B91C1C'; // Danger Red (High severity)
        } else if (v.severity === 'medium') {
            color = '#D97706'; // Warning Amber (Medium severity)
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
            if (data.plate === 'Processing OCR...') {
                labelText = `License Plate: Reading... (${Math.round(v.confidence * 100)}%)`;
            } else if (data.plate === 'Plate could not be confidently recognized.') {
                labelText = `License Plate: Unrecognized (${Math.round(v.confidence * 100)}%)`;
            } else {
                const masked = formatAndMaskPlate(data.plate, data.ocrConfidence);
                labelText = `License Plate: ${masked} (${Math.round(v.confidence * 100)}%)`;
            }
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
    const plateConfidenceEl = document.getElementById('detailPlateConfidence');
    
    const statusTextEl = document.getElementById('inferenceStatusText');
    const statusBadgeEl = document.getElementById('inferenceStatusBadge');
    const nonTrafficAlertEl = document.getElementById('nonTrafficAlert');
    
    if (data.isNonTraffic) {
        titleEl.textContent = "No Traffic Scene Detected";
        locationEl.textContent = "-";
        speedEl.textContent = "-";
        plateEl.textContent = "-";
        if (plateConfidenceEl) plateConfidenceEl.textContent = "-";
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
    
    // Plate & Confidence formatting
    if (data.plate === "Processing OCR...") {
        plateEl.textContent = "Processing OCR...";
        if (plateConfidenceEl) plateConfidenceEl.textContent = "Reading...";
    } else if (data.plate === "Plate could not be confidently recognized.") {
        plateEl.textContent = "Unrecognized";
        if (plateConfidenceEl) plateConfidenceEl.textContent = "-";
    } else if (data.plate && data.plate !== '-') {
        plateEl.textContent = formatAndMaskPlate(data.plate, data.ocrConfidence);
        if (plateConfidenceEl) plateConfidenceEl.textContent = data.ocrConfidence ? `${data.ocrConfidence}%` : "-";
    } else {
        plateEl.textContent = "-";
        if (plateConfidenceEl) plateConfidenceEl.textContent = "-";
    }
    
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
        challanBtn.innerHTML = `<span>Generate E-Challan (₹${fineSum})</span>`;
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

/// Generate randomized detection parameters for manual custom file upload
function generateCustomMockDetection(filename) {
    const isTraffic = isTrafficImage(filename);
    
    if (!isTraffic) {
        return {
            title: "Non-Traffic Scene Detected",
            isNonTraffic: true,
            plate: "-",
            ocrConfidence: 0,
            vehicle: "-",
            location: "Unknown Location",
            speed: "-",
            owner: "-",
            ownerPhone: "",
            violations: []
        };
    }
    
    const plates = ["KA-03-MM-7721", "KA-01-AB-1234", "KA-05-XY-5678", "KA-51-NB-1090", "KA-03-MQ-4820"];
    const randomPlate = plates[Math.floor(Math.random() * plates.length)];
    const locations = [
        "Koramangala 80 Ft Road",
        "Silk Board Junction",
        "Marathahalli Bridge",
        "Electronic City Flyover",
        "MG Road"
    ];
    const randomLoc = locations[Math.floor(Math.random() * locations.length)];
    const randomSpeedVal = Math.floor(Math.random() * 45) + 35; // 35 to 80 km/h
    
    // Determine random violation
    const violationRnd = Math.random();
    let violations = [];
    let title = "Vehicle Speed Alert";
    let speedLabel = `${randomSpeedVal} km/h`;
    
    // Calculate a realistic confidence value between 75% and 92%
    const randomConfidence = Math.floor(Math.random() * (92 - 75 + 1)) + 75;
    
    if (violationRnd < 0.35) { // Speed violation
        title = "Speed Limit Infringement";
        violations = [
            {
                label: "Four-Wheeler",
                offense: `Overspeeding (${randomSpeedVal}km/h)`,
                confidence: 0.91,
                severity: "high",
                fine: 1000,
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
        title = "No Helmet Rider Detection";
        violations = [
            {
                label: "Two-Wheeler",
                offense: "No Helmet Rider",
                confidence: 0.88,
                severity: "high",
                fine: 500,
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
                label: "Four-Wheeler",
                offense: "Safe Vehicle",
                confidence: 0.96,
                severity: "none",
                fine: 0,
                box: { x: 15, y: 25, w: 70, h: 55 }
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
        ocrConfidence: randomConfidence,
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
    
    // Check if this violation already has a challan generated in our array
    let existingChallan = state.challans.find(c => c.plate === data.plate && c.location === data.location && c.fine === totalFine);
    
    let challanNum;
    if (existingChallan) {
        challanNum = existingChallan.id;
    } else {
        challanNum = 'BLR-TE-2026-' + Math.floor(Math.random() * 90000 + 10000);
        const dateStr = new Date().toLocaleString('en-US', { hour12: false });
        
        // List core violations
        const violationsNames = data.violations
            .filter(v => v.severity !== 'none')
            .map(v => v.offense || v.label)
            .join(', ');
            
        existingChallan = {
            id: challanNum,
            plate: data.plate,
            offense: violationsNames,
            location: data.location,
            timestamp: dateStr,
            fine: totalFine,
            status: 'unpaid', // starts unpaid
            owner: data.owner || "Rahul A. Sharma",
            vehicle: data.vehicle || "Suzuki Access 125 (Black)",
            ownerPhone: data.ownerPhone || "+91 98765 43210",
            ocrConfidence: data.ocrConfidence || 88
        };
        
        state.challans.push(existingChallan);
        state.dashboardStats.generatedChallans = state.challans.length;
        if (state.dashboardStats.activeCases > 0) {
            state.dashboardStats.activeCases--;
        }
        updateDashboardUI();
    }
    
    // Map values
    document.getElementById('mChallanNo').textContent = existingChallan.id;
    document.getElementById('mTimestamp').textContent = existingChallan.timestamp;
    const displayPlate = formatAndMaskPlate(existingChallan.plate, existingChallan.ocrConfidence);
    document.getElementById('mPlateNo').textContent = displayPlate;
    document.getElementById('mOwnerName').textContent = existingChallan.owner;
    document.getElementById('mVehicleDetails').textContent = existingChallan.vehicle;
    document.getElementById('mOffenseLocation').textContent = existingChallan.location;
    document.getElementById('mOffenseType').textContent = existingChallan.offense;
    document.getElementById('mFineAmount').textContent = `₹${existingChallan.fine}`;
    
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
        existingChallan.status = 'paid';
        showToast("Payment Successful", `Challan ${challanNum} has been paid and marked cleared in records.`);
        overlay.classList.remove('active');
        renderChallanLedger();
    };
    
    document.getElementById('btnDispatchSMS').onclick = () => {
        existingChallan.status = 'dispatched';
        showToast("E-Challan Dispatched", `Notification alert and payment link sent to ${existingChallan.ownerPhone}.`);
        overlay.classList.remove('active');
        renderChallanLedger();
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

// 10. E-Challan Tab Initialization and Ledger rendering
function initChallanTab() {
    const searchInput = document.getElementById('challanSearch');
    const statusFilter = document.getElementById('challanStatusFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderChallanLedger();
        });
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            renderChallanLedger();
        });
    }
}

function renderChallanLedger() {
    const searchInput = document.getElementById('challanSearch');
    const statusFilter = document.getElementById('challanStatusFilter');
    const tableBody = document.querySelector('#challanLedgerTable tbody');
    
    if (!tableBody) return;
    
    const searchText = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const selectedStatus = statusFilter ? statusFilter.value : 'all';
    
    // Filter challans based on search query and status filter
    const filtered = state.challans.filter(c => {
        const matchesSearch = c.id.toLowerCase().includes(searchText) || c.plate.toLowerCase().includes(searchText);
        const matchesStatus = selectedStatus === 'all' || c.status === selectedStatus;
        return matchesSearch && matchesStatus;
    });
    
    // Reset ledger list content
    tableBody.innerHTML = '';
    
    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">No challan records found.</td>
            </tr>
        `;
    } else {
        filtered.forEach(c => {
            const tr = document.createElement('tr');
            
            let badgeClass = 'badge-danger';
            if (c.status === 'paid') badgeClass = 'badge-success';
            else if (c.status === 'dispatched') badgeClass = 'badge-warning';
            
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
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; width: auto;" onclick="viewChallanById('${c.id}')">View</button>
                        ${c.status !== 'paid' ? `<button class="btn btn-primary" style="padding: 4px 8px; font-size: 0.75rem; width: auto; background: var(--secondary);" onclick="settleChallanById('${c.id}')">Settle</button>` : ''}
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }
    
    // Calculate ledger metrics
    let totalFines = 0;
    let paidFines = 0;
    let pendingFines = 0;
    let paidCount = 0;
    let pendingCount = 0;
    
    state.challans.forEach(c => {
        totalFines += c.fine;
        if (c.status === 'paid') {
            paidFines += c.fine;
            paidCount++;
        } else {
            pendingFines += c.fine;
            pendingCount++;
        }
    });
    
    const settlementRate = state.challans.length > 0 ? Math.round((paidFines / totalFines) * 100) : 0;
    
    document.getElementById('cTotalFines').textContent = `₹${totalFines.toLocaleString('en-IN')}`;
    document.getElementById('cPaidFines').textContent = `₹${paidFines.toLocaleString('en-IN')}`;
    document.getElementById('cPendingFines').textContent = `₹${pendingFines.toLocaleString('en-IN')}`;
    document.getElementById('cPaidCountText').textContent = `${paidCount} Challan${paidCount !== 1 ? 's' : ''} Settled`;
    document.getElementById('cPendingCountText').textContent = `${pendingCount} Case${pendingCount !== 1 ? 's' : ''} Pending`;
    document.getElementById('cSettlementRate').textContent = `${settlementRate}%`;
    document.getElementById('cSettlementRatio').textContent = `${paidCount} Paid / ${state.challans.length} Total`;
}

// Global hookups for row clicks
window.viewChallanById = function(id) {
    const challan = state.challans.find(c => c.id === id);
    if (challan) {
        const mockData = {
            plate: challan.plate,
            owner: challan.owner,
            vehicle: challan.vehicle,
            location: challan.location,
            ownerPhone: challan.ownerPhone,
            violations: [
                {
                    label: "Challan Record",
                    offense: challan.offense,
                    severity: "high"
                }
            ],
            ocrConfidence: challan.ocrConfidence || 88
        };
        openChallanModal(mockData, challan.fine);
    }
};

window.settleChallanById = function(id) {
    const challan = state.challans.find(c => c.id === id);
    if (challan) {
        challan.status = 'paid';
        showToast("Payment Successful", `Challan ${id} has been paid and marked cleared in records.`);
        renderChallanLedger();
    }
};
