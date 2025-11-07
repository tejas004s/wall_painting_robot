#/app
#database.py
import sqlite3
from typing import List
from app.planner import Waypoint

DB_PATH = "data/robot_trajectories.db"
def get_connection():
    return sqlite3.connect(DB_PATH, check_same_thread=False)

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS trajectories (
        id TEXT PRIMARY KEY,
        width REAL,
        height REAL,
        obstacle_count INTEGER,
        coverage_width REAL,
        coverage_percent REAL,
        path_length REAL,
        duration REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS waypoints (
        trajectory_id TEXT,
        x REAL,
        y REAL,
        action TEXT,
        FOREIGN KEY (trajectory_id) REFERENCES trajectories(id)
    )
    """)

    conn.commit()
    conn.close()

def save_trajectory(
    trajectory_id: str,
    width: float,
    height: float,
    coverage_width: float,
    obstacles: int,
    waypoints: List[Waypoint],
    duration: float
):
    with sqlite3.connect(DB_PATH, check_same_thread=False) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM trajectories WHERE id = ?", (trajectory_id,))
        if cursor.fetchone():
            return 
        path_length = sum(
            abs(waypoints[i].x - waypoints[i-1].x)
            for i in range(1, len(waypoints))
            if waypoints[i].y == waypoints[i-1].y
        )
        coverage_percent = round((path_length * coverage_width) / (width * height) * 100, 2)

        cursor.execute("""
        INSERT INTO trajectories (id, width, height, obstacle_count, coverage_width, coverage_percent, path_length, duration)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (trajectory_id, width, height, obstacles, coverage_width, coverage_percent, path_length, duration))

        cursor.executemany("""
        INSERT INTO waypoints (trajectory_id, x, y, action)
        VALUES (?, ?, ?, ?)
        """, [(trajectory_id, wp.x, wp.y, wp.action) for wp in waypoints])


def get_trajectory_by_id(trajectory_id: str) -> List[Waypoint]:
    with sqlite3.connect(DB_PATH, check_same_thread=False) as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT x, y, action FROM waypoints
        WHERE trajectory_id = ?
        ORDER BY y, x
        """, (trajectory_id,))
        rows = cursor.fetchall()

    return [Waypoint(x=row[0], y=row[1], action=row[2]) for row in rows]

#logger.py

import logging
import os
import time 
from functools import wraps 

LOG_PATH = os.getenv("LOG_PATH", "logs/robot_api.log")

logging.basicConfig(
    filename=LOG_PATH,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

logger = logging.getLogger("robot-api")

def log_timing(endpoint_name):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start = time.time()
            result = await func(*args, **kwargs)
            duration = round(time.time() - start, 3)
            logger.info(f"{endpoint_name} completed in {duration}s")
            return result
        return wrapper
    return decorator

#main.py 
from fastapi import FastAPI, HTTPException
from app.planner import generate_trajectory, WallConfig, Waypoint
from app.database import save_trajectory, init_db
from app.logger import logger, log_timing
from typing import List
import time
import hashlib
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/api/health")
def health_check():
    return {"status": "ok"}

init_db()

@app.post("/api/trajectories", response_model=List[Waypoint])
@log_timing("create_trajectory")
async def create_trajectory(config: WallConfig):
    start = time.time()

    # Hash input for caching or ID generation
    config_str = f"{config.width}-{config.height}-{[(o.x, o.y, o.width, o.height) for o in config.obstacles]}"
    config_hash = hashlib.md5(config_str.encode()).hexdigest()

    # Generate path
    try:
        trajectory = generate_trajectory(config)
    except Exception as e:
        logger.error(f"Trajectory generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal error")

    duration = round(time.time() - start, 3)
    logger.info(f"Trajectory {config_hash} generated with {len(config.obstacles)} obstacles in {duration}s")

    save_trajectory(
        trajectory_id=config_hash,
        width=config.width,
        height=config.height,
        coverage_width=config.coverage_width,
        obstacles=len(config.obstacles),
        waypoints=trajectory,
        duration=duration
    )

    return trajectory

@app.get("/api/metrics")
def get_metrics():
    return {"status": "metrics endpoint ready"}

#planner.py 
from pydantic import BaseModel
from typing import List

class Obstacle(BaseModel):
    x: float  # bottom-left corner
    y: float
    width: float
    height: float

class WallConfig(BaseModel):
    width: float
    height: float
    coverage_width: float = 0.15  # default robot sweep width
    obstacles: List[Obstacle]

class Waypoint(BaseModel):
    x: float
    y: float
    action: str  # "move" or "paint"
def generate_trajectory(config: WallConfig) -> List[Waypoint]:
    waypoints = []
    y = config.coverage_width / 2
    direction = 1  # 1 = left to right, -1 = right to left

    while y < config.height:
        x_start = 0 if direction == 1 else config.width
        x_end = config.width if direction == 1 else 0

        # Check if this stripe intersects any obstacle
        stripe_segments = get_stripe_segments(x_start, x_end, y, config)

        for seg_start, seg_end in stripe_segments:
            waypoints.append(Waypoint(x=seg_start, y=y, action="move"))
            waypoints.append(Waypoint(x=seg_end, y=y, action="paint"))

        y += config.coverage_width
        direction *= -1

    return waypoints

def get_stripe_segments(x_start, x_end, y, config: WallConfig):
    segments = [(min(x_start, x_end), max(x_start, x_end))]

    for obs in config.obstacles:
        if obs.y <= y <= obs.y + obs.height:
            new_segments = []
            for seg_start, seg_end in segments:
                # Left segment
                if obs.x > seg_start:
                    new_segments.append((seg_start, min(obs.x, seg_end)))
                # Right segment
                if obs.x + obs.width < seg_end:
                    new_segments.append((max(obs.x + obs.width, seg_start), seg_end))
            segments = new_segments

    return segments

# requireemtns.txt 
# fastapi
# uvicorn
# sqlite-utils
# pydantic
# pytest
# python-dotenv