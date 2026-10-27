import {
  pickRoutes, pickParking, buildTimeOptions, validateData, routeBounds,
  toLineString, toPolygon, haversineKm, bearingDeg, pickEntryEnd, formatDistance
} from './core.mjs';

const el = id => document.getElementById(id);
const DARK = '#0f172a';

const state = {
  data: null, map: null, markers: [], is3D: false, ready: false,
  userPos: null, userMarker: null, userLayerReady: false
};
window.__haul = state;  // untuk diagnosa & test

const emptyFC = () => ({ type: 'FeatureCollection', features: [] });

async function boot() {
  try {
    const res = await fetch('data/routes.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    return fail(`Gagal memuat data rute: ${err.message}`);
  }

  const errs = validateData(state.data);
  if (errs.length) {
    return fail(`Data rute bermasalah:\n• ${errs.join('\n• ')}`);
  }

  const { event, vehicles } = state.data;
  document.title = `${event.name} — Peta Rute`;
  el('event-name').textContent = event.name;
  el('event-meta').textContent =
    `${event.date} · ${event.location.label}` +
    (event.address ? ` · ${event.address}` : '');

  const vs = el('vehicle-select');
  for (const v of vehicles) {
    const o = document.createElement('option');
    o.value = v.id;
    o.textContent = `${v.icon || ''} ${v.label}`.trim();
    vs.appendChild(o);
  }

  state.map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [event.location.lng, event.location.lat],
    zoom: 13,
    pitch: 0,
    bearing: 0,
    attributionControl: { compact: true },
    fadeDuration: 0
  });


  // MapLibre di environment ini tidak selalu memicu event 'load'.
  // Jadi inisialisasi dipicu oleh polling isStyleLoaded() — deterministik.
  let inited = false;
  function initOnce() {
    if (inited) return;
    // Jangan pakai isStyleLoaded(): di environment ini sprite/glyph bisa
    // menggantung selamanya sehingga flag itu tidak pernah true.
    // Cukup pastikan stylesheet sudah terpasang.
    const m = state.map;
    const sheet = m.style && m.style.stylesheet;
    if (!sheet || !sheet.layers || sheet.layers.length === 0) return;
    inited = true;
    try {
      addTerrain();
      addEventMarker();
      ensureLayers();
      state.ready = true;
      render();
      el('status').dataset.probe = 'init-ok|routes=' + state.data.routes.length;
    } catch (err) {
      fail('Render gagal: ' + (err && err.message ? err.message : err));
      el('status').dataset.probe = 'err|' + (err && err.message ? err.message : err);
    }
  }

  state.map.on('styledata', initOnce);
  state.map.on('idle', initOnce);
  state.map.on('load', initOnce);
  const poll = setInterval(() => {
    if (inited) return clearInterval(poll);
    initOnce();
  }, 250);
  setTimeout(() => clearInterval(poll), 30000);

  state.map.on('error', e => {
    const msg = e?.error?.message || String(e);
    window.__mapErrors = window.__mapErrors || [];
    window.__mapErrors.push(msg);
    console.warn('map error:', msg);
  });

  vs.addEventListener('change', onVehicleChange);
  el('time-select').addEventListener('change', render);
  el('reset-btn').addEventListener('click', reset);
  el('tilt-btn').addEventListener('click', toggle3D);
  el('locate-btn').addEventListener('click', locateUser);

  // Editor dipasang setelah map siap; tidak memakai event 'load' karena
  // event itu tidak selalu fire di environment ini.
  let editorMounted = false;
  async function mountEditorOnce() {
    if (editorMounted) return;
    if (!state.ready) return;
    editorMounted = true;
    try {
      const { mountEditor } = await import('./editor.mjs');
      mountEditor(state.map, state.data);
      el('status').dataset.editor = 'mounted';
    } catch (err) {
      el('status').dataset.editor = 'err|' + (err && err.message ? err.message : err);
    }
  }
  if (new URLSearchParams(location.search).has('edit')) {
    const editPoll = setInterval(() => {
      if (editorMounted) return clearInterval(editPoll);
      mountEditorOnce();
    }, 250);
    setTimeout(() => clearInterval(editPoll), 30000);
  }
}

