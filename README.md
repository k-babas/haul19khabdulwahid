# Peta Rute Haul ke-19 KH Abdul Wahid Zuhdi

Peta 3D interaktif untuk acara haul di **Pondok Pesantren Fadllul Wahid**,
Ngangkruk, Bandungsari, Ngaringan, Grobogan, Jawa Tengah.

Pengunjung memilih **tipe kendaraan** dan **waktu kedatangan**, lalu peta
langsung menampilkan rute masuk, rute keluar, dan lokasi parkir khusus
kendaraan tersebut.

## Buka lokal

```bash
python3 -m http.server 8099
```

Lalu buka `http://127.0.0.1:8099`.

## Struktur file

| File | Isi |
|---|---|
| `index.html` | Markup halaman + CDN MapLibre |
| `styles.css` | Tampilan mobile-first |
| `app.js` | Render peta, dropdown, legend, tombol 3D |
| `core.mjs` | Logika murni: filter rute, parkir, validasi, konversi GeoJSON |
| `editor.mjs` | Mode gambar jalur (`?edit=1`) |
| `data/routes.json` | **Satu-satunya file yang diedit panitia** |
| `test/` | Test Node (`npm test`) |

## Ganti lokasi haul

Edit `event.location` di `data/routes.json`:

```json
"location": { "lat": -7.0606737, "lng": 111.1560657, "label": "Pondok Pesantren Fadllul Wahid" }
```

Ambil koordinat dari Google Maps: klik kanan titik lokasi, klik angka
koordinat yang muncul — otomatis tersalin dengan format `lat, lng`.

## Menambah atau mengubah rute

### Cara 1 — editor di browser (disarankan)

1. Buka `http://127.0.0.1:8099/?edit=1`
2. Pilih **kendaraan**, **slot**, dan **arah** (masuk/keluar) di panel kanan bawah
3. Klik peta titik demi titik mengikuti jalan
4. Klik **Selesai**, lalu **Salin JSON**
5. Tempel objek hasilnya ke array `routes` di `data/routes.json`
   (jangan lupa koma antar objek), simpan, lalu reload halaman

### Cara 2 — edit manual

Duplikat satu blok di array `routes`, lalu ganti `id`, `vehicle`,
`timeSlot`, `direction`, `label`, `color`, dan `coords`.

## Arti field

- **`timeSlot`** — `"pagi"`, `"siang"`, `"malam"`, atau `"all"`.
  `"all"` berarti rute berlaku di semua slot (dipakai bus).
- **`direction`** — `"in"` (masuk, biru) atau `"out"` (keluar, hijau).
  Keduanya ditampilkan bersamaan.
- **`coords`** — array `[lat, lng]`. Perhatikan urutannya: **lat dulu**.
- **`parking[].zone`** — polygon area parkir, juga `[lat, lng]`.

## Cakupan rute saat ini

| Kendaraan | Pagi | Siang | Malam |
|---|---|---|---|
| Motor | ✅ | ✅ | ✅ |
| Mobil | ✅ | ✅ | ✅ |
| Mini Bus | ✅ | ✅ | ✅ |
| Bus | ✅ (semua waktu) | ✅ (semua waktu) | ✅ (semua waktu) |

Semua kendaraan punya rute masuk dan keluar. Bus hanya melintas di
Jalan Raya Purwodadi–Blora dan tidak masuk jalan ponpes.


## Tombol "Lokasi saya" (GPS pengguna)

Di halaman peta ada tombol **📍 Lokasi saya**. Cara kerjanya:

1. Browser meminta izin lokasi (wajib **HTTPS** — GitHub Pages sudah HTTPS).
2. Setelah diizinkan, muncul titik merah di posisi pengguna.
3. Peta menggambar **garis putus-putus merah** dari posisi pengguna ke
   titik sambung rute — dipilih otomatis ujung rute yang paling dekat.
4. Panel legend menampilkan jarak ke rute, arah mata angin, sisa perjalanan,
   dan total perkiraan.

Catatan penting:
- Titik sambung dipilih dari **dua ujung polyline rute**, bukan titik
  terdekat di sepanjang garis. Untuk acara haul ini cukup, karena pengunjung
  datang dari jalan raya (ujung awal) atau sudah di area ponpes (ujung akhir).
- Rute di dalam JSON selalu dibaca dari ujung awal ke ujung tujuan; kalau
  pengguna lebih dekat ke ujung tujuan, garis penghubung tetap digambar dan
  sisa perjalanan dihitung dari ujung itu.
- Kalau izin ditolak, muncul pesan jelas di panel legend dan peta tetap
  berfungsi normal tanpa GPS.
- Posisi pengguna tidak dikirim ke server mana pun — semua perhitungan
  terjadi di browser.

### Menguji tanpa GPS asli

Buka DevTools → tiga titik → **More tools → Sensors → Location**,
isi koordinat manual (misal `-7.0592, 111.1749`), lalu klik tombol lokasi.

## Catatan rute

Rute digambar manual mengikuti geometri jalan OpenStreetMap. Jalur masuk
(±3,25 km) dan jalur keluar (±2,97 km) sengaja berbeda supaya arus tidak
bertabrakan.

## Troubleshooting

- **Peta abu-abu / kosong** — cek koneksi internet. Basemap memakai
  `tiles.openfreemap.org` (gratis, tanpa API key).
- **Muncul "Data rute bermasalah"** — JSON tidak valid. Jalankan
  `python3 -m json.tool data/routes.json` untuk melihat baris error.
- **"Belum ada rute untuk kombinasi ini"** — kombinasi kendaraan+jam itu
  belum punya rute. Tambahkan lewat editor atau edit manual.

## Test

```bash
npm test
```

Menjalankan 37 test: 13 test logika rute, 11 test integritas data,
dan 13 test geolocation (`test/geo.test.mjs`).
