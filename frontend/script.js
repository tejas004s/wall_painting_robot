const scaleX = 80;
const scaleY = 80;

const socket = new WebSocket("ws://localhost:8000/ws");
socket.onopen = () => console.log("✅ Connected");
socket.onerror = (e) => console.error("❌ WebSocket error", e);

socket.onmessage = async (event) => {
  const data = JSON.parse(event.data);
  console.log("📡 Received trajectory update:", data);

  const res = await fetch(`http://localhost:8000/api/trajectories/${data.trajectory_id}`);
  const waypoints = await res.json();

  const { canvas, ctx } = createSimulationCanvas(data.metadata.width, data.metadata.height);
  drawObstaclesOnCanvas(ctx, []); // Extend if obstacle metadata is added
  animatePath(waypoints, [], ctx, getRandomColor());

  document.getElementById("metricsDisplay").innerHTML += `
    <h3>Live Update</h3>
    <p>ID: ${data.trajectory_id}</p>
    <p>Duration: ${data.metadata.duration.toFixed(2)}s</p>
  `;
};

document.getElementById("configForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const width = parseFloat(document.getElementById("wallWidth").value);
  const height = parseFloat(document.getElementById("wallHeight").value);
  const coverageWidth = parseFloat(document.getElementById("coverageWidth").value);
  const obstacles = getObstaclesFromEditor();

  if (isNaN(width) || isNaN(height) || isNaN(coverageWidth)) {
    alert("Please enter valid wall and coverage dimensions.");
    return;
  }

  if (obstacles.length === 0 && !confirm("No obstacles added. Simulate anyway?")) return;

  const config = { width, height, coverage_width: coverageWidth, obstacles };
  console.log("✅ Posting config:", JSON.stringify(config, null, 2));

  try {
    const response = await fetch("http://localhost:8000/api/trajectories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config)
    });

    if (!response.ok) throw new Error("Backend error");

    const waypoints = await response.json();
    const { canvas, ctx } = createSimulationCanvas(width, height);
    drawObstaclesOnCanvas(ctx, obstacles);
    animatePath(waypoints, obstacles, ctx, getRandomColor());

    const pathLength = waypoints.reduce((sum, wp, i) => {
      if (i === 0) return sum;
      const dx = wp.x - waypoints[i - 1].x;
      const dy = wp.y - waypoints[i - 1].y;
      return sum + Math.sqrt(dx * dx + dy * dy);
    }, 0);

    const coveragePercent = ((pathLength * coverageWidth) / (width * height)) * 100;
    const duration = waypoints.length * 0.1;

    document.getElementById("metricsDisplay").innerHTML = `
      <h3>Metrics</h3>
      <p>Path Length: ${pathLength.toFixed(2)} m</p>
      <p>Coverage: ${coveragePercent.toFixed(2)}%</p>
      <p>Estimated Duration: ${duration.toFixed(2)} s</p>
    `;
  } catch (err) {
    alert("Failed to fetch trajectory. Check backend and inputs.");
  }
});

function createSimulationCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width * scaleX;
  canvas.height = height * scaleY;
  canvas.className = "simulation-canvas";

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#000000";
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  document.getElementById("canvasContainer").appendChild(canvas);
  return { canvas, ctx };
}

function drawObstaclesOnCanvas(ctx, obstacles) {
  ctx.fillStyle = "#ff4d4d";
  obstacles.forEach(obs => {
    ctx.fillRect(
      obs.x * scaleX,
      ctx.canvas.height - (obs.y + obs.height) * scaleY,
      obs.width * scaleX,
      obs.height * scaleY
    );
  });
}

function animatePath(waypoints, obstacles, ctx, color = "blue") {
  let i = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  function step() {
    if (i >= waypoints.length) return;

    const prev = waypoints[i - 1];
    const curr = waypoints[i];

    const x1 = prev.x * scaleX;
    const y1 = ctx.canvas.height - prev.y * scaleY;
    const x2 = curr.x * scaleX;
    const y2 = ctx.canvas.height - curr.y * scaleY;

    if (!isInsideObstacle(prev.x, prev.y, obstacles) && !isInsideObstacle(curr.x, curr.y, obstacles)) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    if (!isInsideObstacle(curr.x, curr.y, obstacles)) {
      drawRobot(ctx, x2, y2);
    }

    i++;
    setTimeout(step, 100);
  }

  step();
}

function drawRobot(ctx, x, y) {
  ctx.fillStyle = "#00cc66";
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, 2 * Math.PI);
  ctx.fill();
}

function addObstacle(x = 0, y = 0, w = 1, h = 1) {
  const container = document.getElementById("obstacleList");

  const div = document.createElement("div");
  div.className = "obstacle-card";

  const xInput = document.createElement("input");
  xInput.type = "number";
  xInput.step = "0.1";
  xInput.value = x;

  const yInput = document.createElement("input");
  yInput.type = "number";
  yInput.step = "0.1";
  yInput.value = y;

  const wInput = document.createElement("input");
  wInput.type = "number";
  wInput.step = "0.1";
  wInput.value = w;

  const hInput = document.createElement("input");
  hInput.type = "number";
  hInput.step = "0.1";
  hInput.value = h;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.textContent = "Remove";
  removeBtn.className = "remove-btn";
  removeBtn.onclick = () => div.remove();

  div.appendChild(labelWrap("X:", xInput));
  div.appendChild(labelWrap("Y:", yInput));
  div.appendChild(labelWrap("Width:", wInput));
  div.appendChild(labelWrap("Height:", hInput));
  div.appendChild(removeBtn);

  container.appendChild(div);
}

function labelWrap(text, input) {
  const label = document.createElement("label");
  label.textContent = text;
  label.appendChild(input);
  return label;
}

function getObstaclesFromEditor() {
  const cards = document.querySelectorAll(".obstacle-card");
  const obstacles = [];

  cards.forEach((card, index) => {
    const inputs = card.querySelectorAll("input");
    if (inputs.length !== 4) {
      console.warn(`Obstacle ${index} missing inputs`);
      return;
    }

    const x = parseFloat(inputs[0].value);
    const y = parseFloat(inputs[1].value);
    const w = parseFloat(inputs[2].value);
    const h = parseFloat(inputs[3].value);

    if ([x, y, w, h].some(v => isNaN(v) || v < 0)) {
      console.warn(`Obstacle ${index} has invalid values`);
      return;
    }

    obstacles.push({ x, y, width: w, height: h });
  });

  return obstacles;
}

function previewObstacles() {
  const width = parseFloat(document.getElementById("wallWidth").value);
  const height = parseFloat(document.getElementById("wallHeight").value);
  const obstacles = getObstaclesFromEditor();

  const { canvas, ctx } = createSimulationCanvas(width, height);
  drawObstaclesOnCanvas(ctx, obstacles);
}

function isInsideObstacle(x, y, obstacles) {
  return obstacles.some(obs =>
    x >= obs.x &&
    x <= obs.x + obs.width &&
    y >= obs.y &&
    y <= obs.y + obs.height
  );
}

function getRandomColor() {
  const colors = ["blue", "green", "purple", "orange", "teal"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function clearSimulations() {
  document.getElementById("canvasContainer").innerHTML = "";
}

