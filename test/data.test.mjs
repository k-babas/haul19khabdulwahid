import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateData, buildTimeOptions } from '../core.mjs';

const load = async () => JSON.parse(
  await readFile(new URL('../data/routes.json', import.meta.url), 'utf8')
);

test('data/routes.json lolos validasi', async () => {
  assert.deepEqual(validateData(await load()), []);
});

test('data: 4 kendaraan, 3 slot, 4 parkir, >=20 rute', async () => {
  const d = await load();
  assert.equal(d.vehicles.length, 4);
  assert.deepEqual(d.timeSlots.map(t => t.id), ['pagi', 'siang', 'malam']);
  assert.equal(d.parking.length, 4);
  assert.ok(d.routes.length >= 20);
});

test('data: tiap kendaraan punya minimal 1 rute masuk & 1 keluar', async () => {
  const d = await load();
  for (const v of d.vehicles) {
    const rs = d.routes.filter(r => r.vehicle === v.id);
    assert.ok(rs.some(r => r.direction === 'in'), `${v.id} tanpa rute masuk`);
    assert.ok(rs.some(r => r.direction === 'out'), `${v.id} tanpa rute keluar`);
  }
});

test('data: motor/mobil/minibus punya masuk & keluar di slot malam', async () => {
  const d = await load();
  for (const vid of ['motor', 'mobil', 'minibus']) {
    const rs = d.routes.filter(r => r.vehicle === vid && r.timeSlot === 'malam');
    assert.ok(rs.some(r => r.direction === 'in'), `${vid} tanpa masuk malam`);
    assert.ok(rs.some(r => r.direction === 'out'), `${vid} tanpa keluar malam`);
  }
});

test('data: tiap kendaraan punya tepat 1 parkir', async () => {
  const d = await load();
  for (const v of d.vehicles) {
    assert.equal(d.parking.filter(p => p.vehicle === v.id).length, 1, v.id);
  }
});

test('data: parkir tidak punya field capacity', async () => {
  const d = await load();
  for (const p of d.parking) {
    assert.equal(p.capacity, undefined, `${p.id} masih punya capacity`);
  }
});

test('data: tiap parkir punya zona polygon', async () => {
  const d = await load();
  for (const p of d.parking) {
    assert.ok(Array.isArray(p.zone) && p.zone.length >= 3, `${p.id} tanpa zona`);
  }
});

test('data: dropdown slot tiap kendaraan tidak kosong', async () => {
  const d = await load();
  for (const v of d.vehicles) {
    assert.ok(buildTimeOptions(d, v.id).length > 0, `${v.id} tanpa slot`);
  }
});

test('data: lokasi event mendekati ponpes', async () => {
  const d = await load();
  const { lat, lng } = d.event.location;
  assert.ok(Math.abs(lat - -7.0512508) < 0.01, 'lat event melenceng');
  assert.ok(Math.abs(lng - 111.1699951) < 0.01, 'lng event melenceng');
});

test('data: bus tidak sampai ponpes (tetap di jalan raya)', async () => {
  const d = await load();
  const ev = d.event.location;
  for (const r of d.routes.filter(r => r.vehicle === 'bus')) {
    const near = r.coords.some(([lat, lng]) =>
      Math.abs(lat - ev.lat) < 0.001 && Math.abs(lng - ev.lng) < 0.001);
    assert.equal(near, false, `${r.id} terlalu dekat ke ponpes`);
  }
});

test('data: motor/mobil/minibus sampai ponpes', async () => {
  const d = await load();
  const ev = d.event.location;
  for (const vid of ['motor', 'mobil', 'minibus']) {
    const rs = d.routes.filter(r => r.vehicle === vid && r.direction === 'in');
    assert.ok(rs.length > 0, vid);
    const near = rs.some(r => r.coords.some(([lat, lng]) =>
      Math.abs(lat - ev.lat) < 0.003 && Math.abs(lng - ev.lng) < 0.003));
    assert.ok(near, `${vid} tidak sampai ponpes`);
  }
});
