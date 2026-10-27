// Mode gambar jalur. Aktif hanya dengan ?edit=1.
// Alur: pilih kendaraan/slot/arah, klik peta menambah titik, "Selesai"
// menghasilkan objek JSON siap tempel ke array routes di data/routes.json.

export function mountEditor(map, data) {
  const panel = document.createElement('aside');
  panel.className = 'editor-panel';
  panel.innerHTML = `
    <h2>Editor Jalur</h2>
    <label>Kendaraan
      <select id="ed-vehicle">
        ${data.vehicles.map(v => `<option value="${v.id}">${v.label}</option>`).join('')}
      </select>
    </label>
    <label>Slot
      <select id="ed-slot">
        ${data.timeSlots.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
        <option value="all">Semua waktu</option>
      </select>
    </label>
    <label>Arah
      <select id="ed-direction">
        <option value="in">Masuk</option>
        <option value="out">Keluar</option>
      </select>
    </label>
    <p class="ed-hint">Klik peta untuk menambah titik.</p>
    <p id="ed-count">0 titik</p>
    <div class="ed-actions">
      <button id="ed-undo" type="button">Undo</button>
      <button id="ed-finish" type="button">Selesai</button>
      <button id="ed-copy" type="button">Salin JSON</button>
    </div>
    <textarea id="ed-out" readonly rows="10"></textarea>
  `;
  document.body.appendChild(panel);

  const style = document.createElement('style');
  style.textContent = `
    .editor-panel {
      position: fixed; right: 12px; bottom: 12px; z-index: 9999;
      width: 300px; max-height: 70vh; overflow: auto; padding: 12px;
      background: #fff; border: 1px solid #cbd5e1; border-radius: 10px;
      box-shadow: 0 8px 24px rgba(15,23,42,.2); font-size: .85rem;
    }
    .editor-panel h2 { margin: 0 0 8px; font-size: .95rem; }
    .editor-panel label { display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }
    .editor-panel select, .editor-panel textarea {
      width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px;
      font-family: ui-monospace, monospace; font-size: .75rem;
    }
    .ed-hint { margin: 4px 0; color: #475569; }
    .ed-actions { display: flex; gap: 6px; margin: 8px 0; }
    .ed-actions button {
      flex: 1; padding: 6px; font-size: .8rem; border: 1px solid #cbd5e1;
      border-radius: 6px; background: #fff; cursor: pointer;
    }
    .ed-actions button:hover { background: #f1f5f9; }
  `;
  document.head.appendChild(style);

  let points = [];
  const geojson = { type: 'FeatureCollection', features: [] };

  map.addSource('draw', { type: 'geojson', data: geojson });
  map.addLayer({
    id: 'draw-line', type: 'line', source: 'draw',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#ef4444', 'line-width': 4, 'line-dasharray': [2, 1] }
  });
  map.addLayer({
    id: 'draw-points', type: 'circle', source: 'draw',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 5, 'circle-color': '#ef4444' }
  });

  const redraw = () => {
    const feats = points.map(([lng, lat]) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [lng, lat] }
    }));
    if (points.length >= 2) {
      feats.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: points.slice() }
      });
    }
    map.getSource('draw').setData({ type: 'FeatureCollection', features: feats });
    document.getElementById('ed-count').textContent = points.length + ' titik';
  };

  map.on('click', e => {
    points.push([e.lngLat.lng, e.lngLat.lat]);
    redraw();
  });

  document.getElementById('ed-undo').onclick = () => {
    points.pop();
    redraw();
  };

  document.getElementById('ed-finish').onclick = () => {
    if (points.length < 2) {
      alert('Minimal 2 titik.');
      return;
    }
    const vehicle = document.getElementById('ed-vehicle').value;
    const slot = document.getElementById('ed-slot').value;
    const direction = document.getElementById('ed-direction').value;
    const out = {
      id: vehicle + '-' + direction + '-' + slot + '-' + Date.now().toString(36),
      vehicle: vehicle,
      timeSlot: slot,
      direction: direction,
      label: vehicle + ' \u2014 ' + (direction === 'in' ? 'Masuk' : 'Keluar') + ' (' + slot + ')',
      color: direction === 'in' ? '#2563eb' : '#16a34a',
      coords: points.map(([lng, lat]) => [
        Math.round(lat * 1e6) / 1e6,
        Math.round(lng * 1e6) / 1e6
      ]),
      notes: ''
    };
    document.getElementById('ed-out').value = JSON.stringify(out, null, 2);
  };

  document.getElementById('ed-copy').onclick = async () => {
    const ta = document.getElementById('ed-out');
    if (!ta.value) return alert('Klik "Selesai" dulu.');
    try {
      await navigator.clipboard.writeText(ta.value);
      alert('JSON tersalin. Tempel ke array routes di data/routes.json.');
    } catch (err) {
      ta.select();
      alert('Tekan Ctrl+C untuk menyalin.');
    }
  };
}
