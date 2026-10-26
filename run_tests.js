/*
 * Menjalankan pengujian otomatis di terminal:    node tests/run_tests.js
 * Hasil berupa tabel skenario (bisa difoto/screenshot untuk bukti pengujian laporan UTS).
 */
const fs = require('fs');
const path = require('path');
const L = require('../js/logic.js');
const T = require('./test_cases.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'missions.json'), 'utf8'));
const hasil = T.jalankan(L, data);

console.log('\n=== PENGUJIAN: Detektif Jaringan: Misi Perbaiki Koneksi ===');
console.log('    UTS Game Edukasi (TIK1.61.5319) — Zhorif Fadrul Rahman / NIM 24076049\n');
hasil.forEach(function (r) {
  console.log(String(r.no).padStart(2, '0') + '. [' + (r.status === 'Berhasil' ? 'BERHASIL' : 'GAGAL   ') + '] ' + r.skenario);
  console.log('    Input/kondisi   : ' + r.input);
  console.log('    Hasil diharapkan: ' + r.diharapkan);
  console.log('    Hasil aktual    : ' + r.aktual + '\n');
});
const lulus = hasil.filter(function (r) { return r.status === 'Berhasil'; }).length;
console.log('RINGKASAN: ' + lulus + ' dari ' + hasil.length + ' skenario berhasil.\n');
process.exit(lulus === hasil.length ? 0 : 1);
