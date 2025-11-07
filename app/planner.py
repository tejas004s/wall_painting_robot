from pydantic import BaseModel
from typing import List, Tuple, Optional
import heapq

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

class Cell:
    """Represents a grid cell for path planning"""
    def __init__(self, row: int, col: int, x: float, y: float):
        self.row = row
        self.col = col
        self.x = x
        self.y = y
        self.visited = False
        self.blocked = False
    
    def __lt__(self, other):
        return (self.row, self.col) < (other.row, other.col)

def generate_trajectory(config: WallConfig) -> List[Waypoint]:
    """
    Generate wall painting trajectory with intelligent obstacle avoidance.
    When obstacle is encountered, robot goes around it and fills all gaps.
    """
    # Create a grid representation
    grid = create_grid(config)
    
    # Mark obstacles
    mark_obstacles(grid, config)
    
    # Generate painting path
    waypoints = paint_with_obstacle_avoidance(grid, config)
    
    return remove_consecutive_duplicates(waypoints)

def create_grid(config: WallConfig) -> List[List[Cell]]:
    """Create grid cells for the wall"""
    num_rows = max(1, int(config.height / config.coverage_width))
    num_cols = max(1, int(config.width / config.coverage_width))
    
    grid = []
    for row in range(num_rows):
        grid_row = []
        y = (row + 0.5) * config.coverage_width
        
        for col in range(num_cols):
            x = (col + 0.5) * config.coverage_width
            cell = Cell(row, col, x, y)
            grid_row.append(cell)
        
        grid.append(grid_row)
    
    return grid

def mark_obstacles(grid: List[List[Cell]], config: WallConfig):
    """Mark grid cells that are blocked by obstacles"""
    for row in grid:
        for cell in row:
            for obs in config.obstacles:
                # Check if cell center is inside obstacle (with small margin)
                margin = config.coverage_width * 0.3
                if (obs.x - margin <= cell.x <= obs.x + obs.width + margin and
                    obs.y - margin <= cell.y <= obs.y + obs.height + margin):
                    cell.blocked = True
                    break

def paint_with_obstacle_avoidance(grid: List[List[Cell]], config: WallConfig) -> List[Waypoint]:
    """
    Main painting algorithm: boustrophedon with obstacle navigation.
    When hitting obstacle, go around it and continue painting.
    """
    if not grid or not grid[0]:
        return []
    
    waypoints = []
    num_rows = len(grid)
    num_cols = len(grid[0])
    
    row = 0
    direction = 1  # 1 = left-to-right, -1 = right-to-left
    
    while row < num_rows:
        # Get paintable segments in this row
        segments = get_row_segments(grid, row)
        
        if not segments:
            row += 1
            direction *= -1
            continue
        
        # Reverse segments if going right-to-left
        if direction == -1:
            segments = segments[::-1]
        
        for seg_start_col, seg_end_col in segments:
            # Navigate to segment start if needed
            if waypoints:
                last_x, last_y = waypoints[-1].x, waypoints[-1].y
                target_cell = grid[row][seg_start_col]
                
                # Check if we need to navigate around obstacles
                if not is_adjacent(last_x, last_y, target_cell.x, target_cell.y, config.coverage_width):
                    # Find path around obstacles
                    nav_path = find_path_around_obstacles(
                        grid, last_x, last_y, target_cell, config
                    )
                    waypoints.extend(nav_path)
            
            # Paint the segment
            if direction == 1:
                cols = range(seg_start_col, seg_end_col + 1)
            else:
                cols = range(seg_end_col, seg_start_col - 1, -1)
            
            for col in cols:
                cell = grid[row][col]
                if not cell.blocked and not cell.visited:
                    # Determine action based on continuity
                    if waypoints and is_adjacent(waypoints[-1].x, waypoints[-1].y, 
                                                 cell.x, cell.y, config.coverage_width):
                        action = "paint"
                    else:
                        action = "move"
                    
                    waypoints.append(Waypoint(x=cell.x, y=cell.y, action=action))
                    cell.visited = True
        
        row += 1
        direction *= -1
    
    # Fill any remaining unvisited cells (isolated regions)
    fill_isolated_regions(grid, waypoints, config)
    
    return waypoints

def get_row_segments(grid: List[List[Cell]], row: int) -> List[Tuple[int, int]]:
    """Get continuous segments of non-blocked cells in a row"""
    if row >= len(grid):
        return []
    
    segments = []
    start_col = None
    
    for col, cell in enumerate(grid[row]):
        if not cell.blocked:
            if start_col is None:
                start_col = col
        else:
            if start_col is not None:
                segments.append((start_col, col - 1))
                start_col = None
    
    # Close last segment
    if start_col is not None:
        segments.append((start_col, len(grid[row]) - 1))
    
    return segments

