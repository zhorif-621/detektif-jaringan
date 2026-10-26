/*
 * Membuat data/missions.js (cadangan) dari data/missions.json.
 * Jalankan setiap kali selesai mengedit missions.json:   node tools/build_missions.js
 *
 * Mengapa perlu? Jika index.html dibuka langsung dengan klik dua kali (alamat file://),
 * Chrome memblokir fetch() ke file JSON lokal. File missions.js berisi data yang sama
 * sehingga game tetap bisa jalan. Dengan Live Server / GitHub Pages, game membaca missions.json langsung.
 */
const fs = require('fs');
const path = require('path');

const sumber = path.join(__dirname, '..', 'data', 'missions.json');
const tujuan = path.join(__dirname, '..', 'data', 'missions.js');

const data = JSON.parse(fs.readFileSync(sumber, 'utf8'));   // sekaligus memeriksa JSON valid
const isi = '/* DIBUAT OTOMATIS dari missions.json oleh tools/build_missions.js — jangan diedit manual. */\n' +
            'window.MISSIONS_DATA = ' + JSON.stringify(data, null, 2) + ';\n';
fs.writeFileSync(tujuan, isi, 'utf8');
console.log('Berhasil: ' + data.misi.length + ' misi -> data/missions.js');
