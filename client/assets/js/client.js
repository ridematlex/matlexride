/* =============================================
   MATLEX RIDE — Passenger App
   ============================================= */

// Derive API base from current URL — works for /matlex/client/ (localhost) and /client/ (production)
const API = window.location.pathname.replace(/client.*/, 'client/api');

// ── Token helpers ──────────────────────────────
const getToken  = ()  => localStorage.getItem('matlex_token');
const setToken  = (t) => localStorage.setItem('matlex_token', t);
const clearToken = () => localStorage.removeItem('matlex_token');

let currentUser = null;
let activeTrip  = null;
let tripEventSource = null;

// ── Generic fetch wrapper ──────────────────────
async function apiFetch(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  const token = getToken();
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body)  opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(API + path, opts);
  } catch (_) {
    showToast('No internet connection', 'error');
    throw new Error('network');
  }

  let json;
  try {
    json = await res.json();
  } catch (_) {
    showToast('Server error — please try again', 'error');
    throw new Error('parse');
  }

  if (!json.success) {
    showToast(json.message || 'Something went wrong', 'error');
    if (res.status === 401) { doLogout(); return null; }
    throw new Error(json.message);
  }
  return json.data;
}

// ── Screen management ─────────────────────────
const screens = document.querySelectorAll('.phone-screen[data-screen]');

function showScreen(name) {
  screens.forEach(s => {
    const active = s.dataset.screen === name;
    s.style.display = active ? 'flex' : 'none';
    // Make parent shell pointer-interactive only when active
    const shell = s.closest('.phone-shell');
    if (shell) shell.classList.toggle('active-shell', active);
  });
}

// ── Toast notification ─────────────────────────
function showToast(msg, type = 'info') {
  const existing = document.querySelector('.mx-toast');
  if (existing) existing.remove();

  const t = document.createElement('div');
  t.className = 'mx-toast mx-toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ── Loading state on buttons ───────────────────
function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = '<span class="mx-spinner"></span>';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.origText || btn.innerHTML;
    btn.disabled = false;
  }
}

// ══════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════

async function checkAuth() {
  const token = getToken();

  if (!token) {
    // First ever visit → show onboarding and mark as visited
    if (!localStorage.getItem('matlex_visited')) {
      localStorage.setItem('matlex_visited', '1');
      showScreen('onboarding');
    } else {
      showScreen('login');
    }
    return;
  }

  try {
    const data = await apiFetch('/auth/me.php');
    if (data) {
      currentUser = data.user;
      goHome();
    } else {
      showScreen('login');
    }
  } catch (_) {
    showScreen('login');
  }
}

async function handleLogin() {
  const btn   = document.querySelector('.btn-sign-in');
  const phone = document.querySelector('#loginPhone')?.value?.trim();
  const pass  = document.querySelector('#loginPassword')?.value;

  if (!phone || !pass) { showToast('Enter phone and password', 'error'); return; }

  setLoading(btn, true);
  try {
    const data = await apiFetch('/auth/login.php', 'POST', { phone, password: pass });
    if (data) {
      setToken(data.token);
      currentUser = data.user;
      showToast('Welcome back, ' + currentUser.name.split(' ')[0] + '!', 'success');
      goHome();
    }
  } finally {
    setLoading(btn, false);
  }
}

async function handleRegister() {
  const btn   = document.querySelector('.btn-register-submit');
  const name  = document.querySelector('#regName')?.value?.trim();
  const phone = document.querySelector('#regPhone')?.value?.trim();
  const email = document.querySelector('#regEmail')?.value?.trim();
  const pass  = document.querySelector('#regPassword')?.value;
  const pass2 = document.querySelector('#regPassword2')?.value;
  const ref   = document.querySelector('#regReferral')?.value?.trim();
  const terms = document.querySelector('#regTerms')?.checked;

  if (!name || !phone || !pass) { showToast('Name, phone and password are required', 'error'); return; }
  if (pass !== pass2)            { showToast('Passwords do not match', 'error'); return; }
  if (!terms)                    { showToast('Please accept the Terms of Service', 'error'); return; }

  setLoading(btn, true);
  try {
    const data = await apiFetch('/auth/register.php', 'POST', {
      name, phone, email: email || undefined, password: pass,
      referral_code: ref || undefined,
    });
    if (data) {
      setToken(data.token);
      currentUser = data.user;
      showToast('Account created! Welcome to Matlex.', 'success');
      goHome();
    }
  } finally {
    setLoading(btn, false);
  }
}

