import React, { useState, useContext, useEffect, useRef } from 'react';
import { 
  Menu, Search, Navigation, User, Users, PhoneCall, 
  Bookmark, History, X, ChevronDown, ChevronUp, Trash2, 
  Plus, Lock, LogOut, Compass, Shield, AlertTriangle, 
  Settings, Check, MapPin, Share2, HelpCircle
} from 'lucide-react';
import { AppContext } from '../context/AppContext';
import { searchPresets } from '../utils/presets';

export default function Sidebar() {
  const {
    user,
    logout,
    trustedContacts,
    addTrustedContact,
    sendGuardianOTP,
    verifyGuardianOTPAndAdd,
    deleteTrustedContact,
    savedRoutes,
    saveCurrentRoute,
    source,
    setSource,
    destination,
    setDestination,
    activeRoutes,
    setActiveRoutes,
    selectedRoute,
    setSelectedRoute,
    hour,
    setHour,
    fetchRoutes,
    loading,
    successMsg,
    setSuccessMsg,
    isSOSActive,
    sosCountdown,
    sosLog,
    triggerSOS,
    cancelSOS,
    womenChildMode,
    setWomenChildMode,
    avoidAlleys,
    setAvoidAlleys,
    avoidDark,
    setAvoidDark,
    transportMode,
    setTransportMode,
    setShowOnboarding,
    shareLiveLocation
  } = useContext(AppContext);

  // UI Panel Toggle States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDirectionsActive, setIsDirectionsActive] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [activeDrawerTab, setActiveDrawerTab] = useState('menu'); // 'menu', 'safety', 'history', 'reports', 'auth'
  
  // Floating Center Modal States
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Input states
  const [srcQuery, setSrcQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [srcSuggestions, setSrcSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);

  // Debounce refs
  const srcTimeoutRef = useRef(null);
  const destTimeoutRef = useRef(null);

  // Auth Inputs
  const { login, register, authError, setAuthError } = useContext(AppContext);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authUsername, setAuthUsername] = useState('');

  // Trusted Contact Inputs
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isVerifyingOTP, setIsVerifyingOTP] = useState(false);
  const [enteredOTP, setEnteredOTP] = useState('');

  // Sync textual representation of coordinates
  useEffect(() => {
    if (source) setSrcQuery(source.name);
    else setSrcQuery('');
  }, [source]);

  useEffect(() => {
    if (destination) setDestQuery(destination.name);
    else setDestQuery('');
  }, [destination]);

  // Auto-close login modal when user logs in successfully
  useEffect(() => {
    if (user) {
      setShowAuthModal(false);
    }
  }, [user]);

  // Autocomplete suggest with Nominatim OSM geocoding + Local Presets
  const fetchSuggestions = async (query, setSuggestions) => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    
    // 1. Check local presets first
    const presets = searchPresets(query);
    
    // 2. Fetch OSM Nominatim in parallel for live lookups
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=4`);
      if (response.ok) {
        const data = await response.json();
        const osmResults = data.map(item => ({
          name: item.display_name.split(',').slice(0, 3).join(','),
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          city: item.type
        }));
        
        // Combine presets and OSM suggestions, avoiding duplicates
        const combined = [...presets];
        osmResults.forEach(item => {
          if (!combined.some(c => Math.abs(c.lat - item.lat) < 0.0001 && Math.abs(c.lng - item.lng) < 0.0001)) {
            combined.push(item);
          }
        });
        setSuggestions(combined);
      } else {
        setSuggestions(presets);
      }
    } catch (err) {
      setSuggestions(presets);
    }
  };

  const handleSrcChange = (e) => {
    const val = e.target.value;
    setSrcQuery(val);
    
    // Instantly show local presets without waiting
    setSrcSuggestions(searchPresets(val));
    
    // Debounce network request
    if (srcTimeoutRef.current) clearTimeout(srcTimeoutRef.current);
    srcTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(val, setSrcSuggestions);
    }, 600);
  };

  const handleDestChange = (e) => {
    const val = e.target.value;
    setDestQuery(val);
    
    // Instantly show local presets without waiting
    setDestSuggestions(searchPresets(val));

    // Debounce network request
    if (destTimeoutRef.current) clearTimeout(destTimeoutRef.current);
    destTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(val, setDestSuggestions);
    }, 600);
  };

  // Find Route
  const handleFindRoutesSubmit = (e) => {
    if (e) e.preventDefault();
    if (!source || !destination) {
      alert("Please select both a Starting point and a Destination.");
      return;
    }
    fetchRoutes(source, destination, hour, { womenChildMode, avoidAlleys, avoidDark });
  };

  // Recalculate routes if options change
  useEffect(() => {
    if (source && destination && isDirectionsActive) {
      fetchRoutes(source, destination, hour, { womenChildMode, avoidAlleys, avoidDark, transportMode });
    }
  }, [womenChildMode, avoidAlleys, avoidDark, hour, transportMode]);

  // SOS handler
  const handleSOSClick = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          triggerSOS({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          triggerSOS({ lat: 28.6139, lng: 77.2090 });
        }
      );
    } else {
      triggerSOS({ lat: 28.6139, lng: 77.2090 });
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (isRegistering) {
      await register(authUsername, authEmail, authPass);
    } else {
      await login(authEmail, authPass);
    }
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    if (!contactName || !contactPhone || !contactEmail) return;

    if (!isVerifyingOTP) {
      // Step 1: Send OTP via backend
      const res = await sendGuardianOTP(contactEmail);
      if (res.success) {
        setIsVerifyingOTP(true);
      } else {
        alert(res.msg);
      }
      return;
    }

    // Step 2: Verify OTP and save via backend
    const res = await verifyGuardianOTPAndAdd({
      name: contactName,
      phone: contactPhone,
      email: contactEmail,
      code: enteredOTP
    });

    if (res.success) {
      setContactName('');
      setContactPhone('');
      setContactEmail('');
      setEnteredOTP('');
      setIsVerifyingOTP(false);
    } else {
      alert(res.msg);
    }
  };

  const swapSourceDest = () => {
    const temp = source;
    setSource(destination);
    setDestination(temp);
  };

  // Turn-by-turn directions simulation
  const getNavSteps = () => {
    if (!selectedRoute) return [];
    const steps = [];
    if (selectedRoute.isSafest) {
      steps.push("Head onto well-lit main roads (CCTV monitored).");
      steps.push("Continue straight toward secondary road segment.");
      if (selectedRoute.analysis.averagePoliceDistanceKm < 1.5) {
        steps.push("Passing close to a Police Safety Hub.");
      }
      steps.push("Arrival at destination via verified safest route.");
    } else {
      steps.push("Head onto fastest available route.");
      steps.push("Note: Path passes through minor alleyways.");
      steps.push("Arrival at destination.");
    }
    return steps;
  };

  return (
    <>
      {/* Dynamic Visual Navigation Overlay (Google Style HUD) */}
      {isNavigating && selectedRoute && (
        <div className="nav-hud">
          <div className="nav-hud-left">
            <Compass size={24} className="animate-pulse" />
            <div className="nav-hud-text">
              <strong>Navigating Safely: </strong> 
              {selectedRoute.isSafest ? '🛡️ Women & Child Safe Mode Active' : '⚡ Fastest Route Mode'}
              <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
                Est. Time: {selectedRoute.durationMinutes} mins ({selectedRoute.distanceKm} km) | Safety: {selectedRoute.safetyScore}%
              </div>
            </div>
          </div>
          <button className="nav-exit-btn" onClick={() => setIsNavigating(false)}>
            EXIT
          </button>
        </div>
      )}

      {/* Floating Panel Container */}
      {!isNavigating && (
        <div className={`floating-panel ${isDirectionsActive ? 'directions-expanded' : ''}`} style={{ zIndex: 99999 }}>
          
          {/* A. SEARCH BAR MODE */}
          {!isDirectionsActive && (
            <div className="search-card">
              <button className="search-icon-btn" onClick={() => { setIsDrawerOpen(true); setActiveDrawerTab('menu'); }}>
                <Menu size={20} />
              </button>
              
              <input 
                type="text" 
                className="search-input" 
                placeholder="Search SafePath Maps..." 
                value={destQuery}
                onChange={handleDestChange}
                onFocus={() => setSrcSuggestions([])}
              />

              {destQuery && (
                <button className="search-icon-btn" onClick={() => { setDestination(null); setDestQuery(''); setDestSuggestions([]); }}>
                  <X size={18} />
                </button>
              )}

              <div className="search-divider" />

              {!isSOSActive && (
                <button 
                  className="search-icon-btn"
                  style={{ backgroundColor: 'var(--gm-danger)', color: 'white', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '4px', fontWeight: 'bold', fontSize: '11px', boxShadow: '0 2px 6px rgba(217, 48, 37, 0.4)' }}
                  onClick={handleSOSClick}
                  title="Trigger Emergency SOS"
                >
                  SOS
                </button>
              )}
              
              <button 
                className="directions-circle-btn" 
                title="Directions"
                onClick={() => {
                  setIsDirectionsActive(true);
                  if (destination) setDestSuggestions([]);
                }}
              >
                <Navigation size={18} fill="white" />
              </button>

              {/* Suggestions dropdown inside search */}
              {destSuggestions.length > 0 && (
                <div className="suggestions-list" style={{ position: 'absolute', top: '48px', left: 0, right: 0 }}>
                  {destSuggestions.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="suggestion-item"
                      onClick={() => {
                        setDestination(item);
                        setDestQuery(item.name);
                        setDestSuggestions([]);
                        setIsDirectionsActive(true); // Auto expand directions
                      }}
                    >
                      <MapPin size={16} color="var(--gm-text-sec)" />
                      <div>{item.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* B. DIRECTIONS PANEL MODE */}
          {isDirectionsActive && (
            <div className="directions-card" style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'var(--gm-bg)', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', border: '1px solid var(--gm-border)' }}>
              
              {/* Google Maps Blue Header */}
              <div style={{ background: 'linear-gradient(135deg, #1A73E8 0%, #1557B0 100%)', color: 'white', padding: '20px 16px 24px 16px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
                
                {/* Top Row: Transport Modes & Close */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div className="travel-modes" style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      title="Driving Mode"
                      className={`mode-icon-btn ${transportMode === 'driving' ? 'active' : ''}`}
                      onClick={() => setTransportMode('driving')}
                      style={{ 
                        background: transportMode === 'driving' ? 'rgba(255,255,255,0.22)' : 'transparent', 
                        border: 'none', 
                        borderRadius: '20px', 
                        padding: '8px 16px', 
                        color: 'white', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        fontWeight: '600',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <Navigation size={18} />
                      <span style={{ fontSize: '14px' }}>Driving</span>
                    </button>
                    <button 
                      title="Walking Mode"
                      className={`mode-icon-btn ${transportMode === 'walking' ? 'active' : ''}`}
                      onClick={() => setTransportMode('walking')}
                      style={{ 
                        background: transportMode === 'walking' ? 'rgba(255,255,255,0.22)' : 'transparent', 
                        border: 'none', 
                        borderRadius: '20px', 
                        padding: '8px 16px', 
                        color: 'white', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        fontWeight: '600',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <User size={18} />
                      <span style={{ fontSize: '14px' }}>Walking</span>
                    </button>
                    <button 
                      title="Safest Route Mode"
                      className={`mode-icon-btn ${transportMode === 'safest' ? 'safest-active active' : ''}`}
                      onClick={() => { setTransportMode('safest'); setWomenChildMode(true); }}
                      style={{ 
                        background: transportMode === 'safest' ? 'rgba(255,255,255,0.25)' : 'transparent', 
                        border: 'none', 
                        borderRadius: '20px', 
                        padding: '8px 16px', 
                        color: transportMode === 'safest' ? '#ffe082' : 'white', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        fontWeight: 'bold',
                        fontSize: '14px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <Shield size={18} />
                      <span style={{ fontSize: '14px' }}>Safest</span>
                    </button>
                  </div>

                  <button 
                    title="Close Directions"
                    onClick={() => {
                      setIsDirectionsActive(false);
                      setSelectedRoute(null);
                      setActiveRoutes([]);
                      setSource(null);
                      setDestination(null);
                      setSrcQuery('');
                      setDestQuery('');
                    }}
                    style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
                  >
                    <X size={24} />
                  </button>
                </div>

                {/* Inputs and Timeline Container */}
                <div style={{ display: 'flex', position: 'relative' }}>
                  
                  {/* Vertical Timeline Graphic */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '32px', marginRight: '8px', paddingTop: '14px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', border: '2px solid white', backgroundColor: 'transparent' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', margin: '4px 0' }}>
                      <div style={{ width: '2px', height: '3px', backgroundColor: 'rgba(255,255,255,0.6)' }} />
                      <div style={{ width: '2px', height: '3px', backgroundColor: 'rgba(255,255,255,0.6)' }} />
                      <div style={{ width: '2px', height: '3px', backgroundColor: 'rgba(255,255,255,0.6)' }} />
                      <div style={{ width: '2px', height: '3px', backgroundColor: 'rgba(255,255,255,0.6)' }} />
                      <div style={{ width: '2px', height: '3px', backgroundColor: 'rgba(255,255,255,0.6)' }} />
                    </div>
                    <MapPin size={18} color="#ea4335" fill="#ea4335" />
                  </div>
                  
                  {/* Inputs Column */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Source Input */}
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="text" 
                        style={{ 
                          width: '100%', 
                          padding: '13px 38px 13px 14px', 
                          border: 'none', 
                          borderRadius: '12px', 
                          backgroundColor: 'white', 
                          color: '#202124', 
                          fontSize: '16px', 
                          fontWeight: '500',
                          outline: 'none', 
                          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                          transition: 'all 0.2s ease'
                        }}
                        placeholder="Choose starting point..." 
                        value={srcQuery}
                        onChange={handleSrcChange}
                        onFocus={() => setDestSuggestions([])}
                      />
                      {srcQuery && (
                        <button 
                          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#5f6368', padding: '4px' }}
                          onClick={() => { setSource(null); setSrcQuery(''); setSrcSuggestions([]); }}
                        >
                          <X size={16} />
                        </button>
                      )}
                      
                      {/* Source Suggestions */}
                      {srcSuggestions.length > 0 && (
                        <div className="suggestions-list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: '4px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                          {srcSuggestions.map((item, idx) => (
                            <div 
                              key={idx} 
                              className="suggestion-item"
                              style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: '#202124', borderBottom: '1px solid #f1f3f4' }}
                              onClick={() => {
                                setSource(item);
                                setSrcQuery(item.name);
                                setSrcSuggestions([]);
                              }}
                            >
                              <MapPin size={16} color="#5f6368" />
                              <div style={{ fontSize: '14px' }}>{item.name}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Destination Input */}
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="text" 
                        style={{ 
                          width: '100%', 
                          padding: '13px 38px 13px 14px', 
                          border: 'none', 
                          borderRadius: '12px', 
                          backgroundColor: 'white', 
                          color: '#202124', 
                          fontSize: '16px', 
                          fontWeight: '500',
                          outline: 'none', 
                          boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                          transition: 'all 0.2s ease'
                        }}
                        placeholder="Choose destination..." 
                        value={destQuery}
                        onChange={handleDestChange}
                        onFocus={() => setSrcSuggestions([])}
                      />
                      {destQuery && (
                        <button 
                          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#5f6368', padding: '4px' }}
                          onClick={() => { setDestination(null); setDestQuery(''); setDestSuggestions([]); }}
                        >
                          <X size={16} />
                        </button>
                      )}
                      
                      {/* Destination Suggestions */}
                      {destSuggestions.length > 0 && (
                        <div className="suggestions-list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: '4px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
                          {destSuggestions.map((item, idx) => (
                            <div 
                              key={idx} 
                              className="suggestion-item"
                              style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: '#202124', borderBottom: '1px solid #f1f3f4' }}
                              onClick={() => {
                                setDestination(item);
                                setDestQuery(item.name);
                                setDestSuggestions([]);
                              }}
                            >
                              <MapPin size={16} color="#5f6368" />
                              <div style={{ fontSize: '14px' }}>{item.name}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Swap Button */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: '12px' }}>
                    <button style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '8px', opacity: 0.8 }} title="Swap" onClick={swapSourceDest}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <ChevronUp size={16} style={{ marginBottom: '-4px' }} />
                        <ChevronDown size={16} />
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Options bar toggle */}
              <div className="options-bar" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--gm-border)', backgroundColor: 'var(--gm-bg)' }}>
                <button className="options-btn" style={{ fontSize: '13px', fontWeight: '600', color: 'var(--gm-accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setShowOptions(!showOptions)}>
                  Options {showOptions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <div style={{ fontSize: '13px', color: 'var(--gm-text-sec)' }}>
                  Time: <strong>{hour}:00</strong>
                </div>
              </div>

              {/* Options Drawer */}
              {showOptions && (
                <div className="options-drawer" style={{ padding: '16px', backgroundColor: 'var(--gm-hover)', borderBottom: '1px solid var(--gm-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--gm-text-sec)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Route Safety Adjustments
                  </div>
                  <label className="option-checkbox-row women-child" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--gm-text)' }}>
                    <input 
                      type="checkbox" 
                      checked={womenChildMode} 
                      onChange={(e) => setWomenChildMode(e.target.checked)} 
                    />
                    <strong>🛡️ Child & Women Safety Mode</strong>
                  </label>
                  <label className="option-checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--gm-text)' }}>
                    <input 
                      type="checkbox" 
                      checked={avoidAlleys} 
                      onChange={(e) => setAvoidAlleys(e.target.checked)} 
                    />
                    <span>Avoid Isolated Alleyways</span>
                  </label>
                  <label className="option-checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--gm-text)' }}>
                    <input 
                      type="checkbox" 
                      checked={avoidDark} 
                      onChange={(e) => setAvoidDark(e.target.checked)} 
                    />
                    <span>Prioritize Well-Lit Roads</span>
                  </label>

                  {/* Hour slider */}
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--gm-text-sec)', marginBottom: '4px' }}>
                      <span>Departure Hour:</span>
                      <strong>{hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour > 12 ? `${hour-12} PM` : `${hour} AM`}</strong>
                    </div>
                    <input 
                      type="range" 
                      min="0" max="23" 
                      value={hour} 
                      onChange={(e) => setHour(parseInt(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--gm-accent)' }}
                    />
                  </div>
                </div>
              )}

              {/* Search button (manual trigger if autocomplete skipped) */}
              <div style={{ padding: '12px 16px', backgroundColor: 'var(--gm-bg)' }}>
                <button 
                  className="glass-btn" 
                  style={{ 
                    width: '100%', 
                    padding: '12px 16px', 
                    fontSize: '15px', 
                    fontWeight: 'bold',
                    background: 'linear-gradient(135deg, var(--gm-accent), #2b7de9)', 
                    color: 'white',
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(26,115,232,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'transform 0.1s ease'
                  }}
                  onClick={() => handleFindRoutesSubmit()}
                  disabled={loading}
                >
                  {loading ? (
                    'Routing...'
                  ) : (
                    <>
                      <Navigation size={16} fill="white" /> Search Safest Routes
                    </>
                  )}
                </button>
              </div>

              {/* Route Alternatives List */}
              <div className="routes-scroll-list">
                {activeRoutes.length > 0 && (
                  activeRoutes.map((route) => {
                    const isSelected = selectedRoute && selectedRoute.id === route.id;
                    return (
                      <div 
                        key={route.id} 
                        className={`route-card ${isSelected ? 'selected' : ''} ${isSelected && route.isSafest ? 'safest-selected' : ''}`}
                        onClick={() => setSelectedRoute(route)}
                      >
                        <div className="route-card-top">
                          <div>
                            <div className={`route-card-time ${route.isSafest ? 'green-label' : ''}`}>
                              {route.durationMinutes} min
                            </div>
                            <div className="route-card-dist">
                              {route.distanceKm} km • {route.isSafest ? 'Safest route' : 'Alternative'}
                            </div>
                          </div>
                          <span className={`route-badge ${route.isSafest ? 'badge-safest' : 'badge-fastest'}`}>
                            {route.isSafest ? `${route.safetyScore}% Safe` : 'Fastest'}
                          </span>
                        </div>

                        {/* Dropdown details if selected */}
                        {isSelected && (
                          <div className="route-details-drawer">
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>📹 CCTV Cameras:</span>
                              <strong>{route.analysis.cctvCoverageCount} active</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>👮 Emergency Hub:</span>
                              <strong>{route.analysis.averagePoliceDistanceKm} km</strong>
                            </div>
                            
                            {/* Boosters & Hazards */}
                            {route.analysis.boosters.map((b, i) => (
                              <div key={i} style={{ color: 'var(--gm-safe)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                <Check size={12} /> {b}
                              </div>
                            ))}
                            {route.analysis.hazards.map((h, i) => (
                              <div key={i} style={{ color: 'var(--gm-danger)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                <AlertTriangle size={12} /> {h}
                              </div>
                            ))}

                            {/* Bookmark & Navigation buttons */}
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                              <button 
                                className="glass-btn-secondary" 
                                style={{ flex: 1, padding: '6px 0', fontSize: '12px', color: 'var(--gm-text)', borderColor: 'var(--gm-border)', backgroundColor: 'var(--gm-hover)' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  saveCurrentRoute({
                                    name: `${source.name.split(',')[0]} to ${destination.name.split(',')[0]}`,
                                    sourceName: source.name,
                                    destName: destination.name,
                                    sourceCoords: { lat: source.lat, lng: source.lng },
                                    destCoords: { lat: destination.lat, lng: destination.lng },
                                    safetyScore: route.safetyScore
                                  });
                                }}
                              >
                                <Bookmark size={12} /> Bookmark
                              </button>
                              <button 
                                className="glass-btn" 
                                style={{ flex: 1, padding: '6px 0', fontSize: '12px', background: 'var(--gm-accent)' }}
                                onClick={() => {
                                  setIsNavigating(true);
                                  shareLiveLocation(route);
                                }}
                              >
                                <Navigation size={12} fill="white" /> Start
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {/* C. SLIDING HAMBURGER SIDE MENUS */}
      {isDrawerOpen && (
        <div className="side-drawer-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="side-drawer" onClick={(e) => e.stopPropagation()}>
            
            {/* Header */}
            <div className="drawer-header">
              <div className="drawer-logo-shield">
                <Shield size={22} fill="white" />
              </div>
              <div>
                <div className="drawer-title">SafePath</div>
                <div className="drawer-subtitle">Women Safety Navigator</div>
              </div>
              <button 
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gm-text-sec)' }}
                onClick={() => setIsDrawerOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Content (Simplified to Menu Only) */}
            <div className="drawer-content">
              <div className="drawer-section-title">Navigation Tools</div>
              <div className={`drawer-item ${isDirectionsActive ? 'active' : ''}`} onClick={() => { setIsDirectionsActive(true); setIsDrawerOpen(false); }}>
                <Navigation size={18} />
                <span>Go to Route Planner</span>
              </div>
              <div className="drawer-item" onClick={() => { setIsDrawerOpen(false); setShowHistoryModal(true); }}>
                <History size={18} />
                <span>Bookmarks & History</span>
              </div>
              <div className="drawer-item" onClick={() => { setIsDrawerOpen(false); setShowSafetyModal(true); }}>
                <Users size={18} />
                <span>Safety Circle (Trusted Contacts)</span>
              </div>

              <div className="drawer-item" onClick={() => { setShowOnboarding(true); setIsDrawerOpen(false); }}>
                <HelpCircle size={18} />
                <span>How to Use / Onboarding</span>
              </div>
              
              <div className="drawer-divider" />
              
              <div className="drawer-section-title">Account Profiles</div>
              {user ? (
                <>
                  <div className="drawer-item" style={{ cursor: 'default' }}>
                    <User size={18} />
                    <div>
                      <strong>{user.username}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--gm-text-sec)' }}>{user.email}</div>
                    </div>
                  </div>
                  <div className="drawer-item" onClick={() => { logout(); setIsDrawerOpen(false); }}>
                    <LogOut size={18} color="var(--gm-danger)" />
                    <span style={{ color: 'var(--gm-danger)' }}>Sign Out</span>
                  </div>
                </>
              ) : (
                <div className="drawer-item" onClick={() => { setIsDrawerOpen(false); setShowAuthModal(true); }}>
                  <Lock size={18} />
                  <span>Sign In / Sign Up</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1. SAFETY CIRCLE MODAL (Trusted Contacts) */}
      {showSafetyModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(9, 6, 22, 0.65)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={() => { setIsVerifyingOTP(false); setShowSafetyModal(false); }}>
          <div className="glass-panel animate-fade-in" style={{
            width: '100%', maxWidth: '440px', padding: '26px', position: 'relative',
            backgroundColor: 'var(--gm-bg)', color: 'var(--gm-text)', border: '1px solid var(--gm-border)', borderRadius: '24px'
          }} onClick={(e) => e.stopPropagation()}>
            
            {/* Close Button */}
            <button 
              style={{ position: 'absolute', right: '16px', top: '16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gm-text-sec)' }}
              onClick={() => { setIsVerifyingOTP(false); setShowSafetyModal(false); }}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--gm-text)' }}>
              <Users size={22} color="var(--gm-accent)" /> Safety Circle
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--gm-text-sec)', marginBottom: '20px' }}>
              These contacts will be alerted via Email during SOS emergencies.
            </p>

            {/* List Contacts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
              {trustedContacts.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--gm-text-sec)', padding: '16px', border: '1px dashed var(--gm-border)', borderRadius: '12px', textAlign: 'center' }}>
                  No guardians registered yet.
                </div>
              ) : (
                trustedContacts.map(contact => (
                  <div key={contact._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', border: '1px solid var(--gm-border)', borderRadius: '12px', fontSize: '13px', backgroundColor: 'var(--gm-hover)' }}>
                    <div>
                      <strong style={{ color: 'var(--gm-text)' }}>{contact.name}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--gm-text-sec)', marginTop: '2px' }}>📞 {contact.phone}</div>
                    </div>
                    <button 
                      style={{ background: 'none', border: 'none', color: 'var(--gm-danger)', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }}
                      onClick={() => deleteTrustedContact(contact._id)}
                      title="Remove Contact"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add Contact Form */}
            {user ? (
              <form onSubmit={handleContactSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', backgroundColor: 'var(--gm-hover)', borderRadius: '16px', border: '1px solid var(--gm-border)' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--gm-text)' }}>Register New Guardian</div>
                
                {!isVerifyingOTP ? (
                  <>
                    <input 
                      type="text" required className="directions-input" placeholder="Name" style={{ backgroundColor: 'var(--gm-bg)', height: '36px', fontSize: '13px' }}
                      value={contactName} onChange={(e) => setContactName(e.target.value)}
                    />
                    <input 
                      type="text" required className="directions-input" placeholder="Phone" style={{ backgroundColor: 'var(--gm-bg)', height: '36px', fontSize: '13px' }}
                      value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
                    />
                    <input 
                      type="email" required className="directions-input" placeholder="Email" style={{ backgroundColor: 'var(--gm-bg)', height: '36px', fontSize: '13px' }}
                      value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
                    />
                    <button type="submit" className="glass-btn" style={{ background: 'linear-gradient(135deg, var(--gm-accent), #2b7de9)', color: 'white', padding: '10px 16px', fontSize: '13px', fontWeight: 'bold', width: '100%', borderRadius: '10px', border: 'none', cursor: 'pointer', marginTop: '4px' }}>
                      Send Verification Code
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '12px', color: 'var(--gm-text-sec)', lineHeight: '1.4' }}>
                      Enter 6-digit OTP code sent to {contactEmail} (Hint: use <strong>123456</strong> if running in simulation)
                    </div>
                    <input 
                      type="text" required className="directions-input" placeholder="Enter OTP" style={{ backgroundColor: 'var(--gm-bg)', height: '38px', fontSize: '14px', textAlign: 'center', letterSpacing: '4px', fontWeight: 'bold' }}
                      value={enteredOTP} onChange={(e) => setEnteredOTP(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                      <button type="button" className="glass-btn-secondary" style={{ flex: 1, padding: '10px 14px', fontSize: '12px', borderRadius: '10px', cursor: 'pointer' }} onClick={() => { setIsVerifyingOTP(false); setEnteredOTP(''); }}>
                        Cancel
                      </button>
                      <button type="submit" className="glass-btn" style={{ flex: 1, background: 'var(--gm-safe)', color: 'white', padding: '10px 14px', fontSize: '12px', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                        Verify & Add
                      </button>
                    </div>
                  </>
                )}
              </form>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--gm-text-sec)', padding: '12px', backgroundColor: 'var(--gm-hover)', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--gm-border)' }}>
                🔒 Please <span style={{ color: 'var(--gm-accent)', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setShowSafetyModal(false); setShowAuthModal(true); }}>Sign In</span> to register emergency contacts.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. BOOKMARKS & HISTORY MODAL */}
      {showHistoryModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(9, 6, 22, 0.65)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={() => setShowHistoryModal(false)}>
          <div className="glass-panel animate-fade-in" style={{
            width: '100%', maxWidth: '440px', padding: '26px', position: 'relative',
            backgroundColor: 'var(--gm-bg)', color: 'var(--gm-text)', border: '1px solid var(--gm-border)', borderRadius: '24px'
          }} onClick={(e) => e.stopPropagation()}>
            
            {/* Close Button */}
            <button 
              style={{ position: 'absolute', right: '16px', top: '16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gm-text-sec)' }}
              onClick={() => setShowHistoryModal(false)}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--gm-text)' }}>
              <Bookmark size={22} color="var(--gm-accent)" /> Bookmarks & History
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--gm-text-sec)', marginBottom: '20px' }}>
              Your saved favorite safe routes for quick planning.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
              {savedRoutes.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--gm-text-sec)', padding: '24px', border: '1px dashed var(--gm-border)', borderRadius: '12px', textAlign: 'center' }}>
                  Saved favorite paths will show here. Get directions and click "Bookmark" to save.
                </div>
              ) : (
                savedRoutes.map(rt => (
                  <div 
                    key={rt._id}
                    className="suggestion-item"
                    style={{ 
                      padding: '12px 14px', border: '1px solid var(--gm-border)', borderRadius: '12px', 
                      cursor: 'pointer', backgroundColor: 'var(--gm-hover)', display: 'flex', flexDirection: 'column', gap: '4px',
                      transition: 'border-color 0.2s'
                    }}
                    onClick={() => {
                      setSource({ lat: rt.sourceCoords.lat, lng: rt.sourceCoords.lng, name: rt.sourceName });
                      setDestination({ lat: rt.destCoords.lat, lng: rt.destCoords.lng, name: rt.destName });
                      setIsDirectionsActive(true);
                      setShowHistoryModal(false);
                      setTimeout(() => {
                        fetchRoutes(
                          { lat: rt.sourceCoords.lat, lng: rt.sourceCoords.lng },
                          { lat: rt.destCoords.lat, lng: rt.destCoords.lng },
                          hour
                        );
                      }, 100);
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: 'var(--gm-text)', fontSize: '14px' }}>{rt.name}</strong>
                      <span className="route-badge badge-safest" style={{ fontSize: '10px', padding: '2px 6px' }}>{rt.safetyScore}% Safe</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--gm-text-sec)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>From: {rt.sourceName.split(',')[0]}</span>
                      <span>➔</span>
                      <span>To: {rt.destName.split(',')[0]}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. SIGN IN / SIGN UP MODAL (AUTH) */}
      {showAuthModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(9, 6, 22, 0.65)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={() => { setAuthError(null); setShowAuthModal(false); }}>
          <div className="glass-panel animate-fade-in" style={{
            width: '100%', maxWidth: '400px', padding: '30px', position: 'relative',
            backgroundColor: 'var(--gm-bg)', color: 'var(--gm-text)', border: '1px solid var(--gm-border)', borderRadius: '24px',
            boxShadow: 'var(--gm-shadow)'
          }} onClick={(e) => e.stopPropagation()}>
            
            {/* Close Button */}
            <button 
              style={{ position: 'absolute', right: '16px', top: '16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gm-text-sec)' }}
              onClick={() => { setAuthError(null); setShowAuthModal(false); }}
            >
              <X size={20} />
            </button>

            <div className="auth-title-container" style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '54px', height: '54px', borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--gm-accent), #4285f4)',
                boxShadow: '0 4px 12px rgba(66, 133, 244, 0.35)', marginBottom: '12px'
              }}>
                <Shield size={26} color="white" fill="white" />
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0', color: 'var(--gm-text)', letterSpacing: '-0.5px' }}>
                {isRegistering ? 'Create Account' : 'Welcome Back'}
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--gm-text-sec)', margin: '6px 0 0 0' }}>
                {isRegistering ? 'Join SafePath to secure your routes' : 'Sign in to access your saved places'}
              </p>
            </div>

            {/* Modern Tab Selector */}
            <div style={{
              display: 'flex', background: 'var(--gm-hover)', borderRadius: '10px', padding: '4px',
              marginBottom: '20px', border: '1px solid var(--gm-border)'
            }}>
              <button
                type="button"
                style={{
                  flex: 1, padding: '10px', fontSize: '13px', fontWeight: '600', border: 'none', borderRadius: '8px',
                  background: !isRegistering ? 'var(--gm-bg)' : 'transparent',
                  color: !isRegistering ? 'var(--gm-accent)' : 'var(--gm-text-sec)',
                  boxShadow: !isRegistering ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer', transition: 'all 0.2s ease'
                }}
                onClick={() => setIsRegistering(false)}
              >
                Sign In
              </button>
              <button
                type="button"
                style={{
                  flex: 1, padding: '10px', fontSize: '13px', fontWeight: '600', border: 'none', borderRadius: '8px',
                  background: isRegistering ? 'var(--gm-bg)' : 'transparent',
                  color: isRegistering ? 'var(--gm-accent)' : 'var(--gm-text-sec)',
                  boxShadow: isRegistering ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer', transition: 'all 0.2s ease'
                }}
                onClick={() => setIsRegistering(true)}
              >
                Sign Up
              </button>
            </div>

            {authError && (
              <div style={{ 
                padding: '12px 14px', color: 'var(--gm-danger)', backgroundColor: 'rgba(217,48,37,0.08)', 
                border: '1px solid rgba(217,48,37,0.2)', borderRadius: '8px', fontSize: '12px', marginBottom: '16px',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{authError}</span>
              </div>
            )}

            <form className="auth-form-container" onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {isRegistering && (
                <div style={{ position: 'relative' }}>
                  <User size={18} color="var(--gm-text-sec)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input 
                    type="text" required placeholder="Choose Username" 
                    style={{ 
                      width: '100%', padding: '12px 14px 12px 42px', backgroundColor: 'var(--gm-hover)',
                      border: '1px solid var(--gm-border)', borderRadius: '10px', fontSize: '14px', color: 'var(--gm-text)',
                      outline: 'none', transition: 'border-color 0.2s'
                    }}
                    value={authUsername} onChange={(e) => setAuthUsername(e.target.value)}
                  />
                </div>
              )}

              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', color: 'var(--gm-text-sec)', fontSize: '16px', fontWeight: 'bold' }}>@</span>
                <input 
                  type="email" required placeholder="Email Address" 
                  style={{ 
                    width: '100%', padding: '12px 14px 12px 42px', backgroundColor: 'var(--gm-hover)',
                    border: '1px solid var(--gm-border)', borderRadius: '10px', fontSize: '14px', color: 'var(--gm-text)',
                    outline: 'none', transition: 'border-color 0.2s'
                  }}
                  value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>

              <div style={{ position: 'relative' }}>
                <Lock size={18} color="var(--gm-text-sec)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type="password" required placeholder="Password" 
                  style={{ 
                    width: '100%', padding: '12px 14px 12px 42px', backgroundColor: 'var(--gm-hover)',
                    border: '1px solid var(--gm-border)', borderRadius: '10px', fontSize: '14px', color: 'var(--gm-text)',
                    outline: 'none', transition: 'border-color 0.2s'
                  }}
                  value={authPass} onChange={(e) => setAuthPass(e.target.value)}
                />
              </div>

              <button 
                type="submit" className="glass-btn" 
                style={{ 
                  background: 'linear-gradient(135deg, var(--gm-accent), #2b7de9)', color: 'white', 
                  padding: '14px', fontSize: '14px', fontWeight: 'bold', width: '100%',
                  borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(26, 115, 232, 0.2)',
                  cursor: 'pointer', marginTop: '8px', transition: 'transform 0.1s ease'
                }}
              >
                {isRegistering ? 'Create Secure Account' : 'Secure Sign In'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Global Toast Success Message */}
      {successMsg && (
        <div className="gm-toast">
          <span>{successMsg}</span>
          <span className="gm-toast-accent">✓</span>
        </div>
      )}

      {/* D. SOS FLOATING TRIGGER OVERLAY */}
      {isSOSActive && sosCountdown > 0 && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: 'white'
        }}>
          <h2 style={{ fontSize: '28px', color: 'var(--gm-danger)', marginBottom: '8px', fontWeight: 'bold' }}>
            EMERGENCY SOS INITIATED
          </h2>
          <p style={{ fontSize: '15px', color: '#dadce0', marginBottom: '24px' }}>
            Alerting your guardians in:
          </p>
          <div style={{
            fontSize: '96px', fontWeight: 'bold', border: '6px solid var(--gm-danger)',
            width: '180px', height: '180px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '32px', animation: 'sos-pulse 1s infinite'
          }}>
            {sosCountdown}
          </div>
          <button 
            className="glass-btn" 
            style={{ backgroundColor: 'var(--gm-danger)', color: 'white', padding: '14px 28px', fontSize: '16px', borderRadius: '24px' }}
            onClick={cancelSOS}
          >
            CANCEL EMERGENCY ALERT
          </button>
        </div>
      )}

      {/* Active SOS Deactivation Button */}
      {isSOSActive && sosCountdown === 0 && (
        <div className="floating-sos-overlay" style={{ zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: 'var(--gm-danger)', color: 'white', padding: '8px 16px', borderRadius: '16px', fontSize: '14px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(217, 48, 37, 0.4)', animation: 'sos-pulse 1s infinite' }}>
            📍 Live Location Shared via Email
          </div>
          <button 
            className="glass-btn" 
            style={{ backgroundColor: 'white', color: 'var(--gm-danger)', border: '2px solid var(--gm-danger)', padding: '12px 20px', borderRadius: '24px', boxShadow: '0 4px 15px rgba(217, 48, 37, 0.6)', fontWeight: 'bold' }}
            onClick={cancelSOS}
            title="Deactivate SOS"
          >
            🛑 DEACTIVATE ALARM
          </button>
        </div>
      )}

      {/* Removed old floating SOS button as it is now in the search bar */}
    </>
  );
}
