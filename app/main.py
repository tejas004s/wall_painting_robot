from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import time
import hashlib
import traceback
import asyncio
import json
import redis

from app.planner import generate_trajectory, WallConfig, Waypoint
from app.database import (
    save_trajectory,
    get_trajectory_by_id,
    get_metrics_summary,
    init_db
)
from app.logger import logger, log_timing
from app.pubsub import publish_trajectory_event

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.post("/api/trajectories", response_model=List[Waypoint])
@log_timing("create_trajectory")
async def create_trajectory(config: WallConfig):
    start = time.time()

    # Validate obstacle bounds
    for obs in config.obstacles:
        if obs.x + obs.width > config.width or obs.y + obs.height > config.height:
            raise HTTPException(status_code=400, detail="Obstacle exceeds wall bounds")

    config_str = f"{config.width}-{config.height}-{[(o.x, o.y, o.width, o.height) for o in config.obstacles]}"
    config_hash = hashlib.md5(config_str.encode()).hexdigest()

    try:
        trajectory = generate_trajectory(config)
    except Exception:
        logger.error(f"Trajectory generation failed:\n{traceback.format_exc()}")
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

    publish_trajectory_event(config_hash, {
        "width": config.width,
        "height": config.height,
        "obstacles": len(config.obstacles),
        "duration": duration
    })

    return trajectory

@app.get("/api/trajectories/{trajectory_id}", response_model=List[Waypoint])
def get_trajectory(trajectory_id: str):
    return get_trajectory_by_id(trajectory_id)

@app.get("/api/metrics")
def metrics():
    return get_metrics_summary()

# Redis setup with error handling
try:
    redis_client = redis.Redis.from_url("redis://localhost:6379")
    pubsub = redis_client.pubsub()
    pubsub.subscribe("trajectory_updates")
except Exception as e:
    pubsub = None
    logger.warning(f"Redis not available: {str(e)}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    if not pubsub:
        await websocket.send_text("Redis not connected")
        await websocket.close()
        return

    try:
        while True:
            message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1)
            if message and message["type"] == "message":
                await websocket.send_text(message["data"].decode())
            await asyncio.sleep(0.1)
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        await websocket.close()