function doLogout() {
  const token = getToken();
  if (token) apiFetch('/auth/logout.php', 'POST').catch(() => {});
  clearToken();
  currentUser = null;
  stopTripStream();
  showScreen('login');
}

// ── Wire login / register buttons ─────────────
document.querySelector('.btn-sign-in')?.addEventListener('click', handleLogin);
document.querySelector('.btn-register-submit')?.addEventListener('click', handleRegister);
document.querySelector('.btn-logout')?.addEventListener('click', doLogout);

// ── Inline link navigation ─────────────────────
document.querySelectorAll('.btn-to-login').forEach(b =>
  b.addEventListener('click', () => showScreen('login')));
document.querySelectorAll('.btn-to-register').forEach(b =>
  b.addEventListener('click', () => showScreen('register')));

// ══════════════════════════════════════════════
//  ONBOARDING
// ══════════════════════════════════════════════

let obSlide = 0;
const obSlides  = document.querySelectorAll('.ob-slide');
const obDots    = document.querySelectorAll('.ob-dot');
const obNextBtn = document.getElementById('obNextBtn');

function goToSlide(i) {
  obSlide = i;
  obSlides.forEach((s, idx) => s.style.display = idx === i ? 'flex' : 'none');
  obDots.forEach((d, idx) => d.classList.toggle('active', idx === i));
  if (obNextBtn) obNextBtn.textContent = i === obSlides.length - 1 ? 'Get Started' : 'Next';
}

obNextBtn?.addEventListener('click', () => {
  if (obSlide < obSlides.length - 1) {
    goToSlide(obSlide + 1);
  } else {
    localStorage.setItem('matlex_visited', '1');
    showScreen('login');
  }
});

document.querySelectorAll('.btn-skip-ob').forEach(b =>
  b.addEventListener('click', () => {
    localStorage.setItem('matlex_visited', '1');
    showScreen('login');
  }));

// ══════════════════════════════════════════════
//  HOME — render logged-in user
// ══════════════════════════════════════════════

function renderHomeUser() {
  if (!currentUser) return;
  const first = currentUser.name.split(' ')[0];

  const greet  = document.getElementById('homeGreeting');
  const avatar = document.getElementById('homeAvatar');

  if (greet)  greet.textContent  = `Hi, ${first}! 👋`;
  if (avatar) avatar.textContent = initials(currentUser.name);
}

function goHome() {
  renderHomeUser();
  loadNearbyDrivers();
  showScreen('home');
  initLiveMap();
  liveMap?.invalidateSize();
  updateHomeLocation();
}

// ── Live maps, zoomed to current location ──────
const KAMPALA_FALLBACK = [0.3476, 32.5825];
let lastCoords = null; // last resolved [lat, lng] — reused so other screens don't re-prompt GPS

// CARTO Voyager — light, minimal labels, no POI/transit icon clutter
// (unlike the default OSM "Mapnik" tiles which draw bus/parking/university badges)
function addCleanTileLayer(map) {
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors © CARTO',
  }).addTo(map);
}

function createLiveMap(containerId, opts = {}) {
  const startZoom = lastCoords ? 16 : (opts.zoom || 13);
  const map = L.map(containerId, { zoomControl: false, attributionControl: true })
    .setView(lastCoords || KAMPALA_FALLBACK, startZoom);
  addCleanTileLayer(map);
  const marker = L.marker(lastCoords || KAMPALA_FALLBACK, {
    icon: L.divIcon({
      className: 'my-dot',
      html: '<i class="fa-solid fa-location-dot"></i>',
      iconSize: [30, 30],
      iconAnchor: [15, 28], // pin's visual tip points at the actual coordinate
    }),
  }).addTo(map);

  // Leaflet measures the container once at creation; the flex/sheet layout
  // can still be settling at that point, leaving the map stuck at a small
  // cached size (tiles stop rendering partway down). Re-measure every time
  // the container's actual box size changes, not just once via rAF.
  const container = document.getElementById(containerId);
  new ResizeObserver(() => map.invalidateSize()).observe(container);

  return { map, marker };
}

