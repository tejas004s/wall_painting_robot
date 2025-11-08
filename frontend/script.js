const API_BASE = 'http://localhost:8000';

// Canvas
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// State
let obstacles = [];
let waypoints = [];
let currentTrajectoryId = null;
let isDrawing = false;
let drawStart = null;
let currentMode = 'draw';
let isAnimating = false;
let currentWaypointIndex = 0;
let animationStartTime = null;
let lastWaypointIndex = 0;

// Scale
let scale = 100;

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
init();

function init() {
    setupEventListeners();
    updateScale();
    drawCanvas();
    connectWebSocket();
}

// ---------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------
function setupEventListeners() {
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    document.getElementById('generateBtn').addEventListener('click', generateTrajectory);
    document.getElementById('animateBtn').addEventListener('click', startAnimation);
    document.getElementById('stopBtn').addEventListener('click', stopAnimation);
    document.getElementById('clearObstacles').addEventListener('click', clearObstacles);
    document.getElementById('drawMode').addEventListener('click', () => setMode('draw'));
    document.getElementById('removeMode').addEventListener('click', () => setMode('remove'));

    document.getElementById('wallWidth').addEventListener('change', updateScale);
    document.getElementById('wallHeight').addEventListener('change', updateScale);
    document.getElementById('coverageWidth').addEventListener('input', e => {
        document.getElementById('coverageValue').textContent = e.target.value;
    });
    document.getElementById('animationSpeed').addEventListener('input', e => {
        document.getElementById('speedValue').textContent = e.target.value;
    });
}

// ---------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------
function setMode(mode) {
    currentMode = mode;
    document.getElementById('drawMode').classList.toggle('active', mode === 'draw');
    document.getElementById('removeMode').classList.toggle('active', mode === 'remove');
    canvas.style.cursor = mode === 'draw' ? 'crosshair' : 'pointer';
}

function setStatus(text, success) {
    document.getElementById('statusText').textContent = text;
    document.getElementById('statusIndicator').classList.toggle('error', !success);
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toastMessage');
    msg.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ---------------------------------------------------------------------
// Scale & Drawing
// ---------------------------------------------------------------------
function updateScale() {
    const w = parseFloat(document.getElementById('wallWidth').value);
    const h = parseFloat(document.getElementById('wallHeight').value);
    const sx = canvas.width / w;
    const sy = canvas.height / h;
    scale = Math.min(sx, sy) * 0.9;
    drawCanvas();
}

// ----- obstacle drawing / removal -----
function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    if (currentMode === 'draw') {
        isDrawing = true;
        drawStart = { x, y };
    } else if (currentMode === 'remove') {
        removeObstacleAt(x, y);
    }
}

function handleMouseMove(e) {
    if (!isDrawing || currentMode !== 'draw') return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    drawCanvas(); // redraw base + preview
    ctx.strokeStyle = '#dc3545';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(drawStart.x * scale, drawStart.y * scale,
        (x - drawStart.x) * scale, (y - drawStart.y) * scale);
    ctx.setLineDash([]);
}

function handleMouseUp(e) {
    if (!isDrawing || currentMode !== 'draw') return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    const w = Math.abs(x - drawStart.x);
    const h = Math.abs(y - drawStart.y);
    if (w > 0.1 && h > 0.1) {
        obstacles.push({
            x: Math.min(drawStart.x, x),
            y: Math.min(drawStart.y, y),
            width: w,
            height: h
        });
        updateObstacleList();
        drawCanvas();
    }
    isDrawing = false;
    drawStart = null;
}

function removeObstacleAt(x, y) {
    const idx = obstacles.findIndex(o =>
        x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height);
    if (idx !== -1) {
        obstacles.splice(idx, 1);
        updateObstacleList();
        drawCanvas();
    }
}

function clearObstacles() {
    obstacles = [];
    updateObstacleList();
    drawCanvas();
    showToast('All obstacles cleared', 'success');
}

function updateObstacleList() {
    const list = document.getElementById('obstacleList');
    if (!obstacles.length) {
        list.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">No obstacles added</div>';
        return;
    }
    list.innerHTML = obstacles.map((o, i) => `
        <div class="obstacle-item">
            <span>Obstacle ${i + 1}: ${o.width.toFixed(2)}m × ${o.height.toFixed(2)}m</span>
            <button onclick="removeObstacle(${i})">Remove</button>
        </div>`).join('');
}
window.removeObstacle = i => {
    obstacles.splice(i, 1);
    updateObstacleList();
    drawCanvas();
};

// ---------------------------------------------------------------------
// Canvas rendering (grid, obstacles, trajectory)
// ---------------------------------------------------------------------
function drawCanvas() {
    const w = parseFloat(document.getElementById('wallWidth').value);
    const h = parseFloat(document.getElementById('wallHeight').value);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ---- grid ----
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= w; i++) {
        ctx.beginPath();
        ctx.moveTo(i * scale, 0);
        ctx.lineTo(i * scale, h * scale);
        ctx.stroke();
    }
    for (let i = 0; i <= h; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * scale);
        ctx.lineTo(w * scale, i * scale);
        ctx.stroke();
    }

    // ---- obstacles ----
    ctx.fillStyle = 'rgba(220,53,69,0.3)';
    ctx.strokeStyle = '#dc3545';
    ctx.lineWidth = 2;
    obstacles.forEach(o => {
        ctx.fillRect(o.x * scale, o.y * scale, o.width * scale, o.height * scale);
        ctx.strokeRect(o.x * scale, o.y * scale, o.width * scale, o.height * scale);
    });

    // ---- trajectory (partial when animating) ----
    if (waypoints.length) {
        const upTo = isAnimating ? currentWaypointIndex : null;
        drawTrajectory(upTo);
    }
}

