export const CITY_PRESETS = [
  // Delhi Presets
  { name: "Connaught Place, New Delhi", lat: 28.6304, lng: 77.2177, city: "Delhi" },
  { name: "India Gate, New Delhi", lat: 28.6129, lng: 77.2295, city: "Delhi" },
  { name: "Delhi University North Campus", lat: 28.6903, lng: 77.2075, city: "Delhi" },
  { name: "Saket Metro Station, New Delhi", lat: 28.5222, lng: 77.2007, city: "Delhi" },
  { name: "Noida Sector 62, NCR", lat: 28.6219, lng: 77.3639, city: "Delhi" },
  { name: "Indira Gandhi International Airport (DEL)", lat: 28.5562, lng: 77.1000, city: "Delhi" },
  
  // Mumbai Presets
  { name: "Gateway of India, Colaba, Mumbai", lat: 18.9220, lng: 72.8347, city: "Mumbai" },
  { name: "Marine Drive Promenade, Mumbai", lat: 18.9436, lng: 72.8231, city: "Mumbai" },
  { name: "Juhu Beach, Mumbai", lat: 19.1001, lng: 72.8268, city: "Mumbai" },
  { name: "Bandra Kurla Complex (BKC), Mumbai", lat: 19.0607, lng: 72.8634, city: "Mumbai" },
  { name: "Chhatrapati Shivaji Maharaj Terminus (CSMT)", lat: 18.9400, lng: 72.8354, city: "Mumbai" },

  // San Francisco Presets
  { name: "Union Square, San Francisco", lat: 37.7879, lng: -122.4074, city: "San Francisco" },
  { name: "Fisherman's Wharf, San Francisco", lat: 37.8080, lng: -122.4177, city: "San Francisco" },
  { name: "Golden Gate Park, San Francisco", lat: 37.7694, lng: -122.4862, city: "San Francisco" },
  { name: "Mission District, San Francisco", lat: 37.7599, lng: -122.4148, city: "San Francisco" },
  { name: "SFO International Airport", lat: 37.6213, lng: -122.3790, city: "San Francisco" },
  
  // Punjab & Northern India Presets
  { name: "Chandigarh, India", lat: 30.7333, lng: 76.7794, city: "Chandigarh" },
  { name: "Jalandhar, Punjab, India", lat: 31.3260, lng: 75.5762, city: "Jalandhar" },
  { name: "Ludhiana, Punjab, India", lat: 30.9010, lng: 75.8573, city: "Ludhiana" },
  { name: "Amritsar, Punjab, India", lat: 31.6340, lng: 74.8723, city: "Amritsar" },
  { name: "Patiala, Punjab, India", lat: 30.3398, lng: 76.3869, city: "Patiala" },
  { name: "Bathinda, Punjab, India", lat: 30.2110, lng: 74.9455, city: "Bathinda" },
  { name: "Mohali, Punjab, India", lat: 30.7046, lng: 76.7179, city: "Mohali" }
];

export const searchPresets = (query) => {
  if (!query || query.trim().length < 2) return [];
  const lcQuery = query.toLowerCase();
  return CITY_PRESETS.filter(item => 
    item.name.toLowerCase().includes(lcQuery) || 
    item.city.toLowerCase().includes(lcQuery)
  );
};
