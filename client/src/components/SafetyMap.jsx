import React, { useEffect, useState, useContext } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { AppContext } from '../context/AppContext';
import { Plus, Minus, Navigation, Layers, Flame, Circle, Compass, AlertOctagon } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import RouteInfoPanel from './RouteInfoPanel';

// SVG Icon Helpers
const ICONS = {
  source: createSvgIcon('#1e8e3e', '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3" fill="#1e8e3e"></circle>'),
  destination: createSvgIcon('#d93025', '<path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path><circle cx="12" cy="10" r="3" fill="#d93025"></circle>', 34),
  police: createSvgIcon('#1a73e8', '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>', 26),
  hospital: createSvgIcon('#1e8e3e', '<path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>', 26),
  report: createSvgIcon('#e37400', '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>', 28),
  userLocation: createSvgIcon('#1a73e8', '<circle cx="12" cy="12" r="9" fill="rgba(26,115,232,0.3)"></circle><circle cx="12" cy="12" r="4" fill="#1a73e8"></circle>', 26)
};

function createSvgIcon(color, svgPath, size = 30) {
  return new L.DivIcon({
    className: 'custom-leaflet-icon',
    html: `
      <div style="
        display: flex;
        justify-content: center;
        align-items: center;
        width: ${size}px;
        height: ${size}px;
        background: rgba(255, 255, 255, 0.95);
        border: 2px solid ${color};
        border-radius: 50%;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        cursor: pointer;
        transition: transform 0.2s;
      " onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          ${svgPath}
        </svg>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
}

// Inner controller component to interface with Leaflet map instance
let leafMapInstance = null;
function MapController({ tileType, setMapReady }) {
  const map = useMap();
  useEffect(() => {
    leafMapInstance = map;
    setMapReady(true);
  }, [map, setMapReady]);
  return null;
}

// Click and double-click listener on map
function MapClickHandler({ onMapClick, reportMode, setReportMode }) {
  useMapEvents({
    click(e) {
      if (reportMode) {
        onMapClick(e.latlng);
        setReportMode(false); // auto-deactivate
      }
    },
    dblclick(e) {
      if (!reportMode) {
        onMapClick(e.latlng);
      }
    }
  });
  return null;
}

// Auto-recenter map when bounds change
function MapRecenter({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [80, 80] });
    }
  }, [bounds, map]);
  return null;
}

export default function SafetyMap({ onReportClick }) {
  const {
    source,
    destination,
    activeRoutes,
    selectedRoute,
    setSelectedRoute,
    reports,
    deleteReport,
    transportMode,
    reportMode,
    setReportMode
  } = useContext(AppContext);

  // Map Tile and Widget States
  const [mapReady, setMapReady] = useState(false);
  const [tileType, setTileType] = useState('light'); // 'light', 'dark', 'satellite'
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [userCoords, setUserCoords] = useState(null);

  // Auto-select safest route initially
  useEffect(() => {
    if (activeRoutes && activeRoutes.length > 0) {
      const safest = activeRoutes.find(r => r.isSafest);
      if (safest && (!selectedRoute || selectedRoute.id !== safest.id)) {
        setSelectedRoute(safest);
      }
    }
  }, [activeRoutes]);

  // Compute map bounds containing route points
  let mapBounds = [];
  if (source) mapBounds.push([source.lat, source.lng]);
  if (destination) mapBounds.push([destination.lat, destination.lng]);
  if (activeRoutes && activeRoutes.length > 0) {
    activeRoutes.forEach(route => {
      route.geometry.forEach(c => mapBounds.push([c[0], c[1]]));
    });
  }

  // Pre-seed mock emergency service points near Delhi/Mumbai centers
  const mockEmergencyServices = [];
  if (source && destination) {
    const latMid = (source.lat + destination.lat) / 2;
    const lngMid = (source.lng + destination.lng) / 2;
    mockEmergencyServices.push({
      id: 'mock_pol_1',
      type: 'police',
      name: 'Safe Zone Police Booth',
      coords: [latMid + 0.003, lngMid - 0.002]
    });
    mockEmergencyServices.push({
      id: 'mock_pol_2',
      type: 'police',
      name: 'Central Police Station',
      coords: [latMid - 0.004, lngMid + 0.003]
    });
    mockEmergencyServices.push({
      id: 'mock_hosp',
      type: 'hospital',
      name: 'SafePath Emergency Clinic',
      coords: [latMid - 0.002, lngMid + 0.004]
    });
  }

  // Handle custom zoom controls
  const zoomIn = () => {
    if (leafMapInstance) leafMapInstance.zoomIn();
  };

  const zoomOut = () => {
    if (leafMapInstance) leafMapInstance.zoomOut();
  };

  // Find user geolocation and focus
  const locateUser = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserCoords([latitude, longitude]);
          if (leafMapInstance) {
            leafMapInstance.setView([latitude, longitude], 15);
          }
        },
        (error) => {
          alert("Error retrieving geolocation. Centering default coordinates.");
          if (leafMapInstance) leafMapInstance.setView([28.6139, 77.2090], 13);
        }
      );
    }
  };

  // Tile URL Definitions
  const TILE_URLS = {
    light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', // clean light
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', // clean dark
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' // esri highres
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      
      {/* 1. Map Container */}
      <MapContainer
        center={[28.6139, 77.2090]}
        zoom={13}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        doubleClickZoom={false} // Disable to allow custom double click reporting
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a> / Esri'
          url={TILE_URLS[tileType]}
        />

        <MapController tileType={tileType} setMapReady={setMapReady} />
        <MapClickHandler 
          onMapClick={onReportClick} 
          reportMode={reportMode} 
          setReportMode={setReportMode} 
        />
        {mapBounds.length > 0 && <MapRecenter bounds={mapBounds} />}

        {/* User Current Location Pin */}
        {userCoords && (
          <Marker position={userCoords} icon={ICONS.userLocation}>
            <Popup>
              <div style={{ fontSize: '12px' }}>Your current location</div>
            </Popup>
          </Marker>
        )}

        {/* Draw Safest and Fastest routes */}
        {activeRoutes && activeRoutes.map(route => {
          const isSelected = selectedRoute && selectedRoute.id === route.id;
          
          // Google Maps styling: Blue for selected, Gray for alternative
          const pathColor = isSelected ? '#1a73e8' : '#808080';
          const outlineColor = isSelected ? '#1557b0' : '#606060';
          const pathWeight = isSelected ? 6 : 4;
          const outlineWeight = isSelected ? 9 : 7;
          
          return (
            <React.Fragment key={route.id}>
              {/* Thick Outline / Stroke */}
              <Polyline 
                positions={route.geometry} 
                pathOptions={{ 
                  color: outlineColor, 
                  weight: outlineWeight,
                  opacity: isSelected ? 1 : 0.7,
                  lineJoin: 'round',
                  lineCap: 'round'
                }} 
              />
              {/* Inner Line */}
              <Polyline
                positions={route.geometry}
                pathOptions={{
                  color: pathColor,
                  weight: pathWeight,
                  opacity: isSelected ? 1 : 0.7,
                  lineJoin: 'round',
                  lineCap: 'round'
                }}
                eventHandlers={{
                  click: () => setSelectedRoute(route)
                }}
              >
                <Popup>
                  <div style={{ fontFamily: 'Arial', minWidth: '150px' }}>
                    <h4 style={{ color: pathColor, fontSize: '14px', margin: '0 0 6px 0' }}>
                      {route.isSafest ? '🛡️ Safest Path' : '⚡ Fastest Path'}
                    </h4>
                    <p style={{ margin: '0 0 4px 0', fontSize: '12px' }}>
                      Safety Level: <strong>{route.safetyScore}%</strong>
                    </p>
                    <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#666' }}>
                      Dist: {route.distanceKm} km | Duration: {route.durationMinutes} mins
                    </p>
                    <button
                      onClick={() => setSelectedRoute(route)}
                      style={{
                        background: pathColor,
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 8px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        width: '100%',
                        fontWeight: 'bold'
                      }}
                    >
                      Select Route
                    </button>
                  </div>
                </Popup>
              </Polyline>
            </React.Fragment>
          );
        })}

        {/* Source pin */}
        {source && (
          <Marker position={[source.lat, source.lng]} icon={ICONS.source}>
            <Popup>
              <div style={{ fontSize: '12px' }}>
                <strong>Start Point:</strong><br />
                {source.name}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination pin */}
        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={ICONS.destination}>
            <Popup>
              <div style={{ fontSize: '12px' }}>
                <strong>Destination:</strong><br />
                {destination.name}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Incident Reports */}
        {reports && reports.map(rep => (
          <Marker
            key={rep._id}
            position={[rep.coordinates.lat, rep.coordinates.lng]}
            icon={ICONS.report}
          >
            <Popup>
              <div style={{ minWidth: '150px' }}>
                <h4 style={{ color: '#e37400', fontSize: '13px', margin: '0 0 4px 0' }}>
                  ⚠️ {rep.issueType}
                </h4>
                <div style={{ fontSize: '11px', marginBottom: '4px' }}>
                  Severity: <span style={{ color: rep.severity === 'High' ? 'red' : 'orange', fontWeight: 'bold' }}>{rep.severity}</span>
                </div>
                {rep.description && (
                  <p style={{ margin: '4px 0', fontSize: '11px', fontStyle: 'italic', color: '#555' }}>
                    "{rep.description}"
                  </p>
                )}
                <div style={{ fontSize: '9px', color: '#888', marginTop: '6px' }}>
                  Reported: {new Date(rep.createdAt).toLocaleDateString()}
                </div>
                <button
                  onClick={() => deleteReport(rep._id)}
                  style={{
                    marginTop: '8px',
                    width: '100%',
                    padding: '6px',
                    fontSize: '11px',
                    color: 'white',
                    backgroundColor: 'var(--gm-danger)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 4px rgba(217, 48, 37, 0.2)',
                    transition: 'opacity 0.2s'
                  }}
                >
                  Delete Report
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Emergency Services */}
        {mockEmergencyServices.map(srv => (
          <Marker
            key={srv.id}
            position={srv.coords}
            icon={srv.type === 'police' ? ICONS.police : ICONS.hospital}
          >
            <Popup>
              <div style={{ fontSize: '12px' }}>
                <strong>{srv.type === 'police' ? '👮 Safe Haven (Police)' : '🏥 Emergency Care'}</strong>
                <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>{srv.name}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Safety Heatmap Overlay layer (translucent gradient circles around reports) */}
        {showHeatmap && reports && reports.map(rep => (
          <React.Fragment key={`heat-${rep._id}`}>
            {/* Inner Core (high intensity) */}
            <Marker 
              position={[rep.coordinates.lat, rep.coordinates.lng]} 
              icon={new L.DivIcon({
                className: 'heatmap-core',
                html: `<div style="pointer-events:none;width:20px;height:20px;background:rgba(219,48,37,0.7);border-radius:50%;filter:blur(3px);"></div>`,
                iconSize: [20,20],
                iconAnchor: [10,10]
              })}
            />
            {/* Mid Ring */}
            <Marker 
              position={[rep.coordinates.lat, rep.coordinates.lng]} 
              icon={new L.DivIcon({
                className: 'heatmap-mid',
                html: `<div style="pointer-events:none;width:60px;height:60px;background:rgba(227,116,0,0.3);border-radius:50%;filter:blur(8px);"></div>`,
                iconSize: [60,60],
                iconAnchor: [30,30]
              })}
            />
            {/* Outer halo */}
            <Marker 
              position={[rep.coordinates.lat, rep.coordinates.lng]} 
              icon={new L.DivIcon({
                className: 'heatmap-halo',
                html: `<div style="pointer-events:none;width:120px;height:120px;background:rgba(253,214,99,0.15);border-radius:50%;filter:blur(15px);"></div>`,
                iconSize: [120,120],
                iconAnchor: [60,60]
              })}
            />
          </React.Fragment>
        ))}
      </MapContainer>

      {/* 2. Top Banner Guidelines */}
      {reportMode && (
        <div style={{
          position: 'absolute', top: '72px', left: '12px', zIndex: 9,
          backgroundColor: 'var(--gm-danger)', color: 'white', border: '1px solid var(--gm-danger)',
          borderRadius: '20px', padding: '8px 16px', fontSize: '13px', fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(217, 48, 37, 0.3)', display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <AlertOctagon size={16} />
          <span>Click anywhere on the map to drop a hazard pin</span>
        </div>
      )}

      {/* 3. Floating Map Overlay Layer Controls (Bottom-Left) */}
      <div className="layers-card" style={{ zIndex: 99999 }}>
        <div className={`layer-option ${tileType === 'light' ? 'active' : ''}`} onClick={() => setTileType('light')}>
          <div className="layer-img-thumb" style={{ border: tileType === 'light' ? '2px solid var(--gm-accent)' : '2px solid transparent' }}>
            <Layers size={18} color="#202124" />
          </div>
          <span className="layer-label">Default</span>
        </div>
        <div className={`layer-option ${tileType === 'dark' ? 'active' : ''}`} onClick={() => setTileType('dark')}>
          <div className="layer-img-thumb" style={{ border: tileType === 'dark' ? '2px solid var(--gm-accent)' : '2px solid transparent', background: '#303134' }}>
            <Layers size={18} color="#ffffff" />
          </div>
          <span className="layer-label">Dark</span>
        </div>
        <div className={`layer-option ${tileType === 'satellite' ? 'active' : ''}`} onClick={() => setTileType('satellite')}>
          <div className="layer-img-thumb" style={{ border: tileType === 'satellite' ? '2px solid var(--gm-accent)' : '2px solid transparent' }}>
            <Compass size={18} color="#555" />
          </div>
          <span className="layer-label">Satellite</span>
        </div>
        <div style={{ width: '1px', background: 'var(--gm-border)', margin: '0 4px' }} />
        <div className={`layer-option ${showHeatmap ? 'heatmap-active' : ''}`} onClick={() => setShowHeatmap(!showHeatmap)}>
          <div className="layer-img-thumb" style={{ background: showHeatmap ? 'rgba(217,48,37,0.15)' : 'none', border: showHeatmap ? '2px solid var(--gm-danger)' : '2px solid transparent' }}>
            <Flame size={18} color="var(--gm-danger)" fill={showHeatmap ? "var(--gm-danger)" : "none"} />
          </div>
          <span className="layer-label">Heatmap</span>
        </div>
      </div>

      {/* 4. Floating Map Widget Controls (Bottom-Right) */}
      <div className="map-widgets-container" style={{ zIndex: 99999 }}>
        {/* NEW Report Hazard FAB */}
        <button 
          className="map-widget-btn" 
          onClick={() => setReportMode(!reportMode)} 
          title="Report Hazard"
          style={{ width: 'auto', padding: '0 16px', borderRadius: '24px', backgroundColor: reportMode ? 'var(--gm-danger)' : 'white', color: reportMode ? 'white' : 'black', display: 'flex', gap: '8px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', transition: 'all 0.3s ease' }}
        >
          <AlertOctagon size={20} color={reportMode ? 'white' : 'var(--gm-danger)'} />
          {reportMode ? 'Cancel Report' : 'Report Hazard'}
        </button>

        {/* Geolocation target */}
        <button className="map-widget-btn" onClick={locateUser} title="Locate Me">
          <Navigation size={20} fill={userCoords ? 'var(--gm-accent)' : 'none'} color={userCoords ? 'var(--gm-accent)' : 'currentColor'} style={{ transform: 'rotate(45deg)' }} />
        </button>

        {/* Custom Zoom Buttons */}
        <div className="zoom-controls-card">
          <button className="zoom-btn" onClick={zoomIn} title="Zoom In">
            <Plus size={20} />
          </button>
          <div className="zoom-divider" />
          <button className="zoom-btn" onClick={zoomOut} title="Zoom Out">
            <Minus size={20} />
          </button>
        </div>
      </div>

      {/* 5. Route Info Panel Detail */}
      {selectedRoute && <RouteInfoPanel route={selectedRoute} />}
    </div>
  );
}
