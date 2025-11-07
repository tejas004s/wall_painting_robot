import sqlite3
from typing import List
from app.planner import Waypoint

DB_PATH = "data/robot_trajectories.db"

def get_connection():
    return sqlite3.connect(DB_PATH, check_same_thread=False)

def init_db():
    with get_connection() as conn:
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
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_waypoints_trajectory ON waypoints(trajectory_id)")
        conn.commit()

def save_trajectory(
    trajectory_id: str,
    width: float,
    height: float,
    coverage_width: float,
    obstacles: int,
    waypoints: List[Waypoint],
    duration: float
):
    from math import hypot

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM trajectories WHERE id = ?", (trajectory_id,))
        if cursor.fetchone():
            return

        path_length = sum(
            hypot(waypoints[i].x - waypoints[i-1].x, waypoints[i].y - waypoints[i-1].y)
            for i in range(1, len(waypoints))
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
        conn.commit()

def get_trajectory_by_id(trajectory_id: str) -> List[Waypoint]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT x, y, action FROM waypoints
        WHERE trajectory_id = ?
        ORDER BY y, x
        """, (trajectory_id,))
        rows = cursor.fetchall()

    return [Waypoint(x=row[0], y=row[1], action=row[2]) for row in rows]

def get_metrics_summary():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT COUNT(*), AVG(coverage_percent), AVG(duration), MAX(timestamp)
        FROM trajectories
        """)
        count, avg_coverage, avg_duration, latest = cursor.fetchone()
    return {
        "total_trajectories": count,
        "avg_coverage_percent": round(avg_coverage or 0, 2),
        "avg_duration": round(avg_duration or 0, 2),
        "latest_timestamp": latest
    }