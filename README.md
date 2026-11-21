# LUNA-SAFE 2.0

**AI-Assisted Lunar Terrain Intelligence & Autonomous Rover Navigation System**  
A hackathon-ready, browser-based decision-support simulation built with React/Vite and FastAPI.

> **Important:** LUNA-SAFE 2.0 is a research/education demonstration, not flight software and not a controller for a physical rover. Its default terrain is generated synthetic data. It is never labelled as NASA elevation data. Risk thresholds and energy estimates are configurable model assumptions, not certified lunar rover safety limits.

## What is implemented

- **Mission dashboard:** calculated terrain risk, selected route metrics, detected hazard candidates, NASA connection state, and mission events.
- **NASA data centre:** server-side NASA APOD Basic, NASA Image and Video Library lunar-image search, and DONKI notifications integration; key protection; connection diagnostics; attribution; a 15-minute in-process cache; and clear-cache action. APOD is general astronomy content and is not treated as a lunar terrain map.
- **Terrain generation and import:** deterministic crater-like synthetic terrain for offline demos; numeric CSV elevation-grid upload (3×3 to 512×512, 10 MB maximum), finite-value validation, configurable pixel spacing and vertical scale.
- **Terrain intelligence:** gradient-derived slope in degrees, local roughness and neighbourhood relief, a traversability grid and configurable risk thresholds.
- **Hazard detection:** transparent rules for steep slopes, crater-like depressions, rough terrain and boulder-like local peaks. These are candidates for inspection, not a trained/validated lunar object detector. Confidence scores are intentionally not fabricated.
- **Navigation:** 8-connected A* with diagonal corner-cutting prevention, blocked-cell avoidance, and shortest/safest/energy-aware/balanced weighted cost modes. The heuristic is octile distance and is a lower bound for the implemented non-negative costs.
- **Energy estimation:** configurable relative energy units based on distance, mean slope and mean risk. These are not watt-hours and do not claim to reproduce a particular rover.
- **3D terrain:** React Three Fiber surface uses the backend elevation grid and its risk values, with route, start and destination overlays.
- **Mission simulation:** virtual rover progress, pause/resume/reset, obstacle injection into an upcoming route cell and backend A* re-planning.
- **Reports:** JSON, CSV and PDF exports with source labels and limitations.
- **Testing:** Pytest tests for terrain generation/analysis, A*, route strategy metrics, API endpoints and report export.

## Architecture

```text
Browser (React + Vite)
  ├─ Mission-control pages and responsive UI
  ├─ 2D SVG terrain risk grid
  ├─ 3D React Three Fiber terrain surface
  ├─ Recharts route comparisons
  └─ Axios → FastAPI JSON / file endpoints
          │
          ▼
FastAPI backend
  ├─ NASA service (APOD, cache, timeouts, error handling)
  ├─ Terrain generator / CSV importer
  ├─ Terrain analysis (NumPy + OpenCV)
  ├─ Hazard rules
  ├─ A* route planning and route comparison
  ├─ Relative energy model
  ├─ In-memory mission simulation state
  └─ JSON / CSV / PDF reporting
```

Backend simulation state is held in memory. Restarting the backend resets the active terrain and mission. This single-instance design is appropriate for a local hackathon demonstration, not a multi-user production deployment.

## Project layout

```text
LUNA-SAFE-2/
├── frontend/
│   ├── src/
│   │   ├── components/       # terrain map, 3D surface, metric cards
│   │   ├── services/         # Axios API client
│   │   ├── App.jsx           # mission-control pages and interactions
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI routes and in-memory mission state
│   │   ├── config.py         # environment configuration
│   │   ├── nasa_service.py   # NASA APOD service + cache
│   │   ├── terrain.py        # synthetic generator + terrain analysis
│   │   ├── hazards.py        # rule-based hazard summary
│   │   ├── navigation.py     # A* and route metrics
│   │   ├── energy.py         # relative energy model
│   │   ├── simulation.py     # virtual rover state
│   │   └── reports.py        # JSON/CSV/PDF output
│   └── requirements.txt
├── datasets/
│   ├── synthetic/README.md
│   └── imported/README.md
├── tests/
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

## Requirements

- Python 3.10 or newer (Python 3.11 is a good default).
- Node.js 20 or newer and npm.
- Internet connection only for initial package installation and live NASA APOD data. Terrain generation, analysis, route planning, simulation and reports work offline.
- A free NASA API key is recommended. The backend falls back to NASA's shared `DEMO_KEY` if you have not configured a personal key; NASA may rate-limit the shared key.

## Run on macOS / Linux

Open two terminal windows in the extracted `LUNA-SAFE-2` folder.

### 1. Configure the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

In the project root, create the private environment file:

```bash
cd ..
cp .env.example .env
```

Open `.env` and replace `YOUR_NASA_API_KEY` with your key from <https://api.nasa.gov/>. Do not put the key in any file inside `frontend/src` and do not commit `.env`.

Start the backend from the `backend` directory:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend health check: <http://127.0.0.1:8000/api/health>  
Interactive API documentation: <http://127.0.0.1:8000/docs>

### 2. Start the frontend

In a second terminal, from the project root:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

## Run on Windows (PowerShell)

Open PowerShell in the extracted `LUNA-SAFE-2` folder.

### 1. Configure and start the backend

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
cd ..
Copy-Item .env.example .env
notepad .env
```

