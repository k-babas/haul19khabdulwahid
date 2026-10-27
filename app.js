import {
  pickRoutes, pickParking, buildTimeOptions, validateData, routeBounds,
  toLineString, toPolygon
} from './core.mjs';

const el = id => document.getElementById(id);
const DARK = '#0f172a';

const state = { data: null, map: null, markers: [], is3D: false, ready: false };

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
    style: 'https://demotiles.maplibre.org/style.json',
    center: [event.location.lng, event.location.lat],
    zoom: 13,
    pitch: 0,
    bearing: 0,
    attributionControl: { compact: true }
  });

  state.map.on('load', () => {
    addTerrain();
    addEventMarker();
    ensureLayers();
    state.ready = true;
    render();
  });

  state.map.on('error', e => {
    console.warn('map error:', e?.error?.message || e);
  });

  vs.addEventListener('change', onVehicleChange);
  el('time-select').addEventListener('change', render);
  el('reset-btn').addEventListener('click', reset);
  el('tilt-btn').addEventListener('click', toggle3D);

  if (new URLSearchParams(location.search).has('edit')) {
    const { mountEditor } = await import('./editor.mjs');
    state.map.once('load', () => mountEditor(state.map, state.data));
  }
}

function fail(msg) {
  const s = el('status');
  s.textContent = msg;
  s.classList.add('error');
}

function addTerrain() {
  const m = state.map;
  try {
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
}

function onVehicleChange() {
  const vehicleId = el('vehicle-select').value;
  const ts = el('time-select');
  ts.innerHTML = '<option value="">— pilih —</option>';
  const opts = buildTimeOptions(state.data, vehicleId);
  for (const t of opts) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.label;
    ts.appendChild(o);
  }
  if (opts.length === 1) ts.value = opts[0].id;
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
    { padding: 60, pitch: state.is3D ? 45 : 0, duration: 700 }
  );
}

function resetCamera() {
  const { lat, lng } = state.data.event.location;
  state.map.easeTo({
    center: [lng, lat], zoom: 13,
    pitch: state.is3D ? 45 : 0,
    bearing: state.is3D ? -20 : 0,
    duration: 600
  });
}

function toggle3D() {
  state.is3D = !state.is3D;
  el('tilt-btn').classList.toggle('active', state.is3D);
  state.map.easeTo({
    pitch: state.is3D ? 50 : 0,
    bearing: state.is3D ? -20 : 0,
    duration: 700
  });
}

function reset() {
  el('vehicle-select').value = '';
  el('time-select').innerHTML = '<option value="">— pilih —</option>';
  render();
}

boot();