function drawTrajectory(upToIndex = null) {
    const end = upToIndex !== null ? upToIndex + 1 : waypoints.length; // +1 to include current point

    for (let i = 1; i < end; i++) {
        const prev = waypoints[i - 1];
        const cur = waypoints[i];

        ctx.beginPath();
        ctx.moveTo(prev.x * scale, prev.y * scale);
        ctx.lineTo(cur.x * scale, cur.y * scale);

        if (cur.action === 'paint') {
            ctx.strokeStyle = '#007bff';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
        } else {
            ctx.strokeStyle = '#ffc107';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // ---- robot position (only while animating) ----
    if (isAnimating && currentWaypointIndex < waypoints.length) {
        const pos = waypoints[currentWaypointIndex];
        ctx.fillStyle = '#28a745';
        ctx.beginPath();
        ctx.arc(pos.x * scale, pos.y * scale, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// ---------------------------------------------------------------------
// Trajectory generation
// ---------------------------------------------------------------------
async function generateTrajectory() {
    const width = parseFloat(document.getElementById('wallWidth').value);
    const height = parseFloat(document.getElementById('wallHeight').value);
    const coverageWidth = parseFloat(document.getElementById('coverageWidth').value);

    setStatus('Generating trajectory...', false);
    document.getElementById('generateBtn').disabled = true;

    const start = performance.now();
    try {
        const resp = await fetch(`${API_BASE}/api/trajectories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ width, height, coverage_width: coverageWidth, obstacles })
        });
        if (!resp.ok) throw new Error('Failed');
        waypoints = await resp.json();

        updateStats(width, height, coverageWidth);
        const genTime = ((performance.now() - start) / 1000).toFixed(2);
        document.getElementById('generationTime').textContent = genTime + 's';

        drawCanvas();
        document.getElementById('animateBtn').disabled = false;
        setStatus('Trajectory generated', true);
        showToast('Trajectory ready!', 'success');
    } catch (err) {
        console.error(err);
        setStatus('Generation failed', false);
        showToast('Failed to generate trajectory', 'error');
    } finally {
        document.getElementById('generateBtn').disabled = false;
    }
}

function updateStats(w, h, cov) {
    document.getElementById('waypointCount').textContent = waypoints.length;

    let len = 0;
    for (let i = 1; i < waypoints.length; i++) {
        const dx = waypoints[i].x - waypoints[i - 1].x;
        const dy = waypoints[i].y - waypoints[i - 1].y;
        len += Math.hypot(dx, dy);
    }
    document.getElementById('pathLength').textContent = len.toFixed(2) + 'm';

    const coverage = Math.min(100, (len * cov) / (w * h) * 100);
    document.getElementById('coveragePercent').textContent = coverage.toFixed(1) + '%';
}

// ---------------------------------------------------------------------
// SMOOTH ANIMATION (requestAnimationFrame + time-based)
// ---------------------------------------------------------------------
function startAnimation() {
    if (!waypoints.length) return;

    isAnimating = true;
    currentWaypointIndex = 0;
    lastWaypointIndex = 0;
    animationStartTime = null;

    document.getElementById('animateBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    setStatus('Animating...', true);

    requestAnimationFrame(animateSmooth);
}

function animateSmooth(timestamp) {
    if (!isAnimating) return;

    if (!animationStartTime) animationStartTime = timestamp;
    const elapsed = timestamp - animationStartTime; // ms

    const speed = parseInt(document.getElementById('animationSpeed').value) || 50;
    const waypointsPerSec = 1 + (speed / 100) * 199;               // 1 → 200
    const totalSec = waypoints.length / waypointsPerSec;
    const progress = Math.min(elapsed / (totalSec * 1000), 1);
    const targetIdx = Math.floor(progress * waypoints.length);

    // Update UI only when we move to a new waypoint
    if (targetIdx > lastWaypointIndex) {
        currentWaypointIndex = Math.min(targetIdx, waypoints.length - 1);
        lastWaypointIndex = currentWaypointIndex;
        drawCanvas();

        // ---- animation time display ----
        const curSec = (elapsed / 1000).toFixed(1);
        const totSec = totalSec.toFixed(1);
        document.getElementById('animationTime').textContent = `${curSec}s / ${totSec}s`;
    }

    if (currentWaypointIndex < waypoints.length - 1) {
        requestAnimationFrame(animateSmooth);
    } else {
        stopAnimation();
    }
}

function stopAnimation() {
    isAnimating = false;
    animationStartTime = null;
    document.getElementById('animateBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    setStatus('Animation stopped', true);
    drawCanvas(); // show full path
    document.getElementById('animationTime').textContent = '0s / 0s';
}

// ---------------------------------------------------------------------
// WebSocket (unchanged)
// ---------------------------------------------------------------------
function connectWebSocket() {
    const ws = new WebSocket('ws://localhost:8000/ws');
    ws.onopen = () => console.log('WS connected');
    ws.onmessage = e => {
        try {
            const d = JSON.parse(e.data);
            showToast(`New trajectory: ${d.trajectory_id}`, 'success');
        } catch (err) { console.error(err); }
    };
    ws.onerror = err => console.error('WS error', err);
    ws.onclose = () => setTimeout(connectWebSocket, 2000);
}