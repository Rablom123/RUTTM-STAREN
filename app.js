/* ==========================================================================
   RUTTMÄSTAREN - APPLICATION ENGINE (app.js)
   ========================================================================== */

// Application State
const state = {
  warehouse: null, // { address: '', lat: 0, lng: 0 }
  stops: [],       // Array of: { id: '', address: '', lat: 0, lng: 0, duration: 4, status: 'pending'|'delivered'|'failed', isPinnedStart: false, isPinnedEnd: false }
  routeOrder: [],  // Array of stop indices (representing sequence including warehouse)
  routeGeometry: null,
  routeDistance: 0, // meters
  routeDuration: 0, // seconds
  globalDuration: 4, // default minutes per stop
  hudActiveIndex: -1, // active stop index in HUD mode
  isHUDActive: false,
  defaultCity: '',     // Default city to append to typed or scanned addresses
  lockWarehouseStart: true,
  lockWarehouseEnd: true,
  lastlistaLoadedStops: {} // map of stopId -> boolean
};

// Leaflet Map Globals
let map = null;
let routeLine = null;
let markersGroup = null;

// OCR Globals
let ocrWorker = null;

// ==========================================================================
// 1. INITIALIZATION & LOCALSTORAGE
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide Icons
  lucide.createIcons();
  
  // Load State from LocalStorage
  loadStateFromStorage();
  
  // Initialize Map
  initMap();
  
  // Setup Event Listeners
  setupEventListeners();
  
  // Pre-load OCR and other components removed
  
  // Render Initial View
  renderWarehouse();
  renderStopsList();
  renderLastlista();
  updateDashboard();
  
  // Set checked states for warehouse toggles
  document.getElementById('lock-wh-start').checked = state.lockWarehouseStart;
  document.getElementById('lock-wh-end').checked = state.lockWarehouseEnd;
  
  // Real-time clock update: refresh Sluttid/ETA stats every 30 seconds automatically
  setInterval(updateDashboard, 30000);
  
  // If we already have stops, plot them on map
  if (state.stops.length > 0) {
    calculateRoute(false); // get cached/existing route drawn
  }
});

// Load state from local storage
function loadStateFromStorage() {
  const savedWarehouse = localStorage.getItem('rm_warehouse');
  if (savedWarehouse) {
    state.warehouse = JSON.parse(savedWarehouse);
  }
  
  const savedStops = localStorage.getItem('rm_stops');
  if (savedStops) {
    state.stops = JSON.parse(savedStops).map(s => ({
      ...s,
      isPinnedStart: !!s.isPinnedStart,
      isPinnedEnd: !!s.isPinnedEnd
    }));
  }
  
  const savedGlobalDuration = localStorage.getItem('rm_global_duration');
  if (savedGlobalDuration) {
    state.globalDuration = parseInt(savedGlobalDuration, 10);
    document.getElementById('global-duration').value = state.globalDuration;
    document.getElementById('stop-duration-input').value = state.globalDuration;
  }
  
  const savedDefaultCity = localStorage.getItem('rm_default_city');
  if (savedDefaultCity) {
    state.defaultCity = savedDefaultCity;
    document.getElementById('default-city-input').value = state.defaultCity;
  }

  const savedLockWhStart = localStorage.getItem('rm_lock_wh_start');
  if (savedLockWhStart !== null) {
    state.lockWarehouseStart = savedLockWhStart === 'true';
  }
  
  const savedLockWhEnd = localStorage.getItem('rm_lock_wh_end');
  if (savedLockWhEnd !== null) {
    state.lockWarehouseEnd = savedLockWhEnd === 'true';
  }
  
  const savedLastlistaLoaded = localStorage.getItem('rm_lastlista_loaded');
  if (savedLastlistaLoaded) {
    state.lastlistaLoadedStops = JSON.parse(savedLastlistaLoaded);
  }
}

// Save state to local storage
function saveStateToStorage() {
  localStorage.setItem('rm_warehouse', JSON.stringify(state.warehouse));
  localStorage.setItem('rm_stops', JSON.stringify(state.stops));
  localStorage.setItem('rm_global_duration', state.globalDuration.toString());
  localStorage.setItem('rm_default_city', state.defaultCity);
  localStorage.setItem('rm_lock_wh_start', state.lockWarehouseStart.toString());
  localStorage.setItem('rm_lock_wh_end', state.lockWarehouseEnd.toString());
  localStorage.setItem('rm_lastlista_loaded', JSON.stringify(state.lastlistaLoadedStops));
}

// ==========================================================================
// 2. INTERACTIVE MAP FUNCTIONS (LEAFLET.JS)
// ==========================================================================
function initMap() {
  // Start centered on Sweden
  const startLat = state.warehouse ? state.warehouse.lat : 59.3293;
  const startLng = state.warehouse ? state.warehouse.lng : 18.0686;
  const startZoom = state.warehouse ? 13 : 5;
  
  map = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([startLat, startLng], startZoom);
  
  // Custom dark-mode voyager tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(map);
  
  // Add zoom control at bottom-right
  L.control.zoom({
    position: 'bottomright'
  }).addTo(map);
  
  markersGroup = L.layerGroup().addTo(map);
}

