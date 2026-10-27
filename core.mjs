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