function osmRasterStyle() {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }
    },
    layers: [
      { id: 'osm', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 22 }
    ]
  };
}

function fail(msg) {
  const s = el('status');
  s.textContent = msg;
  s.classList.add('error');
}

function addTerrain() {
  const m = state.map;
  try {
    // DEM gratis tidak tersedia untuk area Grobogan; 3D pakai pitch saja.
    if (!window.__enableTerrain) return;
    m.addSource('terrain', {
      type: 'raster-dem',
      url: 'https://demotiles.maplibre.org/terrain-tiles/tiles.json',
      tileSize: 256
    });
    m.setTerrain({ source: 'terrain', exaggeration: 1.4 });
  } catch (e) {
    console.warn('terrain tidak tersedia, lanjut tanpa terrain:', e.message);
  }
}

function addEventMarker() {
  const { lat, lng, label } = state.data.event.location;
  new maplibregl.Marker({ color: DARK })
    .setLngLat([lng, lat])
    .setPopup(new maplibregl.Popup().setHTML(`<strong>${label}</strong>`))
    .addTo(state.map);
}

function ensureLayers() {
  const m = state.map;

  if (!m.getSource('routes')) {
    m.addSource('routes', { type: 'geojson', data: emptyFC() });
  }
  if (!m.getLayer('routes-casing')) {
    m.addLayer({
      id: 'routes-casing', type: 'line', source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 }
    });
  }
  if (!m.getLayer('routes-line')) {
    m.addLayer({
      id: 'routes-line', type: 'line', source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 5 }
    });
  }

  if (!m.getSource('parking')) {
    m.addSource('parking', { type: 'geojson', data: emptyFC() });
  }
  if (!m.getLayer('parking-zone')) {
    m.addLayer({
      id: 'parking-zone', type: 'fill', source: 'parking',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.25 }
    });
  }
  if (!m.getLayer('parking-edge')) {
    m.addLayer({
      id: 'parking-edge', type: 'line', source: 'parking',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'line-color': '#f59e0b', 'line-width': 2 }
    });
  }

  // Garis putus-putus dari posisi user ke titik sambung rute.
  if (!m.getSource('user-link')) {
    m.addSource('user-link', { type: 'geojson', data: emptyFC() });
  }
  if (!m.getLayer('user-link-line')) {
    m.addLayer({
      id: 'user-link-line', type: 'line', source: 'user-link',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#dc2626', 'line-width': 3, 'line-opacity': 0.85,
        'line-dasharray': [2, 2]
      }
    });
  }
  state.userLayerReady = true;
}

function onVehicleChange() {
  const vehicleId = el('vehicle-select').value;
  const ts = el('time-select');
  const previous = ts.value;
  ts.innerHTML = '<option value="">— pilih —</option>';
  const opts = buildTimeOptions(state.data, vehicleId);
  for (const t of opts) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.label;
    ts.appendChild(o);
  }
  // Pertahankan pilihan waktu kalau slot itu masih ada untuk kendaraan baru.
  if (previous && opts.some(t => t.id === previous)) {
    ts.value = previous;
  } else if (opts.length === 1) {
    ts.value = opts[0].id;
  } else {
    ts.value = '';
  }
  render();
}