let liveMap = null;
let liveMapMarker = null;

function initLiveMap() {
  if (liveMap || typeof L === 'undefined') return;
  ({ map: liveMap, marker: liveMapMarker } = createLiveMap('liveMap'));
  document.getElementById('mapZoomIn')?.addEventListener('click', () => liveMap.zoomIn());
  document.getElementById('mapZoomOut')?.addEventListener('click', () => liveMap.zoomOut());
}

function centerLiveMap(latitude, longitude, zoom = 16) {
  lastCoords = [latitude, longitude];
  if (!liveMap) return;
  liveMap.setView(lastCoords, zoom);
  liveMapMarker?.setLatLng(lastCoords);
  if (bookMap) { bookMap.setView(lastCoords, zoom); bookMapMarker?.setLatLng(lastCoords); }
}

let bookMap = null;
let bookMapMarker = null;

function initBookMap() {
  if (bookMap || typeof L === 'undefined') return;
  ({ map: bookMap, marker: bookMapMarker } = createLiveMap('bookMap', { zoom: 15 }));
}

// ── Live location label on home screen ─────────
let lastLocationFetch = 0;

async function reverseGeocode(latitude, longitude) {
  // zoom=18 returns the actual road, not just the surrounding suburb
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
  );
  const data = await res.json();
  const a = data.address || {};
  const road = a.road || '';
  const area = (a.city_district || a.borough || a.city || a.town || a.county || '')
      .replace(/\s*Capital City$/i, ''); // "Kampala Capital City" → "Kampala"
  return [road, area].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', ')
      || data.display_name || null;
}

// No browser lets a site silently grant GPS access — the permission prompt
// can't be skipped. This mirrors the IP-based approximation ride apps fall
// back to when GPS is denied/unavailable, so the label still auto-populates.
async function locateByIp() {
  const res = await fetch('https://ipwho.is/');
  const data = await res.json();
  if (!data.success) throw new Error('ip lookup failed');
  return { latitude: data.latitude, longitude: data.longitude };
}