// Generate premium custom numbered map pins
function createCustomMarker(number, type, tooltipText) {
  let numberContent = number;
  if (type === 'warehouse') numberContent = '🏠';
  
  const icon = L.divIcon({
    className: `custom-map-marker ${type}`,
    html: `
      <div class="custom-marker-pin"></div>
      <span class="custom-marker-number">${numberContent}</span>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });
  
  return icon;
}

// Refresh all pins on the map
function updateMapMarkers() {
  if (!map || !markersGroup) return;
  markersGroup.clearLayers();
  
  // 1. Plot Warehouse if available
  if (state.warehouse) {
    const whMarker = L.marker([state.warehouse.lat, state.warehouse.lng], {
      icon: createCustomMarker('H', 'warehouse')
    }).bindPopup(`<strong>Lager (Start/Mål)</strong><br>${state.warehouse.address}`);
    
    markersGroup.addLayer(whMarker);
  }
  
  // 2. Plot all stops in their CURRENT order
  state.stops.forEach((stop, index) => {
    const markerType = stop.status; // pending, delivered, failed
    const stopNumber = index + 1;
    
    const stopMarker = L.marker([stop.lat, stop.lng], {
      icon: createCustomMarker(stopNumber, markerType)
    }).bindPopup(`
      <strong>Stopp ${stopNumber}: ${stop.address}</strong><br>
      Tid: ${stop.duration} min<br>
      Status: ${getStatusName(stop.status)}
    `);
    
    markersGroup.addLayer(stopMarker);
  });
}

function getStatusName(status) {
  if (status === 'delivered') return '<span class="text-success">Levererad ✅</span>';
  if (status === 'failed') return '<span class="text-danger">Misslyckades ❌</span>';
  return '<span class="text-primary">Väntar ⏳</span>';
}

// Draw the route path line
function drawRoutePath(coordinates) {
  if (!map) return;
  
  // Remove existing line if any
  if (routeLine) {
    map.removeLayer(routeLine);
  }
  
  if (!coordinates || coordinates.length === 0) return;
  
  // Draw thick, glowing path
  routeLine = L.polyline(coordinates, {
    color: '#3B82F6',
    weight: 6,
    opacity: 0.85,
    lineJoin: 'round',
    shadowBlur: 10,
    shadowColor: '#3B82F6',
    className: 'route-polyline'
  }).addTo(map);
  
  // Add CSS animation/glowing properties if browser supports it
  const pathElement = routeLine.getElement();
  if (pathElement) {
    pathElement.style.filter = 'drop-shadow(0px 0px 8px rgba(59, 130, 246, 0.6))';
  }
}

// Center map to cover all stops + warehouse
function fitMapBounds() {
  if (!map) return;
  
  const points = [];
  if (state.warehouse) {
    points.push([state.warehouse.lat, state.warehouse.lng]);
  }
  
  state.stops.forEach(s => points.push([s.lat, s.lng]));
  
  if (points.length > 0) {
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [50, 50] });
  }
}

// ==========================================================================
// 3. GEOCODING & AUTOCOMPLETE (NOMINATIM API)
// ==========================================================================
// Helper function to format Swedish address and preserve street/house numbers
function formatSwedishAddress(item, originalQuery) {
  const addr = item.address || {};
  
  // Extract house number from original query (e.g. "Sveavägen 44" -> "44", "Kungsgatan 12 B" -> "12 B")
  const queryNumberRegex = /\b(\d+\s*[a-zåäö]?)\b/i;
  let originalNumber = "";
  if (originalQuery) {
    const numMatch = originalQuery.match(queryNumberRegex);
    if (numMatch) {
      originalNumber = numMatch[1].trim();
    }
  }
  
  let road = addr.road || addr.pedestrian || addr.footway || addr.cycleway || "";
  let houseNumber = addr.house_number || originalNumber || ""; // Fallback to user's originally typed number if API returns undefined
  let city = addr.city || addr.town || addr.village || addr.suburb || addr.municipality || "";
  
  if (road) {
    let cleanRoad = road;
    
    // If we have a house number and it's not already in the street name string, append it!
    if (houseNumber && !cleanRoad.toLowerCase().includes(houseNumber.toLowerCase())) {
      cleanRoad = `${cleanRoad} ${houseNumber}`;
    }
    
    // Capitalize words nicely
    cleanRoad = cleanRoad.toLowerCase().replace(/\b[a-zåäöéèüïäåæø]/gi, char => char.toUpperCase());
    
    if (city) {
      const cleanCity = city.toLowerCase().replace(/\b[a-zåäöéèüïäåæø]/gi, char => char.toUpperCase());
      // Prevent duplicating city name if it's already part of the road string
      if (cleanRoad.toLowerCase().includes(cleanCity.toLowerCase())) {
        return cleanRoad;
      }
      return `${cleanRoad}, ${cleanCity}`;
    }
    return cleanRoad;
  }
  
  // Fallback split method if no road was parsed, but inject house number if missing
  let fallback = item.display_name.split(',').slice(0, 3).join(',').trim();
  if (originalNumber && !fallback.toLowerCase().includes(originalNumber.toLowerCase())) {
    const parts = fallback.split(',');
    parts[0] = `${parts[0].trim()} ${originalNumber}`;
    fallback = parts.join(', ');
  }
  
  // Clean capitalization
  return fallback.toLowerCase().replace(/\b[a-zåäöéèüïäåæø]/gi, char => char.toUpperCase());
}

async function searchAddress(query, isStop = false) {
  if (!query || query.trim().length < 3) return [];
  
  let searchQuery = query;
  if (isStop && state.defaultCity && !query.toLowerCase().includes(state.defaultCity.toLowerCase())) {
    searchQuery = `${query}, ${state.defaultCity}`;
  }
  
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&addressdetails=1&countrycodes=se`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RuttPlanerarenBudbil/1.0 (ruttmaster@example.com)'
      }
    });
    
    if (!response.ok) throw new Error('Geokodnings-fel');
    const data = await response.json();
    
    return data.map(item => {
      const formatted = formatSwedishAddress(item, query);
      return {
        address: formatted,
        fullAddress: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon)
      };
    });
  } catch (error) {
    console.error('Nominatim Geocoding Error:', error);
    return [];
  }
}

// ==========================================================================
// 4. TSP ROUTE OPTIMIZATION (2-OPT ALGORITHM)
// ============================// Fetch current GPS location with high accuracy and a 5-second timeout fallback
function getCurrentGPSPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.warn("GPS stöds inte av din webbläsare.");
      resolve(null);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
      },
      (err) => {
        console.warn("GPS-hämtning misslyckades eller nekades:", err);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  });
}

// Solve Traveling Salesperson Problem (TSP) using OSRM Distance Matrix starting from GPS position
async function calculateRoute(shouldOptimize = true) {
  if (state.stops.length === 0) {
    // Just show warehouse
    updateMapMarkers();
    if (routeLine) map.removeLayer(routeLine);
    state.routeDistance = 0;
    state.routeDuration = 0;
    updateDashboard();
    renderLastlista();
    return;
  }

  const showLoader = (show) => {
    const btn = document.getElementById('optimize-route-btn');
    if (btn) {
      if (show) {
        btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:8px;"></div> OPTIMERAR...`;
        btn.disabled = true;
      } else {
        btn.innerHTML = `<i data-lucide="sparkles"></i> OPTIMERA SNABBASTE RUTT`;
        btn.disabled = false;
        lucide.createIcons();
      }
    }
  };

  showLoader(true);

  try {
    // 1. Determine startPoint based on settings
    let startPoint = null;
    if (shouldOptimize && !state.lockWarehouseStart) {
      startPoint = await getCurrentGPSPosition();
      if (startPoint) {
        console.log("GPS-position hämtad framgångsrikt för start:", startPoint);
      }
    }
    
    // Fallback to warehouse if GPS failed or not optimizing or lock start is active
    if (!startPoint) {
      startPoint = state.warehouse;
    }

    if (!startPoint) {
      alert("Hittade ingen startposition! Vänligen ställ in lagrets adress eller tillåt GPS-delning i webbläsaren.");
      showLoader(false);
      return;
    }

    // Determine endPoint
    const endPoint = state.lockWarehouseEnd ? state.warehouse : null;

    // If we only have 1 stop, routing is simple: StartPoint -> Stop 1 -> EndPoint (if exists)
    if (state.stops.length === 1) {
      const routeSeq = [startPoint, state.stops[0]];
      if (endPoint) routeSeq.push(endPoint);
      await fetchDirectRoute(routeSeq);
      showLoader(false);
      renderLastlista();
      return;
    }

    // Determine stop order
    if (shouldOptimize && state.stops.length > 1) {
      // 2. Identify pinned stops and free stops
      const pinnedStartStop = state.stops.find(s => s.isPinnedStart);
      const pinnedEndStop = state.stops.find(s => s.isPinnedEnd);
      const freeStops = state.stops.filter(s => !s.isPinnedStart && !s.isPinnedEnd);

      // 3. Construct locations array for matrix calculation
      // Format: [StartPoint, PinnedStart (if exists), ...FreeStops, PinnedEnd (if exists), EndPoint (if exists)]
      const locations = [startPoint];
      if (pinnedStartStop) locations.push(pinnedStartStop);
      locations.push(...freeStops);
      if (pinnedEndStop) locations.push(pinnedEndStop);
      if (endPoint) locations.push(endPoint);

      // 4. Fetch the travel durations from OSRM between all locations
      const matrix = await fetchOSRMDurationMatrix(locations);
      
      // 5. Solve the constrained TSP
      const hasEndpoint = !!endPoint;
      const optimalIndicesOrder = solveTSP2OptConstrained(matrix, !!pinnedStartStop, !!pinnedEndStop, hasEndpoint);
      
      // 6. Reassemble stops order based on optimalIndicesOrder
      const optimizedStops = [];
      for (let i = 0; i < optimalIndicesOrder.length; i++) {
        const locIdx = optimalIndicesOrder[i];
        const loc = locations[locIdx];
        
        // Find if this location corresponds to one of our stops (by id)
        const stop = state.stops.find(s => s.id === loc.id);
        if (stop) {
          optimizedStops.push(stop);
        }
      }
      
      state.stops = optimizedStops;
      saveStateToStorage();
      renderStopsList();
    }

    // 7. Get the detailed path geometry for the sorted sequence
    const routeCoords = [];
    
    // Add Start point
    if (state.lockWarehouseStart && state.warehouse) {
      routeCoords.push(state.warehouse);
    } else {
      routeCoords.push(startPoint);
    }
    
    // Add Intermediate stops
    routeCoords.push(...state.stops);
    
    // Add Return to warehouse if locked end is true
    if (state.lockWarehouseEnd && state.warehouse) {
      routeCoords.push(state.warehouse);
    }
    
    await fetchDirectRoute(routeCoords);
    
  } catch (error) {
    console.error("Optimization failed, doing fallback estimation:", error);
    runFallbackRouting();
  } finally {
    showLoader(false);
    renderLastlista();
  }
}

