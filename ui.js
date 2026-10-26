/*
 * ui.js — lapisan tampilan (DOM) untuk "Detektif Jaringan: Misi Perbaiki Koneksi".
 * Seluruh aturan permainan ada di logic.js; file ini hanya menampilkan dan meneruskan input pemain.
 * UTS Game Edukasi (TIK1.61.5319) — Zhorif Fadrul Rahman, NIM 24076049
 */
(function () {
  'use strict';

  var L = window.GameLogic;
  var KUNCI_SIMPAN = 'detektif-jaringan-uts-v1';
  var game = null;     // status seluruh permainan
  var run = null;      // status misi yang sedang dimainkan
  var jedaHasil = null;

  /* ------------------------------------------------------------- helper DOM */
  function $(id) { return document.getElementById(id); }

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) el.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) {
      if (c == null) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function kosongkan(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function tampilkanLayar(id) {
    ['layar-menu', 'layar-peta', 'layar-misi', 'layar-akhir'].forEach(function (x) { $(x).hidden = (x !== id); });
    window.scrollTo(0, 0);
    $('app').focus({ preventScroll: true });
  }

  function bintangTeks(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }

  /* --------------------------------------------------------------- penyimpanan */
  function bacaSimpanan() {
    try { var s = localStorage.getItem(KUNCI_SIMPAN); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function tulisSimpanan() {
    try { localStorage.setItem(KUNCI_SIMPAN, JSON.stringify(L.simpan(game))); } catch (e) { /* penyimpanan tidak tersedia: abaikan */ }
  }
  function hapusSimpanan() {
    try { localStorage.removeItem(KUNCI_SIMPAN); } catch (e) { /* abaikan */ }
  }
  function adaKemajuan(saved) {
    return !!saved && saved.misi.some(function (m) { return m.status === 'selesai' || m.status === 'gagal'; });
  }

  /* ------------------------------------------------------------------ muat data */
  function muatData() {
    var cadangan = function () {
      if (window.MISSIONS_DATA) { $('sumber-data').textContent = 'Sumber data: data/missions.js (cadangan, mode file://)'; return window.MISSIONS_DATA; }
      throw new Error('Data misi tidak ditemukan.');
    };
    if (location.protocol === 'file:' || typeof fetch !== 'function') return Promise.resolve(cadangan());
    return fetch('data/missions.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { $('sumber-data').textContent = 'Sumber data: data/missions.json'; return d; })
      .catch(function () { return cadangan(); });
  }

  /* ------------------------------------------------------------------- menu */
  function renderMenu() {
    var saved = bacaSimpanan();
    $('btn-lanjut').hidden = !(game && adaKemajuan(saved));
  }

  function mulaiBaru() {
    if (adaKemajuan(bacaSimpanan()) && !window.confirm('Mulai dari awal? Kemajuan yang tersimpan akan dihapus.')) return;
    hapusSimpanan();
    game = L.permainanBaru(game.data);
    tulisSimpanan();
    bukaPeta();
  }

  function lanjutkan() {
    var saved = bacaSimpanan();
    if (saved) L.pulihkan(game, saved);
    bukaPeta();
  }

  /* -------------------------------------------------------------------- peta */
  var LABEL_STATUS = { terkunci: 'Terkunci', terbuka: 'Siap dimainkan', selesai: 'Selesai', gagal: 'Gagal — coba lagi' };

  function bukaPeta() {
    run = null;
    if (jedaHasil) { clearTimeout(jedaHasil); jedaHasil = null; }
    renderPeta();
    tampilkanLayar('layar-peta');
  }

  function renderPeta() {
    $('peta-skor').textContent = L.totalSkor(game);
    $('peta-maks').textContent = L.skorMaks(game);
    $('peta-petunjuk').textContent = game.petunjukSisa;
    $('btn-hasil-akhir').hidden = !L.semuaTuntas(game);

    var grid = $('grid-misi');
    kosongkan(grid);
    game.data.misi.forEach(function (m, i) {
      var rec = game.misi[i];
      var terkunci = rec.status === 'terkunci';
      var tombol = h('button', {
        type: 'button', class: 'btn kecil ' + (terkunci ? '' : 'utama'), disabled: terkunci,
        'data-misi': String(i),
        text: terkunci ? '🔒 Terkunci' : (rec.status === 'terbuka' ? '▶ Mulai' : '↻ Main lagi'),
        onclick: function () { mulaiMisiUI(i); }
      });
      var kartu = h('li', { class: 'kartu misi-kartu ' + rec.status }, [
        h('div', { class: 'misi-no', text: String(m.id) }),
        h('div', { class: 'misi-info' }, [
          h('h3', { text: m.judul }),
          h('p', { class: 'sub kecil-teks', text: m.lokasi }),
          h('p', { class: 'chip-baris' }, [
            h('span', { class: 'chip tingkat', text: m.tingkat }),
            h('span', { class: 'chip status ' + rec.status, text: LABEL_STATUS[rec.status] })
          ]),
          (rec.status === 'selesai' || rec.status === 'gagal')
            ? h('p', { class: 'bintang', 'aria-label': rec.bintang + ' dari 3 bintang' }, [bintangTeks(rec.bintang) + '  ·  ' + rec.skor + ' poin'])
            : null
        ]),
        tombol
      ]);
      grid.appendChild(kartu);
    });
  }

  /* -------------------------------------------------------------------- misi */
  function mulaiMisiUI(index) {
    var r = L.mulaiMisi(game, index);
    if (r.galat) { window.alert(r.galat); return; }
    run = r;
    var m = run.misi;

    $('misi-level').textContent = 'Level ' + m.id + ' / ' + game.data.misi.length;
    $('misi-judul').textContent = m.judul;
    $('tiket-pelapor').textContent = m.pelapor;
    $('tiket-lokasi').textContent = m.lokasi;
    $('tiket-tingkat').textContent = m.tingkat;
    $('tiket-laporan').textContent = m.laporan;
    var info = $('tiket-info');
    info.hidden = !m.info;
    info.textContent = m.info ? 'ℹ️ ' + m.info : '';
    $('info-par').textContent = m.par;

    kosongkan($('terminal'));
    tulisTerminal('sistem', 'Terminal Teknisi siap. Pilih langkah investigasi pada panel kiri.\nSemua hasil di sini adalah simulasi — aman dicoba.');
    $('kotak-petunjuk').hidden = true;
    $('panel-keputusan').hidden = true;
    $('umpan-balik').hidden = true;

    renderAksi();
    renderHud();
    renderTahap();
    renderTombolUtama();
    tampilkanLayar('layar-misi');
  }

  function renderHud() {
    var n = Math.max(0, run.nyawa), maks = L.CONFIG.NYAWA;
    var el = $('hud-nyawa');
    el.textContent = '❤'.repeat(n) + '♡'.repeat(maks - n);
    el.setAttribute('aria-label', n + ' dari ' + maks + ' nyawa');
    $('hud-petunjuk').textContent = game.petunjukSisa;
    $('hud-skor').textContent = L.totalSkor(game);
    $('info-langkah').textContent = run.langkah.length;
    $('info-langkah').parentNode.classList.toggle('lewat', run.langkah.length > run.misi.par);
    $('btn-petunjuk').disabled = run.fase === 'selesai' || game.petunjukSisa <= 0;
  }

  function renderTahap() {
    var urut = ['investigasi', 'diagnosis', 'perbaikan', 'selesai'];
    var idx = urut.indexOf(run.fase);
    Array.prototype.forEach.call($('tahap').children, function (li, i) {
      li.classList.toggle('aktif', i === idx);
      li.classList.toggle('lewat', i < idx);
      if (i === idx) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  }

  function renderTombolUtama() {
    var b = $('btn-diagnosis');
    if (run.fase === 'selesai') { b.textContent = '📋 Lihat hasil misi'; b.disabled = false; return; }
    b.disabled = false;
    b.textContent = run.fase === 'investigasi' ? 'Saya sudah tahu penyebabnya →' : 'Kembali ke pilihan ↓';
  }

  function renderAksi() {
    var wadah = $('daftar-aksi');
    kosongkan(wadah);
    var kelompok = {};
    var urut = [];
    game.data.aksi.forEach(function (a) {
      if (!kelompok[a.kelompok]) { kelompok[a.kelompok] = []; urut.push(a.kelompok); }
      kelompok[a.kelompok].push(a);
    });
    urut.forEach(function (nama) {
      var grup = h('div', { class: 'grup-aksi' }, [h('h4', { text: nama })]);
      kelompok[nama].forEach(function (a) {
        var dipakai = run.langkah.indexOf(a.id) >= 0;
        grup.appendChild(h('button', {
          type: 'button', class: 'aksi' + (dipakai ? ' dipakai' : ''), 'data-aksi': a.id,
          disabled: run.fase === 'selesai',
          onclick: function () { klikAksi(a.id); }
        }, [
          h('span', { class: 'aksi-ikon', 'aria-hidden': 'true', text: a.ikon }),
          h('span', { class: 'aksi-teks' }, [
            h('span', { class: 'aksi-label', text: a.label }),
            h('code', { text: L.perintahAksi(game.data, run.misi, a.id) })
          ]),
          h('span', { class: 'aksi-cek', 'aria-hidden': 'true', text: dipakai ? '✓' : '' })
        ]));
      });
      wadah.appendChild(grup);
    });
  }

  function tulisTerminal(jenis, teks, aksiId, perintah) {
    var term = $('terminal');
    var kids = [];
    if (jenis === 'perintah') kids.push(h('div', { class: 'prompt', text: 'C:\\Users\\Teknisi> ' + perintah }));
    kids.push(h('pre', { class: 'keluaran ' + jenis, text: teks }));
    var entri = h('div', { class: 'entri', 'data-aksi': aksiId || '' }, kids);
    term.appendChild(entri);
    term.scrollTop = term.scrollHeight;
    return entri;
  }

  function klikAksi(id) {
    var r = L.jalankanAksi(game, run, id);
    if (!r.ok) { tampilPeringatan(r.alasan); return; }
    if (r.ulang) {
      var ada = $('terminal').querySelector('.entri[data-aksi="' + id + '"]');
      if (ada) {
        ada.scrollIntoView({ block: 'nearest' });
        ada.classList.remove('kilat'); void ada.offsetWidth; ada.classList.add('kilat');
      }
      tampilPeringatan('Langkah ini sudah dijalankan — hasilnya sudah ada di terminal (tidak menambah hitungan langkah).');
      return;
    }
    $('kotak-petunjuk').hidden = true;
    tulisTerminal('perintah', r.keluaran, id, r.perintah);
    // Di layar kecil terminal berada di bawah daftar langkah, jadi gulirkan agar hasilnya terlihat.
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
      $('terminal').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    var tombol = document.querySelector('.aksi[data-aksi="' + id + '"]');
    if (tombol) { tombol.classList.add('dipakai'); tombol.querySelector('.aksi-cek').textContent = '✓'; }
    renderHud();
  }

  function tampilPeringatan(teks) {
    var k = $('kotak-petunjuk');
    k.className = 'kotak-petunjuk peringatan';
    kosongkan(k);
    k.appendChild(h('strong', { text: 'ℹ️ ' }));
    k.appendChild(document.createTextNode(teks));
    k.hidden = false;
  }

  function klikPetunjuk() {
    var r = L.pakaiPetunjuk(game, run);
    if (!r.ok) { tampilPeringatan(r.alasan); return; }
    var k = $('kotak-petunjuk');
    k.className = 'kotak-petunjuk';
    kosongkan(k);
    k.appendChild(h('strong', { text: '💡 Petunjuk: ' }));
    k.appendChild(document.createTextNode(r.teks + '  (sisa petunjuk: ' + r.sisa + ')'));
    k.hidden = false;
    tulisSimpanan();
    renderHud();
  }

  function klikTombolUtama() {
    if (run.fase === 'selesai') { tampilkanHasil(); return; }
    var r = L.bukaDiagnosis(run);
    if (!r.ok) { tampilPeringatan(r.alasan); return; }
    $('kotak-petunjuk').hidden = true;
    renderKeputusan();
    renderTahap();
    renderTombolUtama();
    $('panel-keputusan').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* --------------------------------------------------------------- keputusan */
  function renderKeputusan(umpan) {
    var panel = $('panel-keputusan');
    panel.hidden = false;
    var diagnosis = run.fase === 'diagnosis';
    var sub = $('keputusan-sub');
    var teksBenar = '';
    if (!diagnosis) {
      run.misi.diagnosis.forEach(function (o) { if (o.benar) teksBenar = o.teks; });
    }
    $('keputusan-judul').textContent = diagnosis ? 'Apa penyebab gangguan ini?' : 'Perbaikan apa yang paling tepat?';
    sub.textContent = diagnosis
      ? 'Pilih satu penyebab berdasarkan bukti di terminal. Jawaban salah mengurangi 1 nyawa.'
      : (run.fase === 'selesai' ? '' : '✓ Diagnosis: ' + teksBenar);

    var daftar = diagnosis || run.fase === 'investigasi' ? run.opsiDiagnosis : run.opsiPerbaikan;
    var dicoba = diagnosis ? run.dicobaDiagnosis : run.dicobaPerbaikan;
    if (run.fase === 'selesai') {
      // tampilkan tahap terakhir yang dimainkan
      diagnosis = run.poinDiagnosis === 0;
      daftar = diagnosis ? run.opsiDiagnosis : run.opsiPerbaikan;
      dicoba = diagnosis ? run.dicobaDiagnosis : run.dicobaPerbaikan;
    }
    var wadah = $('daftar-opsi');
    kosongkan(wadah);
    var huruf = 'ABCDEFGH';
    daftar.forEach(function (o, i) {
      var sudah = dicoba.indexOf(o.id) >= 0;
      var benar = false;
      var sumber = diagnosis ? run.misi.diagnosis : run.misi.perbaikan;
      sumber.forEach(function (s) { if (s.id === o.id && s.benar) benar = true; });
      var tandaBenar = sudah && benar;
      var tandaSalah = sudah && !benar;
      wadah.appendChild(h('button', {
        type: 'button',
        class: 'opsi-btn' + (tandaBenar ? ' benar' : '') + (tandaSalah ? ' salah' : ''),
        'data-opsi': o.id,
        disabled: sudah || run.fase === 'selesai',
        onclick: function () { pilihOpsi(o.id); }
      }, [
        h('span', { class: 'opsi-huruf', text: huruf.charAt(i) }),
        h('span', { class: 'opsi-teks', text: o.teks }),
        h('span', { class: 'opsi-tanda', 'aria-hidden': 'true', text: tandaBenar ? '✓' : (tandaSalah ? '✗' : '') })
      ]));
    });
    tampilUmpanBalik(umpan);
  }

  function tampilUmpanBalik(umpan) {
    var el = $('umpan-balik');
    if (!umpan) { el.hidden = true; return; }
    el.className = 'umpan-balik ' + (umpan.benar ? 'benar' : 'salah');
    kosongkan(el);
    el.appendChild(h('strong', { text: umpan.benar ? '✓ Benar! ' : '✗ Belum tepat. ' }));
    el.appendChild(document.createTextNode(umpan.teks));
    el.hidden = false;
  }

  function pilihOpsi(id) {
    var sebelum = run.fase;
    var r = sebelum === 'diagnosis' ? L.kirimDiagnosis(run, id) : L.kirimPerbaikan(game, run, id);
    if (!r.ok) { tampilPeringatan(r.alasan); return; }
    var umpan = { benar: r.benar, teks: r.umpanBalik };

    if (r.benar && r.verifikasi) {
      tulisTerminal('perintah', r.verifikasi.keluaran, 'verifikasi', r.verifikasi.perintah);
      tulisTerminal('sukses', '✔ Koneksi pulih. Verifikasi berhasil — tutup tiket.');
    }
    renderHud();
    renderKeputusan(umpan);
    renderTahap();
    renderTombolUtama();
    renderAksi();
    if (run.fase === 'selesai') selesaiMisi();
  }

  function selesaiMisi() {
    L.catatHasil(game, run);
    tulisSimpanan();
    renderHud();
    if (jedaHasil) clearTimeout(jedaHasil);
    jedaHasil = setTimeout(function () { jedaHasil = null; if (run && run.fase === 'selesai') tampilkanHasil(); }, 1400);
  }

  /* --------------------------------------------------------------- dialog hasil */
  function tampilkanHasil() {
    if (jedaHasil) { clearTimeout(jedaHasil); jedaHasil = null; }
    var hsl = run.hasil;
    var ok = hsl.status === 'berhasil';
    var m = run.misi;
    var dlg = $('dlg-hasil');
    var isi = $('hasil-isi');
    kosongkan(isi);

    isi.appendChild(h('h2', { id: 'hasil-judul', class: ok ? 'ok' : 'gagal', text: ok ? 'Misi Berhasil!' : 'Misi Gagal' }));
    isi.appendChild(h('p', { class: 'bintang besar', 'aria-label': hsl.bintang + ' dari 3 bintang', text: bintangTeks(hsl.bintang) }));

    var baris = [
      ['Diagnosis tepat', '+' + hsl.rincian.diagnosis],
      ['Perbaikan tepat', '+' + hsl.rincian.perbaikan],
      ['Efisiensi (' + hsl.langkah + ' langkah, target ≤ ' + hsl.par + ')', '+' + hsl.rincian.efisiensi],
      ['Petunjuk dipakai (' + run.petunjukDipakai + ')', '−' + hsl.rincian.penaltiPetunjuk],
      ['Skor misi', String(hsl.skor)]
    ];
    var tb = h('tbody');
    baris.forEach(function (b, i) {
      tb.appendChild(h('tr', { class: i === baris.length - 1 ? 'total' : '' }, [h('td', { text: b[0] }), h('td', { class: 'angka', text: b[1] })]));
    });
    isi.appendChild(h('table', { class: 'tabel kecil' }, [tb]));

    if (!ok) isi.appendChild(h('p', { class: 'catatan', text: 'Nyawa habis. Bonus efisiensi tidak diberikan. Baca pembahasan di bawah, lalu coba ulangi misi ini.' }));

    isi.appendChild(h('h3', { text: 'Pembahasan' }));
    isi.appendChild(h('p', { text: m.pembahasan }));
    isi.appendChild(h('h3', { text: 'Ilmu yang didapat' }));
    var ul = h('ul');
    m.ilmu.forEach(function (t) { ul.appendChild(h('li', { text: t })); });
    isi.appendChild(ul);

    var adaNext = run.index + 1 < game.data.misi.length;
    var aksi = h('div', { class: 'dlg-aksi' });
    aksi.appendChild(h('button', { type: 'button', class: 'btn', text: '↻ Ulangi misi', onclick: function () { dlg.close(); mulaiMisiUI(run.index); } }));
    aksi.appendChild(h('button', { type: 'button', class: 'btn', text: 'Peta misi', onclick: function () { dlg.close(); bukaPeta(); } }));
    if (adaNext) aksi.appendChild(h('button', { type: 'button', class: 'btn utama', autofocus: true, text: 'Misi berikutnya →', onclick: function () { dlg.close(); mulaiMisiUI(run.index + 1); } }));
    else aksi.appendChild(h('button', { type: 'button', class: 'btn utama', autofocus: true, text: '🏁 Lihat hasil akhir', onclick: function () { dlg.close(); bukaAkhir(); } }));
    isi.appendChild(aksi);

    if (!dlg.open) dlg.showModal();
  }

  /* ---------------------------------------------------------------- hasil akhir */
  function bukaAkhir() {
    var total = L.totalSkor(game), maks = L.skorMaks(game);
    var p = L.peringkat(total, maks);
    $('akhir-peringkat').textContent = p.nama;
    $('akhir-pesan').textContent = p.pesan;
    $('akhir-skor').textContent = total;
    $('akhir-maks').textContent = maks;
    var tb = $('akhir-tabel');
    kosongkan(tb);
    game.data.misi.forEach(function (m, i) {
      var r = game.misi[i];
      tb.appendChild(h('tr', {}, [
        h('td', { text: String(m.id) }), h('td', { text: m.judul }),
        h('td', { text: LABEL_STATUS[r.status] }),
        h('td', { text: (r.status === 'selesai' || r.status === 'gagal') ? bintangTeks(r.bintang) : '—' }),
        h('td', { class: 'angka', text: String(r.skor) })
      ]));
    });
    tampilkanLayar('layar-akhir');
  }

  /* --------------------------------------------------------------- catatan teknisi */
  function isiCatatan() {
    var alur = $('catatan-alur');
    kosongkan(alur);
    game.data.alurTroubleshooting.forEach(function (a) {
      alur.appendChild(h('li', {}, [h('strong', { text: a.langkah + '. ' }), a.isi]));
    });
    var wadah = $('catatan-perintah');
    kosongkan(wadah);
    game.data.glosarium.forEach(function (g) {
      wadah.appendChild(h('div', { class: 'kartu kecil-kartu' }, [
        h('h4', {}, [h('code', { text: g.perintah })]),
        h('p', { text: g.fungsi }),
        h('p', { class: 'sub kecil-teks' }, [h('strong', { text: 'Cara membaca: ' }), g.baca])
      ]));
    });
  }

  /* ---------------------------------------------------------------------- init */
  function pasangEvent() {
    $('btn-mulai').addEventListener('click', mulaiBaru);
    $('btn-lanjut').addEventListener('click', lanjutkan);
    $('btn-brand').addEventListener('click', function () { if (jedaHasil) { clearTimeout(jedaHasil); jedaHasil = null; } renderMenu(); tampilkanLayar('layar-menu'); });
    $('btn-bantuan').addEventListener('click', function () { $('dlg-bantuan').showModal(); });
    $('btn-catatan').addEventListener('click', function () { if (game) isiCatatan(); $('dlg-catatan').showModal(); });
    $('btn-ke-peta').addEventListener('click', bukaPeta);
    $('btn-petunjuk').addEventListener('click', klikPetunjuk);
    $('btn-diagnosis').addEventListener('click', klikTombolUtama);
    $('btn-hasil-akhir').addEventListener('click', bukaAkhir);
    $('btn-akhir-peta').addEventListener('click', bukaPeta);
    $('btn-akhir-baru').addEventListener('click', mulaiBaru);
  }

  function init() {
    pasangEvent();
    muatData().then(function (data) {
      var galat = L.validasiData(data);
      if (galat.length) { console.warn('Data misi bermasalah:', galat); }
      game = L.permainanBaru(data);
      var saved = bacaSimpanan();
      if (saved) L.pulihkan(game, saved);
      renderMenu();
      document.body.classList.add('siap');
    }).catch(function (e) {
      var hero = document.querySelector('.hero');
      hero.appendChild(h('p', { class: 'galat', role: 'alert', text: 'Gagal memuat data misi: ' + e.message }));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
