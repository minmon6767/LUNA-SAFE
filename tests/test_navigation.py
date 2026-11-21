import numpy as np
from backend.app.navigation import astar, plan_route, compare_routes


def make_grid(n=14):
    blocked = np.zeros((n, n), dtype=bool)
    risk = np.zeros((n, n), dtype=float)
    slope = np.zeros((n, n), dtype=float)
    return blocked, risk, slope


def test_astar_finds_route_and_avoids_blocked_cells():
    blocked, risk, slope = make_grid()
    blocked[3:11, 6] = True
    blocked[7, 6] = False
    path = astar(blocked, risk, slope, (1, 1), (12, 12), "balanced")
    assert path[0] == (1, 1) and path[-1] == (12, 12)
    assert all(not blocked[p] for p in path)


def test_astar_prevents_diagonal_corner_cutting():
    blocked, risk, slope = make_grid(3)
    blocked[0, 1] = True
    blocked[1, 0] = True
    path = astar(blocked, risk, slope, (0, 0), (1, 1), "shortest")
    assert path == []


def test_astar_reports_no_route():
    blocked, risk, slope = make_grid(8)
    blocked[:, 4] = True
    assert astar(blocked, risk, slope, (3, 1), (3, 6), "balanced") == []


def test_route_modes_and_metrics_work():
    blocked, risk, slope = make_grid(18)
    risk[4:14, 5:13] = 0.7
    slope[4:14, 5:13] = 18
    compared = compare_routes(blocked, risk, slope, (1, 1), (16, 16))
    assert [route["mode"] for route in compared] == ["shortest", "safest", "energy", "balanced"]
    assert all(route["metrics"]["available"] for route in compared)
    assert all(route["metrics"]["energy"] >= 0 for route in compared)


def test_plan_returns_empty_metrics_for_unreachable_goal():
    blocked, risk, slope = make_grid(8)
    blocked[:, 4] = True
    result = plan_route(blocked, risk, slope, (2, 1), (2, 6))
    assert result["route"] == []
    assert result["metrics"]["available"] is False