def is_adjacent(x1: float, y1: float, x2: float, y2: float, coverage: float) -> bool:
    """Check if two points are adjacent (within one cell distance)"""
    dx = abs(x2 - x1)
    dy = abs(y2 - y1)
    threshold = coverage * 1.5
    return dx < threshold and dy < threshold

def find_path_around_obstacles(
    grid: List[List[Cell]], 
    start_x: float, 
    start_y: float, 
    target_cell: Cell,
    config: WallConfig
) -> List[Waypoint]:
    """
    Use A* pathfinding to navigate around obstacles.
    Returns waypoints with action="move" for navigation.
    """
    # Find start cell
    start_cell = find_nearest_cell(grid, start_x, start_y)
    if not start_cell or start_cell.blocked:
        return []
    
    # A* algorithm
    def heuristic(cell: Cell) -> float:
        return abs(cell.x - target_cell.x) + abs(cell.y - target_cell.y)
    
    open_set = [(heuristic(start_cell), start_cell)]
    came_from = {}
    g_score = {(start_cell.row, start_cell.col): 0}
    
    while open_set:
        _, current = heapq.heappop(open_set)
        
        # Reached target
        if current.row == target_cell.row and current.col == target_cell.col:
            return reconstruct_path(came_from, current, start_cell)
        
        # Check all neighbors (4-directional)
        for dr, dc in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
            new_row = current.row + dr
            new_col = current.col + dc
            
            # Check bounds
            if new_row < 0 or new_row >= len(grid):
                continue
            if new_col < 0 or new_col >= len(grid[0]):
                continue
            
            neighbor = grid[new_row][new_col]
            
            # Skip blocked cells
            if neighbor.blocked:
                continue
            
            # Calculate scores
            tentative_g = g_score[(current.row, current.col)] + config.coverage_width
            
            if (neighbor.row, neighbor.col) not in g_score or tentative_g < g_score[(neighbor.row, neighbor.col)]:
                came_from[(neighbor.row, neighbor.col)] = current
                g_score[(neighbor.row, neighbor.col)] = tentative_g
                f_score = tentative_g + heuristic(neighbor)
                heapq.heappush(open_set, (f_score, neighbor))
    
    # No path found
    return []

def reconstruct_path(came_from: dict, current: Cell, start: Cell) -> List[Waypoint]:
    """Reconstruct path from A* came_from mapping"""
    path = []
    
    while (current.row, current.col) in came_from:
        # Don't include start cell in navigation path
        if current.row != start.row or current.col != start.col:
            path.append(Waypoint(x=current.x, y=current.y, action="move"))
        current = came_from[(current.row, current.col)]
    
    return list(reversed(path))

def find_nearest_cell(grid: List[List[Cell]], x: float, y: float) -> Optional[Cell]:
    """Find the grid cell nearest to given coordinates"""
    if not grid or not grid[0]:
        return None
    
    min_dist = float('inf')
    nearest = None
    
    for row in grid:
        for cell in row:
            dist = (cell.x - x) ** 2 + (cell.y - y) ** 2
            if dist < min_dist:
                min_dist = dist
                nearest = cell
    
    return nearest

def fill_isolated_regions(grid: List[List[Cell]], waypoints: List[Waypoint], config: WallConfig):
    """Fill any remaining unvisited cells that were isolated by obstacles"""
    for row in grid:
        for cell in row:
            if not cell.blocked and not cell.visited:
                # Navigate to this cell
                if waypoints:
                    nav_path = find_path_around_obstacles(
                        grid, waypoints[-1].x, waypoints[-1].y, cell, config
                    )
                    waypoints.extend(nav_path)
                
                # Paint this cell
                waypoints.append(Waypoint(x=cell.x, y=cell.y, action="paint"))
                cell.visited = True

def remove_consecutive_duplicates(waypoints: List[Waypoint]) -> List[Waypoint]:
    """Remove consecutive duplicate waypoints"""
    if not waypoints:
        return []
    
    filtered = [waypoints[0]]
    
    for wp in waypoints[1:]:
        prev = filtered[-1]
        # Keep if position changed
        if abs(wp.x - prev.x) > 0.001 or abs(wp.y - prev.y) > 0.001:
            filtered.append(wp)
    
    return filtered