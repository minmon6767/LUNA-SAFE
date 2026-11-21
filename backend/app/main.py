from __future__ import annotations
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .config import settings
from .terrain import generate_synthetic_terrain, analyze_elevation, TerrainAnalysis
from .hazards import detect_hazards
from .navigation import plan_route, compare_routes
from .energy import RoverConfig
from .nasa_service import get_apod, get_status, get_donki_notifications, get_lunar_imagery, NasaAPIError, clear_cache
from .simulation import SimulationState
from .reports import build_report, csv_bytes, pdf_bytes

app = FastAPI(
    title="LUNA-SAFE 2.0 API",
    description="Decision-support simulation for lunar-like terrain analysis and rover route planning. Synthetic terrain is clearly distinguished from NASA data.",
    version="2.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

_elevation = generate_synthetic_terrain()
_analysis = analyze_elevation(_elevation)
_data_source = "Synthetic demonstration terrain (procedurally generated)"
_is_synthetic = True
_last_route: dict = {}
_last_comparison: list[dict] = []
_simulation = SimulationState()
_configuration: dict = {"size": int(_elevation.shape[0]), "seed": 17, "pixel_spacing": 1.0, "vertical_scale": 1.0, "slope_block_deg": 35.0, "roughness_block": 0.22}


class TerrainGenerateRequest(BaseModel):
    size: int = Field(default=72, ge=24, le=160)
    seed: int = Field(default=17, ge=0, le=2**32 - 1)


class TerrainAnalyzeRequest(BaseModel):
    elevation: list[list[float]] | None = None
    pixel_spacing: float = Field(default=1.0, gt=0, le=100000)
    vertical_scale: float = Field(default=1.0, gt=0, le=100000)
    slope_block_deg: float = Field(default=35.0, gt=0, lt=90)
    roughness_block: float = Field(default=0.22, gt=0)


class NavigationRequest(BaseModel):
    start: tuple[int, int]
    goal: tuple[int, int]
    mode: str = Field(default="balanced", pattern="^(shortest|safest|energy|balanced)$")
    rover: dict = Field(default_factory=dict)


class SimulationStartRequest(BaseModel):
    start: tuple[int, int]
    goal: tuple[int, int]
    mode: str = Field(default="balanced", pattern="^(shortest|safest|energy|balanced)$")


class ObstacleRequest(BaseModel):
    row: int = Field(ge=0)
    col: int = Field(ge=0)


def _rover_config(raw: dict | None) -> RoverConfig:
    raw = raw or {}
    allowed = {"base_wh_per_cell", "slope_factor", "roughness_factor", "obstacle_factor"}
    values = {key: float(value) for key, value in raw.items() if key in allowed}
    if any(not np.isfinite(v) or v < 0 or v > 100 for v in values.values()):
        raise HTTPException(status_code=422, detail="Rover configuration values must be finite and between 0 and 100.")
    return RoverConfig(**values)


def _serialise_terrain() -> dict:
    rows, cols = _elevation.shape
    return {
        "elevation": np.round(_elevation, 4).tolist(),
        "slope_deg": np.round(_analysis.slope_deg, 2).tolist(),
        "roughness": np.round(_analysis.roughness, 4).tolist(),
        "risk": np.round(_analysis.risk, 3).tolist(),
        "blocked": _analysis.blocked.astype(int).tolist(),
        "traversability": np.round(_analysis.traversability, 3).tolist(),
        "rows": rows,
        "cols": cols,
        "data_source": _data_source,
        "is_synthetic": _is_synthetic,
        "analysis": _analysis.summary,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _validate_point(point: tuple[int, int], label: str) -> None:
    r, c = point
    if not (0 <= r < _elevation.shape[0] and 0 <= c < _elevation.shape[1]):
        raise HTTPException(status_code=422, detail=f"{label} must be inside the current terrain grid.")
    if _analysis.blocked[r, c]:
        raise HTTPException(status_code=422, detail=f"{label} is currently marked as blocked. Choose a traversable cell.")


def _mission_report() -> dict:
    return build_report({
        "data_source": _data_source,
        "terrain_is_synthetic": _is_synthetic,
        "configuration": _configuration,
        "selected_route": _last_route,
        "route_comparison": _last_comparison,
        "hazards": _analysis.hazards,
    })


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "LUNA-SAFE 2.0 API", "version": "2.0.0", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/terrain")
def get_terrain() -> dict:
    return _serialise_terrain()


@app.post("/api/terrain/generate")
def generate_terrain(payload: TerrainGenerateRequest) -> dict:
    global _elevation, _analysis, _data_source, _is_synthetic, _last_route, _last_comparison, _simulation, _configuration
    try:
        _elevation = generate_synthetic_terrain(payload.size, payload.seed)
        _analysis = analyze_elevation(_elevation)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    _data_source = f"Synthetic demonstration terrain (procedurally generated, seed {payload.seed})"
    _is_synthetic = True
    _configuration = {"size": payload.size, "seed": payload.seed, "pixel_spacing": 1.0, "vertical_scale": 1.0, "slope_block_deg": 35.0, "roughness_block": 0.22}
    _last_route, _last_comparison = {}, []
    _simulation = SimulationState()
    return _serialise_terrain()


@app.post("/api/terrain/upload")
async def upload_terrain(file: UploadFile = File(...), pixel_spacing: float = Query(default=1.0, gt=0), vertical_scale: float = Query(default=1.0, gt=0)) -> dict:
    global _elevation, _analysis, _data_source, _is_synthetic, _configuration, _last_route, _last_comparison, _simulation
    filename = (file.filename or "").lower()
    if not filename.endswith(".csv"):
        raise HTTPException(status_code=415, detail="Only numeric CSV elevation grids are supported by this importer. Convert GeoTIFF to CSV only after preserving its spacing and vertical units.")
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Upload exceeds the 10 MB limit.")
    try:
        grid = np.loadtxt(BytesIO(content), delimiter=",")
        if grid.ndim != 2 or min(grid.shape) < 3 or max(grid.shape) > 512:
            raise ValueError("CSV must contain a 3x3 to 512x512 numeric elevation grid.")
        if not np.isfinite(grid).all():
            raise ValueError("CSV contains missing or non-finite elevation values.")
        analysis = analyze_elevation(grid, pixel_spacing=pixel_spacing, vertical_scale=vertical_scale)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=422, detail=f"Could not load elevation CSV: {exc}") from exc
    _elevation = grid.astype(np.float32)
    _analysis = analysis
    _data_source = f"User-imported CSV elevation grid ({file.filename}); geospatial reference metadata is not included in CSV."
    _is_synthetic = False
    _configuration = {"size": int(grid.shape[0]), "cols": int(grid.shape[1]), "pixel_spacing": pixel_spacing, "vertical_scale": vertical_scale, "slope_block_deg": 35.0, "roughness_block": 0.22}
    _last_route, _last_comparison = {}, []
    _simulation = SimulationState()
    return _serialise_terrain()


@app.post("/api/terrain/analyze")
def analyze_terrain(payload: TerrainAnalyzeRequest) -> dict:
    global _elevation, _analysis, _configuration
    try:
        if payload.elevation is not None:
            grid = np.asarray(payload.elevation, dtype=np.float32)
            if grid.ndim != 2 or max(grid.shape) > 512:
                raise ValueError("Elevation must be a 2D grid no larger than 512x512.")
            _elevation = grid
        _analysis = analyze_elevation(_elevation, payload.pixel_spacing, payload.vertical_scale, payload.slope_block_deg, payload.roughness_block)
        _configuration.update({"pixel_spacing": payload.pixel_spacing, "vertical_scale": payload.vertical_scale, "slope_block_deg": payload.slope_block_deg, "roughness_block": payload.roughness_block})
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _serialise_terrain()


@app.post("/api/hazards/detect")
def hazards() -> dict:
    return detect_hazards(_analysis)


@app.post("/api/navigation/plan")
def navigation_plan(payload: NavigationRequest) -> dict:
    global _last_route
    _validate_point(payload.start, "Start")
    _validate_point(payload.goal, "Destination")
    try:
        result = plan_route(_analysis.blocked, _analysis.risk, _analysis.slope_deg, payload.start, payload.goal, payload.mode, _rover_config(payload.rover))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not result["metrics"]["available"]:
        raise HTTPException(status_code=409, detail="No traversable route exists between the selected points.")
    _last_route = result
    return result


@app.post("/api/navigation/compare")
def navigation_compare(payload: NavigationRequest) -> dict:
    global _last_comparison, _last_route
    _validate_point(payload.start, "Start")
    _validate_point(payload.goal, "Destination")
    try:
        _last_comparison = compare_routes(_analysis.blocked, _analysis.risk, _analysis.slope_deg, payload.start, payload.goal, _rover_config(payload.rover))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    available = [r for r in _last_comparison if r["metrics"]["available"]]
    if not available:
        raise HTTPException(status_code=409, detail="No route strategy found a traversable path for these points.")
    selected = next((r for r in _last_comparison if r["mode"] == payload.mode and r["metrics"]["available"]), available[0])
    _last_route = selected
    return {"routes": _last_comparison, "selected": selected, "start": list(payload.start), "goal": list(payload.goal)}


@app.post("/api/simulation/start")
def simulation_start(payload: SimulationStartRequest) -> dict:
    _validate_point(payload.start, "Start")
    _validate_point(payload.goal, "Destination")
    result = _simulation.start_simulation(_analysis.blocked, _analysis.risk, _analysis.slope_deg, payload.start, payload.goal, payload.mode)
    if not result["active"]:
        raise HTTPException(status_code=409, detail="Simulation cannot start because no route is available.")
    return result


@app.post("/api/simulation/obstacle")
def simulation_obstacle(payload: ObstacleRequest) -> dict:
    global _analysis, _last_route
    if not _simulation.route:
        raise HTTPException(status_code=409, detail="Start a simulation before introducing an obstacle.")
    if payload.row >= _elevation.shape[0] or payload.col >= _elevation.shape[1]:
        raise HTTPException(status_code=422, detail="Obstacle coordinates are outside the terrain grid.")
    if (payload.row, payload.col) in (_simulation.start, _simulation.goal):
        raise HTTPException(status_code=422, detail="An obstacle cannot be placed on the rover start or destination.")
    _analysis.blocked[payload.row, payload.col] = True
    _analysis.risk[payload.row, payload.col] = 1.0
    _analysis.traversability[payload.row, payload.col] = 0.0
    result = _simulation.add_obstacle(_analysis.blocked, _analysis.risk, _analysis.slope_deg, payload.row, payload.col)
    _last_route = result.get("plan") or {}
    if not result["active"]:
        result["message"] = "Obstacle was inserted, but no alternate route exists."
    return result


@app.get("/api/nasa/status")
def nasa_status() -> dict:
    return get_status()


@app.get("/api/nasa/apod")
def nasa_apod(date: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")) -> dict:
    try:
        return get_apod(date)
    except NasaAPIError as exc:
        raise HTTPException(status_code=502, detail={"message": str(exc), "http_status": exc.status_code, "source": "NASA APOD"}) from exc


@app.get("/api/nasa/lunar-imagery")
def nasa_lunar_imagery(q: str = Query(default="Moon lunar surface", min_length=2, max_length=120), page_size: int = Query(default=8, ge=1, le=20)) -> dict:
    try:
        return get_lunar_imagery(q, page_size)
    except NasaAPIError as exc:
        raise HTTPException(status_code=502, detail={"message": str(exc), "http_status": exc.status_code, "source": "NASA Image and Video Library"}) from exc


@app.get("/api/nasa/donki")
def nasa_donki(start_date: date | None = Query(default=None), end_date: date | None = Query(default=None)) -> dict:
    end = end_date or datetime.now(timezone.utc).date()
    start = start_date or (end - timedelta(days=6))
    if start > end:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date.")
    if (end - start).days > 30:
        raise HTTPException(status_code=422, detail="DONKI date range cannot exceed 30 days.")
    try:
        return get_donki_notifications(start.isoformat(), end.isoformat())
    except NasaAPIError as exc:
        raise HTTPException(status_code=502, detail={"message": str(exc), "http_status": exc.status_code, "source": "NASA DONKI"}) from exc


@app.post("/api/nasa/cache/clear")
def nasa_cache_clear() -> dict:
    return {"cleared_entries": clear_cache(), "message": "NASA response cache cleared."}


@app.get("/api/mission/report")
def mission_report(format: str = Query(default="json", pattern="^(json|csv|pdf)$")):
    report = _mission_report()
    if format == "json":
        return report
    if format == "csv":
        return Response(content=csv_bytes(report), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=luna-safe-mission-report.csv"})
    try:
        content = pdf_bytes(report)
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    return Response(content=content, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=luna-safe-mission-report.pdf"})
