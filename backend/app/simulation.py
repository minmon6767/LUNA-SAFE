from dataclasses import dataclass, field
import numpy as np
from .navigation import plan_route


@dataclass
class SimulationState:
    active: bool = False
    start: tuple[int, int] = (5, 5)
    goal: tuple[int, int] = (60, 60)
    mode: str = "balanced"
    route: list[tuple[int, int]] = field(default_factory=list)
    obstacle_events: int = 0
    reroutes: int = 0

    def start_simulation(self, blocked: np.ndarray, risk: np.ndarray, slope: np.ndarray, start: tuple[int, int], goal: tuple[int, int], mode: str) -> dict:
        self.start, self.goal, self.mode = start, goal, mode
        plan = plan_route(blocked, risk, slope, start, goal, mode)
        self.route = [tuple(p) for p in plan["route"]]
        self.active = bool(self.route)
        self.obstacle_events = 0
        self.reroutes = 0
        return self.snapshot(plan)

    def add_obstacle(self, blocked: np.ndarray, risk: np.ndarray, slope: np.ndarray, row: int, col: int) -> dict:
        blocked[row, col] = True
        self.obstacle_events += 1
        plan = plan_route(blocked, risk, slope, self.start, self.goal, self.mode)
        new_route = [tuple(p) for p in plan["route"]]
        rerouted = bool(new_route) and new_route != self.route
        self.route = new_route
        self.active = bool(new_route)
        if rerouted:
            self.reroutes += 1
        return {**self.snapshot(plan), "rerouted": rerouted, "obstacle": {"row": row, "col": col}}

    def snapshot(self, plan: dict | None = None) -> dict:
        return {
            "active": self.active,
            "start": list(self.start),
            "goal": list(self.goal),
            "mode": self.mode,
            "route": [list(p) for p in self.route],
            "obstacle_events": self.obstacle_events,
            "reroutes": self.reroutes,
            "plan": plan,
            "message": "Simulation route available." if self.route else "No traversable route is currently available.",
        }