Add your NASA key to `.env`, save, then start the backend:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell blocks activation, run this once in the current terminal and activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### 2. Start the frontend in a second PowerShell window

```powershell
cd path\to\LUNA-SAFE-2\frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

## NASA API key and data policy

1. Request a free key from <https://api.nasa.gov/>.
2. Store it only in the project-root `.env` as `NASA_API_KEY=your_actual_key`.
3. Restart the FastAPI process after changing `.env`.
4. Open **NASA Data Centre** and refresh the connection.

The API key is added only by the backend to outgoing NASA requests. The frontend receives connection state and APOD content, never the key. The backend does not log the key.

### Integrated and non-integrated sources

- **Integrated:** NASA APOD Basic at `https://science.nasa.gov/wp-json/wp/v2/apod-basic`. NASA announced the migration from the legacy `/planetary/apod` service and a planned legacy endpoint retirement on December 1, 2026. APOD content can be unrelated to the Moon; the UI labels that limitation and does not use APOD as terrain input.
- **Integrated:** NASA Image and Video Library search at `https://images-api.nasa.gov/search`, used for Moon/lunar image discovery and thumbnail display. Images are archive media and are not assumed to be georeferenced or used as DEM input.
- **Integrated:** NASA DONKI notifications at `https://api.nasa.gov/DONKI/notifications`, with a default seven-calendar-day date range (maximum 30 days). Notifications provide space-weather awareness that could inform radiation, communications and operations planning; they are not surface topography and are deliberately excluded from local terrain risk and A* calculations.
- **Archive import path:** CSV elevation grid upload is implemented. NASA LOLA, LROC and PDS archive products are not fetched automatically. Retrieve a compatible DEM from the source archive, review its product documentation, and convert it to numeric CSV while preserving pixel spacing and vertical unit. CSV does not preserve geospatial reference metadata, so the application does not show latitude/longitude for this import format.
- **Not bundled:** no NASA imagery, LOLA elevation tiles or other restricted/licensed data files are redistributed with this ZIP.

## Main API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Backend health |
| GET | `/api/terrain` | Current terrain and analysis grids |
| POST | `/api/terrain/generate` | Generate deterministic synthetic terrain |
| POST | `/api/terrain/upload` | Import numeric CSV elevation grid |
| POST | `/api/terrain/analyze` | Re-run terrain analysis with parameters |
| POST | `/api/hazards/detect` | Return rule-based hazard candidates |
| POST | `/api/navigation/plan` | Calculate one weighted A* route |
| POST | `/api/navigation/compare` | Compare all four route modes |
| POST | `/api/simulation/start` | Start virtual rover simulation |
| POST | `/api/simulation/obstacle` | Add obstacle and re-plan route |
| GET | `/api/nasa/status` | Test NASA APOD/API connection |
| GET | `/api/nasa/apod` | Retrieve NASA APOD Basic, optionally `?date=YYYY-MM-DD` |
| GET | `/api/nasa/lunar-imagery` | Search NASA Image and Video Library, e.g. `?q=Moon%20lunar%20surface&page_size=8` |
| GET | `/api/nasa/donki` | Retrieve recent NASA DONKI notifications; optional `start_date` and `end_date` (maximum 30 days) |
| POST | `/api/nasa/cache/clear` | Clear process-local NASA cache |
| GET | `/api/mission/report?format=json\|csv\|pdf` | Export mission report |

FastAPI's `/docs` page contains request schemas and interactive endpoint testing.

## Algorithms and assumptions

### Terrain analysis

The backend computes elevation gradients with `numpy.gradient`, taking horizontal pixel spacing and vertical scale into account. Slope is calculated as the arctangent of gradient magnitude and expressed in degrees. Local roughness is absolute deviation from a Gaussian-smoothed neighbourhood. A combined 0–1 risk value combines slope, roughness and local relief.

Default blocked thresholds are a slope of 35° and a roughness value of 0.22 in the current input units. These values exist for a controllable demo and are **not** universal lunar rover limits. Adjust them in Terrain Intelligence / Settings or through the API.

### A* route costs

The grid uses eight-connected movement. Diagonal movement costs √2 times the cell penalty and is rejected when either adjacent orthogonal cell is blocked, preventing corner cutting. All additional penalties are non-negative, so octile distance remains a lower-bound heuristic. The four model weights are illustrative:

