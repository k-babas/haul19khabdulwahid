import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, bearingDeg, nearestRouteEnd, pickEntryEnd, formatDistance } from '../core.mjs';

const PONPES = [-7.0512508, 111.1699951];

// Jalur masuk nyata: mulai dari jalan raya, berakhir di ponpes
const IN_ROUTE = {
  id: 'motor-in-pagi', vehicle: 'motor', timeSlot: 'pagi', direction: 'in',
  coords: [
    [-7.059198, 111.174917],
    [-7.055856, 111.168967],
    [-7.053401, 111.169402],
    [-7.051711, 111.170477],
    [-7.051203, 111.170206]
  ]
};

test('haversineKm: jarak titik sama -> 0', () => {
  assert.equal(haversineKm(PONPES, PONPES), 0);
});

test('haversineKm: ponpes ke jalan raya sekitar 1.0-1.2 km', () => {
  const d = haversineKm(PONPES, [-7.059198, 111.174917]);
  assert.ok(d > 1.0 && d < 1.2, `dapat ${d}`);
});

test('haversineKm: simetris', () => {
  const a = [-7.05, 111.16];
  const b = [-7.07, 111.18];
  assert.equal(haversineKm(a, b).toFixed(9), haversineKm(b, a).toFixed(9));
});

test('bearingDeg: utara = 0', () => {
  const b = bearingDeg([-7.05, 111.17], [-7.04, 111.17]);
  assert.ok(Math.abs(b) < 1 || Math.abs(b - 360) < 1, `dapat ${b}`);
});

test('bearingDeg: timur = 90', () => {
  const b = bearingDeg([-7.05, 111.17], [-7.05, 111.18]);
  assert.ok(Math.abs(b - 90) < 1, `dapat ${b}`);
});

test('bearingDeg: selatan = 180', () => {
  const b = bearingDeg([-7.05, 111.17], [-7.06, 111.17]);
  assert.ok(Math.abs(b - 180) < 1, `dapat ${b}`);
});

test('bearingDeg: barat = 270', () => {
  const b = bearingDeg([-7.05, 111.17], [-7.05, 111.16]);
  assert.ok(Math.abs(b - 270) < 1, `dapat ${b}`);
});

test('nearestRouteEnd: user di jalan raya -> ujung masuk', () => {
  const pos = [-7.0585, 111.1745];
  const end = nearestRouteEnd(IN_ROUTE, pos);
  assert.deepEqual(end.coord, IN_ROUTE.coords[0]);
  assert.equal(end.index, 0);
  assert.ok(end.distanceKm < 0.2);
});

test('nearestRouteEnd: user di ponpes -> ujung akhir', () => {
  const end = nearestRouteEnd(IN_ROUTE, PONPES);
  assert.deepEqual(end.coord, IN_ROUTE.coords[IN_ROUTE.coords.length - 1]);
  assert.equal(end.index, IN_ROUTE.coords.length - 1);
});

test('pickEntryEnd: pakai ujung yang lebih dekat ke user', () => {
  const nearStart = pickEntryEnd(IN_ROUTE, [-7.0585, 111.1745]);
  assert.equal(nearStart.index, 0);
  const nearEnd = pickEntryEnd(IN_ROUTE, PONPES);
  assert.equal(nearEnd.index, IN_ROUTE.coords.length - 1);
});

test('pickEntryEnd: tidak mengubah koordinat asli', () => {
  const before = JSON.stringify(IN_ROUTE.coords);
  pickEntryEnd(IN_ROUTE, [-7.0585, 111.1745]);
  assert.equal(JSON.stringify(IN_ROUTE.coords), before);
});

test('formatDistance: di bawah 1 km pakai meter', () => {
  assert.equal(formatDistance(0.35), '350 m');
  assert.equal(formatDistance(0.004), '4 m');
});

test('formatDistance: 1 km ke atas pakai km', () => {
  assert.equal(formatDistance(1.605), '1,6 km');
  assert.equal(formatDistance(12.04), '12,0 km');
});
