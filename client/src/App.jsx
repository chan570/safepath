import React, { useState, useContext } from 'react';
import Sidebar from './components/Sidebar';
import SafetyMap from './components/SafetyMap';
import UnsafeReportForm from './components/UnsafeReportForm';
import Onboarding from './components/Onboarding';
import { AppProvider, AppContext } from './context/AppContext';

function SafePathAppContent() {
  const { isSOSActive, sosCountdown, isDarkMode, showOnboarding, setShowOnboarding } = useContext(AppContext);
  const [reportCoords, setReportCoords] = useState(null); // stores coordinates from map click

  // Full active alarm flashing state (active SOS, countdown ended)
  const isAlarmFlashing = isSOSActive && sosCountdown === 0;

  return (
    <div className={`fullscreen-map-container ${isAlarmFlashing ? 'sos-alarm-active' : ''}`}>
      
      {/* 1. Fullscreen Leaflet Map Component */}
      <SafetyMap onReportClick={setReportCoords} />

      {/* 2. Floating Google Maps Control Panels */}
      <Sidebar />

      {/* 3. Log Unsafe Area Dialog Modal */}
      {reportCoords && (
        <UnsafeReportForm 
          coordinates={reportCoords} 
          onClose={() => setReportCoords(null)} 
        />
      )}

      {/* Flashing SOS Visual Alert Ring */}
      {isAlarmFlashing && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          border: '10px solid var(--gm-danger)',
          pointerEvents: 'none',
          zIndex: 9999,
          boxShadow: 'inset 0 0 50px rgba(217, 48, 37, 0.5)'
        }} />
      )}

      {/* Onboarding Wizard */}
      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <SafePathAppContent />
    </AppProvider>
  );
}