- Shortest: geometric distance only.
- Safest: stronger risk and slope penalties.
- Energy-aware: a distinct risk/slope weighting, alongside the relative energy estimate.
- Balanced: combined risk and slope penalties.

The displayed result is the lowest-cost route under that mode's model, not a universal physical optimum.

### Energy model

Relative energy = route distance × configurable base factor × multipliers for mean slope, mean risk and their interaction. Results are reported as relative units. No actual rover mass, motor efficiency, wheel slip, thermal state, battery model or validated power telemetry is assumed.

## Automated tests

From the project root, with backend dependencies installed:

```bash
# macOS / Linux
source backend/.venv/bin/activate
python -m pytest -q
```

```powershell
# Windows PowerShell
.\backend\.venv\Scripts\Activate.ps1
python -m pytest -q
```

The tests cover repeatable synthetic generation, terrain-analysis validation, pixel spacing, A* reachability, blocked cells, diagonal corner rules, route comparison, API health/terrain/CSV validation and CSV/PDF report output.

## Frontend production build

```bash
cd frontend
npm install
npm run build
```

The generated production assets are written to `frontend/dist/`. The development server is used for the standard local demo.

## Hackathon demonstration flow (3–5 minutes)

1. Start the backend and frontend. Open the Mission Dashboard and explain the green/yellow/orange/red/black grid as an estimated synthetic risk layer.
2. Open Lunar Surface Explorer. Set a different rover origin and destination by selecting **SET ORIGIN** or **SET DESTINATION**, then clicking a traversable cell. Show the matching 3D surface.
3. Open Terrain Intelligence. Adjust the slope or roughness threshold and apply the analysis; explain how the risk and blocked-cell map responds.
4. Open Hazard Detection. Show the candidate feature categories and explain the transparent elevation-based rules and need for validation.
5. Open Rover Navigation. Compare shortest, safest, energy-aware and balanced strategies. Explain route distance, risk, slope and relative energy.
6. Open Mission Simulation and start the virtual rover. Inject an obstacle ahead; the server updates the blocked grid and runs A* again. Point out that this is a simulation only.
7. Open NASA Data Centre. Refresh APOD, show the NASA attribution, API status and the explicit warning that APOD is not a lunar DEM.
8. Export the PDF or CSV mission report from Reports & Analytics.

## Troubleshooting

- **Frontend shows a blank page or API errors:** confirm the backend is running at `http://127.0.0.1:8000`, then open `/api/health`. Keep the terminal windows open.
- **CORS error:** use `http://localhost:5173` as the frontend URL. Add any different frontend origin to `CORS_ORIGINS` in `.env`, then restart FastAPI.
- **NASA API offline / 403:** check the spelling of `NASA_API_KEY`, save `.env` in the project root, restart FastAPI, and refresh NASA Data Centre. Terrain generation and route planning continue to work without NASA.
- **NASA 429 rate limit:** wait before retrying or use a personal key. The backend caches APOD responses for 15 minutes per process.
- **`python-multipart` error:** activate the backend virtual environment and run `pip install -r backend/requirements.txt` from the project root (or `pip install -r requirements.txt` inside `backend`).
- **PDF export unavailable:** make sure `reportlab` installed successfully using `pip install -r requirements.txt`.
- **npm command not found:** install Node.js 20+ and reopen the terminal.
- **Port already in use:** stop the other service using port 8000 or 5173, or update the configured port and API base URL consistently.
- **CSV import fails:** use a plain numeric comma-separated matrix with no header row, at least 3×3 and at most 512×512. Non-finite values are rejected.
- **No route found:** choose traversable start/destination cells, or generate another terrain seed. A* returns a clear no-route error when blocked cells divide the grid.

## Known limitations / future improvements

- No automatic LOLA/PDS/LROC download or GeoTIFF importer in this version; CSV import has no coordinate reference system.
- NASA DONKI notifications are displayed as mission context but are not integrated into local terrain risk scoring.
- The synthetic generator is useful for algorithm testing but does not reproduce real lunar geology, lighting, photometric effects or sensor uncertainty.
- Hazard candidates are rules-based and need labelled lunar datasets and validation before claims of AI object-detection accuracy.
- The in-memory API state is shared by all local browser sessions and resets when the backend restarts.
- Simulation progress is a browser-side virtual animation; route/obstacle calculations are performed by the backend. It is not rover teleoperation.
- Production deployment would require persistence, per-user mission isolation, authentication, upload malware/content controls, request quotas, structured observability and deployment hardening.

Potential next steps include a geospatially aware GeoTIFF/COG importer, NASA LOLA/PDS metadata catalogue, image co-registration, labelled lunar hazard model evaluation, route uncertainty and Monte Carlo trials, realistic rover power calibration, multi-user storage and mission replay.

## License

This project source is distributed under the MIT License. Third-party NASA data retains the terms and attribution of its original source; consult the relevant product documentation before reuse.
