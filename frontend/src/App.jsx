import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BatteryCharging, ChevronDown,
  CircleDot, Compass, Cpu, Database, Download, Gauge, Globe2, Layers3, Map, Menu,
  Moon, Mountain, Orbit, Play, Radio, RefreshCw, Route, Satellite, Settings, ShieldCheck,
  SlidersHorizontal, Square, Target, TriangleAlert, Waypoints, X,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorMessage } from './services/api';
import MetricCard from './components/MetricCard';
import TerrainMap from './components/TerrainMap';
import Terrain3D from './components/Terrain3D';

const NAV = [
  { id: 'dashboard', label: 'Mission Dashboard', icon: Gauge },
  { id: 'surface', label: 'Lunar Surface Explorer', icon: Map },
  { id: 'terrain', label: 'Terrain Intelligence', icon: Mountain },
  { id: 'hazards', label: 'Hazard Detection', icon: TriangleAlert },
  { id: 'navigation', label: 'Rover Navigation', icon: Route },
  { id: 'simulation', label: 'Mission Simulation', icon: Orbit },
  { id: 'nasa', label: 'NASA Data Centre', icon: Satellite },
  { id: 'reports', label: 'Reports & Analytics', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function findNearestFree(blocked, point) {
  const rows = blocked.length, cols = blocked[0].length;
  const [r0, c0] = point;
  if (!blocked[r0]?.[c0]) return point;
  for (let radius = 1; radius < Math.max(rows, cols); radius++) {
    for (let r = Math.max(0, r0 - radius); r <= Math.min(rows - 1, r0 + radius); r++) {
      for (let c = Math.max(0, c0 - radius); c <= Math.min(cols - 1, c0 + radius); c++) {
        if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) === radius && !blocked[r][c]) return [r, c];
      }
    }
  }
  return [0, 0];
}

function SectionHeading({ eyebrow, title, detail, action }) {
  return <div className="section-heading"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>;
}

