from __future__ import annotations
import heapq
from typing import Sequence
import numpy as np
from .energy import estimate_energy, RoverConfig

NEIGHBOURS = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]


def astar(
    blocked: np.ndarray,
    risk: np.ndarray,
    slope_deg: np.ndarray,
    start: tuple[int, int],
    goal: tuple[int, int],
    mode: str = "balanced",
) -> list[tuple[int, int]]:
    """Eight-connected A*; diagonal moves cannot cut blocked corners."""
    blocked = np.asarray(blocked, dtype=bool)
    risk = np.asarray(risk, dtype=float)
    slope = np.asarray(slope_deg, dtype=float)
    if blocked.ndim != 2 or risk.shape != blocked.shape or slope.shape != blocked.shape:
        raise ValueError("Blocked, risk and slope grids must have identical 2D shapes.")
    rows, cols = blocked.shape
    for point, label in ((start, "start"), (goal, "goal")):
        if len(point) != 2 or not (0 <= point[0] < rows and 0 <= point[1] < cols):
            raise ValueError(f"{label.title()} point is outside the terrain grid.")
    if blocked[start] or blocked[goal]:
        raise ValueError("Start and destination must be traversable cells.")
    if mode not in {"shortest", "safest", "energy", "balanced"}:
        raise ValueError("Mode must be shortest, safest, energy or balanced.")

    weights = {
        "shortest": (0.0, 0.0),
        "safest": (5.0, 1.25),
        "energy": (2.3, 2.2),
        "balanced": (3.0, 1.1),
    }
    risk_weight, slope_weight = weights[mode]
    min_cost = 1.0

    def heuristic(p: tuple[int, int]) -> float:
        # Octile lower bound for an 8-connected grid with minimum per-unit cost >= 1.
        dx, dy = abs(goal[1] - p[1]), abs(goal[0] - p[0])
        return max(dx, dy) + (np.sqrt(2.0) - 1.0) * min(dx, dy)

    open_heap: list[tuple[float, float, tuple[int, int]]] = [(heuristic(start), 0.0, start)]
    came_from: dict[tuple[int, int], tuple[int, int]] = {}
    g_score = {start: 0.0}
    closed: set[tuple[int, int]] = set()

    while open_heap:
        _, current_g, current = heapq.heappop(open_heap)
        if current in closed or current_g > g_score.get(current, float("inf")) + 1e-10:
            continue
        if current == goal:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            return list(reversed(path))
        closed.add(current)
        r, c = current
        for dr, dc in NEIGHBOURS:
            nr, nc = r + dr, c + dc
            nxt = (nr, nc)
            if not (0 <= nr < rows and 0 <= nc < cols) or blocked[nxt] or nxt in closed:
                continue
            diagonal = dr != 0 and dc != 0
            if diagonal and (blocked[r + dr, c] or blocked[r, c + dc]):
                continue
            distance = float(np.sqrt(2.0) if diagonal else 1.0)
            cell_risk = float(np.clip(risk[nxt], 0, 1))
            cell_slope = float(np.clip(slope[nxt] / 45.0, 0, 2))
            step_cost = distance * (min_cost + risk_weight * cell_risk + slope_weight * cell_slope)
            tentative = current_g + step_cost
            if tentative + 1e-10 < g_score.get(nxt, float("inf")):
                came_from[nxt] = current
                g_score[nxt] = tentative
                heapq.heappush(open_heap, (tentative + heuristic(nxt), tentative, nxt))
    return []


def route_metrics(route: Sequence[tuple[int, int]], risk: np.ndarray, slope_deg: np.ndarray, rover: RoverConfig | None = None) -> dict:
    if not route:
        return {"available": False, "distance_cells": None, "mean_risk": None, "mean_slope_deg": None, "energy": None, "waypoints": 0, "safety_score": None}
    distance = sum(float(np.hypot(b[0] - a[0], b[1] - a[1])) for a, b in zip(route, route[1:]))
    cells = route[1:] if len(route) > 1 else route
    mean_risk = float(np.mean([risk[p] for p in cells]))
    mean_slope = float(np.mean([slope_deg[p] for p in cells]))
    energy = estimate_energy(route, slope_deg, risk, rover)
    return {
        "available": True,
        "distance_cells": round(distance, 2),
        "mean_risk": round(mean_risk, 3),
        "mean_slope_deg": round(mean_slope, 2),
        "energy": energy["relative_units"],
        "waypoints": len(route),
        "safety_score": round((1.0 - mean_risk) * 100, 1),
        "energy_assumption": energy["assumption"],
    }


def plan_route(blocked: np.ndarray, risk: np.ndarray, slope_deg: np.ndarray, start: tuple[int, int], goal: tuple[int, int], mode: str = "balanced", rover: RoverConfig | None = None) -> dict:
    path = astar(blocked, risk, slope_deg, start, goal, mode)
    return {"mode": mode, "route": [[r, c] for r, c in path], "metrics": route_metrics(path, risk, slope_deg, rover), "cost_model": "Distance + configurable risk and slope penalties; lowest cost under this demonstration model."}


def compare_routes(blocked: np.ndarray, risk: np.ndarray, slope_deg: np.ndarray, start: tuple[int, int], goal: tuple[int, int], rover: RoverConfig | None = None) -> list[dict]:
    return [plan_route(blocked, risk, slope_deg, start, goal, mode, rover) for mode in ("shortest", "safest", "energy", "balanced")]
