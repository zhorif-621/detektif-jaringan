/*
 * Detektif Jaringan: Misi Perbaiki Koneksi
 * UTS Game Edukasi (TIK1.61.5319) — Zhorif Fadrul Rahman, NIM 24076049
 *
 * logic.js = "mesin" permainan (tanpa DOM) sehingga bisa diuji otomatis di Node maupun browser.
 *
 * Algoritma yang dipakai (lihat README bagian "Pemetaan ke instruksi UTS"):
 *   - Sequence      : fase misi berurutan  investigasi -> diagnosis -> perbaikan -> selesai
 *   - Selection     : if/else pada pemeriksaan jawaban, nyawa, batas petunjuk, buka kunci level
 *   - Iteration     : loop menghitung total skor, mengacak opsi (Fisher-Yates), mengganti placeholder
 *   - Randomization : urutan pilihan diagnosis/perbaikan diacak setiap misi dimulai
 *   - Scoring       : poin diagnosis + perbaikan + bonus efisiensi - penalti petunjuk
 *   - Rule-based    : aturan kemenangan/kekalahan misi, buka kunci level, peringkat akhir
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameLogic = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Aturan permainan (satu tempat agar mudah diubah & diuji). */
  var CONFIG = Object.freeze({
    NYAWA: 3,             // kesempatan salah per misi
    PETUNJUK_TOTAL: 5,    // jumlah petunjuk untuk seluruh permainan (terbatas)
    PETUNJUK_BIAYA: 5,    // pengurang skor tiap petunjuk
    POIN_DIAGNOSIS: 40,   // diagnosis benar pada percobaan pertama
    POIN_PERBAIKAN: 40,   // perbaikan benar pada percobaan pertama
    POIN_ULANG: 20,       // benar setelah pernah salah
    BONUS_PAR: 20,        // langkah investigasi <= par
    BONUS_DEKAT: 10,      // langkah investigasi <= par + TOLERANSI
    TOLERANSI_PAR: 2,
    SKOR_MAKS_MISI: 100,
    BINTANG_3: 85,
    BINTANG_2: 60
  });

  /* ------------------------------------------------------------------ util */

  /** Fisher-Yates shuffle (RANDOMIZATION + ITERATION). rng bisa diganti agar bisa diuji. */
  function acak(arr, rng) {
    var a = arr.slice();
    var r = rng || Math.random;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** Mengganti {placeholder} dengan nilai dari objek net. */
  function isi(template, net) {
    return String(template).replace(/\{(\w+)\}/g, function (m, k) {
      return (net && net[k] !== undefined && net[k] !== null) ? net[k] : m;
    });
  }

  function cariAksi(data, id) {
    for (var i = 0; i < data.aksi.length; i++) if (data.aksi[i].id === id) return data.aksi[i];
    return null;
  }

  /** Mengembalikan teks perintah yang tampil di terminal untuk aksi tertentu. */
  function perintahAksi(data, misi, id) {
    var a = cariAksi(data, id);
    return a ? isi(a.perintah, misi.net) : '';
  }

  /** Output terminal: pakai hasil khusus misi bila ada, jika tidak pakai hasil "jaringan sehat". */
  function keluaranAksi(data, misi, id) {
    var tpl = (misi.hasil && misi.hasil[id] !== undefined) ? misi.hasil[id] : data.dasar[id];
    return isi(tpl, misi.net);
  }

  /* ------------------------------------------------------------ validasi data */

  /** Memeriksa kelengkapan data misi; mengembalikan daftar pesan galat (kosong = valid). */
  function validasiData(data) {
    var galat = [];
    if (!data || !Array.isArray(data.misi) || !Array.isArray(data.aksi)) return ['Struktur data tidak valid'];
    var idAksi = data.aksi.map(function (a) { return a.id; });
    idAksi.forEach(function (id) {
      if (data.dasar[id] === undefined) galat.push('dasar["' + id + '"] belum diisi');
    });
    data.misi.forEach(function (m) {
      var p = 'Misi ' + m.id + ': ';
      ['diagnosis', 'perbaikan'].forEach(function (kunci) {
        var benar = (m[kunci] || []).filter(function (o) { return o.benar; }).length;
        if (benar !== 1) galat.push(p + kunci + ' harus punya tepat 1 opsi benar (ditemukan ' + benar + ')');
        (m[kunci] || []).forEach(function (o) {
          if (!o.umpanBalik) galat.push(p + kunci + ' ' + o.id + ' tidak punya umpan balik');
        });
      });
      (m.relevan || []).forEach(function (id) {
        if (idAksi.indexOf(id) < 0) galat.push(p + 'aksi relevan "' + id + '" tidak dikenal');
      });
      if (!(m.par >= 1)) galat.push(p + 'par harus >= 1');
      ['mulai', 'baca', 'perbaiki'].forEach(function (k) {
        if (!m.petunjuk || !m.petunjuk[k]) galat.push(p + 'petunjuk "' + k + '" kosong');
      });
    });
    return galat;
  }

  /* ----------------------------------------------------------- status permainan */

  /** Permainan baru: hanya misi 1 terbuka (rule-based unlocking). */
  function permainanBaru(data) {
    var misi = [];
    for (var i = 0; i < data.misi.length; i++) {
      misi.push({ status: i === 0 ? 'terbuka' : 'terkunci', skor: 0, bintang: 0 });
    }
    return { data: data, petunjukSisa: CONFIG.PETUNJUK_TOTAL, misi: misi };
  }

  function totalSkor(game) {
    var total = 0;
    for (var i = 0; i < game.misi.length; i++) total += game.misi[i].skor;   // ITERATION
    return total;
  }

  function skorMaks(game) { return game.misi.length * CONFIG.SKOR_MAKS_MISI; }

  /** Semua misi sudah dicoba (selesai/gagal)? */
  function semuaTuntas(game) {
    for (var i = 0; i < game.misi.length; i++) {
      if (game.misi[i].status === 'terkunci' || game.misi[i].status === 'terbuka') return false;
    }
    return true;
  }

  function peringkat(total, maks) {
    var r = maks > 0 ? total / maks : 0;
    if (r >= 0.9) return { nama: 'Detektif Jaringan Senior', pesan: 'Luar biasa! Alur berpikirmu sistematis: dari fisik, IP, gateway, hingga DNS.' };
    if (r >= 0.7) return { nama: 'Teknisi Mahir', pesan: 'Bagus! Kamu sudah mampu membaca hasil perintah jaringan dengan baik.' };
    if (r >= 0.5) return { nama: 'Teknisi Junior', pesan: 'Cukup baik. Ulangi misi yang gagal untuk melatih alur diagnosis.' };
    return { nama: 'Teknisi Magang', pesan: 'Terus berlatih! Baca Catatan Teknisi lalu coba lagi.' };
  }

  /* ------------------------------------------------------------------ misi */

  /** Memulai satu misi. Mengembalikan objek state misi, atau {galat} bila tidak boleh. */
  function mulaiMisi(game, index, rng) {
    if (!(index >= 0 && index < game.data.misi.length)) return { galat: 'Misi tidak ditemukan.' };
    if (game.misi[index].status === 'terkunci') return { galat: 'Misi masih terkunci. Selesaikan misi sebelumnya.' };
    var misi = game.data.misi[index];
    function salin(o) { return { id: o.id, teks: o.teks }; }
    return {
      index: index,
      misi: misi,
      fase: 'investigasi',           // investigasi -> diagnosis -> perbaikan -> selesai
      nyawa: CONFIG.NYAWA,
      langkah: [],                   // id aksi unik yang sudah dijalankan
      log: [],
      opsiDiagnosis: acak(misi.diagnosis, rng).map(salin),
      opsiPerbaikan: acak(misi.perbaikan, rng).map(salin),
      dicobaDiagnosis: [],
      dicobaPerbaikan: [],
      salahDiagnosis: 0,
      salahPerbaikan: 0,
      poinDiagnosis: 0,
      poinPerbaikan: 0,
      petunjukDipakai: 0,
      hasil: null,
      tercatat: false
    };
  }

  /** INPUT pemain: menjalankan satu langkah diagnosis. */
  function jalankanAksi(game, m, idAksi) {
    if (m.fase === 'selesai') return { ok: false, alasan: 'Misi sudah selesai.' };
    var aksi = cariAksi(game.data, idAksi);
    if (!aksi) return { ok: false, alasan: 'Langkah tidak dikenal.' };
    var ulang = m.langkah.indexOf(idAksi) >= 0;
    var entri = { aksi: idAksi, perintah: perintahAksi(game.data, m.misi, idAksi), keluaran: keluaranAksi(game.data, m.misi, idAksi) };
    if (!ulang) { m.langkah.push(idAksi); m.log.push(entri); }
    return { ok: true, ulang: ulang, perintah: entri.perintah, keluaran: entri.keluaran, jumlahLangkah: m.langkah.length };
  }

  /** Pemain merasa sudah tahu penyebab -> buka pilihan diagnosis. Wajib minimal 1 langkah investigasi. */
  function bukaDiagnosis(m) {
    if (m.fase === 'selesai') return { ok: false, alasan: 'Misi sudah selesai.' };
    if (m.langkah.length === 0) return { ok: false, alasan: 'Lakukan minimal satu langkah investigasi dulu. Teknisi yang baik tidak menebak!' };
    if (m.fase === 'investigasi') m.fase = 'diagnosis';
    return { ok: true };
  }

  function cariOpsi(daftar, id) {
    for (var i = 0; i < daftar.length; i++) if (daftar[i].id === id) return daftar[i];
    return null;
  }

  /** PROSES utama: memeriksa jawaban (SELECTION benar/salah) dan memperbarui skor/nyawa. */
  function periksaJawaban(m, tahap, idOpsi) {
    var kunci = tahap === 'diagnosis' ? 'diagnosis' : 'perbaikan';
    var dicoba = tahap === 'diagnosis' ? m.dicobaDiagnosis : m.dicobaPerbaikan;
    if (m.fase === 'selesai') return { ok: false, alasan: 'Misi sudah selesai.' };
    if (m.fase !== tahap) return { ok: false, alasan: tahap === 'diagnosis' ? 'Buka tahap diagnosis terlebih dahulu.' : 'Tentukan diagnosis yang benar terlebih dahulu.' };
    var opsi = cariOpsi(m.misi[kunci], idOpsi);
    if (!opsi) return { ok: false, alasan: 'Pilihan tidak dikenal.' };
    if (dicoba.indexOf(idOpsi) >= 0) return { ok: false, alasan: 'Pilihan ini sudah dicoba.' };
    dicoba.push(idOpsi);

    if (opsi.benar) {
      var salah = tahap === 'diagnosis' ? m.salahDiagnosis : m.salahPerbaikan;
      var poin = salah === 0 ? (tahap === 'diagnosis' ? CONFIG.POIN_DIAGNOSIS : CONFIG.POIN_PERBAIKAN) : CONFIG.POIN_ULANG;
      if (tahap === 'diagnosis') { m.poinDiagnosis = poin; m.fase = 'perbaikan'; }
      else { m.poinPerbaikan = poin; }
      return { ok: true, benar: true, poin: poin, umpanBalik: opsi.umpanBalik, nyawa: m.nyawa };
    }

    // jawaban salah: kurangi nyawa, beri umpan balik korektif
    m.nyawa -= 1;
    if (tahap === 'diagnosis') m.salahDiagnosis += 1; else m.salahPerbaikan += 1;
    var gagal = m.nyawa <= 0;
    if (gagal) akhiriMisi(m, 'gagal');
    return { ok: true, benar: false, umpanBalik: opsi.umpanBalik, nyawa: m.nyawa, gagal: gagal };
  }

  function kirimDiagnosis(m, idOpsi) { return periksaJawaban(m, 'diagnosis', idOpsi); }

  function kirimPerbaikan(game, m, idOpsi) {
    var r = periksaJawaban(m, 'perbaikan', idOpsi);
    if (r.ok && r.benar) {
      akhiriMisi(m, 'berhasil');
      r.verifikasi = { perintah: perintahAksi(game.data, m.misi, 'ping_domain'), keluaran: isi(game.data.dasar.ping_domain, m.misi.net) };
    }
    return r;
  }

  /** Petunjuk terbatas: menyesuaikan dengan tahap permainan; mengurangi jatah & skor. */
  function pakaiPetunjuk(game, m) {
    if (m.fase === 'selesai') return { ok: false, alasan: 'Misi sudah selesai.' };
    if (game.petunjukSisa <= 0) return { ok: false, alasan: 'Petunjuk sudah habis. Andalkan analisismu!' };
    var jenis;
    if (m.fase === 'perbaikan') jenis = 'perbaiki';
    else {
      var adaRelevan = m.misi.relevan.some(function (id) { return m.langkah.indexOf(id) >= 0; });
      jenis = adaRelevan ? 'baca' : 'mulai';
    }
    game.petunjukSisa -= 1;
    m.petunjukDipakai += 1;
    return { ok: true, jenis: jenis, teks: m.misi.petunjuk[jenis], sisa: game.petunjukSisa };
  }

  /** Aturan skor misi (SCORING). Bonus efisiensi hanya jika misi berhasil. */
  function hitungHasil(m, status) {
    var berhasil = status === 'berhasil';
    var bonus = 0;
    if (berhasil) {
      if (m.langkah.length <= m.misi.par) bonus = CONFIG.BONUS_PAR;
      else if (m.langkah.length <= m.misi.par + CONFIG.TOLERANSI_PAR) bonus = CONFIG.BONUS_DEKAT;
    }
    var penalti = m.petunjukDipakai * CONFIG.PETUNJUK_BIAYA;
    var skor = Math.max(0, m.poinDiagnosis + m.poinPerbaikan + bonus - penalti);
    var bintang = 0;
    if (berhasil) bintang = skor >= CONFIG.BINTANG_3 ? 3 : (skor >= CONFIG.BINTANG_2 ? 2 : 1);
    return {
      status: status, skor: skor, bintang: bintang,
      rincian: { diagnosis: m.poinDiagnosis, perbaikan: m.poinPerbaikan, efisiensi: bonus, penaltiPetunjuk: penalti },
      langkah: m.langkah.length, par: m.misi.par, nyawaSisa: m.nyawa
    };
  }

  function akhiriMisi(m, status) {
    m.fase = 'selesai';
    m.hasil = hitungHasil(m, status);
  }

  /** Mencatat hasil misi ke status permainan dan membuka misi berikutnya (kondisi selesai level). */
  function catatHasil(game, m) {
    if (!m.hasil || m.tercatat) return { ok: false };
    m.tercatat = true;
    var rec = game.misi[m.index];
    var lebihBaik = m.hasil.skor >= rec.skor ||
      (m.hasil.status === 'berhasil' && rec.status !== 'selesai') ||
      rec.status === 'terbuka';
    if (lebihBaik) {
      rec.skor = m.hasil.skor;
      rec.bintang = m.hasil.bintang;
    }
    if (m.hasil.status === 'berhasil') rec.status = 'selesai';
    else if (rec.status !== 'selesai') rec.status = 'gagal';
    var next = game.misi[m.index + 1];
    if (next && next.status === 'terkunci') next.status = 'terbuka';
    return { ok: true, total: totalSkor(game) };
  }

  /* --------------------------------------------------------- simpan / pulihkan */

  function simpan(game) {
    return { v: 1, petunjukSisa: game.petunjukSisa, misi: game.misi.map(function (x) { return { status: x.status, skor: x.skor, bintang: x.bintang }; }) };
  }

  function pulihkan(game, saved) {
    if (!saved || saved.v !== 1 || !Array.isArray(saved.misi) || saved.misi.length !== game.misi.length) return false;
    var valid = ['terkunci', 'terbuka', 'selesai', 'gagal'];
    for (var i = 0; i < saved.misi.length; i++) {
      var s = saved.misi[i];
      if (valid.indexOf(s.status) < 0 || typeof s.skor !== 'number') return false;
    }
    for (var j = 0; j < saved.misi.length; j++) {
      game.misi[j].status = saved.misi[j].status;
      game.misi[j].skor = saved.misi[j].skor;
      game.misi[j].bintang = saved.misi[j].bintang || 0;
    }
    game.petunjukSisa = Math.max(0, Math.min(CONFIG.PETUNJUK_TOTAL, saved.petunjukSisa | 0));
    return true;
  }

  return {
    CONFIG: CONFIG,
    acak: acak, isi: isi, validasiData: validasiData,
    permainanBaru: permainanBaru, totalSkor: totalSkor, skorMaks: skorMaks, semuaTuntas: semuaTuntas, peringkat: peringkat,
    mulaiMisi: mulaiMisi, jalankanAksi: jalankanAksi, bukaDiagnosis: bukaDiagnosis,
    kirimDiagnosis: kirimDiagnosis, kirimPerbaikan: kirimPerbaikan, pakaiPetunjuk: pakaiPetunjuk,
    catatHasil: catatHasil, simpan: simpan, pulihkan: pulihkan,
    perintahAksi: perintahAksi, keluaranAksi: keluaranAksi, cariAksi: cariAksi
  };
}));
