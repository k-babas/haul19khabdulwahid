// Logika murni peta haul. Dipakai browser (app.js) dan test (node --test).
// Konvensi: input JSON pakai [lat, lng]; output GeoJSON pakai [lng, lat].

export function pickRoutes(data, vehicleId, timeSlotId) {
  if (!vehicleId || !timeSlotId) return [];
  return (data.routes || []).filter(
    r => r.vehicle === vehicleId &&
         (r.timeSlot === timeSlotId || r.timeSlot === 'all')
  );
}

export function buildTimeOptions(data, vehicleId) {
  if (!vehicleId) return [];
  const active = new Set(
    (data.routes || []).filter(r => r.vehicle === vehicleId).map(r => r.timeSlot)
  );
  return (data.timeSlots || []).filter(t => active.has(t.id) || active.has('all'));
}

export function pickParking(data, vehicleId) {
  if (!vehicleId) return [];
  return (data.parking || []).filter(p => p.vehicle === vehicleId);
}

export function routeBounds(routes) {
  const pts = routes.flatMap(r => r.coords || []);
  if (pts.length === 0) return null;
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of pts) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

export function toLineString(coords) {
  return { type: 'LineString', coordinates: coords.map(([lat, lng]) => [lng, lat]) };
}

export function toPolygon(zone) {
  const ring = zone.map(([lat, lng]) => [lng, lat]);
  const [fLng, fLat] = ring[0];
  const last = ring[ring.length - 1];
  if (last[0] !== fLng || last[1] !== fLat) ring.push([fLng, fLat]);
  return { type: 'Polygon', coordinates: [ring] };
}

export function validateData(data) {
  const errs = [];
  const vehicleIds = new Set((data.vehicles || []).map(v => v.id));
  const slotIds = new Set((data.timeSlots || []).map(t => t.id));

  for (const r of data.routes || []) {
    const where = `route "${r.id ?? '(tanpa id)'}"`;
    if (!vehicleIds.has(r.vehicle))
      errs.push(`${where}: vehicle "${r.vehicle}" tidak dikenal`);
    if (r.timeSlot !== 'all' && !slotIds.has(r.timeSlot))
      errs.push(`${where}: timeSlot "${r.timeSlot}" tidak dikenal`);
    if (!Array.isArray(r.coords) || r.coords.length < 2)
      errs.push(`${where}: coords minimal 2 titik`);
    else if (r.coords.some(c => !Array.isArray(c) || c.length !== 2))
      errs.push(`${where}: coords harus array [lat,lng]`);
    if (r.direction !== 'in' && r.direction !== 'out')
      errs.push(`${where}: direction harus "in" atau "out"`);
  }

  for (const p of data.parking || []) {
    const where = `parking "${p.id ?? '(tanpa id)'}"`;
    if (!vehicleIds.has(p.vehicle))
      errs.push(`${where}: vehicle "${p.vehicle}" tidak dikenal`);
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number')
      errs.push(`${where}: lat/lng harus angka`);
    if (p.zone !== undefined && (!Array.isArray(p.zone) || p.zone.length < 3))
      errs.push(`${where}: zone minimal 3 titik`);
  }

  if (!data.event?.location ||
      typeof data.event.location.lat !== 'number' ||
      typeof data.event.location.lng !== 'number')
    errs.push('event.location: lat/lng harus angka');

  return errs;
}

// ---------- Geolocation helpers (pure) ----------
// Input koordinat selalu [lat, lng], konsisten dengan skema data.

export function haversineKm(a, b) {
  const R = 6371.0;
  const r = x => (x * Math.PI) / 180;
  const [la1, lo1] = a;
  const [la2, lo2] = b;
  const dLa = r(la2 - la1);
  const dLo = r(lo2 - lo1);
  const h = Math.sin(dLa / 2) ** 2 +
            Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(from, to) {
  const r = x => (x * Math.PI) / 180;
  const d = x => (x * 180) / Math.PI;
  const [la1, lo1] = from;
  const [la2, lo2] = to;
  const y = Math.sin(r(lo2 - lo1)) * Math.cos(r(la2));
  const x = Math.cos(r(la1)) * Math.sin(r(la2)) -
            Math.sin(r(la1)) * Math.cos(r(la2)) * Math.cos(r(lo2 - lo1));
  return (d(Math.atan2(y, x)) + 360) % 360;
}

// Dari dua ujung polyline, pilih yang paling dekat ke posisi user.
// Mengembalikan objek baru; coords rute tidak pernah dimutasi.
export function nearestRouteEnd(route, pos) {
  const coords = (route && route.coords) || [];
  if (coords.length === 0) return null;
  const first = { coord: coords[0].slice(), index: 0 };
  first.distanceKm = haversineKm(pos, coords[0]);
  if (coords.length === 1) return first;
  const lastIdx = coords.length - 1;
  const last = { coord: coords[lastIdx].slice(), index: lastIdx };
  last.distanceKm = haversineKm(pos, coords[lastIdx]);
  return last.distanceKm < first.distanceKm ? last : first;
}

// Titik sambung: user masuk rute dari ujung yang paling dekat dengannya,
// lalu mengikuti sisa polyline sampai tujuan.
export function pickEntryEnd(route, pos) {
  const end = nearestRouteEnd(route, pos);
  if (!end) return null;
  const coords = route.coords;
  const forward = end.index === 0;
  const path = forward ? coords.map(c => c.slice())
                       : coords.slice().reverse().map(c => c.slice());
  let lengthKm = 0;
  for (let i = 1; i < path.length; i++) lengthKm += haversineKm(path[i - 1], path[i]);
  return {
    index: end.index,
    coord: end.coord,
    distanceKm: end.distanceKm,
    forward,
    path,
    lengthKm
  };
}

export function formatDistance(km) {
  const n = Number(km) || 0;
  if (n < 1) return `${Math.round(n * 1000)} m`;
  return `${n.toFixed(1).replace('.', ',')} km`;
}