function updateHomeLocation() {
  const el = document.getElementById('homeLocation');
  if (!el) return;

  // GPS doesn't move fast enough to need re-checking on every screen switch
  if (Date.now() - lastLocationFetch < 5 * 60 * 1000) return;

  const resolve = async (latitude, longitude) => {
    centerLiveMap(latitude, longitude);
    let label = 'Current location';
    try {
      label = await reverseGeocode(latitude, longitude) || label;
    } catch (_) { /* keep fallback label */ }
    el.textContent = label;
    if (!pickupCustomized && pickupInp && !pickupInp.value) setRouteInputValue(pickupInp, label);
  };

  const fallbackToIp = async () => {
    try {
      const { latitude, longitude } = await locateByIp();
      await resolve(latitude, longitude);
    } catch (_) {
      el.textContent = 'Kampala, Uganda';
    }
  };

  if (!navigator.geolocation) { fallbackToIp(); return; }

  navigator.geolocation.getCurrentPosition(
    (pos) => { lastLocationFetch = Date.now(); resolve(pos.coords.latitude, pos.coords.longitude); },
    () => { lastLocationFetch = Date.now(); fallbackToIp(); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

function goBook() {
  showScreen('book');
  initBookMap();
  bookMap?.invalidateSize();
  loadRecentPlaces();

  if (!pickupCustomized && pickupInp && !pickupInp.value) {
    const homeLabel = document.getElementById('homeLocation')?.textContent;
    if (homeLabel && homeLabel !== 'Locating…') setRouteInputValue(pickupInp, homeLabel);
  }
}

document.querySelectorAll('.btn-to-book').forEach(b =>
  b.addEventListener('click', goBook));

document.querySelectorAll('.btm-tab[data-screen]').forEach(tab =>
  tab.addEventListener('click', () => {
    const screen = tab.dataset.screen;
    if (screen === 'history') loadHistory();
    if (screen === 'home')    { goHome(); return; }
    showScreen(screen);
  })
);

// ══════════════════════════════════════════════
//  BOOK SCREEN — recent places (from trip history)
// ══════════════════════════════════════════════

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadRecentPlaces() {
  const list = document.getElementById('recentPlacesList');
  if (!list) return;

  try {
    const data = await apiFetch('/trips/history.php?page=1');
    if (!data) return;

    const seen = new Set();
    const places = [];
    for (const trip of data.trips) {
      const addr = trip.dropoff_address;
      if (!addr || seen.has(addr)) continue;
      seen.add(addr);
      places.push({ addr, date: trip.created_at });
      if (places.length >= 5) break;
    }

    list.innerHTML = places.length
      ? places.map(p => `
        <div class="sugg-item">
          <div class="sugg-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
          <div>
            <div class="sugg-name">${escapeHtml(p.addr)}</div>
            <div class="sugg-addr">${formatDate(p.date)}</div>
          </div>
        </div>
      `).join('')
      : '<div class="mx-empty">No recent places yet</div>';
  } catch (_) {
    list.innerHTML = '<div class="mx-empty">Could not load recent places.</div>';
  }
}

// ══════════════════════════════════════════════
//  BOOK SCREEN — live address search (pickup & destination)
// ══════════════════════════════════════════════

const pickupInp = document.getElementById('pickupInp');
const destInp   = document.getElementById('destInp');
let activeRouteInput = null;
let pickupCustomized = false;
let searchDebounce = null;

function setRouteInputValue(input, value) {
  input.value = value;
  input.closest('.route-inp-wrap')?.classList.toggle('has-value', !!value);
}

function expandBookSheet(expand) {
  document.querySelector('.book-sheet')?.classList.toggle('expanded', expand);
}

function showRecentPlacesTitle() {
  const title = document.getElementById('suggSectionTitle');
  if (title) title.textContent = 'Recent Places';
  loadRecentPlaces();
}

async function searchPlaces(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=ug&q=${encodeURIComponent(query)}`
  );
  return res.json();
}

function renderSearchResults(results) {
  const title = document.getElementById('suggSectionTitle');
  const list  = document.getElementById('recentPlacesList');
  if (title) title.textContent = 'Matching Places';
  if (!list) return;

  list.innerHTML = results.length
    ? results.map(r => `
      <div class="sugg-item">
        <div class="sugg-icon"><i class="fa-solid fa-location-dot"></i></div>
        <div><div class="sugg-name">${escapeHtml(r.display_name)}</div></div>
      </div>
    `).join('')
    : '<div class="mx-empty">No matches found</div>';
}

function wireRouteInput(input) {
  if (!input) return;
  const wrap = input.closest('.route-inp-wrap');

  input.addEventListener('focus', () => {
    activeRouteInput = input;
    expandBookSheet(true);
    if (!input.value.trim()) showRecentPlacesTitle();
  });

  input.addEventListener('input', () => {
    wrap?.classList.toggle('has-value', !!input.value);
    if (input === pickupInp) pickupCustomized = true;

    clearTimeout(searchDebounce);
    const q = input.value.trim();
    if (q.length < 3) { showRecentPlacesTitle(); return; }
    searchDebounce = setTimeout(async () => {
      try { renderSearchResults(await searchPlaces(q)); }
      catch (_) { renderSearchResults([]); }
    }, 400);
  });

  input.addEventListener('blur', () => {
    // Give a tap on a suggestion time to register before collapsing
    setTimeout(() => {
      if (document.activeElement?.closest('.route-inp-wrap')) return;
      expandBookSheet(false);
      showRecentPlacesTitle();
    }, 150);
  });

  wrap?.querySelector('.route-inp-clear')?.addEventListener('click', () => {
    setRouteInputValue(input, '');
    if (input === pickupInp) pickupCustomized = true;
    input.focus();
  });
}

wireRouteInput(pickupInp);
wireRouteInput(destInp);

document.getElementById('recentPlacesList')?.addEventListener('click', (e) => {
  const item = e.target.closest('.sugg-item');
  const addr = item?.querySelector('.sugg-name')?.textContent;
  if (!addr || !activeRouteInput) return;

  const wasDestination = activeRouteInput === destInp;
  if (activeRouteInput === pickupInp) pickupCustomized = true;
  setRouteInputValue(activeRouteInput, addr);
  activeRouteInput.blur();
  if (wasDestination) showScreen('choose');
});

document.querySelector('.back-btn.btn-to-home')?.addEventListener('click', () => {
  if (destInp) setRouteInputValue(destInp, '');
  expandBookSheet(false);
  showScreen('home');
});
document.querySelectorAll('.back-btn.btn-to-book').forEach(b =>
  b.addEventListener('click', goBook));

// ══════════════════════════════════════════════
//  CHOOSE RIDE TYPE
// ══════════════════════════════════════════════

document.querySelectorAll('.ride-type-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.ride-type-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
  });
});

// ── Apply promo code ───────────────────────────
document.querySelector('.btn-apply-promo')?.addEventListener('click', async () => {
  const code    = document.querySelector('#promoInput')?.value?.trim();
  const fareEl  = document.querySelector('.confirm-fare');
  if (!code || !fareEl) return;

  const rawFare = parseInt(fareEl.dataset.fare || 45000, 10);
  const data = await apiFetch('/promo/apply.php', 'POST', { code, fare: rawFare });
  if (data) {
    fareEl.textContent = 'UGX ' + Number(data.final_fare).toLocaleString();
    fareEl.dataset.fare = data.final_fare;
    fareEl.dataset.promo = code;
    showToast(data.description + ' — UGX ' + Number(data.discount).toLocaleString() + ' off!', 'success');
  }
});

// ── Confirm ride ───────────────────────────────
document.querySelector('.btn-to-searching')?.addEventListener('click', async () => {
  const btn          = document.querySelector('.btn-to-searching');
  const pickup       = document.getElementById('pickupInp')?.value?.trim() || 'Current Location';
  const dropoff      = document.getElementById('destInp')?.value?.trim()   || '';
  const selectedCard = document.querySelector('.ride-type-card.selected');
  const rideType     = selectedCard?.dataset.type || 'comfort';
  const fareEl       = document.querySelector('.confirm-fare');
  const fare         = parseInt(fareEl?.dataset.fare || 45000, 10);
  const promo        = fareEl?.dataset.promo || null;

  if (!dropoff) { showToast('Please enter a destination', 'error'); return; }

  setLoading(btn, true);
  try {
    const data = await apiFetch('/trips/book.php', 'POST', {
      pickup_address:  pickup,
      dropoff_address: dropoff,
      ride_type:       rideType,
      distance_km:     38,
      promo_code:      promo,
    });
    if (data) {
      activeTrip = data.trip;
      showScreen('searching');
      startTripStream(data.trip.id);
    }
  } finally {
    setLoading(btn, false);
  }
});

// ══════════════════════════════════════════════
//  SEARCHING → TRACKING  (Server-Sent Events)
// ══════════════════════════════════════════════

function startTripStream(tripId) {
  stopTripStream();
  const token = getToken();
  const url   = `${API}/trips/stream.php?trip_id=${tripId}&_token=${encodeURIComponent(token)}`;
  tripEventSource = new EventSource(url);

  tripEventSource.onmessage = (e) => {
    try {
      const row = JSON.parse(e.data);
      handleTripUpdate(row);
    } catch (_) {}
  };

  tripEventSource.addEventListener('done', () => stopTripStream());

  tripEventSource.onerror = () => {
    // EventSource auto-reconnects; nothing to do unless trip is already terminal
    if (activeTrip && ['completed','cancelled'].includes(activeTrip.status)) {
      stopTripStream();
    }
  };
}

function stopTripStream() {
  if (tripEventSource) { tripEventSource.close(); tripEventSource = null; }
}

function handleTripUpdate(row) {
  // Merge SSE update into activeTrip
  if (!activeTrip) return;
  activeTrip.status = row.status;

  if (row.status === 'assigned' || row.status === 'in_progress') {
    stopTripStream();
    // Build driver object from flat SSE row
    const driver = row.driver_id ? {
      id: row.driver_id, name: row.driver_name, phone: row.driver_phone,
      plate: row.driver_plate,
      vehicle: `${row.driver_vehicle} · ${row.driver_color}`,
      photo: row.driver_photo, rating: row.driver_rating,
      total_trips: row.driver_trips,
      current_lat: row.driver_lat, current_lng: row.driver_lng,
    } : null;
    renderTrackingScreen({ ...activeTrip, driver });
    showScreen('tracking');
    startTripStream(activeTrip.id); // re-open SSE for live location updates
  } else if (row.status === 'cancelled') {
    stopTripStream();
    showToast('Trip was cancelled', 'error');
    showScreen('home');
  } else if (row.status === 'completed') {
    stopTripStream();
    showScreen('rate');
  }

  // Update driver marker position if tracking screen is visible
  if (row.driver_lat && row.driver_lng) {
    updateDriverMarker(row.driver_lat, row.driver_lng);
  }
}

function updateDriverMarker(lat, lng) {
  const latEl = document.querySelector('.driver-track-lat');
  const lngEl = document.querySelector('.driver-track-lng');
  if (latEl) latEl.textContent = lat;
  if (lngEl) lngEl.textContent = lng;
}

function renderTrackingScreen(trip) {
  if (!trip.driver) return;
  const d = trip.driver;

  const nameEl = document.querySelector('.driver-track-name');
  if (nameEl) nameEl.textContent = d.name;

  const plateEl = document.querySelector('.driver-track-plate');
  if (plateEl) plateEl.textContent = `${d.plate} · ${d.vehicle}`;

  const ratingEl = document.querySelector('.driver-track-rating span');
  if (ratingEl) ratingEl.textContent = d.rating + ' · ' + d.total_trips + ' trips';
}

// ── Cancel search / trip ───────────────────────
document.querySelectorAll('.btn-cancel-search, .btn-cancel-trip').forEach(btn =>
  btn.addEventListener('click', async () => {
    if (!activeTrip) { goHome(); return; }
    const data = await apiFetch('/trips/cancel.php', 'POST', { trip_id: activeTrip.id });
    if (data) {
      stopTripStream();
      activeTrip = null;
      showToast('Trip cancelled');
      goHome();
    }
  })
);

// ── Simulate trip complete (demo / testing only) ─
document.querySelector('.btn-complete')?.addEventListener('click', () => {
  stopTripStream();
  showScreen('rate');
});

// ══════════════════════════════════════════════
//  RATE DRIVER
// ══════════════════════════════════════════════

const starBtns = document.querySelectorAll('.star-btn');
let selectedStars = 5;

starBtns.forEach((btn, i) => {
  btn.addEventListener('click', () => {
    selectedStars = i + 1;
    starBtns.forEach((b, j) => {
      b.classList.toggle('active', j <= i);
      b.classList.toggle('dim',    j >  i);
    });
  });
});

document.querySelectorAll('.aspect-chip').forEach(chip =>
  chip.addEventListener('click', () => chip.classList.toggle('selected'))
);

document.querySelector('.btn-submit-rate')?.addEventListener('click', async () => {
  if (!activeTrip) { showScreen('history'); return; }

  const btn     = document.querySelector('.btn-submit-rate');
  const comment = document.querySelector('.rate-comment')?.value?.trim();
  const aspects = [...document.querySelectorAll('.aspect-chip.selected')]
                    .map(c => c.textContent.trim());
  const tipBtns = document.querySelectorAll('.tip-btn');
  let tip = 0;
  tipBtns.forEach(b => { if (b.classList.contains('selected')) tip = parseInt(b.dataset.amount || 0); });

  setLoading(btn, true);
  try {
    await apiFetch('/ratings/submit.php', 'POST', {
      trip_id:    activeTrip.id,
      stars:      selectedStars,
      comment:    comment || undefined,
      aspects:    aspects,
      tip_amount: tip,
    });
    showToast('Thank you for rating!', 'success');
    activeTrip = null;
    loadHistory();
    showScreen('history');
  } finally {
    setLoading(btn, false);
  }
});

document.querySelector('.btn-to-history')?.addEventListener('click', () => {
  loadHistory();
  showScreen('history');
});

// ══════════════════════════════════════════════
//  TRIP HISTORY
// ══════════════════════════════════════════════

async function loadHistory() {
  const list = document.querySelector('.history-list');
  if (!list) return;

  list.innerHTML = '<div class="mx-loading">Loading trips…</div>';

  try {
    const data = await apiFetch('/trips/history.php?page=1');
    if (!data) return;

    renderHistorySummary(data.summary);

    if (!data.trips.length) {
      list.innerHTML = '<div class="mx-empty">No trips yet. Book your first ride!</div>';
      return;
    }

    list.innerHTML = data.trips.map(trip => `
      <div class="history-card">
        <div class="hc-top">
          <span class="hc-date">${formatDate(trip.created_at)}</span>
          <span class="hc-fare">${trip.fare ? 'UGX ' + Number(trip.fare).toLocaleString() : '—'}</span>
        </div>
        ${trip.driver_name ? `
        <div class="hc-driver">
          <div class="hc-driver-av">${initials(trip.driver_name)}</div>
          <span class="hc-driver-name">${trip.driver_name} · ${trip.driver_vehicle || ''}</span>
          <span class="hc-driver-stars">${trip.rating_stars ? '★'.repeat(trip.rating_stars) + ' ' + trip.rating_stars + '.0' : 'Not rated'}</span>
        </div>` : ''}
        <div class="hc-route">
          <div class="hc-route-point"><i class="fa-solid fa-circle" style="color:var(--success);"></i><span>${trip.pickup_address}</span></div>
          <div class="hc-route-point"><i class="fa-solid fa-location-dot" style="color:var(--danger);"></i><span>${trip.dropoff_address}</span></div>
        </div>
        <span class="hc-status ${trip.status === 'completed' ? 'hcs-done' : 'hcs-cancel'}">
          <i class="fa-solid ${trip.status === 'completed' ? 'fa-check' : 'fa-xmark'}"></i>
          ${capitalise(trip.status)}
        </span>
      </div>
    `).join('');
  } catch (_) {
    list.innerHTML = '<div class="mx-empty">Could not load trips.</div>';
  }
}

function renderHistorySummary(s) {
  const totalEl  = document.querySelector('.summary-trips');
  const spentEl  = document.querySelector('.summary-spent');
  const ratingEl = document.querySelector('.summary-rating');
  if (totalEl)  totalEl.textContent  = s.total_trips;
  if (spentEl)  spentEl.textContent  = 'UGX ' + formatAmount(s.total_spent);
  if (ratingEl) ratingEl.textContent = s.avg_rating_given + '★';
}

// ══════════════════════════════════════════════
//  PROFILE
// ══════════════════════════════════════════════

async function loadProfile() {
  try {
    const data = await apiFetch('/profile/get.php');
    if (!data) return;

    const u = data.user;
    currentUser = u;

    const nameEl   = document.querySelector('.pf-name');
    const phoneEl  = document.querySelector('.pf-phone');
    const tripsEl  = document.querySelectorAll('.pf-stat-value')[0];
    const spentEl  = document.querySelectorAll('.pf-stat-value')[1];
    const ratingEl = document.querySelectorAll('.pf-stat-value')[2];
    const refEl    = document.querySelectorAll('.pf-stat-value')[3];
    const walletEl = document.querySelector('.pf-wallet-balance');

    if (nameEl)   nameEl.textContent   = u.name;
    if (phoneEl)  phoneEl.textContent  = u.phone;
    if (tripsEl)  tripsEl.textContent  = u.total_trips;
    if (spentEl)  spentEl.textContent  = 'UGX ' + formatAmount(u.total_spent);
    if (ratingEl) ratingEl.textContent = u.rating + '★';
    if (refEl)    refEl.textContent    = u.referrals;
    if (walletEl) walletEl.textContent = 'UGX ' + formatAmount(u.wallet_balance);

    const avatarEl = document.querySelector('.pf-avatar');
    if (avatarEl)  avatarEl.textContent = initials(u.name);
  } catch (_) {}
}

document.querySelectorAll('.btn-to-profile').forEach(b =>
  b.addEventListener('click', () => { loadProfile(); showScreen('profile'); })
);

// Sign out
document.querySelector('.btn-logout-profile')?.addEventListener('click', doLogout);

// Sign out from profile list item
document.querySelector('[data-action="logout"]')?.addEventListener('click', doLogout);

// ══════════════════════════════════════════════
//  NEARBY DRIVERS (loaded on home screen open)
// ══════════════════════════════════════════════

async function loadNearbyDrivers() {
  try {
    const data = await apiFetch('/trips/nearby.php');
    if (!data) return;
    const countEl = document.getElementById('nearbyCount');
    if (countEl) {
      countEl.textContent = `${data.count} driver${data.count !== 1 ? 's' : ''} nearby`;
    }
    // Animate driver dots on mock map to match real count
    const dots = document.querySelectorAll('.driver-dot');
    dots.forEach((dot, i) => {
      dot.style.display = i < Math.min(data.count, dots.length) ? 'flex' : 'none';
    });
  } catch (_) {
    const countEl = document.getElementById('nearbyCount');
    if (countEl) countEl.textContent = 'drivers nearby';
  }
}

// ══════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'Today, ' + d.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday, ' + d.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-UG', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatAmount(n) {
  const num = parseFloat(n) || 0;
  return num >= 1000000
    ? (num / 1000000).toFixed(1) + 'M'
    : num >= 1000
      ? (num / 1000).toFixed(0) + 'K'
      : num.toLocaleString();
}

function initials(name) {
  return name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function capitalise(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// ══════════════════════════════════════════════
//  REGISTER SERVICE WORKER
// ══════════════════════════════════════════════

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swPath = window.location.pathname.replace(/client.*/, 'client/sw.js');
    navigator.serviceWorker.register(swPath)
      .catch(err => console.warn('SW registration failed:', err));
  });
}

// ══════════════════════════════════════════════
//  PWA INSTALL PROMPT
// ══════════════════════════════════════════════

let _installPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();          // stop the mini-infobar
  _installPrompt = e;
  showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  hideInstallBanner();
  _installPrompt = null;
});

function showInstallBanner() {
  if (document.getElementById('pwa-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-banner';
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex:1;">
      <div style="width:40px;height:40px;background:#D946EF;border-radius:10px;display:grid;place-items:center;font-size:20px;font-weight:900;color:#ffffff;flex-shrink:0;">M</div>
      <div>
        <div style="font-size:13px;font-weight:700;color:#fff;">Install Matlex Ride</div>
        <div style="font-size:11px;color:rgba(255,255,255,.6);">Add to home screen for faster access</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-shrink:0;">
      <button id="pwa-install-btn" style="padding:8px 16px;background:#D946EF;color:#ffffff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">Install</button>
      <button id="pwa-dismiss-btn" style="padding:8px 12px;background:rgba(255,255,255,.12);color:#fff;border:none;border-radius:10px;font-size:13px;cursor:pointer;">✕</button>
    </div>`;

  Object.assign(banner.style, {
    position: 'fixed', bottom: '80px', left: '12px', right: '12px',
    background: '#1a1f2e', border: '1px solid rgba(217,70,239,.3)',
    borderRadius: '16px', padding: '14px 14px', display: 'flex',
    alignItems: 'center', gap: '12px', zIndex: '9998',
    boxShadow: '0 8px 32px rgba(0,0,0,.4)',
    animation: 'mx-slide-up .35s ease',
  });

  document.body.appendChild(banner);

  document.getElementById('pwa-install-btn').addEventListener('click', async () => {
    if (!_installPrompt) return;
    _installPrompt.prompt();
    const { outcome } = await _installPrompt.userChoice;
    if (outcome === 'accepted') hideInstallBanner();
    _installPrompt = null;
  });

  document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
    hideInstallBanner();
    sessionStorage.setItem('pwa-dismissed', '1');
  });
}

function hideInstallBanner() {
  document.getElementById('pwa-banner')?.remove();
}

// ══════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  checkAuth(); // restore session or show login
});
