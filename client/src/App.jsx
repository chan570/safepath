import React, { useState } from 'react';
import Header from './components/Header.jsx';
import SearchForm from './components/SearchForm.jsx';
import MapView from './components/MapView.jsx';
import RouteResults from './components/RouteResults.jsx';
import { Toaster, toast } from 'react-hot-toast';
import './styles/App.css';

function formatApiError(data, fallback = 'An unexpected error occurred.') {
  if (!data) return fallback;

  if (Array.isArray(data.ambiguities) && data.ambiguities.length > 0) {
    return data.ambiguities.map(a => {
      if (typeof a === 'string') return a;
      if (a && (a.type === 'origin' || a.type === 'destination')) {
        const places = (a.candidates || []).slice(0, 3).map(c => c.displayName).join('; ');
        return `Ambiguous ${a.type} '${a.query}'. Found: ${places}`;
      }
      return JSON.stringify(a);
    }).join(' | ');
  }

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.map(e => typeof e === 'string' ? e : e.message || JSON.stringify(e)).join(' | ');
  }

  return data.message || data.error || data.details || fallback;
}

function App() {
  // Application states: idle, loading, error, clarification, no-results, results
  const [appState, setAppState] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [routes, setRoutes] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(null);

  const [baselineRoute, setBaselineRoute] = useState(null);
  const [routeMetadata, setRouteMetadata] = useState(null);
  const [responseType, setResponseType] = useState(null);
  const [responseMessage, setResponseMessage] = useState(null);

  const handleSearch = async (searchData) => {
    if (appState === 'loading') return;

    setAppState('loading');
    setErrorMessage('');
    setRoutes([]);
    setRouteMetadata(null);
    setSelectedRouteIndex(null);
    setBaselineRoute(null);
    setRouteMetadata(null);
    setResponseType(null);
    setResponseMessage(null);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      
      const response = await fetch(`${apiUrl}/route/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: searchData.prompt,
          resolvedOrigin: searchData.start,
          resolvedDestination: searchData.destination
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 422) {
          setAppState('clarification');
          toast.error(formatApiError(data, 'Please clarify your request.'));
        } else if (response.status === 404) {
          setAppState('no-results');
          toast.error(formatApiError(data, 'No eligible places found matching your constraints.'));
        } else if (response.status === 400) {
          setAppState('error');
          toast.error(formatApiError(data, 'The request contains unsupported constraints.'));
        } else if (response.status === 502) {
          setAppState('error');
          toast.error(formatApiError(data, 'A routing or mapping provider is temporarily unavailable.'));
        } else {
          setAppState('error');
          toast.error(formatApiError(data, 'An internal server error occurred.'));
        }
        return;
      }

      setAppState('results');
      toast.success('Here are your results!');
      setBaselineRoute(data.baselineRoute || null);
      setRouteMetadata(data.metadata || null);
      setResponseType(data.responseType || data.type || 'single-stop');
      setResponseMessage(data.message || null);

      if (data.type === 'multi-stop') {
        setRoutes([data.itinerary]);
      } else if (data.type === 'baseline_only') {
        setRoutes([]);
      } else {
        setRoutes(data.results || []);
      }
    } catch (error) {
      setAppState('error');
      toast.error('A network error occurred. Please check your connection and try again.');
    }
  };

  const handleSelectRoute = (index) => {
    setSelectedRouteIndex(index);
  };

  const handleClearSelection = () => {
    setSelectedRouteIndex(null);
  };

  const handleBackToSearch = () => {
    setAppState('idle');
  };

  return (
    <div className="app-container">
      <Toaster position="top-center" />
      <aside className="sidebar">
        <Header />
        
        <div style={{ display: appState === 'results' ? 'none' : 'flex', flexDirection: 'column' }}>
          <SearchForm 
            onSearch={handleSearch} 
            isLoading={appState === 'loading'} 
          />
        </div>

        {appState === 'results' && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #eaeaea', backgroundColor: '#fff' }}>
            <button 
              onClick={handleBackToSearch}
              style={{
                background: 'none', border: 'none', color: '#1a73e8', cursor: 'pointer',
                fontWeight: '600', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '5px'
              }}
            >
              ← Back to Search / Modify
            </button>
          </div>
        )}

        <RouteResults 
          appState={appState} 
          routes={routes}
          baselineRoute={baselineRoute}
          responseType={responseType}
          responseMessage={responseMessage}
          metadata={routeMetadata}
          selectedRouteIndex={selectedRouteIndex}
          onSelectRoute={handleSelectRoute}
          onClearSelection={handleClearSelection}
        />
      </aside>
      <main className="main-content">
        <MapView 
          appState={appState} 
          baselineRoute={baselineRoute}
          routes={routes}
          responseType={responseType}
          selectedRouteIndex={selectedRouteIndex}
        />
      </main>
    </div>
  );
}

export default App;
