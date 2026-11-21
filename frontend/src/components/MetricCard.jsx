import React from 'react';

export default function MetricCard({ label, value, unit, note, icon: Icon, tone = 'blue' }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <span className={`metric-icon ${tone}`}>{Icon && <Icon size={17} strokeWidth={1.8} />}</span>
      </div>
      <div className="metric-value">{value ?? '—'}<small>{unit}</small></div>
      <div className="metric-note">{note}</div>
    </div>
  );
}
