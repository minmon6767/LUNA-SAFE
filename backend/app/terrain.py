from __future__ import annotations
from dataclasses import dataclass
import numpy as np
import cv2


@dataclass
class TerrainAnalysis:
    slope_deg: np.ndarray
    roughness: np.ndarray
    risk: np.ndarray
    blocked: np.ndarray
    traversability: np.ndarray
    hazards: list[dict]
    summary: dict


def generate_synthetic_terrain(size: int = 72, seed: int = 17) -> np.ndarray:
    """Create repeatable cratered terrain for offline demonstrations only."""
    if not 24 <= size <= 160:
        raise ValueError("Terrain size must be between 24 and 160 cells.")
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:size, 0:size]
    x = x / (size - 1)
    y = y / (size - 1)
    base = 0.10 * np.sin(x * 12.0) + 0.08 * np.cos(y * 9.0) + 0.05 * np.sin((x + y) * 18.0)
    base += cv2.GaussianBlur(rng.normal(0, 0.12, (size, size)).astype(np.float32), (0, 0), sigmaX=2.5)

    # Bowl-shaped craters with raised rims; coordinates and amplitudes are synthetic.
    for _ in range(max(5, size // 9)):
        cx, cy = rng.uniform(0.08, 0.92, 2)
        radius = rng.uniform(0.025, 0.095)
        depth = rng.uniform(0.20, 0.55)
        d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        bowl = -depth * np.exp(-((d / radius) ** 2) * 2.2)
        rim = 0.14 * np.exp(-(((d - radius * 1.18) / (radius * 0.22)) ** 2))
        base += bowl + rim

    # A few sharper peaks model boulder-like obstacles in the synthetic grid.
    for _ in range(max(4, size // 14)):
        cx, cy = rng.uniform(0.05, 0.95, 2)
        radius = rng.uniform(0.008, 0.022)
        height = rng.uniform(0.18, 0.42)
        d2 = (x - cx) ** 2 + (y - cy) ** 2
        base += height * np.exp(-d2 / (2 * radius**2))

    return np.asarray(base * 4.0, dtype=np.float32)


def analyze_elevation(
    elevation: np.ndarray,
    pixel_spacing: float = 1.0,
    vertical_scale: float = 1.0,
    slope_block_deg: float = 35.0,
    roughness_block: float = 0.22,
) -> TerrainAnalysis:
    """Analyse an elevation grid. Thresholds are demo assumptions, not rover standards."""
    dem = np.asarray(elevation, dtype=np.float64)
    if dem.ndim != 2 or min(dem.shape) < 3:
        raise ValueError("Elevation data must be a 2D grid at least 3x3 cells.")
    if not np.isfinite(dem).all():
        raise ValueError("Elevation data contains non-finite values.")
    if pixel_spacing <= 0 or vertical_scale <= 0:
        raise ValueError("Pixel spacing and vertical scale must be positive.")

    dz_dy, dz_dx = np.gradient(dem * vertical_scale, pixel_spacing, pixel_spacing)
    slope_deg = np.degrees(np.arctan(np.hypot(dz_dx, dz_dy)))
    local_mean = cv2.GaussianBlur(dem.astype(np.float32), (0, 0), sigmaX=1.15)
    roughness = np.abs(dem - local_mean)
    kernel = np.ones((5, 5), dtype=np.uint8)
    local_max = cv2.dilate(dem.astype(np.float32), kernel)
    local_min = cv2.erode(dem.astype(np.float32), kernel)
    local_relief = local_max - local_min

    slope_component = np.clip(slope_deg / max(slope_block_deg, 1e-6), 0, 1)
    rough_component = np.clip(roughness / max(roughness_block, 1e-6), 0, 1)
    relief_component = np.clip(local_relief / max(roughness_block * 3.5, 1e-6), 0, 1)
    risk = np.clip(0.58 * slope_component + 0.27 * rough_component + 0.15 * relief_component, 0, 1)

    blocked = (slope_deg >= slope_block_deg) | ((roughness >= roughness_block) & (slope_deg > 12.0))
    # Keep only high-risk terrain blocked; route planner also penalises non-blocked risk.
    traversability = np.clip(1.0 - risk, 0, 1)
    traversability[blocked] = 0.0

    hazards: list[dict] = []
    high_slope = np.argwhere(slope_deg >= slope_block_deg)
    for row, col in high_slope[:30]:
        hazards.append({"type": "Steep slope", "row": int(row), "col": int(col), "severity": "high", "risk": round(float(risk[row, col]), 3), "explanation": f"Estimated slope {slope_deg[row, col]:.1f}° exceeds the configurable {slope_block_deg:.0f}° demo threshold."})

    crater_mask = (dem == local_min) & ((local_mean - dem) > roughness_block * 0.4) & (local_relief > roughness_block * 2.1)
    for row, col in np.argwhere(crater_mask)[:20]:
        hazards.append({"type": "Crater-like depression", "row": int(row), "col": int(col), "severity": "elevated", "risk": round(float(risk[row, col]), 3), "explanation": "A local low point with a surrounding elevation rim signature; this grid-based candidate is not a confirmed crater boundary."})

    rough_mask = (roughness >= roughness_block) & (slope_deg <= slope_block_deg)
    rough_points = np.argwhere(rough_mask)
    # Sparse local maxima approximate isolated boulder-like returns in this synthetic/elevation grid.
    boulder_mask = (dem == local_max) & (local_relief > roughness_block * 2.1) & (slope_deg < slope_block_deg)
    for row, col in np.argwhere(boulder_mask)[:18]:
        hazards.append({"type": "Boulder-like feature", "row": int(row), "col": int(col), "severity": "elevated", "risk": round(float(risk[row, col]), 3), "explanation": "A local elevation peak with pronounced neighbourhood relief; confirm against imagery before treating it as a physical boulder."})
    for row, col in rough_points[:18]:
        if len(hazards) >= 55:
            break
        hazards.append({"type": "Rough terrain", "row": int(row), "col": int(col), "severity": "moderate", "risk": round(float(risk[row, col]), 3), "explanation": "Local elevation differs from its smoothed neighbourhood, indicating roughness in the supplied grid."})

    valid_slope = slope_deg[np.isfinite(slope_deg)]
    return TerrainAnalysis(
        slope_deg=slope_deg.astype(np.float32),
        roughness=roughness.astype(np.float32),
        risk=risk.astype(np.float32),
        blocked=blocked.astype(bool),
        traversability=traversability.astype(np.float32),
        hazards=hazards,
        summary={
            "mean_slope_deg": round(float(np.mean(valid_slope)), 2),
            "max_slope_deg": round(float(np.max(valid_slope)), 2),
            "mean_risk": round(float(np.mean(risk)), 3),
            "blocked_cells": int(np.count_nonzero(blocked)),
            "hazards_reported": len(hazards),
            "slope_threshold_deg": float(slope_block_deg),
            "roughness_threshold": float(roughness_block),
            "threshold_note": "Configurable demonstration assumptions; not validated lunar rover safety limits.",
        },
    )
