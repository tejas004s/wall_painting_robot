const API_BASE = 'http://localhost:8000';

// Canvas setup
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// State
let obstacles = [];
let waypoints = [];
let currentTrajectoryId = null;
let isDrawing = false;
let drawStart = null;
let currentMode = 'draw';
let animationFrame = null;
let currentWaypointIndex = 0;
let isAnimating = false;

// Scale factor for canvas
let scale = 100; // pixels per meter

// Initialize
init();

function init() {
    setupEventListeners();
    updateScale();
    drawCanvas();
    connectWebSocket();
}

function setupEventListeners() {
    // Canvas events
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    // Control events
    document.getElementById('generateBtn').addEventListener('click', generateTrajectory);
    document.getElementById('animateBtn').addEventListener('click', startAnimation);
    document.getElementById('stopBtn').addEventListener('click', stopAnimation);
    document.getElementById('clearObstacles').addEventListener('click', clearObstacles);
    document.getElementById('drawMode').addEventListener('click', () => setMode('draw'));
    document.getElementById('removeMode').addEventListener('click', () => setMode('remove'));

    // Input events
    document.getElementById('wallWidth').addEventListener('change', updateScale);
    document.getElementById('wallHeight').addEventListener('change', updateScale);
    document.getElementById('coverageWidth').addEventListener('input', (e) => {
        document.getElementById('coverageValue').textContent = e.target.value;
    });
    document.getElementById('animationSpeed').addEventListener('input', (e) => {
        document.getElementById('speedValue').textContent = e.target.value;
    });
}

function setMode(mode) {
    currentMode = mode;
    document.getElementById('drawMode').classList.toggle('active', mode === 'draw');
    document.getElementById('removeMode').classList.toggle('active', mode === 'remove');
    canvas.style.cursor = mode === 'draw' ? 'crosshair' : 'pointer';
}

function updateScale() {
    const width = parseFloat(document.getElementById('wallWidth').value);
    const height = parseFloat(document.getElementById('wallHeight').value);

    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    scale = Math.min(scaleX, scaleY) * 0.9;

    drawCanvas();
}

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

    drawCanvas();

    // Draw preview rectangle
    ctx.strokeStyle = '#dc3545';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(
        drawStart.x * scale,
        drawStart.y * scale,
        (x - drawStart.x) * scale,
        (y - drawStart.y) * scale
    );
    ctx.setLineDash([]);
}

function handleMouseUp(e) {
    if (!isDrawing || currentMode !== 'draw') return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    const width = Math.abs(x - drawStart.x);
    const height = Math.abs(y - drawStart.y);

    if (width > 0.1 && height > 0.1) {
        obstacles.push({
            x: Math.min(drawStart.x, x),
            y: Math.min(drawStart.y, y),
            width,
            height
        });
        updateObstacleList();
        drawCanvas();
    }

    isDrawing = false;
    drawStart = null;
}

function removeObstacleAt(x, y) {
    const index = obstacles.findIndex(obs =>
        x >= obs.x && x <= obs.x + obs.width &&
        y >= obs.y && y <= obs.y + obs.height
    );

    if (index !== -1) {
        obstacles.splice(index, 1);
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

    if (obstacles.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">No obstacles added</div>';
        return;
    }

    list.innerHTML = obstacles.map((obs, i) => `
        <div class="obstacle-item">
            <span>Obstacle ${i + 1}: ${obs.width.toFixed(2)}m × ${obs.height.toFixed(2)}m</span>
            <button onclick="removeObstacle(${i})">Remove</button>
        </div>
    `).join('');
}

window.removeObstacle = function(index) {
    obstacles.splice(index, 1);
    updateObstacleList();
    drawCanvas();
};

function drawCanvas() {
    const width = parseFloat(document.getElementById('wallWidth').value);
    const height = parseFloat(document.getElementById('wallHeight').value);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= width; i++) {
        ctx.beginPath();
        ctx.moveTo(i * scale, 0);
        ctx.lineTo(i * scale, height * scale);
        ctx.stroke();
    }
    for (let i = 0; i <= height; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * scale);
        ctx.lineTo(width * scale, i * scale);
        ctx.stroke();
    }

    // Draw obstacles
    ctx.fillStyle = 'rgba(220, 53, 69, 0.3)';
    ctx.strokeStyle = '#dc3545';
    ctx.lineWidth = 2;
    obstacles.forEach(obs => {
        ctx.fillRect(obs.x * scale, obs.y * scale, obs.width * scale, obs.height * scale);
        ctx.strokeRect(obs.x * scale, obs.y * scale, obs.width * scale, obs.height * scale);
    });

    // Draw trajectory if exists
    if (waypoints.length > 0) {
        drawTrajectory();
    }
}

