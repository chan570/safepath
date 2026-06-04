import React, { useState, useContext } from 'react';
import { AlertTriangle, X, ShieldAlert } from 'lucide-react';
import { AppContext } from '../context/AppContext';

export default function UnsafeReportForm({ coordinates, onClose }) {
  const { submitReport } = useContext(AppContext);
  const [issueType, setIssueType] = useState('Poorly Lit');
  const [severity, setSeverity] = useState('Medium');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!coordinates) return;
    
    setSubmitting(true);
    const success = await submitReport({
      issueType,
      severity,
      description,
      coordinates: { lat: coordinates.lat, lng: coordinates.lng }
    });
    setSubmitting(false);
    
    if (success) {
      onClose();
    }
  };

  if (!coordinates) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.4)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div 
        style={{
          width: '100%',
          maxWidth: '430px',
          padding: '24px',
          backgroundColor: 'var(--gm-bg)',
          color: 'var(--gm-text)',
          borderRadius: 'var(--gm-border-radius)',
          boxShadow: 'var(--gm-shadow)',
          border: '1px solid var(--gm-border)',
          position: 'relative'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              background: 'rgba(227, 116, 0, 0.1)',
              padding: '6px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <ShieldAlert size={18} color="var(--gm-warn)" />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Report Unsafe Hazard</h3>
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--gm-text-sec)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Coordinates readout */}
          <div style={{
            fontSize: '11px',
            color: 'var(--gm-text-sec)',
            background: 'var(--gm-hover)',
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid var(--gm-border)'
          }}>
            📍 Map Coordinates: <strong>{coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}</strong>
          </div>

          {/* Issue category dropdown */}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--gm-text-sec)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>
              Hazard Category
            </label>
            <select 
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              className="directions-input"
              style={{ paddingRight: '10px', cursor: 'pointer', width: '100%', height: '36px' }}
            >
              <option value="Poorly Lit">💡 Poorly Lit / Unlit Street</option>
              <option value="Harassment Zone">🗣️ Active Harassment Spot</option>
              <option value="Deserted Street">🚶 Deserted / Isolated Road</option>
              <option value="No Police Presence">👮 Absence of Police Patrols</option>
              <option value="Stalking/Suspicious Activity">👣 Loitering / Suspicious Activity</option>
              <option value="Other">⚠️ Other Safety Hazard</option>
            </select>
          </div>

          {/* Severity selector */}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--gm-text-sec)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
              Risk Severity
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {['Low', 'Medium', 'High'].map(sev => {
                const isSelected = severity === sev;
                const activeColor = sev === 'High' ? 'var(--gm-danger)' : sev === 'Medium' ? 'var(--gm-warn)' : 'var(--gm-safe)';
                return (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverity(sev)}
                    style={{
                      padding: '8px 0',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      border: isSelected ? `2px solid ${activeColor}` : '1px solid var(--gm-border)',
                      background: isSelected ? 'var(--gm-hover)' : 'transparent',
                      color: isSelected ? activeColor : 'var(--gm-text-sec)'
                    }}
                  >
                    {sev === 'High' ? '🔴 High' : sev === 'Medium' ? '🟡 Medium' : '🟢 Low'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--gm-text-sec)', display: 'block', marginBottom: '5px', fontWeight: 600 }}>
              Hazard Details (Optional)
            </label>
            <textarea
              className="directions-input"
              rows="3"
              placeholder="Describe lighting issues, isolated sections, etc."
              style={{ resize: 'none', height: 'auto', paddingTop: '8px', paddingBottom: '8px' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button 
              type="button" 
              onClick={onClose}
              className="reverse-btn" 
              style={{ flex: 1, height: '36px', border: '1px solid var(--gm-border)', borderRadius: '4px', fontSize: '13px' }}
              disabled={submitting}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="directions-circle-btn" 
              style={{ flex: 1, height: '36px', borderRadius: '4px', fontSize: '13px', background: 'var(--gm-accent)' }}
              disabled={submitting}
            >
              {submitting ? 'Reporting...' : 'Submit Report'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