// Fetch OSRM Matrix
async function fetchOSRMDurationMatrix(locations) {
  const coordsQuery = locations.map(loc => `${loc.lng},${loc.lat}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coordsQuery}?sources=all&destinations=all&annotations=duration`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch OSRM duration table");
  
  const data = await response.json();
  return data.durations; // 2D matrix of travel times in seconds
}

// TSP Solver (Constrained 2-Opt Heuristic)
function solveTSP2OptConstrained(matrix, hasPinnedStart, hasPinnedEnd, hasEndpoint) {
  const n = matrix.length;
  
  const firstFreeIdx = hasPinnedStart ? 2 : 1;
  const lastFreeIdx = hasPinnedEnd ? (hasEndpoint ? n - 3 : n - 2) : (hasEndpoint ? n - 2 : n - 1);
  
  // Initial tour: startPoint (0) -> pinnedStart (1, if exists) -> greedy free stops -> pinnedEnd -> endPoint (if exists)
  let bestTour = [0];
  if (hasPinnedStart) {
    bestTour.push(1);
  }
  
  // Greedy nearest-neighbor tour for the free stops
  const unvisited = new Set();
  for (let i = firstFreeIdx; i <= lastFreeIdx; i++) {
    unvisited.add(i);
  }
  
  let current = hasPinnedStart ? 1 : 0;
  while (unvisited.size > 0) {
    let nearest = -1;
    let minDistance = Infinity;
    for (let candidate of unvisited) {
      const dist = matrix[current][candidate];
      if (dist < minDistance) {
        minDistance = dist;
        nearest = candidate;
      }
    }
    bestTour.push(nearest);
    unvisited.delete(nearest);
    current = nearest;
  }
  
  if (hasPinnedEnd) {
    bestTour.push(hasEndpoint ? n - 2 : n - 1);
  }
  if (hasEndpoint) {
    bestTour.push(n - 1); // endPoint
  }
  
  // Calculate total duration of a tour
  const getTourCost = (tour) => {
    let cost = 0;
    for (let i = 0; i < tour.length - 1; i++) {
      cost += matrix[tour[i]][tour[i+1]];
    }
    return cost;
  };
  
  let bestCost = getTourCost(bestTour);
  let improved = true;
  let attempts = 0;
  const maxAttempts = 500;
  
  while (improved && attempts < maxAttempts) {
    improved = false;
    attempts++;
    
    // We only swap indices between firstFreeIdx and lastFreeIdx (inclusive)
    for (let i = firstFreeIdx; i < lastFreeIdx; i++) {
      for (let j = i + 1; j <= lastFreeIdx; j++) {
        const newTour = [...bestTour];
        reverseSubsegment(newTour, i, j);
        
        const newCost = getTourCost(newTour);
        if (newCost < bestCost) {
          bestTour = newTour;
          bestCost = newCost;
          improved = true;
        }
      }
    }
  }
  
  return bestTour;
}

// Reverse sub-segment helper for 2-opt
function reverseSubsegment(arr, i, j) {
  while (i < j) {
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
    i++;
    j--;
  }
}

// Fetch detailed road routing geometry from OSRM
async function fetchDirectRoute(coordsList) {
  const coordsQuery = coordsList.map(loc => `${loc.lng},${loc.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsQuery}?overview=full&geometries=geojson`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error("OSRM routing geometry error");
  
  const data = await response.json();
  
  if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
    const route = data.routes[0];
    state.routeDistance = route.distance; // meters
    state.routeDuration = route.duration; // seconds
    
    // Convert GeoJSON to Leaflet Coordinates [lat, lng]
    const routeCoords = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
    
    drawRoutePath(routeCoords);
    updateMapMarkers();
    fitMapBounds();
    updateDashboard();
  }
}

// Fallback Straight-Line Routing if internet is down or OSRM is rate-limiting
function runFallbackRouting() {
  console.log("Running fallback routing...");
  const coords = [];
  
  const startLoc = (state.lockWarehouseStart && state.warehouse) ? state.warehouse : state.stops[0];
  if (startLoc) {
    coords.push([startLoc.lat, startLoc.lng]);
  }
  
  let totalDistanceMeters = 0;
  let prevLoc = startLoc;
  
  // Connect start -> stops
  for (let i = 0; i < state.stops.length; i++) {
    const stop = state.stops[i];
    coords.push([stop.lat, stop.lng]);
    
    if (prevLoc) {
      totalDistanceMeters += calculateHaversineDistance(prevLoc.lat, prevLoc.lng, stop.lat, stop.lng);
    }
    prevLoc = stop;
  }
  
  // Connect return to warehouse if locked end is true
  if (state.lockWarehouseEnd && state.warehouse && prevLoc) {
    coords.push([state.warehouse.lat, state.warehouse.lng]);
    totalDistanceMeters += calculateHaversineDistance(prevLoc.lat, prevLoc.lng, state.warehouse.lat, state.warehouse.lng);
  }

  // Estimate duration: assume average driving speed of 45 km/h (12.5 m/s) including stoplights
  const averageSpeedMps = 12.5; 
  state.routeDistance = totalDistanceMeters;
  state.routeDuration = totalDistanceMeters / averageSpeedMps;

  drawRoutePath(coords);
  updateMapMarkers();
  fitMapBounds();
  updateDashboard();
}

// Haversine formula for spherical distance in meters
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

// OCR Address Scanner functions removed

// ==========================================================================
// 6. DASHBOARD & RENDER FUNCTIONS
// ==========================================================================

// Local Static ETA Calculation using Haversine distances along the active sequence
function calculateStaticRemainingRoute() {
  const pendingStops = state.stops.filter(s => s.status === 'pending');
  const totalStopsCount = state.stops.length;
  
  if (totalStopsCount === 0 || pendingStops.length === 0) {
    return { remainingDriveMinutes: 0, remainingWorkMinutes: 0, remainingDistanceKm: "0.0" };
  }

  // 1. Identify where we are starting the remaining route from
  let startLoc = null;
  
  // Try to find the last completed stop as the starting point for remaining route
  const completedStops = state.stops.filter(s => s.status !== 'pending');
  if (completedStops.length > 0) {
    startLoc = completedStops[completedStops.length - 1];
  } else if (state.lockWarehouseStart && state.warehouse) {
    startLoc = state.warehouse;
  } else {
    // If no warehouse start, start from first pending stop (distance = 0 initially)
    startLoc = pendingStops[0];
  }
  
  let totalDistMeters = 0;
  let prevLoc = startLoc;
  
  // 2. Sum distances between pending stops
  for (let stop of pendingStops) {
    totalDistMeters += calculateHaversineDistance(prevLoc.lat, prevLoc.lng, stop.lat, stop.lng);
    prevLoc = stop;
  }
  
  // 3. Add distance to return to warehouse if locked end is true
  if (state.lockWarehouseEnd && state.warehouse) {
    totalDistMeters += calculateHaversineDistance(prevLoc.lat, prevLoc.lng, state.warehouse.lat, state.warehouse.lng);
  }
  
  // Speed assumptions for delivery driving in Sweden:
  // We assume an average effective driving speed (including intersections/lights) of 42 km/h (11.6 m/s)
  const averageSpeedMps = 11.6;
  const remainingDriveMinutes = Math.round((totalDistMeters / averageSpeedMps) / 60);
  
  // Sum of stop times for remaining pending stops
  const remainingWorkMinutes = pendingStops.reduce((sum, stop) => sum + parseInt(stop.duration || 0, 10), 0);
  
  const remainingDistanceKm = (totalDistMeters / 1000).toFixed(1);
  
  return {
    remainingDriveMinutes,
    remainingWorkMinutes,
    remainingDistanceKm
  };
}

// Update stats calculations on Dashboard
function updateDashboard() {
  const totalStopsCount = state.stops.length;
  
  // Calculate Progress
  const completedCount = state.stops.filter(s => s.status !== 'pending').length;
  const pct = totalStopsCount > 0 ? Math.round((completedCount / totalStopsCount) * 100) : 0;
  
  const stopsCounterEl = document.getElementById('stops-counter');
  if (stopsCounterEl) stopsCounterEl.innerText = `${totalStopsCount} stopp`;
  
  const progressTextEl = document.getElementById('progress-text');
  if (progressTextEl) progressTextEl.innerText = `${completedCount} / ${totalStopsCount} stopp bockade (${pct}%)`;
  
  const progressBarEl = document.getElementById('progress-bar');
  if (progressBarEl) progressBarEl.style.width = `${pct}%`;
  
  // Calculate timings with the Static ETA Engine
  const remainingRoute = calculateStaticRemainingRoute();
  const remainingDriveMinutes = remainingRoute.remainingDriveMinutes;
  const remainingWorkMinutes = remainingRoute.remainingWorkMinutes;
  const remainingTotalMinutes = remainingDriveMinutes + remainingWorkMinutes;
  const remainingDistanceKm = remainingRoute.remainingDistanceKm;
  
  // Update texts (we show remaining stats in HUD and on dashboard as they progress)
  const totalTimeEl = document.getElementById('stat-total-time');
  if (totalTimeEl) totalTimeEl.innerText = formatMinutes(remainingTotalMinutes);
  
  const driveTimeEl = document.getElementById('stat-drive-time');
  if (driveTimeEl) driveTimeEl.innerText = formatMinutes(remainingDriveMinutes);
  
  const workTimeEl = document.getElementById('stat-work-time');
  if (workTimeEl) workTimeEl.innerText = formatMinutes(remainingWorkMinutes);
  
  const distanceEl = document.getElementById('stat-distance');
  if (distanceEl) distanceEl.innerText = `${remainingDistanceKm} km`;
  
  // Sluttid (ETA)
  const etaEl = document.getElementById('stat-eta');
  if (totalStopsCount > 0 && remainingTotalMinutes > 0) {
    const now = new Date();
    const etaDate = new Date(now.getTime() + remainingTotalMinutes * 60 * 1000);
    const etaHours = String(etaDate.getHours()).padStart(2, '0');
    const etaMins = String(etaDate.getMinutes()).padStart(2, '0');
    
    if (etaEl) etaEl.innerText = `Kl ${etaHours}:${etaMins}`;
    
    // Also update HUD bottom ETA text if active
    const hudEta = document.getElementById('hud-eta-timer');
    if (hudEta) hudEta.innerText = `Klar ca ${etaHours}:${etaMins}`;
    
    // Also update HUD prominent badge inside the active stop card
    const hudEtaBadge = document.getElementById('hud-eta-badge');
    if (hudEtaBadge) hudEtaBadge.innerText = `🏁 Sluttid: Kl ${etaHours}:${etaMins}`;
    
    // HUD distance left: remaining distance & stops calculation
    const hudDistLeft = document.getElementById('hud-dist-left');
    if (hudDistLeft) {
      const remainingStops = state.stops.filter(s => s.status === 'pending').length;
      hudDistLeft.innerText = `Kvar: ${remainingDistanceKm} km (${remainingStops} stopp)`;
    }
  } else {
    if (etaEl) etaEl.innerText = totalStopsCount > 0 ? "Klar" : "Inga stopp";
    
    const hudEta = document.getElementById('hud-eta-timer');
    if (hudEta) hudEta.innerText = "Klar";
    
    const hudEtaBadge = document.getElementById('hud-eta-badge');
    if (hudEtaBadge) hudEtaBadge.innerText = "🏁 Sluttid: Kl --:--";
    
    const hudDistLeft = document.getElementById('hud-dist-left');
    if (hudDistLeft) hudDistLeft.innerText = "Kvar: 0 km (0 stopp)";
  }
}

// Convert minutes to pretty text e.g. "2 tim 15 min"
function formatMinutes(mins) {
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours} t ${remainingMins} min`;
}

// Render warehouse display
function renderWarehouse() {
  const display = document.getElementById('warehouse-display');
  const addressText = document.getElementById('warehouse-address-text');
  
  if (state.warehouse) {
    addressText.innerText = state.warehouse.address;
    display.classList.remove('hide');
  } else {
    addressText.innerText = "Ingen lageradress sparad. Vänligen ställ in en lageradress nedan.";
  }
}

// Render the entire list of stops
function renderStopsList() {
  const list = document.getElementById('stops-sortable-list');
  const emptyView = document.getElementById('empty-list-view');
  
  list.innerHTML = '';
  
  if (state.stops.length === 0) {
    emptyView.classList.remove('hide');
    return;
  }
  
  emptyView.classList.add('hide');
  
  state.stops.forEach((stop, index) => {
    const li = document.createElement('li');
    
    let pinnedClass = '';
    if (stop.isPinnedStart) pinnedClass = 'pinned-start';
    else if (stop.isPinnedEnd) pinnedClass = 'pinned-end';
    
    li.className = `stop-item ${stop.status} ${pinnedClass}`;
    li.draggable = true;
    li.dataset.id = stop.id;
    li.dataset.index = index;
    
    // Deep link navigation logic: launches native map navigation
    const googleMapNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address)}&travelmode=driving`;
    
    li.innerHTML = `
      <div class="drag-handle"><i data-lucide="grip-vertical"></i></div>
      <div class="stop-index-badge">${index + 1}</div>
      <div class="stop-content">
        <div class="stop-address" title="${stop.address}">${stop.address}</div>
        <div class="stop-details-row">
          <div class="stop-duration-tag">
            <i data-lucide="clock"></i>
            <input type="number" class="stop-dur-edit" value="${stop.duration}" min="1" max="120" data-id="${stop.id}"> min
          </div>
          <div class="pin-actions-group">
            <button class="btn-pin-toggle pin-start ${stop.isPinnedStart ? 'active' : ''}" data-id="${stop.id}" title="Fäst som startstopp">
              <i data-lucide="anchor"></i> Startstopp
            </button>
            <button class="btn-pin-toggle pin-end ${stop.isPinnedEnd ? 'active' : ''}" data-id="${stop.id}" title="Fäst som slutstopp">
              <i data-lucide="flag"></i> Slutstopp
            </button>
          </div>
        </div>
      </div>
      
      <div class="stop-actions-wrapper">
        <!-- Direct Android Auto Launch Nav -->
        <a href="${googleMapNavUrl}" target="_blank" class="btn-nav-stop" title="Navigera till stoppet">
          <i data-lucide="navigation"></i> KÖR
        </a>
        
        <select class="stop-status-select" data-id="${stop.id}">
          <option value="pending" ${stop.status === 'pending' ? 'selected' : ''}>⏳ Väntar</option>
          <option value="delivered" ${stop.status === 'delivered' ? 'selected' : ''}>✅ Lev.</option>
          <option value="failed" ${stop.status === 'failed' ? 'selected' : ''}>❌ Problem</option>
        </select>
        
        <!-- Touch Arrows for Mobile Reordering -->
        <div class="mobile-arrows">
          <button class="btn-arrow btn-up" data-index="${index}" title="Flytta upp">
            <i data-lucide="chevron-up"></i>
          </button>
          <button class="btn-arrow btn-down" data-index="${index}" title="Flytta ner">
            <i data-lucide="chevron-down"></i>
          </button>
        </div>
        
        <button class="btn-delete-stop" data-id="${stop.id}" title="Ta bort stopp">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;
    
    list.appendChild(li);
  });
  
  // Re-create icons for new elements
  lucide.createIcons();
  
  // Setup drag and drop events
  setupDragAndDrop();
  
  // Bind dynamic inline inputs inside list
  bindDynamicListInputs();
}

// ==========================================================================
// 7. DRAG & DROP & LIST ORDER CONTROLLERS
// ==========================================================================
let dragSourceElement = null;

function setupDragAndDrop() {
  const items = document.querySelectorAll('.sortable-list .stop-item');
  
  items.forEach(item => {
    item.addEventListener('dragstart', handleDragStart, false);
    item.addEventListener('dragover', handleDragOver, false);
    item.addEventListener('drop', handleDrop, false);
    item.addEventListener('dragend', handleDragEnd, false);
  });
}

function handleDragStart(e) {
  this.classList.add('dragging');
  dragSourceElement = this;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault(); // Necessary. Allows us to drop.
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation(); // stops the browser from redirecting.
  }
  
  if (dragSourceElement !== this) {
    const srcIndex = parseInt(dragSourceElement.dataset.index, 10);
    const destIndex = parseInt(this.dataset.index, 10);
    
    // Swap/reorder in our state
    const temp = state.stops.splice(srcIndex, 1)[0];
    state.stops.splice(destIndex, 0, temp);
    
    saveStateToStorage();
    renderStopsList();
    
    // Instantly recalculate path for manual sequence (without auto TSP reoptimizing)
    calculateRoute(false);
  }
  return false;
}

function handleDragEnd() {
  this.classList.remove('dragging');
  const items = document.querySelectorAll('.sortable-list .stop-item');
  items.forEach(item => item.classList.remove('dragging'));
}

// Inline input change bindings
function bindDynamicListInputs() {
  // Inline duration edit
  document.querySelectorAll('.stop-dur-edit').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      const val = Math.max(1, parseInt(e.target.value, 10) || 4);
      
      const stop = state.stops.find(s => s.id === id);
      if (stop) {
        stop.duration = val;
        saveStateToStorage();
        updateDashboard();
        
        // If we are in HUD mode, sync HUD view
        if (state.isHUDActive && state.hudActiveIndex !== -1) {
          renderHUDActiveStop();
        }
      }
    });
  });

  // Pin Start Toggle
  document.querySelectorAll('.pin-start').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      const stop = state.stops.find(s => s.id === id);
      if (stop) {
        const currentVal = !!stop.isPinnedStart;
        // Clear other start pins
        state.stops.forEach(s => s.isPinnedStart = false);
        // Toggle this stop
        stop.isPinnedStart = !currentVal;
        // If it becomes start pin, it cannot be end pin
        if (stop.isPinnedStart) {
          stop.isPinnedEnd = false;
        }
        saveStateToStorage();
        renderStopsList();
        calculateRoute(false);
      }
    });
  });

  // Pin End Toggle
  document.querySelectorAll('.pin-end').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      const stop = state.stops.find(s => s.id === id);
      if (stop) {
        const currentVal = !!stop.isPinnedEnd;
        // Clear other end pins
        state.stops.forEach(s => s.isPinnedEnd = false);
        // Toggle this stop
        stop.isPinnedEnd = !currentVal;
        // If it becomes end pin, it cannot be start pin
        if (stop.isPinnedEnd) {
          stop.isPinnedStart = false;
        }
        saveStateToStorage();
        renderStopsList();
        calculateRoute(false);
      }
    });
  });

  // Status select changes
  document.querySelectorAll('.stop-status-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      const status = e.target.value;
      
      const stop = state.stops.find(s => s.id === id);
      if (stop) {
        stop.status = status;
        saveStateToStorage();
        renderStopsList();
        updateMapMarkers();
        updateDashboard();
        
        // Sync HUD if active
        if (state.isHUDActive) {
          renderHUDActiveStop();
        }
      }
    });
  });

  // Up and Down button clicks (mobile reordering)
  document.querySelectorAll('.btn-up').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index, 10);
      if (index > 0) {
        const temp = state.stops.splice(index, 1)[0];
        state.stops.splice(index - 1, 0, temp);
        saveStateToStorage();
        renderStopsList();
        calculateRoute(false);
      }
    });
  });

  document.querySelectorAll('.btn-down').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index, 10);
      if (index < state.stops.length - 1) {
        const temp = state.stops.splice(index, 1)[0];
        state.stops.splice(index + 1, 0, temp);
        saveStateToStorage();
        renderStopsList();
        calculateRoute(false);
      }
    });
  });

  // Delete stop
  document.querySelectorAll('.btn-delete-stop').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      state.stops = state.stops.filter(s => s.id !== id);
      saveStateToStorage();
      renderStopsList();
      calculateRoute(false);
    });
  });
}

// ==========================================================================
// 8. DRIVING HUD MODE (DASHBOARD CONTROLLER)
// ==========================================================================
// ==========================================================================
// 8. TABS, TOASTS & LASTLISTA (LIFO) CONTROLLERS
// ==========================================================================

// Switch active tab view
function switchTab(tab) {
  // Sync tab buttons
  document.querySelectorAll('.tab-nav-btn').forEach(btn => {
    if (btn.dataset.tab === tab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Handle Tab Views Toggling
  const planPanel = document.getElementById('planering-panel');
  const lastPanel = document.getElementById('lastlista-panel');
  const mapView = document.getElementById('map-view-wrapper');
  const cargoView = document.getElementById('lastlista-cargo-visual');

  if (tab === 'planering') {
    if (planPanel) planPanel.classList.remove('hide');
    if (lastPanel) lastPanel.classList.add('hide');
    if (mapView) mapView.classList.remove('hide');
    if (cargoView) cargoView.classList.add('hide');
    toggleHUDMode(false);
    
    // Invalidate Leaflet Map size for correct rendering in desktop
    if (map) {
      setTimeout(() => map.invalidateSize(), 50);
    }
  } else if (tab === 'lastlista') {
    if (planPanel) planPanel.classList.add('hide');
    if (lastPanel) lastPanel.classList.remove('hide');
    if (mapView) mapView.classList.add('hide');
    if (cargoView) cargoView.classList.remove('hide');
    toggleHUDMode(false);
    
    // Generate and draw visual loading bay
    renderLastlista();
  } else if (tab === 'korlage') {
    // Open HUD driving mode overlay
    toggleHUDMode(true);
  }
}

// Show custom Swedish duplicate warning toast
function showDuplicateWarningToast(address, onConfirmCallback) {
  const toast = document.getElementById('toast-notification');
  const message = document.getElementById('toast-message');
  const actionBtn = document.getElementById('toast-action-btn');
  const closeBtn = document.getElementById('toast-close-btn');
  
  if (!toast || !message || !actionBtn || !closeBtn) return;
  
  message.innerHTML = `Adressen <strong>"${address}"</strong> finns redan i din rutt. Vill du lägga till den som ett extra stopp ändå?`;
  toast.classList.remove('hide');
  
  // Clean click listeners by cloning elements
  const newActionBtn = actionBtn.cloneNode(true);
  actionBtn.parentNode.replaceChild(newActionBtn, actionBtn);
  
  const newCloseBtn = closeBtn.cloneNode(true);
  closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
  
  newActionBtn.addEventListener('click', () => {
    onConfirmCallback();
    toast.classList.add('hide');
  });
  
  newCloseBtn.addEventListener('click', () => {
    toast.classList.add('hide');
  });
}

// Render dynamic Lastlista (LIFO) checklist and cargo deck visual
function renderLastlista() {
  const list = document.getElementById('lastlista-sortable-list');
  const emptyView = document.getElementById('lastlista-empty-view');
  const counter = document.getElementById('lastlista-loaded-counter');
  const cargoGrid = document.getElementById('cargo-grid-items');
  
  if (!list || !cargoGrid) return;
  
  list.innerHTML = '';
  cargoGrid.innerHTML = '';
  
  if (state.stops.length === 0) {
    if (emptyView) emptyView.classList.remove('hide');
    if (counter) counter.innerText = "0 / 0 Lastade";
    cargoGrid.innerHTML = `
      <div class="cargo-empty-state">
        <i data-lucide="package-open" style="width: 32px; height: 32px; opacity: 0.5;"></i>
        <span>Inga paket att visa. Lägg till stopp i din rutt först.</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  if (emptyView) emptyView.classList.add('hide');
  
  // LIFO checklist displays stops in REVERSE order
  const reversedStops = [...state.stops].reverse();
  
  // Count loaded stops
  let loadedCount = 0;
  state.stops.forEach(s => {
    if (state.lastlistaLoadedStops[s.id]) loadedCount++;
  });
  if (counter) counter.innerText = `${loadedCount} / ${state.stops.length} Lastade`;
  
  reversedStops.forEach((stop, index) => {
    const isLoaded = !!state.lastlistaLoadedStops[stop.id];
    
    // Delivery sequence number is original index + 1
    const deliveryNumber = state.stops.indexOf(stop) + 1;
    const isFirstLoaded = index === 0;
    const isLastLoaded = index === reversedStops.length - 1;
    
    let instruction = "Packas i mitten";
    if (isFirstLoaded) instruction = "Lasta först (Längst in i bilen) 📥";
    else if (isLastLoaded) instruction = "Lasta sist (Närmast dörrarna) 🚪";
    
    // Checklist item
    const li = document.createElement('li');
    li.className = `lastlista-item ${isLoaded ? 'loaded' : ''}`;
    li.innerHTML = `
      <div class="lastlista-check-wrapper">
        <input type="checkbox" class="lastlista-checkbox" data-id="${stop.id}" ${isLoaded ? 'checked' : ''}>
      </div>
      <div class="lastlista-meta">
        <span class="lastlista-num-badge">LEVERANS #${deliveryNumber}</span>
        <span class="lastlista-addr">${stop.address}</span>
        <span class="lastlista-pack-instruction">${instruction}</span>
      </div>
    `;
    list.appendChild(li);
    
    // Visual Package block in cargo van diagram
    const pkgBlock = document.createElement('div');
    pkgBlock.className = `cargo-package-block ${isLoaded ? 'loaded' : ''}`;
    pkgBlock.dataset.id = stop.id;
    
    pkgBlock.innerHTML = `
      <div class="pkg-info-left">
        <div class="pkg-index-badge">${deliveryNumber}</div>
        <div class="pkg-addr-label">${stop.address.split(',')[0]}</div>
      </div>
      <div class="pkg-status-indicator ${isLoaded ? 'is-loaded' : 'to-load'}">
        ${isLoaded ? '✅ Lastad' : '⏳ Lasta'}
      </div>
    `;
    cargoGrid.appendChild(pkgBlock);
  });
  
  lucide.createIcons();
  bindLastlistaEvents();
}

