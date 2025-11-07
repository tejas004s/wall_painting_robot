from pydantic import BaseModel
from typing import List

class Obstacle(BaseModel):
    x: float
    y: float
    width: float
    height: float

class WallConfig(BaseModel):
    width: float
    height: float
    coverage_width: float = 0.15
    obstacles: List[Obstacle]

class Waypoint(BaseModel):
    x: float
    y: float
    action: str  # "move" or "paint"

def generate_trajectory(config: WallConfig) -> List[Waypoint]:
    waypoints = []
    y = config.coverage_width / 2
    direction = 1

    while y < config.height:
        x_start = 0 if direction == 1 else config.width
        x_end = config.width if direction == 1 else 0
        stripe_segments = get_stripe_segments(x_start, x_end, y, config)

        for seg_start, seg_end in stripe_segments:
            waypoints.append(Waypoint(x=seg_start, y=y, action="move"))
            waypoints.append(Waypoint(x=seg_end, y=y, action="paint"))

        y += config.coverage_width
        direction *= -1

    # Remove duplicate waypoints
    filtered = []
    for wp in waypoints:
        if not filtered or (wp.x != filtered[-1].x or wp.y != filtered[-1].y or wp.action != filtered[-1].action):
            filtered.append(wp)

    return filtered

def get_stripe_segments(x_start, x_end, y, config: WallConfig):
    segments = [(min(x_start, x_end), max(x_start, x_end))]

    for obs in config.obstacles:
        if obs.y <= y <= obs.y + obs.height:
            new_segments = []
            for seg_start, seg_end in segments:
                if obs.x > seg_start:
                    new_segments.append((seg_start, min(obs.x, seg_end)))
                if obs.x + obs.width < seg_end:
                    new_segments.append((max(obs.x + obs.width, seg_start), seg_end))
            segments = new_segments

    return segments