function Panel({ title, subtitle, action, children, className = '' }) {
  return <section className={`panel ${className}`}><div className="panel-head"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

function Tag({ children, tone = 'blue' }) { return <span className={`tag ${tone}`}>{children}</span>; }

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [terrain, setTerrain] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [route, setRoute] = useState(null);
  const [mode, setMode] = useState('balanced');
  const [start, setStart] = useState([5, 5]);
  const [goal, setGoal] = useState([66, 66]);
  const [selectionMode, setSelectionMode] = useState('start');
  const [hazards, setHazards] = useState([]);
  const [nasaStatus, setNasaStatus] = useState(null);
  const [apod, setApod] = useState(null);
  const [donki, setDonki] = useState(null);
  const [lunarImages, setLunarImages] = useState(null);
  const [imageQuery, setImageQuery] = useState("Moon lunar surface");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [seed, setSeed] = useState(17);
  const [terrainSize, setTerrainSize] = useState(72);
  const [slopeThreshold, setSlopeThreshold] = useState(35);
  const [roughnessThreshold, setRoughnessThreshold] = useState(0.22);
  const [uploadSpacing, setUploadSpacing] = useState(1.0);
  const [uploadVerticalScale, setUploadVerticalScale] = useState(1.0);
  const [roverConfig, setRoverConfig] = useState({ base_wh_per_cell: 0.8, slope_factor: 2.2, roughness_factor: 1.4, obstacle_factor: 0.6 });
  const [simulation, setSimulation] = useState(null);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const selectedMetrics = route?.metrics || {};
  const chartData = useMemo(() => routes.map((item) => ({
    strategy: item.mode[0].toUpperCase() + item.mode.slice(1),
    distance: item.metrics.distance_cells ?? 0,
    risk: item.metrics.mean_risk == null ? 0 : +(item.metrics.mean_risk * 100).toFixed(1),
    energy: item.metrics.energy ?? 0,
    safety: item.metrics.safety_score ?? 0,
  })), [routes]);

  const refreshHazards = useCallback(async () => {
    try { const { data } = await api.post('/hazards/detect'); setHazards(data.hazards || []); }
    catch (e) { setError(errorMessage(e)); }
  }, []);

  const calculateRoutes = useCallback(async (terrainData, from = start, to = goal, preferredMode = mode, rover = roverConfig) => {
    if (!terrainData) return;
    setBusy(true);
    try {
      const { data } = await api.post('/navigation/compare', { start: from, goal: to, mode: preferredMode, rover });
      setRoutes(data.routes || []);
      const chosen = data.routes.find((item) => item.mode === preferredMode && item.metrics.available) || data.selected;
      setRoute(chosen || null);
      setMode(chosen?.mode || preferredMode);
    } catch (e) {
      setRoutes([]); setRoute(null); setError(errorMessage(e));
    } finally { setBusy(false); }
  }, [start, goal, mode, roverConfig]);

  const applyTerrain = useCallback(async (data, resetPoints = false) => {
    setTerrain(data);
    setTerrainSize(data.rows || 72);
    if (resetPoints || !terrain) {
      const n = data.rows;
      const newStart = findNearestFree(data.blocked, [Math.min(5, n - 1), Math.min(5, n - 1)]);
      const newGoal = findNearestFree(data.blocked, [n - 6, n - 6]);
      setStart(newStart); setGoal(newGoal);
      await calculateRoutes(data, newStart, newGoal, mode);
    } else {
      await calculateRoutes(data, start, goal, mode);
    }
    await refreshHazards();
  }, [terrain, calculateRoutes, start, goal, mode, refreshHazards]);

  const loadInitial = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/terrain');
      await applyTerrain(data, true);
      api.get('/nasa/status').then((r) => setNasaStatus(r.data)).catch(() => setNasaStatus({ connected: false, message: 'NASA endpoint is unreachable from the backend.' }));
      api.get('/nasa/apod').then((r) => setApod(r.data)).catch(() => {});
      api.get('/nasa/donki').then((r) => setDonki(r.data)).catch(() => {});
      api.get('/nasa/lunar-imagery').then((r) => setLunarImages(r.data)).catch(() => {});
    } catch (e) { setError(`${errorMessage(e)} Make sure the FastAPI backend is running on port 8000.`); }
    finally { setLoading(false); }
  }, [applyTerrain]);

  useEffect(() => { loadInitial(); }, []); // initial boot only
  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (!simulationRunning || !simulation?.route?.length) return undefined;
    const lastIndex = simulation.route.length - 1;
    const id = setInterval(() => setProgress((value) => Math.min(value + 1, lastIndex)), 420);
    return () => clearInterval(id);
  }, [simulationRunning, simulation]);

  useEffect(() => {
    if (simulationRunning && simulation?.route?.length && progress >= simulation.route.length - 1) {
      setSimulationRunning(false);
    }
  }, [progress, simulation, simulationRunning]);

  const refreshNasa = async () => {
    setBusy(true);
    try {
      const results = await Promise.allSettled([api.get('/nasa/status'), api.get('/nasa/apod'), api.get('/nasa/donki'), api.get('/nasa/lunar-imagery', { params: { q: imageQuery } })]);
      if (results[0].status === 'fulfilled') setNasaStatus(results[0].value.data);
      else setNasaStatus({ connected: false, message: errorMessage(results[0].reason) });
      if (results[1].status === 'fulfilled') setApod(results[1].value.data);
      if (results[2].status === 'fulfilled') setDonki(results[2].value.data);
      if (results[3].status === 'fulfilled') setLunarImages(results[3].value.data);
      setNotice('NASA data refresh completed. Check each feed status below.');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const searchLunarImages = async () => {
    setBusy(true);
    try {
      const { data } = await api.get('/nasa/lunar-imagery', { params: { q: imageQuery, page_size: 8 } });
      setLunarImages(data);
      setNotice(`NASA archive search returned ${data.count} image result(s).`);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const generateTerrain = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/terrain/generate', { size: terrainSize, seed: Number(seed) });
      setSimulation(null); setProgress(0); setSimulationRunning(false);
      await applyTerrain(data, true); setNotice('New deterministic synthetic terrain generated.');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const applyThresholds = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/terrain/analyze', { pixel_spacing: 1, vertical_scale: 1, slope_block_deg: Number(slopeThreshold), roughness_block: Number(roughnessThreshold) });
      await applyTerrain(data, false); setNotice('Terrain analysis parameters updated.');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const uploadDem = async (file) => {
    if (!file) return;
    const form = new FormData(); form.append('file', file);
    setBusy(true);
    try { const { data } = await api.post('/terrain/upload', form, { params: { pixel_spacing: uploadSpacing, vertical_scale: uploadVerticalScale }, headers: { 'Content-Type': 'multipart/form-data' } }); await applyTerrain(data, true); setNotice('CSV elevation grid imported.'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const onMapSelect = async (r, c) => {
    if (terrain?.blocked?.[r]?.[c]) { setNotice('That cell is blocked. Choose a traversable cell.'); return; }
    const nextStart = selectionMode === 'start' ? [r, c] : start;
    const nextGoal = selectionMode === 'goal' ? [r, c] : goal;
    setStart(nextStart); setGoal(nextGoal);
    await calculateRoutes(terrain, nextStart, nextGoal, mode);
  };

  const changeMode = (value) => {
    setMode(value);
    const selected = routes.find((item) => item.mode === value);
    if (selected) setRoute(selected);
    else calculateRoutes(terrain, start, goal, value);
  };

  const startSim = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/simulation/start', { start, goal, mode });
      setSimulation(data); setProgress(0); setSimulationRunning(true); setNotice('Mission simulation started. Rover is following the calculated route.');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const addObstacle = async () => {
    if (!simulation?.route?.length) return;
    const targetIndex = Math.min(Math.max(progress + 4, 2), simulation.route.length - 2);
    const cell = simulation.route[targetIndex];
    if (!cell) { setNotice('No route segment ahead for obstacle injection.'); return; }
    setBusy(true); setSimulationRunning(false);
    try {
      const { data } = await api.post('/simulation/obstacle', { row: cell[0], col: cell[1] });
      setSimulation(data); setProgress(0); setSimulationRunning(true);
      const { data: fresh } = await api.get('/terrain'); setTerrain(fresh);
      setNotice(data.rerouted ? 'New obstacle detected. A* calculated an alternate route.' : 'Obstacle inserted; current route remains valid.');
      await refreshHazards();
      await calculateRoutes(fresh, start, goal, mode);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const resetSim = () => { setSimulationRunning(false); setSimulation(null); setProgress(0); };

  const downloadReport = async (format) => {
    setBusy(true);
    try {
      const { data } = await api.get(`/mission/report?format=${format}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = `luna-safe-mission-report.${format}`; a.click(); URL.revokeObjectURL(url);
      setNotice(`${format.toUpperCase()} report exported.`);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const currentRover = simulation?.route?.[progress] || simulation?.route?.[0] || start;
  const routeForView = simulation?.route?.length && page === 'simulation' ? simulation.route : route?.route || [];
  const navName = NAV.find((item) => item.id === page)?.label || 'Mission Dashboard';

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Moon size={21} /></div><div><strong>LUNA<span>-SAFE</span></strong><small>MISSION SYSTEMS / 02</small></div><button className="mobile-close" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="mission-switch"><div className="mission-icon"><Orbit size={16} /></div><div><span>ACTIVE MISSION</span><strong>ARTEMIS · DEMO 01</strong></div><ChevronDown size={14} /></div>
        <div className="nav-caption">MISSION OPERATIONS</div>
        <nav className="side-nav">
          {NAV.map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? 'active' : ''} onClick={() => { setPage(id); setSidebarOpen(false); }}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === 'hazards' && hazards.length > 0 && <i className="nav-count">{hazards.length}</i>}</button>)}
        </nav>
        <div className="sidebar-bottom"><div className="system-live"><span className="pulse-dot" />SYSTEM NOMINAL</div><div className="sidebar-version"><span>BUILD 2.0.0</span><span>EARTH UTC +00:00</span></div></div>
      </aside>

      <main className="main-shell">
        <header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button><div className="breadcrumb">MISSION CONTROL <span>/</span> {navName.toUpperCase()}</div></div><div className="topbar-right"><div className="data-status"><span className={`status-dot ${nasaStatus?.connected ? 'good' : 'warn'}`} />NASA LINK <b>{nasaStatus?.connected ? 'ONLINE' : 'STANDBY'}</b></div><div className="divider-v" /><div className="user-chip"><div className="avatar">LS</div><div><strong>FLIGHT OPS</strong><small>SIMULATION MODE</small></div></div></div></header>
        {error && <div className="alert error-alert"><AlertTriangle size={16} /><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
        {notice && <div className="alert notice-alert"><ShieldCheck size={16} /><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}

        {loading ? <div className="loading-screen"><div className="loader-orbit"><Moon size={28} /></div><strong>INITIALISING MISSION ENVIRONMENT</strong><span>Loading terrain intelligence and route services…</span></div> : <>
          {page === 'dashboard' && <>
            <SectionHeading eyebrow="MISSION OVERVIEW / 001" title="Mission Dashboard" detail="Lunar terrain intelligence and autonomous rover navigation at a glance." action={<div className="heading-actions"><Tag tone="green">SIMULATION ACTIVE</Tag><button className="btn-secondary" onClick={loadInitial}><RefreshCw size={14} /> Refresh</button></div>} />
            <div className="metrics-grid">
              <MetricCard label="TERRAIN RISK INDEX" value={terrain ? Math.round(terrain.analysis.mean_risk * 100) : '—'} unit="/ 100" note="Grid-wide estimated risk" icon={Activity} tone="orange" />
              <MetricCard label="ROUTE DISTANCE" value={selectedMetrics.distance_cells ?? '—'} unit="cells" note={`${selectedMetrics.waypoints ?? 0} calculated waypoints`} icon={Route} tone="blue" />
              <MetricCard label="RELATIVE ENERGY" value={selectedMetrics.energy ?? '—'} unit="units" note="Modelled estimate · not Wh" icon={BatteryCharging} tone="purple" />
              <MetricCard label="DETECTED HAZARDS" value={hazards.length} unit="items" note={`${terrain?.analysis?.blocked_cells ?? 0} blocked cells`} icon={AlertTriangle} tone="red" />
            </div>
            <div className="dashboard-grid">
              <Panel title="SURFACE INTELLIGENCE MAP" subtitle="Synthetic elevation-derived risk grid · top-down view" className="map-panel" action={<Tag tone="amber">SYNTHETIC DATA</Tag>}>
                <div className="map-toolbar"><div className="map-legend"><span><i className="legend-dot low" />LOW</span><span><i className="legend-dot medium" />MODERATE</span><span><i className="legend-dot high" />ELEVATED</span><span><i className="legend-dot block" />BLOCKED</span></div><button className="text-button" onClick={() => setPage('surface')}>EXPLORE SURFACE <ArrowUpRight size={13} /></button></div>
                <TerrainMap terrain={terrain} route={routeForView} start={start} goal={goal} />
                <div className="map-foot"><span><CircleDot size={13} /> ROVER ORIGIN <b>{start.join(', ')}</b></span><span><Target size={13} /> TARGET <b>{goal.join(', ')}</b></span><span><Waypoints size={13} /> ACTIVE STRATEGY <b>{mode.toUpperCase()}</b></span></div>
              </Panel>
              <div className="right-stack">
                <Panel title="ROUTE SAFETY" subtitle="Selected route assessment" className="safety-panel">
                  <div className="safety-score"><div className="score-ring" style={{ '--score': `${selectedMetrics.safety_score ?? 0}%` }}><strong>{selectedMetrics.safety_score ?? '—'}</strong><small>SAFETY</small></div><div className="score-copy"><Tag tone="green">{(selectedMetrics.safety_score ?? 0) > 70 ? 'LOWER RISK ROUTE' : 'MODEL ASSESSMENT'}</Tag><p>Risk-weighted path evaluation based on current grid.</p></div></div>
                  <div className="mini-stats"><div><span>MEAN SLOPE</span><b>{selectedMetrics.mean_slope_deg ?? '—'}°</b></div><div><span>MEAN RISK</span><b>{selectedMetrics.mean_risk != null ? `${Math.round(selectedMetrics.mean_risk * 100)}%` : '—'}</b></div></div>
                </Panel>
                <Panel title="NASA DATA LINK" subtitle="External data connection">
                  <div className="nasa-card"><div className="nasa-symbol"><Satellite size={21} /></div><div><strong>{nasaStatus?.connected ? 'NASA API CONNECTED' : 'NASA API UNAVAILABLE'}</strong><p>{nasaStatus?.message || 'Checking NASA public data services…'}</p></div></div>
                  <button className="btn-secondary full-btn" onClick={refreshNasa} disabled={busy}><RefreshCw size={13} /> CHECK CONNECTION</button>
                </Panel>
                <Panel title="MISSION EVENT LOG" subtitle="Latest system activity">
                  <div className="event-list"><div><i className="event-dot green" /><span><b>Terrain model loaded</b><small>{terrain?.rows} × {terrain?.cols} synthetic grid initialised</small></span></div><div><i className="event-dot blue" /><span><b>Route engine ready</b><small>{routes.length} navigation strategies evaluated</small></span></div><div><i className="event-dot orange" /><span><b>Hazard analysis complete</b><small>{hazards.length} potential features reported</small></span></div></div>
                </Panel>
              </div>
            </div>
            <div className="lower-grid"><Panel title="ROUTE STRATEGY SNAPSHOT" subtitle="Calculated from the current terrain grid"><div className="route-mini-grid">{routes.map((item) => <button key={item.mode} className={`route-mini ${mode === item.mode ? 'selected' : ''}`} onClick={() => changeMode(item.mode)}><span>{item.mode.toUpperCase()}</span><strong>{item.metrics.distance_cells ?? '—'} <small>cells</small></strong><em>{item.metrics.safety_score ?? '—'}% safety</em></button>)}</div></Panel><Panel title="LATEST SPACE IMAGERY" subtitle="NASA APOD · general astronomy content" action={<button className="text-button" onClick={() => setPage('nasa')}>VIEW DATA <ArrowUpRight size={13} /></button>}>{apod ? <div className="apod-mini">{apod.media_type === 'image' && <img src={apod.url} alt={apod.title} />}<div><strong>{apod.title}</strong><small>{apod.date} · NASA APOD</small></div></div> : <div className="muted-block">NASA imagery has not been retrieved. Open NASA Data Centre to retry.</div>}</Panel></div>
          </>}

          {page === 'surface' && <>
            <SectionHeading eyebrow="PLANETARY CARTOGRAPHY / 002" title="Lunar Surface Explorer" detail="Inspect the demonstration terrain, set rover endpoints, and compare its 2D risk map with a 3D height surface." action={<Tag tone="amber">SYNTHETIC TERRAIN</Tag>} />
            <div className="surface-layout"><Panel title="INTERACTIVE TERRAIN GRID" subtitle="Select a mode, then click a traversable grid cell to set that point" action={<div className="segmented"><button className={selectionMode === 'start' ? 'chosen' : ''} onClick={() => setSelectionMode('start')}>SET ORIGIN</button><button className={selectionMode === 'goal' ? 'chosen' : ''} onClick={() => setSelectionMode('goal')}>SET DESTINATION</button></div>}><div className="map-toolbar"><div className="map-legend"><span><i className="legend-dot low" />LOW RISK</span><span><i className="legend-dot medium" />MODERATE</span><span><i className="legend-dot high" />HIGH</span><span><i className="legend-dot block" />BLOCKED</span></div><span className="micro-label">CLICK TO PLACE {selectionMode.toUpperCase()}</span></div><TerrainMap terrain={terrain} route={routeForView} start={start} goal={goal} onSelectCell={onMapSelect} /></Panel><Panel title="LOCATION & LAYERS" subtitle="Current coordinate selection"><div className="coordinate-card"><div><span>ROVER START</span><strong>{start[0]} <small>ROW</small> / {start[1]} <small>COL</small></strong></div><div className="coord-symbol"><CircleDot size={18} /></div></div><div className="coordinate-card destination"><div><span>MISSION DESTINATION</span><strong>{goal[0]} <small>ROW</small> / {goal[1]} <small>COL</small></strong></div><div className="coord-symbol"><Target size={18} /></div></div><div className="layer-list"><div><Layers3 size={15} /><span>Risk overlay</span><Tag tone="green">ACTIVE</Tag></div><div><Mountain size={15} /><span>Elevation surface</span><Tag tone="green">ACTIVE</Tag></div><div><TriangleAlert size={15} /><span>Blocked cells</span><Tag tone="green">ACTIVE</Tag></div><div><Route size={15} /><span>Selected route</span><Tag tone="green">ACTIVE</Tag></div></div><button className="btn-primary full-btn" onClick={() => calculateRoutes(terrain, start, goal, mode)} disabled={busy}><Route size={15} /> RECALCULATE ROUTES</button></Panel></div>
            <Panel title="THREE-DIMENSIONAL TERRAIN MODEL" subtitle="Height surface built from the same backend grid; rotate and zoom to inspect relief" action={<Tag tone="blue">3D VIEW</Tag>}><Terrain3D terrain={terrain} route={routeForView} start={start} goal={goal} /><div className="disclaimer-line">Vertical relief is exaggerated for legibility. Colours encode estimated terrain risk; this is not a georeferenced lunar DEM.</div></Panel>
          </>}

          {page === 'terrain' && <>
            <SectionHeading eyebrow="GEOMORPHOLOGY / 003" title="Terrain Intelligence" detail="Slope, local roughness and neighbourhood relief are combined into a transparent traversability estimate." action={<Tag tone="amber">RULE-BASED ANALYSIS</Tag>} />
            <div className="metrics-grid three"><MetricCard label="MEAN SLOPE" value={terrain?.analysis.mean_slope_deg} unit="°" note="Across all grid cells" icon={Mountain} tone="orange" /><MetricCard label="MAXIMUM SLOPE" value={terrain?.analysis.max_slope_deg} unit="°" note="Steepest estimated cell" icon={ArrowUpRight} tone="red" /><MetricCard label="BLOCKED CELLS" value={terrain?.analysis.blocked_cells} unit="cells" note="Based on current thresholds" icon={Square} tone="purple" /></div>
            <div className="dashboard-grid"><Panel title="3D ELEVATION & RISK" subtitle="Shared elevation grid and analysis overlay" className="map-panel"><Terrain3D terrain={terrain} route={routeForView} start={start} goal={goal} /></Panel><Panel title="ANALYSIS PARAMETERS" subtitle="Adjust demo assumptions and rerun the pipeline"><div className="setting-field"><div><label>Slope blocked threshold</label><b>{slopeThreshold}°</b></div><input type="range" min="10" max="60" value={slopeThreshold} onChange={(e) => setSlopeThreshold(e.target.value)} /></div><div className="setting-field"><div><label>Roughness threshold</label><b>{Number(roughnessThreshold).toFixed(2)}</b></div><input type="range" min="0.05" max="0.5" step="0.01" value={roughnessThreshold} onChange={(e) => setRoughnessThreshold(e.target.value)} /></div><div className="assumption-note"><AlertTriangle size={15} /><span>Thresholds are configurable demonstration assumptions, not validated lunar rover safety standards.</span></div><button className="btn-primary full-btn" onClick={applyThresholds} disabled={busy}><SlidersHorizontal size={15} /> APPLY ANALYSIS</button></Panel></div>
            <Panel title="TERRAIN ANALYSIS OUTPUT" subtitle="Backend-derived grid diagnostics"><div className="analysis-grid"><div><span>MEAN RISK</span><strong>{Math.round((terrain?.analysis.mean_risk || 0) * 100)}%</strong><div className="meter"><i style={{ width: `${(terrain?.analysis.mean_risk || 0) * 100}%` }} /></div></div><div><span>HAZARD CANDIDATES</span><strong>{hazards.length}</strong><p>Rule-based feature reports</p></div><div><span>GRID RESOLUTION</span><strong>{terrain?.rows} × {terrain?.cols}</strong><p>Cells · not geographic pixels</p></div><div><span>INPUT DATA</span><strong>{terrain?.is_synthetic ? 'SYNTHETIC' : 'IMPORTED'}</strong><p>{terrain?.data_source}</p></div></div></Panel>
          </>}

          {page === 'hazards' && <>
            <SectionHeading eyebrow="RISK INTELLIGENCE / 004" title="Hazard Detection" detail="Potentially unsafe cells surfaced from slope, local roughness and local elevation relief." action={<button className="btn-secondary" onClick={refreshHazards}><RefreshCw size={14} /> Run detection</button>} />
            <div className="dashboard-grid"><Panel title="HAZARD DISTRIBUTION MAP" subtitle="Hazard severity is encoded by the terrain risk layer" className="map-panel"><TerrainMap terrain={terrain} route={routeForView} start={start} goal={goal} /></Panel><Panel title="DETECTION METHOD" subtitle="Explainable, rule-based model"><div className="detection-method"><div><Mountain size={18} /><span><b>Steep slope</b><small>Gradient magnitude converted to degrees</small></span></div><div><Layers3 size={18} /><span><b>Rough terrain</b><small>Elevation deviation from smoothed local mean</small></span></div><div><CircleDot size={18} /><span><b>Boulder-like feature</b><small>Local peak with pronounced neighbourhood relief</small></span></div><div className="assumption-note"><AlertTriangle size={15} /><span>Not a trained lunar object detector. Candidate locations require imagery review and validation.</span></div></div></Panel></div>
            <Panel title="DETECTED FEATURES" subtitle={`${hazards.length} candidate features reported · locations are row/column grid indices`}><div className="table-scroll"><table className="data-table"><thead><tr><th>FEATURE</th><th>GRID LOCATION</th><th>SEVERITY</th><th>RISK</th><th>REASON</th></tr></thead><tbody>{hazards.slice(0, 60).map((h, i) => <tr key={`${h.row}-${h.col}-${i}`}><td><b>{h.type}</b></td><td className="mono">{h.row}, {h.col}</td><td><Tag tone={h.severity === 'high' ? 'red' : h.severity === 'elevated' ? 'amber' : 'blue'}>{h.severity.toUpperCase()}</Tag></td><td>{Math.round(h.risk * 100)}%</td><td className="explanation-cell">{h.explanation}</td></tr>)}</tbody></table>{hazards.length === 0 && <div className="muted-block">No hazard candidates found for current terrain thresholds.</div>}</div></Panel>
          </>}

          {page === 'navigation' && <>
            <SectionHeading eyebrow="PATH OPTIMISATION / 005" title="Rover Navigation" detail="Compare distance, terrain exposure and relative energy under four explainable cost models." action={<Tag tone="green">A* PATHFINDING</Tag>} />
            <div className="navigation-toolbar"><div><span>ORIGIN</span><b>{start.join(', ')}</b></div><ArrowDownRight size={17} /><div><span>DESTINATION</span><b>{goal.join(', ')}</b></div><button className="btn-primary" onClick={() => calculateRoutes(terrain, start, goal, mode)} disabled={busy}><RefreshCw size={14} /> COMPARE ROUTES</button></div>
            <div className="mode-grid">{routes.map((item) => <button key={item.mode} className={`mode-card ${mode === item.mode ? 'chosen' : ''}`} onClick={() => changeMode(item.mode)}><div><span>{item.mode.replace('-', ' ').toUpperCase()}</span>{mode === item.mode && <Tag tone="green">SELECTED</Tag>}</div><strong>{item.metrics.distance_cells ?? 'N/A'} <small>cells</small></strong><p>Safety {item.metrics.safety_score ?? '—'}% <span>·</span> Energy {item.metrics.energy ?? '—'}</p></button>)}</div>
            <div className="dashboard-grid"><Panel title="ROUTE COMPARISON" subtitle="Backend-calculated path metrics"><div className="table-scroll"><table className="data-table"><thead><tr><th>STRATEGY</th><th>DISTANCE</th><th>MEAN RISK</th><th>MEAN SLOPE</th><th>ENERGY</th><th>WAYPOINTS</th><th>SAFETY</th></tr></thead><tbody>{routes.map((item) => <tr key={item.mode} className={item.mode === mode ? 'row-selected' : ''}><td><b>{item.mode.toUpperCase()}</b></td><td>{item.metrics.distance_cells ?? '—'}</td><td>{item.metrics.mean_risk != null ? `${Math.round(item.metrics.mean_risk * 100)}%` : '—'}</td><td>{item.metrics.mean_slope_deg ?? '—'}°</td><td>{item.metrics.energy ?? '—'}</td><td>{item.metrics.waypoints ?? '—'}</td><td>{item.metrics.safety_score ?? '—'}%</td></tr>)}</tbody></table></div><div className="disclaimer-line">Route weights: shortest = distance only; safest = stronger risk and slope penalties; energy-aware = configurable model factors; balanced = combined risk and slope penalties. The result is lowest-cost under this model, not a universal optimum.</div></Panel><Panel title="ROUTE PROFILE" subtitle="Distance, risk and relative energy"><ResponsiveContainer width="100%" height={255}><BarChart data={chartData} margin={{ top: 10, right: 4, left: -22, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="#22323e" /><XAxis dataKey="strategy" tick={{ fill: '#8295a4', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#8295a4', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#101b25', border: '1px solid #2b414f', borderRadius: 8, color: '#e5edf2' }} /><Legend wrapperStyle={{ fontSize: 10, color: '#8295a4' }} /><Bar dataKey="distance" name="Distance" fill="#5eacc0" radius={[3, 3, 0, 0]} /><Bar dataKey="energy" name="Energy units" fill="#ba9a61" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></Panel></div>
            <Panel title="SELECTED ROUTE ON TERRAIN" subtitle={`${mode.toUpperCase()} · ${selectedMetrics.waypoints ?? 0} route waypoints`}><TerrainMap terrain={terrain} route={route?.route || []} start={start} goal={goal} /></Panel>
          </>}

          {page === 'simulation' && <>
            <SectionHeading eyebrow="AUTONOMOUS OPERATIONS / 006" title="Mission Simulation" detail="Run a virtual rover along a planned route, inject a new obstacle, and observe automatic route re-planning." action={<Tag tone="amber">VIRTUAL ROVER · NO HARDWARE CONTROL</Tag>} />
            <div className="simulation-toolbar"><div className="sim-state"><span className={`status-dot ${simulationRunning ? 'good' : 'warn'}`} /><div><strong>{simulationRunning ? 'ROVER IN MOTION' : simulation?.active ? 'SIMULATION PAUSED / READY' : 'SIMULATION STANDBY'}</strong><small>{simulation ? `${simulation.reroutes || 0} automatic reroutes · ${simulation.obstacle_events || 0} obstacles injected` : 'Awaiting mission initialisation'}</small></div></div><div className="sim-controls"><button className="btn-secondary" onClick={startSim} disabled={busy}><Play size={14} /> START / RESTART</button><button className="btn-secondary" onClick={() => setSimulationRunning(false)} disabled={!simulationRunning}><Square size={13} /> PAUSE</button><button className="btn-secondary" onClick={() => setSimulationRunning(true)} disabled={!simulation?.active || simulationRunning}><Play size={13} /> RESUME</button><button className="btn-secondary" onClick={resetSim}><RefreshCw size={13} /> RESET</button></div></div>
            <div className="dashboard-grid"><Panel title="LIVE ROVER TELEMETRY" subtitle="Position on current route · simulated movement" className="map-panel"><TerrainMap terrain={terrain} route={simulation?.route || route?.route || []} start={currentRover} goal={goal} /><div className="progress-block"><div><span>MISSION PROGRESS</span><b>{simulation?.route?.length ? Math.round((progress / Math.max(1, simulation.route.length - 1)) * 100) : 0}%</b></div><div className="progress-track"><i style={{ width: `${simulation?.route?.length ? (progress / Math.max(1, simulation.route.length - 1)) * 100 : 0}%` }} /></div></div></Panel><Panel title="ROVER STATUS" subtitle="Virtual navigation telemetry"><div className="telemetry-grid"><div><span>CURRENT GRID CELL</span><strong>{currentRover[0]}, {currentRover[1]}</strong></div><div><span>WAYPOINT INDEX</span><strong>{simulation?.route?.length ? `${progress + 1} / ${simulation.route.length}` : '—'}</strong></div><div><span>ROUTE STRATEGY</span><strong>{(simulation?.mode || mode).toUpperCase()}</strong></div><div><span>AUTO REROUTES</span><strong>{simulation?.reroutes ?? 0}</strong></div></div><button className="btn-warning full-btn" onClick={addObstacle} disabled={!simulation?.active || busy || simulation.route.length < 5}><AlertTriangle size={15} /> INJECT OBSTACLE AHEAD</button><p className="small-note">The obstacle is inserted into the current planned route. The backend immediately replans around it using A*.</p></Panel></div>
            <Panel title="SIMULATION EVENT STREAM" subtitle="Events generated in this session"><div className="event-list horizontal-events"><div><i className="event-dot green" /><span><b>Simulation engine</b><small>{simulation ? 'Initialised' : 'Awaiting start'}</small></span></div><div><i className="event-dot blue" /><span><b>Route planner</b><small>{simulation?.route?.length ? `${simulation.route.length} waypoints loaded` : 'No active route'}</small></span></div><div><i className="event-dot orange" /><span><b>Obstacle response</b><small>{simulation?.obstacle_events ? `${simulation.obstacle_events} event(s) handled` : 'No obstacle events yet'}</small></span></div></div></Panel>
          </>}

          {page === 'nasa' && <>
            <SectionHeading eyebrow="EXTERNAL DATA SERVICES / 007" title="NASA Data Centre" detail="NASA public API connectivity, Astronomy Picture of the Day, retrieval status and attribution." action={<button className="btn-secondary" onClick={refreshNasa} disabled={busy}><RefreshCw size={14} /> Refresh NASA data</button>} />
            <div className="metrics-grid three"><MetricCard label="API CONNECTION" value={nasaStatus?.connected ? 'ONLINE' : 'OFFLINE'} unit="" note={nasaStatus?.key_type || 'Connection not checked'} icon={Globe2} tone={nasaStatus?.connected ? 'green' : 'red'} /><MetricCard label="APOD MEDIA TYPE" value={apod?.media_type?.toUpperCase() || '—'} unit="" note={apod?.date || 'No image retrieved'} icon={Satellite} tone="blue" /><MetricCard label="CACHE POLICY" value="15" unit="min" note="Backend response cache TTL" icon={Database} tone="purple" /></div>
            <Panel title="NASA APOD — ASTRONOMY PICTURE OF THE DAY" subtitle="General astronomy imagery from NASA; not a lunar terrain layer" action={apod && <Tag tone="green">NASA SOURCE</Tag>}>
              {apod ? <div className="apod-feature">{apod.media_type === 'image' ? <img src={apod.hdurl || apod.url} alt={apod.title} /> : <div className="video-placeholder"><Radio size={36} /><span>NASA APOD MEDIA · {apod.media_type?.toUpperCase()}</span><a href={apod.page_url || apod.url} target="_blank" rel="noreferrer">Open NASA media <ArrowUpRight size={13} /></a></div>}<div className="apod-copy"><div className="eyebrow">{apod.date} · ASTRONOMY PICTURE OF THE DAY</div><h3>{apod.title}</h3><p>{apod.explanation}</p><div className="attribution">SOURCE: NASA / ASTRONOMY PICTURE OF THE DAY{apod.copyright ? ` · IMAGE CREDIT: ${apod.copyright}` : ''}</div><div className="assumption-note"><AlertTriangle size={15} /><span>{apod.lunar_terrain_warning}</span></div><a className="external-link" href={apod.page_url || apod.url} target="_blank" rel="noreferrer">OPEN ORIGINAL NASA RESOURCE <ArrowUpRight size={13} /></a></div></div> : <div className="nasa-empty"><Satellite size={28} /><strong>NASA imagery unavailable</strong><p>{nasaStatus?.message || 'Backend has not retrieved APOD yet.'} You can still use terrain analysis and route planning offline.</p><button className="btn-primary" onClick={refreshNasa}><RefreshCw size={14} /> RETRY NASA CONNECTION</button></div>}
            </Panel>
            <Panel title="NASA LUNAR IMAGE LIBRARY" subtitle="Search NASA's public Image and Video Library · archive imagery, not a georeferenced terrain layer" action={<Tag tone="green">NASA ARCHIVE</Tag>}>
              <div className="image-search"><input value={imageQuery} onChange={(e) => setImageQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') searchLunarImages(); }} placeholder="Search NASA lunar imagery" /><button className="btn-secondary" onClick={searchLunarImages} disabled={busy}><Database size={13} /> SEARCH ARCHIVE</button></div>
              {lunarImages?.items?.length ? <div className="nasa-image-grid">{lunarImages.items.map((item) => <a className="nasa-image-card" href={item.source_url || '#'} key={item.nasa_id || item.title} target="_blank" rel="noreferrer">{item.thumbnail ? <img src={item.thumbnail} alt={item.title} loading="lazy" /> : <div className="image-placeholder"><Moon size={22} /></div>}<div><b>{item.title}</b><small>{item.center || 'NASA'} · {item.date_created ? new Date(item.date_created).toLocaleDateString() : 'Date not supplied'}</small></div></a>)}</div> : <div className="muted-block">NASA lunar image results have not been retrieved. Retry the archive search when internet access is available.</div>}
              <div className="disclaimer-line">{lunarImages?.warning || 'Archive images may not have the projection, scale or metadata required for navigation. They are not used to generate elevation or routes.'}</div>
            </Panel>
            <Panel title="NASA DONKI · SPACE WEATHER NOTIFICATIONS" subtitle={`Recent notification feed · ${donki?.date_range?.start || '—'} to ${donki?.date_range?.end || '—'}`} action={<Tag tone={donki ? 'green' : 'amber'}>{donki ? `${donki.count} EVENTS` : 'FEED UNAVAILABLE'}</Tag>}>
              {donki?.items?.length ? <div className="donki-list">{donki.items.slice(0, 8).map((item, index) => <div key={item.id || `${item.type}-${index}`}><div><Tag tone="blue">{item.type}</Tag><b>{item.issued_at ? new Date(item.issued_at).toLocaleString() : 'Issue time not supplied'}</b></div><p>{item.summary || 'NASA notification record.'}</p>{item.url && <a href={item.url} target="_blank" rel="noreferrer">NASA event details <ArrowUpRight size={12} /></a>}</div>)}</div> : <div className="muted-block">{donki ? 'No DONKI notifications were returned for this date range.' : 'DONKI feed has not been retrieved or is currently unavailable.'}</div>}
              <div className="assumption-note"><AlertTriangle size={15} /><span>{donki?.mission_relevance || 'Space-weather information can inform mission operations context, but it is not a local lunar surface hazard map and is not part of the terrain risk calculation.'}</span></div>
            </Panel>
            <div className="dashboard-grid"><Panel title="DATA SOURCES & LIMITATIONS" subtitle="What is and is not integrated"><div className="source-list"><div><b>NASA APOD Basic</b><Tag tone="green">INTEGRATED</Tag><p>General space media, date, explanation and attribution. Not a georeferenced lunar DEM.</p></div><div><b>NASA DONKI notifications</b><Tag tone="green">INTEGRATED</Tag><p>Recent solar and space-weather alert context. Displayed for mission awareness only, not interpreted as a local terrain hazard or used in A* scoring.</p></div><div><b>LOLA / LROC archives</b><Tag tone="blue">CSV IMPORT</Tag><p>Numeric CSV elevation-grid import is implemented. Downloaded archive products must be converted with their original pixel spacing and vertical units documented.</p></div></div></Panel><Panel title="API CONNECTION DETAILS" subtitle="Backend diagnostics"><div className="diag-list"><div><span>NASA APOD status</span><b className={nasaStatus?.connected ? 'green-text' : 'orange-text'}>{nasaStatus?.connected ? 'CONNECTED' : 'UNAVAILABLE'}</b></div><div><span>Authentication</span><b>{nasaStatus?.key_type || 'NOT CHECKED'}</b></div><div><span>Last checked</span><b>{nasaStatus?.checked_at ? new Date(nasaStatus.checked_at).toLocaleString() : '—'}</b></div><div><span>Backend cache</span><button className="text-button" onClick={async () => { try { const { data } = await api.post('/nasa/cache/clear'); setNotice(`${data.cleared_entries} cached NASA response(s) cleared.`); } catch (e) { setError(errorMessage(e)); } }}>CLEAR CACHE</button></div></div></Panel></div>
          </>}

          {page === 'reports' && <>
            <SectionHeading eyebrow="MISSION INTELLIGENCE / 008" title="Reports & Analytics" detail="Export the current terrain state, selected route comparison, hazard list and modelling limitations." action={<Tag tone="blue">EXPORT READY</Tag>} />
            <div className="metrics-grid three"><MetricCard label="ROUTE STRATEGIES" value={routes.length} unit="models" note="Shortest, safest, energy, balanced" icon={Route} /><MetricCard label="HAZARD FEATURES" value={hazards.length} unit="items" note="Rule-based candidates" icon={AlertTriangle} tone="orange" /><MetricCard label="TERRAIN CELLS" value={(terrain?.rows || 0) * (terrain?.cols || 0)} unit="cells" note={terrain?.is_synthetic ? 'Synthetic demonstration data' : 'Imported elevation data'} icon={Layers3} tone="purple" /></div>
            <div className="export-cards"><div className="export-card"><div className="export-icon pdf">PDF</div><div><h3>Mission report · PDF</h3><p>Formatted report with strategy metrics, hazard findings and limitations.</p></div><button className="btn-primary" onClick={() => downloadReport('pdf')} disabled={busy}><Download size={14} /> EXPORT PDF</button></div><div className="export-card"><div className="export-icon csv">CSV</div><div><h3>Analysis data · CSV</h3><p>Spreadsheet-friendly route comparison and hazard rows.</p></div><button className="btn-secondary" onClick={() => downloadReport('csv')} disabled={busy}><Download size={14} /> EXPORT CSV</button></div></div>
            <Panel title="MISSION SNAPSHOT" subtitle="Values are calculated from the current backend terrain state"><div className="table-scroll"><table className="data-table"><thead><tr><th>PARAMETER</th><th>VALUE</th><th>CONTEXT</th></tr></thead><tbody><tr><td>Terrain source</td><td>{terrain?.is_synthetic ? 'Synthetic' : 'Imported CSV'}</td><td>{terrain?.data_source}</td></tr><tr><td>Selected strategy</td><td>{mode.toUpperCase()}</td><td>Risk-weighted model</td></tr><tr><td>Route distance</td><td>{selectedMetrics.distance_cells ?? '—'} cells</td><td>8-connected grid path</td></tr><tr><td>Mean estimated risk</td><td>{selectedMetrics.mean_risk != null ? `${Math.round(selectedMetrics.mean_risk * 100)}%` : '—'}</td><td>Route cells only</td></tr><tr><td>Relative energy</td><td>{selectedMetrics.energy ?? '—'} units</td><td>Not physical watt-hours</td></tr><tr><td>Hazard candidates</td><td>{hazards.length}</td><td>Rule-based image/elevation analysis</td></tr></tbody></table></div></Panel>
          </>}

          {page === 'settings' && <>
            <SectionHeading eyebrow="SYSTEM CONFIGURATION / 009" title="Settings" detail="Configure rover model assumptions, terrain generation and elevation import." />
            <div className="settings-columns"><Panel title="SYNTHETIC TERRAIN GENERATOR" subtitle="Seeded terrain for repeatable demos"><div className="setting-field"><label>Grid size</label><select value={terrainSize} onChange={(e) => setTerrainSize(Number(e.target.value))}><option value={48}>48 × 48 · compact</option><option value={72}>72 × 72 · standard</option><option value={96}>96 × 96 · detailed</option><option value={128}>128 × 128 · high detail</option></select></div><div className="setting-field"><label>Random seed</label><input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} min="0" /></div><button className="btn-primary full-btn" onClick={generateTerrain} disabled={busy}><RefreshCw size={14} /> GENERATE NEW TERRAIN</button><div className="assumption-note"><AlertTriangle size={15} /><span>Generation replaces current in-memory terrain and clears the simulation route. Grid is synthetic, not actual lunar topography.</span></div></Panel><Panel title="ROVER ENERGY MODEL" subtitle="Relative-unit cost assumptions"><div className="setting-field"><label>Base energy / cell</label><input type="number" step="0.1" min="0" value={roverConfig.base_wh_per_cell} onChange={(e) => setRoverConfig({ ...roverConfig, base_wh_per_cell: Number(e.target.value) })} /></div><div className="setting-field"><label>Slope factor</label><input type="number" step="0.1" min="0" value={roverConfig.slope_factor} onChange={(e) => setRoverConfig({ ...roverConfig, slope_factor: Number(e.target.value) })} /></div><div className="setting-field"><label>Roughness factor</label><input type="number" step="0.1" min="0" value={roverConfig.roughness_factor} onChange={(e) => setRoverConfig({ ...roverConfig, roughness_factor: Number(e.target.value) })} /></div><div className="setting-field"><label>Obstacle factor</label><input type="number" step="0.1" min="0" value={roverConfig.obstacle_factor} onChange={(e) => setRoverConfig({ ...roverConfig, obstacle_factor: Number(e.target.value) })} /></div><button className="btn-primary full-btn" onClick={() => calculateRoutes(terrain, start, goal, mode, roverConfig)} disabled={busy}><BatteryCharging size={14} /> APPLY ENERGY MODEL</button><div className="disclaimer-line">These parameters are illustrative coefficients. They are not sourced from a real rover specification or validated physical power model.</div></Panel></div>
            <Panel title="IMPORT ELEVATION GRID" subtitle="CSV numeric grid only · up to 10 MB"><div className="settings-columns upload-settings"><div className="setting-field"><label>Pixel spacing (horizontal units / cell)</label><input type="number" min="0.000001" step="any" value={uploadSpacing} onChange={(e) => setUploadSpacing(Number(e.target.value))} /></div><div className="setting-field"><label>Vertical scale (convert elevation values to same units)</label><input type="number" min="0.000001" step="any" value={uploadVerticalScale} onChange={(e) => setUploadVerticalScale(Number(e.target.value))} /></div></div><label className="upload-zone"><input type="file" accept=".csv,text/csv" onChange={(e) => uploadDem(e.target.files?.[0])} /><Database size={22} /><strong>Choose a numeric elevation CSV</strong><span>Rows and columns of numeric elevation values · min 3 × 3 · max 512 × 512</span></label><div className="disclaimer-line">CSV does not contain geospatial metadata. Enter spacing and vertical-unit conversion from the source product documentation. GeoTIFF import is not included in this build.</div></Panel>
            <Panel title="BACKEND SYSTEM STATUS" subtitle="Live health check"><div className="diag-list"><div><span>Application</span><b className="green-text">LUNA-SAFE 2.0</b></div><div><span>Terrain data</span><b>{terrain?.is_synthetic ? 'SYNTHETIC' : 'USER IMPORT'}</b></div><div><span>Grid dimensions</span><b>{terrain?.rows} × {terrain?.cols}</b></div><div><span>Risk model</span><b>RULE-BASED / DEMO</b></div></div></Panel>
          </>}
        </>}
        <footer className="footer"><span>© 2026 LUNA-SAFE 2.0 · LUNAR TERRAIN INTELLIGENCE</span><span>DECISION-SUPPORT SIMULATION · NOT FLIGHT SOFTWARE</span></footer>
      </main>
    </div>
  );
}