function bindLastlistaEvents() {
  // Checkbox checklist toggle
  document.querySelectorAll('.lastlista-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      state.lastlistaLoadedStops[id] = e.target.checked;
      saveStateToStorage();
      renderLastlista();
    });
  });
  
  // Package block visual clicking
  document.querySelectorAll('.cargo-package-block').forEach(block => {
    block.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      state.lastlistaLoadedStops[id] = !state.lastlistaLoadedStops[id];
      saveStateToStorage();
      renderLastlista();
    });
  });
}

// ==========================================================================
// 8.5 DRIVING HUD MODE (DASHBOARD CONTROLLER)
// ==========================================================================
function toggleHUDMode(active) {
  const hudOverlay = document.getElementById('hud-overlay');
  state.isHUDActive = active;
  
  if (active) {
    if (!state.warehouse) {
      alert("Du måste ställa in en lageradress först!");
      state.isHUDActive = false;
      
      // Reset active state in tabs navigation
      switchTab('planering');
      return;
    }
    if (state.stops.length === 0) {
      alert("Lägg till några leveransstopp innan du startar körläget!");
      state.isHUDActive = false;
      
      // Reset active state in tabs navigation
      switchTab('planering');
      return;
    }
    
    // Find first pending stop index in sequence
    const firstPendingIdx = state.stops.findIndex(s => s.status === 'pending');
    state.hudActiveIndex = firstPendingIdx !== -1 ? firstPendingIdx : 0;
    
    if (hudOverlay) hudOverlay.classList.remove('hide');
    renderHUDActiveStop();
    updateDashboard(); // sync HUD footer stats
  } else {
    if (hudOverlay) hudOverlay.classList.add('hide');
    // Refresh main view lists just in case status changed
    renderStopsList();
    updateMapMarkers();
  }
}

