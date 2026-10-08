import React from 'react';
import '../styles/RouteResults.css';

const formatDuration = (seconds) => {
  if (typeof seconds !== 'number') return 'Unknown time';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
};

const formatDistance = (meters) => {
  if (typeof meters !== 'number') return 'Unknown distance';
  return (meters / 1000).toFixed(1) + ' km';
};

const ItineraryDetails = ({ item, responseType, baselineRoute }) => {
  if (responseType === 'multi-stop') {
    return (
      <div className="itinerary-breakdown">
         <h4>Itinerary Breakdown</h4>
         <ul className="timeline">
           <li><strong>Origin</strong></li>
           {item.orderedStops.map((stop, i) => {
             const segmentTime = item.segmentLegs && item.segmentLegs[i] ? item.segmentLegs[i].durationSeconds : null;
             return (
               <React.Fragment key={i}>
                 <li className="leg-info">
                   â†“ Drive {segmentTime !== null ? formatDuration(segmentTime) : 'segment limitation (unknown)'}
                 </li>
                 <li><strong>{stop.name || 'Unnamed Stop'}</strong> ({stop.userRequirement})</li>
               </React.Fragment>
             );
           })}
           <li className="leg-info">
             {(() => {
               const lastLeg = item.segmentLegs && item.segmentLegs[item.orderedStops.length] ? item.segmentLegs[item.orderedStops.length].durationSeconds : null;
               return `â†“ Drive ${lastLeg !== null ? formatDuration(lastLeg) : 'segment limitation (unknown)'}`;
             })()}
           </li>
           <li><strong>Destination</strong></li>
         </ul>
         <div className="summary-box">
           <div><strong>Total Itinerary Time:</strong> {formatDuration(item.totalDurationSeconds)}</div>
           <div><strong>Baseline Time:</strong> {baselineRoute ? formatDuration(baselineRoute.durationSeconds) : 'Unknown'}</div>
           <div><strong>Additional Drive Time (Car):</strong> +{formatDuration(item.additionalDurationSeconds)}</div>
           <div><strong>Total Distance:</strong> {formatDistance(item.totalDistanceMeters)}</div>
         </div>
      </div>
    );
  }

  // Single stop candidate
  return (
    <div className="itinerary-breakdown">
      <h4>Route Breakdown</h4>
      <ul className="timeline">
        <li><strong>Origin</strong></li>
        <li className="leg-info">
          â†“ Drive {item.originToPlaceDurationSeconds !== undefined ? formatDuration(item.originToPlaceDurationSeconds) : 'segment limitation (unknown)'}
        </li>
        <li>
          <strong>{item.name || 'Unnamed Place'}</strong> ({item.userRequirement})
          {item.tags && item.tags['addr:city'] && <span className="address-tag">, {item.tags['addr:city']}</span>}
        </li>
        <li className="leg-info">
          â†“ Drive {item.placeToDestinationDurationSeconds !== undefined ? formatDuration(item.placeToDestinationDurationSeconds) : 'segment limitation (unknown)'}
        </li>
        <li><strong>Destination</strong></li>
      </ul>
      <div className="summary-box">
        <div><strong>Total Drive Time (Car):</strong> {formatDuration(item.viaPlaceDurationSeconds)}</div>
        <div><strong>Baseline Time:</strong> {baselineRoute ? formatDuration(baselineRoute.durationSeconds) : 'Unknown'}</div>
        <div><strong>Additional Drive Time (Car):</strong> +{formatDuration(item.additionalDurationSeconds)}</div>
        <div><strong>Total Distance:</strong> {formatDistance(item.viaPlaceDistanceMeters)}</div>
      </div>
    </div>
  );
};

const RouteResults = ({ appState, routes = [], baselineRoute, responseType, metadata, selectedRouteIndex, onSelectRoute, onClearSelection }) => {
  if (appState === 'idle') {
    return (
      <div className="results-panel empty-state">
        <p>Results will appear here.</p>
      </div>
    );
  }

  if (appState === 'clarification') {
    return (
      <div className="results-panel empty-state" style={{ padding: '20px', textAlign: 'center' }}>
        <p style={{ color: '#d93025', fontWeight: 'bold' }}>Clarification Required</p>
        <p>Your prompt was ambiguous. Please provide more specific details (e.g., if requesting multiple stops, specify the exact order you want to visit them).</p>
      </div>
    );
  }

  if (appState === 'loading') {
    return (
      <div className="results-panel loading-state">
        <div className="spinner"></div>
        <p>Calculating routes...</p>
      </div>
    );
  }

  if (appState === 'no-results' || (appState === 'results' && routes.length === 0 && responseType !== 'baseline_only')) {
    return (
      <div className="results-panel empty-state">
        <p>No eligible routes found matching your criteria. Try adjusting your search.</p>
      </div>
    );
  }

  return (
    <div className="results-panel has-results">
      <div className="results-header">
        <h3>Available {responseType === 'multi-stop' ? 'Itineraries' : 'Places'}</h3>
        {selectedRouteIndex !== null && (
          <button className="clear-selection-btn" onClick={onClearSelection}>
            View Baseline Route
          </button>
        )}
      </div>
      




      {responseType === 'baseline_only' && (
        <div className="route-item selected">
          <div className="route-info">
            <strong>Direct Route</strong>
            <p>No additional stops were requested.</p>
            {baselineRoute && (
              <div className="summary-box">
                <div><strong>Base Driving Time (Car):</strong> {formatDuration(baselineRoute.durationSeconds)}</div>
                <div><strong>Base Distance:</strong> {formatDistance(baselineRoute.distanceMeters)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <ul className="route-list">
        {routes.map((item, index) => {
          const isSelected = selectedRouteIndex === index;
          
          if (responseType === 'multi-stop') {
            return (
              <li 
                key={index} 
                className={`route-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectRoute(index)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectRoute(index); }}
                tabIndex={0}
                role="button"
                aria-pressed={isSelected}
              >
                <div className="route-info">
                  <strong>Itinerary {index + 1}</strong>
                  <div>Stops: {item.orderedStops.map(s => s.name || s.userRequirement).join(' → ')}</div>
                  {!isSelected && (
                    <div className="short-summary">Extra Driving Time (Car): +{formatDuration(item.additionalDurationSeconds)}</div>
                  )}
                </div>
                {isSelected && (
                  <ItineraryDetails item={item} responseType={responseType} baselineRoute={baselineRoute} />
                )}
              </li>
            );
          }

          // Single Stop Candidate
          return (
            <li 
              key={index} 
              className={`route-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectRoute(index)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectRoute(index); }}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
            >
              <div className="route-info">
                <strong>{item.name || 'Unnamed Place'}</strong>
                <div className="route-category">{item.userRequirement}</div>
                {!isSelected && (
                  <div className="short-summary">Extra Driving Time (Car): +{formatDuration(item.additionalDurationSeconds)}</div>
                )}
              </div>
              {isSelected && (
                <ItineraryDetails item={item} responseType={responseType} baselineRoute={baselineRoute} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default RouteResults;
