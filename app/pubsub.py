import os
import redis
import json

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
CHANNEL_NAME = "trajectory_updates"

redis_client = redis.Redis.from_url(REDIS_URL)

def publish_trajectory_event(trajectory_id: str, metadata: dict):
    message = {
        "trajectory_id": trajectory_id,
        "metadata": metadata
    }
    redis_client.publish(CHANNEL_NAME, json.dumps(message))