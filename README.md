# Wall Painting Robot - Trajectory Planner

A sophisticated trajectory planning system for autonomous wall painting robots. This application generates optimal painting paths while intelligently avoiding obstacles like doors, windows, and fixtures.

## Features

- **Intelligent Path Planning**: Boustrophedon (zigzag) coverage pattern with A* pathfinding for obstacle avoidance
- **Named Obstacles**: Support for various obstacle types (doors, windows, outlets, switches, vents, frames, shelves)
- **Real-time Visualization**: Interactive canvas with live trajectory animation
- **Performance Metrics**: Track coverage percentage, path length, and generation time
- **Persistent Storage**: SQLite database for trajectory history and analytics
- **WebSocket Updates**: Real-time notifications via Redis pub/sub
- **RESTful API**: Complete FastAPI backend with comprehensive endpoints

## Project Structure

<img width="1920" height="1200" alt="Screenshot (87)" src="https://github.com/user-attachments/assets/307c2ebf-1345-422b-9179-c8bfcc2c42e8" />

<img width="1920" height="1200" alt="Screenshot (88)" src="https://github.com/user-attachments/assets/43c2d9f0-10f7-4b68-8405-caca95940ab7" />

```
wallpaint/
├── app/
│   ├── database.py       # Database operations and schema
│   ├── logger.py         # Logging configuration
│   ├── main.py           # FastAPI application
│   ├── planner.py        # Trajectory generation algorithm
│   └── pubsub.py         # Redis pub/sub for WebSocket
├── data/
│   └── robot_trajectories.db
├── frontend/
│   ├── index.html        # Web interface
│   ├── script.js         # Frontend logic
│   └── style.css         # Styling
├── logs/
└── requirements.txt
```

## Prerequisites

- Python 3.8+
- Redis server
- Modern web browser

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/tejas004s/wall_painting_robot
   cd wallpaint
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Create required directories**
   ```bash
   mkdir -p  logs
   ```

## Running the Application

### 1. Start Redis Server
Make sure docker enginer is running

Redis is required for WebSocket real-time updates:

```bash
docker run -p 6379:6379 redis
```

Or if Redis is installed locally:
```bash
redis-server
```

### 2. Start Backend API

Launch the FastAPI server:

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`

### 3. Start Frontend

In a new terminal, navigate to the frontend directory and start the web server:

```bash
cd frontend
python -m http.server 8080
```

Access the application at `http://localhost:8080`

## Usage

### Adding Obstacles

1. **Select Obstacle Type**: Choose from the dropdown (Door, Window, Outlet, etc.) or use "Custom" for custom names
2. **Draw Mode**: Click and drag on the canvas to create obstacles
3. **Quick Add**: Use preset buttons for standard door/window dimensions
4. **Remove Mode**: Switch to remove mode and click obstacles to delete them

### Generating Trajectories

1. Configure wall dimensions (width, height)
2. Set coverage width (robot painting width)
3. Add obstacles to avoid
4. Click "Generate Trajectory"
5. View path statistics and coverage metrics

### Animating the Path

1. After generating a trajectory, click "Animate Path"
2. Adjust animation speed with the slider
3. Watch the robot navigate around obstacles
4. Blue lines indicate painting, yellow dashed lines indicate repositioning moves

## API Endpoints

### Trajectories

- `POST /api/trajectories` - Generate new trajectory
  ```json
  {
    "width": 10,
    "height": 6,
    "coverage_width": 0.15,
    "obstacles": [
      {
        "x": 2.5,
        "y": 0,
        "width": 1.0,
        "height": 2.1,
        "name": "Door"
      }
    ]
  }
  ```

- `GET /api/trajectories/{id}` - Get waypoints for trajectory
- `GET /api/trajectories/{id}/details` - Get full trajectory details including obstacles
- `GET /api/trajectories/recent/list?limit=10` - Get recent trajectories

### Analytics

- `GET /api/metrics` - Overall system metrics
- `GET /api/obstacles/statistics` - Obstacle usage statistics
- `GET /api/health` - Health check endpoint

### WebSocket

- `WS /ws` - Real-time trajectory updates

## Algorithm Details

### Path Planning Strategy

1. **Grid Decomposition**: Wall is divided into cells based on coverage width
2. **Obstacle Marking**: Cells overlapping obstacles are marked as blocked
3. **Boustrophedon Coverage**: Horizontal zigzag pattern for efficient coverage
4. **A* Navigation**: When obstacles block the path, A* algorithm finds optimal route around them
5. **Gap Filling**: After main coverage, isolated regions are identified and filled

### Waypoint Actions

- **`paint`**: Robot moves while painting (continuous coverage)
- **`move`**: Robot repositions without painting (navigating around obstacles)

## Configuration

### Environment Variables

Create a `.env` file for custom configuration:

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Logging
LOG_PATH=logs/robot_api.log

# Database
DB_PATH=data/robot_trajectories.db
```

### Wall Configuration Defaults

- Width: 10m
- Height: 6m
- Coverage Width: 0.15m (15cm)

## Database Schema

### Tables

**trajectories**
- `id`: Trajectory hash (MD5 of configuration)
- `width`, `height`: Wall dimensions
- `coverage_width`: Robot coverage width
- `obstacle_count`: Number of obstacles
- `coverage_percent`: Coverage percentage
- `path_length`: Total path length in meters
- `duration`: Generation time in seconds
- `timestamp`: Creation timestamp

**waypoints**
- `trajectory_id`: Foreign key to trajectories
- `x`, `y`: Waypoint coordinates
- `action`: "paint" or "move"

**obstacles**
- `trajectory_id`: Foreign key to trajectories
- `name`: Obstacle type/name
- `x`, `y`: Position
- `width`, `height`: Dimensions

## Performance

Typical performance metrics:
- Small room (10m × 6m, 2 obstacles): ~0.05s generation time
- Large wall (20m × 10m, 5 obstacles): ~0.15s generation time
- Coverage efficiency: 85-95% depending on obstacle density

## Development

### Running Tests

```bash
pytest tests/
```

### Code Structure

- **Planner (`planner.py`)**: Core algorithm implementation
  - Grid-based cell representation
  - A* pathfinding for obstacle avoidance
  - Boustrophedon pattern generation

- **Database (`database.py`)**: 
  - SQLite operations
  - Trajectory storage and retrieval
  - Analytics queries

- **API (`main.py`)**:
  - FastAPI endpoints
  - Request validation
  - WebSocket management

## Troubleshooting

### Redis Connection Issues

If WebSocket doesn't work, verify Redis is running:
```bash
redis-cli ping
# Should return: PONG
```

### Database Errors

Initialize the database manually:
```python
from app.database import init_db
init_db()
```

### Frontend Not Loading

Ensure the frontend server is running on port 8080 and check browser console for errors.

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please follow these guidelines:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## Acknowledgments

Built with:
- FastAPI - Modern web framework
- SQLite - Embedded database
- Redis - Real-time messaging
- Canvas API - Visualization

## Contact

For issues and questions, please use the GitHub issue tracker.
