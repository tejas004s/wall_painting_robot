import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.planner import WallConfig, Obstacle

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_create_and_retrieve_trajectory():
    config = {
        "width": 2.0,
        "height": 1.0,
        "coverage_width": 0.15,
        "obstacles": [
            {"x": 0.5, "y": 0.2, "width": 0.3, "height": 0.3}
        ]
    }

    # Create trajectory
    post_response = client.post("/api/trajectories", json=config)
    assert post_response.status_code == 200
    waypoints = post_response.json()
    assert len(waypoints) > 0
    assert all(wp["action"] in ["move", "paint"] for wp in waypoints)

    # Extract trajectory ID from config hash
    import hashlib
    config_str = f"{config['width']}-{config['height']}-[{(0.5, 0.2, 0.3, 0.3)}]"
    config_hash = hashlib.md5(config_str.encode()).hexdigest()

    # Retrieve trajectory
    get_response = client.get(f"/api/trajectories/{config_hash}")
    assert get_response.status_code == 200
    assert get_response.json() == waypoints

def test_metrics_endpoint():
    response = client.get("/api/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "total_trajectories" in data
    assert "avg_coverage_percent" in data
    assert "avg_duration" in data
    assert "latest_timestamp" in data
