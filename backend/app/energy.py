from dataclasses import dataclass
from typing import Sequence
import numpy as np


@dataclass
class RoverConfig:
    base_wh_per_cell: float = 0.8
    slope_factor: float = 2.2
    roughness_factor: float = 1.4
    obstacle_factor: float = 0.6


def estimate_energy(
    route: Sequence[tuple[int, int]],
    slope_deg: np.ndarray,
    risk: np.ndarray,
    config: RoverConfig | None = None,
) -> dict:
    """Return a relative energy estimate; this is not a physical rover power model."""
    cfg = config or RoverConfig()
    if len(route) < 2:
        return {"relative_units": 0.0, "mean_slope_deg": 0.0, "mean_risk": 0.0, "assumption": "Relative units only; configurable demonstration model."}

    distance = 0.0
    slopes: list[float] = []
    risks: list[float] = []
    for (r0, c0), (r1, c1) in zip(route, route[1:]):
        distance += float(np.hypot(r1 - r0, c1 - c0))
        slopes.append(float(slope_deg[r1, c1]))
        risks.append(float(risk[r1, c1]))

    mean_slope = float(np.mean(slopes)) if slopes else 0.0
    mean_risk = float(np.mean(risks)) if risks else 0.0
    energy = distance * cfg.base_wh_per_cell * (
        1.0 + cfg.slope_factor * mean_slope / 45.0
        + cfg.roughness_factor * mean_risk
        + cfg.obstacle_factor * mean_risk * mean_slope / 45.0
    )
    return {
        "relative_units": round(float(energy), 2),
        "mean_slope_deg": round(mean_slope, 2),
        "mean_risk": round(mean_risk, 3),
        "assumption": "Relative demonstration units, not watt-hours or a validated rover power model.",
    }