function renderHUDActiveStop() {
  if (state.hudActiveIndex === -1 || state.stops.length === 0) return;
  
  const stop = state.stops[state.hudActiveIndex];
  
  // Update top title text
  const subtitleEl = document.getElementById('hud-subtitle');
  if (subtitleEl) subtitleEl.innerText = `Stopp ${state.hudActiveIndex + 1} av ${state.stops.length}`;
  
  // Update card details
  const activeCard = document.getElementById('hud-active-stop-card');
  const indexBadge = activeCard ? activeCard.querySelector('.hud-index-badge') : null;
  const durBadge = document.getElementById('hud-stop-duration');
  const addressText = document.getElementById('hud-active-address');
  const navLink = document.getElementById('hud-nav-link');
  
  // Set badge status colors
  if (indexBadge) indexBadge.innerText = `NÄSTA STOPP ${state.hudActiveIndex + 1}`;
  if (durBadge) durBadge.innerText = `⏱️ ${stop.duration} min`;
  if (addressText) addressText.innerText = stop.address;
  
  // Set active card border style based on status
  if (activeCard) activeCard.className = `hud-active-card ${stop.status}`;
  
  // Start navigation link setup for Google Maps universal intent
  const mapNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address)}&travelmode=driving`;
  if (navLink) navLink.href = mapNavUrl;
  
  // Check buttons disabled queues
  const prevBtn = document.getElementById('hud-prev-btn');
  const nextBtn = document.getElementById('hud-next-btn');
  
  if (prevBtn) prevBtn.disabled = state.hudActiveIndex === 0;
  if (nextBtn) nextBtn.disabled = state.hudActiveIndex === state.stops.length - 1;
}

// Mark active HUD delivery status (with automated fail-stop reordering)
function setHUDActiveStopStatus(status) {
  if (state.hudActiveIndex === -1) return;
  
  const currentStop = state.stops[state.hudActiveIndex];
  
  // 1. Update status
  currentStop.status = status;
  
  // 2. Special handling: if stop failed, automatically move it to the absolute end of queue!
  if (status === 'failed') {
    // Remove from current index
    state.stops.splice(state.hudActiveIndex, 1);
    // Append to end of route sequence
    state.stops.push(currentStop);
    
    console.log("Kundej leverera: Flyttar adressen till slutet av kön:", currentStop.address);
    saveStateToStorage();
    
    // Recalculate OSRM route path geometry (without reoptimizing stops order, just drawing the new sequence)
    calculateRoute(false);
    
    // If we were at the last stop, stay at the end. Otherwise the next stop shifts in, so index remains identical.
    if (state.hudActiveIndex >= state.stops.length - 1) {
      alert("Detta var det sista stoppet. Det misslyckade stoppet ligger nu sist på listan.");
      state.hudActiveIndex = state.stops.length - 1;
    }
  } else {
    // Delivered (Success)
    saveStateToStorage();
    
    // Move to next stop
    if (state.hudActiveIndex < state.stops.length - 1) {
      state.hudActiveIndex++;
    } else {
      // Finished all stops
      alert("Bra jobbat! Du har slutfört alla planerade stopp på din rutt.");
      toggleHUDMode(false); // return to summary screen
      switchTab('planering');
      return;
    }
  }
  
  // Sync views
  renderStopsList();
  renderLastlista();
  updateMapMarkers();
  updateDashboard();
  renderHUDActiveStop();
}

// ==========================================================================
// 9. GEOCODING DROPDOWN UTILS
// ==========================================================================
function bindAutocomplete(inputId, dropdownId, onSelectCallback, isStop = false) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let timeout = null;
  
  input.addEventListener('input', () => {
    clearTimeout(timeout);
    const query = input.value;
    
    if (query.trim().length < 3) {
      dropdown.classList.add('hide');
      return;
    }
    
    timeout = setTimeout(async () => {
      const results = await searchAddress(query, isStop);
      
      if (results.length === 0) {
        dropdown.classList.add('hide');
        return;
      }
      
      dropdown.innerHTML = '';
      dropdown.classList.remove('hide');
      
      results.forEach(item => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.innerHTML = `<i data-lucide="map-pin" style="width:14px;height:14px;flex-shrink:0;"></i> <span>${item.address}</span>`;
        
        div.addEventListener('click', () => {
          input.value = item.address;
          dropdown.classList.add('hide');
          onSelectCallback(item);
        });
        
        dropdown.appendChild(div);
      });
      lucide.createIcons();
    }, 450); // debounce API requests
  });
  
  // Hide dropdown if clicked outside
  document.addEventListener('click', (e) => {
    if (e.target !== input && e.target !== dropdown) {
      dropdown.classList.add('hide');
    }
  });
}

// WebRTC and Spoken voice parser helpers removed

// ==========================================================================
// 10. BINDING COMPONENT EVENT LISTENERS
// ==========================================================================
function setupEventListeners() {
  
  // 0. Force Update & Clear Cache Binding
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
      if (confirm("Vill du rensa appens cache och hämta den absolut senaste uppdateringen? (Din rutt försvinner inte!)")) {
        // Unregister service workers
        if ('serviceWorker' in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
              await registration.unregister();
            }
          } catch (e) {
            console.error("SW unregister error:", e);
          }
        }
        // Clear caches
        if ('caches' in window) {
          try {
            const keys = await caches.keys();
            for (let key of keys) {
              await caches.delete(key);
            }
          } catch (e) {
            console.error("Cache clear error:", e);
          }
        }
        // Force hard reload from server
        window.location.reload(true);
      }
    });
  }
  
  // 1. Warehouse setup bindings
  const editWarehouseBtn = document.getElementById('edit-warehouse-btn');
  const warehouseForm = document.getElementById('warehouse-form');
  const cancelWarehouseBtn = document.getElementById('cancel-warehouse-btn');
  const saveWarehouseBtn = document.getElementById('save-warehouse-btn');
  let selectedWarehouseItem = null;
  
  editWarehouseBtn.addEventListener('click', () => {
    warehouseForm.classList.remove('hide');
    document.getElementById('warehouse-input').value = state.warehouse ? state.warehouse.address : '';
    document.getElementById('warehouse-input').focus();
  });
  
  cancelWarehouseBtn.addEventListener('click', () => {
    warehouseForm.classList.add('hide');
  });
  
  // Auto dropdown for Warehouse input
  bindAutocomplete('warehouse-input', 'warehouse-autocomplete-results', (selectedItem) => {
    selectedWarehouseItem = selectedItem;
  });
  
  saveWarehouseBtn.addEventListener('click', async () => {
    const addressInput = document.getElementById('warehouse-input').value;
    
    if (!addressInput || addressInput.trim().length === 0) {
      alert("Vänligen ange en lageradress!");
      return;
    }
    
    // If user clicked autocomplete, we already have coordinates
    if (selectedWarehouseItem && selectedWarehouseItem.address === addressInput) {
      state.warehouse = {
        address: selectedWarehouseItem.address,
        lat: selectedWarehouseItem.lat,
        lng: selectedWarehouseItem.lng
      };
    } else {
      // Manual fallback search geocoding
      const results = await searchAddress(addressInput);
      if (results.length > 0) {
        state.warehouse = {
          address: results[0].address,
          lat: results[0].lat,
          lng: results[0].lng
        };
      } else {
        alert("Kunde inte hitta adressen. Försök vara mer specifik.");
        return;
      }
    }
    
    saveStateToStorage();
    renderWarehouse();
    warehouseForm.classList.add('hide');
    
    // Pan map to new warehouse
    if (map) {
      map.setView([state.warehouse.lat, state.warehouse.lng], 13);
    }
    
    // Re-trigger routing calculations
    calculateRoute(false);
  });
  
  // 2. Add Stops autocomplete
  const defaultCityInput = document.getElementById('default-city-input');
  if (defaultCityInput) {
    defaultCityInput.addEventListener('input', (e) => {
      state.defaultCity = e.target.value.trim();
      saveStateToStorage();
    });
  }

  let selectedStopItem = null;
  bindAutocomplete('stop-address-input', 'stop-autocomplete-results', (selectedItem) => {
    selectedStopItem = selectedItem;
    const numberInputField = document.getElementById('stop-number-input');
    if (numberInputField) {
      numberInputField.focus();
    }
  }, true);
  
  // "Lägg till i listan" button
  const addStopBtn = document.getElementById('add-stop-text-btn');
  const searchStopBtn = document.getElementById('search-stop-btn');
  
  // Helper to add stop to active state
  const addStopToState = (address, lat, lng, duration) => {
    const newStop = {
      id: 'stop_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      address: address,
      lat: lat,
      lng: lng,
      duration: duration,
      status: 'pending',
      isPinnedStart: false,
      isPinnedEnd: false
    };
    
    state.stops.push(newStop);
    saveStateToStorage();
    renderStopsList();
    renderLastlista();
    
    // Clean input fields
    document.getElementById('stop-address-input').value = '';
    document.getElementById('stop-number-input').value = '';
    selectedStopItem = null;
    document.getElementById('stop-address-input').focus();
    
    // Auto-calculate route for the new stop in queue
    calculateRoute(false);
  };

  // "Lägg till i listan" button handler
  const addStopBtn = document.getElementById('add-stop-text-btn');
  const searchStopBtn = document.getElementById('search-stop-btn');
  
  const handleAddStop = async () => {
    const addressInput = document.getElementById('stop-address-input').value.trim();
    const numberInput = document.getElementById('stop-number-input').value.trim();
    const durInput = parseInt(document.getElementById('stop-duration-input').value, 10) || state.globalDuration;
    
    if (!addressInput || addressInput.length === 0) {
      alert("Vänligen skriv in en adress!");
      return;
    }
    
    // Join street name and street number beautifully (inserting before comma if standardort exists)
    let addressToSearch = addressInput;
    if (numberInput) {
      if (addressInput.includes(',')) {
        const parts = addressInput.split(',');
        parts[0] = `${parts[0].trim()} ${numberInput}`;
        addressToSearch = parts.join(', ');
      } else {
        addressToSearch = `${addressInput} ${numberInput}`;
      }
    }
    
    let lat = 0, lng = 0, address = "";
    
    // Verify geocoding details
    if (selectedStopItem && selectedStopItem.address === addressToSearch) {
      lat = selectedStopItem.lat;
      lng = selectedStopItem.lng;
      address = selectedStopItem.address;
    } else {
      const results = await searchAddress(addressToSearch, true);
      if (results.length > 0) {
        lat = results[0].lat;
        lng = results[0].lng;
        address = results[0].address;
      } else {
        alert("Kunde inte geokoda adressen. Kontrollera stavning eller sök mer specifikt.");
        return;
      }
    }
    
    // Duplicate check and prevention warning
    const isDuplicate = state.stops.some(s => s.address.toLowerCase().trim() === address.toLowerCase().trim());
    if (isDuplicate) {
      showDuplicateWarningToast(address, () => {
        // Confirmation callback: Add anyway!
        addStopToState(address, lat, lng, durInput);
      });
      return;
    }
    
    // Normal addition
    addStopToState(address, lat, lng, durInput);
  };
  
  if (addStopBtn) addStopBtn.addEventListener('click', handleAddStop);
  if (searchStopBtn) searchStopBtn.addEventListener('click', handleAddStop);
  
  // Enter keys navigation & submission listeners
  const stopAddressInputField = document.getElementById('stop-address-input');
  const stopNumberInputField = document.getElementById('stop-number-input');
  
  if (stopAddressInputField && stopNumberInputField) {
    stopAddressInputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        stopNumberInputField.focus();
      }
    });
 
    stopNumberInputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddStop();
      }
    });
  }
  
  // Voice feature listeners removed
  
  // 3. Optimize Buttons & Clear Routings
  document.getElementById('optimize-route-btn').addEventListener('click', () => {
    calculateRoute(true); // run TSP optimization
  });
  
  document.getElementById('clear-route-btn').addEventListener('click', () => {
    if (confirm("Är du säker på att du vill tömma din aktuella leveransrutt?")) {
      state.stops = [];
      state.lastlistaLoadedStops = {};
      saveStateToStorage();
      renderStopsList();
      renderLastlista();
      updateMapMarkers();
      if (routeLine) map.removeLayer(routeLine);
      state.routeDistance = 0;
      state.routeDuration = 0;
      updateDashboard();
    }
  });
  
  // 4. Global standard duration update
  document.getElementById('apply-global-duration').addEventListener('click', () => {
    const val = parseInt(document.getElementById('global-duration').value, 10) || 4;
    state.globalDuration = val;
    
    // Update all current stops to match new global duration setting
    state.stops.forEach(s => s.duration = val);
    
    saveStateToStorage();
    renderStopsList();
    renderLastlista();
    updateDashboard();
    alert(`Alla stopp har uppdaterats till ${val} minuter standardleveranstid.`);
  });
  
  // 5. HUD Mode Event Bindings
  document.getElementById('toggle-hud-btn').addEventListener('click', () => switchTab('korlage'));
  document.getElementById('exit-hud-btn').addEventListener('click', () => switchTab('planering'));
  
  document.getElementById('hud-success-btn').addEventListener('click', () => setHUDActiveStopStatus('delivered'));
  document.getElementById('hud-fail-btn').addEventListener('click', () => setHUDActiveStopStatus('failed'));
  
  document.getElementById('hud-prev-btn').addEventListener('click', () => {
    if (state.hudActiveIndex > 0) {
      state.hudActiveIndex--;
      renderHUDActiveStop();
    }
  });
  
  document.getElementById('hud-next-btn').addEventListener('click', () => {
    if (state.hudActiveIndex < state.stops.length - 1) {
      state.hudActiveIndex++;
      renderHUDActiveStop();
    }
  });
  
  // 6. Map overlay utilities
  document.getElementById('center-map-btn').addEventListener('click', fitMapBounds);
  document.getElementById('locate-me-btn').addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert("GPS stöds inte av din webbläsare.");
      return;
    }
    
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      
      map.setView([lat, lng], 15);
      L.marker([lat, lng]).addTo(map).bindPopup("Här är du!").openPopup();
    }, (err) => {
      alert("Kunde inte hämta din position. Kontrollera dina platsbehörigheter.");
    });
  });
  
  // 7. Fliknavigering (Tabs navigation binding)
  document.querySelectorAll('.tab-nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.dataset.tab;
      switchTab(tab);
    });
  });
  
  // 8. Warehouse Locks Bindings
  document.getElementById('lock-wh-start').addEventListener('change', (e) => {
    state.lockWarehouseStart = e.target.checked;
    saveStateToStorage();
    calculateRoute(false);
  });
  
  document.getElementById('lock-wh-end').addEventListener('change', (e) => {
    state.lockWarehouseEnd = e.target.checked;
    saveStateToStorage();
    calculateRoute(false);
  });
  
  // 9. Lastlista Action Buttons Bindings
  const checkAllBtn = document.getElementById('lastlista-check-all-btn');
  if (checkAllBtn) {
    checkAllBtn.addEventListener('click', () => {
      state.stops.forEach(s => state.lastlistaLoadedStops[s.id] = true);
      saveStateToStorage();
      renderLastlista();
    });
  }
  
  const uncheckAllBtn = document.getElementById('lastlista-uncheck-all-btn');
  if (uncheckAllBtn) {
    uncheckAllBtn.addEventListener('click', () => {
      state.lastlistaLoadedStops = {};
      saveStateToStorage();
      renderLastlista();
    });
  }

  // Camera and OCR scanning listeners removed
}
