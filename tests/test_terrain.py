import numpy as np
import pytest
from backend.app.terrain import generate_synthetic_terrain, analyze_elevation


def test_synthetic_terrain_is_repeatable_and_bounded():
    first = generate_synthetic_terrain(size=48, seed=12)
    second = generate_synthetic_terrain(size=48, seed=12)
    assert first.shape == (48, 48)
    assert np.allclose(first, second)
    assert np.isfinite(first).all()


def test_analysis_returns_valid_grids():
    dem = generate_synthetic_terrain(size=40, seed=3)
    result = analyze_elevation(dem)
    assert result.slope_deg.shape == dem.shape
    assert result.risk.min() >= 0 and result.risk.max() <= 1
    assert result.traversability.min() >= 0 and result.traversability.max() <= 1
    assert result.summary["blocked_cells"] == int(result.blocked.sum())


def test_analysis_uses_pixel_spacing():
    yy, xx = np.mgrid[:12, :12]
    dem = xx.astype(float)
    close = analyze_elevation(dem, pixel_spacing=1.0)
    far = analyze_elevation(dem, pixel_spacing=2.0)
    assert far.summary["mean_slope_deg"] < close.summary["mean_slope_deg"]


def test_invalid_elevation_is_rejected():
    with pytest.raises(ValueError):
        analyze_elevation(np.array([[1.0, np.nan, 2.0], [1, 2, 3], [3, 4, 5]]))


def test_hazard_rules_include_crater_candidates():
    analysis = analyze_elevation(generate_synthetic_terrain(size=72, seed=17))
    kinds = {item["type"] for item in analysis.hazards}
    assert "Crater-like depression" in kinds