function render() {
  if (!state.ready) return;

  for (const m of state.markers) m.remove();
  state.markers = [];

  const vehicleId = el('vehicle-select').value;
  const timeId = el('time-select').value;
  const legend = el('legend');
  const list = el('legend-list');
  list.innerHTML = '';
  el('parking-info').textContent = '';
  el('route-notes').textContent = '';
  el('parking-heading').hidden = true;

  if (!vehicleId || !timeId) {
    state.map.getSource('routes').setData(emptyFC());
    state.map.getSource('parking').setData(emptyFC());
    el('status').textContent = 'Pilih tipe kendaraan dan waktu untuk melihat rute.';
    el('status').classList.remove('error');
    legend.hidden = true;
    clearUserLink();
    if (state.userPos) {
      const ev2 = state.data.event.location;
      setLocateInfo(
        'Posisi Anda terdeteksi. Jarak ke lokasi haul ±' +
        formatDistance(haversineKm(state.userPos, [ev2.lat, ev2.lng])) +
        '. Pilih tipe kendaraan dan waktu untuk melihat titik sambung rute.'
      );
    }
    resetCamera();
    return;
  }

  const routes = pickRoutes(state.data, vehicleId, timeId);
  const parking = pickParking(state.data, vehicleId);

  if (routes.length === 0) {
    state.map.getSource('routes').setData(emptyFC());
    state.map.getSource('parking').setData(emptyFC());
    fail('Belum ada rute untuk kombinasi ini. Hubungi panitia.');
    legend.hidden = true;
    return;
  }

  el('status').textContent =
    `${routes.length} rute · ${parking.length} lokasi parkir`;
  el('status').classList.remove('error');

  state.map.getSource('routes').setData({
    type: 'FeatureCollection',
    features: routes.map(r => ({
      type: 'Feature',
      properties: { id: r.id, color: r.color || '#2563eb', label: r.label },
      geometry: toLineString(r.coords)
    }))
  });

  const parkFC = { type: 'FeatureCollection', features: [] };
  for (const p of parking) {
    if (Array.isArray(p.zone) && p.zone.length >= 3) {
      parkFC.features.push({
        type: 'Feature',
        properties: { id: p.id, label: p.label },
        geometry: toPolygon(p.zone)
      });
    }
    const marker = new maplibregl.Marker({ color: '#f59e0b' })
      .setLngLat([p.lng, p.lat])
      .setPopup(new maplibregl.Popup().setHTML(`<strong>${p.label}</strong>`))
      .addTo(state.map);
    state.markers.push(marker);
  }
  state.map.getSource('parking').setData(parkFC);

  for (const r of routes) {
    const arrow = r.direction === 'in' ? '▶' : '◀';
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="swatch" style="background:${r.color || '#2563eb'}"></span>` +
      `${arrow} ${r.label}`;
    list.appendChild(li);
  }

  if (parking.length) {
    el('parking-heading').hidden = false;
    el('parking-info').textContent = parking
      .map(p => `${p.label}${p.notes ? ` — ${p.notes}` : ''}`)
      .join(' · ');
  }

  const notes = routes.map(r => r.notes).filter(Boolean);
  el('route-notes').textContent = notes.join(' · ');
  legend.hidden = false;

  fitToResults(routes, parking);
  linkUserToRoutes(routes);
}

function fitToResults(routes, parking) {
  if (!routeBounds(routes)) return resetCamera();
  const lngs = [];
  const lats = [];
  for (const r of routes) {
    for (const [lat, lng] of r.coords) { lats.push(lat); lngs.push(lng); }
  }
  for (const p of parking) { lats.push(p.lat); lngs.push(p.lng); }
  state.map.fitBounds(
    [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
    { padding: 60, pitch: state.is3D ? 45 : 0, duration: 0 }
  );
}

function resetCamera() {
  const { lat, lng } = state.data.event.location;
  state.map.jumpTo({
    center: [lng, lat], zoom: 13,
    pitch: state.is3D ? 45 : 0,
    bearing: state.is3D ? -20 : 0
  });
}


// ---------- Geolocation ----------

function setLocateInfo(text, isError) {
  const box = el('locate-info');
  box.hidden = !text;
  box.textContent = text || '';
  box.classList.toggle('error', !!isError);
}

function ensureUserMarker(lat, lng) {
  if (!state.userMarker) {
    const wrap = document.createElement('div');
    wrap.className = 'user-dot';
    wrap.title = 'Posisi Anda';
    state.userMarker = new maplibregl.Marker({ element: wrap, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(state.map);
  } else {
    state.userMarker.setLngLat([lng, lat]);
  }
}

function clearUserLink() {
  if (!state.userLayerReady) return;
  const src = state.map.getSource('user-link');
  if (src) src.setData(emptyFC());
}

// Sambungkan posisi user ke rute terpilih: pilih ujung rute yang paling
// dekat, gambar garis putus-putus, dan laporkan jarak + arah.
function linkUserToRoutes(routes) {
  if (!state.userLayerReady || !state.userPos) return clearUserLink();
  if (!routes || routes.length === 0) return clearUserLink();

  const inbound = routes.find(r => r.direction === 'in') || routes[0];
  const entry = pickEntryEnd(inbound, state.userPos);
  if (!entry) return clearUserLink();


  const [uLat, uLng] = state.userPos;
  const [eLat, eLng] = entry.coord;

  state.map.getSource('user-link').setData({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[uLng, uLat], [eLng, eLat]] }
    }]
  });

  const brg = bearingDeg(state.userPos, entry.coord);
  const dir = bearingToCompass(brg);
  const sisa = formatDistance(entry.lengthKm);
  const total = formatDistance(entry.distanceKm + entry.lengthKm);

  if (entry.distanceKm < 0.05) {
    setLocateInfo(
      `Anda sudah di jalur rute. Ikuti garis sampai tujuan, ` +
      `sisa ±${sisa}.`
    );
  } else {
    setLocateInfo(
      `Jarak Anda ke rute ±${formatDistance(entry.distanceKm)} ` +
      `(arah ${dir}). Sambung di titik merah, lalu ikuti garis: ` +
      `sisa ±${sisa}, total ±${total}.`
    );
  }
}

function bearingToCompass(deg) {
  const names = ['utara', 'timur laut', 'timur', 'tenggara',
                 'selatan', 'barat daya', 'barat', 'barat laut'];
  return names[Math.round(deg / 45) % 8];
}

function locateUser() {
  if (!state.ready) {
    setLocateInfo('Peta belum siap. Coba lagi sebentar.', true);
    return;
  }
  if (!navigator.geolocation) {
    setLocateInfo('Browser ini tidak mendukung deteksi lokasi.', true);
    return;
  }

  const btn = el('locate-btn');
  btn.disabled = true;
  btn.classList.add('active');
  setLocateInfo('Mendeteksi lokasi Anda…');

  navigator.geolocation.getCurrentPosition(
    pos => {
      btn.disabled = false;
      btn.classList.remove('active');
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      state.userPos = [lat, lng];
      ensureUserMarker(lat, lng);

      const vehicleId = el('vehicle-select').value;
      const timeId = el('time-select').value;
      if (!vehicleId || !timeId) {
        setLocateInfo(
          `Posisi Anda terdeteksi (akurasi ±${Math.round(pos.coords.accuracy)} m). ` +
          'Pilih tipe kendaraan dan waktu untuk melihat titik sambung rute.'
        );
      }
      render();

      const ev = state.data.event.location;
      const toVenue = haversineKm([lat, lng], [ev.lat, ev.lng]);
      if (!vehicleId || !timeId) {
        setLocateInfo(
          `Posisi Anda terdeteksi (akurasi ±${Math.round(pos.coords.accuracy)} m). ` +
          `Jarak ke lokasi haul ±${formatDistance(toVenue)}. ` +
          'Pilih tipe kendaraan dan waktu untuk melihat titik sambung rute.'
        );
      }
    },
    err => {
      btn.disabled = false;
      btn.classList.remove('active');
      const msg = {
        1: 'Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser.',
        2: 'Lokasi tidak tersedia. Cek sinyal GPS / koneksi.',
        3: 'Deteksi lokasi melebihi batas waktu. Coba lagi.'
      }[err.code] || ('Gagal mendeteksi lokasi: ' + err.message);
      setLocateInfo(msg, true);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
  );
}

function toggle3D() {
  state.is3D = !state.is3D;
  el('tilt-btn').classList.toggle('active', state.is3D);
  const m = state.map;
  m.jumpTo({
    center: m.getCenter(),
    zoom: m.getZoom(),
    pitch: state.is3D ? 50 : 0,
    bearing: state.is3D ? -20 : 0
  });
}

function reset() {
  el('vehicle-select').value = '';
  el('time-select').innerHTML = '<option value="">— pilih —</option>';
  render();
}

boot();
