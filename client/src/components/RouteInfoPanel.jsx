import React from 'react';
import '../index.css';

export default function RouteInfoPanel({ route }) {
  if (!route) return null;

  const { safetyScore, distanceKm, durationMinutes, analysis } = route;
  const {
    boosters = [],
    hazards = [],
    cctvCoverageCount = 0,
    averagePoliceDistanceKm = 0,
  } = analysis || {};

  return (
    <div className="glass-panel" style={{
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'calc(100% - 40px)',
      maxWidth: '480px',
      zIndex: 1000,
      padding: '16px',
      background: 'rgba(9, 6, 22, 0.85)',
      color: 'var(--text-primary)'
    }}>
      <h4 style={{ fontSize: '16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {route.isSafest ? '🛡️ Safest Route' : route.isFastest ? '⚡ Fastest Route' : '📏 Shortest Route'}
      </h4>
      <div style={{ fontSize: '14px', marginBottom: '8px' }}>
        <strong>Safety Score:</strong> {safetyScore}/100
      </div>
      <div style={{ fontSize: '13px', marginBottom: '8px' }}>
        <strong>Distance:</strong> {distanceKm} km&nbsp;&nbsp;<strong>Estimated Time:</strong> {durationMinutes} mins
      </div>
      <div style={{ marginBottom: '6px' }}>
        <strong>Police Proximity:</strong> {averagePoliceDistanceKm.toFixed(2)} km avg.
      </div>
      <div style={{ marginBottom: '6px' }}>
        <strong>CCTV Coverage:</strong> {cctvCoverageCount} cameras inspected
      </div>
      {boosters.length > 0 && (
        <div style={{ marginBottom: '6px' }}>
          <strong>Safety Boosters:</strong>
          <ul style={{ paddingLeft: '20px', marginTop: '4px' }}>
            {boosters.map((b, i) => (
              <li key={i} style={{ fontSize: '12px' }}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      {hazards.length > 0 && (
        <div style={{ marginBottom: '6px' }}>
          <strong>Safety Concerns:</strong>
          <ul style={{ paddingLeft: '20px', marginTop: '4px' }}>
            {hazards.map((h, i) => (
              <li key={i} style={{ fontSize: '12px', color: 'var(--danger-red)' }}>{h}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
