import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../styles/MapView.css';

// Base Icons
const createIcon = (colorUrl) => new L.Icon({
  iconUrl: colorUrl || 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const defaultIcon = createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png');
const highlightIcon = createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png');
const startEndIcon = createIcon('https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png');

// Component to adjust bounds when data changes
const MapBoundsFitter = ({ baselineRoute, candidates, selectedRouteIndex, responseType }) => {
  const map = useMap();
  
  useEffect(() => {
    const bounds = L.latLngBounds();
    let hasPoints = false;

    if (baselineRoute && baselineRoute.geometry) {
      const coords = baselineRoute.geometry.coordinates;
      coords.forEach(([lon, lat]) => {
        bounds.extend([lat, lon]);
        hasPoints = true;
      });
    }

    if (candidates && candidates.length > 0) {
      if (responseType === 'multi-stop') {
        const selected = selectedRouteIndex !== null ? candidates[selectedRouteIndex] : candidates[0];
        if (selected && selected.orderedStops) {
          selected.orderedStops.forEach(stop => {
            if (stop.lat && stop.lon) {
              bounds.extend([stop.lat, stop.lon]);
              hasPoints = true;
            }
          });
        }
      } else {
        candidates.forEach(c => {
          if (c.lat && c.lon) {
            bounds.extend([c.lat, c.lon]);
            hasPoints = true;
          }
        });
      }
    }

    if (hasPoints) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, baselineRoute, candidates, selectedRouteIndex, responseType]);

  return null;
};

const MapView = ({ 
  appState, 
  baselineRoute,
  routes = [],
  responseType,
  selectedRouteIndex,
  center = [31.1471, 75.3412], 
  zoom = 7 
}) => {
  
  // Re-key GeoJSON to force re-render when geometry changes
  const geoJsonRef = useRef(null);
  
  const renderStops = () => {
    if (!routes || routes.length === 0) return null;

    if (responseType === 'multi-stop') {
      const activeItinerary = selectedRouteIndex !== null ? routes[selectedRouteIndex] : routes[0];
      if (!activeItinerary || !activeItinerary.orderedStops) return null;
      
      return activeItinerary.orderedStops.map((stop, idx) => {
        if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') return null;
        
        return (
          <Marker 
            key={`stop-${stop.osmId}-${idx}`} 
            position={[stop.lat, stop.lon]} 
            icon={highlightIcon}
          >
            <Tooltip permanent direction="bottom" offset={[0, 0]} className="custom-map-tooltip selected-tooltip">
              {stop.name || 'Stop'}
            </Tooltip>
            <Popup>
              <strong>{stop.name || 'Stop'}</strong><br/>
              {stop.category}
            </Popup>
          </Marker>
        );
      });
    } else {
      return routes.map((candidate, idx) => {
        if (typeof candidate.lat !== 'number' || typeof candidate.lon !== 'number') return null;
        
        const isSelected = selectedRouteIndex === idx;
        return (
          <Marker 
            key={`candidate-${candidate.osmId || idx}`} 
            position={[candidate.lat, candidate.lon]} 
            icon={isSelected ? highlightIcon : defaultIcon}
            zIndexOffset={isSelected ? 1000 : 0}
          >
            <Tooltip 
              permanent 
              direction={isSelected ? "right" : "bottom"} 
              offset={isSelected ? [15, -20] : [0, 0]} 
              className={`custom-map-tooltip ${isSelected ? 'selected-tooltip' : ''}`}
            >
              {candidate.name || candidate.category || 'Place'}
            </Tooltip>
            <Popup>
              <strong>{candidate.name || 'Place'}</strong><br/>
              {candidate.category}
              {isSelected && <br/>}
              {isSelected && <em>Selected Route</em>}
            </Popup>
          </Marker>
        );
      });
    }
  };

  return (
    <div className="map-wrapper">
      <MapContainer 
        center={center} 
        zoom={zoom} 
        className="leaflet-map-container"
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapBoundsFitter 
          baselineRoute={baselineRoute} 
          candidates={routes} 
          selectedRouteIndex={selectedRouteIndex}
          responseType={responseType}
        />

        {/* Render baseline if no specific candidate is selected, OR render detours if available */}
        {baselineRoute && baselineRoute.geometry && selectedRouteIndex === null && (
          <GeoJSON 
            key={`baseline-${baselineRoute.distanceMeters}`}
            data={baselineRoute.geometry} 
            style={{ color: '#4A90E2', weight: 5, opacity: 0.7 }} 
          />
        )}

        {/* Render Detour Geometries for Single Stop */}
        {selectedRouteIndex !== null && responseType === 'single-stop' && routes[selectedRouteIndex] && (
          <>
            {routes[selectedRouteIndex].route1Geometry && (
              <GeoJSON 
                key={`detour1-${routes[selectedRouteIndex].osmId}`}
                data={routes[selectedRouteIndex].route1Geometry} 
                style={{ color: '#FF7F50', weight: 6, opacity: 0.9 }} 
              />
            )}
            {routes[selectedRouteIndex].route2Geometry && (
              <GeoJSON 
                key={`detour2-${routes[selectedRouteIndex].osmId}`}
                data={routes[selectedRouteIndex].route2Geometry} 
                style={{ color: '#FF7F50', weight: 6, opacity: 0.9 }} 
              />
            )}
            {/* Fallback to baseline if no detour geometry was provided by backend */}
            {(!routes[selectedRouteIndex].route1Geometry || !routes[selectedRouteIndex].route2Geometry) && baselineRoute && baselineRoute.geometry && (
              <GeoJSON 
                key={`baseline-fallback-${baselineRoute.distanceMeters}`}
                data={baselineRoute.geometry} 
                style={{ color: '#4A90E2', weight: 5, opacity: 0.7 }} 
              />
            )}
          </>
        )}

        {/* Render Detour Geometries for Multi Stop (if provided) */}
        {selectedRouteIndex !== null && responseType === 'multi-stop' && routes[selectedRouteIndex] && baselineRoute && baselineRoute.geometry && (
           <GeoJSON 
            key={`multi-fallback-${baselineRoute.distanceMeters}`}
            data={baselineRoute.geometry} 
            style={{ color: '#4A90E2', weight: 5, opacity: 0.7 }} 
          />
        )}

        {/* Start / End Markers */}
        {baselineRoute && baselineRoute.geometry && (
          <>
            <Marker 
              position={[baselineRoute.geometry.coordinates[0][1], baselineRoute.geometry.coordinates[0][0]]} 
              icon={startEndIcon}
            >
              <Tooltip permanent direction="bottom" offset={[0, 0]} className="custom-map-tooltip">
                <strong>Origin: </strong>{baselineRoute.origin?.displayName ? baselineRoute.origin.displayName.split(',')[0] : 'Start'}
              </Tooltip>
              <Popup><strong>Origin</strong></Popup>
            </Marker>
            <Marker 
              position={[
                baselineRoute.geometry.coordinates[baselineRoute.geometry.coordinates.length - 1][1], 
                baselineRoute.geometry.coordinates[baselineRoute.geometry.coordinates.length - 1][0]
              ]} 
              icon={startEndIcon}
            >
              <Tooltip permanent direction="bottom" offset={[0, 0]} className="custom-map-tooltip">
                <strong>Dest: </strong>{baselineRoute.destination?.displayName ? baselineRoute.destination.displayName.split(',')[0] : 'End'}
              </Tooltip>
              <Popup><strong>Destination</strong></Popup>
            </Marker>
          </>
        )}

        {renderStops()}

      </MapContainer>
      
      {appState === 'idle' && (
        <div className="map-overlay">
          <p>Enter your journey details to see the map update.</p>
        </div>
      )}
    </div>
  );
};

export default MapView;
