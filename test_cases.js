/*
 * Skenario pengujian otomatis (dipakai oleh tests/run_tests.js di Node dan tests/tests.html di browser).
 * Hasilnya langsung bisa disalin ke tabel pengujian laporan UTS (skenario, input, hasil diharapkan, hasil aktual, status).
 * UTS Game Edukasi (TIK1.61.5319) — Zhorif Fadrul Rahman, NIM 24076049
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TestCases = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Pengacak deterministik (mulberry32) supaya hasil uji selalu sama.
  function rngBenih(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function idBenar(daftar) { return daftar.filter(function (o) { return o.benar; })[0].id; }
  function idSalah(daftar) { return daftar.filter(function (o) { return !o.benar; }).map(function (o) { return o.id; }); }

  /** Memainkan satu misi dengan sempurna: hanya langkah relevan, tanpa petunjuk, tanpa salah. */
  function mainSempurna(L, game, index) {
    var m = L.mulaiMisi(game, index, rngBenih(index + 1));
    m.misi.relevan.slice(0, m.misi.par).forEach(function (id) { L.jalankanAksi(game, m, id); });
    L.bukaDiagnosis(m);
    L.kirimDiagnosis(m, idBenar(m.misi.diagnosis));
    L.kirimPerbaikan(game, m, idBenar(m.misi.perbaikan));
    L.catatHasil(game, m);
    return m;
  }

  function jalankan(L, data) {
    var hasil = [];
    function uji(skenario, input, diharapkan, fn) {
      var aktual, lulus;
      try {
        var r = fn();
        lulus = r.lulus; aktual = r.aktual;
      } catch (e) { lulus = false; aktual = 'Galat: ' + e.message; }
      hasil.push({ no: hasil.length + 1, skenario: skenario, input: input, diharapkan: diharapkan, aktual: aktual, status: lulus ? 'Berhasil' : 'Belum' });
    }

    /* 1 ---- Alur mulai permainan */
    uji('Alur mulai permainan', 'Permainan baru, lalu mulai Misi 1',
      'Hanya Misi 1 terbuka; Misi 2 terkunci; nyawa 3; fase investigasi; 4 opsi diagnosis diacak',
      function () {
        var g = L.permainanBaru(data);
        var m = L.mulaiMisi(g, 0, rngBenih(7));
        var terkunci = L.mulaiMisi(g, 1);
        var ok = g.misi[0].status === 'terbuka' && g.misi[1].status === 'terkunci' && !!terkunci.galat &&
                 m.nyawa === 3 && m.fase === 'investigasi' && m.opsiDiagnosis.length === 4 && g.petunjukSisa === 5;
        return { lulus: ok, aktual: 'Misi1=' + g.misi[0].status + ', Misi2=' + g.misi[1].status + ', mulai Misi2 ditolak="' + terkunci.galat + '", nyawa=' + m.nyawa + ', fase=' + m.fase + ', opsi=' + m.opsiDiagnosis.length };
      });

    /* 2 ---- Aksi benar */
    uji('Input/aksi benar sesuai aturan', 'Misi 1: ipconfig + cek kabel -> diagnosis "kabel terlepas" -> perbaikan "pasang kabel"',
      'Diagnosis & perbaikan benar, skor misi 100 (40+40+20), bintang 3, status selesai',
      function () {
        var g = L.permainanBaru(data);
        var m = L.mulaiMisi(g, 0, rngBenih(1));
        L.jalankanAksi(g, m, 'kabel'); L.jalankanAksi(g, m, 'ipconfig');
        L.bukaDiagnosis(m);
        var d = L.kirimDiagnosis(m, idBenar(data.misi[0].diagnosis));
        var f = L.kirimPerbaikan(g, m, idBenar(data.misi[0].perbaikan));
        L.catatHasil(g, m);
        var ok = d.benar && f.benar && m.hasil.skor === 100 && m.hasil.bintang === 3 && m.hasil.status === 'berhasil' && g.misi[0].status === 'selesai' && !!f.verifikasi;
        return { lulus: ok, aktual: 'diagnosis benar=' + d.benar + ', perbaikan benar=' + f.benar + ', skor=' + m.hasil.skor + ', bintang=' + m.hasil.bintang + ', status misi=' + g.misi[0].status };
      });

    /* 3 ---- Aksi salah */
    uji('Input/aksi salah atau tidak sesuai', 'Misi 3: pilih diagnosis salah dahulu, baru yang benar',
      'Nyawa 3 -> 2; umpan balik korektif tampil; opsi salah tidak bisa dipilih ulang; diagnosis benar berikutnya hanya 20 poin',
      function () {
        var g = L.permainanBaru(data); g.misi[2].status = 'terbuka';
        var m = L.mulaiMisi(g, 2, rngBenih(3));
        L.jalankanAksi(g, m, 'ipconfig'); L.bukaDiagnosis(m);
        var salahId = idSalah(data.misi[2].diagnosis)[0];
        var r1 = L.kirimDiagnosis(m, salahId);
        var r2 = L.kirimDiagnosis(m, salahId);
        var r3 = L.kirimDiagnosis(m, idBenar(data.misi[2].diagnosis));
        var ok = r1.ok && !r1.benar && r1.nyawa === 2 && r1.umpanBalik.length > 10 && !r2.ok && r3.benar && m.poinDiagnosis === 20;
        return { lulus: ok, aktual: 'salah -> nyawa=' + r1.nyawa + ' ("' + r1.umpanBalik.slice(0, 48) + '..."); pilih ulang salah ditolak="' + r2.alasan + '"; lalu benar -> poin=' + m.poinDiagnosis };
      });

    /* 4 ---- Input tidak valid */
    uji('Kesalahan input / urutan tidak valid', 'Diagnosis tanpa investigasi; aksi tak dikenal; perbaikan sebelum diagnosis; pilihan tak dikenal',
      'Semua ditolak dengan pesan yang jelas, status permainan tidak berubah',
      function () {
        var g = L.permainanBaru(data);
        var m = L.mulaiMisi(g, 0, rngBenih(2));
        var a = L.bukaDiagnosis(m);
        var b = L.jalankanAksi(g, m, 'aksi_ngawur');
        var c = L.kirimPerbaikan(g, m, 'f1');
        L.jalankanAksi(g, m, 'kabel'); L.bukaDiagnosis(m);
        var d = L.kirimDiagnosis(m, 'zzz');
        var ok = !a.ok && !b.ok && !c.ok && !d.ok && m.nyawa === 3 && m.langkah.length === 1 && m.fase === 'diagnosis';
        return { lulus: ok, aktual: 'tanpa investigasi: "' + a.alasan + '" | aksi ngawur: "' + b.alasan + '" | perbaikan dini: "' + c.alasan + '" | opsi ngawur: "' + d.alasan + '" | nyawa tetap ' + m.nyawa };
      });

    /* 5 ---- Perubahan skor / progres / level */
    uji('Perubahan skor, progres, dan level', 'Selesaikan Misi 1 dengan 1 petunjuk dan 1 langkah berlebih',
      'Skor = 40+40+10-5 = 85; Misi 2 terbuka; total skor diperbarui; petunjuk tersisa 4',
      function () {
        var g = L.permainanBaru(data);
        var m = L.mulaiMisi(g, 0, rngBenih(5));
        var p = L.pakaiPetunjuk(g, m);
        L.jalankanAksi(g, m, 'kabel'); L.jalankanAksi(g, m, 'ipconfig'); L.jalankanAksi(g, m, 'ping_gw');
        L.bukaDiagnosis(m);
        L.kirimDiagnosis(m, idBenar(data.misi[0].diagnosis));
        L.kirimPerbaikan(g, m, idBenar(data.misi[0].perbaikan));
        L.catatHasil(g, m);
        var ok = p.ok && m.hasil.rincian.efisiensi === 10 && m.hasil.skor === 85 && g.misi[1].status === 'terbuka' && L.totalSkor(g) === 85 && g.petunjukSisa === 4;
        return { lulus: ok, aktual: 'langkah=3 (target 2) bonus=' + m.hasil.rincian.efisiensi + ', skor misi=' + m.hasil.skor + ', Misi2=' + g.misi[1].status + ', total=' + L.totalSkor(g) + ', petunjuk sisa=' + g.petunjukSisa };
      });

    /* 6 ---- Kondisi selesai: nyawa habis */
    uji('Kondisi selesai: nyawa habis (kalah)', 'Misi 2: pilih 3 diagnosis salah berturut-turut',
      'Nyawa 0, misi gagal, fase selesai, tanpa bonus efisiensi, aksi lanjutan ditolak, Misi 3 tetap terbuka untuk dilanjutkan',
      function () {
        var g = L.permainanBaru(data); g.misi[1].status = 'terbuka';
        var m = L.mulaiMisi(g, 1, rngBenih(4));
        L.jalankanAksi(g, m, 'ipconfig'); L.bukaDiagnosis(m);
        var r; idSalah(data.misi[1].diagnosis).forEach(function (id) { r = L.kirimDiagnosis(m, id); });
        var lagi = L.jalankanAksi(g, m, 'kabel');
        L.catatHasil(g, m);
        var ok = r.gagal && m.nyawa === 0 && m.fase === 'selesai' && m.hasil.status === 'gagal' && m.hasil.rincian.efisiensi === 0 && !lagi.ok && g.misi[1].status === 'gagal' && g.misi[2].status === 'terbuka';
        return { lulus: ok, aktual: 'nyawa=' + m.nyawa + ', status=' + m.hasil.status + ', skor=' + m.hasil.skor + ', aksi setelah selesai ditolak="' + lagi.alasan + '", status Misi 2=' + g.misi[1].status + ', Misi 3=' + g.misi[2].status };
      });

    /* 7 ---- Batas petunjuk */
    uji('Batas permainan: petunjuk terbatas', 'Minta petunjuk 6 kali berturut-turut',
      '5 petunjuk pertama berhasil, petunjuk ke-6 ditolak; skor misi berkurang 5 per petunjuk',
      function () {
        var g = L.permainanBaru(data);
        var m = L.mulaiMisi(g, 0, rngBenih(6));
        var hasil6 = []; for (var i = 0; i < 6; i++) hasil6.push(L.pakaiPetunjuk(g, m));
        var berhasil = hasil6.filter(function (x) { return x.ok; }).length;
        var ok = berhasil === 5 && !hasil6[5].ok && g.petunjukSisa === 0 && m.petunjukDipakai === 5;
        return { lulus: ok, aktual: 'berhasil=' + berhasil + ', ke-6 ditolak="' + hasil6[5].alasan + '", sisa=' + g.petunjukSisa };
      });

    /* 8 ---- Petunjuk kontekstual */
    uji('Petunjuk menyesuaikan tahap', 'Misi 4: petunjuk sebelum investigasi, setelah langkah relevan, dan saat tahap perbaikan',
      'Jenis petunjuk berurutan: mulai -> baca -> perbaiki',
      function () {
        var g = L.permainanBaru(data); g.misi[3].status = 'terbuka';
        var m = L.mulaiMisi(g, 3, rngBenih(8));
        var p1 = L.pakaiPetunjuk(g, m);
        L.jalankanAksi(g, m, 'ping_ip');
        var p2 = L.pakaiPetunjuk(g, m);
        L.bukaDiagnosis(m); L.kirimDiagnosis(m, idBenar(data.misi[3].diagnosis));
        var p3 = L.pakaiPetunjuk(g, m);
        var ok = p1.jenis === 'mulai' && p2.jenis === 'baca' && p3.jenis === 'perbaiki';
        return { lulus: ok, aktual: [p1.jenis, p2.jenis, p3.jenis].join(' -> ') };
      });

    /* 9 ---- Pengulangan langkah */
    uji('Mengulang langkah yang sama', 'Misi 1: klik "ipconfig" tiga kali',
      'Hanya dihitung 1 langkah; hasil yang sama ditampilkan ulang',
      function () {
        var g = L.permainanBaru(data);
        var m = L.mulaiMisi(g, 0, rngBenih(9));
        var a = L.jalankanAksi(g, m, 'ipconfig'), b = L.jalankanAksi(g, m, 'ipconfig'), c = L.jalankanAksi(g, m, 'ipconfig');
        var ok = !a.ulang && b.ulang && c.ulang && m.langkah.length === 1 && a.keluaran === c.keluaran;
        return { lulus: ok, aktual: 'jumlah langkah=' + m.langkah.length + ', ulang=' + b.ulang + ', keluaran sama=' + (a.keluaran === c.keluaran) };
      });

    /* 10 ---- Randomisasi */
    uji('Randomisasi urutan pilihan', 'Acak opsi diagnosis dengan 2 benih berbeda',
      'Urutan berbeda, tetapi himpunan opsi sama (tidak ada opsi hilang/ganda)',
      function () {
        var ops = data.misi[0].diagnosis;
        var a = L.acak(ops, rngBenih(1)).map(function (o) { return o.id; });
        var b = L.acak(ops, rngBenih(99)).map(function (o) { return o.id; });
        var urut = function (x) { return x.slice().sort().join(','); };
        var asli = ops.map(function (o) { return o.id; });
        var ok = urut(a) === urut(asli) && urut(b) === urut(asli) && a.join() !== b.join();
        return { lulus: ok, aktual: 'benih1=[' + a.join(',') + '], benih99=[' + b.join(',') + ']' };
      });

    /* 11 ---- Integritas data 8 misi */
    uji('Validasi data 8 misi (JSON)', 'Periksa seluruh data/missions.json',
      '8 misi; tiap tahap punya tepat 1 opsi benar & umpan balik; aksi relevan dikenal; petunjuk lengkap',
      function () {
        var galat = L.validasiData(data);
        return { lulus: galat.length === 0 && data.misi.length === 8, aktual: data.misi.length + ' misi, galat=' + (galat.length ? galat.join(' | ') : 'tidak ada') };
      });

    /* 12 ---- Tamat semua level */
    uji('Menamatkan 8 level (kondisi menang)', 'Mainkan 8 misi secara sempurna',
      'Total 800/800; semua misi selesai; peringkat "Detektif Jaringan Senior"; semuaTuntas = true',
      function () {
        var g = L.permainanBaru(data);
        for (var i = 0; i < data.misi.length; i++) mainSempurna(L, g, i);
        var total = L.totalSkor(g), maks = L.skorMaks(g), p = L.peringkat(total, maks);
        var ok = total === 800 && maks === 800 && L.semuaTuntas(g) && p.nama === 'Detektif Jaringan Senior' && g.misi.every(function (x) { return x.status === 'selesai' && x.bintang === 3; });
        return { lulus: ok, aktual: 'total=' + total + '/' + maks + ', peringkat=' + p.nama + ', semuaTuntas=' + L.semuaTuntas(g) };
      });

    /* 13 ---- Simpan & pulihkan */
    uji('Simpan dan pulihkan kemajuan', 'Selesaikan Misi 1, simpan, pulihkan ke permainan baru; coba data rusak',
      'Status, skor, dan petunjuk pulih; data rusak ditolak tanpa mengubah permainan',
      function () {
        var g = L.permainanBaru(data); mainSempurna(L, g, 0);
        var s = JSON.parse(JSON.stringify(L.simpan(g)));
        var g2 = L.permainanBaru(data);
        var ok1 = L.pulihkan(g2, s);
        var rusak = L.pulihkan(L.permainanBaru(data), { v: 1, misi: [{ status: 'ngawur', skor: 1 }] });
        var ok = ok1 && g2.misi[0].status === 'selesai' && g2.misi[0].skor === 100 && g2.misi[1].status === 'terbuka' && rusak === false;
        return { lulus: ok, aktual: 'pulih=' + ok1 + ', Misi1=' + g2.misi[0].status + '/' + g2.misi[0].skor + ', Misi2=' + g2.misi[1].status + ', data rusak ditolak=' + (rusak === false) };
      });

    return hasil;
  }

  return { jalankan: jalankan, rngBenih: rngBenih };
}));
