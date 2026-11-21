import React, { useMemo } from 'react';

function cellColor(risk, blocked) {
  if (blocked) return '#080b0f';
  if (risk >= 0.72) return '#e45b46';
  if (risk >= 0.52) return '#dc9147';
  if (risk >= 0.30) return '#d4c15c';
  return '#579d83';
}

export default function TerrainMap({ terrain, route = [], start, goal, onSelectCell, selectionMode = 'start', showRoute = true, compact = false }) {
  const grid = terrain?.risk;
  const rows = terrain?.rows || grid?.length || 0;
  const cols = terrain?.cols || grid?.[0]?.length || 0;
  const routePoints = useMemo(() => route.map(([r, c]) => `${c + 0.5},${r + 0.5}`).join(' '), [route]);
  if (!grid?.length) return <div className="map-empty">Terrain grid is not available.</div>;
  return (
    <div className={`terrain-map-wrap ${compact ? 'compact' : ''}`}>
      <svg viewBox={`0 0 ${cols} ${rows}`} className="terrain-svg" role="img" aria-label="Synthetic terrain risk grid. Green is lower risk; black cells are blocked.">
        <defs>
          <pattern id="gridlines" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#08121a" strokeWidth="0.035" opacity=".42" />
          </pattern>
        </defs>
        {grid.map((row, r) => row.map((risk, c) => (
          <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1"
            fill={cellColor(risk, Boolean(terrain.blocked?.[r]?.[c]))}
            stroke="#08121a" strokeWidth=".018"
            onClick={() => onSelectCell?.(r, c)}
            style={{ cursor: onSelectCell ? 'crosshair' : 'default' }}
          />
        )))}
        <rect x="0" y="0" width={cols} height={rows} fill="url(#gridlines)" pointerEvents="none" />
        {showRoute && route.length > 1 && <polyline points={routePoints} fill="none" stroke="#8cecff" strokeWidth=".28" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {start && <g><circle cx={start[1] + .5} cy={start[0] + .5} r=".8" fill="#a6f0d1" stroke="#07141a" strokeWidth=".12" /><text x={start[1] + .5} y={start[0] + .18} fontSize="1.1" fill="#07141a" textAnchor="middle" fontWeight="bold">S</text></g>}
        {goal && <g><circle cx={goal[1] + .5} cy={goal[0] + .5} r=".8" fill="#f3b56c" stroke="#07141a" strokeWidth=".12" /><text x={goal[1] + .5} y={goal[0] + .18} fontSize="1.1" fill="#07141a" textAnchor="middle" fontWeight="bold">D</text></g>}
      </svg>
      <div className="map-axes"><span>90° E</span><span>DEMO GRID · {rows} × {cols}</span><span>90° W</span></div>
    </div>
  );
}