function drawTrajectory(upToIndex = null) {
    const endIndex = upToIndex !== null ? upToIndex : waypoints.length;

    for (let i = 1; i < endIndex; i++) {
        const prev = waypoints[i - 1];
        const curr = waypoints[i];

        ctx.beginPath();
        ctx.moveTo(prev.x * scale, prev.y * scale);
        ctx.lineTo(curr.x * scale, curr.y * scale);

        if (curr.action === 'paint') {
            ctx.strokeStyle = '#007bff';
            ctx.lineWidth = 3;
        } else {
            ctx.strokeStyle = '#ffc107';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
        }

        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw robot position if animating
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

async function generateTrajectory() {
    const width = parseFloat(document.getElementById('wallWidth').value);
    const height = parseFloat(document.getElementById('wallHeight').value);
    const coverageWidth = parseFloat(document.getElementById('coverageWidth').value);

    setStatus('Generating trajectory...', false);
    document.getElementById('generateBtn').disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/trajectories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                width,
                height,
                coverage_width: coverageWidth,
                obstacles
            })
        });

        if (!response.ok) throw new Error('Failed to generate trajectory');

        waypoints = await response.json();

        // Calculate stats
        updateStats(width, height, coverageWidth);

        drawCanvas();
        document.getElementById('animateBtn').disabled = false;
        setStatus('Trajectory generated successfully', true);
        showToast('Trajectory generated!', 'success');

    } catch (error) {
        console.error('Error:', error);
        setStatus('Error generating trajectory', false);
        showToast('Failed to generate trajectory', 'error');
    } finally {
        document.getElementById('generateBtn').disabled = false;
    }
}

function updateStats(width, height, coverageWidth) {
    document.getElementById('waypointCount').textContent = waypoints.length;

    // Calculate path length
    let pathLength = 0;
    for (let i = 1; i < waypoints.length; i++) {
        const dx = waypoints[i].x - waypoints[i - 1].x;
        const dy = waypoints[i].y - waypoints[i - 1].y;
        pathLength += Math.sqrt(dx * dx + dy * dy);
    }
    document.getElementById('pathLength').textContent = pathLength.toFixed(2) + 'm';

    // Calculate coverage
    const coverage = (pathLength * coverageWidth) / (width * height) * 100;
    document.getElementById('coveragePercent').textContent = Math.min(100, coverage).toFixed(1) + '%';
}

function startAnimation() {
    if (waypoints.length === 0) return;

    isAnimating = true;
    currentWaypointIndex = 0;
    document.getElementById('animateBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    setStatus('Animating...', true);

    animate();
}

function animate() {
    if (!isAnimating || currentWaypointIndex >= waypoints.length) {
        stopAnimation();
        return;
    }

    drawCanvas();
    currentWaypointIndex++;

    const speed = parseInt(document.getElementById('animationSpeed').value);
    const delay = 200 - (speed * 1.5); // Faster speed = shorter delay

    animationFrame = setTimeout(animate, delay);
}

function stopAnimation() {
    isAnimating = false;
    if (animationFrame) {
        clearTimeout(animationFrame);
        animationFrame = null;
    }
    document.getElementById('animateBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    setStatus('Animation stopped', true);
    drawCanvas();
}

function setStatus(text, success) {
    document.getElementById('statusText').textContent = text;
    const indicator = document.getElementById('statusIndicator');
    indicator.classList.toggle('error', !success);
}

function showToast(message, type) {
    const toast = document.getElementById('toast');
    const messageEl = document.getElementById('toastMessage');

    messageEl.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function connectWebSocket() {
    const ws = new WebSocket('ws://localhost:8000/ws');

    ws.onopen = () => {
        console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message:', data);
            showToast(`New trajectory: ${data.trajectory_id}`, 'success');
        } catch (error) {
            console.error('WebSocket parse error:', error);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket closed, reconnecting...');
        setTimeout(connectWebSocket, 2000);
    };
}