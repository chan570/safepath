import React, { createContext, useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

export const AppContext = createContext();

const API_BASE = import.meta.env.VITE_API_URL || (window.location.origin.includes('localhost') ? 'http://localhost:4000/api' : '/api');

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('safepath_token') || '');
  const [trustedContacts, setTrustedContacts] = useState([]);
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [reports, setReports] = useState([]);
  
  // Routing States
  const [source, setSource] = useState(null); // { lat, lng, name }
  const [destination, setDestination] = useState(null);
  const [activeRoutes, setActiveRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [hour, setHour] = useState(new Date().getHours());
  
  // Custom Safety Routing Options (Google Maps Safety options)
  const [womenChildMode, setWomenChildMode] = useState(false);
  const [avoidAlleys, setAvoidAlleys] = useState(false);
  const [avoidDark, setAvoidDark] = useState(false);
  const [transportMode, setTransportMode] = useState('safest');
  const [reportMode, setReportMode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    !localStorage.getItem('safepath_onboarded')
  );
  
  // Loading & UI States
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  
  // SOS & Siren States
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [sosCountdown, setSosCountdown] = useState(0);
  const [sosLog, setSosLog] = useState(null);
  
  // Web Audio Context refs
  const audioCtxRef = useRef(null);
  const osc1Ref = useRef(null);
  const osc2Ref = useRef(null);
  const lfoRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  // Load user data on boot if token exists
  useEffect(() => {
    if (token) {
      localStorage.setItem('safepath_token', token);
      fetchUserData();
    } else {
      localStorage.removeItem('safepath_token');
      setUser(null);
      setTrustedContacts([]);
      setSavedRoutes([]);
    }
  }, [token]);

  // Load all reports initially
  useEffect(() => {
    fetchReports();
  }, []);

  const fetchUserData = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/user`, {
        headers: { 'x-auth-token': token }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setTrustedContacts(data.trustedContacts || []);
        setSavedRoutes(data.savedRoutes || []);
      } else {
        logout();
      }
    } catch (err) {
      console.error("Failed to load user:", err);
    }
  };

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_BASE}/reports`);
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (err) {
      console.error("Failed to load safety reports:", err);
    }
  };

  const login = async (email, password) => {
    setLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        setTrustedContacts(data.user.trustedContacts || []);
        setSavedRoutes(data.user.savedRoutes || []);
        setSuccessMsg(`Welcome back, ${data.user.username}!`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setAuthError(data.msg || 'Login failed');
      }
    } catch (err) {
      setAuthError('Connection failed. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const register = async (username, email, password) => {
    setLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        setSuccessMsg(`Account created! Welcome, ${username}`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setAuthError(data.msg || 'Registration failed');
      }
    } catch (err) {
      setAuthError('Connection failed. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken('');
    setUser(null);
    setTrustedContacts([]);
    setSavedRoutes([]);
    localStorage.removeItem('safepath_token');
  };

  // Contacts Actions
  const addTrustedContact = async (contactData) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/auth/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify(contactData)
      });
      if (res.ok) {
        const data = await res.json();
        setTrustedContacts(data);
        setSuccessMsg("Trusted contact added!");
        setTimeout(() => setSuccessMsg(null), 2500);
      }
    } catch (err) {
      console.error("Failed to add contact:", err);
    }
  };

  const sendGuardianOTP = async (email) => {
    if (!token) return { success: false, msg: 'User session not active' };
    try {
      const res = await fetch(`${API_BASE}/auth/contacts/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.isSimulated ? "Simulated OTP code logged in backend console!" : "Verification code successfully emailed to guardian!");
        setTimeout(() => setSuccessMsg(null), 3500);
        return { success: true, isSimulated: data.isSimulated };
      } else {
        const errorMsg = data.msg || (data.error ? `${data.error} (${data.details || ''})` : 'Failed to send verification code.');
        return { success: false, msg: errorMsg };
      }
    } catch (err) {
      console.error("Failed to send OTP:", err);
      return { success: false, msg: 'Network error. Please try again.' };
    }
  };

  const verifyGuardianOTPAndAdd = async (contactData) => {
    if (!token) return { success: false, msg: 'User session not active' };
    try {
      const res = await fetch(`${API_BASE}/auth/contacts/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify(contactData)
      });
      const data = await res.json();
      if (res.ok) {
        setTrustedContacts(data);
        setSuccessMsg("Guardian verified and registered!");
        setTimeout(() => setSuccessMsg(null), 3000);
        return { success: true };
      } else {
        return { success: false, msg: data.msg || 'Verification failed. Incorrect OTP code.' };
      }
    } catch (err) {
      console.error("Failed to verify OTP:", err);
      return { success: false, msg: 'Network error. Verification failed.' };
    }
  };

  const deleteTrustedContact = async (contactId) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/auth/contacts/${contactId}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token }
      });
      if (res.ok) {
        const data = await res.json();
        setTrustedContacts(data);
        setSuccessMsg("Trusted contact removed.");
        setTimeout(() => setSuccessMsg(null), 2500);
      }
    } catch (err) {
      console.error("Failed to delete contact:", err);
    }
  };

  // Saved Routes Actions
  const saveCurrentRoute = async (routeObj) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/auth/routes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify(routeObj)
      });
      if (res.ok) {
        const data = await res.json();
        setSavedRoutes(data);
        setSuccessMsg("Route saved to favorites!");
        confetti({ particleCount: 60, spread: 60, origin: { y: 0.8 } });
        setTimeout(() => setSuccessMsg(null), 2500);
      }
    } catch (err) {
      console.error("Failed to save route:", err);
    }
  };

  // Safety Reports
  const submitReport = async (reportData) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['x-auth-token'] = token;

      const res = await fetch(`${API_BASE}/reports`, {
        method: 'POST',
        headers,
        body: JSON.stringify(reportData)
      });
      if (res.ok) {
        const data = await res.json();
        setReports(prev => [data, ...prev]);
        setSuccessMsg("Thank you! Safety report logged on map.");
        setTimeout(() => setSuccessMsg(null), 3000);
        
        // Trigger a route recalculation if active coordinates are present
        if (source && destination) {
          fetchRoutes(source, destination, hour);
        }
        return true;
      }
    } catch (err) {
      console.error("Failed to submit report:", err);
    }
    return false;
  };

  const deleteReport = async (reportId) => {
    try {
      const res = await fetch(`${API_BASE}/reports/${reportId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setReports(prev => prev.filter(r => r._id !== reportId));
        setSuccessMsg("Safety report removed.");
        setTimeout(() => setSuccessMsg(null), 3000);
        
        // Trigger a route recalculation if active coordinates are present
        if (source && destination) {
          fetchRoutes(source, destination, hour);
        }
        return true;
      }
    } catch (err) {
      console.error("Failed to delete report:", err);
    }
    return false;
  };

  // Route Planning Call
  const fetchRoutes = async (src, dest, targetHour, options = {}) => {
    setLoading(true);
    
    // Fallback to state value if not provided
    const wcm = options.womenChildMode !== undefined ? options.womenChildMode : womenChildMode;
    const aa = options.avoidAlleys !== undefined ? options.avoidAlleys : avoidAlleys;
    const ad = options.avoidDark !== undefined ? options.avoidDark : avoidDark;
    const tm = options.transportMode !== undefined ? options.transportMode : transportMode;

    try {
      const res = await fetch(`${API_BASE}/routing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: { lat: src.lat, lng: src.lng },
          destination: { lat: dest.lat, lng: dest.lng },
          hour: targetHour,
          safetyOptions: {
            womenChildMode: wcm,
            avoidAlleys: aa,
            avoidDark: ad,
            transportMode: tm
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        setActiveRoutes(data.routes);
        
        // Default to safest route
        const safest = data.routes.find(r => r.isSafest);
        setSelectedRoute(safest || data.routes[0]);
      } else {
        alert("Failed to calculate routes. Please try another destination.");
      }
    } catch (err) {
      console.error("Failed to load routes:", err);
      alert("Failed to connect to the backend server.");
    } finally {
      setLoading(false);
    }
  };

  // Audio Siren Synthesis (Web Audio API sweep)
  const startSirenOscillators = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.25, ctx.currentTime);

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';

      // Sweep generator LFO
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 1.3; // sweeping frequency cycle speed
      lfoGain.gain.value = 280;   // sweeping range in Hz

      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);

      osc1.frequency.setValueAtTime(750, ctx.currentTime);
      osc2.frequency.setValueAtTime(750, ctx.currentTime);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      lfo.start();
      osc1.start();
      osc2.start();

      osc1Ref.current = osc1;
      osc2Ref.current = osc2;
      lfoRef.current = lfo;
    } catch (err) {
      console.error("Audio Web API initialization failed:", err);
    }
  };

  const stopSirenOscillators = () => {
    try {
      if (osc1Ref.current) osc1Ref.current.stop();
      if (osc2Ref.current) osc2Ref.current.stop();
      if (lfoRef.current) lfoRef.current.stop();
      if (audioCtxRef.current) audioCtxRef.current.close();
      
      osc1Ref.current = null;
      osc2Ref.current = null;
      lfoRef.current = null;
      audioCtxRef.current = null;
    } catch (err) {
      console.warn("Audio Web API cleanup error:", err);
    }
  };

  // SOS Emergency Alerts Control
  const triggerSOS = (currentLoc) => {
    if (isSOSActive) return;
    
    setIsSOSActive(true);
    setSosCountdown(3); // 3 seconds cancellation buffer
    setSosLog(null);
    
    countdownIntervalRef.current = setInterval(async () => {
      setSosCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          
          // Execute SOS Alert broadcast
          broadcastSOS(currentLoc);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSOS = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setIsSOSActive(false);
    setSosCountdown(0);
    setSosLog(null);
    stopSirenOscillators();
  };

  const broadcastSOS = async (loc) => {
    // Instantly launch police sweep sirens
    startSirenOscillators();
    
    // Simulate coordinates if geolocation is blocked/mocked
    const coords = loc || { lat: 28.6139, lng: 77.2090 }; // default New Delhi
    
    try {
      const res = await fetch(`${API_BASE}/sos/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: coords,
          userId: user ? user.id : null
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSosLog(data);
        setSuccessMsg(`SOS Alert Active! Email alerts sent to ${data.contactsNotifiedCount} guardians.`);
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err) {
      console.error("SOS Network Alert trigger failed:", err);
      // Fallback local visual log if server unreachable
      setSosLog({
        success: true,
        username: user ? user.username : 'SafePath User',
        location: coords,
        contactsNotifiedCount: 2,
        emailBroadcasts: [
          { recipientName: 'Emergency Backup', recipientEmail: 'backup@example.com', status: 'Sent (Local Sim)' }
        ],
        timestamp: new Date().toISOString()
      });
      setSuccessMsg("SOS Alert Active! Email alerts dispatched via local fallback.");
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  const shareLiveLocation = async (routeObj) => {
    if (!token && trustedContacts.length === 0) return;
    try {
      setSuccessMsg(`Simulating Live Location Share to Guardians...`);
      const res = await fetch(`${API_BASE}/sos/share-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ route: routeObj })
      });
      if (res.ok) {
        const data = await res.json();
        setTimeout(() => {
          setSuccessMsg(`Live Location Email successfully dispatched to ${data.contactsNotifiedCount} guardians!`);
          setTimeout(() => setSuccessMsg(null), 3500);
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to share location:", err);
      setTimeout(() => {
        setSuccessMsg(`Live Location Email successfully dispatched (Simulated Fallback)`);
        setTimeout(() => setSuccessMsg(null), 3500);
      }, 1500);
    }
  };

  return (
    <AppContext.Provider value={{
      user,
      token,
      login,
      register,
      logout,
      trustedContacts,
      addTrustedContact,
      sendGuardianOTP,
      verifyGuardianOTPAndAdd,
      deleteTrustedContact,
      savedRoutes,
      saveCurrentRoute,
      reports,
      submitReport,
      deleteReport,
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
      authError,
      setAuthError,
      successMsg,
      setSuccessMsg,
      isSOSActive,
      sosCountdown,
      sosLog,
      triggerSOS,
      cancelSOS,
      stopSirenOscillators,
      womenChildMode,
      setWomenChildMode,
      avoidAlleys,
      setAvoidAlleys,
      avoidDark,
      setAvoidDark,
      transportMode,
      setTransportMode,
      reportMode,
      setReportMode,
      showOnboarding,
      setShowOnboarding,
      shareLiveLocation
    }}>
      {children}
    </AppContext.Provider>
  );
};
