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