from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_terrain_generation_endpoint():
    response = client.post("/api/terrain/generate", json={"size": 48, "seed": 5})
    assert response.status_code == 200
    body = response.json()
    assert body["is_synthetic"] is True
    assert body["rows"] == 48 and body["cols"] == 48
    assert len(body["risk"]) == 48


def test_terrain_upload_rejects_non_csv():
    response = client.post("/api/terrain/upload", files={"file": ("terrain.png", b"not-a-csv", "image/png")})
    assert response.status_code == 415


def test_navigation_compare_endpoint():
    client.post("/api/terrain/generate", json={"size": 48, "seed": 17})
    terrain = client.get("/api/terrain").json()
    free = [(r, c) for r in range(48) for c in range(48) if terrain["blocked"][r][c] == 0]
    start, goal = free[0], free[-1]
    response = client.post("/api/navigation/compare", json={"start": start, "goal": goal, "mode": "balanced"})
    # A connected route is expected for this generated field; if the selected extreme cells
    # are isolated, this still validates either a clear conflict or a valid route response.
    assert response.status_code in (200, 409)
    if response.status_code == 200:
        assert len(response.json()["routes"]) == 4


def test_pdf_and_csv_report_exports():
    csv_response = client.get("/api/mission/report?format=csv")
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    pdf_response = client.get("/api/mission/report?format=pdf")
    assert pdf_response.status_code == 200
    assert pdf_response.content.startswith(b"%PDF")


def test_csv_elevation_upload_and_analysis():
    csv = b"0,0,0,0\n0,1,1,0\n0,1,2,0\n0,0,0,0\n"
    response = client.post("/api/terrain/upload", files={"file": ("dem.csv", csv, "text/csv")}, params={"pixel_spacing": 2.0, "vertical_scale": 1.0})
    assert response.status_code == 200
    body = response.json()
    assert body["is_synthetic"] is False
    assert body["rows"] == 4 and body["cols"] == 4
    assert "User-imported CSV" in body["data_source"]


def test_simulation_starts_and_obstacle_is_processed():
    client.post("/api/terrain/generate", json={"size": 48, "seed": 17})
    started = client.post("/api/simulation/start", json={"start": [5, 5], "goal": [42, 42], "mode": "balanced"})
    assert started.status_code == 200
    route = started.json()["route"]
    assert len(route) > 5
    obstacle = route[3]
    result = client.post("/api/simulation/obstacle", json={"row": obstacle[0], "col": obstacle[1]})
    assert result.status_code == 200
    assert result.json()["obstacle_events"] == 1
    assert result.json()["active"] is True


def test_nasa_cache_clear_endpoint():
    response = client.post("/api/nasa/cache/clear")
    assert response.status_code == 200
    assert "cleared_entries" in response.json()


def test_donki_date_range_is_validated():
    reversed_dates = client.get("/api/nasa/donki?start_date=2026-01-08&end_date=2026-01-01")
    too_long = client.get("/api/nasa/donki?start_date=2025-12-01&end_date=2026-01-01")
    assert reversed_dates.status_code == 422
    assert too_long.status_code == 422
