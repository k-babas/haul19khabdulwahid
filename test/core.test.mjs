import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickRoutes, pickParking, buildTimeOptions, validateData, routeBounds,
  toLineString, toPolygon
} from '../core.mjs';

const data = {
  event: { location: { lat: -7.051251, lng: 111.169995, label: 'Ponpes' } },
  timeSlots: [
    { id: 'pagi', label: 'Pagi' },
    { id: 'siang', label: 'Siang' },
    { id: 'malam', label: 'Malam' }
  ],
  vehicles: [
    { id: 'motor', label: 'Motor' },
    { id: 'bus', label: 'Bus' }
  ],
  parking: [
    { id: 'p-motor', vehicle: 'motor', label: 'Parkir Motor',
      lat: -7.0512, lng: 111.1702,
      zone: [[-7.0510,111.1700],[-7.0510,111.1704],[-7.0514,111.1704]] },
    { id: 'p-bus', vehicle: 'bus', label: 'Parkir Bus', lat: -7.0600, lng: 111.1750 }
  ],
  routes: [
    { id: 'a', vehicle: 'motor', timeSlot: 'pagi', direction: 'in',
      coords: [[-7.0591,111.1749],[-7.0512,111.1702]] },
    { id: 'b', vehicle: 'motor', timeSlot: 'pagi', direction: 'out',
      coords: [[-7.0512,111.1702],[-7.0600,111.1760]] },
    { id: 'c', vehicle: 'motor', timeSlot: 'siang', direction: 'in',
      coords: [[-7.0512,111.1702],[-7.0591,111.1749]] },
    { id: 'd', vehicle: 'bus', timeSlot: 'all', direction: 'in',
      coords: [[-7.0700,111.1600],[-7.0600,111.1750]] },
    { id: 'e', vehicle: 'bus', timeSlot: 'all', direction: 'out',
      coords: [[-7.0600,111.1750],[-7.0720,111.1620]] }
  ]
};

test('pickRoutes: filter kendaraan + slot', () => {
  assert.deepEqual(pickRoutes(data, 'motor', 'pagi').map(r => r.id), ['a', 'b']);
});

test('pickRoutes: timeSlot "all" selalu ikut', () => {
  assert.deepEqual(pickRoutes(data, 'bus', 'malam').map(r => r.id), ['d', 'e']);
});

test('pickRoutes: kombinasi kosong -> []', () => {
  assert.deepEqual(pickRoutes(data, 'motor', 'malam'), []);
  assert.deepEqual(pickRoutes(data, '', 'pagi'), []);
  assert.deepEqual(pickRoutes(data, 'motor', ''), []);
});

test('buildTimeOptions: hanya slot yang punya rute', () => {
  assert.deepEqual(buildTimeOptions(data, 'motor').map(t => t.id), ['pagi', 'siang']);
  assert.deepEqual(buildTimeOptions(data, 'bus').map(t => t.id),
    ['pagi', 'siang', 'malam']);
  assert.deepEqual(buildTimeOptions(data, ''), []);
});

test('pickParking: satu parkir per kendaraan', () => {
  assert.deepEqual(pickParking(data, 'motor').map(p => p.id), ['p-motor']);
  assert.deepEqual(pickParking(data, 'bus').map(p => p.id), ['p-bus']);
  assert.deepEqual(pickParking(data, 'mobil'), []);
  assert.deepEqual(pickParking(data, ''), []);
});

test('routeBounds: bbox dari semua coords', () => {
  const b = routeBounds([data.routes[0], data.routes[1]]);
  assert.deepEqual(b, { minLat: -7.0600, maxLat: -7.0512,
                        minLng: 111.1702, maxLng: 111.1760 });
});

test('routeBounds: array kosong -> null', () => {
  assert.equal(routeBounds([]), null);
});

test('toLineString: [lat,lng] -> GeoJSON [lng,lat]', () => {
  assert.deepEqual(toLineString([[-7.0512, 111.1702], [-7.0600, 111.1750]]),
    { type: 'LineString', coordinates: [[111.1702, -7.0512], [111.1750, -7.0600]] });
});

test('toPolygon: menutup ring otomatis', () => {
  const ring = toPolygon([[-7.051,111.17],[-7.051,111.171],[-7.052,111.171]]);
  assert.equal(ring.type, 'Polygon');
  assert.equal(ring.coordinates[0].length, 4);
  assert.deepEqual(ring.coordinates[0][0], ring.coordinates[0][3]);
});

test('validateData: data valid -> []', () => {
  assert.deepEqual(validateData(data), []);
});

test('validateData: tangkap rute tanpa coords', () => {
  const bad = structuredClone(data);
  bad.routes[0].coords = [];
  const errs = validateData(bad);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /coords/);
});

test('validateData: tangkap vehicle tak dikenal', () => {
  const bad = structuredClone(data);
  bad.routes[0].vehicle = 'kapal';
  const errs = validateData(bad);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /kapal/);
});

test('validateData: tangkap direction salah', () => {
  const bad = structuredClone(data);
  bad.routes[0].direction = 'sideways';
  const errs = validateData(bad);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /direction/);
});
