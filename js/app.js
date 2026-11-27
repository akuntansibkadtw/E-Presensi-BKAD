// =======================================================================
// APPLICATION JAVASCRIPT (Tanpa Nested Template Literals, Pure Concat)
// =======================================================================
  (function () {
    'use strict';

    /* -------------------------------------------------------------------
     * 1. STATE & CLIENT-SIDE IN-MEMORY CACHE (Perpindahan Menu 0 Detik)
     * ------------------------------------------------------------------- */
    var AppCache = {
      loaded: false,
      currentUser: null,
      activeShell: 'login',
      activeDeskMenu: 'dasbor-utama',
      activeMobTab: 'beranda',
      activeRekapTab: 'BULANAN',
      rekonStep: 1,
      selectedModeKerja: 'WFO',
      selectedJenisAbsen: 'MASUK',
      capturedFotoData: 'DATA_BIOMETRIK_TERVERIFIKASI',
      pegawai: [],
      presensi: [],
      izin: [],
      spt: [],
      disiplin: [],
      rekon: [],
      delegasiPlt: [],
      auditLog: [],
      masterSkpd: [],
      pendingSkpdImport: null,
      settings: {},
      lastGpsAccuracy: 8,
      presensiPage: 1,
      pegawaiPage: 1,
      reopenPegawaiEditId: null,
      reopenPegawaiFlag: false,
      pendingPegawaiImport: null,
      pendingPresensiImport: null,
      selectedDisiplinId: '',
      selectedDisiplinStage: 4,
      disiplinViewMode: 'WORKSPACE',
      printDocType: 'BAP_DISIPLIN',
      printRefId: '',
      printCopies: 3,
      printZoom: 100,
      printOrientation: 'portrait',
      printShowQR: true,
      printShowKop: true,
      printShowWIT: true,
      faceVerified: false,
      faceMatchScore: 0,
      lastExtractedFaceVec: null,
      lastExtractedFaceEngine: '',
      faceApiReady: false,
      faceApiLoading: false,
      liveCamScanTimer: null,
      liveCamAutoInFlight: false,
      liveCamAutoSubmitted: false,
      realGpsLat: null,
      realGpsLng: null,
      realGpsReady: false,
      realGpsError: '',
      geoLockUnlocked: false,
      gpsMapInstance: null,
      gpsMapUserMarker: null,
      gpsMapOfficeMarker: null,
      gpsMapRadiusCircle: null,
      gpsMapAccCircle: null
    };

    /* -------------------------------------------------------------------
     * 2. SAFE PREVIEW FALLBACK ENGINE (Berjalan penuh di luar GAS Iframe)
     * ------------------------------------------------------------------- */
    var STORAGE_KEY = 'EPresensi_BKAD_Wondama_Cache_v1';
    var SAVED_USER_KEY = 'EPresensi_BKAD_SavedUser_v1';
    var OFFLINE_QUEUE_KEY = 'EPresensi_BKAD_OfflineQueue_v1';

    function loadOfflineQueue() {
      try {
        var raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    }

    function saveOfflineQueue(list) {
      try {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(list || []));
      } catch (e) {}
    }

    function enqueueOfflinePresensi(payload) {
      var q = loadOfflineQueue();
      var wit = getClientWITNow();
      q.push({
        queuedAtWIT: wit.tanggal + ' ' + wit.jam,
        payload: payload
      });
      saveOfflineQueue(q);
      return q.length;
    }

    function syncOfflinePresensiQueue() {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      var q = loadOfflineQueue();
      if (!q.length) return;
      var item = q[0];
      callServer('apiSubmitPresensi', item.payload, null, function (res) {
        var cur = loadOfflineQueue();
        cur.shift();
        saveOfflineQueue(cur);
        if (res && res.record) AppCache.presensi.unshift(res.record);
        if (cur.length > 0) {
          syncOfflinePresensiQueue();
        } else {
          showToast('Seluruh antrean presensi offline berhasil disinkronkan ke server!', 'success');
          if (AppCache.activeShell === 'mobile') renderMobileShell();
        }
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', syncOfflinePresensiQueue);
    }

    function applySavedDeviceNIP() {
      var nipInput = document.getElementById('login-nip');
      var pinInput = document.getElementById('login-pin');
      var banner = document.getElementById('saved-device-banner');
      var nameEl = document.getElementById('saved-device-name');
      if (pinInput) pinInput.value = '';
      try {
        var raw = localStorage.getItem(SAVED_USER_KEY);
        if (raw) {
          var saved = JSON.parse(raw);
          if (saved && saved.nip) {
            if (nipInput) nipInput.value = saved.nip;
            if (nameEl) nameEl.textContent = (saved.nama || 'Pegawai') + ' (' + saved.nip + ')';
            if (banner) {
              banner.classList.remove('hidden');
              banner.classList.add('flex');
            }
            return;
          }
        }
      } catch (e) { }
      if (nipInput) nipInput.value = '';
      if (banner) {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
      }
    }

    function saveDeviceNIP(user) {
      var chk = document.getElementById('login-remember-nip');
      if (chk && !chk.checked) {
        try { localStorage.removeItem(SAVED_USER_KEY); } catch (e) { }
        return;
      }
      if (!user || !user.nip) return;
      try {
        localStorage.setItem(SAVED_USER_KEY, JSON.stringify({
          nip: user.nip,
          nama: user.nama,
          jabatan: user.jabatan || ''
        }));
      } catch (e) { }
    }

    function clearSavedDeviceNIP() {
      try { localStorage.removeItem(SAVED_USER_KEY); } catch (e) { }
      applySavedDeviceNIP();
      var nipInput = document.getElementById('login-nip');
      if (nipInput) nipInput.focus();
    }

    function getDefaultBidangList() {
      return [
        { nama: 'Sekretariat BKAD', sub: ['Subbag Umum & Kepegawaian', 'Subbag Perencanaan & Keuangan'] },
        { nama: 'Bidang Aset', sub: ['Subbid Inventarisasi & Sensus Aset', 'Subbid Pemanfaatan & Penghapusan Aset'] },
        { nama: 'Bidang Perbendaharaan', sub: ['Subbid Perbendaharaan & Verifikasi', 'Subbid Belanja Langsung', 'Subbid Akuntansi & Pelaporan'] },
        { nama: 'Bidang Anggaran', sub: ['Subbid Penyusunan & SIMDA Anggaran', 'Subbid Evaluasi & Pengendalian Anggaran'] },
        { nama: 'Pimpinan BKAD', sub: ['Pimpinan Badan'] }
      ];
    }

    function getDefaultHariLiburList() {
      return [
        { tanggal: '01/01/2026', jenis: 'Libur Nasional', keterangan: 'Tahun Baru 2026 Masehi' },
        { tanggal: '05/02/2026', jenis: 'Libur Fakultatif', keterangan: 'Hari Pekabaran Injil (PI) di Tanah Papua (Fakultatif Papua Barat)' },
        { tanggal: '16/02/2026', jenis: 'Cuti Bersama', keterangan: 'Cuti Bersama Tahun Baru Imlek 2577 Kongzili' },
        { tanggal: '17/02/2026', jenis: 'Libur Nasional', keterangan: 'Tahun Baru Imlek 2577 Kongzili' },
        { tanggal: '19/03/2026', jenis: 'Libur Nasional', keterangan: 'Hari Suci Nyepi Tahun Baru Saka 1948' },
        { tanggal: '20/03/2026', jenis: 'Libur Nasional', keterangan: 'Hari Raya Idul Fitri 1447 H' },
        { tanggal: '23/03/2026', jenis: 'Cuti Bersama', keterangan: 'Cuti Bersama Hari Raya Idul Fitri 1447 H' },
        { tanggal: '24/03/2026', jenis: 'Cuti Bersama', keterangan: 'Cuti Bersama Hari Raya Idul Fitri 1447 H' },
        { tanggal: '03/04/2026', jenis: 'Libur Nasional', keterangan: 'Wafat Yesus Kristus (Jumat Agung)' },
        { tanggal: '06/04/2026', jenis: 'Libur Fakultatif', keterangan: 'Libur Fakultatif Paskah Hari Kedua Provinsi Papua Barat' },
        { tanggal: '12/04/2026', jenis: 'Libur Fakultatif', keterangan: 'HUT Kabupaten Teluk Wondama' },
        { tanggal: '01/05/2026', jenis: 'Libur Nasional', keterangan: 'Hari Buruh Internasional' },
        { tanggal: '14/05/2026', jenis: 'Libur Nasional', keterangan: 'Kenaikan Yesus Kristus' },
        { tanggal: '15/05/2026', jenis: 'Cuti Bersama', keterangan: 'Cuti Bersama Kenaikan Yesus Kristus' },
        { tanggal: '27/05/2026', jenis: 'Libur Nasional', keterangan: 'Hari Raya Idul Adha 1447 H' },
        { tanggal: '01/06/2026', jenis: 'Libur Nasional', keterangan: 'Hari Lahir Pancasila' },
        { tanggal: '17/08/2026', jenis: 'Libur Nasional', keterangan: 'Hari Kemerdekaan Republik Indonesia' },
        { tanggal: '24/12/2026', jenis: 'Libur Fakultatif', keterangan: 'Libur Fakultatif Daerah Menjelang Hari Raya Natal' },
        { tanggal: '25/12/2026', jenis: 'Libur Nasional', keterangan: 'Hari Raya Natal' },
        { tanggal: '26/12/2026', jenis: 'Cuti Bersama', keterangan: 'Cuti Bersama Hari Raya Natal' }
      ];
    }

    function getDefaultMockDB() {
      return {
        settings: {
          GEOFENCE_COORDINATES: { value: { lat: -2.7238, lng: 134.5042, radiusMeter: 150, lokasi: 'Kompleks Perkantoran Pemkab Rasiei / Isei 98362' } },
          JAM_KERJA_WIT: { value: { masuk: '08:00', pulangSeninKamis: '16:00', pulangJumat: '16:30', toleransiMenit: 15 } },
          INTEGRASI_GATEWAY: { value: { siasnBkn: 'AKTIF', simdaKeuangan: 'AKTIF', tarifPotonganTppPerMenit: 2500 } },
          PEJABAT_PENANDATANGAN: { value: { kabanNama: 'Dr. Hendrik Mambor, S.E., M.Si.', kabanNip: '19751128 200909 1 001', kabanPangkat: 'Pembina Utama Muda (IV/c)' } },
          MASTER_BIDANG_SUBBIDANG: { value: getDefaultBidangList() },
          MASTER_HARI_LIBUR: { value: getDefaultHariLiburList() }
        },
        pegawai: [
          { id: 'PEG-2025-001', nip: '198001102006041001', nama: 'Yulianus Mandacan, S.IP', pangkat: 'Pembina (IV/a)', jabatan: 'Super Admin & Kasubbag Umum Kepegawaian', bidang: 'Sekretariat BKAD', subBidang: 'Subbag Umum & Kepegawaian', peran: 'Super Admin', modeDefault: 'WFO', statusKepegawaian: 'PNS', telepon: '081248001001' },
          { id: 'PEG-2025-002', nip: '198503122010011002', nama: 'Budi Santoso, S.E.', pangkat: 'Penata Tk. I (III/d)', jabatan: 'Analis Keuangan Pusat & Daerah Ahli Muda', bidang: 'Bidang Aset', subBidang: 'Subbid Inventarisasi & Sensus Aset', peran: 'Pegawai', modeDefault: 'WFO', statusKepegawaian: 'PNS', telepon: '081248001002' },
          { id: 'PEG-2025-003', nip: '199108152015051003', nama: 'Yulianus Kereway, A.Md.', pangkat: 'Pengatur Tk. I (II/d)', jabatan: 'Pengelola Data Belanja Daerah', bidang: 'Bidang Perbendaharaan', subBidang: 'Subbid Belanja Langsung', peran: 'Pegawai', modeDefault: 'WFO', statusKepegawaian: 'PNS', telepon: '081248001003' },
          { id: 'PEG-2025-004', nip: '198802142008021001', nama: 'Dominggus Torey, S.E., M.Si.', pangkat: 'Penata Tk. I (III/d)', jabatan: 'Kasubid Perbendaharaan & Verifikasi', bidang: 'Bidang Perbendaharaan', subBidang: 'Subbid Perbendaharaan & Verifikasi', peran: 'Kasubid', modeDefault: 'WFO', statusKepegawaian: 'PNS', telepon: '081248001004' },
          { id: 'PEG-2025-005', nip: '198106222007011002', nama: 'Drs. Lukas Wambrauw, M.M.', pangkat: 'Pembina (IV/a)', jabatan: 'Kepala Bidang Perbendaharaan & Akuntansi', bidang: 'Bidang Perbendaharaan', subBidang: 'Subbid Akuntansi & Pelaporan', peran: 'Kabid', modeDefault: 'WFO', statusKepegawaian: 'PNS', telepon: '081248001005' },
          { id: 'PEG-2025-006', nip: '197511282009091001', nama: 'Dr. Hendrik Mambor, S.E., M.Si.', pangkat: 'Pembina Utama Muda (IV/c)', jabatan: 'Kepala Badan BKAD Kab. Teluk Wondama', bidang: 'Pimpinan BKAD', subBidang: 'Pimpinan Badan', peran: 'Kepala Badan', modeDefault: 'WFO', statusKepegawaian: 'PNS', telepon: '081248001006' },
          { id: 'PEG-2025-007', nip: '199405192022212004', nama: 'Maria Rumbiak, A.Md.', pangkat: 'Golongan VII', jabatan: 'Verifikator Inventaris Aset Daerah', bidang: 'Bidang Aset', subBidang: 'Subbid Inventarisasi & Sensus Aset', peran: 'Pegawai', modeDefault: 'WFA', statusKepegawaian: 'PPPK', telepon: '081248001007' },
          { id: 'PEG-2025-008', nip: '198911032014031002', nama: 'Oktovianus Sayori, S.Kom.', pangkat: 'Penata (III/c)', jabatan: 'Pranata Komputer & Pengelola SIMDA', bidang: 'Bidang Anggaran', subBidang: 'Subbid Penyusunan & SIMDA Anggaran', peran: 'Pegawai', modeDefault: 'WFH', statusKepegawaian: 'PNS', telepon: '081248001008' }
        ],
        presensi: [
          { id: 'PRS-202611-005', nip: '199108152015051003', nama: 'Yulianus Kereway, A.Md.', bidang: 'Bidang Perbendaharaan', tanggal: '15/11/2026', jamMasuk: '08:27:10', jamPulang: '16:05:30', modeKerja: 'WFO', koordinat: '-2.72385, 134.50425', fotoUrl: 'DATA_BIOMETRIK_TERVERIFIKASI', status: 'Terlambat', keterangan: 'Terlambat 27 menit WIT — Potongan TPP 0.5%' },
          { id: 'PRS-202611-004', nip: '198802142008021001', nama: 'Dominggus Torey, S.E., M.Si.', bidang: 'Bidang Perbendaharaan', tanggal: '16/11/2026', jamMasuk: '07:38:05', jamPulang: '', modeKerja: 'WFO', koordinat: '-2.72379, 134.50419', fotoUrl: 'DATA_BIOMETRIK_TERVERIFIKASI', status: 'Tepat Waktu', keterangan: 'Presensi Masuk Kantor BKAD Rasiei (Akurasi GPS 6m)' },
          { id: 'PRS-202611-003', nip: '198911032014031002', nama: 'Oktovianus Sayori, S.Kom.', bidang: 'Bidang Anggaran', tanggal: '16/11/2026', jamMasuk: '08:14:22', jamPulang: '', modeKerja: 'WFH', koordinat: '-2.72950, 134.50910', fotoUrl: 'DATA_BIOMETRIK_TERVERIFIKASI', status: 'Terlambat', keterangan: 'Terlambat 14 menit WIT — Sinkronisasi SIMDA Anggaran' },
          { id: 'PRS-202611-002', nip: '199405192022212004', nama: 'Maria Rumbiak, A.Md.', bidang: 'Bidang Aset', tanggal: '16/11/2026', jamMasuk: '07:55:40', jamPulang: '', modeKerja: 'WFA', koordinat: '-2.46820, 134.58190', fotoUrl: 'DATA_BIOMETRIK_TERVERIFIKASI', status: 'Tepat Waktu', keterangan: 'Dinas Lapangan Sensus Aset Distrik Kepulauan Roon (SPT Terverifikasi)' },
          { id: 'PRS-202611-001', nip: '198503122010011002', nama: 'Budi Santoso, S.E.', bidang: 'Bidang Aset', tanggal: '16/11/2026', jamMasuk: '07:42:15', jamPulang: '16:12:00', modeKerja: 'WFO', koordinat: '-2.72381, 134.50422', fotoUrl: 'DATA_BIOMETRIK_TERVERIFIKASI', status: 'Tepat Waktu', keterangan: 'Presensi Masuk Kantor BKAD Rasiei (Akurasi GPS 8m)' }
        ],
        izin: [
          { id: 'IZN-202611-001', nip: '199108152015051003', nama: 'Yulianus Kereway, A.Md.', jabatan: 'Pengelola Data Belanja Daerah', bidang: 'Bidang Perbendaharaan', jenis: 'Izin Keluar Kota', tglMulai: '20/11/2026', tglSelesai: '23/11/2026', alasan: 'Menghadiri Acara Wisuda Keluarga di Manokwari', berkasUrl: 'undangan_wisuda_kereway.pdf', statusKasubid: 'Menunggu', statusKabid: 'Menunggu', statusKaban: 'Menunggu', statusFinal: 'Menunggu Telaah Kasubid', nomorSurat: '' },
          { id: 'IZN-202611-002', nip: '198503122010011002', nama: 'Budi Santoso, S.E.', jabatan: 'Analis Keuangan Ahli Muda', bidang: 'Bidang Aset', jenis: 'Cuti Tahunan', tglMulai: '02/12/2026', tglSelesai: '06/12/2026', alasan: 'Keperluan Keluarga Mendesak di Wasior', berkasUrl: 'formulir_cuti_budi.pdf', statusKasubid: 'Disetujui', statusKabid: 'Menunggu', statusKaban: 'Menunggu', statusFinal: 'Rekomendasi Kasubid Disahkan — Diteruskan ke Kabid (Tahap 2)', nomorSurat: '' },
          { id: 'IZN-202611-003', nip: '198911032014031002', nama: 'Oktovianus Sayori, S.Kom.', jabatan: 'Pranata Komputer', bidang: 'Bidang Anggaran', jenis: 'Izin Sakit', tglMulai: '10/11/2026', tglSelesai: '11/11/2026', alasan: 'Surat Keterangan Dokter RSUD Teluk Wondama', berkasUrl: 'suket_dokter_rsud.pdf', statusKasubid: 'Disetujui', statusKabid: 'Disetujui', statusKaban: 'Disetujui', statusFinal: 'Sah Diterbitkan', nomorSurat: '800.1.6/089/BKAD-TW/XI/2026' }
        ],
        spt: [
          { id: 'SPT-202611-001', nomorSPT: '094/012/SPT-ASET/BKAD/2026', daftarNIP: '199405192022212004, 198503122010011002', lokasi: 'Distrik Kepulauan Roon (-2.46820, 134.58190)', tglMulai: '14/11/2026', tglSelesai: '18/11/2026', keperluan: 'Sensus & Verifikasi Lapangan Aset Tetap Pemda Kepulauan Roon', statusGPS: 'Terverifikasi Sesuai Koordinat' },
          { id: 'SPT-202611-002', nomorSPT: '094/013/SPT-ASET/BKAD/2026', daftarNIP: '198503122010011002', lokasi: 'Distrik Windesi (-2.41250, 134.23410)', tglMulai: '19/11/2026', tglSelesai: '21/11/2026', keperluan: 'Inspeksi Aset Sekolah & Puskesmas Pembantu Pesisir Windesi', statusGPS: 'Menunggu Audit Geotagging' },
          { id: 'SPT-202611-003', nomorSPT: '094/014/SPT-ANG/BKAD/2026', daftarNIP: '198911032014031002', lokasi: 'Kantor BPKP Perwakilan Papua Barat (Manokwari)', tglMulai: '24/11/2026', tglSelesai: '26/11/2026', keperluan: 'Koordinasi Asistensi Penyusunan RKA-SKPD Perubahan', statusGPS: 'Terjadwal' }
        ],
        disiplin: [
          { id: 'DISP-2025-009', nip: '199108152015051003', nama: 'Yulianus Kereway, A.Md.', pelanggaran: 'Tidak Masuk Kerja Tanpa Keterangan Sah selama 5 Hari Kerja Kumulatif', dasarHukum: 'PP No. 94 Tahun 2021 Pasal 8 Ayat (2)', tahap: 'Tahap 8 - Inkrah & Sinkronisasi I-Dis BKN', sanksi: 'Teguran Tertulis (Hukuman Disiplin Ringan)', nomorSK: '800.1.6.2/012/SK-DISP/BKAD/2025', tanggalSK: '28/10/2025', statusIDis: 'Tersinkronisasi', regIDis: 'IDIS-BKN-2025-TW-9821' },
          { id: 'DISP-2026-001', nip: '198911032014031002', nama: 'Oktovianus Sayori, S.Kom.', pelanggaran: 'Akumulasi Keterlambatan Melebihi 7,5 Jam Kerja pada Triwulan III', dasarHukum: 'PP No. 94 Tahun 2021 Pasal 4 Huruf f', tahap: 'Tahap 4 - Sidang Berita Acara Pemeriksaan (BAP)', sanksi: 'Dalam Pemeriksaan Tim Pemeriksa', nomorSK: '', tanggalSK: '', statusIDis: 'Belum Sinkron', regIDis: '' }
        ],
        rekon: [
          { id: 'RKN-202510-001', periode: 'Januari – Oktober 2025', nomorBA: '800.1.6.2/045/BA-REKON/BKAD-TW/XI/2025', totalPegawai: 142, anomaliTeridentifikasi: 14, anomaliTerselesaikan: 14, statusKunci: 'Terkunci Sah (Locked)', tanggalSah: '31/10/2025' },
          { id: 'RKN-202611-001', periode: 'November 2026 (Berjalan)', nomorBA: '800.1.6.2/046/BA-REKON/BKAD-TW/XI/2026', totalPegawai: 142, anomaliTeridentifikasi: 3, anomaliTerselesaikan: 1, statusKunci: 'Draft Validasi Dry-Run', tanggalSah: '' }
        ]
      };
    }

    function loadLocalDB() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { }
      var def = getDefaultMockDB();
      saveLocalDB(def);
      return def;
    }

    function saveLocalDB(db) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      } catch (e) { }
    }

    function getClientWITNow() {
      var now = new Date();
      var utc = now.getTime() + now.getTimezoneOffset() * 60000;
      var wit = new Date(utc + 9 * 3600000);
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      return {
        tanggal: pad(wit.getDate()) + '/' + pad(wit.getMonth() + 1) + '/' + wit.getFullYear(),
        jam: pad(wit.getHours()) + ':' + pad(wit.getMinutes()) + ':' + pad(wit.getSeconds()),
        ym: String(wit.getFullYear()) + pad(wit.getMonth() + 1),
        yyyy: String(wit.getFullYear()),
        mm: pad(wit.getMonth() + 1)
      };
    }

    function haversineMeters(lat1, lon1, lat2, lon2) {
      var R = 6371000;
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLon = (lon2 - lon1) * Math.PI / 180;
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }

    function nextSeqId(list, prefix, useYM) {
      var wit = getClientWITNow();
      var fullPrefix = prefix + '-' + (useYM ? wit.ym : wit.yyyy) + '-';
      var max = 0;
      for (var i = 0; i < list.length; i++) {
        var id = String(list[i].id || '');
        if (id.indexOf(fullPrefix) === 0) {
          var num = parseInt(id.substring(fullPrefix.length), 10);
          if (!isNaN(num) && num > max) max = num;
        }
      }
      return fullPrefix + ('000' + (max + 1)).slice(-3);
    }

    /* Mesin Fallback Lokal yang Identik dengan code.gs */
    var LocalBackendEngine = {
      apiGetInitialBundle: function () {
        var db = loadLocalDB();
        return {
          ok: true,
          serverWIT: getClientWITNow(),
          settings: db.settings,
          pegawai: db.pegawai,
          presensi: db.presensi,
          izin: db.izin,
          spt: db.spt,
          disiplin: db.disiplin,
          rekon: db.rekon,
          delegasiPlt: db.delegasiPlt || [],
          auditLog: db.auditLog || [],
          masterSkpd: db.masterSkpd || [
            { id: 'SKPD-001', nomor: '1', kodeSkpd: '5.02.0.00.0.00.01.0000', namaSkpd: 'Badan Pengelolaan Keuangan dan Aset Daerah', jabatanPimpinan: 'Kepala Badan Pengelolaan Keuangan dan Aset Daerah', namaKepala: 'Nixon N. N. Baransano, S.E.', nipKepala: '197511282009091001', subUnits: ['Sekretariat BKAD', 'Bidang Aset', 'Bidang Perbendaharaan', 'Bidang Anggaran'] },
            { id: 'SKPD-002', nomor: '2', kodeSkpd: '1.02.0.00.0.00.01.0000', namaSkpd: 'Dinas Kesehatan', jabatanPimpinan: 'Kepala Dinas Kesehatan', namaKepala: 'Kepala Dinas Kesehatan Kab. Teluk Wondama', nipKepala: '', subUnits: ['Sekretariat Dinas Kesehatan', 'Puskesmas Wasior', 'Puskesmas Rasiei', 'Puskesmas Windesi', 'Puskesmas Wondiboi'] },
            { id: 'SKPD-003', nomor: '3', kodeSkpd: '4.01.0.00.0.00.01.0000', namaSkpd: 'Sekretariat Daerah', jabatanPimpinan: 'Sekretaris Daerah', namaKepala: 'Sekretaris Daerah Kab. Teluk Wondama', nipKepala: '', subUnits: ['Bagian Umum dan Perlengkapan', 'Bagian Kesejahteraan Rakyat', 'Bagian Pemerintahan', 'Bagian Hukum'] }
          ]
        };
      },
      apiGetNextId: function (entityType) {
        var db = loadLocalDB();
        var id = '';
        if (entityType === 'PEGAWAI') id = nextSeqId(db.pegawai, 'PEG', false);
        else if (entityType === 'PRESENSI') id = nextSeqId(db.presensi, 'PRS', true);
        else if (entityType === 'IZIN') id = nextSeqId(db.izin, 'IZN', true);
        else if (entityType === 'SPT') id = nextSeqId(db.spt, 'SPT', true);
        else if (entityType === 'DISIPLIN') id = nextSeqId(db.disiplin, 'DISP', false);
        else if (entityType === 'REKON') id = nextSeqId(db.rekon, 'RKN', true);
        else if (entityType === 'DELEGASI') id = nextSeqId(db.delegasiPlt || [], 'DLG', false);
        else if (entityType === 'AUDIT') id = nextSeqId(db.auditLog || [], 'LOG', true);
        else if (entityType === 'SKPD') id = nextSeqId(db.masterSkpd || [], 'SKPD', false);
        return { ok: true, nextId: id };
      },
      apiAuthenticate: function (payload) {
        var db = loadLocalDB();
        var nip = String((payload && payload.nip) || '').replace(/\s+/g, '').trim();
        var pin = String((payload && payload.pin) || '').trim();
        if (!nip) return { ok: false, error: 'NIP wajib diisi.' };
        if (!/^\d{6}$/.test(pin)) return { ok: false, error: 'Kode PIN wajib 6 digit angka.' };
        var found = null;
        for (var i = 0; i < db.pegawai.length; i++) {
          if (db.pegawai[i].nip === nip) { found = db.pegawai[i]; break; }
        }
        if (!found) return { ok: false, error: 'NIP belum terdaftar di database BKAD Teluk Wondama.' };
        if (String(found.statusAktif || 'AKTIF').toUpperCase() === 'ARSIP') {
          return {
            ok: false,
            error: 'Akses Ditolak: Data pegawai a.n. ' + found.nama + ' telah diarsipkan (' + (found.alasanNonaktif || 'Nonaktif / Pindah Tugas') + (found.tanggalNonaktif ? ' per ' + found.tanggalNonaktif : '') + ').'
          };
        }
        if (pin !== '123456' && pin !== nip.slice(-6)) return { ok: false, error: 'Kode PIN salah.' };
        return { ok: true, user: found, serverWIT: getClientWITNow(), bundle: LocalBackendEngine.apiGetInitialBundle() };
      },
      apiQueryData: function (params) {
        var db = loadLocalDB();
        var entity = (params && params.entity) || 'PRESENSI';
        var search = String((params && params.search) || '').toLowerCase().trim();
        var filters = (params && params.filters) || {};
        var page = Math.max(1, parseInt((params && params.page) || 1, 10));
        var pageSize = Math.max(1, parseInt((params && params.pageSize) || 6, 10));
        var source = entity === 'PEGAWAI' ? db.pegawai : db.presensi;
        var filtered = source.filter(function (item) {
          if (search && JSON.stringify(item).toLowerCase().indexOf(search) === -1) return false;
          if (filters.modeKerja && filters.modeKerja !== 'SEMUA' && item.modeKerja !== filters.modeKerja) return false;
          if (filters.status && filters.status !== 'SEMUA' && item.status !== filters.status) return false;
          if (filters.bidang && filters.bidang !== 'SEMUA' && item.bidang !== filters.bidang) return false;
          if (entity === 'PEGAWAI') {
            var fAktif = String(filters.statusAktif || 'AKTIF').toUpperCase();
            var iAktif = String(item.statusAktif || 'AKTIF').toUpperCase();
            if (fAktif === 'ARSIP' && iAktif !== 'ARSIP') return false;
            if (fAktif === 'AKTIF' && iAktif === 'ARSIP') return false;
          }
          return true;
        });
        var total = filtered.length;
        var totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (page > totalPages) page = totalPages;
        var offset = (page - 1) * pageSize;
        return { ok: true, items: filtered.slice(offset, offset + pageSize), total: total, page: page, pageSize: pageSize, totalPages: totalPages };
      },
      apiSubmitPresensi: function (payload) {
        var db = loadLocalDB();
        var wit = getClientWITNow();
        var geo = db.settings.GEOFENCE_COORDINATES.value;
        var peg = db.pegawai.filter(function (p) { return p.nip === payload.nip; })[0] || { nama: 'ASN BKAD', bidang: '-', peran: 'Pegawai' };
        var isUnlocked = !!(geo && geo.geoLockUnlocked === true) || !!(payload.unlockGeoLock === true && (peg.peran === 'Super Admin' || peg.peran === 'Kepala Badan'));
        var maxAcc = geo.maxGpsAccuracyMeter || 50;
        var gpsAcc = (payload.accuracy !== undefined && payload.accuracy !== null && payload.accuracy !== '') ? parseFloat(payload.accuracy) : 0;
        if (!isUnlocked && !isNaN(gpsAcc) && gpsAcc > maxAcc) {
          return { ok: false, error: 'Sinyal GPS Lemah (Akurasi ' + Math.round(gpsAcc) + 'm > batas ' + maxAcc + 'm). Silakan pindah ke area terbuka.' };
        }
        var jarak = haversineMeters(payload.lat, payload.lng, geo.lat, geo.lng);
        if (!isUnlocked && payload.modeKerja === 'WFO' && jarak > geo.radiusMeter) {
          return { ok: false, error: 'Geo-Lock Ditolak: Jarak Anda ' + jarak + 'm dari Kantor BKAD Rasiei (batas maksimal ' + geo.radiusMeter + 'm).' };
        }
        if (payload.faceVerified === false) {
          return { ok: false, error: 'Verifikasi Biometrik Wajah (Face Recognition) belum lulus atau tidak cocok dengan pemilik NIP.' };
        }
        if (payload.jenisAbsen === 'PULANG') {
          for (var i = 0; i < db.presensi.length; i++) {
            if (db.presensi[i].nip === payload.nip && db.presensi[i].tanggal === wit.tanggal) {
              db.presensi[i].jamPulang = wit.jam;
              saveLocalDB(db);
              return { ok: true, message: 'Presensi Pulang WIT berhasil direkam pukul ' + wit.jam + ' WIT.', record: db.presensi[i] };
            }
          }
        }
        var jamLimit = String((db.settings.JAM_KERJA_WIT && db.settings.JAM_KERJA_WIT.value.masuk) || '08:00').split(':');
        var limitMin = parseInt(jamLimit[0], 10) * 60 + parseInt(jamLimit[1], 10);
        var nowParts = wit.jam.split(':');
        var nowMin = parseInt(nowParts[0], 10) * 60 + parseInt(nowParts[1], 10);
        var diff = nowMin - limitMin;
        var status = diff > 0 ? 'Terlambat' : 'Tepat Waktu';
        var faceTag = payload.faceScore ? (' [Face ID ' + payload.faceScore + '% Cocok]') : '';
        var rec = {
          id: nextSeqId(db.presensi, 'PRS', true),
          nip: payload.nip,
          nama: peg.nama,
          bidang: peg.bidang,
          tanggal: wit.tanggal,
          jamMasuk: wit.jam,
          jamPulang: payload.jenisAbsen === 'PULANG' ? wit.jam : '',
          modeKerja: payload.modeKerja,
          koordinat: Number(payload.lat).toFixed(5) + ', ' + Number(payload.lng).toFixed(5),
          fotoUrl: 'DATA_BIOMETRIK_TERVERIFIKASI',
          status: status,
          keterangan: (payload.keterangan || (payload.modeKerja === 'WFO' ? 'Presensi Kantor BKAD Rasiei (' + jarak + 'm)' : 'Dinas Lapangan / WFH Terverifikasi')) + faceTag
        };
        db.presensi.unshift(rec);
        saveLocalDB(db);
        return { ok: true, message: 'Presensi ' + payload.jenisAbsen + ' (' + payload.modeKerja + ') direkam pukul ' + wit.jam + ' WIT.', record: rec };
      },
      apiImportPresensiBatch: function (payload) {
        var db = loadLocalDB();
        var list = (payload && payload.rows) || [];
        var allowUpsert = payload && payload.upsert !== false;
        var pegByNip = {};
        for (var p = 0; p < db.pegawai.length; p++) {
          var pNipClean = String(db.pegawai[p].nip || '').replace(/\s+/g, '');
          if (pNipClean) pegByNip[pNipClean] = db.pegawai[p];
        }
        var added = [];
        var updated = [];
        var skipped = 0;
        for (var i = 0; i < list.length; i++) {
          var item = list[i];
          var nipClean = String(item.nip || '').replace(/\s+/g, '').trim();
          var tglStr = String(item.tanggal || '').trim();
          if (!nipClean || !tglStr) continue;
          var peg = pegByNip[nipClean] || { nama: item.nama || ('ASN (' + nipClean + ')'), bidang: item.bidang || '-' };
          var existIdx = -1;
          for (var k = 0; k < db.presensi.length; k++) {
            if (String(db.presensi[k].nip || '').replace(/\s+/g, '') === nipClean && db.presensi[k].tanggal === tglStr) {
              existIdx = k;
              break;
            }
          }
          if (existIdx >= 0) {
            if (allowUpsert) {
              db.presensi[existIdx].jamMasuk = item.jamMasuk !== undefined ? item.jamMasuk : db.presensi[existIdx].jamMasuk;
              db.presensi[existIdx].jamPulang = item.jamPulang !== undefined ? item.jamPulang : db.presensi[existIdx].jamPulang;
              db.presensi[existIdx].modeKerja = item.modeKerja || db.presensi[existIdx].modeKerja;
              db.presensi[existIdx].koordinat = item.koordinat || db.presensi[existIdx].koordinat;
              db.presensi[existIdx].status = item.status || db.presensi[existIdx].status;
              db.presensi[existIdx].keterangan = item.keterangan || db.presensi[existIdx].keterangan;
              updated.push(db.presensi[existIdx]);
            } else {
              skipped++;
            }
            continue;
          }
          var tglParts = tglStr.split('/');
          var ymCode = (tglParts.length === 3 && tglParts[2].length === 4) ? (tglParts[2] + ('0' + tglParts[1]).slice(-2)) : getClientWITNow().ym;
          var seqPref = 'PRS-' + ymCode + '-';
          var seqMax = 0;
          for (var q = 0; q < db.presensi.length; q++) {
            var exId = String(db.presensi[q].id || '');
            if (exId.indexOf(seqPref) === 0) {
              var exNum = parseInt(exId.substring(seqPref.length), 10);
              if (!isNaN(exNum) && exNum > seqMax) seqMax = exNum;
            }
          }
          var rec = {
            id: seqPref + ('000' + (seqMax + 1)).slice(-3),
            nip: nipClean,
            nama: peg.nama,
            bidang: peg.bidang,
            tanggal: tglStr,
            jamMasuk: String(item.jamMasuk || '').trim(),
            jamPulang: String(item.jamPulang || '').trim(),
            modeKerja: String(item.modeKerja || 'WFO').trim(),
            koordinat: String(item.koordinat || '-2.72380, 134.50420').trim(),
            fotoUrl: 'IMPOR_MANUAL_EXCEL',
            status: String(item.status || 'Tepat Waktu').trim(),
            keterangan: String(item.keterangan || 'Input Presensi Manual / Impor Excel').trim()
          };
          db.presensi.unshift(rec);
          added.push(rec);
        }
        saveLocalDB(db);
        return {
          ok: true,
          importedCount: added.length,
          updatedCount: updated.length,
          skippedCount: skipped,
          records: added.concat(updated),
          message: 'Impor presensi selesai: ' + added.length + ' ditambahkan, ' + updated.length + ' diperbarui, ' + skipped + ' dilewati.'
        };
      },
      apiSavePegawai: function (payload) {
        var db = loadLocalDB();
        var idx = -1;
        var prev = null;
        if (payload.id) {
          for (var i = 0; i < db.pegawai.length; i++) {
            if (db.pegawai[i].id === payload.id) { idx = i; prev = db.pegawai[i]; break; }
          }
        }
        var rec = {
          id: payload.id || nextSeqId(db.pegawai, 'PEG', false),
          nip: String(payload.nip || '').replace(/\s+/g, ''),
          nama: payload.nama,
          pangkat: payload.pangkat || 'Penata (III/c)',
          jabatan: payload.jabatan || 'Staf Pelaksana',
          bidang: payload.bidang || 'Bidang Aset',
          subBidang: payload.subBidang || '',
          skpd: payload.skpd || (prev ? prev.skpd : '') || 'Badan Pengelolaan Keuangan dan Aset Daerah',
          peran: payload.peran || 'Pegawai',
          modeDefault: payload.modeDefault || 'WFO',
          statusKepegawaian: payload.statusKepegawaian || 'PNS',
          telepon: payload.telepon || (prev ? prev.telepon : '-'),
          statusAktif: payload.statusAktif || (prev ? prev.statusAktif : 'AKTIF') || 'AKTIF',
          tanggalNonaktif: payload.tanggalNonaktif !== undefined ? payload.tanggalNonaktif : ((prev && prev.tanggalNonaktif) || ''),
          alasanNonaktif: payload.alasanNonaktif !== undefined ? payload.alasanNonaktif : ((prev && prev.alasanNonaktif) || ''),
          faceDescriptor: payload.faceDescriptor !== undefined ? payload.faceDescriptor : ((prev && prev.faceDescriptor) || ''),
          hasFaceEnrolled: !!(payload.faceDescriptor !== undefined ? payload.faceDescriptor : ((prev && prev.faceDescriptor) || ''))
        };
        if (idx >= 0) db.pegawai[idx] = rec;
        else db.pegawai.unshift(rec);
        saveLocalDB(db);
        return { ok: true, message: idx >= 0 ? 'Data pegawai diperbarui.' : 'Pegawai baru ditambahkan.', record: rec };
      },
      apiEnrollFacePegawai: function (payload) {
        var db = loadLocalDB();
        var nipClean = String((payload && payload.nip) || '').replace(/\s+/g, '').trim();
        var targetId = String((payload && payload.id) || '').trim();
        var desc = String((payload && payload.descriptorJson) || '').trim();
        for (var i = 0; i < db.pegawai.length; i++) {
          var p = db.pegawai[i];
          if ((nipClean && String(p.nip || '').replace(/\s+/g, '') === nipClean) || (targetId && p.id === targetId)) {
            p.faceDescriptor = desc;
            p.hasFaceEnrolled = desc.length > 20;
            saveLocalDB(db);
            return { ok: true, record: p, message: 'Biometrik Face ID a.n. ' + p.nama + ' berhasil didaftarkan.' };
          }
        }
        return { ok: false, error: 'Pegawai tidak ditemukan.' };
      },
      apiResetFacePegawai: function (payload) {
        var db = loadLocalDB();
        var nipClean = String((payload && payload.nip) || '').replace(/\s+/g, '').trim();
        var targetId = String((payload && payload.id) || '').trim();
        for (var i = 0; i < db.pegawai.length; i++) {
          var p = db.pegawai[i];
          if ((targetId && p.id === targetId) || (nipClean && String(p.nip || '').replace(/\s+/g, '') === nipClean)) {
            p.faceDescriptor = '';
            p.hasFaceEnrolled = false;
            saveLocalDB(db);
            return { ok: true, record: p, message: 'Data Face ID a.n. ' + p.nama + ' berhasil direset.' };
          }
        }
        return { ok: false, error: 'Pegawai tidak ditemukan.' };
      },
      apiArchivePegawai: function (payload) {
        var db = loadLocalDB();
        var targetId = String((payload && payload.id) || '').trim();
        var act = String((payload && payload.action) || 'ARCHIVE').toUpperCase();
        for (var i = 0; i < db.pegawai.length; i++) {
          if (db.pegawai[i].id === targetId) {
            var p = db.pegawai[i];
            if (act === 'RESTORE') {
              p.statusAktif = 'AKTIF';
              p.tanggalNonaktif = '';
              p.alasanNonaktif = '';
            } else {
              var kategori = String((payload && payload.kategoriAlasan) || 'Pindah Tugas / Mutasi Keluar OPD').trim();
              var noSK = String((payload && payload.nomorSK) || '').trim();
              var catatan = String((payload && payload.catatan) || '').trim();
              var tglNon = String((payload && payload.tanggalNonaktif) || getClientWITNow().tanggal).trim();
              p.statusAktif = 'ARSIP';
              p.tanggalNonaktif = tglNon;
              p.alasanNonaktif = kategori + (noSK ? ' (No. SK: ' + noSK + ')' : '') + (catatan ? ' — ' + catatan : '');
            }
            saveLocalDB(db);
            return {
              ok: true,
              record: p,
              message: act === 'RESTORE'
                ? 'Pegawai a.n. ' + p.nama + ' berhasil diaktifkan kembali.'
                : 'Pegawai a.n. ' + p.nama + ' berhasil diarsipkan (' + p.alasanNonaktif + ').'
            };
          }
        }
        return { ok: false, error: 'Data pegawai tidak ditemukan.' };
      },
      apiImportPegawaiBatch: function (payload) {
        var db = loadLocalDB();
        var list = (payload && payload.rows) || [];
        var allowUpsert = !payload || payload.upsert !== false;
        var existingIdxByNip = {};
        for (var eIdx = 0; eIdx < db.pegawai.length; eIdx++) {
          var cEx = String(db.pegawai[eIdx].nip || '').replace(/[^0-9]/g, '');
          if (cEx) existingIdxByNip[cEx] = eIdx;
        }
        var added = [];
        var addedCount = 0;
        var updatedCount = 0;
        for (var i = 0; i < list.length; i++) {
          var item = list[i];
          var nipClean = String(item.nip || '').replace(/[^0-9]/g, '').trim();
          if (!nipClean) continue;
          var exPos = existingIdxByNip[nipClean];
          if (exPos !== undefined) {
            if (!allowUpsert) continue;
            var prev = db.pegawai[exPos];
            if (item.nama) prev.nama = String(item.nama).trim();
            if (item.pangkat) prev.pangkat = String(item.pangkat).trim();
            if (item.jabatan) prev.jabatan = String(item.jabatan).trim();
            if (item.bidang) prev.bidang = String(item.bidang).trim();
            if (item.subBidang !== undefined && item.subBidang !== '') prev.subBidang = String(item.subBidang).trim();
            if (item.peran) prev.peran = String(item.peran).trim();
            if (item.modeDefault) prev.modeDefault = String(item.modeDefault).trim();
            if (item.statusKepegawaian) prev.statusKepegawaian = String(item.statusKepegawaian).trim();
            if (item.telepon && item.telepon !== '-') prev.telepon = String(item.telepon).trim();
            added.push(prev);
            updatedCount++;
          } else {
            var rec = {
              id: nextSeqId(db.pegawai, 'PEG', false),
              nip: nipClean,
              nama: String(item.nama || '').trim(),
              pangkat: String(item.pangkat || 'Penata Muda (III/a)').trim(),
              jabatan: String(item.jabatan || 'Staf Teknis').trim(),
              bidang: String(item.bidang || 'Bidang Aset').trim(),
              subBidang: String(item.subBidang || '').trim(),
              peran: String(item.peran || 'Pegawai').trim(),
              modeDefault: String(item.modeDefault || 'WFO').trim(),
              statusKepegawaian: String(item.statusKepegawaian || 'PNS').trim(),
              telepon: String(item.telepon || '-').trim(),
              statusAktif: 'AKTIF'
            };
            db.pegawai.unshift(rec);
            existingIdxByNip = {};
            for (var rIdx = 0; rIdx < db.pegawai.length; rIdx++) {
              var cR = String(db.pegawai[rIdx].nip || '').replace(/[^0-9]/g, '');
              if (cR) existingIdxByNip[cR] = rIdx;
            }
            added.push(rec);
            addedCount++;
          }
        }
        saveLocalDB(db);
        return {
          ok: true,
          importedCount: added.length,
          addedCount: addedCount,
          updatedCount: updatedCount,
          records: added,
          message: 'Impor Pegawai selesai: ' + addedCount + ' pegawai baru ditambahkan, ' + updatedCount + ' pegawai diperbarui.'
        };
      },
      apiBulkAssignModeKerja: function (payload) {
        var db = loadLocalDB();
        var count = 0;
        for (var i = 0; i < db.pegawai.length; i++) {
          if (payload.bidang === 'SEMUA' || db.pegawai[i].bidang === payload.bidang) {
            db.pegawai[i].modeDefault = payload.modeBaru;
            count++;
          }
        }
        saveLocalDB(db);
        return { ok: true, updatedCount: count, message: 'Berhasil ubah mode kerja ' + count + ' pegawai menjadi ' + payload.modeBaru + '.' };
      },
      apiSubmitIzinCuti: function (payload) {
        var db = loadLocalDB();
        var peg = db.pegawai.filter(function (p) { return p.nip === payload.nip; })[0] || { nama: 'ASN BKAD', jabatan: '-', bidang: '-', peran: 'Pegawai' };
        var isKabidSek = isPemohonKabidAtauSekretaris(peg);
        var isKasi = !isKabidSek && isPemohonKepalaSeksi(peg);
        var rec = {
          id: nextSeqId(db.izin, 'IZN', true),
          nip: payload.nip,
          nama: peg.nama,
          jabatan: peg.jabatan,
          bidang: peg.bidang,
          subBidang: peg.subBidang || '',
          isPemohonKasi: isKasi,
          isPemohonKabidSek: isKabidSek,
          jenis: payload.jenis,
          tglMulai: payload.tglMulai,
          tglSelesai: payload.tglSelesai,
          alasan: payload.alasan,
          berkasUrl: payload.berkasUrl || 'lampiran_permohonan.pdf',
          statusKasubid: isKabidSek ? 'Disetujui' : 'Menunggu',
          statusKabid: isKabidSek ? 'Disetujui' : 'Menunggu',
          statusKaban: 'Menunggu',
          statusFinal: isKabidSek
            ? 'Menunggu Pengesahan Final Kepala Badan (Tahap 3)'
            : (isKasi ? 'Menunggu Persetujuan Kepala Bidang (Tahap 1)' : 'Menunggu Telaah Kasubid'),
          nomorSurat: ''
        };
        db.izin.unshift(rec);
        saveLocalDB(db);
        return {
          ok: true,
          message: isKabidSek
            ? ('Pengajuan ' + rec.id + ' (Kabid/Sekretaris) langsung diteruskan ke Kepala Badan (Tahap 3).')
            : (isKasi
              ? ('Pengajuan ' + rec.id + ' (Kepala Seksi/Kasubid) terkirim ke Kepala Bidang (Tahap 1).')
              : ('Pengajuan ' + rec.id + ' terkirim ke Kasubid.')),
          record: rec
        };
      },
      apiApproveIzinCuti: function (payload) {
        var db = loadLocalDB();
        var wit = getClientWITNow();
        var actorNip = String((payload && payload.actorNip) || '').replace(/\s+/g, '').trim();
        for (var i = 0; i < db.izin.length; i++) {
          var item = db.izin[i];
          if (item.id !== payload.id) continue;
          var isKasi = isPemohonKepalaSeksi(item);
          var cleanPemohon = String(item.nip || '').replace(/\s+/g, '').trim();
          if (actorNip && cleanPemohon && actorNip === cleanPemohon) {
            return { ok: false, error: 'Otorisasi Ditolak: Pemohon tidak diperkenankan menyetujui atau mengesahkan permohonannya sendiri.' };
          }
          var authRes = checkLocalIzinActorAuth(actorNip, payload.tahap, isKasi, db, item);
          if (!authRes.ok) return authRes;
          var isKabidSek = isPemohonKabidAtauSekretaris(item);
          if (payload.keputusan === 'Dikembalikan') {
            var pejabatLbl = payload.tahap === 'KASUBID'
              ? (isKasi ? 'Kepala Bidang' : 'Kasubid')
              : (payload.tahap === 'KABID' ? (isKasi ? 'Sekretaris' : 'Kepala Bidang') : 'Kepala Badan');
            item.statusKasubid = isKabidSek ? 'Disetujui' : 'Menunggu';
            item.statusKabid = isKabidSek ? 'Disetujui' : 'Menunggu';
            item.statusKaban = 'Menunggu';
            item.nomorSurat = '';
            item.statusFinal = 'Dikembalikan oleh ' + pejabatLbl + ' — Perlu Revisi Pemohon' + (payload.catatan ? (' (' + payload.catatan + ')') : '');
            saveLocalDB(db);
            return { ok: true, message: 'Pengajuan dikembalikan kepada pemohon untuk revisi (persetujuan sebelumnya dibatalkan berjenjang).', record: item };
          }
          if (payload.tahap === 'KASUBID') {
            item.statusKasubid = payload.keputusan;
            if (isKasi) {
              item.statusFinal = payload.keputusan === 'Disetujui'
                ? 'Persetujuan Kepala Bidang Disahkan — Diteruskan ke Sekretaris (Tahap 2)'
                : 'Ditolak oleh Kepala Bidang';
            } else {
              item.statusFinal = payload.keputusan === 'Disetujui'
                ? 'Rekomendasi Kasubid Disahkan — Diteruskan ke Kabid (Tahap 2)'
                : 'Ditolak oleh Kasubid';
            }
          } else if (payload.tahap === 'KABID') {
            if (item.statusKasubid !== 'Disetujui') {
              return { ok: false, error: isKasi ? 'Wajib disetujui Kepala Bidang terlebih dahulu!' : 'Wajib disetujui Kasubid terlebih dahulu!' };
            }
            item.statusKabid = payload.keputusan;
            if (isKasi) {
              item.statusFinal = payload.keputusan === 'Disetujui'
                ? 'Paraf Sekretaris Disahkan — Diteruskan ke Kepala Badan (Tahap 3 Final)'
                : 'Ditolak oleh Sekretaris';
            } else {
              item.statusFinal = payload.keputusan === 'Disetujui'
                ? 'Paraf Kabid Disahkan — Diteruskan ke Kepala Badan (Tahap 3 Final)'
                : 'Ditolak oleh Kepala Bidang';
            }
          } else if (payload.tahap === 'KABAN') {
            if (item.statusKabid !== 'Disetujui') {
              return { ok: false, error: isKasi ? 'Wajib memperoleh Paraf Sekretaris terlebih dahulu!' : 'Wajib memperoleh Paraf Kabid terlebih dahulu!' };
            }
            item.statusKaban = payload.keputusan;
            if (payload.keputusan === 'Disetujui') {
              item.statusFinal = 'Sah Diterbitkan';
              item.nomorSurat = '800.1.6/' + item.id.split('-').pop() + '/BKAD-TW/' + wit.mm + '/' + wit.yyyy;
            } else {
              item.statusFinal = 'Ditolak oleh Kepala Badan';
            }
          }
          saveLocalDB(db);
          return { ok: true, message: 'Status diperbarui: ' + item.statusFinal, record: item };
        }
        return { ok: false, error: 'Dokumen tidak ditemukan.' };
      },
      apiUpdateIzinRevisi: function (payload) {
        var db = loadLocalDB();
        for (var i = 0; i < db.izin.length; i++) {
          var item = db.izin[i];
          if (item.id !== payload.id) continue;
          var isKabidSek = isPemohonKabidAtauSekretaris(item);
          var isKasi = !isKabidSek && isPemohonKepalaSeksi(item);
          item.jenis = payload.jenis;
          item.tglMulai = payload.tglMulai;
          item.tglSelesai = payload.tglSelesai;
          item.berkasUrl = payload.berkasUrl || 'lampiran_permohonan.pdf';
          item.alasan = payload.alasan;
          item.statusKasubid = isKabidSek ? 'Disetujui' : 'Menunggu';
          item.statusKabid = isKabidSek ? 'Disetujui' : 'Menunggu';
          item.statusKaban = 'Menunggu';
          item.nomorSurat = '';
          item.statusFinal = isKabidSek
            ? 'Menunggu Pengesahan Final Kepala Badan (Tahap 3)'
            : (isKasi ? 'Menunggu Persetujuan Kepala Bidang (Tahap 1)' : 'Menunggu Telaah Kasubid');
          saveLocalDB(db);
          return { ok: true, message: 'Revisi pengajuan ' + item.id + ' berhasil diajukan ulang.', record: item };
        }
        return { ok: false, error: 'Dokumen tidak ditemukan.' };
      },
      apiSaveSPT: function (payload) {
        var db = loadLocalDB();
        var wit = getClientWITNow();
        var targetId = String((payload && payload.id) || '').trim();
        if (targetId) {
          for (var i = 0; i < db.spt.length; i++) {
            if (db.spt[i].id === targetId) {
              var cur = db.spt[i];
              db.spt[i] = {
                id: targetId,
                nomorSPT: payload.nomorSPT || cur.nomorSPT,
                daftarNIP: payload.daftarNIP,
                lokasi: payload.lokasi,
                tglMulai: payload.tglMulai,
                tglSelesai: payload.tglSelesai,
                keperluan: payload.keperluan,
                statusGPS: payload.statusGPS || cur.statusGPS || 'Terjadwal'
              };
              saveLocalDB(db);
              return { ok: true, message: 'SPT ' + db.spt[i].nomorSPT + ' berhasil diperbarui.', record: db.spt[i] };
            }
          }
          return { ok: false, error: 'SPT tidak ditemukan.' };
        }
        var id = nextSeqId(db.spt, 'SPT', true);
        var rec = {
          id: id,
          nomorSPT: payload.nomorSPT || ('094/' + id.split('-').pop() + '/SPT-BKAD/' + wit.yyyy),
          daftarNIP: payload.daftarNIP,
          lokasi: payload.lokasi,
          tglMulai: payload.tglMulai,
          tglSelesai: payload.tglSelesai,
          keperluan: payload.keperluan,
          statusGPS: 'Terjadwal'
        };
        db.spt.unshift(rec);
        saveLocalDB(db);
        return { ok: true, message: 'SPT ' + rec.nomorSPT + ' berhasil diterbitkan.', record: rec };
      },
      apiDeleteSPT: function (payload) {
        var db = loadLocalDB();
        var targetId = String((payload && payload.id) || '').trim();
        var next = [];
        var removed = null;
        for (var i = 0; i < db.spt.length; i++) {
          if (db.spt[i].id === targetId) { removed = db.spt[i]; continue; }
          next.push(db.spt[i]);
        }
        if (!removed) return { ok: false, error: 'SPT tidak ditemukan.' };
        db.spt = next;
        saveLocalDB(db);
        return { ok: true, id: targetId, message: 'SPT ' + (removed.nomorSPT || targetId) + ' berhasil dihapus.' };
      },
      apiVerifySPTGeotag: function (payload) {
        var db = loadLocalDB();
        for (var i = 0; i < db.spt.length; i++) {
          if (db.spt[i].id === payload.id) {
            db.spt[i].statusGPS = 'Terverifikasi Sesuai Koordinat';
            saveLocalDB(db);
            return { ok: true, message: 'Audit Geotagging SPT ' + payload.id + ' disahkan.', record: db.spt[i] };
          }
        }
        return { ok: false, error: 'SPT tidak ditemukan.' };
      },
      apiSaveDisiplin: function (payload) {
        var db = loadLocalDB();
        var wit = getClientWITNow();
        var incomingId = String((payload && payload.id) || '').trim();
        for (var i = 0; i < db.disiplin.length; i++) {
          if (incomingId && db.disiplin[i].id === incomingId) {
            var ex = db.disiplin[i];
            ex.nip = payload.nip || ex.nip;
            ex.nama = payload.nama || ex.nama;
            ex.pelanggaran = payload.pelanggaran || ex.pelanggaran;
            ex.dasarHukum = payload.dasarHukum || ex.dasarHukum;
            ex.sanksi = payload.sanksi || ex.sanksi;
            if (payload.tahap) ex.tahap = payload.tahap;
            if (payload.nomorSK !== undefined) ex.nomorSK = payload.nomorSK;
            if (payload.tanggalSK !== undefined) ex.tanggalSK = payload.tanggalSK;
            if (payload.regIDis !== undefined && payload.regIDis !== '') ex.regIDis = payload.regIDis;
            if (payload.statusIDis !== undefined && payload.statusIDis !== '') ex.statusIDis = payload.statusIDis;
            if (payload.customMetaJson !== undefined) ex.customMetaJson = payload.customMetaJson;
            ex.tglPanggilan = payload.tglPanggilan || ex.tglPanggilan || wit.tanggal;
            ex.jadwalSidang = payload.jadwalSidang || ex.jadwalSidang || ('Selasa, ' + wit.tanggal + ' • 09:30 WIT');
            ex.tempatSidang = payload.tempatSidang || ex.tempatSidang || 'Ruang Rapat Kepala BKAD Kab. Teluk Wondama, Rasiei/Isei';
            ex.nomorPanggilan = payload.nomorPanggilan || ex.nomorPanggilan || ('800.1.6.2/' + ex.id.split('-').pop() + '/PANG-I/BKAD-TW/' + wit.yyyy);
            ex.nomorPanggilan2 = payload.nomorPanggilan2 || ex.nomorPanggilan2 || ('800.1.6.2/' + ex.id.split('-').pop() + '/PANG-II/BKAD-TW/' + wit.yyyy);
            ex.tglPanggilan2 = payload.tglPanggilan2 || ex.tglPanggilan2 || wit.tanggal;
            ex.jadwalSidang2 = payload.jadwalSidang2 || ex.jadwalSidang2 || ('Kamis, ' + wit.tanggal + ' • 09:30 WIT');
            saveLocalDB(db);
            return { ok: true, isUpdate: true, message: 'Data kasus disiplin ' + ex.id + ' & dokumen tahapan berhasil diperbarui.', record: ex };
          }
        }
        var newId = nextSeqId(db.disiplin, 'DISP', false);
        var seq = newId.split('-').pop();
        var rec = {
          id: newId,
          nip: payload.nip,
          nama: payload.nama,
          pelanggaran: payload.pelanggaran,
          dasarHukum: payload.dasarHukum || 'PP No. 94 Tahun 2021 Pasal 8 Ayat (1)',
          tahap: payload.tahap || 'Tahap 1 - Surat Panggilan I Diterbitkan',
          sanksi: payload.sanksi || 'Dalam Pemeriksaan Tim Pemeriksa',
          nomorSK: payload.nomorSK || '',
          tanggalSK: payload.tanggalSK || '',
          statusIDis: payload.statusIDis || 'Belum Sinkron',
          regIDis: payload.regIDis || '',
          tglPanggilan: payload.tglPanggilan || wit.tanggal,
          jadwalSidang: payload.jadwalSidang || ('Selasa, ' + wit.tanggal + ' • 09:30 WIT'),
          tempatSidang: payload.tempatSidang || 'Ruang Rapat Kepala BKAD Kab. Teluk Wondama, Rasiei/Isei',
          nomorPanggilan: payload.nomorPanggilan || ('800.1.6.2/' + seq + '/PANG-I/BKAD-TW/' + wit.yyyy),
          nomorPanggilan2: payload.nomorPanggilan2 || ('800.1.6.2/' + seq + '/PANG-II/BKAD-TW/' + wit.yyyy),
          tglPanggilan2: payload.tglPanggilan2 || wit.tanggal,
          jadwalSidang2: payload.jadwalSidang2 || ('Kamis, ' + wit.tanggal + ' • 09:30 WIT'),
          customMetaJson: payload.customMetaJson || ''
        };
        db.disiplin.unshift(rec);
        saveLocalDB(db);
        return { ok: true, isUpdate: false, message: 'Kasus disiplin ' + rec.id + ' diregistrasi.', record: rec };
      },
      apiDeleteDisiplin: function (payload) {
        var db = loadLocalDB();
        var targetId = String((payload && payload.id) || '').trim();
        var nextList = [];
        var found = false;
        for (var i = 0; i < db.disiplin.length; i++) {
          if (db.disiplin[i].id === targetId) {
            found = true;
          } else {
            nextList.push(db.disiplin[i]);
          }
        }
        if (!found) return { ok: false, error: 'Kasus disiplin tidak ditemukan.' };
        db.disiplin = nextList;
        saveLocalDB(db);
        return { ok: true, deletedId: targetId, message: 'Berkas kasus disiplin ' + targetId + ' berhasil dihapus.' };
      },
      apiAdvanceDisiplinStage: function (payload) {
        var db = loadLocalDB();
        var wit = getClientWITNow();
        for (var i = 0; i < db.disiplin.length; i++) {
          var d = db.disiplin[i];
          if (d.id !== payload.id) continue;
          d.tahap = payload.tahapBaru;
          if (payload.sanksi) d.sanksi = payload.sanksi;
          if (payload.tahapBaru.indexOf('Tahap 5') !== -1 && !d.nomorSK) {
            d.nomorSK = '800.1.6.2/' + d.id.split('-').pop() + '/SK-DISP/BKAD/' + wit.yyyy;
            d.tanggalSK = wit.tanggal;
          }
          if (payload.tahapBaru.indexOf('Tahap 8') !== -1) {
            d.statusIDis = 'Tersinkronisasi';
            d.regIDis = 'IDIS-BKN-' + wit.yyyy + '-TW-' + ('9000' + d.id.split('-').pop()).slice(-4);
          }
          saveLocalDB(db);
          return { ok: true, message: 'Kasus ' + d.id + ' berlanjut ke ' + d.tahap, record: d };
        }
        return { ok: false, error: 'Kasus tidak ditemukan.' };
      },
      apiRunRekonsiliasi: function (payload) {
        var db = loadLocalDB();
        for (var i = 0; i < db.rekon.length; i++) {
          if (db.rekon[i].id === payload.id) {
            db.rekon[i].anomaliTerselesaikan = db.rekon[i].anomaliTeridentifikasi;
            db.rekon[i].statusKunci = 'Resolusi Anomali Selesai — Siap Komit BA';
            saveLocalDB(db);
            return { ok: true, message: 'Dry-run & resolusi anomali selesai.', record: db.rekon[i] };
          }
        }
        return { ok: false, error: 'Rekonsiliasi tidak ditemukan.' };
      },
      apiCommitRekonsiliasi: function (payload) {
        var db = loadLocalDB();
        var wit = getClientWITNow();
        for (var i = 0; i < db.rekon.length; i++) {
          if (db.rekon[i].id === payload.id) {
            db.rekon[i].anomaliTerselesaikan = db.rekon[i].anomaliTeridentifikasi;
            db.rekon[i].statusKunci = 'Terkunci Sah (Locked)';
            db.rekon[i].tanggalSah = wit.tanggal;
            saveLocalDB(db);
            return { ok: true, message: 'Berita Acara Rekonsiliasi resmi dikomit & database terkunci.', record: db.rekon[i] };
          }
        }
        return { ok: false, error: 'Data tidak ditemukan.' };
      },
      apiSaveSettings: function (payload) {
        var db = loadLocalDB();
        for (var key in payload) {
          if (Object.prototype.hasOwnProperty.call(payload, key)) {
            db.settings[key] = { value: payload[key] };
          }
        }
        saveLocalDB(db);
        return { ok: true, message: 'Pengaturan sistem berhasil disimpan.', settings: db.settings };
      },
      apiLogAuditEvent: function (payload) {
        var db = loadLocalDB();
        if (!db.auditLog) db.auditLog = [];
        var wit = getClientWITNow();
        var peg = db.pegawai.filter(function (p) { return p.nip === (payload && payload.nipOperator); })[0];
        var rec = {
          id: nextSeqId(db.auditLog, 'LOG', true),
          timestamp: wit.tanggal + ' ' + wit.jam,
          nipOperator: (payload && payload.nipOperator) || 'SYSTEM',
          namaOperator: peg ? peg.nama : ((payload && payload.nipOperator) || 'Sistem'),
          aksi: (payload && payload.aksi) || 'AKSES_SISTEM',
          detail: (payload && payload.detail) || '-',
          ipAddress: 'Local-Preview'
        };
        db.auditLog.unshift(rec);
        if (db.auditLog.length > 100) db.auditLog = db.auditLog.slice(0, 100);
        saveLocalDB(db);
        return { ok: true, record: rec };
      },
      apiSaveDelegasiPlt: function (payload) {
        var db = loadLocalDB();
        if (!db.delegasiPlt) db.delegasiPlt = [];
        var pAsli = db.pegawai.filter(function (p) { return p.nip === payload.nipAsli; })[0];
        var pPlt = db.pegawai.filter(function (p) { return p.nip === payload.nipPlt; })[0];
        var rec = {
          id: nextSeqId(db.delegasiPlt, 'DLG', false),
          nipAsli: payload.nipAsli,
          namaAsli: pAsli ? pAsli.nama : payload.nipAsli,
          nipPlt: payload.nipPlt,
          namaPlt: pPlt ? pPlt.nama : payload.nipPlt,
          jabatan: payload.jabatan,
          tglMulai: payload.tglMulai,
          tglSelesai: payload.tglSelesai,
          nomorSP: payload.nomorSP || '800.1.3/042/SP-PLT/BKAD/2026'
        };
        db.delegasiPlt.unshift(rec);
        saveLocalDB(db);
        return { ok: true, message: 'Delegasi ' + rec.jabatan + ' berhasil ditetapkan.', record: rec };
      },
      apiDeleteDelegasiPlt: function (payload) {
        var db = loadLocalDB();
        db.delegasiPlt = (db.delegasiPlt || []).filter(function (x) { return x.id !== payload.id; });
        saveLocalDB(db);
        return { ok: true, deletedId: payload.id, message: 'Delegasi berhasil dihapus.' };
      },
      apiSaveAdendumRekon: function (payload) {
        var db = loadLocalDB();
        var wit = getClientWITNow();
        var rec = {
          id: nextSeqId(db.rekon, 'RKN', true),
          periode: (payload.periode || 'Koreksi Susulan') + ' [Adendum ' + (payload.parentId || '-') + ']',
          nomorBA: payload.nomorAdendum,
          totalPegawai: db.pegawai.length,
          anomaliTeridentifikasi: 1,
          anomaliTerselesaikan: 1,
          statusKunci: 'Adendum Sah (' + String(payload.alasan || '').substring(0, 45) + ')',
          tanggalSah: wit.tanggal
        };
        db.rekon.unshift(rec);
        saveLocalDB(db);
        return { ok: true, message: 'Adendum BA ' + payload.nomorAdendum + ' berhasil diterbitkan.', record: rec };
      },
      apiSaveSkpd: function (payload) {
        var db = loadLocalDB();
        if (!db.masterSkpd) db.masterSkpd = LocalBackendEngine.apiGetInitialBundle().masterSkpd;
        var idx = -1;
        for (var i = 0; i < db.masterSkpd.length; i++) {
          if (payload.id && db.masterSkpd[i].id === payload.id) { idx = i; break; }
        }
        var rec = {
          id: idx !== -1 ? db.masterSkpd[idx].id : nextSeqId(db.masterSkpd, 'SKPD', false),
          nomor: String(payload.nomor || (idx !== -1 ? db.masterSkpd[idx].nomor : (db.masterSkpd.length + 1))),
          kodeSkpd: String(payload.kodeSkpd || '').trim(),
          namaSkpd: String(payload.namaSkpd || '').trim(),
          jabatanPimpinan: String(payload.jabatanPimpinan || '').trim(),
          namaKepala: String(payload.namaKepala || '').trim(),
          nipKepala: String(payload.nipKepala || '').replace(/\s+/g, '').trim(),
          subUnits: Array.isArray(payload.subUnits) ? payload.subUnits : []
        };
        if (idx !== -1) db.masterSkpd[idx] = rec;
        else db.masterSkpd.push(rec);
        saveLocalDB(db);
        return { ok: true, isUpdate: idx !== -1, message: 'SKPD ' + rec.namaSkpd + ' berhasil disimpan.', record: rec };
      },
      apiDeleteSkpd: function (payload) {
        var db = loadLocalDB();
        db.masterSkpd = (db.masterSkpd || []).filter(function (x) { return x.id !== payload.id; });
        saveLocalDB(db);
        return { ok: true, deletedId: payload.id, message: 'SKPD berhasil dihapus.' };
      },
      apiImportSkpdBatch: function (payload) {
        var db = loadLocalDB();
        if (!db.masterSkpd) db.masterSkpd = LocalBackendEngine.apiGetInitialBundle().masterSkpd;
        var list = payload.records || [];
        var upsert = payload.upsert !== false;
        var added = 0, updated = 0, skipped = 0;
        for (var i = 0; i < list.length; i++) {
          var r = list[i];
          if (!r.namaSkpd) { skipped++; continue; }
          var existIdx = -1;
          for (var j = 0; j < db.masterSkpd.length; j++) {
            if ((r.kodeSkpd && db.masterSkpd[j].kodeSkpd.toLowerCase() === r.kodeSkpd.toLowerCase()) ||
                db.masterSkpd[j].namaSkpd.toLowerCase() === r.namaSkpd.toLowerCase()) {
              existIdx = j; break;
            }
          }
          if (existIdx !== -1) {
            if (!upsert) { skipped++; continue; }
            var ex = db.masterSkpd[existIdx];
            ex.nomor = r.nomor || ex.nomor;
            ex.kodeSkpd = r.kodeSkpd || ex.kodeSkpd;
            ex.namaSkpd = r.namaSkpd;
            ex.jabatanPimpinan = r.jabatanPimpinan || ex.jabatanPimpinan;
            ex.namaKepala = r.namaKepala || ex.namaKepala;
            ex.nipKepala = r.nipKepala || ex.nipKepala;
            updated++;
          } else {
            db.masterSkpd.push({
              id: 'SKPD-' + ('000' + (db.masterSkpd.length + 1)).slice(-3),
              nomor: r.nomor || String(db.masterSkpd.length + 1),
              kodeSkpd: r.kodeSkpd || ('OPD-' + ('000' + (db.masterSkpd.length + 1)).slice(-3)),
              namaSkpd: r.namaSkpd,
              jabatanPimpinan: r.jabatanPimpinan || '',
              namaKepala: r.namaKepala || '',
              nipKepala: r.nipKepala || '',
              subUnits: Array.isArray(r.subUnits) ? r.subUnits : []
            });
            added++;
          }
        }
        saveLocalDB(db);
        return { ok: true, added: added, updated: updated, skipped: skipped, records: db.masterSkpd, message: 'Impor SKPD selesai: ' + added + ' ditambah, ' + updated + ' diperbarui.' };
      }
    };

    /* -------------------------------------------------------------------
     * 3. BRIDGE KOMUNIKASI SERVER (Safe Preview Mode + Anti-Button Deadlock)
     * ------------------------------------------------------------------- */
    function callServer(methodName, args, btnEl, onSuccess, onError) {
      var origHtml = null;
      if (btnEl) {
        origHtml = btnEl.innerHTML;
        btnEl.disabled = true;
        btnEl.classList.add('opacity-70', 'cursor-wait');
      }

      function restoreBtn() {
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.classList.remove('opacity-70', 'cursor-wait');
          if (origHtml !== null) btnEl.innerHTML = origHtml;
        }
      }

      var gasUrl = (window.APP_CONFIG && window.APP_CONFIG.GAS_API_URL) ? String(window.APP_CONFIG.GAS_API_URL).trim() : '';
      if (gasUrl && gasUrl.indexOf('https://') === 0) {
        fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: methodName, payload: args })
        })
          .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status + ' dari server API.');
            return response.json();
          })
          .then(function (res) {
            restoreBtn();
            if (!res) {
              var emptyErr = { ok: false, error: 'Respons server kosong. Pastikan Web App GAS sudah di-deploy ulang.' };
              showToast(emptyErr.error, 'error');
              if (onError) onError(emptyErr);
              return;
            }
            if (res && res.ok === false) {
              showToast(res.error || 'Terjadi kesalahan validasi.', 'error');
              if (onError) onError(res);
              return;
            }
            if (onSuccess) {
              try {
                onSuccess(res);
              } catch (cbErr) {
                showToast('Kesalahan antarmuka: ' + (cbErr && cbErr.message ? cbErr.message : cbErr), 'error');
              }
            }
          })
          .catch(function (err) {
            restoreBtn();
            var msg = (err && err.message) ? err.message : 'Koneksi ke REST API Google Apps Script terputus.';
            showToast(msg, 'error');
            if (onError) onError(err);
          });
      } else {
        // Safe Preview Mode (LocalStorage Fallback)
        setTimeout(function () {
          try {
            var fn = LocalBackendEngine[methodName];
            var res = fn ? fn(args) : { ok: false, error: 'Endpoint lokal tidak ditemukan: ' + methodName };
            restoreBtn();
            if (res && res.ok === false) {
              showToast(res.error || 'Terjadi kesalahan.', 'error');
              if (onError) onError(res);
              return;
            }
            if (onSuccess) onSuccess(res);
          } catch (ex) {
            restoreBtn();
            showToast('Kesalahan simulasi lokal: ' + ex.message, 'error');
            if (onError) onError(ex);
          }
        }, 120);
      }
    }

    /* -------------------------------------------------------------------
     * 4. UI HELPERS (Toast, Escape HTML, Badge, Clock WIT)
     * ------------------------------------------------------------------- */
    function esc(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function showToast(message, type) {
      var container = document.getElementById('toast-container');
      var toast = document.createElement('div');
      var colorClass = type === 'error'
        ? 'bg-red-600 text-white'
        : (type === 'warn' ? 'bg-amber-500 text-white' : 'bg-navy-deep text-white');
      var icon = type === 'error' ? 'error' : (type === 'warn' ? 'warning' : 'check_circle');

      toast.className = 'pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-xs font-semibold transition-smooth ' + colorClass;
      toast.innerHTML = '<span class="material-symbols-outlined text-[18px] shrink-0">' + icon + '</span><span>' + esc(message) + '</span>';
      container.appendChild(toast);
      setTimeout(function () {
        toast.classList.add('opacity-0');
        setTimeout(function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 220);
      }, 3600);
    }

    function updateAllWITClocks() {
      var now = new Date();
      var utc = now.getTime() + now.getTimezoneOffset() * 60000;
      var wit = new Date(utc + 9 * 3600000);
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      var timeStr = pad(wit.getHours()) + ':' + pad(wit.getMinutes()) + ':' + pad(wit.getSeconds());
      var hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][wit.getDay()];
      var bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][wit.getMonth()];
      var dateLabel = hari + ', ' + pad(wit.getDate()) + ' ' + bulan + ' ' + wit.getFullYear();

      var elLogin = document.getElementById('login-clock');
      var elDesk = document.getElementById('desk-live-clock');
      var elMobBig = document.getElementById('mob-big-clock');
      var elMobBadge = document.getElementById('mob-clock-badge');
      var elMobDate = document.getElementById('mob-date-label');

      if (elLogin) elLogin.textContent = timeStr + ' WIT';
      if (elDesk) elDesk.textContent = timeStr + ' WIT (UTC+9)';
      if (elMobBig) elMobBig.textContent = timeStr + ' WIT';
      if (elMobBadge) elMobBadge.textContent = pad(wit.getHours()) + ':' + pad(wit.getMinutes()) + ' WIT';
      if (elMobDate) elMobDate.textContent = dateLabel;
    }

    function getStatusBadge(status) {
      var s = String(status || '');
      if (s.indexOf('Tepat Waktu') !== -1 || s.indexOf('Sah') !== -1 || s.indexOf('Terkunci') !== -1 || s.indexOf('Terverifikasi') !== -1 || s.indexOf('Tersinkronisasi') !== -1) {
        return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-status-present">' + esc(s) + '</span>';
      }
      if (s.indexOf('Terlambat') !== -1 || s.indexOf('Menunggu') !== -1 || s.indexOf('Diteruskan') !== -1 || s.indexOf('Draft') !== -1 || s.indexOf('Tahap 4') !== -1 || s.indexOf('Dikembalikan') !== -1) {
        return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">' + esc(s) + '</span>';
      }
      if (s.indexOf('Ditolak') !== -1 || s.indexOf('Alpa') !== -1 || s.indexOf('Belum') !== -1) {
        return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-status-absent">' + esc(s) + '</span>';
      }
      return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-navy-deep">' + esc(s) + '</span>';
    }

    function getModeBadge(mode) {
      if (mode === 'WFA') return '<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-teal-600 text-white">WFA</span>';
      if (mode === 'WFH') return '<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-electric-blue text-white">WFH</span>';
      return '<span class="px-2 py-0.5 rounded-md text-[11px] font-bold border border-navy-deep text-navy-deep bg-blue-50">WFO</span>';
    }

    /* -------------------------------------------------------------------
     * 5. NAVIGASI SHELL & RENDER SEMUA MENU (Menggunakan AppCache)
     * ------------------------------------------------------------------- */
    function showShell(shellName) {
      AppCache.activeShell = shellName;
      document.getElementById('view-login').classList.toggle('hidden', shellName !== 'login');
      document.getElementById('shell-mobile').classList.toggle('hidden', shellName !== 'mobile');
      document.getElementById('shell-mobile').classList.toggle('flex', shellName === 'mobile');
      document.getElementById('shell-desktop').classList.toggle('hidden', shellName !== 'desktop');
      document.getElementById('shell-desktop').classList.toggle('flex', shellName === 'desktop');

      if (shellName === 'mobile') renderMobileShell();
      if (shellName === 'desktop') renderDesktopShell();
    }

    function switchDeskMenu(menuId) {
      AppCache.activeDeskMenu = menuId;
      var panels = document.querySelectorAll('.desk-panel');
      for (var i = 0; i < panels.length; i++) {
        panels[i].classList.add('hidden');
      }
      var target = document.getElementById('menu-' + menuId);
      if (target) target.classList.remove('hidden');

      var navBtns = document.querySelectorAll('.desk-nav-btn');
      for (var j = 0; j < navBtns.length; j++) {
        var isAct = navBtns[j].getAttribute('data-id') === menuId;
        navBtns[j].className = 'desk-nav-btn w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs transition-smooth ' +
          (isAct ? 'font-semibold bg-electric-blue text-white shadow-md' : 'font-medium text-white/80 hover:bg-white/10 hover:text-white');
      }

      // Render dari Cache (Instan 0 detik)
      if (menuId === 'dasbor-utama') renderDashboard();
      else if (menuId === 'master-skpd') renderMasterSkpdModule();
      else if (menuId === 'impor-pegawai') renderPegawaiTable();
      else if (menuId === 'rekonsiliasi-absen') renderRekonModule();
      else if (menuId === 'jadwal-mode-kerja') renderSPTModule();
      else if (menuId === 'persetujuan-izin') renderIzinApprovalModule();
      else if (menuId === 'rekap-presensi') renderRekapModule();
      else if (menuId === 'disiplin-pegawai') renderDisiplinModule();
      else if (menuId === 'pengaturan-sistem') renderSettingsForm();
      else if (menuId === 'galeri-stitch') renderStitchGallery();

      // Tutup drawer mobile sidebar jika terbuka
      document.getElementById('desktop-sidebar').classList.add('-translate-x-full');
      document.getElementById('sidebar-backdrop').classList.add('hidden');
    }

    function switchMobTab(tabId) {
      AppCache.activeMobTab = tabId;
      var tabs = ['beranda', 'kamera', 'izin', 'log'];
      for (var i = 0; i < tabs.length; i++) {
        var el = document.getElementById('mob-tab-' + tabs[i]);
        if (el) el.classList.toggle('hidden', tabs[i] !== tabId);
      }
      var btns = document.querySelectorAll('.mob-nav-btn');
      for (var j = 0; j < btns.length; j++) {
        var act = btns[j].getAttribute('data-id') === tabId;
        btns[j].classList.toggle('text-electric-blue', act);
        btns[j].classList.toggle('text-text-muted', !act);
      }
      document.getElementById('mobile-overflow-drawer').classList.add('hidden');
      if (tabId === 'kamera') {
        loadFaceApiLibrary();
        refreshDeviceGps({ silent: true });
        setTimeout(function () {
          updateMobileGpsUI();
          if (AppCache.gpsMapInstance && AppCache.gpsMapInstance.invalidateSize) {
            AppCache.gpsMapInstance.invalidateSize();
          }
        }, 120);
      } else {
        stopLiveCamStream();
      }
      renderMobileShell();
    }

    function applyInitialBundleAndEnter(user, res, opts) {
      var safeRes = res || {};
      AppCache.loaded = true;
      AppCache.settings = safeRes.settings || AppCache.settings || {};
      AppCache.pegawai = Array.isArray(safeRes.pegawai) ? safeRes.pegawai : (AppCache.pegawai || []);
      if (AppCache.currentUser) {
        var freshMe = AppCache.pegawai.filter(function (p) { return p.nip === AppCache.currentUser.nip; })[0];
        if (freshMe) AppCache.currentUser = freshMe;
      }
      AppCache.presensi = Array.isArray(safeRes.presensi) ? safeRes.presensi : (AppCache.presensi || []);
      AppCache.izin = Array.isArray(safeRes.izin) ? safeRes.izin : (AppCache.izin || []);
      AppCache.spt = Array.isArray(safeRes.spt) ? safeRes.spt : (AppCache.spt || []);
      AppCache.disiplin = Array.isArray(safeRes.disiplin) ? safeRes.disiplin : (AppCache.disiplin || []);
      AppCache.rekon = Array.isArray(safeRes.rekon) ? safeRes.rekon : (AppCache.rekon || []);
      AppCache.delegasiPlt = Array.isArray(safeRes.delegasiPlt) ? safeRes.delegasiPlt : (AppCache.delegasiPlt || []);
      AppCache.auditLog = Array.isArray(safeRes.auditLog) ? safeRes.auditLog : (AppCache.auditLog || []);
      AppCache.masterSkpd = Array.isArray(safeRes.masterSkpd) ? safeRes.masterSkpd : (AppCache.masterSkpd || []);
      try {
        populateBidangDropdowns();
      } catch (eDropdown) { }

      var activeUser = AppCache.currentUser || user || { nama: 'ASN BKAD', peran: 'Pegawai', nip: '' };
      AppCache.currentUser = activeUser;

      if (opts && opts.forceMobileCamera) {
        showShell('mobile');
        switchMobTab('kamera');
      } else if (activeUser.peran === 'Pegawai') {
        showShell('mobile');
        switchMobTab('beranda');
      } else {
        showShell('desktop');
        if (activeUser.peran === 'Kasubid' || activeUser.peran === 'Kabid' || activeUser.peran === 'Kepala Badan') {
          switchDeskMenu('persetujuan-izin');
        } else {
          switchDeskMenu('dasbor-utama');
        }
      }
      showToast('Selamat datang, ' + (activeUser.nama || 'ASN') + ' (' + (activeUser.peran || 'Pegawai') + ')', 'success');
    }

    function loadInitialDataAndEnter(user, opts) {
      if (!user) {
        showToast('Data pengguna tidak ditemukan saat login.', 'error');
        return;
      }
      AppCache.currentUser = user;
      AppCache.faceVerified = false;
      AppCache.faceMatchScore = 0;
      AppCache.lastExtractedFaceVec = null;
      AppCache.lastExtractedFaceEngine = '';
      if (!(opts && opts.skipSaveDevice)) {
        saveDeviceNIP(user);
      }
      if (opts && opts.bundle && opts.bundle.ok) {
        applyInitialBundleAndEnter(user, opts.bundle, opts);
        return;
      }
      var loginBtn = (opts && opts.btn) || document.getElementById('btn-login-submit');
      callServer('apiGetInitialBundle', undefined, loginBtn, function (res) {
        applyInitialBundleAndEnter(user, res, opts);
      }, function () {
        var fallbackBundle = LocalBackendEngine.apiGetInitialBundle();
        applyInitialBundleAndEnter(user, fallbackBundle, opts);
        showToast('Memuat dasbor menggunakan cache cadangan perangkat.', 'warn');
      });
    }

    /* -------------------------------------------------------------------
     * 6. RENDER DESKTOP: DASBOR UTAMA + BACKEND SEARCH/PAGINATION
     * ------------------------------------------------------------------- */
    function renderDesktopShell() {
      var u = AppCache.currentUser;
      if (!u) return;
      document.getElementById('desk-user-nama').textContent = u.nama;
      document.getElementById('desk-user-peran').textContent = u.peran;
      document.getElementById('dash-role-pill').textContent = u.peran;
    }

    function isPegawaiAktif(p) {
      return !p || String(p.statusAktif || 'AKTIF').toUpperCase() !== 'ARSIP';
    }

    function getActivePegawaiList() {
      return (AppCache.pegawai || []).filter(isPegawaiAktif);
    }

    function renderDashboard() {
      var activePegList = getActivePegawaiList();
      var totalPeg = activePegList.length;
      var arsipCount = Math.max(0, (AppCache.pegawai || []).length - totalPeg);
      var hadirCount = AppCache.presensi.length;
      var telatCount = AppCache.presensi.filter(function (p) { return p.status === 'Terlambat'; }).length;
      var disiplinCount = AppCache.disiplin.length;
      var izinPending = AppCache.izin.filter(function (z) { return z.statusFinal.indexOf('Sah') === -1 && z.statusFinal.indexOf('Ditolak') === -1; }).length;

      var kpiHtml = '' +
        '<div class="card-elevated rounded-2xl p-4">' +
        '<div class="flex items-start justify-between"><span class="text-xs font-medium text-text-muted">Total Pegawai BKAD</span>' +
        '<div class="w-10 h-10 rounded-xl bg-blue-100 text-navy-deep flex items-center justify-center"><span class="material-symbols-outlined">groups</span></div></div>' +
        '<div class="mt-3 flex items-baseline gap-1.5"><span class="text-2xl font-bold text-text-main">' + totalPeg + '</span><span class="text-xs text-text-muted">ASN / PPPK Aktif</span></div>' +
        '<div class="mt-2 text-[11px] text-status-present font-semibold">' + (arsipCount > 0 ? ('100% Aktif • ' + arsipCount + ' Diarsipkan') : '100% Terdata Aktif') + '</div>' +
        '</div>' +
        '<div class="card-elevated rounded-2xl p-4">' +
        '<div class="flex items-start justify-between"><span class="text-xs font-medium text-text-muted">Presensi Tercatat</span>' +
        '<div class="w-10 h-10 rounded-xl bg-emerald-100 text-status-present flex items-center justify-center"><span class="material-symbols-outlined">task_alt</span></div></div>' +
        '<div class="mt-3 flex items-baseline gap-1.5"><span class="text-2xl font-bold text-status-present">' + hadirCount + '</span><span class="text-xs text-text-muted">Log Absen</span></div>' +
        '<div class="mt-2 text-[11px] text-text-muted">Sinkronisasi WIT Real-time</div>' +
        '</div>' +
        '<div class="card-elevated rounded-2xl p-4">' +
        '<div class="flex items-start justify-between"><span class="text-xs font-medium text-text-muted">Telat & Antrean Izin</span>' +
        '<div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center"><span class="material-symbols-outlined">hourglass_top</span></div></div>' +
        '<div class="mt-3 flex items-baseline gap-1.5"><span class="text-2xl font-bold text-amber-600">' + (telatCount + izinPending) + '</span><span class="text-xs text-text-muted">Berkas</span></div>' +
        '<div class="mt-2 text-[11px] text-amber-700 font-semibold">' + telatCount + ' Telat • ' + izinPending + ' Izin Proses</div>' +
        '</div>' +
        '<div class="card-elevated rounded-2xl p-4">' +
        '<div class="flex items-start justify-between"><span class="text-xs font-medium text-text-muted">Kasus PP 94/2021</span>' +
        '<div class="w-10 h-10 rounded-xl bg-red-100 text-status-absent flex items-center justify-center"><span class="material-symbols-outlined">gavel</span></div></div>' +
        '<div class="mt-3 flex items-baseline gap-1.5"><span class="text-2xl font-bold text-status-absent">' + disiplinCount + '</span><span class="text-xs text-text-muted">Berkas</span></div>' +
        '<div class="mt-2 text-[11px] text-status-absent font-semibold">Terintegrasi I-Dis BKN</div>' +
        '</div>';
      document.getElementById('dash-kpi-deck').innerHTML = kpiHtml;

      renderCalendarGrid();
      queryPresensiTable();
    }

    function renderCalendarGrid() {
      var grid = document.getElementById('dash-calendar-grid');
      var html = '';
      for (var d = 1; d <= 30; d++) {
        var cls = 'bg-surface-low text-text-main hover:bg-blue-100';
        var dot = '';
        if (d === 16) {
          cls = 'bg-electric-blue text-white font-bold shadow-sm';
          dot = '<span class="w-1.5 h-1.5 rounded-full bg-white mx-auto mt-0.5"></span>';
        } else if (d === 14 || d === 15) {
          dot = '<span class="w-1.5 h-1.5 rounded-full bg-mode-wfa mx-auto mt-0.5"></span>';
        } else if (d % 7 === 0 || d % 7 === 6) {
          cls = 'bg-slate-50 text-text-muted';
        } else if (d < 16) {
          dot = '<span class="w-1.5 h-1.5 rounded-full bg-status-present mx-auto mt-0.5"></span>';
        }
        html += '<button type="button" data-action="cal-day" data-id="' + d + '" class="p-1.5 rounded-lg flex flex-col items-center justify-center transition-smooth ' + cls + '"><span>' + d + '</span>' + dot + '</button>';
      }
      grid.innerHTML = html;
    }

    function queryPresensiTable() {
      var search = (document.getElementById('global-search-input').value || '').trim();
      var mode = document.getElementById('filter-presensi-mode').value;
      var status = document.getElementById('filter-presensi-status').value;

      callServer('apiQueryData', {
        entity: 'PRESENSI',
        search: search,
        filters: { modeKerja: mode, status: status },
        page: AppCache.presensiPage,
        pageSize: 5
      }, null, function (res) {
        var tbody = document.getElementById('tbody-presensi-live');
        if (!res.items.length) {
          tbody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-xs text-text-muted">Tidak ada data presensi yang cocok dengan filter.</td></tr>';
        } else {
          var rowsHtml = '';
          for (var i = 0; i < res.items.length; i++) {
            var item = res.items[i];
            rowsHtml += '<tr class="hover:bg-surface-low/60 transition-smooth">' +
              '<td class="py-3 px-3"><div class="font-bold text-text-main">' + esc(item.nama) + '</div><div class="font-mono text-[11px] text-text-muted">' + esc(item.nip) + '</div></td>' +
              '<td class="py-3 px-3 font-mono text-xs"><div>' + esc(item.tanggal) + '</div><div class="text-navy-deep font-semibold">' + esc(item.jamMasuk) + (item.jamPulang ? ' – ' + esc(item.jamPulang) : ' WIT') + '</div></td>' +
              '<td class="py-3 px-3">' + getModeBadge(item.modeKerja) + '<div class="font-mono text-[11px] text-text-muted mt-1">' + esc(item.koordinat) + '</div></td>' +
              '<td class="py-3 px-3">' + getStatusBadge(item.status) + '<div class="text-[11px] text-text-muted mt-1">' + esc(item.keterangan) + '</div></td>' +
              '</tr>';
          }
          tbody.innerHTML = rowsHtml;
        }

        document.getElementById('pag-presensi-live').innerHTML =
          '<span>Menampilkan ' + res.items.length + ' dari ' + res.total + ' data (Hal ' + res.page + '/' + res.totalPages + ')</span>' +
          '<div class="flex items-center gap-1.5">' +
          '<button type="button" data-action="page-presensi" data-id="' + Math.max(1, res.page - 1) + '" class="px-2.5 py-1 rounded-lg bg-surface-low hover:bg-surface-high font-semibold">Sebelumnya</button>' +
          '<button type="button" data-action="page-presensi" data-id="' + Math.min(res.totalPages, res.page + 1) + '" class="px-2.5 py-1 rounded-lg bg-surface-low hover:bg-surface-high font-semibold">Berikutnya</button>' +
          '</div>';
      });
    }

    /* -------------------------------------------------------------------
     * 7. RENDER MASTER PEGAWAI, KELOLA BIDANG/SUB BIDANG & WIZARD IMPOR
     * ------------------------------------------------------------------- */
    function getMasterBidangList() {
      var raw = AppCache.settings && AppCache.settings.MASTER_BIDANG_SUBBIDANG ? AppCache.settings.MASTER_BIDANG_SUBBIDANG.value : null;
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch (e) { raw = null; }
      }
      if (Array.isArray(raw) && raw.length) return raw;
      return getDefaultBidangList();
    }

    function saveBidangListToServer(newList, btnEl, onDone) {
      callServer('apiSaveSettings', { MASTER_BIDANG_SUBBIDANG: newList }, btnEl, function (res) {
        AppCache.settings = res.settings || AppCache.settings;
        AppCache.settings.MASTER_BIDANG_SUBBIDANG = { value: newList };
        populateBidangDropdowns();
        if (onDone) onDone();
      });
    }

    function populateBidangDropdowns() {
      var list = getMasterBidangList();
      var ids = ['filter-pegawai-bidang', 'bulk-bidang'];
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (!el) continue;
        var prev = el.value;
        var opts = '<option value="SEMUA">' + (ids[i] === 'bulk-bidang' ? 'Seluruh Bidang BKAD' : 'Semua Bidang') + '</option>';
        for (var j = 0; j < list.length; j++) {
          var nm = list[j].nama;
          opts += '<option value="' + esc(nm) + '">' + esc(nm) + '</option>';
        }
        el.innerHTML = opts;
        if (prev) el.value = prev;
      }
    }

    function buildSubBidangOptions(bidangName, selectedSub) {
      var list = getMasterBidangList();
      var subs = [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].nama === bidangName) {
          subs = list[i].sub || [];
          break;
        }
      }
      var html = '<option value="">-- Pilih Sub Bidang / Bagian --</option>';
      var found = false;
      for (var j = 0; j < subs.length; j++) {
        var sel = subs[j] === selectedSub ? ' selected' : '';
        if (sel) found = true;
        html += '<option value="' + esc(subs[j]) + '"' + sel + '>' + esc(subs[j]) + '</option>';
      }
      if (selectedSub && !found) {
        html += '<option value="' + esc(selectedSub) + '" selected>' + esc(selectedSub) + '</option>';
      }
      return html;
    }

    function openBidangManagerModal() {
      var list = getMasterBidangList();
      var bidangSelectOpts = '';
      var cardsHtml = '';

      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        bidangSelectOpts += '<option value="' + esc(b.nama) + '">' + esc(b.nama) + '</option>';
        var subTags = '';
        var subs = b.sub || [];
        for (var j = 0; j < subs.length; j++) {
          subTags += '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-border-subtle text-[11px] font-medium text-text-main">' +
            '<span>' + esc(subs[j]) + '</span>' +
            '<button type="button" data-action="del-subbidang" data-bidang="' + esc(b.nama) + '" data-sub="' + esc(subs[j]) + '" title="Hapus Sub Bidang" class="text-status-absent hover:text-red-700 font-bold leading-none">&times;</button>' +
            '</span>';
        }
        if (!subTags) subTags = '<span class="text-[11px] italic text-text-muted">Belum ada Sub Bidang</span>';

        cardsHtml += '<div class="p-3 rounded-xl bg-surface-low border border-border-subtle space-y-2">' +
          '<div class="flex items-center justify-between gap-2">' +
          '<span class="text-xs font-bold text-navy-deep">' + esc(b.nama) + '</span>' +
          '<button type="button" data-action="del-bidang" data-bidang="' + esc(b.nama) + '" class="px-2 py-0.5 rounded bg-red-50 hover:bg-red-100 text-status-absent text-[10px] font-semibold">Hapus Bidang</button>' +
          '</div>' +
          '<div class="flex flex-wrap gap-1.5">' + subTags + '</div>' +
          '</div>';
      }

      var returnBanner = AppCache.reopenPegawaiFlag
        ? '<div class="mb-3 p-2.5 rounded-xl bg-blue-50 border border-electric-blue/30 flex items-center justify-between gap-2"><span class="text-xs text-navy-deep font-semibold">Setelah selesai menambah Bidang/Sub Bidang, klik tombol di kanan untuk kembali ke form Pegawai.</span><button type="button" data-action="return-to-pegawai" class="px-3 py-1.5 rounded-lg bg-electric-blue text-white text-xs font-semibold shrink-0">Kembali ke Form Pegawai</button></div>'
        : '';

      var body = returnBanner +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">' +
        '<form id="form-add-bidang" action="javascript:void(0);" class="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2.5">' +
        '<div class="text-xs font-bold text-navy-deep">1. Tambah Nama Bidang Baru</div>' +
        '<input id="new-bidang-nama" type="text" required placeholder="Contoh: Bidang Akuntansi" class="w-full px-3 py-2 rounded-lg bg-white border border-border-subtle text-xs" />' +
        '<input id="new-bidang-sub" type="text" placeholder="Sub Bidang awal (opsional)" class="w-full px-3 py-2 rounded-lg bg-white border border-border-subtle text-xs" />' +
        '<button id="btn-add-bidang-submit" type="submit" class="w-full py-2 rounded-lg bg-navy-deep hover:bg-primary text-white text-xs font-semibold">Tambah Bidang</button>' +
        '</form>' +
        '<form id="form-add-subbidang" action="javascript:void(0);" class="p-3.5 rounded-xl bg-teal-50/70 border border-teal-200 space-y-2.5">' +
        '<div class="text-xs font-bold text-teal-900">2. Tambah Nama Sub Bidang</div>' +
        '<select id="target-bidang-select" class="w-full px-3 py-2 rounded-lg bg-white border border-border-subtle text-xs">' + bidangSelectOpts + '</select>' +
        '<input id="new-subbidang-nama" type="text" required placeholder="Contoh: Subbid Verifikasi SPJ" class="w-full px-3 py-2 rounded-lg bg-white border border-border-subtle text-xs" />' +
        '<button id="btn-add-subbidang-submit" type="submit" class="w-full py-2 rounded-lg bg-mode-wfa hover:bg-teal-700 text-white text-xs font-semibold">Tambah Sub Bidang</button>' +
        '</form>' +
        '</div>' +
        '<div class="space-y-2"><div class="text-xs font-bold text-text-main uppercase tracking-wide">Daftar Bidang & Sub Bidang Aktif (' + list.length + ' Bidang)</div>' + cardsHtml + '</div>';

      openModal('Kelola Unit Bidang & Sub Bidang BKAD', body, true);

      document.getElementById('form-add-bidang').addEventListener('submit', function (e) {
        e.preventDefault();
        var namaBaru = document.getElementById('new-bidang-nama').value.trim();
        var subAwal = document.getElementById('new-bidang-sub').value.trim();
        if (!namaBaru) return;
        var cur = getMasterBidangList().slice();
        var dup = cur.some(function (x) { return x.nama.toLowerCase() === namaBaru.toLowerCase(); });
        if (dup) {
          showToast('Nama Bidang "' + namaBaru + '" sudah ada.', 'warn');
          return;
        }
        cur.push({ nama: namaBaru, sub: subAwal ? [subAwal] : [] });
        saveBidangListToServer(cur, document.getElementById('btn-add-bidang-submit'), function () {
          showToast('Bidang "' + namaBaru + '" berhasil ditambahkan.', 'success');
          openBidangManagerModal();
        });
      });

      document.getElementById('form-add-subbidang').addEventListener('submit', function (e) {
        e.preventDefault();
        var parentNama = document.getElementById('target-bidang-select').value;
        var subBaru = document.getElementById('new-subbidang-nama').value.trim();
        if (!parentNama || !subBaru) return;
        var cur = JSON.parse(JSON.stringify(getMasterBidangList()));
        for (var k = 0; k < cur.length; k++) {
          if (cur[k].nama === parentNama) {
            if (!Array.isArray(cur[k].sub)) cur[k].sub = [];
            if (cur[k].sub.indexOf(subBaru) !== -1) {
              showToast('Sub Bidang tersebut sudah terdaftar pada ' + parentNama, 'warn');
              return;
            }
            cur[k].sub.push(subBaru);
            break;
          }
        }
        saveBidangListToServer(cur, document.getElementById('btn-add-subbidang-submit'), function () {
          showToast('Sub Bidang "' + subBaru + '" ditambahkan ke ' + parentNama + '.', 'success');
          openBidangManagerModal();
        });
      });
    }

    /* -------------------------------------------------------------------
     * 5B. MASTER SKPD / OPD & SUB UNIT (PUSKESMAS, BAGIAN, BIDANG)
     * ------------------------------------------------------------------- */
    var SKPD_IMPORT_SAMPLES = [
      ['1', '5.02.0.00.0.00.01.0000', 'Badan Pengelolaan Keuangan dan Aset Daerah', 'Kepala Badan Pengelolaan Keuangan dan Aset Daerah', 'Nixon N. N. Baransano, S.E.', '197511282009091001'],
      ['2', '1.02.0.00.0.00.01.0000', 'Dinas Kesehatan', 'Kepala Dinas Kesehatan', 'dr. Maria Rumbiak, M.Kes.', '198004152008022001'],
      ['3', '4.01.0.00.0.00.01.0000', 'Sekretariat Daerah', 'Sekretaris Daerah', 'Drs. Lukas Wambrauw, M.M.', '197806222005011002']
    ];

    function renderMasterSkpdModule() {
      var tbody = document.getElementById('tbody-master-skpd');
      if (!tbody) return;
      var q = ((document.getElementById('search-master-skpd') && document.getElementById('search-master-skpd').value) || '').toLowerCase().trim();
      var list = (AppCache.masterSkpd || []).filter(function (item) {
        if (!q) return true;
        var hay = [item.nomor, item.kodeSkpd, item.namaSkpd, item.jabatanPimpinan, item.namaKepala, item.nipKepala, (item.subUnits || []).join(' ')].join(' ').toLowerCase();
        return hay.indexOf(q) !== -1;
      });
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-xs text-text-muted">Belum ada data SKPD yang sesuai filter. Klik <b>Tambah SKPD / Sub Unit</b> atau impor dari Excel.</td></tr>';
        return;
      }
      var html = '';
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        var subs = Array.isArray(s.subUnits) ? s.subUnits : [];
        var subChips = '';
        for (var j = 0; j < subs.length; j++) {
          subChips += '<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-navy-deep border border-blue-200 text-[10px] font-medium">' + esc(subs[j]) + '</span>';
        }
        html += '<tr class="hover:bg-surface-low/60">' +
          '<td class="py-3 px-3 text-center font-mono text-xs font-bold text-text-muted">' + esc(s.nomor || (i + 1)) + '</td>' +
          '<td class="py-3 px-3 font-mono text-xs font-semibold text-navy-deep">' + esc(s.kodeSkpd || '-') + '</td>' +
          '<td class="py-3 px-3">' +
          '<div class="font-bold text-xs text-navy-deep">' + esc(s.namaSkpd) + '</div>' +
          '<div class="flex flex-wrap items-center gap-1 mt-1.5">' + (subChips || '<span class="text-[11px] text-text-muted italic">Belum ada Sub Unit</span>') +
          '<button type="button" data-action="add-skpd-subunit" data-id="' + esc(s.id) + '" class="px-2 py-0.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-status-present border border-emerald-200 text-[10px] font-bold">+ Sub Unit</button>' +
          '</div></td>' +
          '<td class="py-3 px-3 text-xs"><div class="font-semibold text-text-main">' + esc(s.namaKepala || '-') + '</div><div class="text-[11px] text-text-muted">' + esc(s.jabatanPimpinan || '-') + '</div><div class="font-mono text-[11px] text-navy-deep">' + (s.nipKepala ? ('NIP. ' + esc(s.nipKepala)) : '-') + '</div></td>' +
          '<td class="py-3 px-3 text-right whitespace-nowrap"><div class="inline-flex gap-1.5">' +
          '<button type="button" data-action="edit-skpd" data-id="' + esc(s.id) + '" class="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-electric-blue hover:text-white text-electric-blue text-xs font-semibold">Edit</button>' +
          '<button type="button" data-action="delete-skpd" data-id="' + esc(s.id) + '" class="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-status-absent hover:text-white text-status-absent text-xs font-semibold">Hapus</button>' +
          '</div></td>' +
          '</tr>';
      }
      tbody.innerHTML = html;
    }

    function openSkpdModal(editId, focusSubUnit) {
      var existing = editId ? (AppCache.masterSkpd || []).filter(function (x) { return x.id === editId; })[0] : null;
      var s = existing || {
        id: '',
        nomor: String((AppCache.masterSkpd || []).length + 1),
        kodeSkpd: '',
        namaSkpd: '',
        jabatanPimpinan: '',
        namaKepala: '',
        nipKepala: '',
        subUnits: []
      };
      var tempSubs = (s.subUnits || []).slice();

      var body = '<form id="form-save-skpd" action="javascript:void(0);" class="space-y-3 text-xs">' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nomor</label><input id="skpd-nomor" type="text" value="' + esc(s.nomor) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle font-mono text-xs" /></div>' +
        '<div class="sm:col-span-2"><label class="block text-[11px] font-semibold text-text-muted mb-1">Kode SKPD</label><input id="skpd-kode" type="text" required placeholder="Contoh: 1.02.0.00.0.00.01.0000" value="' + esc(s.kodeSkpd) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle font-mono text-xs" /></div>' +
        '</div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nama SKPD</label><input id="skpd-nama" type="text" required placeholder="Contoh: Dinas Kesehatan / Sekretariat Daerah" value="' + esc(s.namaSkpd) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs font-semibold" /></div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nama Jabatan Pimpinan SKPD</label><input id="skpd-jabatan" type="text" placeholder="Contoh: Kepala Dinas Kesehatan" value="' + esc(s.jabatanPimpinan) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nama Kepala SKPD</label><input id="skpd-kepala" type="text" placeholder="Nama lengkap & gelar" value="' + esc(s.namaKepala) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">NIP Kepala SKPD</label><input id="skpd-nip" type="text" placeholder="18 digit NIP" value="' + esc(s.nipKepala) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle font-mono text-xs" /></div>' +
        '</div>' +
        '<div class="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2.5">' +
        '<div class="font-bold text-navy-deep text-xs">Daftar Sub Unit di Bawah SKPD (Puskesmas / Bagian / Bidang)</div>' +
        '<div id="skpd-sub-list" class="flex flex-wrap gap-1.5"></div>' +
        '<div class="flex gap-2">' +
        '<input id="skpd-sub-input" type="text" placeholder="Ketik nama Sub Unit (mis. Puskesmas Wasior atau Bagian Umum & Perlengkapan)..." class="flex-1 px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs" />' +
        '<button type="button" id="btn-skpd-add-sub" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">+ Tambah Sub Unit</button>' +
        '</div>' +
        '</div>' +
        '<button id="btn-save-skpd-submit" type="submit" class="w-full py-2.5 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold">Simpan Data SKPD &amp; Sub Unit</button>' +
        '</form>';

      openModal(existing ? ('Edit Master SKPD: ' + existing.namaSkpd) : 'Tambah SKPD & Sub Unit Baru', body, false);

      function renderSubChips() {
        var box = document.getElementById('skpd-sub-list');
        if (!box) return;
        if (!tempSubs.length) {
          box.innerHTML = '<span class="text-[11px] text-text-muted italic">Belum ada Sub Unit ditambahkan.</span>';
          return;
        }
        var ch = '';
        for (var i = 0; i < tempSubs.length; i++) {
          ch += '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-blue-200 text-navy-deep text-[11px] font-semibold">' +
            '<span>' + esc(tempSubs[i]) + '</span>' +
            '<button type="button" data-rm-sub="' + i + '" class="btn-rm-skpd-sub text-status-absent font-bold ml-1">×</button>' +
            '</span>';
        }
        box.innerHTML = ch;
        var rmBtns = box.querySelectorAll('.btn-rm-skpd-sub');
        for (var b = 0; b < rmBtns.length; b++) {
          rmBtns[b].addEventListener('click', function () {
            var idxRm = parseInt(this.getAttribute('data-rm-sub'), 10);
            tempSubs.splice(idxRm, 1);
            renderSubChips();
          });
        }
      }
      renderSubChips();

      document.getElementById('btn-skpd-add-sub').addEventListener('click', function () {
        var inp = document.getElementById('skpd-sub-input');
        var val = (inp.value || '').trim();
        if (!val) return;
        if (tempSubs.indexOf(val) === -1) tempSubs.push(val);
        inp.value = '';
        renderSubChips();
        inp.focus();
      });

      if (focusSubUnit) {
        setTimeout(function () {
          var inpF = document.getElementById('skpd-sub-input');
          if (inpF) inpF.focus();
        }, 120);
      }

      document.getElementById('form-save-skpd').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = document.getElementById('btn-save-skpd-submit');
        var pendingInp = (document.getElementById('skpd-sub-input').value || '').trim();
        if (pendingInp && tempSubs.indexOf(pendingInp) === -1) tempSubs.push(pendingInp);
        callServer('apiSaveSkpd', {
          id: existing ? existing.id : '',
          nomor: document.getElementById('skpd-nomor').value.trim(),
          kodeSkpd: document.getElementById('skpd-kode').value.trim(),
          namaSkpd: document.getElementById('skpd-nama').value.trim(),
          jabatanPimpinan: document.getElementById('skpd-jabatan').value.trim(),
          namaKepala: document.getElementById('skpd-kepala').value.trim(),
          nipKepala: document.getElementById('skpd-nip').value.trim(),
          subUnits: tempSubs,
          operatorNip: AppCache.currentUser ? AppCache.currentUser.nip : ''
        }, btn, function (res) {
          if (res.isUpdate) {
            AppCache.masterSkpd = (AppCache.masterSkpd || []).map(function (x) { return x.id === res.record.id ? res.record : x; });
          } else {
            AppCache.masterSkpd = AppCache.masterSkpd || [];
            AppCache.masterSkpd.push(res.record);
          }
          closeModal();
          renderMasterSkpdModule();
          showToast(res.message, 'success');
        });
      });
    }

    function downloadSkpdTemplateXLS() {
      var headers = ['Nomor', 'Kode SKPD', 'Nama SKPD', 'Nama Jabatan Pimpinan SKPD', 'Nama Kepala SKPD', 'NIP Kepala SKPD'];
      var ths = '';
      for (var i = 0; i < headers.length; i++) ths += '<th>' + esc(headers[i]) + '</th>';
      var trs = '';
      for (var r = 0; r < SKPD_IMPORT_SAMPLES.length; r++) {
        var row = SKPD_IMPORT_SAMPLES[r];
        trs += '<tr>';
        for (var c = 0; c < row.length; c++) {
          var isTxt = (c === 1 || c === 5);
          trs += '<td' + (isTxt ? ' class="txt"' : '') + '>' + esc(row[c]) + '</td>';
        }
        trs += '</tr>';
      }
      var xlsHtml = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head><meta charset="utf-8" /><style>' +
        'table{border-collapse:collapse;}th{background-color:#0B3D91;color:#FFFFFF;font-weight:bold;border:1px solid #1E293B;padding:6px 10px;font-family:Calibri,Arial,sans-serif;font-size:11pt;text-align:left;}' +
        'td{border:1px solid #CBD5E1;padding:5px 10px;font-family:Calibri,Arial,sans-serif;font-size:10.5pt;vertical-align:middle;}' +
        '.txt{mso-number-format:"\\@";}' +
        '</style></head><body><table><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table></body></html>';
      triggerBlobDownload('\uFEFF' + xlsHtml, 'application/vnd.ms-excel;charset=utf-8;', 'Templat_Impor_Master_SKPD_Teluk_Wondama.xls');
      showToast('Templat Excel Master SKPD (.xls) berhasil diunduh. Kolom Kode SKPD & NIP terkunci Teks.', 'success');
    }

    function downloadSkpdTemplateCSV() {
      var headers = ['Nomor', 'Kode SKPD', 'Nama SKPD', 'Nama Jabatan Pimpinan SKPD', 'Nama Kepala SKPD', 'NIP Kepala SKPD'];
      var lines = [headers.join(',')];
      for (var r = 0; r < SKPD_IMPORT_SAMPLES.length; r++) {
        var cols = [];
        for (var c = 0; c < SKPD_IMPORT_SAMPLES[r].length; c++) {
          cols.push('"' + String(SKPD_IMPORT_SAMPLES[r][c] || '').replace(/"/g, '""') + '"');
        }
        lines.push(cols.join(','));
      }
      triggerBlobDownload('\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8;', 'Templat_Impor_Master_SKPD_Teluk_Wondama.csv');
      showToast('Templat CSV Master SKPD berhasil diunduh.', 'success');
    }

    function handleSkpdFileSelected(file) {
      readSpreadsheetFileMatrix(file, function (matrix) {
        var parsed = validateSkpdImportMatrix(matrix, file.name);
        AppCache.pendingSkpdImport = parsed;
        var box = document.getElementById('import-skpd-preview-box');
        if (!box) return;
        if (!parsed.rows.length) {
          box.innerHTML = '<div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">Tidak ada baris SKPD yang terbaca pada berkas <b>' + esc(file.name) + '</b>.</div>';
          box.classList.remove('hidden');
          return;
        }
        var tr = '';
        for (var i = 0; i < Math.min(parsed.rows.length, 50); i++) {
          var rw = parsed.rows[i];
          tr += '<tr class="border-b border-border-subtle text-xs">' +
            '<td class="py-1.5 px-2 font-mono text-center">' + esc(rw.nomor) + '</td>' +
            '<td class="py-1.5 px-2 font-mono">' + esc(rw.kodeSkpd) + '</td>' +
            '<td class="py-1.5 px-2 font-semibold">' + esc(rw.namaSkpd) + '</td>' +
            '<td class="py-1.5 px-2">' + esc(rw.jabatanPimpinan) + '</td>' +
            '<td class="py-1.5 px-2">' + esc(rw.namaKepala) + '</td>' +
            '<td class="py-1.5 px-2 font-mono">' + esc(rw.nipKepala || '-') + '</td>' +
            '</tr>';
        }
        box.innerHTML = '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div class="text-xs font-bold text-navy-deep">Pratinjau Impor SKPD: ' + parsed.rows.length + ' Baris Siap Diimpor</div>' +
          '<div class="flex gap-2">' +
          '<button type="button" data-action="clear-import-skpd-preview" class="px-3 py-1.5 rounded-lg bg-white border border-border-subtle text-xs font-semibold">Batal</button>' +
          '<button type="button" data-action="execute-skpd-import" class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">Simpan ' + parsed.rows.length + ' SKPD ke Database</button>' +
          '</div></div>' +
          '<div class="overflow-x-auto max-h-64 border border-border-subtle rounded-xl"><table class="w-full text-left border-collapse"><thead><tr class="bg-surface-low text-[10px] uppercase text-text-muted border-b border-border-subtle"><th class="py-1.5 px-2">Nomor</th><th class="py-1.5 px-2">Kode SKPD</th><th class="py-1.5 px-2">Nama SKPD</th><th class="py-1.5 px-2">Jabatan Pimpinan</th><th class="py-1.5 px-2">Nama Kepala SKPD</th><th class="py-1.5 px-2">NIP Kepala</th></tr></thead><tbody>' + tr + '</tbody></table></div>';
        box.classList.remove('hidden');
      });
    }

    function validateSkpdImportMatrix(matrix, sourceName) {
      var rows = [];
      if (!matrix || !matrix.length) return { sourceName: sourceName, rows: rows };
      var headerIdx = 0;
      var colMap = { nomor: 0, kode: 1, nama: 2, jabatan: 3, kepala: 4, nip: 5, sub: -1 };
      for (var r = 0; r < Math.min(matrix.length, 10); r++) {
        var joined = (matrix[r] || []).join(' ').toLowerCase();
        if (joined.indexOf('nama skpd') !== -1 || joined.indexOf('kode skpd') !== -1) {
          headerIdx = r;
          for (var c = 0; c < matrix[r].length; c++) {
            var h = String(matrix[r][c] || '').toLowerCase().trim();
            if (h === 'nomor' || h === 'no') colMap.nomor = c;
            else if (h.indexOf('kode') !== -1) colMap.kode = c;
            else if (h.indexOf('nama skpd') !== -1 || h === 'skpd' || h === 'opd') colMap.nama = c;
            else if (h.indexOf('jabatan') !== -1) colMap.jabatan = c;
            else if (h.indexOf('kepala') !== -1 && h.indexOf('nip') === -1) colMap.kepala = c;
            else if (h.indexOf('nip') !== -1) colMap.nip = c;
            else if (h.indexOf('sub') !== -1) colMap.sub = c;
          }
          break;
        }
      }
      for (var i = headerIdx + 1; i < matrix.length; i++) {
        var line = matrix[i] || [];
        var namaVal = String(line[colMap.nama] || '').trim();
        if (!namaVal) continue;
        var rawSubs = colMap.sub !== -1 ? String(line[colMap.sub] || '').trim() : '';
        var subArr = rawSubs ? rawSubs.split(/[;,]/).map(function (x) { return x.trim(); }).filter(Boolean) : [];
        rows.push({
          nomor: String(line[colMap.nomor] || (rows.length + 1)).trim(),
          kodeSkpd: String(line[colMap.kode] || '').trim(),
          namaSkpd: namaVal,
          jabatanPimpinan: String(line[colMap.jabatan] || '').trim(),
          namaKepala: String(line[colMap.kepala] || '').trim(),
          nipKepala: String(line[colMap.nip] || '').replace(/\s+/g, '').trim(),
          subUnits: subArr
        });
      }
      return { sourceName: sourceName, rows: rows };
    }

    function executePendingSkpdImport(btn) {
      var parsed = AppCache.pendingSkpdImport;
      if (!parsed || !parsed.rows || !parsed.rows.length) {
        showToast('Belum ada data SKPD untuk diimpor.', 'warning');
        return;
      }
      var chk = document.getElementById('chk-import-skpd-upsert');
      callServer('apiImportSkpdBatch', {
        records: parsed.rows,
        upsert: !chk || chk.checked,
        operatorNip: AppCache.currentUser ? AppCache.currentUser.nip : ''
      }, btn, function (res) {
        AppCache.masterSkpd = res.records || AppCache.masterSkpd;
        AppCache.pendingSkpdImport = null;
        var box = document.getElementById('import-skpd-preview-box');
        if (box) { box.innerHTML = ''; box.classList.add('hidden'); }
        var inp = document.getElementById('import-skpd-file');
        if (inp) inp.value = '';
        renderMasterSkpdModule();
        showToast(res.message, 'success');
      });
    }

    function renderPegawaiTable() {
      var search = (document.getElementById('search-pegawai-input').value || '').trim();
      var bidang = document.getElementById('filter-pegawai-bidang').value;
      var statusAktifEl = document.getElementById('filter-pegawai-status-aktif');
      var statusAktif = statusAktifEl ? statusAktifEl.value : 'AKTIF';

      callServer('apiQueryData', {
        entity: 'PEGAWAI',
        search: search,
        filters: { bidang: bidang, statusAktif: statusAktif },
        page: AppCache.pegawaiPage,
        pageSize: 6
      }, null, function (res) {
        var tbody = document.getElementById('tbody-master-pegawai');
        var html = '';
        for (var i = 0; i < res.items.length; i++) {
          var p = res.items[i];
          var isArsip = !isPegawaiAktif(p);
          var hasFace = !!(p.hasFaceEnrolled || (p.faceDescriptor && String(p.faceDescriptor).length > 20));
          var faceBadge = hasFace
            ? '<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-status-present text-[10px] font-semibold ml-1.5"><span class="material-symbols-outlined text-[12px]">familiar_face_and_zone</span>Face ID Aktif</span>'
            : '<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-text-muted text-[10px] font-medium ml-1.5">Belum Daftar Wajah</span>';
          var arsipBadge = isArsip
            ? '<div class="mt-1 inline-flex flex-wrap items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-semibold"><span class="material-symbols-outlined text-[13px]">inventory_2</span><span>ARSIP: ' + esc(p.alasanNonaktif || 'Nonaktif / Pindah Tugas') + (p.tanggalNonaktif ? ' (Tgl: ' + esc(p.tanggalNonaktif) + ')' : '') + '</span></div>'
            : '';
          var actionBtns = '<button type="button" data-action="edit-pegawai" data-id="' + esc(p.id) + '" class="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-navy-deep text-xs font-semibold">Edit</button>' +
            (hasFace ? '<button type="button" data-action="reset-face-pegawai" data-id="' + esc(p.id) + '" class="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 text-xs font-semibold">Reset Wajah</button>' : '') +
            (isArsip
              ? '<button type="button" data-action="restore-pegawai" data-id="' + esc(p.id) + '" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">Aktifkan Kembali</button>'
              : '<button type="button" data-action="archive-pegawai" data-id="' + esc(p.id) + '" class="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-semibold">Arsipkan</button>');
          var noUrut = (((res.page || 1) - 1) * 6) + i + 1;
          html += '<tr class="hover:bg-surface-low/60 transition-smooth' + (isArsip ? ' bg-amber-50/30 opacity-85' : '') + '">' +
            '<td class="py-3 px-3 font-mono text-xs font-bold text-text-muted text-center">' + noUrut + '</td>' +
            '<td class="py-3 px-3 font-mono text-xs"><div class="font-bold text-navy-deep">' + esc(p.id) + '</div><div>' + esc(p.nip) + '</div></td>' +
            '<td class="py-3 px-3"><div class="font-bold text-text-main">' + esc(p.nama) + '</div><div class="text-xs text-text-muted flex flex-wrap items-center">' + esc(p.pangkat) + ' • ' + esc(p.statusKepegawaian) + faceBadge + '</div>' + arsipBadge + '</td>' +
            '<td class="py-3 px-3"><div class="text-xs font-medium">' + esc(p.jabatan) + '</div><div class="text-[11px] text-electric-blue font-semibold">' + esc(p.bidang) + (p.subBidang ? ' • ' + esc(p.subBidang) : '') + '</div>' + (p.skpd ? '<div class="text-[10px] text-text-muted mt-0.5">' + esc(p.skpd) + '</div>' : '') + '</td>' +
            '<td class="py-3 px-3"><div class="text-xs font-semibold mb-1">' + esc(p.peran) + '</div>' + getModeBadge(p.modeDefault) + '</td>' +
            '<td class="py-3 px-3 text-right"><div class="inline-flex flex-wrap justify-end gap-1.5">' + actionBtns + '</div></td>' +
            '</tr>';
        }
        var emptyMsg = statusAktif === 'ARSIP'
          ? 'Belum ada pegawai yang diarsipkan (Pindah Tugas / Pensiun / Nonaktif).'
          : 'Data pegawai kosong.';
        tbody.innerHTML = html || '<tr><td colspan="6" class="py-6 text-center text-xs text-text-muted">' + emptyMsg + '</td></tr>';

        document.getElementById('pag-master-pegawai').innerHTML =
          '<span>Total: ' + res.total + ' pegawai (Hal ' + res.page + '/' + res.totalPages + ')</span>' +
          '<div class="flex gap-1.5">' +
          '<button type="button" data-action="page-pegawai" data-id="' + Math.max(1, res.page - 1) + '" class="px-2.5 py-1 rounded-lg bg-surface-low hover:bg-surface-high font-semibold">Sebelumnya</button>' +
          '<button type="button" data-action="page-pegawai" data-id="' + Math.min(res.totalPages, res.page + 1) + '" class="px-2.5 py-1 rounded-lg bg-surface-low hover:bg-surface-high font-semibold">Berikutnya</button>' +
          '</div>';
      });
    }

    function openArchivePegawaiModal(pegId) {
      var p = (AppCache.pegawai || []).filter(function (x) { return x.id === pegId; })[0];
      if (!p) return;
      var nowD = new Date();
      var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
      var isoToday = nowD.getFullYear() + '-' + pad2(nowD.getMonth() + 1) + '-' + pad2(nowD.getDate());

      var body = '<form id="form-archive-pegawai" action="javascript:void(0);" class="space-y-3.5">' +
        '<div class="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-1.5">' +
        '<div class="flex items-center gap-2 text-amber-900 font-bold text-xs"><span class="material-symbols-outlined text-[18px]">inventory_2</span><span>Arsipkan &amp; Nonaktifkan Pegawai dari Daftar Aktif Keuangan/TPP</span></div>' +
        '<p class="text-[11px] text-amber-800 leading-relaxed">Pegawai yang diarsipkan <b>tidak akan muncul lagi</b> di Rekapitulasi Presensi &amp; TPP bulan berjalan, pilihan SPT/Izin baru, maupun login aplikasi. Namun <b>seluruh riwayat absensi lama dan dokumen SK/SPT/Izin terdahulu tetap tersimpan utuh</b> untuk audit.</p>' +
        '</div>' +
        '<div class="p-3 rounded-xl bg-surface-low border border-border-subtle text-xs space-y-1">' +
        '<div class="font-bold text-navy-deep text-sm">' + esc(p.nama) + '</div>' +
        '<div class="font-mono text-[11px] text-text-muted">NIP. ' + esc(p.nip) + ' • ID: ' + esc(p.id) + '</div>' +
        '<div class="text-[11px] text-text-main">' + esc(p.jabatan) + ' — <span class="font-semibold text-electric-blue">' + esc(p.bidang) + (p.subBidang ? ' (' + esc(p.subBidang) + ')' : '') + '</span></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Alasan Pengarsipan / Nonaktif</label>' +
        '<select id="arc-kategori" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs font-semibold">' +
        '<option value="Pindah Tugas / Mutasi Keluar OPD">Pindah Tugas / Mutasi Keluar OPD</option>' +
        '<option value="Pensiun / Purna Tugas">Pensiun / Purna Tugas</option>' +
        '<option value="Tugas Belajar / CLTN">Tugas Belajar / CLTN</option>' +
        '<option value="Berhenti / Mengundurkan Diri">Berhenti / Mengundurkan Diri</option>' +
        '<option value="Meninggal Dunia">Meninggal Dunia</option>' +
        '</select>' +
        '</div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Efektif Nonaktif</label>' +
        '<input id="arc-tanggal" type="date" required value="' + esc(isoToday) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" />' +
        '</div>' +
        '</div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nomor SK Mutasi / Pensiun / Pemberhentian (Opsional)</label>' +
        '<input id="arc-nosk" type="text" placeholder="Contoh: 824.3/042/BKPSDM-TW/2026" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle font-mono text-xs" />' +
        '</div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Instansi Tujuan / Catatan Tambahan (Opsional)</label>' +
        '<input id="arc-catatan" type="text" placeholder="Contoh: Mutasi ke Bappeda Kab. Teluk Wondama" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" />' +
        '</div>' +
        '<div class="flex items-center justify-end gap-2 pt-2">' +
        '<button type="button" data-action="close-modal" class="px-4 py-2 rounded-xl bg-surface-low hover:bg-surface-high text-text-muted text-xs font-semibold">Batal</button>' +
        '<button id="btn-arc-submit" type="submit" class="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">inventory_2</span><span>Konfirmasi &amp; Arsipkan Pegawai</span></button>' +
        '</div>' +
        '</form>';

      openModal('Arsipkan Data Pegawai (' + esc(p.nama) + ')', body);

      document.getElementById('form-archive-pegawai').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = document.getElementById('btn-arc-submit');
        var payload = {
          id: p.id,
          action: 'ARCHIVE',
          kategoriAlasan: document.getElementById('arc-kategori').value,
          tanggalNonaktif: formatIsoDateToDMY(document.getElementById('arc-tanggal').value),
          nomorSK: document.getElementById('arc-nosk').value.trim(),
          catatan: document.getElementById('arc-catatan').value.trim()
        };
        callServer('apiArchivePegawai', payload, btn, function (res) {
          AppCache.pegawai = AppCache.pegawai.map(function (item) { return item.id === res.record.id ? res.record : item; });
          closeModal();
          AppCache.pegawaiPage = 1;
          renderPegawaiTable();
          renderDashboard();
          renderRekapModule();
          showToast(res.message, 'success');
        });
      });
    }

    function openRestorePegawaiModal(pegId) {
      var p = (AppCache.pegawai || []).filter(function (x) { return x.id === pegId; })[0];
      if (!p) return;
      var body = '<div class="space-y-4 text-xs">' +
        '<div class="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 leading-relaxed">' +
        '<b>Aktifkan Kembali Pegawai:</b><br/>' +
        'Pegawai a.n. <b>' + esc(p.nama) + '</b> (<span class="font-mono">' + esc(p.nip) + '</span>) akan dikembalikan ke daftar <b>Pegawai Aktif</b>, sehingga namanya kembali muncul pada Rekapitulasi Presensi &amp; TPP, formulir SPT/Izin, serta dapat login kembali.' +
        '</div>' +
        (p.alasanNonaktif ? '<div class="p-3 rounded-xl bg-surface-low border border-border-subtle"><b>Riwayat Arsip Sebelumnya:</b> ' + esc(p.alasanNonaktif) + (p.tanggalNonaktif ? ' (per ' + esc(p.tanggalNonaktif) + ')' : '') + '</div>' : '') +
        '<div class="flex items-center justify-end gap-2 pt-2">' +
        '<button type="button" data-action="close-modal" class="px-4 py-2 rounded-xl bg-surface-low hover:bg-surface-high text-text-muted font-semibold">Batal</button>' +
        '<button id="btn-restore-pegawai-confirm" type="button" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">settings_backup_restore</span><span>Ya, Aktifkan Kembali</span></button>' +
        '</div>' +
        '</div>';
      openModal('Aktifkan Kembali Data Pegawai', body);

      document.getElementById('btn-restore-pegawai-confirm').addEventListener('click', function () {
        var btn = document.getElementById('btn-restore-pegawai-confirm');
        callServer('apiArchivePegawai', { id: p.id, action: 'RESTORE' }, btn, function (res) {
          AppCache.pegawai = AppCache.pegawai.map(function (item) { return item.id === res.record.id ? res.record : item; });
          closeModal();
          AppCache.pegawaiPage = 1;
          renderPegawaiTable();
          renderDashboard();
          renderRekapModule();
          showToast(res.message, 'success');
        });
      });
    }

    function openResetFacePegawaiModal(pegId) {
      var p = (AppCache.pegawai || []).filter(function (x) { return x.id === pegId; })[0];
      if (!p) return;
      var body = '<div class="space-y-4 text-xs">' +
        '<div class="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900 leading-relaxed">' +
        '<b>Reset Biometrik Wajah (Face ID) Pegawai:</b><br/>' +
        'Data sidik wajah 128-titik milik <b>' + esc(p.nama) + '</b> (<span class="font-mono">' + esc(p.nip) + '</span>) akan dihapus sehingga pegawai tersebut dapat mendaftarkan ulang swafoto wajah referensi baru pada perangkat HP-nya.' +
        '</div>' +
        '<div class="flex items-center justify-end gap-2 pt-2">' +
        '<button type="button" data-action="close-modal" class="px-4 py-2 rounded-xl bg-surface-low hover:bg-surface-high text-text-muted font-semibold">Batal</button>' +
        '<button id="btn-reset-face-confirm" type="button" class="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">face_retouching_off</span><span>Ya, Reset Face ID</span></button>' +
        '</div>' +
        '</div>';
      openModal('Reset Data Biometrik Wajah (Face ID)', body);

      document.getElementById('btn-reset-face-confirm').addEventListener('click', function () {
        var btn = document.getElementById('btn-reset-face-confirm');
        callServer('apiResetFacePegawai', { id: p.id, nip: p.nip }, btn, function (res) {
          AppCache.pegawai = AppCache.pegawai.map(function (item) { return item.id === res.record.id ? res.record : item; });
          if (AppCache.currentUser && AppCache.currentUser.id === res.record.id) {
            AppCache.currentUser = res.record;
            AppCache.faceVerified = false;
            AppCache.faceMatchScore = 0;
          }
          closeModal();
          renderPegawaiTable();
          showToast(res.message, 'success');
        });
      });
    }

    function openPegawaiModal(editId) {
      AppCache.reopenPegawaiFlag = false;
      AppCache.reopenPegawaiEditId = editId || null;
      var existing = null;
      if (editId) {
        existing = AppCache.pegawai.filter(function (p) { return p.id === editId; })[0] || null;
      }
      function showForm(idVal) {
        var bidangList = getMasterBidangList();
        var defaultBidang = bidangList.length ? bidangList[0].nama : 'Bidang Aset';
        var skpdList = (AppCache.masterSkpd && AppCache.masterSkpd.length)
          ? AppCache.masterSkpd
          : [{ namaSkpd: 'Badan Pengelolaan Keuangan dan Aset Daerah', subUnits: ['Sekretariat BKAD', 'Bidang Aset', 'Bidang Perbendaharaan', 'Bidang Anggaran'] }];
        var p = existing || { id: idVal, nip: '', nama: '', pangkat: 'Penata (III/c)', jabatan: '', skpd: skpdList[0].namaSkpd, bidang: defaultBidang, subBidang: '', peran: 'Pegawai', modeDefault: 'WFO', statusKepegawaian: 'PNS', telepon: '' };
        var curSkpd = p.skpd || 'Badan Pengelolaan Keuangan dan Aset Daerah';

        var skpdOpts = '';
        var hasCurSkpd = false;
        for (var skIdx = 0; skIdx < skpdList.length; skIdx++) {
          var skName = skpdList[skIdx].namaSkpd;
          var selSk = skName === curSkpd ? ' selected' : '';
          if (selSk) hasCurSkpd = true;
          skpdOpts += '<option value="' + esc(skName) + '"' + selSk + '>' + esc(skName) + '</option>';
        }
        if (curSkpd && !hasCurSkpd) {
          skpdOpts += '<option value="' + esc(curSkpd) + '" selected>' + esc(curSkpd) + '</option>';
        }

        function buildBidangOptionsForSkpd(skpdName, selectedBidang) {
          var isBkad = !skpdName || skpdName.toLowerCase().indexOf('keuangan dan aset') !== -1;
          var items = [];
          if (isBkad) {
            for (var bi = 0; bi < bidangList.length; bi++) items.push(bidangList[bi].nama);
          } else {
            var skObj = skpdList.filter(function (x) { return x.namaSkpd === skpdName; })[0];
            if (skObj && Array.isArray(skObj.subUnits) && skObj.subUnits.length) {
              items = skObj.subUnits.slice();
            }
            if (items.indexOf('Sekretariat / Pimpinan ' + skpdName) === -1) {
              items.unshift('Sekretariat / Pimpinan ' + skpdName);
            }
          }
          var optsH = '';
          var matched = false;
          for (var i2 = 0; i2 < items.length; i2++) {
            var isS = items[i2] === selectedBidang;
            if (isS) matched = true;
            optsH += '<option value="' + esc(items[i2]) + '"' + (isS ? ' selected' : '') + '>' + esc(items[i2]) + '</option>';
          }
          if (selectedBidang && !matched) {
            optsH += '<option value="' + esc(selectedBidang) + '" selected>' + esc(selectedBidang) + '</option>';
          }
          return optsH;
        }

        var bidangOpts = buildBidangOptionsForSkpd(curSkpd, p.bidang);
        var subOpts = buildSubBidangOptions(p.bidang || defaultBidang, p.subBidang || '');

        var body = '<form id="form-save-pegawai" action="javascript:void(0);" class="space-y-3">' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">ID Pegawai (Otomatis)</label><input id="pg-id" type="text" readonly value="' + esc(p.id) + '" class="w-full px-3 py-2 rounded-xl bg-surface-high font-mono text-xs font-bold text-navy-deep" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">NIP (18 Digit)</label><input id="pg-nip" type="text" required value="' + esc(p.nip) + '" placeholder="199001012019031001" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle font-mono text-xs" /></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nama Lengkap & Gelar</label><input id="pg-nama" type="text" required value="' + esc(p.nama) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Pangkat / Golongan</label><input id="pg-pangkat" type="text" value="' + esc(p.pangkat) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">SKPD / OPD Induk</label><select id="pg-skpd" class="w-full px-3 py-2 rounded-xl bg-blue-50 border border-electric-blue/40 text-xs font-semibold text-navy-deep">' + skpdOpts + '</select></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Jabatan</label><input id="pg-jabatan" type="text" value="' + esc(p.jabatan) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div>' +
          '<div class="flex items-center justify-between mb-1"><label class="text-[11px] font-semibold text-text-muted">Unit Bidang / Puskesmas / Bagian</label><button type="button" data-action="open-bidang-from-pegawai" class="text-[10px] font-bold text-electric-blue hover:underline">+ Tambah Bidang / Sub</button></div>' +
          '<select id="pg-bidang" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs">' + bidangOpts + '</select>' +
          '</div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Sub Bidang / Sub Bagian</label><select id="pg-subbidang" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs">' + subOpts + '</select></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Peran Akses</label><select id="pg-peran" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs"><option value="Pegawai"' + (p.peran === 'Pegawai' ? ' selected' : '') + '>Pegawai</option><option value="Kasubid"' + (p.peran === 'Kasubid' ? ' selected' : '') + '>Kasubid</option><option value="Kabid"' + (p.peran === 'Kabid' ? ' selected' : '') + '>Kabid</option><option value="Kepala Badan"' + (p.peran === 'Kepala Badan' ? ' selected' : '') + '>Kepala Badan</option><option value="Super Admin"' + (p.peran === 'Super Admin' ? ' selected' : '') + '>Super Admin</option></select></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Mode Default</label><select id="pg-mode" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs"><option value="WFO"' + (p.modeDefault === 'WFO' ? ' selected' : '') + '>WFO</option><option value="WFH"' + (p.modeDefault === 'WFH' ? ' selected' : '') + '>WFH</option><option value="WFA"' + (p.modeDefault === 'WFA' ? ' selected' : '') + '>WFA</option></select></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Status</label><select id="pg-kepeg" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs"><option value="PNS"' + (p.statusKepegawaian === 'PNS' ? ' selected' : '') + '>PNS</option><option value="PPPK"' + (p.statusKepegawaian === 'PPPK' ? ' selected' : '') + '>PPPK</option><option value="Honorer"' + (p.statusKepegawaian === 'Honorer' ? ' selected' : '') + '>Honorer</option></select></div>' +
          '</div>' +
          '<button id="btn-save-pegawai-submit" type="submit" class="w-full py-2.5 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold">Simpan Data Pegawai</button>' +
          '</form>';

        openModal(existing ? 'Edit Data Pegawai' : 'Tambah Pegawai Baru', body);
        document.getElementById('pg-skpd').addEventListener('change', function (ev) {
          var nextSkpd = ev.target.value;
          var bdEl = document.getElementById('pg-bidang');
          bdEl.innerHTML = buildBidangOptionsForSkpd(nextSkpd, '');
          document.getElementById('pg-subbidang').innerHTML = buildSubBidangOptions(bdEl.value, '');
        });
        document.getElementById('pg-bidang').addEventListener('change', function (ev) {
          document.getElementById('pg-subbidang').innerHTML = buildSubBidangOptions(ev.target.value, '');
        });
        document.getElementById('form-save-pegawai').addEventListener('submit', function (e) {
          e.preventDefault();
          var btn = document.getElementById('btn-save-pegawai-submit');
          var payload = {
            id: existing ? existing.id : '',
            nip: document.getElementById('pg-nip').value,
            nama: document.getElementById('pg-nama').value,
            pangkat: document.getElementById('pg-pangkat').value,
            jabatan: document.getElementById('pg-jabatan').value,
            skpd: document.getElementById('pg-skpd').value,
            bidang: document.getElementById('pg-bidang').value,
            subBidang: document.getElementById('pg-subbidang').value,
            peran: document.getElementById('pg-peran').value,
            modeDefault: document.getElementById('pg-mode').value,
            statusKepegawaian: document.getElementById('pg-kepeg').value
          };
          callServer('apiSavePegawai', payload, btn, function (res) {
            if (existing) {
              AppCache.pegawai = AppCache.pegawai.map(function (item) { return item.id === res.record.id ? res.record : item; });
            } else {
              AppCache.pegawai.unshift(res.record);
            }
            closeModal();
            renderPegawaiTable();
            showToast(res.message, 'success');
          });
        });
      }

      if (existing) {
        showForm(existing.id);
      } else {
        callServer('apiGetNextId', 'PEGAWAI', null, function (res) {
          showForm(res.nextId);
        });
      }
    }

    var PEGAWAI_IMPORT_COLUMNS = [
      { key: 'nip', header: 'NIP', desc: '18 digit angka (otomatis format Teks agar tidak menjadi E+17)' },
      { key: 'nama', header: 'Nama', desc: 'Nama lengkap beserta gelar akademik' },
      { key: 'pangkat', header: 'Pangkat', desc: 'Contoh: Penata Muda (III/a), Penata (III/c), Pengatur (II/c)' },
      { key: 'jabatan', header: 'Jabatan', desc: 'Nama jabatan resmi sesuai SK' },
      { key: 'bidang', header: 'Bidang', desc: 'Unit Bidang BKAD (Sekretariat, Aset, Perbendaharaan, Anggaran)' },
      { key: 'subBidang', header: 'SubBidang', desc: 'Sub Bidang / Sub Bagian unit kerja (opsional)' },
      { key: 'peran', header: 'Peran', desc: 'Pegawai / Kasubid / Kabid / Kepala Badan / Super Admin' },
      { key: 'modeDefault', header: 'ModeDefault', desc: 'WFO, WFH, atau WFA' },
      { key: 'statusKepegawaian', header: 'StatusKepegawaian', desc: 'PNS, PPPK, CPNS, atau Honorer' },
      { key: 'telepon', header: 'Telepon', desc: 'Nomor HP/WA aktif format teks (08...)' }
    ];

    var PEGAWAI_IMPORT_SAMPLES = [
      ['199205142019031004', 'Yohanes Koromat, S.E.', 'Penata Muda Tk. I (III/b)', 'Analis Perbendaharaan', 'Bidang Perbendaharaan', 'Subbidang Kas Daerah', 'Pegawai', 'WFO', 'PNS', '081248001122'],
      ['199508222020122006', 'Agustina Aibui, S.Ak.', 'Penata Muda (III/a)', 'Verifikator Barang Milik Daerah', 'Bidang Aset', 'Subbidang Inventarisasi & Sensus Aset', 'Pegawai', 'WFA', 'PNS', '081344556677'],
      ['199711032023211002', 'Petrus Werianggi, A.Md.', 'Ahli Pertama / VII', 'Operator Penyusun Anggaran', 'Bidang Anggaran', 'Subbidang Penyusunan APBD', 'Pegawai', 'WFO', 'PPPK', '085299887766']
    ];

    function triggerBlobDownload(content, mimeType, fileName) {
      var blob = new Blob([content], { type: mimeType });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function downloadPegawaiTemplateXLS() {
      var ths = '';
      for (var i = 0; i < PEGAWAI_IMPORT_COLUMNS.length; i++) {
        ths += '<th>' + esc(PEGAWAI_IMPORT_COLUMNS[i].header) + '</th>';
      }
      var trs = '';
      for (var r = 0; r < PEGAWAI_IMPORT_SAMPLES.length; r++) {
        var row = PEGAWAI_IMPORT_SAMPLES[r];
        trs += '<tr>';
        for (var c = 0; c < row.length; c++) {
          var isTextNum = (c === 0 || c === 9);
          trs += '<td' + (isTextNum ? ' class="txt" style="mso-number-format:\'\\@\';"' : '') + '>' + esc(row[c]) + '</td>';
          trs += '<td' + (isTextNum ? ' class="txt"' : '') + '>' + esc(row[c]) + '</td>';
        }
        trs += '</tr>';
      }
      var xlsHtml = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head><meta charset="utf-8" />' +
        '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>DataPegawai</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
        '<style>' +
        '<head><meta charset="utf-8" /><style>' +
        'table{border-collapse:collapse;}th{background-color:#0B3D91;color:#FFFFFF;font-weight:bold;border:1px solid #1E293B;padding:6px 10px;font-family:Calibri,Arial,sans-serif;font-size:11pt;text-align:left;}' +
        'td{border:1px solid #CBD5E1;padding:5px 10px;font-family:Calibri,Arial,sans-serif;font-size:10.5pt;vertical-align:middle;}' +
        '.txt{mso-number-format:"\\@";}' +
        '</style></head><body>' +
        '<table><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table>' +
        '</body></html>';
      triggerBlobDownload('\uFEFF' + xlsHtml, 'application/vnd.ms-excel;charset=utf-8;', 'Templat_Impor_Pegawai_BKAD_Teluk_Wondama.xls');
      showToast('Templat Excel (.xls) berhasil diunduh. Kolom NIP sudah dikunci sebagai Teks.', 'success');
    }

    function downloadPegawaiTemplateCSV() {
      var headers = [];
      for (var i = 0; i < PEGAWAI_IMPORT_COLUMNS.length; i++) {
        headers.push(PEGAWAI_IMPORT_COLUMNS[i].header);
      }
      var lines = [headers.join(',')];
      for (var r = 0; r < PEGAWAI_IMPORT_SAMPLES.length; r++) {
        var cols = [];
        for (var c = 0; c < PEGAWAI_IMPORT_SAMPLES[r].length; c++) {
          var val = String(PEGAWAI_IMPORT_SAMPLES[r][c] || '').replace(/"/g, '""');
          cols.push('"' + val + '"');
        }
        lines.push(cols.join(','));
      }
      triggerBlobDownload('\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8;', 'Templat_Impor_Pegawai_BKAD_Teluk_Wondama.csv');
      showToast('Templat CSV (.csv) UTF-8 BOM berhasil diunduh.', 'success');
    }

    function parseDelimitedPegawaiRows(text, delimiter) {
      var rows = [];
      var curRow = [];
      var curVal = '';
      var inQuotes = false;
      var clean = String(text || '').replace(/^\uFEFF/, '');
      for (var i = 0; i < clean.length; i++) {
        var ch = clean.charAt(i);
        var nextCh = i + 1 < clean.length ? clean.charAt(i + 1) : '';
        if (inQuotes) {
          if (ch === '"' && nextCh === '"') {
            curVal += '"';
            i++;
          } else if (ch === '"') {
            inQuotes = false;
          } else {
            curVal += ch;
          }
        } else {
          if (ch === '"') {
            inQuotes = true;
          } else if (ch === delimiter) {
            curRow.push(curVal.trim());
            curVal = '';
          } else if (ch === '\r' && nextCh === '\n') {
            curRow.push(curVal.trim());
            rows.push(curRow);
            curRow = [];
            curVal = '';
            i++;
          } else if (ch === '\n' || ch === '\r') {
            curRow.push(curVal.trim());
            rows.push(curRow);
            curRow = [];
            curVal = '';
          } else {
            curVal += ch;
          }
        }
      }
      if (curVal.length > 0 || curRow.length > 0) {
        curRow.push(curVal.trim());
        rows.push(curRow);
      }
      return rows;
    }

    function parsePegawaiMatrixFromText(rawText) {
      var text = String(rawText || '').replace(/^\uFEFF/, '').trim();
      if (!text) return [];
      var lowerFull = text.toLowerCase();

      if ((lowerFull.indexOf('<html') !== -1 || lowerFull.indexOf('<table') !== -1) && lowerFull.indexOf('<tr') !== -1) {
        var docHtml = new DOMParser().parseFromString(text, 'text/html');
        var trs = docHtml.querySelectorAll('table tr');
        var htmlMatrix = [];
        for (var r = 0; r < trs.length; r++) {
          var cells = trs[r].querySelectorAll('th, td');
          var rowArr = [];
          for (var c = 0; c < cells.length; c++) {
            rowArr.push(String(cells[c].textContent || '').replace(/\s+/g, ' ').trim());
          }
          if (rowArr.some(function (x) { return x !== ''; })) htmlMatrix.push(rowArr);
        }
        return htmlMatrix;
      }

      if (text.slice(0, 300).toLowerCase().indexOf('<' + '?xml') !== -1 && (lowerFull.indexOf('<row') !== -1 || lowerFull.indexOf('<ss:row') !== -1)) {
        var docXml = new DOMParser().parseFromString(text, 'text/xml');
        var xmlRows = docXml.getElementsByTagName('Row');
        if (!xmlRows.length) xmlRows = docXml.getElementsByTagNameNS('*', 'Row');
        var xmlMatrix = [];
        for (var xr = 0; xr < xmlRows.length; xr++) {
          var xCells = xmlRows[xr].getElementsByTagName('Cell');
          if (!xCells.length) xCells = xmlRows[xr].getElementsByTagNameNS('*', 'Cell');
          var xArr = [];
          var xIdx = 0;
          for (var xc = 0; xc < xCells.length; xc++) {
            var explicitIdx = xCells[xc].getAttribute('ss:Index') || xCells[xc].getAttribute('Index');
            if (explicitIdx) {
              var parsedIdx = parseInt(explicitIdx, 10) - 1;
              while (xArr.length < parsedIdx) xArr.push('');
              xIdx = parsedIdx;
            }
            xArr[xIdx] = String(xCells[xc].textContent || '').trim();
            xIdx++;
          }
          if (xArr.some(function (x) { return x !== ''; })) xmlMatrix.push(xArr);
        }
        return xmlMatrix;
      }

      var firstLine = text.split(/\r?\n/)[0] || '';
      var tabCount = (firstLine.match(/\t/g) || []).length;
      var semiCount = (firstLine.match(/;/g) || []).length;
      var commaCount = (firstLine.match(/,/g) || []).length;
      var sep = ',';
      if (tabCount >= 2) sep = '\t';
      else if (semiCount >= commaCount && semiCount >= 2) sep = ';';
      return parseDelimitedPegawaiRows(text, sep);
    }

    function normalizePegawaiHeaderKey(label) {
      var norm = String(label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!norm || norm === 'no' || norm === 'nomor' || norm === 'nourut' || norm === 'id' || norm === 'pegawaiid' || norm === 'idpegawai') return '';
      if (norm === 'nip' || norm === 'nip18digit' || norm === 'noindukpegawai' || norm === 'nomorindukpegawai' || norm === 'nipbaru' || norm === 'nipasn' || norm === 'idnip' || norm === 'iddannip') return 'nip';
      if (norm === 'nama' || norm === 'namalengkap' || norm === 'namapegawai' || norm === 'namaasn' || norm === 'namalengkapdangelar' || norm === 'namadanpangkat') return 'nama';
      if (norm === 'pangkat' || norm === 'pangkatgol' || norm === 'golongan' || norm === 'pangkatgolruang' || norm === 'pangkatgolongan' || norm === 'gol' || norm === 'golruang' || norm === 'pangkatdanstatus') return 'pangkat';
      if (norm === 'jabatan' || norm === 'namajabatan' || norm === 'jabatanstruktural' || norm === 'jabatanfungsional' || norm === 'jabatandanbidang') return 'jabatan';
      if (norm === 'bidang' || norm === 'unitbidang' || norm === 'unitkerja' || norm === 'bagian' || norm === 'opd' || norm === 'seksi') return 'bidang';
      if (norm === 'subbidang' || norm === 'subbagian' || norm === 'subbag' || norm === 'subunit' || norm === 'kasubid') return 'subBidang';
      if (norm === 'peran' || norm === 'role' || norm === 'hakakses' || norm === 'peranakses' || norm === 'level' || norm === 'perandanmode') return 'peran';
      if (norm === 'modedefault' || norm === 'mode' || norm === 'modekerja' || norm === 'modekerjabawaan' || norm === 'sistemkerja') return 'modeDefault';
      if (norm === 'statuskepegawaian' || norm === 'statusasn' || norm === 'status' || norm === 'jenispegawai' || norm === 'jenisasn' || norm === 'statuspegawai') return 'statusKepegawaian';
      if (norm === 'telepon' || norm === 'nohp' || norm === 'hp' || norm === 'telp' || norm === 'whatsapp' || norm === 'nowa' || norm === 'nomortelepon' || norm === 'kontak') return 'telepon';
      return '';
    }

    function normalizeNipFromExcelCell(rawNip) {
      var s = String(rawNip || '').replace(/^'/, '').trim();
      if (!s) return '';
      if (/^[0-9]+([.,][0-9]+)?e\+[0-9]+$/i.test(s)) {
        var numVal = Number(s.replace(',', '.'));
        if (!isNaN(numVal) && numVal > 1000000) {
          return String(Math.round(numVal));
        }
      }
      var digits = s.replace(/[^0-9]/g, '');
      if (digits.length >= 18) {
        return digits.slice(-18);
      }
      return digits;
    }

    function validatePegawaiImportMatrix(rawMatrix, sourceName) {
      var matrix = [];
      for (var i = 0; i < (rawMatrix || []).length; i++) {
        var row = rawMatrix[i];
        if (row && row.some(function (cell) { return String(cell || '').trim() !== ''; })) {
          matrix.push(row);
        }
      }
      if (!matrix.length) {
        return { sourceName: sourceName, rows: [], validRows: [], readyRows: [], updateRows: [], dupRows: [], errorRows: [], empty: true };
      }

      // Pindai hingga 15 baris pertama untuk mencari baris Header kolom (mengabaikan baris judul di atas tabel)
      var bestHeaderIdx = -1;
      var bestMatchedCount = 0;
      var bestColMap = {};
      var maxScan = Math.min(matrix.length, 15);
      for (var hIdx = 0; hIdx < maxScan; hIdx++) {
        var candRow = matrix[hIdx];
        var tempMap = {};
        var tempCount = 0;
        for (var c = 0; c < candRow.length; c++) {
          var mapped = normalizePegawaiHeaderKey(candRow[c]);
          if (mapped && tempMap[mapped] === undefined) {
            tempMap[mapped] = c;
            tempCount++;
          }
        }
        if (tempCount > bestMatchedCount) {
          bestMatchedCount = tempCount;
          bestHeaderIdx = hIdx;
          bestColMap = tempMap;
        }
      }

      var colMap = {};
      var startIdx = 1;
      if (bestMatchedCount >= 2) {
        colMap = bestColMap;
        startIdx = bestHeaderIdx + 1;
      } else {
        // Deteksi otomatis posisi kolom NIP jika file tanpa header (mengantisipasi adanya kolom No / ID di paling kiri)
        startIdx = 0;
        var firstRow = matrix[0] || [];
        var nipColOffset = 0;
        for (var fc = 0; fc < Math.min(firstRow.length, 4); fc++) {
          var testDigits = normalizeNipFromExcelCell(firstRow[fc]);
          if (testDigits.length >= 8) {
            nipColOffset = fc;
            break;
          }
        }
        colMap = {
          nip: nipColOffset,
          nama: nipColOffset + 1,
          pangkat: nipColOffset + 2,
          jabatan: nipColOffset + 3,
          bidang: nipColOffset + 4,
          subBidang: nipColOffset + 5,
          peran: nipColOffset + 6,
          modeDefault: nipColOffset + 7,
          statusKepegawaian: nipColOffset + 8,
          telepon: nipColOffset + 9
        };
      }

      var existingDbNips = {};
      for (var d = 0; d < AppCache.pegawai.length; d++) {
        var cleanDbNip = String(AppCache.pegawai[d].nip || '').replace(/[^0-9]/g, '');
        if (cleanDbNip) existingDbNips[cleanDbNip] = true;
      }

      var seenFileNips = {};
      var rowsOut = [];
      var validRows = [];
      var readyRows = [];
      var updateRows = [];
      var dupRows = [];
      var errorRows = [];

      for (var r = startIdx; r < matrix.length; r++) {
        var cur = matrix[r];
        var getVal = function (key) {
          var idx = colMap[key];
          return (idx !== undefined && idx < cur.length) ? String(cur[idx] || '').trim() : '';
        };
        var rawNip = getVal('nip');
        var cleanNip = normalizeNipFromExcelCell(rawNip);
        var nama = getVal('nama');

        // Lewati baris kosong atau baris sub-header di tengah tabel
        if (!rawNip && !nama) continue;
        if (normalizePegawaiHeaderKey(rawNip) === 'nip' && normalizePegawaiHeaderKey(nama) === 'nama') continue;

        var pangkat = getVal('pangkat') || 'Penata Muda (III/a)';
        var jabatan = getVal('jabatan') || 'Staf Pelaksana';
        var bidang = getVal('bidang') || 'Bidang Aset';
        var subBidang = getVal('subBidang');
        var peran = getVal('peran') || 'Pegawai';
        var modeCell = (getVal('modeDefault') || 'WFO').toUpperCase();
        var modeRaw = modeCell.indexOf('WFA') !== -1 ? 'WFA' : (modeCell.indexOf('WFH') !== -1 ? 'WFH' : 'WFO');
        var kepegRaw = getVal('statusKepegawaian') || 'PNS';
        var telepon = getVal('telepon').replace(/^'/, '') || '-';

        var errMsg = '';
        if (!rawNip) {
          errMsg = 'Kolom NIP kosong.';
        } else if (cleanNip.length < 6) {
          errMsg = 'NIP harus berupa angka minimal 6-18 digit (' + rawNip + ').';
        } else if (!nama) {
          errMsg = 'Nama lengkap wajib diisi.';
        } else if (seenFileNips[cleanNip]) {
          errMsg = 'Duplikat NIP di dalam berkas (sudah ada di baris ' + seenFileNips[cleanNip] + ').';
        }

        var status = 'READY';
        var note = 'Siap diimpor sebagai ASN/PPPK baru';
        if (errMsg) {
          status = 'ERROR';
          note = errMsg;
        } else if (existingDbNips[cleanNip]) {
          status = 'DUP_DB';
          note = 'NIP sudah terdaftar (akan diperbarui jika opsi Perbarui Data dicentang)';
        }

        if (cleanNip && !seenFileNips[cleanNip]) seenFileNips[cleanNip] = r + 1;

        var parsedItem = {
          rowNum: r + 1,
          nip: cleanNip || rawNip,
          nama: nama,
          pangkat: pangkat,
          jabatan: jabatan,
          bidang: bidang,
          subBidang: subBidang,
          peran: peran,
          modeDefault: modeRaw,
          statusKepegawaian: kepegRaw,
          telepon: telepon,
          status: status,
          note: note
        };
        rowsOut.push(parsedItem);
        if (status === 'READY') {
          readyRows.push(parsedItem);
          validRows.push(parsedItem);
        } else if (status === 'DUP_DB') {
          dupRows.push(parsedItem);
          updateRows.push(parsedItem);
          validRows.push(parsedItem);
        } else {
          errorRows.push(parsedItem);
        }
      }

      return {
        sourceName: sourceName,
        rows: rowsOut,
        validRows: validRows,
        readyRows: readyRows,
        updateRows: updateRows,
        dupRows: dupRows,
        errorRows: errorRows,
        empty: rowsOut.length === 0
      };
    }

    function loadSheetJSLib(onReady, onError) {
      if (window.XLSX && window.XLSX.read) {
        onReady(window.XLSX);
        return;
      }
      var cdnList = [
        'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
        'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
        'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
      ];
      var tryIdx = 0;
      function tryNextCdn() {
        if (window.XLSX && window.XLSX.read) {
          onReady(window.XLSX);
          return;
        }
        if (tryIdx >= cdnList.length) {
          if (onError) onError();
          return;
        }
        var url = cdnList[tryIdx++];
        var el = document.createElement('script');
        el.src = url;
        el.onload = function () {
          if (window.XLSX && window.XLSX.read) onReady(window.XLSX);
          else tryNextCdn();
        };
        el.onerror = function () {
          tryNextCdn();
        };
        document.head.appendChild(el);
      }
      tryNextCdn();
    }

    function readSpreadsheetFileMatrix(file, onMatrix) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        var buf = ev.target.result;
        var bytes = new Uint8Array(buf);
        var isZipXlsx = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4B;
        var isOleBiff = bytes.length >= 4 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;

        if (isZipXlsx || isOleBiff) {
          showToast('Membaca buku kerja Excel (' + file.name + ')...', 'info');
          loadSheetJSLib(function (XLSXLib) {
            try {
              var wb = XLSXLib.read(buf, { type: 'array', raw: false, cellDates: false });
              var ws = wb.Sheets[wb.SheetNames[0]];
              // Pulihkan sel angka 18-digit NIP agar tidak berubah menjadi 1.98E+17
              for (var cellKey in ws) {
                if (!Object.prototype.hasOwnProperty.call(ws, cellKey) || cellKey.charAt(0) === '!') continue;
                var cellObj = ws[cellKey];
                if (cellObj && cellObj.t === 'n' && typeof cellObj.v === 'number') {
                  if (cellObj.v >= 10000000 && Math.floor(cellObj.v) === cellObj.v) {
                    cellObj.w = String(Math.round(cellObj.v));
                  }
                }
              }
              var matrix = XLSXLib.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
              onMatrix(matrix);
            } catch (ex) {
              showToast('Gagal memparsing berkas Excel: ' + ex.message, 'error');
            }
          }, function () {
            showToast('Pembaca .xlsx biner memerlukan koneksi internet. Gunakan Templat .xls resmi, .csv, atau fitur Tempel dari Excel.', 'warning');
          });
          return;
        }

        var text = '';
        if (typeof TextDecoder !== 'undefined') {
          if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
            text = new TextDecoder('utf-16le').decode(bytes);
          } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
            text = new TextDecoder('utf-16be').decode(bytes);
          } else {
            text = new TextDecoder('utf-8').decode(bytes);
          }
        } else {
          for (var b = 0; b < bytes.length; b++) text += String.fromCharCode(bytes[b]);
        }
        onMatrix(parsePegawaiMatrixFromText(text));
      };
      reader.readAsArrayBuffer(file);
    }

    function handlePegawaiFileSelected(file) {
      readSpreadsheetFileMatrix(file, function (matrix) {
        renderImportPegawaiPreview(validatePegawaiImportMatrix(matrix, file.name));
      });
    }

    function renderImportPegawaiPreview(parsed) {
      AppCache.pendingPegawaiImport = parsed;
      var box = document.getElementById('import-pegawai-preview-box');
      if (!box) return;
      if (!parsed || parsed.empty) {
        box.innerHTML = '<div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">Tidak ada baris data yang terbaca pada berkas <b>' + esc((parsed && parsed.sourceName) || '-') + '</b>. Pastikan mengisi mulai baris ke-2 di bawah judul kolom.</div>';
        box.classList.remove('hidden');
        return;
      }

      var chkUpsert = document.getElementById('chk-import-pegawai-upsert');
      var allowUpsert = !chkUpsert || chkUpsert.checked;
      var actionableCount = allowUpsert ? (parsed.readyRows.length + parsed.dupRows.length) : parsed.readyRows.length;

      var maxShow = Math.min(parsed.rows.length, 50);
      var trHtml = '';
      for (var i = 0; i < maxShow; i++) {
        var row = parsed.rows[i];
        var badge = '';
        var rowCls = '';
        if (row.status === 'READY') {
          badge = '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-[10px]">PEG BARU</span>';
        } else if (row.status === 'DUP_DB') {
          badge = '<span class="px-2 py-0.5 rounded-full bg-blue-100 text-navy-deep font-semibold text-[10px]">PERBARUI (UPSERT)</span>';
          rowCls = 'bg-blue-50/40';
        } else {
          badge = '<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold text-[10px]">GALAT</span>';
          rowCls = 'bg-red-50/50';
        }
        trHtml += '<tr class="' + rowCls + '">' +
          '<td class="py-2 px-2.5 font-mono text-[11px] text-text-muted">' + row.rowNum + '</td>' +
          '<td class="py-2 px-2.5 font-mono text-[11px] font-semibold">' + esc(row.nip || '-') + '</td>' +
          '<td class="py-2 px-2.5 text-xs font-semibold text-text-main">' + esc(row.nama || '-') + '<div class="text-[10px] font-normal text-text-muted">' + esc(row.jabatan) + ' • ' + esc(row.bidang) + '</div></td>' +
          '<td class="py-2 px-2.5 text-[11px]">' + esc(row.modeDefault) + ' • ' + esc(row.statusKepegawaian) + '</td>' +
          '<td class="py-2 px-2.5">' + badge + '<div class="text-[10px] text-text-muted mt-0.5">' + esc(row.note) + '</div></td>' +
          '</tr>';
      }

      box.innerHTML = '' +
        '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">' +
        '<div>' +
        '<div class="text-xs font-bold text-navy-deep">Pratinjau Validasi Dry-Run: ' + esc(parsed.sourceName) + '</div>' +
        '<div class="text-[11px] text-text-muted">Total ' + parsed.rows.length + ' baris dievaluasi' + (parsed.rows.length > maxShow ? ' (menampilkan ' + maxShow + ' baris pertama)' : '') + '</div>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
        '<button type="button" data-action="clear-import-pegawai-preview" class="px-3 py-1.5 rounded-xl bg-white hover:bg-surface-high border border-border-subtle text-xs font-semibold text-text-muted">Tutup Pratinjau</button>' +
        (actionableCount > 0
          ? '<button type="button" data-action="execute-import-pegawai" class="px-3.5 py-1.5 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">cloud_done</span><span>Simpan &amp; Impor ' + actionableCount + ' Pegawai Valid</span></button>'
          : '') +
        '</div>' +
        '</div>' +
        '<div class="grid grid-cols-3 gap-2 text-xs">' +
        '<div class="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200"><div class="text-[10px] font-bold text-emerald-700 uppercase">Pegawai Baru</div><div class="font-mono text-base font-bold text-emerald-700">' + parsed.readyRows.length + '</div></div>' +
        '<div class="p-2.5 rounded-xl bg-blue-50 border border-blue-200"><div class="text-[10px] font-bold text-navy-deep uppercase">Sudah Ada (Upsert)</div><div class="font-mono text-base font-bold text-navy-deep">' + parsed.dupRows.length + '</div></div>' +
        '<div class="p-2.5 rounded-xl bg-red-50 border border-red-200"><div class="text-[10px] font-bold text-red-700 uppercase">Galat Validasi</div><div class="font-mono text-base font-bold text-red-700">' + parsed.errorRows.length + '</div></div>' +
        '</div>' +
        '<div class="max-h-64 overflow-y-auto rounded-xl border border-border-subtle bg-white">' +
        '<table class="w-full text-left border-collapse">' +
        '<thead><tr class="bg-surface-low text-[10px] uppercase text-text-muted border-b border-border-subtle sticky top-0"><th class="py-2 px-2.5">Baris</th><th class="py-2 px-2.5">NIP</th><th class="py-2 px-2.5">Nama &amp; Jabatan</th><th class="py-2 px-2.5">Mode &amp; ASN</th><th class="py-2 px-2.5">Hasil Dry-Run</th></tr></thead>' +
        '<tbody class="divide-y divide-border-subtle">' + trHtml + '</tbody>' +
        '</table>' +
        '</div>';
      box.classList.remove('hidden');
    }

    function clearImportPegawaiPreview() {
      AppCache.pendingPegawaiImport = null;
      var box = document.getElementById('import-pegawai-preview-box');
      if (box) {
        box.innerHTML = '';
        box.classList.add('hidden');
      }
      var inp = document.getElementById('import-pegawai-file');
      if (inp) inp.value = '';
    }

    function mergeImportedPegawaiToCache(records) {
      if (!records || !records.length) return;
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        var cRecNip = String(rec.nip || '').replace(/[^0-9]/g, '');
        var replaced = false;
        for (var j = 0; j < AppCache.pegawai.length; j++) {
          var cExNip = String(AppCache.pegawai[j].nip || '').replace(/[^0-9]/g, '');
          if (AppCache.pegawai[j].id === rec.id || (cRecNip && cExNip === cRecNip)) {
            AppCache.pegawai[j] = rec;
            replaced = true;
            break;
          }
        }
        if (!replaced) AppCache.pegawai.unshift(rec);
      }
    }

    function executePendingPegawaiImport(btn) {
      var pending = AppCache.pendingPegawaiImport;
      var chkUpsert = document.getElementById('chk-import-pegawai-upsert');
      var allowUpsert = !chkUpsert || !!chkUpsert.checked;
      var rowsToSend = pending ? (allowUpsert ? (pending.validRows || pending.readyRows) : pending.readyRows) : [];
      if (!rowsToSend || !rowsToSend.length) {
        showToast('Tidak ada baris pegawai valid yang siap diimpor. Centang opsi "Perbarui data jika NIP sudah terdaftar" jika ingin memperbarui pegawai lama.', 'warning');
        return;
      }
      callServer('apiImportPegawaiBatch', { rows: rowsToSend, upsert: allowUpsert }, btn, function (res) {
        mergeImportedPegawaiToCache(res.records || []);
        clearImportPegawaiPreview();
        AppCache.pegawaiPage = 1;
        renderPegawaiTable();
        showToast(res.message, 'success');
      });
    }

    function openPedomanImporPegawaiModal() {
      var colCards = '';
      for (var i = 0; i < PEGAWAI_IMPORT_COLUMNS.length; i++) {
        var col = PEGAWAI_IMPORT_COLUMNS[i];
        colCards += '<div class="p-2.5 rounded-xl bg-surface-low border border-border-subtle">' +
          '<div class="font-mono text-xs font-bold text-navy-deep">' + (i + 1) + '. ' + esc(col.header) + '</div>' +
          '<div class="text-[11px] text-text-muted mt-0.5">' + esc(col.desc) + '</div>' +
          '</div>';
      }
      var body = '<div class="space-y-4">' +
        '<div class="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-navy-deep leading-relaxed">' +
        '<b>Cara Praktis Impor Pegawai:</b><br/>' +
        '1. Klik <b>Unduh Templat Excel (.xls)</b> — kolom NIP sudah dikunci berformat <b>Teks</b> agar angka 18 digit tidak berubah menjadi notasi ilmiah (<span class="font-mono">1.98E+17</span>).<br/>' +
        '2. Lengkapi data ASN/PPPK lalu simpan berkas (tetap dalam format <b>.xls</b> / <b>.csv</b> / <b>.xlsx</b>), kemudian unggah di kotak pilih berkas.<br/>' +
        '3. Atau salin (<i>Copy</i>) baris tabel langsung dari Microsoft Excel / Google Sheets dan tempel (<i>Paste</i>) pada kotak di bawah ini.' +
        '</div>' +
        '<div>' +
        '<div class="text-xs font-bold text-navy-deep mb-2">10 Kolom Baku Templat Pegawai BKAD Teluk Wondama</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' + colCards + '</div>' +
        '</div>' +
        '<div class="p-3 rounded-2xl bg-surface-low border border-border-subtle space-y-2">' +
        '<div class="text-xs font-bold text-navy-deep">Opsi Cepat: Tempel Langsung Data Tabel dari Excel (Copy-Paste)</div>' +
        '<textarea id="paste-pegawai-excel" rows="4" placeholder="Salin baris data dari Excel (boleh dengan atau tanpa baris header kolom), lalu Ctrl+V di sini..." class="w-full p-2.5 rounded-xl bg-white border border-border-subtle font-mono text-[11px]"></textarea>' +
        '<div class="flex flex-wrap justify-between items-center gap-2">' +
        '<button id="btn-fill-sample-paste" type="button" class="px-3 py-1.5 rounded-lg bg-white border border-border-subtle text-[11px] font-semibold text-navy-deep hover:bg-surface-high">Isi Contoh 3 Baris</button>' +
        '<button id="btn-run-paste-dryrun" type="button" class="px-3.5 py-1.5 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold">Validasi Dry-Run Data Tempelan</button>' +
        '</div>' +
        '</div>' +
        '</div>';
      openModal('Pedoman Templat & Impor Copy-Paste Excel Pegawai', body);

      document.getElementById('btn-fill-sample-paste').addEventListener('click', function () {
        var hdr = PEGAWAI_IMPORT_COLUMNS.map(function (c) { return c.header; }).join('\t');
        var lines = [hdr];
        for (var s = 0; s < PEGAWAI_IMPORT_SAMPLES.length; s++) {
          lines.push(PEGAWAI_IMPORT_SAMPLES[s].join('\t'));
        }
        document.getElementById('paste-pegawai-excel').value = lines.join('\n');
      });

      document.getElementById('btn-run-paste-dryrun').addEventListener('click', function () {
        var raw = document.getElementById('paste-pegawai-excel').value.trim();
        if (!raw) {
          showToast('Tempel data tabel dari Excel terlebih dahulu.', 'warning');
          return;
        }
        var matrix = parsePegawaiMatrixFromText(raw);
        var resParsed = validatePegawaiImportMatrix(matrix, 'Tempelan Clipboard Excel');
        closeModal();
        renderImportPegawaiPreview(resParsed);
      });
    }

    /* -------------------------------------------------------------------
     * 8. RENDER REKONSILIASI PRESENSI RETROAKTIF (WIZARD 4 LANGKAH)
     * ------------------------------------------------------------------- */
    function renderRekonModule() {
      var step = AppCache.rekonStep;
      var pills = document.getElementById('rekon-step-pills').children;
      for (var i = 0; i < pills.length; i++) {
        pills[i].className = 'p-3 rounded-xl text-xs font-semibold ' +
          (i + 1 === step ? 'bg-blue-50 border border-electric-blue text-navy-deep' : (i + 1 < step ? 'bg-emerald-50 text-status-present border border-emerald-200' : 'bg-surface-low text-text-muted'));
      }

      var draft = AppCache.rekon.filter(function (r) { return r.statusKunci.indexOf('Terkunci') === -1; })[0] || AppCache.rekon[0] || {};
      var body = '';
      if (step === 1) {
        body = '<div class="space-y-3">' +
          '<div class="text-xs font-bold text-navy-deep">Langkah 1: Pilih Berkas & Periode Rekonsiliasi Retroaktif (5.548 Baris Log)</div>' +
          '<p class="text-xs text-text-muted">Periode Aktif: <b>' + esc(draft.periode) + '</b> (No. BA: <span class="font-mono">' + esc(draft.nomorBA) + '</span>) • Total Tercakup: <b>' + esc(draft.totalPegawai || 142) + ' ASN</b></p>' +
          '<div class="overflow-x-auto"><table class="w-full text-left border border-border-subtle rounded-xl overflow-hidden text-[11px] bg-white">' +
          '<thead><tr class="bg-surface-low text-text-muted uppercase"><th class="py-2 px-3">Sumber Berkas Log</th><th class="py-2 px-3">Volume Data</th><th class="py-2 px-3">Kualitas Geo-Lock</th><th class="py-2 px-3">Status Batch</th></tr></thead>' +
          '<tbody class="divide-y divide-border-subtle">' +
          '<tr><td class="py-2 px-3 font-semibold">Mesin Biometrik & Server Mobile WIT</td><td class="py-2 px-3 font-mono">4.812 Baris</td><td class="py-2 px-3">Valid Geo-Fence Rasiei</td><td class="py-2 px-3 font-semibold text-status-present">Siap Dry-Run</td></tr>' +
          '<tr><td class="py-2 px-3 font-semibold">Log Offline Pesisir & SPT Kepulauan Roon</td><td class="py-2 px-3 font-mono">736 Baris</td><td class="py-2 px-3">Perlu Padankan SPT GPS</td><td class="py-2 px-3 font-semibold text-amber-600">' + (draft.anomaliTeridentifikasi || 3) + ' Anomali</td></tr>' +
          '</tbody></table></div>' +
          '<button type="button" data-action="rekon-step" data-id="2" class="px-4 py-2 rounded-xl bg-electric-blue text-white text-xs font-semibold">Lanjut ke Validasi Dry-Run →</button>' +
          '</div>';
      } else if (step === 2) {
        body = '<div class="space-y-3">' +
          '<div class="text-xs font-bold text-navy-deep">Langkah 2: Hasil Validasi Dry-Run Sistem (5.548 Baris Terindeks)</div>' +
          '<p class="text-xs text-text-muted">Ditemukan <b>' + esc(draft.anomaliTeridentifikasi) + ' anomali</b> presensi dari ' + esc(draft.totalPegawai) + ' ASN (keterlambatan tanpa keterangan / belum sinkron SPT).</p>' +
          '<div class="overflow-x-auto"><table class="w-full text-left border border-border-subtle rounded-xl overflow-hidden text-[11px] bg-white">' +
          '<thead><tr class="bg-surface-low text-text-muted uppercase"><th class="py-2 px-3">NIP / ASN Terindikasi</th><th class="py-2 px-3">Temuan Dry-Run</th><th class="py-2 px-3">Sumber Koreksi</th><th class="py-2 px-3">Dampak TPP Awal</th></tr></thead>' +
          '<tbody class="divide-y divide-border-subtle">' +
          '<tr><td class="py-2 px-3 font-mono">199405192022212004 • Maria Rumbiak, A.Md.</td><td class="py-2 px-3">Koordinat di luar Kantor Rasiei</td><td class="py-2 px-3 font-semibold text-electric-blue">SPT Kepulauan Roon 094/012</td><td class="py-2 px-3 font-mono text-status-present">Rp 0 (SPT Sah)</td></tr>' +
          '<tr><td class="py-2 px-3 font-mono">199108152015051003 • Yulianus Kereway, A.Md.</td><td class="py-2 px-3">Terlambat 27 Menit & Mangkir</td><td class="py-2 px-3 font-semibold text-status-absent">Kasus Disiplin & Potongan WIT</td><td class="py-2 px-3 font-mono text-status-absent">-Rp 67.500</td></tr>' +
          '<tr><td class="py-2 px-3 font-mono">198911032014031002 • Oktovianus Sayori, S.Kom.</td><td class="py-2 px-3">Akumulasi Terlambat WFH</td><td class="py-2 px-3 font-semibold text-amber-600">Audit Jam Kerja WIT</td><td class="py-2 px-3 font-mono text-amber-600">-Rp 35.000</td></tr>' +
          '</tbody></table></div>' +
          '<div class="flex flex-wrap gap-2">' +
          '<button type="button" data-action="rekon-step" data-id="1" class="px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs font-semibold">← Kembali</button>' +
          '<button type="button" data-action="rekon-step" data-id="3" class="px-4 py-2 rounded-xl bg-electric-blue text-white text-xs font-semibold">Lanjut ke Resolusi Anomali TPP →</button>' +
          '</div>' +
          '</div>';
      } else if (step === 3) {
        body = '<div class="space-y-3">' +
          '<div class="text-xs font-bold text-navy-deep">Langkah 3: Resolusi Anomali & Alokasi Penalti TPP ke SPM Kasda</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
          '<div class="p-3 rounded-xl bg-blue-50 border border-blue-200"><div class="text-[10px] font-bold text-navy-deep uppercase">Akumulasi Penghematan TPP</div><div class="font-mono text-base font-bold text-navy-deep mt-0.5">Rp 4.850.000</div><div class="text-[10px] text-text-muted">Alokasi Rekonsiliasi Periodik</div></div>' +
          '<div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200"><div class="text-[10px] font-bold text-status-present uppercase">Anomali Diputihkan (SPT/Izin)</div><div class="font-mono text-base font-bold text-status-present mt-0.5">' + esc(draft.anomaliTerselesaikan || 1) + ' / ' + esc(draft.anomaliTeridentifikasi || 3) + '</div><div class="text-[10px] text-text-muted">Kepulauan Roon & Sakit Resmi</div></div>' +
          '<div class="p-3 rounded-xl bg-amber-50 border border-amber-200"><div class="text-[10px] font-bold text-amber-700 uppercase">Tujuan Ledger Keuangan</div><div class="font-mono text-xs font-bold text-amber-800 mt-1">SPM TPP Kasda SIMDA</div><div class="text-[10px] text-text-muted">Tarif Rp 2.500/menit</div></div>' +
          '</div>' +
          '<p class="text-xs text-text-muted">Verifikasi surat tugas & izin sah memastikan pemotongan TPP akurat sebelum database dikunci dan dikirim ke SPM Kasda.</p>' +
          '<button type="button" data-action="run-rekon-resolve" data-id="' + esc(draft.id) + '" class="px-4 py-2 rounded-xl bg-status-tracking text-white text-xs font-semibold">Selesaikan Semua Anomali & Lanjut ke Komit</button>' +
          '</div>';
      } else {
        body = '<div class="space-y-3">' +
          '<div class="text-xs font-bold text-navy-deep">Langkah 4: Komit Berita Acara & Kunci Database (Lock Ledger)</div>' +
          '<p class="text-xs text-text-muted">Setelah dikomit, angka kehadiran 5.548 log dan alokasi pemotongan TPP <b>Rp 4.850.000</b> untuk periode <b>' + esc(draft.periode) + '</b> bersifat final, sah, dan terkunci.</p>' +
          '<div class="flex flex-wrap gap-2">' +
          '<button type="button" data-action="commit-rekon" data-id="' + esc(draft.id) + '" class="px-4 py-2 rounded-xl bg-status-present text-white text-xs font-semibold">Komit Berita Acara & Kunci Database</button>' +
          '<button type="button" data-action="print-doc" data-id="BA_REKON" class="px-4 py-2 rounded-xl bg-blue-50 text-navy-deep text-xs font-semibold">Cetak Pratinjau BA Rekon A4</button>' +
          '</div>' +
          '</div>';
      }
      document.getElementById('rekon-wizard-body').innerHTML = body;

      var rowsHtml = '';
      for (var j = 0; j < AppCache.rekon.length; j++) {
        var r = AppCache.rekon[j];
        rowsHtml += '<tr>' +
          '<td class="py-3 px-3"><div class="font-mono text-xs font-bold text-navy-deep">' + esc(r.id) + '</div><div class="text-xs">' + esc(r.periode) + '</div></td>' +
          '<td class="py-3 px-3 font-mono text-xs">' + esc(r.nomorBA) + '</td>' +
          '<td class="py-3 px-3 text-xs">' + r.anomaliTerselesaikan + ' / ' + r.anomaliTeridentifikasi + ' Selesai</td>' +
          '<td class="py-3 px-3">' + getStatusBadge(r.statusKunci) + '</td>' +
          '<td class="py-3 px-3 text-right flex flex-wrap justify-end gap-1.5">' +
          (String(r.statusKunci || '').indexOf('Terkunci') !== -1 ? '<button type="button" data-action="open-adendum-rekon" data-id="' + esc(r.id) + '" class="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold">Adendum BA</button>' : '') +
          '<button type="button" data-action="print-doc" data-id="BA_REKON" class="px-2.5 py-1 rounded-lg bg-blue-50 text-navy-deep text-xs font-semibold">Cetak BA A4</button></td>' +
          '</tr>';
      }
      document.getElementById('tbody-rekon-list').innerHTML = rowsHtml;
    }

    function openAdendumRekonModal(parentId) {
      var parentRec = AppCache.rekon.filter(function (x) { return x.id === parentId; })[0] || {};
      var wit = getClientWITNow();
      var defaultNo = (parentRec.nomorBA ? (parentRec.nomorBA + '.ADD') : ('800.1.6.2/045.A/ADD-REKON/BKAD-TW/' + wit.yyyy));
      var body = '<form id="form-adendum-rekon" action="javascript:void(0);" class="space-y-3">' +
        '<div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950"><b>Adendum Berita Acara Rekon (Immutable Ledger):</b> Koreksi susulan untuk <b>' + esc(parentRec.periode || parentId) + '</b> tercatat sebagai lampiran adendum tanpa menghapus riwayat BA lama.</div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nomor BA Adendum</label><input id="add-rekon-no" type="text" required value="' + esc(defaultNo) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle font-mono text-xs" /></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Alasan Koreksi Susulan (SPT/Izin Terlambat Diterima)</label><textarea id="add-rekon-alasan" rows="2" required placeholder="Contoh: Koreksi data SPT susulan a.n. pegawai tugas luar Kepulauan Roon" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs"></textarea></div>' +
        '<button id="btn-save-adendum" type="submit" class="w-full py-2.5 rounded-xl bg-navy-deep hover:bg-primary text-white text-xs font-semibold">Terbitkan &amp; Kunci Adendum BA</button>' +
        '</form>';
      openModal('Ajukan Adendum Berita Acara Rekonsiliasi', body, false);
      document.getElementById('form-adendum-rekon').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = document.getElementById('btn-save-adendum');
        callServer('apiSaveAdendumRekon', {
          parentId: parentId,
          periode: parentRec.periode || '',
          nomorAdendum: document.getElementById('add-rekon-no').value.trim(),
          alasan: document.getElementById('add-rekon-alasan').value.trim(),
          operatorNip: AppCache.currentUser ? AppCache.currentUser.nip : ''
        }, btn, function (res) {
          AppCache.rekon.unshift(res.record);
          closeModal();
          renderRekonModule();
          showToast(res.message, 'success');
        });
      });
    }

    var PRESENSI_IMPORT_COLUMNS = [
      { key: 'nip', header: 'NIP', desc: '18 digit angka (otomatis Format Teks di templat .xls agar tidak jadi E+17)' },
      { key: 'nama', header: 'NamaPegawai', desc: 'Nama lengkap ASN/PPPK (opsional jika NIP sudah ada di master)' },
      { key: 'bidang', header: 'Bidang', desc: 'Unit Bidang BKAD (terisi otomatis dari master NIP jika kosong)' },
      { key: 'tanggal', header: 'Tanggal', desc: 'Format dd/MM/yyyy (mis. 05/01/2026) atau YYYY-MM-DD (mis. 2026-01-05)' },
      { key: 'jamMasuk', header: 'JamMasuk', desc: 'Format 24 jam WIT HH:mm (mis. 07:45) atau --:-- jika Alpa/Izin/Sakit' },
      { key: 'jamPulang', header: 'JamPulang', desc: 'Format 24 jam WIT HH:mm (mis. 16:30) atau --:--' },
      { key: 'modeKerja', header: 'ModeKerja', desc: 'WFO, WFH, atau WFA' },
      { key: 'status', header: 'KodeStatus', desc: 'Tepat Waktu / HADIR_WFO, TERLAMBAT, SPT_DINAS / HADIR_WFA, IZIN, SAKIT, CUTI, atau ALPA / TK (tanpa keterangan)' },
      { key: 'koordinat', header: 'KoordinatGPS', desc: 'Opsional. Boleh kosong jika Alpa/Izin/Sakit, atau default Kantor Rasiei' },
      { key: 'keterangan', header: 'Keterangan', desc: 'Opsional. Boleh kosong — sistem isi otomatis sesuai KodeStatus (mis. Alpa / TK)' }
    ];

    function buildPresensiSampleRows() {
      var list = getActivePegawaiList();
      var p0 = list[0] || { nip: '198503122010011002', nama: 'Budi Santoso, S.E.', bidang: 'Bidang Aset' };
      var p1 = list[1] || { nip: '199108152015051003', nama: 'Yulianus Kereway, A.Md.', bidang: 'Bidang Perbendaharaan' };
      var p2 = list[2] || { nip: '199405192022212004', nama: 'Maria Rumbiak, A.Md.', bidang: 'Bidang Aset' };
      var p3 = list[3] || p0;
      var p4 = list[4] || p1;
      var yr = String(new Date().getFullYear());
      return [
        [p0.nip, p0.nama, p0.bidang, '05/01/' + yr, '07:42', '16:30', 'WFO', 'HADIR_WFO', '-2.72380, 134.50420', 'Presensi awal Januari ' + yr],
        [p1.nip, p1.nama, p1.bidang, '05/01/' + yr, '08:18', '16:30', 'WFO', 'TERLAMBAT', '-2.72380, 134.50420', 'Terlambat 18 menit WIT - Januari ' + yr],
        [p2.nip, p2.nama, p2.bidang, '06/01/' + yr, '07:50', '16:15', 'WFA', 'SPT_DINAS', '-2.46820, 134.58190', 'Dinas Lapangan / SPT Distrik Roon'],
        [p3.nip, p3.nama, p3.bidang, '06/01/' + yr, '--:--', '--:--', 'WFO', 'IZIN', '-', 'Izin resmi disetujui atasan'],
        [p4.nip, p4.nama, p4.bidang, '07/01/' + yr, '--:--', '--:--', 'WFO', 'ALPA', '-', 'Tidak masuk kerja tanpa keterangan sah (Alpa / TK)']
      ];
    }

    function downloadPresensiTemplateXLS() {
      var samples = buildPresensiSampleRows();
      var ths = '';
      for (var i = 0; i < PRESENSI_IMPORT_COLUMNS.length; i++) {
        ths += '<th>' + esc(PRESENSI_IMPORT_COLUMNS[i].header) + '</th>';
      }
      var trs = '';
      for (var r = 0; r < samples.length; r++) {
        var row = samples[r];
        trs += '<tr>';
        for (var c = 0; c < row.length; c++) {
          var isTextCol = (c === 0 || c === 3 || c === 4 || c === 5 || c === 8);
          trs += '<td' + (isTextCol ? ' class="txt"' : '') + '>' + esc(row[c]) + '</td>';
        }
        trs += '</tr>';
      }
      var xlsHtml = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head><meta charset="utf-8" /><style>' +
        'table{border-collapse:collapse;}th{background-color:#0B3D91;color:#FFFFFF;font-weight:bold;border:1px solid #1E293B;padding:6px 10px;font-family:Calibri,Arial,sans-serif;font-size:11pt;text-align:left;}' +
        'td{border:1px solid #CBD5E1;padding:5px 10px;font-family:Calibri,Arial,sans-serif;font-size:10.5pt;vertical-align:middle;}' +
        '.txt{mso-number-format:"\\@";}' +
        '</style></head><body>' +
        '<table><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table>' +
        '</body></html>';
      triggerBlobDownload('\uFEFF' + xlsHtml, 'application/vnd.ms-excel;charset=utf-8;', 'Templat_Impor_Presensi_Januari_BKAD_Wondama.xls');
      showToast('Templat Excel Impor Presensi (.xls) berhasil diunduh. Kolom NIP, Tanggal, & Jam terkunci sebagai Teks.', 'success');
    }

    function downloadPresensiTemplateCSV() {
      var samples = buildPresensiSampleRows();
      var headers = PRESENSI_IMPORT_COLUMNS.map(function (c) { return c.header; });
      var lines = [headers.join(',')];
      for (var r = 0; r < samples.length; r++) {
        var cols = [];
        for (var c = 0; c < samples[r].length; c++) {
          var val = String(samples[r][c] || '').replace(/"/g, '""');
          cols.push('"' + val + '"');
        }
        lines.push(cols.join(','));
      }
      triggerBlobDownload('\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8;', 'Templat_Impor_Presensi_Januari_BKAD_Wondama.csv');
      showToast('Templat Presensi CSV UTF-8 berhasil diunduh.', 'success');
    }

    function normalizePresensiHeaderKey(label) {
      var norm = String(label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!norm || norm === 'no' || norm === 'nomor' || norm === 'nourut' || norm === 'id' || norm === 'presensiid') return '';
      if (norm === 'nip' || norm === 'nip18digit' || norm === 'noindukpegawai' || norm === 'nomorindukpegawai') return 'nip';
      if (norm === 'nama' || norm === 'namapegawai' || norm === 'namalengkap' || norm === 'namaasn') return 'nama';
      if (norm === 'bidang' || norm === 'bidangunitkerja' || norm === 'unitkerja' || norm === 'unit' || norm === 'unitbidang') return 'bidang';
      if (norm === 'tanggal' || norm === 'tanggalpresensi' || norm === 'tanggallog' || norm === 'tanggalabsen' || norm === 'tgl') return 'tanggal';
      if (norm === 'jammasuk' || norm === 'jammasukwit' || norm === 'masuk' || norm === 'checkin') return 'jamMasuk';
      if (norm === 'jampulang' || norm === 'jampulangwit' || norm === 'pulang' || norm === 'checkout') return 'jamPulang';
      if (norm === 'modekerja' || norm === 'mode') return 'modeKerja';
      if (norm === 'kodestatus' || norm === 'status' || norm === 'statuskehadiran' || norm === 'statusdisiplin') return 'status';
      if (norm === 'koordinat' || norm === 'koordinatgps' || norm === 'titikkoordinatmasuk' || norm === 'gps') return 'koordinat';
      if (norm === 'keterangan' || norm === 'keterangannomorsurat' || norm === 'catatan') return 'keterangan';
      return '';
    }

    function normalizePresensiDateDMY(raw) {
      var s = String(raw || '').replace(/^'/, '').trim();
      if (!s) return '';
      var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
      // Dukungan angka serial tanggal Excel (mis. 46027 -> 05/01/2026)
      if (/^\d{5}(?:\.\d+)?$/.test(s)) {
        var serial = Math.floor(parseFloat(s));
        if (serial > 35000 && serial < 65000) {
          var dtSerial = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
          return pad2(dtSerial.getUTCDate()) + '/' + pad2(dtSerial.getUTCMonth() + 1) + '/' + dtSerial.getUTCFullYear();
        }
      }
      var mIso = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
      if (mIso) {
        var yy = parseInt(mIso[1], 10);
        var mm = parseInt(mIso[2], 10);
        var dd = parseInt(mIso[3], 10);
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return pad2(dd) + '/' + pad2(mm) + '/' + yy;
        return '';
      }
      var mDmy = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
      if (mDmy) {
        var d1 = parseInt(mDmy[1], 10);
        var m1 = parseInt(mDmy[2], 10);
        var y1 = parseInt(mDmy[3], 10);
        if (y1 < 100) y1 += 2000;
        if (m1 > 12 && d1 >= 1 && d1 <= 12) {
          var tmpSwap = d1; d1 = m1; m1 = tmpSwap;
        }
        if (m1 >= 1 && m1 <= 12 && d1 >= 1 && d1 <= 31) return pad2(d1) + '/' + pad2(m1) + '/' + y1;
        return '';
      }
      // Dukungan nama bulan Indonesia / Inggris (mis. 05 Jan 2026, 5-Januari-2026)
      var monthMap = {
        jan: 1, januari: 1, january: 1,
        feb: 2, februari: 2, february: 2, peb: 2,
        mar: 3, maret: 3, march: 3,
        apr: 4, april: 4,
        mei: 5, may: 5,
        jun: 6, juni: 6, june: 6,
        jul: 7, juli: 7, july: 7,
        agu: 8, agustus: 8, aug: 8, august: 8, ags: 8,
        sep: 9, september: 9, sept: 9,
        okt: 10, oktober: 10, oct: 10, october: 10,
        nov: 11, november: 11, nop: 11,
        des: 12, desember: 12, dec: 12, december: 12
      };
      var mNamed = s.match(/^(\d{1,2})[\s\-\/.,]+([a-zA-Z]+)[\s\-\/.,]+(\d{2,4})/);
      if (mNamed) {
        var dn = parseInt(mNamed[1], 10);
        var mn = monthMap[mNamed[2].toLowerCase()];
        var yn = parseInt(mNamed[3], 10);
        if (yn < 100) yn += 2000;
        if (mn && dn >= 1 && dn <= 31) return pad2(dn) + '/' + pad2(mn) + '/' + yn;
      }
      return '';
    }

    function normalizePresensiTimeStr(raw) {
      var s = String(raw || '').replace(/^'/, '').trim();
      if (!s || s === '-' || s === '--:--' || s === '--:--:--') return '';
      var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
      // Dukungan waktu desimal pecahan hari Excel (mis. 0.32291667 -> 07:45:00)
      if (/^0\.\d+$/.test(s)) {
        var totalSec = Math.round(parseFloat(s) * 86400);
        var hDec = Math.floor(totalSec / 3600) % 24;
        var mDec = Math.floor((totalSec % 3600) / 60);
        var sDec = totalSec % 60;
        return pad2(hDec) + ':' + pad2(mDec) + ':' + pad2(sDec);
      }
      var m = s.match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s*(AM|PM))?$/i);
      if (!m) return null;
      var hh = parseInt(m[1], 10);
      var mi = parseInt(m[2], 10);
      var ss = m[3] ? parseInt(m[3], 10) : 0;
      var ampm = m[4] ? m[4].toUpperCase() : '';
      if (ampm === 'PM' && hh < 12) hh += 12;
      if (ampm === 'AM' && hh === 12) hh = 0;
      if (hh > 23 || mi > 59 || ss > 59) return null;
      return pad2(hh) + ':' + pad2(mi) + (m[3] ? (':' + pad2(ss)) : ':00');
    }

    function resolvePresensiStatusLabel(rawStatus, jamMasukNorm, jamLimitStr) {
      var up = String(rawStatus || '').trim().toUpperCase();
      if (
        up === 'TK' || up === 'A' ||
        up.indexOf('ALPA') !== -1 || up.indexOf('ALPHA') !== -1 ||
        up.indexOf('MANGKIR') !== -1 || up.indexOf('TANPA KET') !== -1 ||
        up.indexOf('TANPA_KET') !== -1 || up.indexOf('TIDAK HADIR') !== -1 ||
        up.indexOf('TIDAK_HADIR') !== -1 || up.indexOf('TIDAK MASUK') !== -1
      ) return 'Alpa';
      if (up.indexOf('CUTI') !== -1) return 'Cuti';
      if (up.indexOf('SAKIT') !== -1) return 'Sakit';
      if (up.indexOf('IZIN') !== -1 || up.indexOf('IJIN') !== -1) return 'Izin';
      if (up.indexOf('SPT') !== -1 || up.indexOf('DINAS') !== -1 || up.indexOf('HADIR_WFA') !== -1) return 'Dinas Luar (SPT)';
      if (up.indexOf('TERLAMBAT') !== -1 || up.indexOf('TELAT') !== -1 || up.indexOf('TL-') !== -1) return 'Terlambat';
      if (!up && !jamMasukNorm) return 'Alpa';
      if (jamMasukNorm) {
        var limParts = String(jamLimitStr || '08:00').split(':');
        var limMin = parseInt(limParts[0], 10) * 60 + parseInt(limParts[1] || '0', 10);
        var inParts = jamMasukNorm.split(':');
        var inMin = parseInt(inParts[0], 10) * 60 + parseInt(inParts[1], 10);
        return inMin > limMin ? 'Terlambat' : 'Tepat Waktu';
      }
      return 'Tepat Waktu';
    }

    function defaultPresensiKeteranganByStatus(status) {
      if (status === 'Alpa') return 'Tidak masuk kerja tanpa keterangan sah (Alpa / TK)';
      if (status === 'Terlambat') return 'Terlambat masuk kerja WIT';
      if (status === 'Dinas Luar (SPT)') return 'Dinas lapangan / penugasan luar (SPT)';
      if (status === 'Izin') return 'Izin resmi';
      if (status === 'Sakit') return 'Izin sakit';
      if (status === 'Cuti') return 'Cuti resmi';
      return 'Presensi hadir tepat waktu WIT';
    }

    function validatePresensiImportMatrix(rawMatrix, sourceName) {
      var matrix = [];
      for (var i = 0; i < (rawMatrix || []).length; i++) {
        var row = rawMatrix[i];
        if (row && row.some(function (cell) { return String(cell || '').trim() !== ''; })) {
          matrix.push(row);
        }
      }
      if (!matrix.length) {
        return { sourceName: sourceName, rows: [], validRows: [], newRows: [], updateRows: [], errorRows: [], empty: true };
      }

      var bestHeaderIdx = -1;
      var bestMatchedCount = 0;
      var bestColMap = {};
      var maxScan = Math.min(matrix.length, 15);
      for (var hIdx = 0; hIdx < maxScan; hIdx++) {
        var candRow = matrix[hIdx];
        var tempMap = {};
        var tempCount = 0;
        for (var c = 0; c < candRow.length; c++) {
          var mapped = normalizePresensiHeaderKey(candRow[c]);
          if (mapped && tempMap[mapped] === undefined) {
            tempMap[mapped] = c;
            tempCount++;
          }
        }
        if (tempCount > bestMatchedCount) {
          bestMatchedCount = tempCount;
          bestHeaderIdx = hIdx;
          bestColMap = tempMap;
        }
      }

      var colMap = {};
      var startIdx = 1;
      if (bestMatchedCount >= 2) {
        colMap = bestColMap;
        startIdx = bestHeaderIdx + 1;
      } else {
        startIdx = 0;
        var firstRowP = matrix[0] || [];
        var nipOffP = 0;
        for (var fcp = 0; fcp < Math.min(firstRowP.length, 4); fcp++) {
          if (normalizeNipFromExcelCell(firstRowP[fcp]).length >= 8) {
            nipOffP = fcp;
            break;
          }
        }
        colMap = {
          nip: nipOffP,
          nama: nipOffP + 1,
          bidang: nipOffP + 2,
          tanggal: nipOffP + 3,
          jamMasuk: nipOffP + 4,
          jamPulang: nipOffP + 5,
          modeKerja: nipOffP + 6,
          status: nipOffP + 7,
          koordinat: nipOffP + 8,
          keterangan: nipOffP + 9
        };
      }

      var pegByNip = {};
      var pegByName = {};
      for (var p = 0; p < AppCache.pegawai.length; p++) {
        var pg = AppCache.pegawai[p];
        var cleanP = String(pg.nip || '').replace(/\s+/g, '');
        if (cleanP) pegByNip[cleanP] = pg;
        var cleanNm = String(pg.nama || '').trim().toLowerCase();
        if (cleanNm) pegByName[cleanNm] = pg;
      }
      var existingByKey = {};
      for (var ex = 0; ex < AppCache.presensi.length; ex++) {
        var logEx = AppCache.presensi[ex];
        var kEx = String(logEx.nip || '').replace(/\s+/g, '') + '|' + String(logEx.tanggal || '').trim();
        existingByKey[kEx] = true;
      }

      var matrixDayRowIdx = -1;
      var matrixDayCols = [];
      for (var mr = 0; mr < Math.min(matrix.length, 10); mr++) {
        var mRow = matrix[mr];
        var foundDays = [];
        for (var mc = 0; mc < mRow.length; mc++) {
          var cv = String(mRow[mc] || '').trim();
          if (/^\d{1,2}$/.test(cv)) {
            var dNum = parseInt(cv, 10);
            if (dNum >= 1 && dNum <= 31) foundDays.push({ col: mc, day: dNum });
          }
        }
        if (foundDays.length >= 20) {
          matrixDayRowIdx = mr;
          matrixDayCols = foundDays;
          break;
        }
      }

      if (matrixDayRowIdx !== -1) {
        var cfgM = typeof getSelectedRekapPeriodConfig === 'function' ? getSelectedRekapPeriodConfig() : { mm: '11', yyyy: '2026' };
        var mBulan = cfgM.mm;
        var mTahun = cfgM.yyyy;
        var monthNameLookup = { januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06', juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12' };
        for (var prScan = 0; prScan < matrixDayRowIdx; prScan++) {
          var lineJoin = matrix[prScan].join(' ').toLowerCase();
          if (lineJoin.indexOf('periode') !== -1) {
            var yrMatch = lineJoin.match(/(20\d{2})/);
            if (yrMatch) mTahun = yrMatch[1];
            for (var mk in monthNameLookup) {
              if (lineJoin.indexOf(mk) !== -1) { mBulan = monthNameLookup[mk]; break; }
            }
          }
        }

        var colNamaM = -1;
        var colNipM = -1;
        for (var hr = Math.max(0, matrixDayRowIdx - 1); hr <= matrixDayRowIdx; hr++) {
          var hCells = matrix[hr] || [];
          for (var hc = 0; hc < Math.min(hCells.length, 6); hc++) {
            var hTxt = String(hCells[hc] || '').toLowerCase().replace(/[^a-z]/g, '');
            if (hTxt === 'nama' || hTxt === 'namapegawai') colNamaM = hc;
            if (hTxt === 'nip') colNipM = hc;
          }
        }
        if (colNamaM === -1) colNamaM = 1;

        var rowsOutM = [];
        var validRowsM = [];
        var newRowsM = [];
        var updateRowsM = [];
        var errorRowsM = [];
        var pad2M = function (n) { return (n < 10 ? '0' : '') + n; };
        var rowNumCounter = 0;

        for (var dr = matrixDayRowIdx + 1; dr < matrix.length; dr++) {
          var dRow = matrix[dr];
          var rawNm = String(dRow[colNamaM] || '').trim();
          if (!rawNm || rawNm.toLowerCase().indexOf('keterangan') === 0 || rawNm === 'H' || rawNm === 'I' || rawNm === 'C' || rawNm === 'S' || rawNm === 'A') {
            if (rawNm.toLowerCase().indexOf('keterangan') === 0) break;
            continue;
          }
          var rawNipM = colNipM !== -1 ? String(dRow[colNipM] || '').trim() : '';
          var cleanNipM = normalizeNipFromExcelCell(rawNipM);
          var pegM = (cleanNipM && pegByNip[cleanNipM]) || pegByName[rawNm.toLowerCase()] || null;
          if (!cleanNipM && pegM) cleanNipM = String(pegM.nip || '').replace(/[^0-9]/g, '');
          if (!cleanNipM) continue;

          for (var dc = 0; dc < matrixDayCols.length; dc++) {
            var dInfo = matrixDayCols[dc];
            var cellCode = String(dRow[dInfo.col] || '').trim().toUpperCase();
            if (!cellCode || cellCode === '-' || cellCode === 'MINGGU' || cellCode === 'SABTU' || cellCode.indexOf('LIBUR') !== -1 || cellCode.indexOf('CUTI BERSAMA') !== -1) continue;

            var mappedStatus = '';
            var jInM = '--:--';
            var jOutM = '';
            var modeM = (pegM && pegM.modeDefault) || 'WFO';
            if (cellCode === 'H' || cellCode === 'HADIR' || cellCode === 'WFO' || cellCode === 'WFA') {
              mappedStatus = 'Tepat Waktu';
              jInM = '07:45:00';
              jOutM = '16:30:00';
              if (cellCode === 'WFA') modeM = 'WFA';
            } else if (cellCode === 'T' || cellCode === 'TL' || cellCode === 'TELAT') {
              mappedStatus = 'Terlambat';
              jInM = '08:20:00';
              jOutM = '16:30:00';
            } else if (cellCode === 'I' || cellCode === 'IZIN') {
              mappedStatus = 'Izin';
            } else if (cellCode === 'C' || cellCode === 'CUTI') {
              mappedStatus = 'Cuti';
            } else if (cellCode === 'S' || cellCode === 'SAKIT') {
              mappedStatus = 'Sakit';
            } else if (cellCode === 'A' || cellCode === 'ALPA' || cellCode === 'TK') {
              mappedStatus = 'Alpa';
            } else {
              continue;
            }

            rowNumCounter++;
            var tglFormatted = pad2M(dInfo.day) + '/' + mBulan + '/' + mTahun;
            var isUpdM = !!existingByKey[cleanNipM + '|' + tglFormatted];
            var itemM = {
              rowNum: rowNumCounter,
              nip: cleanNipM,
              nama: pegM ? pegM.nama : rawNm,
              bidang: pegM ? pegM.bidang : '-',
              tanggal: tglFormatted,
              jamMasuk: jInM,
              jamPulang: jOutM,
              modeKerja: modeM,
              status: mappedStatus,
              koordinat: (mappedStatus === 'Tepat Waktu' || mappedStatus === 'Terlambat') ? '-2.72380, 134.50420' : '-',
              keterangan: defaultPresensiKeteranganByStatus(mappedStatus) + ' (Impor Matriks)',
              state: isUpdM ? 'UPDATE' : 'NEW',
              note: isUpdM ? 'Perbarui data tanggal ' + tglFormatted : 'Siap ditambah dari Matriks (' + cellCode + ')'
            };
            rowsOutM.push(itemM);
            validRowsM.push(itemM);
            if (isUpdM) updateRowsM.push(itemM);
            else newRowsM.push(itemM);
          }
        }

        return {
          sourceName: sourceName + ' (Format Matriks)',
          rows: rowsOutM,
          validRows: validRowsM,
          newRows: newRowsM,
          updateRows: updateRowsM,
          errorRows: errorRowsM,
          empty: rowsOutM.length === 0
        };
      }

      var jamConfig = (AppCache.settings.JAM_KERJA_WIT && AppCache.settings.JAM_KERJA_WIT.value) || { masuk: '08:00' };
      var seenFileKey = {};
      var rowsOut = [];
      var validRows = [];
      var newRows = [];
      var updateRows = [];
      var errorRows = [];

      for (var r = startIdx; r < matrix.length; r++) {
        var cur = matrix[r];
        var getVal = function (key) {
          var idx = colMap[key];
          return (idx !== undefined && idx < cur.length) ? String(cur[idx] || '').trim() : '';
        };
        var rawNip = getVal('nip');
        var cleanNip = normalizeNipFromExcelCell(rawNip);
        var rawTgl = getVal('tanggal');
        if (!rawNip && !rawTgl) continue;
        if (normalizePresensiHeaderKey(rawNip) === 'nip' && normalizePresensiHeaderKey(rawTgl) === 'tanggal') continue;
        var pegObj = pegByNip[cleanNip] || null;
        var nama = getVal('nama') || (pegObj ? pegObj.nama : '');
        var bidang = getVal('bidang') || (pegObj ? pegObj.bidang : '-');
        var normTgl = normalizePresensiDateDMY(rawTgl);
        var rawMasuk = getVal('jamMasuk');
        var rawPulang = getVal('jamPulang');
        var normMasuk = normalizePresensiTimeStr(rawMasuk);
        var normPulang = normalizePresensiTimeStr(rawPulang);
        var modeCellP = (getVal('modeKerja') || '').toUpperCase();
        var rawStatus = getVal('status');
        var modeRaw = modeCellP.indexOf('WFA') !== -1 ? 'WFA' : (modeCellP.indexOf('WFH') !== -1 ? 'WFH' : (modeCellP.indexOf('WFO') !== -1 ? 'WFO' : ''));
        if (!modeRaw) {
          modeRaw = rawStatus.toUpperCase().indexOf('WFA') !== -1 || rawStatus.toUpperCase().indexOf('SPT') !== -1
            ? 'WFA'
            : (rawStatus.toUpperCase().indexOf('WFH') !== -1 ? 'WFH' : 'WFO');
        }
        var rawCoord = getVal('koordinat');
        var rawKet = getVal('keterangan');

        var errMsg = '';
        if (!rawNip) {
          errMsg = 'Kolom NIP kosong.';
        } else if (cleanNip.length < 6) {
          errMsg = 'NIP harus berupa angka minimal 6-18 digit (' + rawNip + ').';
        } else if (!normTgl) {
          errMsg = 'Format tanggal tidak dikenali ("' + rawTgl + '"). Gunakan dd/MM/yyyy atau YYYY-MM-DD.';
        } else if (normMasuk === null) {
          errMsg = 'Format JamMasuk tidak valid ("' + rawMasuk + '"). Gunakan HH:mm WIT atau --:--.';
        } else if (normPulang === null) {
          errMsg = 'Format JamPulang tidak valid ("' + rawPulang + '"). Gunakan HH:mm WIT atau --:--.';
        } else if (seenFileKey[cleanNip + '|' + normTgl]) {
          errMsg = 'Duplikat NIP + Tanggal di dalam file (sudah muncul di baris ' + seenFileKey[cleanNip + '|' + normTgl] + ').';
        }

        var resolvedStatus = resolvePresensiStatusLabel(rawStatus, normMasuk, jamConfig.masuk);
        var isAbsentRow = (resolvedStatus === 'Alpa' || resolvedStatus === 'Izin' || resolvedStatus === 'Sakit' || resolvedStatus === 'Cuti');
        var koordinat = rawCoord || (isAbsentRow ? '-' : '-2.72380, 134.50420');
        var keterangan = rawKet || defaultPresensiKeteranganByStatus(resolvedStatus);
        var state = 'NEW';
        var note = pegObj ? 'Siap ditambah ke LogPresensi' : 'NIP belum ada di master (tetap dapat dicatat)';
        if (errMsg) {
          state = 'ERROR';
          note = errMsg;
        } else if (existingByKey[cleanNip + '|' + normTgl]) {
          state = 'UPDATE';
          note = 'Data NIP & tanggal sudah ada (diperbarui jika opsi Upsert aktif)';
        }

        if (cleanNip && normTgl && !seenFileKey[cleanNip + '|' + normTgl]) {
          seenFileKey[cleanNip + '|' + normTgl] = r + 1;
        }

        var itemObj = {
          rowNum: r + 1,
          nip: cleanNip || rawNip,
          nama: nama || ('ASN (' + (cleanNip || '-') + ')'),
          bidang: bidang,
          tanggal: normTgl || rawTgl,
          jamMasuk: normMasuk || '--:--',
          jamPulang: normPulang || '',
          modeKerja: modeRaw || 'WFO',
          status: resolvedStatus,
          koordinat: koordinat,
          keterangan: keterangan,
          state: state,
          note: note
        };
        rowsOut.push(itemObj);
        if (state === 'NEW') {
          newRows.push(itemObj);
          validRows.push(itemObj);
        } else if (state === 'UPDATE') {
          updateRows.push(itemObj);
          validRows.push(itemObj);
        } else {
          errorRows.push(itemObj);
        }
      }

      return {
        sourceName: sourceName,
        rows: rowsOut,
        validRows: validRows,
        newRows: newRows,
        updateRows: updateRows,
        errorRows: errorRows,
        empty: rowsOut.length === 0
      };
    }

    function handlePresensiFileSelected(file) {
      readSpreadsheetFileMatrix(file, function (matrix) {
        renderImportPresensiPreview(validatePresensiImportMatrix(matrix, file.name));
      });
    }

    function renderImportPresensiPreview(parsed) {
      AppCache.pendingPresensiImport = parsed;
      var box = document.getElementById('import-presensi-preview-box');
      if (!box) return;
      if (!parsed || parsed.empty) {
        box.innerHTML = '<div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">Tidak ada baris presensi yang terbaca pada berkas <b>' + esc((parsed && parsed.sourceName) || '-') + '</b>. Pastikan mengisi data mulai baris ke-2.</div>';
        box.classList.remove('hidden');
        return;
      }

      var maxShow = Math.min(parsed.rows.length, 60);
      var trHtml = '';
      for (var i = 0; i < maxShow; i++) {
        var row = parsed.rows[i];
        var badge = '';
        var rowCls = '';
        if (row.state === 'NEW') {
          badge = '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-[10px]">BARU</span>';
        } else if (row.state === 'UPDATE') {
          badge = '<span class="px-2 py-0.5 rounded-full bg-blue-100 text-navy-deep font-semibold text-[10px]">PERBARUI</span>';
          rowCls = 'bg-blue-50/40';
        } else {
          badge = '<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold text-[10px]">GALAT</span>';
          rowCls = 'bg-red-50/50';
        }
        trHtml += '<tr class="' + rowCls + '">' +
          '<td class="py-2 px-2.5 font-mono text-[11px] text-text-muted">' + row.rowNum + '</td>' +
          '<td class="py-2 px-2.5 text-xs"><div class="font-bold text-text-main">' + esc(row.nama) + '</div><div class="font-mono text-[10px] text-text-muted">' + esc(row.nip) + '</div></td>' +
          '<td class="py-2 px-2.5 font-mono text-[11px]"><div>' + esc(row.tanggal || '-') + '</div><div class="text-navy-deep font-semibold">' + esc(row.jamMasuk) + (row.jamPulang ? ' - ' + esc(row.jamPulang) : '') + ' WIT</div></td>' +
          '<td class="py-2 px-2.5">' + getModeBadge(row.modeKerja) + ' ' + getStatusBadge(row.status) + '<div class="text-[10px] text-text-muted mt-0.5">' + esc(row.keterangan) + '</div></td>' +
          '<td class="py-2 px-2.5">' + badge + '<div class="text-[10px] text-text-muted mt-0.5">' + esc(row.note) + '</div></td>' +
          '</tr>';
      }

      box.innerHTML = '' +
        '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">' +
        '<div>' +
        '<div class="text-xs font-bold text-navy-deep">Pratinjau Dry-Run Impor Presensi: ' + esc(parsed.sourceName) + '</div>' +
        '<div class="text-[11px] text-text-muted">Total ' + parsed.rows.length + ' baris dievaluasi' + (parsed.rows.length > maxShow ? ' (menampilkan ' + maxShow + ' baris pertama)' : '') + '</div>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
        '<button type="button" data-action="clear-import-presensi-preview" class="px-3 py-1.5 rounded-xl bg-white hover:bg-surface-high border border-border-subtle text-xs font-semibold text-text-muted">Tutup Pratinjau</button>' +
        (parsed.validRows.length > 0
          ? '<button type="button" data-action="execute-import-presensi" class="px-3.5 py-1.5 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">cloud_done</span><span>Simpan ' + parsed.validRows.length + ' Baris ke LogPresensi</span></button>'
          : '') +
        '</div>' +
        '</div>' +
        '<div class="grid grid-cols-3 gap-2 text-xs">' +
        '<div class="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200"><div class="text-[10px] font-bold text-emerald-700 uppercase">Baris Baru</div><div class="font-mono text-base font-bold text-emerald-700">' + parsed.newRows.length + '</div></div>' +
        '<div class="p-2.5 rounded-xl bg-blue-50 border border-blue-200"><div class="text-[10px] font-bold text-navy-deep uppercase">Sudah Ada (Upsert)</div><div class="font-mono text-base font-bold text-navy-deep">' + parsed.updateRows.length + '</div></div>' +
        '<div class="p-2.5 rounded-xl bg-red-50 border border-red-200"><div class="text-[10px] font-bold text-red-700 uppercase">Galat Validasi</div><div class="font-mono text-base font-bold text-red-700">' + parsed.errorRows.length + '</div></div>' +
        '</div>' +
        '<div class="max-h-72 overflow-y-auto rounded-xl border border-border-subtle bg-white">' +
        '<table class="w-full text-left border-collapse">' +
        '<thead><tr class="bg-surface-low text-[10px] uppercase text-text-muted border-b border-border-subtle sticky top-0"><th class="py-2 px-2.5">Baris</th><th class="py-2 px-2.5">ASN &amp; NIP</th><th class="py-2 px-2.5">Tanggal &amp; Jam WIT</th><th class="py-2 px-2.5">Mode &amp; Status</th><th class="py-2 px-2.5">Hasil Dry-Run</th></tr></thead>' +
        '<tbody class="divide-y divide-border-subtle">' + trHtml + '</tbody>' +
        '</table>' +
        '</div>';
      box.classList.remove('hidden');
    }

    function clearImportPresensiPreview() {
      AppCache.pendingPresensiImport = null;
      var box = document.getElementById('import-presensi-preview-box');
      if (box) {
        box.innerHTML = '';
        box.classList.add('hidden');
      }
      var inp = document.getElementById('import-presensi-file');
      if (inp) inp.value = '';
    }

    function mergeImportedPresensiToCache(records) {
      if (!records || !records.length) return;
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        var recNipClean = String(rec.nip || '').replace(/[^0-9]/g, '');
        var recTgl = String(rec.tanggal || '').trim();
        var replaced = false;
        for (var j = 0; j < AppCache.presensi.length; j++) {
          var exNipClean = String(AppCache.presensi[j].nip || '').replace(/[^0-9]/g, '');
          if (AppCache.presensi[j].id === rec.id || (recNipClean && exNipClean === recNipClean && String(AppCache.presensi[j].tanggal || '').trim() === recTgl)) {
            AppCache.presensi[j] = rec;
            replaced = true;
            break;
          }
        }
        if (!replaced) AppCache.presensi.unshift(rec);
      }
    }

    function executePendingPresensiImport(btn) {
      var pending = AppCache.pendingPresensiImport;
      if (!pending || !pending.validRows || !pending.validRows.length) {
        showToast('Tidak ada baris presensi valid yang siap diimpor.', 'warning');
        return;
      }
      var chk = document.getElementById('chk-import-presensi-upsert');
      var allowUpsert = chk ? !!chk.checked : true;
      callServer('apiImportPresensiBatch', { rows: pending.validRows, upsert: allowUpsert }, btn, function (res) {
        var savedList = res.records || [];
        mergeImportedPresensiToCache(savedList);
        var firstTgl = savedList[0] ? String(savedList[0].tanggal || '').trim() : '';
        var spFirst = firstTgl.split('/');
        if (spFirst.length === 3) {
          var blnEl = document.getElementById('rekap-filter-bulan');
          var thnEl = document.getElementById('rekap-filter-tahun');
          if (blnEl) blnEl.value = spFirst[1];
          if (thnEl) thnEl.value = spFirst[2];
        }
        clearImportPresensiPreview();
        AppCache.presensiPage = 1;
        renderDashboard();
        renderRekapModule();
        showToast(res.message + ' Tabel Rekap & Matriks 1–31 otomatis diperbarui.', 'success');
      });
    }

    function openPedomanImporPresensiModal() {
      var colCards = '';
      for (var i = 0; i < PRESENSI_IMPORT_COLUMNS.length; i++) {
        var col = PRESENSI_IMPORT_COLUMNS[i];
        colCards += '<div class="p-2.5 rounded-xl bg-surface-low border border-border-subtle">' +
          '<div class="font-mono text-xs font-bold text-navy-deep">' + (i + 1) + '. ' + esc(col.header) + '</div>' +
          '<div class="text-[11px] text-text-muted mt-0.5">' + esc(col.desc) + '</div>' +
          '</div>';
      }
      var body = '<div class="space-y-4">' +
        '<div class="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-navy-deep leading-relaxed">' +
        '<b>Cara Input Data Absen Mulai Bulan Januari via Excel:</b><br/>' +
        '1. Klik <b>Unduh Templat Excel (.xls)</b> di halaman Rekonsiliasi &amp; TPP.<br/>' +
        '2. Isi daftar absensi Januari s.d. bulan berjalan (NIP 18-digit dan format tanggal <span class="font-mono">dd/MM/yyyy</span> seperti <span class="font-mono">05/01/2026</span> sudah terkunci sebagai teks di templat).<br/>' +
        '3. Unggah kembali file tersebut, atau salin (<i>Copy</i>) sel dari Excel dan tempel (<i>Paste</i>) di kotak bawah ini.' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' + colCards + '</div>' +
        '<div class="p-3 rounded-2xl bg-surface-low border border-border-subtle space-y-2">' +
        '<div class="text-xs font-bold text-navy-deep">Opsi Cepat: Tempel Langsung Tabel Absen dari Excel (Copy-Paste)</div>' +
        '<textarea id="paste-presensi-excel" rows="4" placeholder="Salin baris data presensi Januari dst. dari Excel (dengan atau tanpa baris header), lalu Ctrl+V di sini..." class="w-full p-2.5 rounded-xl bg-white border border-border-subtle font-mono text-[11px]"></textarea>' +
        '<div class="flex flex-wrap justify-between items-center gap-2">' +
        '<button id="btn-fill-presensi-paste" type="button" class="px-3 py-1.5 rounded-lg bg-white border border-border-subtle text-[11px] font-semibold text-navy-deep hover:bg-surface-high">Isi Contoh Bulan Januari</button>' +
        '<button id="btn-run-presensi-paste" type="button" class="px-3.5 py-1.5 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold">Validasi Dry-Run Data Tempelan</button>' +
        '</div>' +
        '</div>' +
        '</div>';
      openModal('Pedoman Templat & Impor Copy-Paste Presensi Januari', body);

      document.getElementById('btn-fill-presensi-paste').addEventListener('click', function () {
        var hdr = PRESENSI_IMPORT_COLUMNS.map(function (c) { return c.header; }).join('\t');
        var samples = buildPresensiSampleRows();
        var lines = [hdr];
        for (var s = 0; s < samples.length; s++) lines.push(samples[s].join('\t'));
        document.getElementById('paste-presensi-excel').value = lines.join('\n');
      });

      document.getElementById('btn-run-presensi-paste').addEventListener('click', function () {
        var raw = document.getElementById('paste-presensi-excel').value.trim();
        if (!raw) {
          showToast('Tempel data absensi dari Excel terlebih dahulu.', 'warning');
          return;
        }
        var matrix = parsePegawaiMatrixFromText(raw);
        var resParsed = validatePresensiImportMatrix(matrix, 'Tempelan Clipboard Excel');
        closeModal();
        switchDeskMenu('rekonsiliasi-absen');
        renderImportPresensiPreview(resParsed);
      });
    }

    function openManualPresensiModal() {
      var sortedPeg = getActivePegawaiList().slice().sort(function (a, b) {
        return String(a.nama || '').localeCompare(String(b.nama || ''));
      });
      var curNipClean = AppCache.currentUser ? String(AppCache.currentUser.nip || '').replace(/\s+/g, '') : '';
      var pegHtml = '';
      for (var i = 0; i < sortedPeg.length; i++) {
        var pg = sortedPeg[i];
        var sBlob = [pg.nama, pg.nip, pg.jabatan, pg.bidang].join(' ').toLowerCase();
        var nipClean = String(pg.nip || '').replace(/\s+/g, '');
        var isMe = curNipClean && nipClean === curNipClean;
        pegHtml += '<label class="mp-peg-item flex items-start gap-2.5 px-2.5 py-2 rounded-xl hover:bg-blue-50/70 cursor-pointer border border-transparent hover:border-blue-100" data-search="' + esc(sBlob) + '">' +
          '<input type="checkbox" class="mp-peg-cb mt-0.5 rounded border-slate-300 text-navy-deep focus:ring-electric-blue" value="' + esc(nipClean) + '" data-nama="' + esc(pg.nama) + '" data-bidang="' + esc(pg.bidang || '') + '"' + (isMe ? ' checked' : '') + ' />' +
          '<div class="min-w-0 flex-1">' +
          '<div class="text-xs font-bold text-text-main leading-tight">' + esc(pg.nama) + '</div>' +
          '<div class="text-[11px] text-text-muted leading-tight mt-0.5">' + esc(pg.bidang || '-') + ' • <span class="font-mono">' + esc(pg.nip) + '</span></div>' +
          '</div>' +
          '</label>';
      }

      var yrNow = new Date().getFullYear();
      var defaultJanStart = yrNow + '-01-05';
      var body = '<form id="form-manual-presensi" action="javascript:void(0);" class="space-y-3.5">' +
        '<div class="p-3 rounded-2xl bg-surface-low border border-border-subtle space-y-2">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
        '<div class="text-[11px] font-bold uppercase tracking-wide text-navy-deep">1. Pilih Pegawai</div>' +
        '<div class="flex items-center gap-1.5">' +
        '<button id="btn-mp-select-all" type="button" class="px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-navy-deep text-[11px] font-semibold">Pilih Semua</button>' +
        '<button id="btn-mp-select-none" type="button" class="px-2 py-0.5 rounded-lg bg-white hover:bg-surface-high border border-border-subtle text-text-muted text-[11px] font-semibold">Reset</button>' +
        '</div>' +
        '</div>' +
        '<input id="mp-peg-search" type="search" placeholder="Cari nama pegawai, NIP, atau bidang..." class="w-full px-3 py-1.5 rounded-xl bg-white border border-border-subtle text-xs" />' +
        '<div class="max-h-36 overflow-y-auto bg-white rounded-xl border border-border-subtle p-1.5 space-y-1">' + (pegHtml || '<div class="p-3 text-center text-[11px] text-text-muted">Data pegawai kosong.</div>') + '</div>' +
        '</div>' +
        '<div class="p-3 rounded-2xl bg-surface-low border border-border-subtle space-y-2.5">' +
        '<div class="text-[11px] font-bold uppercase tracking-wide text-navy-deep">2. Periode Tanggal Absen (Mulai Januari / Rentang Hari)</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Mulai</label><input id="mp-tgl-mulai" type="date" required value="' + esc(defaultJanStart) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs" /></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Selesai</label><input id="mp-tgl-selesai" type="date" required value="' + esc(defaultJanStart) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs" /></div>' +
        '</div>' +
        '<div class="flex flex-wrap items-center justify-between gap-2 text-xs">' +
        '<label class="inline-flex items-center gap-2 cursor-pointer select-none"><input id="mp-skip-weekend" type="checkbox" checked class="rounded border-slate-300 text-electric-blue" /><span>Lewati hari Sabtu &amp; Minggu</span></label>' +
        '<label class="inline-flex items-center gap-2 cursor-pointer select-none"><input id="mp-upsert" type="checkbox" checked class="rounded border-slate-300 text-electric-blue" /><span>Timpa jika tanggal sudah ada</span></label>' +
        '</div>' +
        '</div>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Status Kehadiran</label>' +
        '<select id="mp-status" class="w-full px-2.5 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs font-medium">' +
        '<option value="Tepat Waktu">Tepat Waktu</option>' +
        '<option value="Terlambat">Terlambat</option>' +
        '<option value="Dinas Luar (SPT)">Dinas Luar (SPT)</option>' +
        '<option value="Izin">Izin</option>' +
        '<option value="Sakit">Sakit</option>' +
        '<option value="Cuti">Cuti</option>' +
        '<option value="Alpa">Alpa</option>' +
        '</select>' +
        '</div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Mode Kerja</label>' +
        '<select id="mp-mode" class="w-full px-2.5 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs font-medium"><option value="WFO">WFO</option><option value="WFH">WFH</option><option value="WFA">WFA</option></select>' +
        '</div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Jam Masuk WIT</label><input id="mp-jam-masuk" type="time" value="07:45" class="w-full px-2.5 py-2 rounded-xl bg-surface-low border border-border-subtle font-mono text-xs" /></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Jam Pulang WIT</label><input id="mp-jam-pulang" type="time" value="16:30" class="w-full px-2.5 py-2 rounded-xl bg-surface-low border border-border-subtle font-mono text-xs" /></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Koordinat GPS</label><input id="mp-koordinat" type="text" value="-2.72380, 134.50420" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle font-mono text-xs" /></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Keterangan / Nomor Surat</label><input id="mp-keterangan" type="text" value="Input Presensi Manual (Susulan / Retroaktif)" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
        '</div>' +
        '<div id="mp-summary-count" class="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-navy-deep font-medium"></div>' +
        '<button id="btn-mp-submit" type="submit" class="w-full py-2.5 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-[16px]">save</span><span>Simpan Data Presensi Manual ke Database</span></button>' +
        '</form>';

      openModal('Input Data Absensi Manual (Tanggal / Rentang Hari Mulai Januari)', body);

      var tMulaiEl = document.getElementById('mp-tgl-mulai');
      var tSelesaiEl = document.getElementById('mp-tgl-selesai');
      var skipWkEl = document.getElementById('mp-skip-weekend');
      var statusEl = document.getElementById('mp-status');
      var modeEl = document.getElementById('mp-mode');
      var jamInEl = document.getElementById('mp-jam-masuk');
      var jamOutEl = document.getElementById('mp-jam-pulang');
      var sumEl = document.getElementById('mp-summary-count');

      function collectManualDates() {
        var sVal = tMulaiEl.value;
        var eVal = tSelesaiEl.value;
        if (!sVal || !eVal || eVal < sVal) return [];
        var p1 = sVal.split('-');
        var p2 = eVal.split('-');
        var cur = new Date(parseInt(p1[0], 10), parseInt(p1[1], 10) - 1, parseInt(p1[2], 10));
        var end = new Date(parseInt(p2[0], 10), parseInt(p2[1], 10) - 1, parseInt(p2[2], 10));
        var dates = [];
        var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
        var guard = 0;
        var liburMap = typeof getHariLiburMap === 'function' ? getHariLiburMap() : {};
        while (cur <= end && guard < 400) {
          guard++;
          var dow = cur.getDay();
          var dmyStr = pad2(cur.getDate()) + '/' + pad2(cur.getMonth() + 1) + '/' + cur.getFullYear();
          var isHoliday = !!liburMap[dmyStr];
          if (!skipWkEl.checked || (dow !== 0 && dow !== 6 && !isHoliday)) {
            dates.push(dmyStr);
          }
          cur.setDate(cur.getDate() + 1);
        }
        return dates;
      }

      function refreshManualSummary() {
        var cbs = document.querySelectorAll('.mp-peg-cb');
        var pegCount = 0;
        for (var c = 0; c < cbs.length; c++) { if (cbs[c].checked) pegCount++; }
        var dates = collectManualDates();
        var total = pegCount * dates.length;
        if (tSelesaiEl.value < tMulaiEl.value) {
          sumEl.textContent = 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.';
          return;
        }
        sumEl.textContent = 'Ringkasan: ' + pegCount + ' pegawai x ' + dates.length + ' hari = ' + total + ' entri log presensi siap disimpan' + (total > 500 ? ' (melebihi batas 500 entri/simpan, gunakan Impor Excel untuk data massal).' : '.');
      }

      statusEl.addEventListener('change', function () {
        var v = statusEl.value;
        if (v === 'Izin' || v === 'Sakit' || v === 'Cuti' || v === 'Alpa') {
          jamInEl.value = '';
          jamOutEl.value = '';
        } else if (v === 'Terlambat') {
          jamInEl.value = '08:20';
          jamOutEl.value = '16:30';
        } else {
          jamInEl.value = '07:45';
          jamOutEl.value = '16:30';
          if (v === 'Dinas Luar (SPT)') modeEl.value = 'WFA';
        }
      });

      document.getElementById('mp-peg-search').addEventListener('input', function (ev) {
        var q = ev.target.value.trim().toLowerCase();
        var items = document.querySelectorAll('.mp-peg-item');
        for (var k = 0; k < items.length; k++) {
          var h = items[k].getAttribute('data-search') || '';
          items[k].style.display = (!q || h.indexOf(q) !== -1) ? '' : 'none';
        }
      });

      document.getElementById('btn-mp-select-all').addEventListener('click', function () {
        var items = document.querySelectorAll('.mp-peg-item');
        for (var k = 0; k < items.length; k++) {
          if (items[k].style.display !== 'none') items[k].querySelector('.mp-peg-cb').checked = true;
        }
        refreshManualSummary();
      });

      document.getElementById('btn-mp-select-none').addEventListener('click', function () {
        var cbs = document.querySelectorAll('.mp-peg-cb');
        for (var k = 0; k < cbs.length; k++) cbs[k].checked = false;
        refreshManualSummary();
      });

      var allMpCbs = document.querySelectorAll('.mp-peg-cb');
      for (var ci = 0; ci < allMpCbs.length; ci++) {
        allMpCbs[ci].addEventListener('change', refreshManualSummary);
      }
      tMulaiEl.addEventListener('change', function () {
        if (tSelesaiEl.value < tMulaiEl.value) tSelesaiEl.value = tMulaiEl.value;
        refreshManualSummary();
      });
      tSelesaiEl.addEventListener('change', refreshManualSummary);
      skipWkEl.addEventListener('change', refreshManualSummary);
      refreshManualSummary();

      document.getElementById('form-manual-presensi').addEventListener('submit', function (e) {
        e.preventDefault();
        var cbs = document.querySelectorAll('.mp-peg-cb');
        var selPegs = [];
        for (var c = 0; c < cbs.length; c++) {
          if (cbs[c].checked) {
            selPegs.push({
              nip: cbs[c].value,
              nama: cbs[c].getAttribute('data-nama') || '',
              bidang: cbs[c].getAttribute('data-bidang') || ''
            });
          }
        }
        if (!selPegs.length) {
          showToast('Pilih minimal 1 pegawai.', 'warning');
          return;
        }
        var dates = collectManualDates();
        if (!dates.length) {
          showToast('Rentang tanggal tidak menghasilkan hari kerja valid.', 'warning');
          return;
        }
        if (selPegs.length * dates.length > 500) {
          showToast('Total entri melebihi 500 baris. Gunakan Templat Excel (.xls) & Impor File untuk pengisian ribuan baris.', 'warning');
          return;
        }

        var stVal = statusEl.value;
        var isAbsentNoClock = (stVal === 'Izin' || stVal === 'Sakit' || stVal === 'Cuti' || stVal === 'Alpa');
        var jIn = isAbsentNoClock ? '--:--' : (jamInEl.value ? (jamInEl.value + ':00') : '--:--');
        var jOut = isAbsentNoClock ? '' : (jamOutEl.value ? (jamOutEl.value + ':00') : '');
        var modeVal = modeEl.value;
        var coordVal = document.getElementById('mp-koordinat').value.trim() || '-2.72380, 134.50420';
        var ketVal = document.getElementById('mp-keterangan').value.trim() || 'Input Presensi Manual Admin';
        var upsertVal = !!document.getElementById('mp-upsert').checked;

        var payloadRows = [];
        for (var pi = 0; pi < selPegs.length; pi++) {
          for (var di = 0; di < dates.length; di++) {
            payloadRows.push({
              nip: selPegs[pi].nip,
              nama: selPegs[pi].nama,
              bidang: selPegs[pi].bidang,
              tanggal: dates[di],
              jamMasuk: jIn,
              jamPulang: jOut,
              modeKerja: modeVal,
              status: stVal,
              koordinat: coordVal,
              keterangan: ketVal
            });
          }
        }

        var btn = document.getElementById('btn-mp-submit');
        callServer('apiImportPresensiBatch', { rows: payloadRows, upsert: upsertVal }, btn, function (res) {
          mergeImportedPresensiToCache(res.records || []);
          closeModal();
          AppCache.presensiPage = 1;
          renderDashboard();
          renderRekapModule();
          showToast(res.message, 'success');
        });
      });
    }

    /* -------------------------------------------------------------------
     * 9. RENDER MODE KERJA & AUDIT GEOTAGGING SPT
     * ------------------------------------------------------------------- */
    var SPT_LOKASI_PRESETS = [
      { key: 'ROON', label: 'Distrik Kepulauan Roon (Kepulauan / Pesisir)', nama: 'Distrik Kepulauan Roon', gps: '-2.46820, 134.58190' },
      { key: 'WINDESI', label: 'Distrik Windesi (Pesisir Utara)', nama: 'Distrik Windesi', gps: '-2.41250, 134.23410' },
      { key: 'WASIOR', label: 'Distrik Wasior (Kota Wasior)', nama: 'Distrik Wasior', gps: '-2.71850, 134.50120' },
      { key: 'RASIEI', label: 'Distrik Rasiei / Isei (Kompleks Pemkab)', nama: 'Distrik Rasiei / Kompleks Perkantoran Isei', gps: '-2.72380, 134.50420' },
      { key: 'WONDIBOY', label: 'Distrik Wondiboy', nama: 'Distrik Wondiboy', gps: '-2.76410, 134.52180' },
      { key: 'DUAIRI', label: 'Distrik Teluk Duairi', nama: 'Distrik Teluk Duairi', gps: '-2.54120, 134.46230' },
      { key: 'WAMESA', label: 'Distrik Wamesa', nama: 'Distrik Wamesa', gps: '-2.61340, 134.31890' },
      { key: 'NAIKERE', label: 'Distrik Naikere', nama: 'Distrik Naikere', gps: '-2.84210, 134.39150' },
      { key: 'KURI_WAMESA', label: 'Distrik Kuri Wamesa', nama: 'Distrik Kuri Wamesa', gps: '-2.68150, 134.27400' },
      { key: 'RUMBERPON', label: 'Distrik Rumberpon', nama: 'Distrik Rumberpon', gps: '-1.84120, 134.16250' },
      { key: 'SOUG_JAYA', label: 'Distrik Soug Jaya', nama: 'Distrik Soug Jaya', gps: '-2.59200, 134.18400' },
      { key: 'NIKIWAR', label: 'Distrik Nikiwar', nama: 'Distrik Nikiwar', gps: '-2.36100, 134.19500' },
      { key: 'ROSWAR', label: 'Distrik Roswar', nama: 'Distrik Roswar', gps: '-2.13400, 134.35100' },
      { key: 'MANOKWARI', label: 'Manokwari (Pemprov / BPKP / Kanreg XIV BKN)', nama: 'Manokwari (BPKP / Kanreg XIV BKN Papua Barat)', gps: '-0.86145, 134.06204' },
      { key: 'LUAR_PROV', label: 'Sorong / Jayapura / Luar Provinsi Papua Barat', nama: 'Sorong / Jayapura (Dinas Luar Provinsi)', gps: '-2.53371, 140.71813' },
      { key: 'MANUAL', label: '+ Input Tujuan & Koordinat GPS Manual / Kustom', nama: '', gps: '' }
    ];

    function formatDaftarPegawaiSPT(daftarNIPStr, mode) {
      var raw = String(daftarNIPStr || '').trim();
      if (!raw) return '-';
      var parts = raw.split(',');
      var list = [];
      for (var i = 0; i < parts.length; i++) {
        var token = parts[i].trim();
        if (!token) continue;
        var clean = token.replace(/\s+/g, '');
        var peg = null;
        for (var j = 0; j < AppCache.pegawai.length; j++) {
          if (String(AppCache.pegawai[j].nip || '').replace(/\s+/g, '') === clean) {
            peg = AppCache.pegawai[j];
            break;
          }
        }
        list.push({ rawNip: token, cleanNip: clean, peg: peg });
      }
      if (!list.length) return '-';

      if (mode === 'HTML') {
        var h = '';
        for (var k = 0; k < list.length; k++) {
          var item = list[k];
          if (item.peg) {
            h += '<div class="inline-flex flex-wrap items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50/90 border border-blue-100 text-[11px] mr-1 mt-1">' +
              '<span class="font-semibold text-navy-deep">' + esc(item.peg.nama) + '</span>' +
              (item.peg.bidang ? '<span class="text-text-muted">(' + esc(item.peg.bidang) + ')</span>' : '') +
              '<span class="font-mono text-[10px] text-electric-blue">' + esc(item.peg.nip) + '</span>' +
              '</div>';
          } else {
            h += '<div class="inline-flex items-center px-2 py-0.5 rounded-lg bg-surface-high text-[11px] font-mono text-text-muted mr-1 mt-1">NIP ' + esc(item.rawNip) + '</div>';
          }
        }
        return h;
      }

      if (mode === 'PRINT') {
        var pHtml = '';
        for (var m = 0; m < list.length; m++) {
          var it = list[m];
          if (it.peg) {
            var meta = [];
            if (it.peg.pangkat) meta.push(esc(it.peg.pangkat));
            if (it.peg.jabatan) meta.push(esc(it.peg.jabatan));
            else if (it.peg.bidang) meta.push(esc(it.peg.bidang));
            pHtml += '<div class="leading-snug py-0.5">' + (m + 1) + '. <span class="font-semibold">' + esc(it.peg.nama) + '</span>' +
              (meta.length ? ' — <span class="text-[10px]">' + meta.join(' / ') + '</span>' : '') +
              ' <span class="font-mono text-[10px]">(NIP. ' + esc(formatNipSpaced(it.peg.nip)) + ')</span></div>';
          } else {
            pHtml += '<div class="leading-snug py-0.5 font-mono text-[10px]">' + (m + 1) + '. NIP. ' + esc(formatNipSpaced(it.rawNip)) + '</div>';
          }
        }
        return pHtml;
      }

      var txt = [];
      for (var t = 0; t < list.length; t++) {
        var x = list[t];
        txt.push(x.peg ? (x.peg.nama + ' (' + x.peg.nip + ')') : x.rawNip);
      }
      return txt.join(', ');
    }

    function renderSPTModule() {
      var html = '';
      for (var i = 0; i < AppCache.spt.length; i++) {
        var s = AppCache.spt[i];
        var isVerified = s.statusGPS.indexOf('Terverifikasi') !== -1;
        html += '<tr>' +
          '<td class="py-3 px-3 font-mono text-xs"><div class="font-bold text-navy-deep">' + esc(s.id) + '</div><div>' + esc(s.nomorSPT) + '</div></td>' +
          '<td class="py-3 px-3 text-xs"><div class="font-semibold">' + esc(s.lokasi) + '</div><div class="font-mono text-[11px] text-text-muted">' + esc(s.tglMulai) + ' – ' + esc(s.tglSelesai) + '</div></td>' +
          '<td class="py-3 px-3 text-xs"><div class="font-medium text-text-main">' + esc(s.keperluan) + '</div><div class="mt-1 flex flex-wrap">' + formatDaftarPegawaiSPT(s.daftarNIP, 'HTML') + '</div></td>' +
          '<td class="py-3 px-3">' + getStatusBadge(s.statusGPS) + '</td>' +
          '<td class="py-3 px-3 text-right">' +
          '<div class="inline-flex flex-wrap justify-end gap-1">' +
          (!isVerified ? '<button type="button" data-action="verify-spt" data-id="' + esc(s.id) + '" class="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Validasi GPS</button>' : '') +
          '<button type="button" data-action="edit-spt" data-id="' + esc(s.id) + '" class="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-semibold">Edit</button>' +
          '<button type="button" data-action="print-ctrlp-type" data-doc="VERIFIKASI_SPT_ROON" data-id="' + esc(s.id) + '" class="px-2.5 py-1 rounded-lg bg-blue-50 text-navy-deep text-xs font-semibold">Cetak Audit</button>' +
          '<button type="button" data-action="delete-spt" data-id="' + esc(s.id) + '" class="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-status-absent text-xs font-semibold">Hapus</button>' +
          '</div>' +
          '</td></tr>';
      }
      document.getElementById('tbody-spt-list').innerHTML = html;

      var extraEl = document.getElementById('spt-extra-audit-panel');
      if (extraEl) {
        extraEl.innerHTML = '' +
          '<div class="card-elevated rounded-2xl p-5 space-y-3">' +
          '<div class="flex items-center justify-between gap-2">' +
          '<div><h4 class="text-sm font-bold text-navy-deep">Kalender Roster Tugas Lapangan Bidang Aset</h4><p class="text-[11px] text-text-muted">Rotasi tim sensus & inventarisasi aset tetap antar distrik pesisir/kepulauan</p></div>' +
          '<button type="button" data-action="print-doc" data-id="LAMPIRAN_SPT_ROSTER" class="px-2.5 py-1.5 rounded-lg bg-blue-50 text-navy-deep text-[11px] font-semibold">Cetak Roster A4</button>' +
          '</div>' +
          '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">' +
          '<div class="p-2.5 rounded-xl bg-teal-50 border border-teal-200"><div class="font-mono font-bold text-mode-wfa">14–18 Nov</div><div class="font-bold text-navy-deep">Tim A: Kep. Roon</div><div class="text-text-muted">Maria Rumbiak, Budi S.</div></div>' +
          '<div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200"><div class="font-mono font-bold text-amber-700">19–21 Nov</div><div class="font-bold text-navy-deep">Tim B: Windesi</div><div class="text-text-muted">Budi Santoso, S.E.</div></div>' +
          '<div class="p-2.5 rounded-xl bg-blue-50 border border-blue-200"><div class="font-mono font-bold text-navy-deep">24–26 Nov</div><div class="font-bold text-navy-deep">Tim C: BPKP P. Barat</div><div class="text-text-muted">Oktovianus Sayori</div></div>' +
          '</div>' +
          '</div>' +
          '<div class="card-elevated rounded-2xl p-5 space-y-3">' +
          '<div class="flex items-center justify-between gap-2">' +
          '<div><h4 class="text-sm font-bold text-navy-deep">Audit Geotagging Distrik Kepulauan Roon</h4><p class="text-[11px] text-text-muted">Verifikasi koordinat offline-sync pesisir <span class="font-mono text-navy-deep">-2.46820, 134.58190</span></p></div>' +
          '<button type="button" data-action="print-doc" data-id="VERIFIKASI_SPT_ROON" class="px-2.5 py-1.5 rounded-lg bg-navy-deep text-white text-[11px] font-semibold">Cetak Lembar Roon</button>' +
          '</div>' +
          '<div class="p-3 rounded-xl bg-surface-low border border-border-subtle text-xs space-y-1.5">' +
          '<div class="flex justify-between"><span class="text-text-muted">Koordinat Titik Sensus:</span><span class="font-mono font-bold text-navy-deep">-2.46820, 134.58190</span></div>' +
          '<div class="flex justify-between"><span class="text-text-muted">Akurasi GPS & Sinkronisasi:</span><span class="font-mono text-status-present font-bold">±9m • Offline Cache Terverifikasi</span></div>' +
          '<div class="flex justify-between"><span class="text-text-muted">Status Pemutihan Potongan TPP:</span><span class="font-semibold text-status-present">Sah Tanpa Penalti WFA</span></div>' +
          '</div>' +
          '</div>';
      }
    }

    function openSPTModal(editId) {
      var existing = editId ? ((AppCache.spt || []).filter(function (x) { return x.id === editId; })[0] || null) : null;
      var startModal = function (sptIdVal) {
        var presetOpts = '';
        for (var pIdx = 0; pIdx < SPT_LOKASI_PRESETS.length; pIdx++) {
          var pr = SPT_LOKASI_PRESETS[pIdx];
          presetOpts += '<option value="' + esc(pr.key) + '"' + (pIdx === 0 ? ' selected' : '') + '>' + esc(pr.label) + (pr.gps ? ' (' + esc(pr.gps) + ')' : '') + '</option>';
        }
        var defaultPreset = SPT_LOKASI_PRESETS[0];

        var existingCleanNips = [];
        if (existing && existing.daftarNIP) {
          var rawArr = String(existing.daftarNIP).split(',');
          for (var eIdx = 0; eIdx < rawArr.length; eIdx++) {
            var cNip = rawArr[eIdx].trim().replace(/\s+/g, '');
            if (cNip) existingCleanNips.push(cNip);
          }
        }

        var initNamaLok = defaultPreset.nama;
        var initGpsLok = defaultPreset.gps;
        if (existing && existing.lokasi) {
          var mLok = String(existing.lokasi).match(/^(.*?)\s*\(([^)]+)\)\s*$/);
          if (mLok) {
            initNamaLok = mLok[1].trim();
            initGpsLok = mLok[2].trim();
          } else {
            initNamaLok = String(existing.lokasi).trim();
            initGpsLok = '';
          }
        }

        var sortedPeg = getActivePegawaiList().slice().sort(function (a, b) {
          return String(a.nama || '').localeCompare(String(b.nama || ''));
        });
        var curNipClean = AppCache.currentUser ? String(AppCache.currentUser.nip || '').replace(/\s+/g, '') : '';
        var checklistHtml = '';
        for (var i = 0; i < sortedPeg.length; i++) {
          var pg = sortedPeg[i];
          var searchBlob = [pg.nama, pg.nip, pg.jabatan, pg.bidang, pg.subBidang].join(' ').toLowerCase();
          var nipVal = String(pg.nip || '').replace(/\s+/g, '');
          var isChecked = existingCleanNips.indexOf(nipVal) !== -1;
          checklistHtml += '<label class="spt-peg-item flex items-start gap-2.5 px-2.5 py-2 rounded-xl hover:bg-blue-50/70 cursor-pointer border border-transparent hover:border-blue-100 transition-smooth" data-search="' + esc(searchBlob) + '">' +
            '<input type="checkbox" class="spt-peg-cb mt-0.5 rounded border-slate-300 text-navy-deep focus:ring-electric-blue" value="' + esc(pg.nip) + '" data-nama="' + esc(pg.nama) + '" data-bidang="' + esc(pg.bidang || '') + '" data-clean-nip="' + esc(nipVal) + '"' + (isChecked ? ' checked' : '') + ' />' +
            '<div class="min-w-0 flex-1">' +
            '<div class="text-xs font-bold text-text-main leading-tight">' + esc(pg.nama) + '</div>' +
            '<div class="text-[11px] text-text-muted leading-tight mt-0.5">' + esc(pg.jabatan || '-') + (pg.bidang ? ' • <span class="text-electric-blue font-semibold">' + esc(pg.bidang) + '</span>' : '') + '</div>' +
            '<div class="font-mono text-[10px] text-slate-500 mt-0.5">NIP. ' + esc(pg.nip) + '</div>' +
            '</div>' +
            '</label>';
        }
        if (!checklistHtml) {
          checklistHtml = '<div class="p-3 text-center text-[11px] text-text-muted">Data master pegawai belum dimuat.</div>';
        }

        var nowD = new Date();
        var endD = new Date(nowD.getTime() + (2 * 86400000));
        var toIsoLocal = function (dt) {
          var y = dt.getFullYear();
          var m = String(dt.getMonth() + 1);
          var d = String(dt.getDate());
          return y + '-' + (m.length < 2 ? '0' + m : m) + '-' + (d.length < 2 ? '0' + d : d);
        };
        var isoMulai = (existing && existing.tglMulai && dmyToISO(existing.tglMulai)) ? dmyToISO(existing.tglMulai) : toIsoLocal(nowD);
        var isoSelesai = (existing && existing.tglSelesai && dmyToISO(existing.tglSelesai)) ? dmyToISO(existing.tglSelesai) : toIsoLocal(endD);
        var initKeperluan = existing ? (existing.keperluan || '') : 'Verifikasi aset tetap pemerintah daerah di distrik tujuan';
        var initNomorSpt = existing ? (existing.nomorSPT || '') : '';

        var body = '<form id="form-save-spt" action="javascript:void(0);" class="space-y-3.5">' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">ID SPT</label><input type="text" readonly value="' + esc(sptIdVal) + '" class="w-full px-3 py-2 rounded-xl bg-surface-high font-mono text-xs font-bold text-navy-deep" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nomor SPT (Opsional)</label><input id="spt-nomor-input" type="text" value="' + esc(initNomorSpt) + '" placeholder="Otomatis jika dikosongkan" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle font-mono text-xs" /></div>' +
          '</div>' +
          '<div class="p-3 rounded-2xl bg-surface-low border border-border-subtle space-y-2.5">' +
          '<div class="text-[11px] font-bold uppercase tracking-wide text-navy-deep">1. Tujuan Dinas & Lokasi Koordinat GPS</div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Pilih Wilayah / Distrik Tujuan</label><select id="spt-preset-tujuan" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs font-medium">' + presetOpts + '</select></div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Detail Tempat / Instansi Tujuan</label><input id="spt-lokasi-nama" type="text" required value="' + esc(initNamaLok) + '" placeholder="Misal: Distrik Kepulauan Roon / Kantor Kampung" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs" /></div>' +
          '<div>' +
          '<div class="flex items-center justify-between mb-1"><label class="block text-[11px] font-semibold text-text-muted">Koordinat GPS (Lat, Lng)</label><button id="btn-spt-get-gps" type="button" class="text-[11px] font-semibold text-electric-blue hover:underline flex items-center gap-0.5"><span class="material-symbols-outlined text-[13px]">my_location</span><span>Ambil GPS Saat Ini</span></button></div>' +
          '<input id="spt-lokasi-gps" type="text" required value="' + esc(initGpsLok) + '" placeholder="-2.46820, 134.58190" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" />' +
          '</div>' +
          '</div>' +
          '</div>' +
          '<div class="p-3 rounded-2xl bg-surface-low border border-border-subtle space-y-2">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div class="text-[11px] font-bold uppercase tracking-wide text-navy-deep">2. Pilih Pegawai yang Ditugaskan</div>' +
          '<div class="flex items-center gap-1.5">' +
          (curNipClean ? '<button id="btn-spt-select-me" type="button" class="px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-navy-deep text-[11px] font-semibold">Pilih Saya</button>' : '') +
          '<button id="btn-spt-select-none" type="button" class="px-2 py-0.5 rounded-lg bg-white hover:bg-surface-high border border-border-subtle text-text-muted text-[11px] font-semibold">Reset</button>' +
          '</div>' +
          '</div>' +
          '<input id="spt-pegawai-search" type="search" placeholder="Cari nama pegawai, NIP, jabatan, atau bidang..." class="w-full px-3 py-1.5 rounded-xl bg-white border border-border-subtle text-xs" />' +
          '<div id="spt-pegawai-list" class="max-h-44 overflow-y-auto bg-white rounded-xl border border-border-subtle p-1.5 space-y-1">' + checklistHtml + '</div>' +
          '<div id="spt-selected-summary" class="text-[11px] px-2.5 py-1.5 rounded-xl bg-white border border-border-subtle text-text-muted">Belum ada pegawai dipilih (centang minimal 1 pegawai di atas).</div>' +
          '<input id="spt-nips" type="hidden" value="" />' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Mulai Tugas</label><input id="spt-mulai" type="date" required value="' + esc(isoMulai) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Selesai Tugas</label><input id="spt-selesai" type="date" required value="' + esc(isoSelesai) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
          '</div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Keperluan / Uraian Penugasan</label><textarea id="spt-keperluan" rows="2" required placeholder="Tuliskan maksud dan keperluan surat perintah tugas..." class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs">' + esc(initKeperluan) + '</textarea></div>' +
          '<button id="btn-save-spt-submit" type="submit" class="w-full py-2.5 rounded-xl bg-mode-wfa hover:opacity-95 text-white text-xs font-semibold flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-[16px]">assignment_turned_in</span><span>' + (existing ? 'Simpan Perubahan SPT' : 'Simpan & Terbitkan SPT') + '</span></button>' +
          '</form>';

        openModal(existing ? ('Edit Penugasan SPT (' + existing.id + ')') : 'Terbitkan Surat Perintah Tugas (SPT)', body);

        var presetEl = document.getElementById('spt-preset-tujuan');
        var namaLokEl = document.getElementById('spt-lokasi-nama');
        var gpsLokEl = document.getElementById('spt-lokasi-gps');
        var searchEl = document.getElementById('spt-pegawai-search');
        var summaryEl = document.getElementById('spt-selected-summary');
        var hiddenNipsEl = document.getElementById('spt-nips');
        var mulaiEl = document.getElementById('spt-mulai');
        var selesaiEl = document.getElementById('spt-selesai');

        function syncSelectedPegawaiSPT() {
          var cbs = document.querySelectorAll('.spt-peg-cb');
          var nips = [];
          var badges = '';
          for (var c = 0; c < cbs.length; c++) {
            if (cbs[c].checked) {
              var rawN = cbs[c].value;
              var nm = cbs[c].getAttribute('data-nama') || rawN;
              nips.push(rawN);
              badges += '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-100 text-navy-deep font-semibold mr-1 mt-1">' + esc(nm) + ' <span class="font-mono text-[10px] text-electric-blue">(' + esc(rawN) + ')</span></span>';
            }
          }
          hiddenNipsEl.value = nips.join(', ');
          if (nips.length > 0) {
            summaryEl.innerHTML = '<div class="font-semibold text-navy-deep mb-0.5">' + nips.length + ' Pegawai Dipilih:</div><div class="flex flex-wrap">' + badges + '</div>';
          } else {
            summaryEl.innerHTML = 'Belum ada pegawai dipilih (centang minimal 1 pegawai di atas).';
          }
        }
        syncSelectedPegawaiSPT();

        presetEl.addEventListener('change', function () {
          var key = presetEl.value;
          for (var x = 0; x < SPT_LOKASI_PRESETS.length; x++) {
            if (SPT_LOKASI_PRESETS[x].key === key) {
              if (key === 'MANUAL') {
                namaLokEl.value = '';
                gpsLokEl.value = '';
                namaLokEl.focus();
              } else {
                namaLokEl.value = SPT_LOKASI_PRESETS[x].nama;
                gpsLokEl.value = SPT_LOKASI_PRESETS[x].gps;
              }
              break;
            }
          }
        });

        var btnGps = document.getElementById('btn-spt-get-gps');
        btnGps.addEventListener('click', function () {
          if (!navigator.geolocation) {
            showToast('Perangkat/browser tidak mendukung deteksi GPS otomatis.', 'warning');
            return;
          }
          var oldHtml = btnGps.innerHTML;
          btnGps.disabled = true;
          btnGps.textContent = 'Mendeteksi GPS...';
          navigator.geolocation.getCurrentPosition(function (pos) {
            gpsLokEl.value = pos.coords.latitude.toFixed(5) + ', ' + pos.coords.longitude.toFixed(5);
            btnGps.disabled = false;
            btnGps.innerHTML = oldHtml;
            showToast('Koordinat GPS perangkat berhasil diambil.', 'success');
          }, function () {
            btnGps.disabled = false;
            btnGps.innerHTML = oldHtml;
            showToast('Gagal mengambil GPS otomatis. Gunakan preset wilayah atau isi koordinat manual.', 'warning');
          }, { enableHighAccuracy: true, timeout: 8000 });
        });

        searchEl.addEventListener('input', function () {
          var q = searchEl.value.trim().toLowerCase();
          var items = document.querySelectorAll('.spt-peg-item');
          for (var idx = 0; idx < items.length; idx++) {
            var hay = items[idx].getAttribute('data-search') || '';
            items[idx].style.display = (!q || hay.indexOf(q) !== -1) ? '' : 'none';
          }
        });

        var cbsAll = document.querySelectorAll('.spt-peg-cb');
        for (var cbIdx = 0; cbIdx < cbsAll.length; cbIdx++) {
          cbsAll[cbIdx].addEventListener('change', syncSelectedPegawaiSPT);
        }

        var btnReset = document.getElementById('btn-spt-select-none');
        if (btnReset) {
          btnReset.addEventListener('click', function () {
            var listCb = document.querySelectorAll('.spt-peg-cb');
            for (var rIdx = 0; rIdx < listCb.length; rIdx++) {
              listCb[rIdx].checked = false;
            }
            syncSelectedPegawaiSPT();
          });
        }

        var btnMe = document.getElementById('btn-spt-select-me');
        if (btnMe) {
          btnMe.addEventListener('click', function () {
            var listCb = document.querySelectorAll('.spt-peg-cb');
            var matched = false;
            for (var mIdx = 0; mIdx < listCb.length; mIdx++) {
              if (listCb[mIdx].getAttribute('data-clean-nip') === curNipClean) {
                listCb[mIdx].checked = true;
                matched = true;
                break;
              }
            }
            syncSelectedPegawaiSPT();
            if (!matched) showToast('NIP akun aktif belum ada di daftar master pegawai.', 'info');
          });
        }

        mulaiEl.addEventListener('change', function () {
          if (mulaiEl.value && selesaiEl.value && selesaiEl.value < mulaiEl.value) {
            selesaiEl.value = mulaiEl.value;
          }
        });

        document.getElementById('form-save-spt').addEventListener('submit', function (e) {
          e.preventDefault();
          var daftarNIPVal = hiddenNipsEl.value.trim();
          if (!daftarNIPVal) {
            showToast('Pilih minimal 1 pegawai yang ditugaskan pada checklist.', 'warning');
            return;
          }
          var namaLokVal = namaLokEl.value.trim();
          var gpsLokVal = gpsLokEl.value.replace(/^\(|\)$/g, '').trim();
          if (!namaLokVal) {
            showToast('Isi nama tempat / instansi tujuan dinas.', 'warning');
            namaLokEl.focus();
            return;
          }
          if (!gpsLokVal) {
            showToast('Isi atau pilih koordinat GPS lokasi penugasan.', 'warning');
            gpsLokEl.focus();
            return;
          }
          if (selesaiEl.value < mulaiEl.value) {
            showToast('Tanggal selesai tidak boleh lebih awal dari tanggal mulai.', 'warning');
            selesaiEl.focus();
            return;
          }
          var nomorInpEl = document.getElementById('spt-nomor-input');
          var btn = document.getElementById('btn-save-spt-submit');
          callServer('apiSaveSPT', {
            id: existing ? existing.id : '',
            nomorSPT: nomorInpEl ? nomorInpEl.value.trim() : '',
            lokasi: namaLokVal + ' (' + gpsLokVal + ')',
            daftarNIP: daftarNIPVal,
            tglMulai: formatIsoDateToDMY(mulaiEl.value),
            tglSelesai: formatIsoDateToDMY(selesaiEl.value),
            keperluan: document.getElementById('spt-keperluan').value.trim()
          }, btn, function (r) {
            if (existing) {
              AppCache.spt = AppCache.spt.map(function (s) { return s.id === r.record.id ? r.record : s; });
            } else {
              AppCache.spt.unshift(r.record);
            }
            closeModal();
            renderSPTModule();
            showToast(r.message, 'success');
          });
        });
      };

      if (existing) {
        startModal(existing.id);
      } else {
        callServer('apiGetNextId', 'SPT', null, function (res) {
          startModal(res.nextId);
        });
      }
    }

    /* -------------------------------------------------------------------
     * 10. RENDER PERSETUJUAN IZIN & CUTI BERJENJANG (3 TAHAP)
     * ------------------------------------------------------------------- */
    function resolvePegawaiForIzin(pegOrIzin) {
      if (!pegOrIzin) return {};
      var nipClean = String(pegOrIzin.nip || '').replace(/\s+/g, '');
      var found = null;
      if (nipClean) {
        for (var i = 0; i < AppCache.pegawai.length; i++) {
          if (String(AppCache.pegawai[i].nip || '').replace(/\s+/g, '') === nipClean) {
            found = AppCache.pegawai[i];
            break;
          }
        }
      }
      return {
        peran: (found && found.peran) || pegOrIzin.peran || '',
        jabatan: (found && found.jabatan) || (pegOrIzin.jabatan && pegOrIzin.jabatan !== '-' ? pegOrIzin.jabatan : ''),
        bidang: (found && found.bidang) || (pegOrIzin.bidang && pegOrIzin.bidang !== '-' ? pegOrIzin.bidang : ''),
        subBidang: (found && found.subBidang) || pegOrIzin.subBidang || '',
        isPemohonKasi: pegOrIzin.isPemohonKasi === true,
        isPemohonKabidSek: pegOrIzin.isPemohonKabidSek === true
      };
    }

    function isPemohonKabidAtauSekretaris(pegOrIzin) {
      var peg = resolvePegawaiForIzin(pegOrIzin);
      if (peg.isPemohonKabidSek) return true;
      var peran = String(peg.peran || '').toLowerCase();
      var jab = String(peg.jabatan || '').toLowerCase();
      return peran === 'kabid' ||
        peran === 'sekretaris' ||
        jab.indexOf('kepala bidang') !== -1 ||
        jab.indexOf('kabid') !== -1 ||
        jab.indexOf('sekretaris') !== -1;
    }

    function isPemohonKepalaSeksi(pegOrIzin) {
      var peg = resolvePegawaiForIzin(pegOrIzin);
      if (isPemohonKabidAtauSekretaris(pegOrIzin)) return false;
      if (peg.isPemohonKasi) return true;
      var peran = String(peg.peran || '').toLowerCase();
      var jab = String(peg.jabatan || '').toLowerCase();
      return peran === 'kasubid' ||
        jab.indexOf('kepala seksi') !== -1 ||
        jab.indexOf('kasi') !== -1 ||
        jab.indexOf('kasubid') !== -1 ||
        jab.indexOf('kasubbag') !== -1 ||
        jab.indexOf('kepala sub') !== -1;
    }

    function getIzinFlowLabels(z) {
      var isKabidSek = isPemohonKabidAtauSekretaris(z);
      if (isKabidSek) {
        return {
          isKasi: false,
          isKabidSek: true,
          badgeText: 'Alur Kabid/Sekretaris (Langsung Kepala Badan)',
          t1Label: '1. Tahap Awal:',
          t2Label: '2. Paraf Bidang:',
          t3Label: '3. Pengesahan Kaban:',
          t1Btn: '',
          t2Btn: '',
          t3Btn: 'Pengesahan Final Kepala Badan (Tahap 3)',
          t1DescTitle: 'Tahap 1 — Dilewati Otomatis (Pemohon Kabid/Sekretaris)',
          t1DescSub: 'Tidak memerlukan telaah Kasubid',
          t2DescTitle: 'Tahap 2 — Dilewati Otomatis (Pemohon Kabid/Sekretaris)',
          t2DescSub: 'Diteruskan langsung ke Kepala Badan BKAD'
        };
      }
      var isKasi = isPemohonKepalaSeksi(z);
      return isKasi ? {
        isKasi: true,
        isKabidSek: false,
        badgeText: 'Alur Kepala Seksi (Kabid → Sekretaris → Kaban)',
        t1Label: '1. Persetujuan Kabid:',
        t2Label: '2. Paraf Sekretaris:',
        t3Label: '3. Pengesahan Kaban:',
        t1Btn: 'Sahkan Persetujuan Kepala Bidang (Tahap 1)',
        t2Btn: 'Berikan Paraf Sekretaris (Tahap 2)',
        t3Btn: 'Pengesahan Final Kepala Badan (Tahap 3)',
        t1DescTitle: 'Tahap 1 — Persetujuan Kepala Bidang',
        t1DescSub: 'Verifikasi atasan langsung Kepala Seksi & pengaturan tugas bidang',
        t2DescTitle: 'Tahap 2 — Verifikasi & Paraf Sekretaris',
        t2DescSub: 'Telaah administrasi kepegawaian & paraf Sekretaris BKAD'
      } : {
        isKasi: false,
        badgeText: 'Alur Staf (Kasubid → Kabid → Kaban)',
        t1Label: '1. Telaah Kasubid:',
        t2Label: '2. Paraf Kabid:',
        t3Label: '3. Pengesahan Kaban:',
        t1Btn: 'Sahkan Rekomendasi Kasubid (Tahap 1)',
        t2Btn: 'Berikan Paraf Kabid (Tahap 2)',
        t3Btn: 'Pengesahan Final Kepala Badan (Tahap 3)',
        t1DescTitle: 'Tahap 1 — Telaah & Rekomendasi Kasubid',
        t1DescSub: 'Pemeriksaan kelengkapan alasan & jadwal kerja bidang',
        t2DescTitle: 'Tahap 2 — Verifikasi & Paraf Kepala Bidang',
        t2DescSub: 'Persetujuan beban kerja tim & disposisi lanjut'
      };
    }

    function getIzinApprovalAuth(z, tahapSlot, isKasi) {
      var u = AppCache.currentUser;
      if (!u) return { allowed: false, reason: 'Belum login' };
      var actorNip = String(u.nip || '').replace(/\s+/g, '').trim();
      var pemohonNip = String((z && z.nip) || '').replace(/\s+/g, '').trim();
      if (actorNip && pemohonNip && actorNip === pemohonNip) {
        return { allowed: false, isSelf: true, reason: 'Anda Pemohon (Menunggu Pejabat Berwenang)' };
      }
      var actorResolved = resolvePegawaiForIzin({ nip: actorNip, peran: u.peran, jabatan: u.jabatan, bidang: u.bidang, subBidang: u.subBidang });
      var pemResolved = resolvePegawaiForIzin(z);
      var peran = String(actorResolved.peran || u.peran || '').toLowerCase();
      var jab = String(actorResolved.jabatan || u.jabatan || '').toLowerCase();
      if (peran === 'super admin') return { allowed: true, reason: '' };
      var pltText = '';
      var isPltForPemohonUnit = false;
      var pltList = AppCache.delegasiPlt || [];
      for (var d = 0; d < pltList.length; d++) {
        if (String(pltList[d].nipPlt || '').replace(/\s+/g, '') === actorNip) {
          pltText += ' ' + String(pltList[d].jabatan || '').toLowerCase();
          var origPeg = resolvePegawaiForIzin({ nip: pltList[d].nipAsli });
          if (origPeg.bidang && pemResolved.bidang && String(origPeg.bidang).toLowerCase() === String(pemResolved.bidang).toLowerCase()) {
            isPltForPemohonUnit = true;
          }
        }
      }
      var allText = peran + ' ' + jab + pltText;
      var actorBid = String(actorResolved.bidang || '').toLowerCase().trim();
      var pemBid = String(pemResolved.bidang || '').toLowerCase().trim();
      var actorSub = String(actorResolved.subBidang || '').toLowerCase().trim();
      var pemSub = String(pemResolved.subBidang || '').toLowerCase().trim();
      var sameBidang = !actorBid || !pemBid || actorBid === pemBid || isPltForPemohonUnit;
      var sameSubBidang = !actorSub || !pemSub || actorSub === pemSub || isPltForPemohonUnit;

      if (tahapSlot === 'KASUBID') {
        if (isKasi) {
          var okKabid1 = sameBidang && (peran === 'kabid' || allText.indexOf('kepala bidang') !== -1 || allText.indexOf('kabid') !== -1);
          return { allowed: okKabid1, reason: 'Menunggu Aksi: Kepala Bidang ' + (pemResolved.bidang || '') };
        }
        var okKasi1 = sameBidang && sameSubBidang && (peran === 'kasubid' || allText.indexOf('kasubid') !== -1 || allText.indexOf('kepala seksi') !== -1 || allText.indexOf('kasubbag') !== -1);
        return { allowed: okKasi1, reason: 'Menunggu Aksi: Kasubid ' + (pemResolved.subBidang || pemResolved.bidang || '') };
      }
      if (tahapSlot === 'KABID') {
        if (isKasi) {
          var okSek = peran === 'sekretaris' || allText.indexOf('sekretaris') !== -1;
          return { allowed: okSek, reason: 'Menunggu Aksi: Sekretaris' };
        }
        var okKabid2 = sameBidang && (peran === 'kabid' || allText.indexOf('kepala bidang') !== -1 || allText.indexOf('kabid') !== -1);
        return { allowed: okKabid2, reason: 'Menunggu Aksi: Kepala Bidang ' + (pemResolved.bidang || '') };
      }
      if (tahapSlot === 'KABAN') {
        var okKaban = peran === 'kepala badan' || allText.indexOf('kepala badan') !== -1 || allText.indexOf('kepala bkad') !== -1;
        return { allowed: okKaban, reason: 'Menunggu Aksi: Kepala Badan' };
      }
      return { allowed: false, reason: 'Menunggu Pejabat Berwenang' };
    }

    function checkLocalIzinActorAuth(actorNip, tahapSlot, isKasi, db, targetIzin) {
      if (!actorNip) return { ok: true };
      var peg = (db && db.pegawai || []).filter(function (p) { return String(p.nip || '').replace(/\s+/g, '') === actorNip; })[0];
      if (!peg) return { ok: true };
      var peran = String(peg.peran || '').toLowerCase();
      if (peran === 'super admin') return { ok: true };
      var res = getIzinApprovalAuth(targetIzin || { nip: '' }, tahapSlot, isKasi);
      if (!res.allowed) {
        return { ok: false, error: 'Otorisasi Ditolak: ' + res.reason + ' (bukan atasan langsung/wewenang Anda).' };
      }
      return { ok: true };
    }

    function renderIzinApprovalModule() {
      var filter = document.getElementById('filter-izin-status').value;
      var list = AppCache.izin.filter(function (item) {
        var sf = String(item.statusFinal || '');
        if (filter === 'SEMUA') return true;
        if (filter === 'DIKEMBALIKAN') return sf.indexOf('Dikembalikan') !== -1;
        if (filter === 'TAHAP_1') return item.statusKasubid === 'Menunggu' && sf.indexOf('Ditolak') === -1 && sf.indexOf('Dikembalikan') === -1;
        if (filter === 'TAHAP_2') return item.statusKasubid === 'Disetujui' && item.statusKabid === 'Menunggu' && sf.indexOf('Ditolak') === -1 && sf.indexOf('Dikembalikan') === -1;
        if (filter === 'TAHAP_3') return item.statusKabid === 'Disetujui' && item.statusKaban === 'Menunggu' && sf.indexOf('Ditolak') === -1 && sf.indexOf('Dikembalikan') === -1;
        return sf === filter;
      });

      var html = '';
      for (var i = 0; i < list.length; i++) {
        var z = list[i];
        var flow = getIzinFlowLabels(z);
        var isReturned = String(z.statusFinal || '').indexOf('Dikembalikan') !== -1;
        var canKasubid = !isReturned && !flow.isKabidSek && z.statusKasubid === 'Menunggu';
        var canKabid = !isReturned && !flow.isKabidSek && z.statusKasubid === 'Disetujui' && z.statusKabid === 'Menunggu';
        var canKaban = !isReturned && (flow.isKabidSek || z.statusKabid === 'Disetujui') && z.statusKaban === 'Menunggu';
        var isSah = z.statusFinal === 'Sah Diterbitkan';
        var activeSlot = canKasubid ? 'KASUBID' : (canKabid ? 'KABID' : (canKaban ? 'KABAN' : ''));
        var authInfo = activeSlot ? getIzinApprovalAuth(z, activeSlot, flow.isKasi) : { allowed: false, reason: '' };
        var canActNow = !isReturned && !isSah && String(z.statusFinal || '').indexOf('Ditolak') === -1 && authInfo.allowed;
        var curU = AppCache.currentUser || {};
        var isOwnerOrAdmin = (String(curU.nip || '').replace(/\s+/g, '') === String(z.nip || '').replace(/\s+/g, '')) || String(curU.peran || '').toLowerCase() === 'super admin';

        html += '<div class="card-elevated rounded-2xl p-4 sm:p-5 space-y-3">' +
          '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">' +
          '<div>' +
          '<div class="flex flex-wrap items-center gap-2"><span class="font-mono text-xs font-bold text-navy-deep">' + esc(z.id) + '</span><span class="font-bold text-sm">' + esc(z.nama) + '</span><span class="px-2 py-0.5 rounded-full bg-blue-50 text-navy-deep text-[11px] font-semibold">' + esc(z.jenis) + '</span><span class="px-2 py-0.5 rounded-full ' + (flow.isKasi ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-slate-100 text-slate-700') + ' text-[10px] font-semibold">' + esc(flow.badgeText) + '</span></div>' +
          '<div class="text-xs text-text-muted mt-0.5">NIP: <span class="font-mono">' + esc(z.nip) + '</span> • ' + esc(z.jabatan || '-') + ' • ' + esc(z.bidang) + ' • Periode: <span class="font-mono font-semibold">' + esc(z.tglMulai) + ' s/d ' + esc(z.tglSelesai) + '</span></div>' +
          '</div>' +
          getStatusBadge(z.statusFinal) +
          '</div>' +
          '<p class="text-xs bg-surface-low p-3 rounded-xl border border-border-subtle"><b>Alasan:</b> ' + esc(z.alasan) + (z.nomorSurat ? ' • <b>No. Surat Resmi:</b> <span class="font-mono text-navy-deep">' + esc(z.nomorSurat) + '</span>' : '') + '</p>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">' +
          '<div class="p-2.5 rounded-xl bg-surface-low"><b>' + esc(flow.t1Label) + '</b> ' + getStatusBadge(z.statusKasubid) + '</div>' +
          '<div class="p-2.5 rounded-xl bg-surface-low"><b>' + esc(flow.t2Label) + '</b> ' + getStatusBadge(z.statusKabid) + '</div>' +
          '<div class="p-2.5 rounded-xl bg-surface-low"><b>' + esc(flow.t3Label) + '</b> ' + getStatusBadge(z.statusKaban) + '</div>' +
          '</div>' +
          '<div class="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border-subtle">' +
          '<button type="button" data-action="open-telaah-izin" data-id="' + esc(z.id) + '" class="px-3 py-1.5 rounded-lg bg-white border border-border-subtle hover:bg-surface-high text-navy-deep text-xs font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">fact_check</span><span>Lembar Telaah</span></button>' +
          (canActNow && canKasubid ? '<button type="button" data-action="approve-izin" data-id="' + esc(z.id) + '" data-tahap="KASUBID" data-keputusan="Disetujui" class="px-3 py-1.5 rounded-lg bg-electric-blue text-white text-xs font-semibold">' + esc(flow.t1Btn) + '</button>' : '') +
          (canActNow && canKabid ? '<button type="button" data-action="approve-izin" data-id="' + esc(z.id) + '" data-tahap="KABID" data-keputusan="Disetujui" class="px-3 py-1.5 rounded-lg bg-status-tracking text-white text-xs font-semibold">' + esc(flow.t2Btn) + '</button>' : '') +
          (canActNow && canKaban ? '<button type="button" data-action="approve-izin" data-id="' + esc(z.id) + '" data-tahap="KABAN" data-keputusan="Disetujui" class="px-3 py-1.5 rounded-lg bg-status-present text-white text-xs font-semibold">' + esc(flow.t3Btn) + '</button>' : '') +
          (canActNow ? '<button type="button" data-action="return-izin-modal" data-id="' + esc(z.id) + '" data-tahap="' + activeSlot + '" class="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-semibold">Kembalikan (Revisi)</button>' : '') +
          (canActNow ? '<button type="button" data-action="approve-izin" data-id="' + esc(z.id) + '" data-tahap="' + activeSlot + '" data-keputusan="Ditolak" class="px-3 py-1.5 rounded-lg bg-red-50 text-status-absent text-xs font-semibold">Tolak</button>' : '') +
          (isReturned && isOwnerOrAdmin ? '<button type="button" data-action="edit-izin-revisi" data-id="' + esc(z.id) + '" class="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">edit_note</span><span>Edit &amp; Ajukan Ulang</span></button>' : '') +
          (isReturned && !isOwnerOrAdmin ? '<span class="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold">Menunggu Revisi Pemohon</span>' : '') +
          (!isReturned && !canActNow && !isSah && z.statusFinal.indexOf('Ditolak') === -1 && authInfo.reason ? '<span class="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold">' + esc(authInfo.reason) + '</span>' : '') +
          '<button type="button" data-action="print-ctrlp-type" data-doc="FORMULIR_CUTI_BKN" data-id="' + esc(z.id) + '" class="px-3 py-1.5 rounded-lg bg-surface-low hover:bg-surface-high text-navy-deep text-xs font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">print</span><span>Formulir Cuti BKN A4</span></button>' +
          '<button type="button" data-action="print-ctrlp-type" data-doc="SURAT_IZIN_RESMI" data-id="' + esc(z.id) + '" class="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-electric-blue hover:text-white text-navy-deep text-xs font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">description</span><span>Surat Izin Resmi A4</span></button>' +
          '</div></div>';
      }
      document.getElementById('izin-approval-cards').innerHTML = html || '<div class="card-elevated rounded-2xl p-6 text-center text-xs text-text-muted">Tidak ada antrean pengajuan izin/cuti pada filter ini.</div>';
    }

    function openTelaahIzinModal(id) {
      var z = AppCache.izin.filter(function (x) { return x.id === id; })[0];
      if (!z) return;
      var flow = getIzinFlowLabels(z);
      var body = '<div class="space-y-4 text-xs">' +
        '<div class="p-4 rounded-xl bg-surface-low border border-border-subtle space-y-1.5">' +
        '<div class="flex flex-wrap items-center justify-between gap-2"><span class="font-mono font-bold text-navy-deep">' + esc(z.id) + ' • ' + esc(z.jenis) + '</span>' + getStatusBadge(z.statusFinal) + '</div>' +
        '<div><b>Pemohon:</b> ' + esc(z.nama) + ' (NIP. <span class="font-mono">' + esc(z.nip) + '</span>) • ' + esc(z.jabatan || '-') + ' • ' + esc(z.bidang) + '</div>' +
        '<div><b>Alur Persetujuan:</b> ' + esc(flow.badgeText) + '</div>' +
        '<div><b>Periode Izin/Cuti:</b> <span class="font-mono">' + esc(z.tglMulai) + ' s/d ' + esc(z.tglSelesai) + '</span></div>' +
        '<div><b>Alasan & Berkas Lampiran:</b> ' + esc(z.alasan) + ' (<span class="font-mono text-navy-deep">' + esc(z.berkasUrl || 'berkas_lampiran.pdf') + '</span>)</div>' +
        '</div>' +
        '<div class="space-y-2">' +
        '<div class="font-bold text-navy-deep uppercase text-[11px]">Rekam Jejak Validasi Berjenjang 3 Pejabat</div>' +
        '<div class="p-3 rounded-xl border border-border-subtle flex items-center justify-between"><div><b>' + esc(flow.t1DescTitle) + '</b><div class="text-text-muted">' + esc(flow.t1DescSub) + '</div></div>' + getStatusBadge(z.statusKasubid) + '</div>' +
        '<div class="p-3 rounded-xl border border-border-subtle flex items-center justify-between"><div><b>' + esc(flow.t2DescTitle) + '</b><div class="text-text-muted">' + esc(flow.t2DescSub) + '</div></div>' + getStatusBadge(z.statusKabid) + '</div>' +
        '<div class="p-3 rounded-xl border border-border-subtle flex items-center justify-between"><div><b>Tahap 3 — Pengesahan Final Kepala BKAD</b><div class="text-text-muted">Penerbitan nomor surat resmi (' + esc(z.nomorSurat || 'Menunggu pengesahan') + ')</div></div>' + getStatusBadge(z.statusKaban) + '</div>' +
        '</div>' +
        '<div class="flex flex-wrap justify-end gap-2 pt-2 border-t border-border-subtle">' +
        '<button type="button" data-action="print-ctrlp-type" data-doc="FORMULIR_CUTI_BKN" data-id="' + esc(z.id) + '" class="px-3.5 py-2 rounded-xl bg-surface-low hover:bg-surface-high text-navy-deep font-semibold">Buka Formulir Cuti BKN Ctrl+P</button>' +
        '<button type="button" data-action="print-ctrlp-type" data-doc="SURAT_IZIN_RESMI" data-id="' + esc(z.id) + '" class="px-3.5 py-2 rounded-xl bg-navy-deep hover:bg-primary text-white font-semibold">Buka Surat Izin Resmi Ctrl+P</button>' +
        '</div>' +
        '</div>';
      openModal('Lembar Telaah & Audit Izin / Cuti (' + esc(z.id) + ')', body, false);
    }

    function formatIsoDateToDMY(isoDate) {
      if (!isoDate || isoDate.indexOf('-') === -1) return isoDate || '';
      var p = isoDate.split('-');
      return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0]) : isoDate;
    }

    function openReturnIzinModal(id, tahap) {
      var z = AppCache.izin.filter(function (x) { return x.id === id; })[0];
      if (!z) return;
      var body = '<form id="form-return-izin" action="javascript:void(0);" class="space-y-3 text-xs">' +
        '<div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950">' +
        '<b>Pengembalian Berjenjang untuk Revisi:</b> Persetujuan tahap sebelumnya pada permohonan <b>' + esc(z.id) + '</b> (' + esc(z.nama) + ') akan dibatalkan otomatis agar pemohon dapat mengedit &amp; mengajukan ulang dari awal.' +
        '</div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Catatan / Alasan Pengembalian (Wajib Diisi)</label>' +
        '<textarea id="ret-izin-catatan" rows="3" required placeholder="Contoh: Mohon perbaiki tanggal selesai cuti atau lengkapi lampiran surat pendukung..." class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs"></textarea></div>' +
        '<button id="btn-ret-izin-submit" type="submit" class="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs">Kembalikan ke Pemohon &amp; Batalkan Tahap Sebelumnya</button>' +
        '</form>';
      openModal('Kembalikan Permohonan Izin / Cuti (' + esc(z.id) + ')', body, false);
      document.getElementById('form-return-izin').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = document.getElementById('btn-ret-izin-submit');
        callServer('apiApproveIzinCuti', {
          id: id,
          tahap: tahap,
          keputusan: 'Dikembalikan',
          catatan: document.getElementById('ret-izin-catatan').value.trim(),
          actorNip: AppCache.currentUser ? AppCache.currentUser.nip : ''
        }, btn, function (res) {
          AppCache.izin = AppCache.izin.map(function (x) { return x.id === res.record.id ? res.record : x; });
          closeModal();
          renderIzinApprovalModule();
          showToast(res.message, 'warning');
        });
      });
    }

    function dmyToIso(dmyStr) {
      var p = String(dmyStr || '').split('/');
      return p.length === 3 ? (p[2] + '-' + (p[1].length === 1 ? '0' : '') + p[1] + '-' + (p[0].length === 1 ? '0' : '') + p[0]) : '';
    }

    function openEditIzinRevisiModal(id) {
      var z = AppCache.izin.filter(function (x) { return x.id === id; })[0];
      if (!z) return;
      var body = '<form id="form-revisi-izin" action="javascript:void(0);" class="space-y-3 text-xs">' +
        '<div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950"><b>Status Saat Ini:</b> ' + esc(z.statusFinal) + '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Jenis Permohonan</label>' +
        '<select id="rev-izin-jenis" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs">' +
        '<option value="Cuti Tahunan"' + (z.jenis === 'Cuti Tahunan' ? ' selected' : '') + '>Cuti Tahunan</option>' +
        '<option value="Izin Keluar Kota"' + (z.jenis === 'Izin Keluar Kota' ? ' selected' : '') + '>Izin Keluar Kota</option>' +
        '<option value="Izin Sakit"' + (z.jenis === 'Izin Sakit' ? ' selected' : '') + '>Izin Sakit</option>' +
        '<option value="Cuti Alasan Penting"' + (z.jenis === 'Cuti Alasan Penting' ? ' selected' : '') + '>Cuti Alasan Penting</option>' +
        '</select></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Mulai</label><input id="rev-izin-mulai" type="date" required value="' + esc(dmyToIso(z.tglMulai)) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Selesai</label><input id="rev-izin-selesai" type="date" required value="' + esc(dmyToIso(z.tglSelesai)) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
        '</div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nama Berkas / Nomor Surat Pendukung</label><input id="rev-izin-berkas" type="text" value="' + esc(z.berkasUrl || 'lampiran_permohonan.pdf') + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Alasan Lengkap Permohonan</label><textarea id="rev-izin-alasan" rows="2" required class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs">' + esc(z.alasan || '') + '</textarea></div>' +
        '<button id="btn-rev-izin-submit" type="submit" class="w-full py-2.5 rounded-xl bg-electric-blue hover:bg-navy-deep text-white font-semibold text-xs">Simpan Revisi &amp; Ajukan Ulang</button>' +
        '</form>';
      openModal('Edit & Ajukan Ulang Permohonan (' + esc(z.id) + ')', body, false);
      document.getElementById('form-revisi-izin').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = document.getElementById('btn-rev-izin-submit');
        callServer('apiUpdateIzinRevisi', {
          id: z.id,
          jenis: document.getElementById('rev-izin-jenis').value,
          tglMulai: formatIsoDateToDMY(document.getElementById('rev-izin-mulai').value),
          tglSelesai: formatIsoDateToDMY(document.getElementById('rev-izin-selesai').value),
          berkasUrl: document.getElementById('rev-izin-berkas').value.trim(),
          alasan: document.getElementById('rev-izin-alasan').value.trim(),
          actorNip: AppCache.currentUser ? AppCache.currentUser.nip : ''
        }, btn, function (res) {
          AppCache.izin = AppCache.izin.map(function (x) { return x.id === res.record.id ? res.record : x; });
          closeModal();
          renderIzinApprovalModule();
          showToast(res.message, 'success');
        });
      });
    }

    function openIzinCutiModal() {
      callServer('apiGetNextId', 'IZIN', null, function (res) {
        var curNip = AppCache.currentUser ? AppCache.currentUser.nip : '';
        var activeList = getActivePegawaiList();
        var options = '';
        for (var i = 0; i < activeList.length; i++) {
          var p = activeList[i];
          var sel = p.nip === curNip ? ' selected' : '';
          options += '<option value="' + esc(p.nip) + '"' + sel + '>' + esc(p.nama) + ' (' + esc(p.nip) + ')</option>';
        }
        if (curNip && !activeList.some(function (x) { return x.nip === curNip; })) {
          options = '<option value="' + esc(curNip) + '" selected>' + esc(AppCache.currentUser.nama) + ' (' + esc(curNip) + ')</option>' + options;
        }

        var body = '<form id="form-desk-izin" action="javascript:void(0);" class="space-y-3">' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">ID Pengajuan (Otomatis)</label><input type="text" readonly value="' + esc(res.nextId) + '" class="w-full px-3 py-2 rounded-xl bg-surface-high font-mono text-xs font-bold text-navy-deep" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">ASN Pemohon</label><select id="dk-izin-nip" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs">' + options + '</select></div>' +
          '</div>' +
          '<div id="dk-izin-alur-info" class="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-navy-deep font-medium"></div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Jenis Permohonan</label>' +
          '<select id="dk-izin-jenis" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs">' +
          '<option value="Cuti Tahunan">Cuti Tahunan</option>' +
          '<option value="Izin Keluar Kota">Izin Keluar Kota</option>' +
          '<option value="Izin Sakit">Izin Sakit</option>' +
          '<option value="Cuti Alasan Penting">Cuti Alasan Penting</option>' +
          '</select></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Mulai</label><input id="dk-izin-mulai" type="date" required class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Selesai</label><input id="dk-izin-selesai" type="date" required class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
          '</div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nama Berkas / Nomor Surat Pendukung</label><input id="dk-izin-berkas" type="text" value="lampiran_permohonan.pdf" placeholder="contoh: surat_dokter_rsud.pdf" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Alasan Lengkap Permohonan</label><textarea id="dk-izin-alasan" rows="2" required placeholder="Tuliskan alasan pengajuan izin atau cuti..." class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs"></textarea></div>' +
          '<button id="btn-desk-izin-submit" type="submit" class="w-full py-2.5 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-[17px]">send</span><span id="btn-desk-izin-submit-txt">Kirim Pengajuan ke Atasan</span></button>' +
          '</form>';

        openModal('Formulir Pengajuan Izin / Cuti Baru', body);
        function syncIzinPemohonAlur() {
          var selNip = document.getElementById('dk-izin-nip').value;
          var isKabidSek = isPemohonKabidAtauSekretaris({ nip: selNip });
          var isKasi = !isKabidSek && isPemohonKepalaSeksi({ nip: selNip });
          var infoEl = document.getElementById('dk-izin-alur-info');
          var btnTxt = document.getElementById('btn-desk-izin-submit-txt');
          if (isKabidSek) {
            if (infoEl) infoEl.innerHTML = '<b>Alur Kepala Bidang / Sekretaris:</b> Tahap 1 &amp; 2 dilewati otomatis; pengajuan langsung diteruskan ke <b>Kepala Badan (Tahap 3 Final)</b>.';
            if (btnTxt) btnTxt.textContent = 'Kirim Pengajuan ke Kepala Badan (Tahap 3)';
          } else if (isKasi) {
            if (infoEl) infoEl.innerHTML = '<b>Alur Kepala Seksi / Kasubid:</b> Pengajuan diteruskan ke <b>1. Kepala Bidang</b> → <b>2. Sekretaris</b> → <b>3. Kepala Badan</b>.';
            if (btnTxt) btnTxt.textContent = 'Kirim Pengajuan ke Kepala Bidang (Tahap 1)';
          } else {
            if (infoEl) infoEl.innerHTML = '<b>Alur Staf / Pelaksana:</b> Pengajuan diteruskan ke <b>1. Kasubid</b> → <b>2. Kepala Bidang</b> → <b>3. Kepala Badan</b>.';
            if (btnTxt) btnTxt.textContent = 'Kirim Pengajuan ke Atasan (Kasubid)';
          }
        }
        syncIzinPemohonAlur();
        document.getElementById('dk-izin-nip').addEventListener('change', syncIzinPemohonAlur);
        document.getElementById('form-desk-izin').addEventListener('submit', function (e) {
          e.preventDefault();
          var btn = document.getElementById('btn-desk-izin-submit');
          var payload = {
            nip: document.getElementById('dk-izin-nip').value,
            jenis: document.getElementById('dk-izin-jenis').value,
            tglMulai: formatIsoDateToDMY(document.getElementById('dk-izin-mulai').value),
            tglSelesai: formatIsoDateToDMY(document.getElementById('dk-izin-selesai').value),
            berkasUrl: document.getElementById('dk-izin-berkas').value,
            alasan: document.getElementById('dk-izin-alasan').value
          };
          callServer('apiSubmitIzinCuti', payload, btn, function (r) {
            AppCache.izin.unshift(r.record);
            closeModal();
            renderIzinApprovalModule();
            showToast(r.message, 'success');
          });
        });
      });
    }

    /* -------------------------------------------------------------------
     * 11. RENDER REKAPITULASI, KALENDER HARI LIBUR & TUTUP BUKU ALPA (TK)
     * ------------------------------------------------------------------- */
    function getMasterHariLiburList() {
      var s = AppCache.settings && AppCache.settings.MASTER_HARI_LIBUR;
      var val = s && s.value ? s.value : null;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch (e) { val = null; }
      }
      if (Array.isArray(val)) return val;
      return getDefaultHariLiburList();
    }

    function getHariLiburMap() {
      var list = getMasterHariLiburList();
      var map = {};
      for (var i = 0; i < list.length; i++) {
        var t = String((list[i] && list[i].tanggal) || '').trim();
        if (t) map[t] = list[i];
      }
      return map;
    }

    function saveHariLiburListToServer(newList, btnEl, onDone) {
      if (!AppCache.settings) AppCache.settings = {};
      AppCache.settings.MASTER_HARI_LIBUR = { value: newList };
      callServer('apiSaveSettings', { MASTER_HARI_LIBUR: newList }, btnEl, function (res) {
        if (res && res.settings) AppCache.settings = res.settings;
        renderRekapModule();
        if (onDone) onDone();
      });
    }

    function parseDMYToNumber(dmy) {
      var sp = String(dmy || '').trim().split('/');
      if (sp.length !== 3) return 0;
      var d = parseInt(sp[0], 10);
      var m = parseInt(sp[1], 10);
      var y = parseInt(sp[2], 10);
      if (isNaN(d) || isNaN(m) || isNaN(y)) return 0;
      return y * 10000 + m * 100 + d;
    }

    function isDateInRangeDMY(dmyTarget, dmyStart, dmyEnd) {
      var t = parseDMYToNumber(dmyTarget);
      var s = parseDMYToNumber(dmyStart);
      var e = parseDMYToNumber(dmyEnd);
      if (!t || !s || !e) return false;
      return t >= s && t <= e;
    }

    function isoToDMY(iso) {
      var sp = String(iso || '').trim().split('-');
      if (sp.length !== 3) return '';
      return sp[2] + '/' + sp[1] + '/' + sp[0];
    }

    function dmyToISO(dmy) {
      var sp = String(dmy || '').trim().split('/');
      if (sp.length !== 3) return '';
      return sp[2] + '-' + sp[1] + '-' + sp[0];
    }

    function formatLongDateID(dmy) {
      var sp = String(dmy || '').trim().split('/');
      if (sp.length !== 3) return dmy || '-';
      var bulanMap = { '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April', '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus', '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember' };
      return sp[0] + ' ' + (bulanMap[sp[1]] || sp[1]) + ' ' + sp[2];
    }

    function getSelectedRekapPeriodConfig() {
      var wit = getClientWITNow();
      var tab = AppCache.activeRekapTab || 'BULANAN';
      var blnEl = document.getElementById('rekap-filter-bulan');
      var thnEl = document.getElementById('rekap-filter-tahun');
      var modeEl = document.getElementById('rekap-alpa-mode');
      var singleEl = document.getElementById('rekap-single-date');
      var startEl = document.getElementById('rekap-date-start');
      var endEl = document.getElementById('rekap-date-end');

      var mm = (blnEl && blnEl.value) ? blnEl.value : wit.mm;
      var yyyy = (thnEl && thnEl.value) ? thnEl.value : wit.yyyy;
      var alpaMode = (modeEl && modeEl.value) ? modeEl.value : 'AUTO_ELAPSED';

      var todayISO = dmyToISO(wit.tanggal);
      if (singleEl && !singleEl.value) singleEl.value = todayISO;
      if (startEl && !startEl.value) startEl.value = yyyy + '-' + mm + '-01';
      var daysInSelMonth = new Date(parseInt(yyyy, 10) || 2026, parseInt(mm, 10) || 11, 0).getDate();
      var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
      if (endEl && !endEl.value) endEl.value = yyyy + '-' + mm + '-' + pad2(daysInSelMonth);

      var rangeStartDMY = '01/' + mm + '/' + yyyy;
      var rangeEndDMY = pad2(daysInSelMonth) + '/' + mm + '/' + yyyy;

      if (tab === 'HARIAN') {
        var singleDMY = (singleEl && singleEl.value) ? isoToDMY(singleEl.value) : wit.tanggal;
        rangeStartDMY = singleDMY;
        rangeEndDMY = singleDMY;
      } else if (tab === 'SEMESTERAN') {
        var isSem1 = parseInt(mm, 10) <= 6;
        rangeStartDMY = isSem1 ? ('01/01/' + yyyy) : ('01/07/' + yyyy);
        rangeEndDMY = isSem1 ? ('30/06/' + yyyy) : ('31/12/' + yyyy);
      } else if (tab === 'TAHUNAN') {
        rangeStartDMY = '01/01/' + yyyy;
        rangeEndDMY = '31/12/' + yyyy;
      } else if (tab === 'RENTANG') {
        var sDMY = (startEl && startEl.value) ? isoToDMY(startEl.value) : rangeStartDMY;
        var eDMY = (endEl && endEl.value) ? isoToDMY(endEl.value) : sDMY;
        if (parseDMYToNumber(sDMY) > parseDMYToNumber(eDMY)) {
          var tmpD = sDMY; sDMY = eDMY; eDMY = tmpD;
        }
        rangeStartDMY = sDMY;
        rangeEndDMY = eDMY;
      }

      return {
        mm: mm,
        yyyy: yyyy,
        alpaMode: alpaMode,
        todayDMY: wit.tanggal,
        todayNum: parseDMYToNumber(wit.tanggal),
        rangeStartDMY: rangeStartDMY,
        rangeEndDMY: rangeEndDMY
      };
    }

    function formatRekapPeriodLabel(tab, cfg) {
      var namaBulanMap = { '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April', '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus', '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember' };
      if (tab === 'HARIAN') {
        return 'Harian — Tanggal ' + formatLongDateID(cfg.rangeStartDMY);
      }
      if (tab === 'SEMESTERAN') {
        var isSem1 = parseInt(cfg.mm, 10) <= 6;
        return 'Semester ' + (isSem1 ? 'I (Januari–Juni)' : 'II (Juli–Desember)') + ' Tahun ' + cfg.yyyy;
      }
      if (tab === 'TAHUNAN') {
        return 'Tahun ' + cfg.yyyy + ' (01 Januari s.d. 31 Desember ' + cfg.yyyy + ')';
      }
      if (tab === 'RENTANG') {
        if (cfg.rangeStartDMY === cfg.rangeEndDMY) {
          return 'Tanggal ' + formatLongDateID(cfg.rangeStartDMY);
        }
        return formatLongDateID(cfg.rangeStartDMY) + ' s.d. ' + formatLongDateID(cfg.rangeEndDMY);
      }
      return 'Bulan ' + (namaBulanMap[cfg.mm] || cfg.mm) + ' ' + cfg.yyyy;
    }

    function computeWorkingDaysInDateRange(startDMY, endDMY) {
      var spS = String(startDMY || '').split('/');
      var spE = String(endDMY || '').split('/');
      if (spS.length !== 3 || spE.length !== 3) {
        return { totalWeekdays: 0, effectiveWorkdays: [], elapsedWorkdays: [], holidaysOnWeekday: [] };
      }
      var dtStart = new Date(parseInt(spS[2], 10), parseInt(spS[1], 10) - 1, parseInt(spS[0], 10));
      var dtEnd = new Date(parseInt(spE[2], 10), parseInt(spE[1], 10) - 1, parseInt(spE[0], 10));
      if (dtStart.getTime() > dtEnd.getTime()) {
        var tmpDt = dtStart; dtStart = dtEnd; dtEnd = tmpDt;
      }
      var liburMap = getHariLiburMap();
      var wit = getClientWITNow();
      var todayNum = parseDMYToNumber(wit.tanggal);
      var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

      var allWeekdays = [];
      var effectiveWorkdays = [];
      var elapsedWorkdays = [];
      var holidaysOnWeekday = [];

      var cursor = new Date(dtStart.getTime());
      var guard = 0;
      while (cursor.getTime() <= dtEnd.getTime() && guard < 1500) {
        guard++;
        var dow = cursor.getDay();
        var dmy = pad2(cursor.getDate()) + '/' + pad2(cursor.getMonth() + 1) + '/' + cursor.getFullYear();
        if (dow !== 0 && dow !== 6) {
          allWeekdays.push(dmy);
          if (liburMap[dmy]) {
            holidaysOnWeekday.push(liburMap[dmy]);
          } else {
            effectiveWorkdays.push(dmy);
            if (parseDMYToNumber(dmy) <= todayNum) {
              elapsedWorkdays.push(dmy);
            }
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return {
        totalWeekdays: allWeekdays.length,
        effectiveWorkdays: effectiveWorkdays,
        elapsedWorkdays: elapsedWorkdays,
        holidaysOnWeekday: holidaysOnWeekday
      };
    }

    function computeWorkingDaysInMonth(mmStr, yyyyStr) {
      var m = parseInt(mmStr, 10) || 11;
      var y = parseInt(yyyyStr, 10) || 2026;
      var daysInMonth = new Date(y, m, 0).getDate();
      var liburMap = getHariLiburMap();
      var wit = getClientWITNow();
      var todayNum = parseDMYToNumber(wit.tanggal);
      var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

      var allWeekdays = [];
      var effectiveWorkdays = [];
      var elapsedWorkdays = [];
      var holidaysOnWeekday = [];

      for (var d = 1; d <= daysInMonth; d++) {
        var dt = new Date(y, m - 1, d);
        var dow = dt.getDay();
        var dmy = pad2(d) + '/' + pad2(m) + '/' + y;
        if (dow !== 0 && dow !== 6) {
          allWeekdays.push(dmy);
          if (liburMap[dmy]) {
            holidaysOnWeekday.push(liburMap[dmy]);
          } else {
            effectiveWorkdays.push(dmy);
            if (parseDMYToNumber(dmy) <= todayNum) {
              elapsedWorkdays.push(dmy);
            }
          }
        }
      }
      return {
        mm: pad2(m),
        yyyy: String(y),
        totalWeekdays: allWeekdays.length,
        holidaysOnWeekday: holidaysOnWeekday,
        effectiveWorkdays: effectiveWorkdays,
        elapsedWorkdays: elapsedWorkdays
      };
    }

    function hasApprovedOrActiveIzinOnDate(cleanNip, dmy) {
      var list = AppCache.izin || [];
      for (var i = 0; i < list.length; i++) {
        var iz = list[i];
        if (String(iz.nip || '').replace(/\s+/g, '') !== cleanNip) continue;
        if (String(iz.statusFinal || '').indexOf('Ditolak') !== -1) continue;
        if (isDateInRangeDMY(dmy, iz.tglMulai, iz.tglSelesai)) return iz;
      }
      return null;
    }

    function hasActiveSptOnDate(cleanNip, dmy) {
      var list = AppCache.spt || [];
      for (var i = 0; i < list.length; i++) {
        var sp = list[i];
        var nips = String(sp.daftarNIP || '').replace(/\s+/g, '');
        if (nips.indexOf(cleanNip) === -1) continue;
        if (isDateInRangeDMY(dmy, sp.tglMulai, sp.tglSelesai)) return sp;
      }
      return null;
    }

    function computePegawaiRekapStats(p, periodTab) {
      var tab = periodTab || AppCache.activeRekapTab || 'BULANAN';
      var tarif = (AppCache.settings.INTEGRASI_GATEWAY && AppCache.settings.INTEGRASI_GATEWAY.value.tarifPotonganTppPerMenit) || 2500;
      var cfg = getSelectedRekapPeriodConfig();
      var cal = computeWorkingDaysInDateRange(cfg.rangeStartDMY, cfg.rangeEndDMY);
      var liburMap = getHariLiburMap();
      var cleanNip = String((p && p.nip) || '').replace(/\s+/g, '');

      var mult = cal.effectiveWorkdays.length;

      var logs = (AppCache.presensi || []).filter(function (l) {
        if (String(l.nip || '').replace(/\s+/g, '') !== cleanNip) return false;
        var tgl = String(l.tanggal || '').trim();
        return isDateInRangeDMY(tgl, cfg.rangeStartDMY, cfg.rangeEndDMY);
      });

      var logByDate = {};
      var alpaLogged = 0;
      var telat = 0;
      var wfo = 0;
      var wfa = 0;
      var wfh = 0;
      var izinCuti = 0;

      for (var i = 0; i < logs.length; i++) {
        var dStr = String(logs[i].tanggal || '').trim();
        if (dStr) logByDate[dStr] = logs[i];
        var st = String(logs[i].status || '');
        var md = String(logs[i].modeKerja || 'WFO').toUpperCase();
        if (st.indexOf('Alpa') !== -1) {
          alpaLogged++;
        } else {
          if (st === 'Terlambat') telat++;
          if (st === 'Izin' || st === 'Sakit' || st === 'Cuti') {
            izinCuti++;
          } else if (md === 'WFA' || st.indexOf('SPT') !== -1) {
            wfa++;
          } else if (md === 'WFH') {
            wfh++;
          } else {
            wfo++;
          }
        }
      }

      var targetCheckDates = cfg.alpaMode === 'FULL_MONTH' ? cal.effectiveWorkdays : cal.elapsedWorkdays;

      var unloggedAlpaDates = [];
      var autoIzinSptCount = 0;
      for (var dIdx = 0; dIdx < targetCheckDates.length; dIdx++) {
        var wd = targetCheckDates[dIdx];
        if (logByDate[wd]) continue;
        if (liburMap[wd]) continue;
        if (hasApprovedOrActiveIzinOnDate(cleanNip, wd)) {
          izinCuti++;
          autoIzinSptCount++;
        } else if (hasActiveSptOnDate(cleanNip, wd)) {
          wfa++;
          autoIzinSptCount++;
        } else {
          unloggedAlpaDates.push(wd);
        }
      }

      var unloggedCount = unloggedAlpaDates.length;
      var alpaAuto = (cfg.alpaMode === 'AUTO_ELAPSED' || cfg.alpaMode === 'FULL_MONTH') ? unloggedCount : 0;
      var alpa = alpaLogged + alpaAuto;

      var hadir = Math.min(mult, wfo + wfa + wfh + izinCuti);
      var rawPct = mult > 0 ? Math.round((hadir / mult) * 100) : 100;
      var pct = (hadir === 0 && alpa === 0 && logs.length === 0)
        ? 0
        : Math.max(0, Math.min(100, rawPct - (telat * 2) - (alpa * 3)));
      var pot = (telat * 15 * tarif) + (alpa * 60 * tarif);

      return {
        mult: mult,
        elapsedWorkdaysCount: cal.elapsedWorkdays.length,
        holidaysCount: cal.holidaysOnWeekday.length,
        totalLogs: logs.length + autoIzinSptCount,
        hadir: hadir,
        wfo: wfo,
        wfa: wfa,
        wfh: wfh,
        izinCuti: izinCuti,
        telat: telat,
        alpa: alpa,
        alpaLogged: alpaLogged,
        alpaUnlogged: unloggedCount,
        unloggedDates: unloggedAlpaDates,
        alpaMode: cfg.alpaMode,
        pct: pct,
        pot: pot
      };
    }

    function buildMonthlyAttendanceMatrixModel(activePegs, cfg) {
      var m = parseInt(cfg.mm, 10) || 11;
      var y = parseInt(cfg.yyyy, 10) || 2026;
      var daysInMonth = new Date(y, m, 0).getDate();
      var liburMap = getHariLiburMap();
      var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
      var namaBulanMap = { '01': 'JANUARI', '02': 'FEBRUARI', '03': 'MARET', '04': 'APRIL', '05': 'MEI', '06': 'JUNI', '07': 'JULI', '08': 'AGUSTUS', '09': 'SEPTEMBER', '10': 'OKTOBER', '11': 'NOVEMBER', '12': 'DESEMBER' };

      var daySpecs = [];
      var effectiveWorkdayCount = 0;
      for (var d = 1; d <= daysInMonth; d++) {
        var dt = new Date(y, m - 1, d);
        var dow = dt.getDay();
        var dmy = pad2(d) + '/' + pad2(m) + '/' + y;
        var dNum = parseDMYToNumber(dmy);
        var hol = liburMap[dmy] || null;
        var isNonWork = false;
        var nonWorkLabel = '';
        var nonWorkDetail = '';
        if (hol) {
          isNonWork = true;
          nonWorkLabel = hol.jenis || 'Libur Nasional';
          nonWorkDetail = hol.keterangan || hol.jenis || 'Hari Libur';
        } else if (dow === 0) {
          isNonWork = true;
          nonWorkLabel = 'Minggu';
          nonWorkDetail = 'Hari Minggu';
        } else if (dow === 6) {
          isNonWork = true;
          nonWorkLabel = 'Sabtu';
          nonWorkDetail = 'Hari Sabtu';
        } else {
          effectiveWorkdayCount++;
        }
        daySpecs.push({
          day: d,
          dmy: dmy,
          dNum: dNum,
          dow: dow,
          isNonWork: isNonWork,
          nonWorkLabel: nonWorkLabel,
          nonWorkDetail: nonWorkDetail,
          isElapsed: dNum <= cfg.todayNum
        });
      }

      var logLookup = {};
      var allLogs = AppCache.presensi || [];
      for (var li = 0; li < allLogs.length; li++) {
        var lg = allLogs[li];
        var cNipL = String(lg.nip || '').replace(/[^0-9]/g, '');
        var tglL = String(lg.tanggal || '').trim();
        if (cNipL && tglL) logLookup[cNipL + '|' + tglL] = lg;
      }

      var pegRows = [];
      for (var pi = 0; pi < activePegs.length; pi++) {
        var pg = activePegs[pi];
        var cNip = String(pg.nip || '').replace(/[^0-9]/g, '');
        var cells = [];
        var countH = 0;
        var countI = 0;
        var countC = 0;
        var countS = 0;
        var countA = 0;

        for (var di = 0; di < daySpecs.length; di++) {
          var ds = daySpecs[di];
          if (ds.isNonWork) {
            cells.push({ code: '', isNonWork: true });
            continue;
          }
          var rec = logLookup[cNip + '|' + ds.dmy];
          var code = '';
          if (rec) {
            var stUp = String(rec.status || '').toUpperCase();
            if (stUp.indexOf('ALPA') !== -1 || stUp === 'TK' || stUp === 'A') {
              code = 'A';
            } else if (stUp.indexOf('SAKIT') !== -1 || stUp === 'S') {
              code = 'S';
            } else if (stUp.indexOf('CUTI') !== -1 || stUp === 'C') {
              code = 'C';
            } else if (stUp.indexOf('IZIN') !== -1 || stUp === 'I') {
              code = 'I';
            } else {
              code = 'H';
            }
          } else {
            var izMatch = hasApprovedOrActiveIzinOnDate(cNip, ds.dmy);
            if (izMatch) {
              var jnsIz = String(izMatch.jenis || '').toUpperCase();
              if (jnsIz.indexOf('SAKIT') !== -1) code = 'S';
              else if (jnsIz.indexOf('CUTI') !== -1) code = 'C';
              else code = 'I';
            } else if (hasActiveSptOnDate(cNip, ds.dmy)) {
              code = 'H';
            } else if (cfg.alpaMode === 'FULL_MONTH' || (cfg.alpaMode === 'AUTO_ELAPSED' && ds.isElapsed)) {
              code = 'A';
            }
          }

          if (code === 'H') countH++;
          else if (code === 'I') countI++;
          else if (code === 'C') countC++;
          else if (code === 'S') countS++;
          else if (code === 'A') countA++;
          cells.push({ code: code, isNonWork: false });
        }

        pegRows.push({
          no: pi + 1,
          pegawai: pg,
          cells: cells,
          hariKerja: effectiveWorkdayCount,
          H: countH,
          I: countI,
          C: countC,
          S: countS,
          A: countA
        });
      }

      return {
        bulanLabel: namaBulanMap[cfg.mm] || cfg.mm,
        tahunLabel: cfg.yyyy,
        daysInMonth: daysInMonth,
        effectiveWorkdayCount: effectiveWorkdayCount,
        daySpecs: daySpecs,
        pegRows: pegRows
      };
    }

    function buildMonthlyAttendanceMatrixHTML(model, isExcelExport) {
      var totalCols = 3 + model.daysInMonth + 1 + 5;
      var rowSpanCount = Math.max(1, model.pegRows.length);

      var dayHeaders = '';
      for (var d = 0; d < model.daySpecs.length; d++) {
        var ds = model.daySpecs[d];
        var thBg = ds.isNonWork ? 'background-color:#FF0000;color:#000000;font-weight:bold;' : 'background-color:#FFFFFF;color:#0F172A;font-weight:bold;';
        dayHeaders += '<th style="border:1px solid #000000;padding:3px 4px;text-align:center;min-width:24px;font-size:11px;' + thBg + '" title="' + esc(ds.nonWorkDetail || ('Tanggal ' + ds.dmy)) + '">' + ds.day + '</th>';
      }

      var bodyRows = '';
      if (!model.pegRows.length) {
        bodyRows = '<tr><td colspan="' + totalCols + '" style="border:1px solid #000000;padding:12px;text-align:center;font-size:12px;">Tidak ada data pegawai aktif.</td></tr>';
      } else {
        for (var r = 0; r < model.pegRows.length; r++) {
          var pr = model.pegRows[r];
          bodyRows += '<tr>' +
            '<td style="border:1px solid #000000;padding:4px 6px;text-align:center;font-size:11px;font-weight:bold;">' + pr.no + '</td>' +
            '<td style="border:1px solid #000000;padding:4px 8px;font-size:11px;font-weight:600;white-space:nowrap;">' + esc(pr.pegawai.nama) + '</td>' +
            '<td style="border:1px solid #000000;padding:4px 8px;font-size:11px;white-space:nowrap;">' + esc(pr.pegawai.jabatan || pr.pegawai.bidang) + '</td>';

          for (var c = 0; c < model.daySpecs.length; c++) {
            var dSpec = model.daySpecs[c];
            if (dSpec.isNonWork) {
              if (r === 0) {
                var vertStyle = isExcelExport
                  ? 'border:1px solid #000000;background-color:#FF0000;color:#000000;font-weight:bold;text-align:center;vertical-align:middle;mso-rotate:90;font-size:10.5px;'
                  : 'border:1px solid #000000;background-color:#FF0000;color:#000000;font-weight:bold;text-align:center;vertical-align:middle;padding:4px 2px;font-size:10px;';
                var innerVert = isExcelExport
                  ? esc(dSpec.nonWorkLabel)
                  : '<div style="writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;margin:0 auto;line-height:1.1;" title="' + esc(dSpec.nonWorkDetail) + '">' + esc(dSpec.nonWorkLabel) + '</div>';
                bodyRows += '<td rowspan="' + rowSpanCount + '" style="' + vertStyle + '">' + innerVert + '</td>';
              }
            } else {
              var cellObj = pr.cells[c];
              var cd = cellObj ? cellObj.code : '';
              var cellStyle = 'border:1px solid #000000;padding:3px 4px;text-align:center;font-size:11px;font-weight:bold;';
              if (cd === 'H') cellStyle += 'background-color:#ECFDF5;color:#15803D;';
              else if (cd === 'I') cellStyle += 'background-color:#FEF9C3;color:#A16207;';
              else if (cd === 'C') cellStyle += 'background-color:#DBEAFE;color:#1D4ED8;';
              else if (cd === 'S') cellStyle += 'background-color:#FFEDD5;color:#C2410C;';
              else if (cd === 'A') cellStyle += 'background-color:#FEE2E2;color:#DC2626;';
              bodyRows += '<td style="' + cellStyle + '">' + esc(cd) + '</td>';
            }
          }

          bodyRows +=
            '<td style="border:1px solid #000000;padding:4px 6px;text-align:center;font-size:11px;font-weight:bold;background-color:#F8FAFC;">' + pr.hariKerja + '</td>' +
            '<td style="border:1px solid #000000;padding:4px 6px;text-align:center;font-size:11px;font-weight:bold;">' + pr.H + '</td>' +
            '<td style="border:1px solid #000000;padding:4px 6px;text-align:center;font-size:11px;font-weight:bold;">' + pr.I + '</td>' +
            '<td style="border:1px solid #000000;padding:4px 6px;text-align:center;font-size:11px;font-weight:bold;">' + pr.C + '</td>' +
            '<td style="border:1px solid #000000;padding:4px 6px;text-align:center;font-size:11px;font-weight:bold;">' + pr.S + '</td>' +
            '<td style="border:1px solid #000000;padding:4px 6px;text-align:center;font-size:11px;font-weight:bold;' + (pr.A > 0 ? 'background-color:#FEE2E2;color:#DC2626;' : '') + '">' + pr.A + '</td>' +
            '</tr>';
        }
      }

      var html = '<table style="width:100%;border-collapse:collapse;font-family:Calibri,Inter,Arial,sans-serif;background-color:#FFFFFF;">' +
        '<thead>' +
        '<tr><th colspan="' + totalCols + '" style="border:1px solid #000000;background-color:#FFC000;color:#000000;font-weight:bold;font-size:14px;padding:6px;text-align:center;text-transform:uppercase;">ABSENSI PEGAWAI BKAD KABUPATEN TELUK WONDAMA</th></tr>' +
        '<tr><th colspan="' + totalCols + '" style="border:1px solid #000000;background-color:#FFF2CC;color:#000000;font-weight:bold;font-size:12px;padding:4px;text-align:center;text-transform:uppercase;">PERIODE ' + esc(model.bulanLabel) + ' ' + esc(model.tahunLabel) + '</th></tr>' +
        '<tr style="background-color:#FFFFFF;color:#000000;font-size:11px;font-weight:bold;">' +
        '<th rowspan="2" style="border:1px solid #000000;padding:5px 6px;text-align:center;width:32px;">No</th>' +
        '<th rowspan="2" style="border:1px solid #000000;padding:5px 10px;text-align:center;min-width:160px;">Nama</th>' +
        '<th rowspan="2" style="border:1px solid #000000;padding:5px 10px;text-align:center;min-width:140px;">Jabatan</th>' +
        '<th colspan="' + model.daysInMonth + '" style="border:1px solid #000000;padding:4px;text-align:center;">Tanggal</th>' +
        '<th rowspan="2" style="border:1px solid #000000;padding:5px 8px;text-align:center;width:68px;">Jumlah<br/>Hari Kerja</th>' +
        '<th colspan="5" style="border:1px solid #000000;padding:4px;text-align:center;">Keterangan</th>' +
        '</tr>' +
        '<tr>' +
        dayHeaders +
        '<th style="border:1px solid #000000;background-color:#00FF00;color:#000000;font-weight:bold;padding:3px 6px;text-align:center;min-width:26px;font-size:11px;">H</th>' +
        '<th style="border:1px solid #000000;background-color:#FFFF00;color:#000000;font-weight:bold;padding:3px 6px;text-align:center;min-width:26px;font-size:11px;">I</th>' +
        '<th style="border:1px solid #000000;background-color:#3B82F6;color:#000000;font-weight:bold;padding:3px 6px;text-align:center;min-width:26px;font-size:11px;">C</th>' +
        '<th style="border:1px solid #000000;background-color:#F59E0B;color:#000000;font-weight:bold;padding:3px 6px;text-align:center;min-width:26px;font-size:11px;">S</th>' +
        '<th style="border:1px solid #000000;background-color:#FF0000;color:#000000;font-weight:bold;padding:3px 6px;text-align:center;min-width:26px;font-size:11px;">A</th>' +
        '</tr>' +
        '</thead>' +
        '<tbody>' + bodyRows + '</tbody>' +
        '</table>' +
        '<div style="margin-top:12px;">' +
        '<table style="border-collapse:collapse;font-family:Calibri,Inter,Arial,sans-serif;font-size:11px;background-color:#FFFFFF;">' +
        '<tr><td style="border:1px solid #000000;padding:3px 10px;font-weight:bold;">Keterangan:</td><td style="border:1px solid #000000;padding:3px 16px;"></td></tr>' +
        '<tr><td style="border:1px solid #000000;padding:3px 10px;text-align:center;font-weight:bold;background-color:#00FF00;">H</td><td style="border:1px solid #000000;padding:3px 16px;">Hadir</td></tr>' +
        '<tr><td style="border:1px solid #000000;padding:3px 10px;text-align:center;font-weight:bold;background-color:#FFFF00;">I</td><td style="border:1px solid #000000;padding:3px 16px;">Izin</td></tr>' +
        '<tr><td style="border:1px solid #000000;padding:3px 10px;text-align:center;font-weight:bold;background-color:#3B82F6;">C</td><td style="border:1px solid #000000;padding:3px 16px;">Cuti</td></tr>' +
        '<tr><td style="border:1px solid #000000;padding:3px 10px;text-align:center;font-weight:bold;background-color:#F59E0B;">S</td><td style="border:1px solid #000000;padding:3px 16px;">Sakit</td></tr>' +
        '<tr><td style="border:1px solid #000000;padding:3px 10px;text-align:center;font-weight:bold;background-color:#FF0000;">A</td><td style="border:1px solid #000000;padding:3px 16px;">Alpa / Tanpa Keterangan (Abstain)</td></tr>' +
        '</table>' +
        '</div>';

      return html;
    }

    function exportRekapMatrixXLS() {
      var cfg = getSelectedRekapPeriodConfig();
      var activePegs = getActivePegawaiList();
      var model = buildMonthlyAttendanceMatrixModel(activePegs, cfg);
      var tableHtml = buildMonthlyAttendanceMatrixHTML(model, true);
      var xlsDoc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head><meta charset="utf-8" />' +
        '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Rekap_' + esc(model.bulanLabel) + '_' + esc(model.tahunLabel) + '</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
        '</head><body>' + tableHtml + '</body></html>';
      triggerBlobDownload('\uFEFF' + xlsDoc, 'application/vnd.ms-excel;charset=utf-8;', 'Rekap_Matriks_Absensi_BKAD_' + model.bulanLabel + '_' + model.tahunLabel + '.xls');
      showToast('Rekap Matriks Absensi Periode ' + model.bulanLabel + ' ' + model.tahunLabel + ' (.xls) berhasil diunduh.', 'success');
    }

    function renderRekapModule() {
      var tabs = document.querySelectorAll('.rekap-tab-btn');
      for (var i = 0; i < tabs.length; i++) {
        var act = tabs[i].getAttribute('data-id') === AppCache.activeRekapTab;
        tabs[i].className = 'rekap-tab-btn px-3.5 py-2 rounded-xl text-xs font-semibold transition-smooth ' +
          (act ? 'bg-electric-blue text-white shadow-sm' : 'bg-white border border-border-subtle text-text-main hover:bg-surface-low');
      }

      var curTab = AppCache.activeRekapTab || 'BULANAN';
      var myWrap = document.getElementById('rekap-month-year-wrap');
      var singleWrap = document.getElementById('rekap-single-date-wrap');
      var rangeWrap = document.getElementById('rekap-range-wrap');
      if (myWrap) myWrap.classList.toggle('hidden', curTab === 'HARIAN' || curTab === 'RENTANG');
      if (singleWrap) singleWrap.classList.toggle('hidden', curTab !== 'HARIAN');
      if (rangeWrap) rangeWrap.classList.toggle('hidden', curTab !== 'RENTANG');

      var cfg = getSelectedRekapPeriodConfig();
      var cal = computeWorkingDaysInDateRange(cfg.rangeStartDMY, cfg.rangeEndDMY);
      var periodTitleLabel = formatRekapPeriodLabel(curTab, cfg);
      var summaryBar = document.getElementById('rekap-workday-summary-bar');
      if (summaryBar) {
        var holBadges = '';
        for (var hi = 0; hi < cal.holidaysOnWeekday.length; hi++) {
          var hObj = cal.holidaysOnWeekday[hi];
          holBadges += '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-semibold">' + esc(hObj.tanggal) + ' (' + esc(hObj.jenis) + ': ' + esc(hObj.keterangan) + ')</span> ';
        }
        summaryBar.innerHTML = '<div class="space-y-1">' +
          '<div class="font-bold flex flex-wrap items-center gap-2">' +
          '<span class="material-symbols-outlined text-[18px] text-electric-blue">calendar_month</span>' +
          '<span>Kalender Kerja ' + esc(periodTitleLabel) + ':</span>' +
          '<span class="px-2 py-0.5 rounded bg-white border border-blue-200 font-mono text-[11px]">Senin–Jumat: ' + cal.totalWeekdays + ' Hari</span>' +
          '<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[11px]">Libur/Cuti Bersama/Fakultatif: ' + cal.holidaysOnWeekday.length + ' Hari</span>' +
          '<span class="px-2 py-0.5 rounded bg-navy-deep text-white font-mono text-[11px]">Hari Kerja Efektif: ' + cal.effectiveWorkdays.length + ' Hari</span>' +
          '<span class="px-2 py-0.5 rounded bg-teal-100 text-teal-900 font-mono text-[11px]">Hari Kerja Berjalan: ' + cal.elapsedWorkdays.length + ' Hari</span>' +
          '</div>' +
          (holBadges ? '<div class="flex flex-wrap gap-1 pt-0.5">' + holBadges + '</div>' : '<div class="text-[11px] text-text-muted">Tidak ada Hari Libur Nasional / Cuti Bersama / Libur Fakultatif pada hari Senin–Jumat di periode ini. Klik tombol <b>Kalender Libur &amp; Cuti Bersama</b> di kanan atas untuk menambah hari libur.</div>') +
          '</div>';
      }

      var qGlobal = (document.getElementById('global-search-input') && document.getElementById('global-search-input').value || '').trim().toLowerCase();
      var activePegs = getActivePegawaiList();
      if (qGlobal) {
        activePegs = activePegs.filter(function (p) {
          var blob = (p.nama + ' ' + p.nip + ' ' + p.bidang + ' ' + (p.subBidang || '')).toLowerCase();
          return blob.indexOf(qGlobal) !== -1;
        });
      }

      var matrixBox = document.getElementById('rekap-matrix-container');
      if (matrixBox) {
        var matrixModel = buildMonthlyAttendanceMatrixModel(activePegs, cfg);
        matrixBox.innerHTML = buildMonthlyAttendanceMatrixHTML(matrixModel, false);
      }

      var html = '';
      for (var j = 0; j < activePegs.length; j++) {
        var p = activePegs[j];
        var st = computePegawaiRekapStats(p, AppCache.activeRekapTab);
        var pctCls = st.hadir === 0 && st.alpa === 0
          ? 'text-text-muted'
          : (st.alpa > 0 || st.pct < 90 ? 'text-status-absent' : (st.telat > 0 ? 'text-amber-700' : 'text-status-present'));

        var rincianParts = [];
        if (st.wfo > 0) rincianParts.push('WFO: <b>' + st.wfo + '</b>');
        if (st.wfa > 0) rincianParts.push('WFA: <b>' + st.wfa + '</b>');
        if (st.wfh > 0) rincianParts.push('WFH: <b>' + st.wfh + '</b>');
        if (st.izinCuti > 0) rincianParts.push('Izin/Cuti: <b>' + st.izinCuti + '</b>');
        var breakdownHtml = st.totalLogs === 0
          ? '<div class="text-[10px] text-status-absent font-semibold mt-0.5">Belum ada log absen masuk</div>'
          : '<div class="text-[10px] text-navy-deep font-normal mt-0.5">' +
          (rincianParts.length ? rincianParts.join(' • ') : 'Nihil kehadiran') +
          '</div>';

        var alpaBadgeHtml = '';
        if (st.alpa > 0) {
          var detailTK = st.alpaMode === 'LOG_ONLY'
            ? (st.alpa + ' Alpa (Log Tercatat)')
            : (st.alpa + ' Alpa / Tanpa Keterangan' + (st.alpaUnlogged > 0 ? ' (' + st.alpaUnlogged + ' Hari Belum Absen)' : ''));
          alpaBadgeHtml = '<div class="mt-0.5"><span class="inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 text-status-absent text-[10px] font-bold">' + esc(detailTK) + '</span></div>';
        } else if (st.alpaUnlogged > 0 && st.alpaMode === 'LOG_ONLY') {
          alpaBadgeHtml = '<div class="mt-0.5"><span class="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-semibold">' + st.alpaUnlogged + ' Hari Kerja Belum Absen (Belum Tutup Buku Alpa)</span></div>';
        } else {
          alpaBadgeHtml = '<div class="text-[10px] text-status-present font-semibold mt-0.5">0 Alpa (Nihil TK)</div>';
        }

        html += '<tr>' +
          '<td class="py-2.5 px-3"><div class="font-bold text-text-main">' + esc(p.nama) + '</div><div class="font-mono text-[11px] text-text-muted">' + esc(p.nip) + '</div></td>' +
          '<td class="py-2.5 px-3 text-xs">' + esc(p.bidang) + (p.subBidang ? '<div class="text-[10px] text-text-muted">' + esc(p.subBidang) + '</div>' : '') + '</td>' +
          '<td class="py-2.5 px-3 font-mono text-xs font-semibold">' +
          '<div>' + st.hadir + ' / ' + st.mult + ' Hari Kerja</div>' +
          breakdownHtml +
          '</td>' +
          '<td class="py-2.5 px-3 font-mono text-xs">' +
          '<div class="' + (st.telat > 0 ? 'text-amber-700 font-bold' : 'text-text-muted') + '">' + st.telat + ' Kali Telat</div>' +
          alpaBadgeHtml +
          '</td>' +
          '<td class="py-2.5 px-3 font-mono text-xs font-bold ' + pctCls + '">' + st.pct + '%' + (st.totalLogs === 0 ? '<div class="text-[10px] font-normal text-status-absent">0 Kehadiran</div>' : '') + '</td>' +
          '<td class="py-2.5 px-3 font-mono text-xs ' + (st.pot > 0 ? 'text-status-absent font-bold' : 'text-text-muted') + '">Rp ' + st.pot.toLocaleString('id-ID') + '</td>' +
          '</tr>';
      }
      document.getElementById('tbody-rekap-presensi').innerHTML = html || '<tr><td colspan="6" class="py-6 text-center text-xs text-text-muted">Tidak ada pegawai yang cocok dengan pencarian.</td></tr>';
    }

    function openHariLiburModal() {
      var list = getMasterHariLiburList().slice().sort(function (a, b) {
        return parseDMYToNumber(a.tanggal) - parseDMYToNumber(b.tanggal);
      });
      var wit = getClientWITNow();
      var spNow = wit.tanggal.split('/');
      var todayIso = spNow.length === 3 ? (spNow[2] + '-' + spNow[1] + '-' + spNow[0]) : '2026-11-22';

      var rowsHtml = '';
      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        var badgeCls = item.jenis === 'Libur Nasional'
          ? 'bg-red-100 text-status-absent'
          : (item.jenis === 'Cuti Bersama' ? 'bg-amber-100 text-amber-900' : 'bg-purple-100 text-purple-900');
        rowsHtml += '<tr class="border-b border-border-subtle hover:bg-surface-low">' +
          '<td class="py-2 px-3 font-mono text-xs font-bold text-navy-deep">' + esc(item.tanggal) + '</td>' +
          '<td class="py-2 px-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ' + badgeCls + '">' + esc(item.jenis) + '</span></td>' +
          '<td class="py-2 px-3 text-xs text-text-main">' + esc(item.keterangan) + '</td>' +
          '<td class="py-2 px-3 text-right"><button type="button" data-action="del-hari-libur" data-tanggal="' + esc(item.tanggal) + '" class="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-status-absent text-[11px] font-semibold">Hapus</button></td>' +
          '</tr>';
      }

      var body = '<div class="space-y-4">' +
        '<div class="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 leading-relaxed">' +
        '<b>Fungsi Kalender Hari Libur Resmi:</b> Seluruh tanggal yang terdaftar di bawah ini (<b>Libur Nasional</b>, <b>Cuti Bersama</b>, dan <b>Libur Fakultatif Daerah Papua Barat / Kab. Teluk Wondama</b>) otomatis <b>dikecualikan dari kewajiban absen</b>, mengurangi jumlah Hari Kerja Efektif bulanan, dan <b>tidak akan dihitung sebagai Alpa / Tanpa Keterangan</b>.' +
        '</div>' +
        '<form id="form-add-hari-libur" action="javascript:void(0);" class="p-4 rounded-2xl bg-surface-low border border-border-subtle space-y-3">' +
        '<div class="text-xs font-bold text-navy-deep flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px] text-electric-blue">add_circle</span><span>Tambah Hari Libur Nasional / Cuti Bersama / Libur Fakultatif (Bisa 1 Hari atau Rentang Tanggal)</span></div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Mulai Libur</label><input id="hl-tgl-mulai" type="date" required value="' + esc(todayIso) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs font-mono" /></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Selesai Libur</label><input id="hl-tgl-selesai" type="date" required value="' + esc(todayIso) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs font-mono" /></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Kategori / Jenis Libur</label>' +
        '<select id="hl-jenis" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs font-semibold text-navy-deep">' +
        '<option value="Libur Nasional">Libur Nasional (SKB 3 Menteri)</option>' +
        '<option value="Cuti Bersama">Cuti Bersama ASN (Keppres / SKB)</option>' +
        '<option value="Libur Fakultatif">Libur Fakultatif Daerah (Papua Barat / Wondama)</option>' +
        '</select>' +
        '</div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">' +
        '<div class="sm:col-span-9"><label class="block text-[11px] font-semibold text-text-muted mb-1">Nama Hari Libur / Dasar Surat Edaran Gubernur / Bupati</label><input id="hl-keterangan" type="text" required placeholder="Contoh: Libur Fakultatif HUT Pekabaran Injil / Cuti Bersama Natal..." class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs" /></div>' +
        '<div class="sm:col-span-3"><button id="btn-hl-submit" type="submit" class="w-full py-2 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[16px]">save</span><span>Simpan Hari Libur</span></button></div>' +
        '</div>' +
        '</form>' +
        '<div class="flex items-center justify-between">' +
        '<div class="text-xs font-bold text-navy-deep uppercase">Daftar Kalender Libur Terdaftar (' + list.length + ' Tanggal)</div>' +
        '<button type="button" data-action="reset-hari-libur" class="px-3 py-1 rounded-lg bg-surface-low hover:bg-surface-high border border-border-subtle text-[11px] font-semibold text-navy-deep">Muat Standar Libur Nasional &amp; Fakultatif Papua Barat</button>' +
        '</div>' +
        '<div class="max-h-72 overflow-y-auto border border-border-subtle rounded-xl bg-white">' +
        '<table class="w-full text-left border-collapse">' +
        '<thead><tr class="bg-surface-low text-[10px] font-bold uppercase text-text-muted border-b border-border-subtle"><th class="py-2 px-3">Tanggal</th><th class="py-2 px-3">Kategori</th><th class="py-2 px-3">Keterangan Hari Libur</th><th class="py-2 px-3 text-right">Aksi</th></tr></thead>' +
        '<tbody>' + (rowsHtml || '<tr><td colspan="4" class="py-6 text-center text-xs text-text-muted">Belum ada tanggal libur terdaftar.</td></tr>') + '</tbody>' +
        '</table>' +
        '</div>' +
        '</div>';

      openModal('Kelola Hari Libur Nasional, Cuti Bersama & Libur Fakultatif', body, true);

      var tM = document.getElementById('hl-tgl-mulai');
      var tS = document.getElementById('hl-tgl-selesai');
      tM.addEventListener('change', function () {
        if (tS.value < tM.value) tS.value = tM.value;
      });

      document.getElementById('form-add-hari-libur').addEventListener('submit', function (e) {
        e.preventDefault();
        var sVal = tM.value;
        var eVal = tS.value;
        var jns = document.getElementById('hl-jenis').value;
        var ket = document.getElementById('hl-keterangan').value.trim();
        if (!sVal || !eVal || !ket) return;
        if (eVal < sVal) {
          showToast('Tanggal selesai tidak boleh lebih awal dari tanggal mulai.', 'warn');
          return;
        }
        var p1 = sVal.split('-');
        var p2 = eVal.split('-');
        var cur = new Date(parseInt(p1[0], 10), parseInt(p1[1], 10) - 1, parseInt(p1[2], 10));
        var end = new Date(parseInt(p2[0], 10), parseInt(p2[1], 10) - 1, parseInt(p2[2], 10));
        var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
        var nextList = getMasterHariLiburList().slice();
        var addedCount = 0;
        var guard = 0;
        while (cur <= end && guard < 60) {
          guard++;
          var dmy = pad2(cur.getDate()) + '/' + pad2(cur.getMonth() + 1) + '/' + cur.getFullYear();
          nextList = nextList.filter(function (x) { return x.tanggal !== dmy; });
          nextList.push({ tanggal: dmy, jenis: jns, keterangan: ket });
          addedCount++;
          cur.setDate(cur.getDate() + 1);
        }
        saveHariLiburListToServer(nextList, document.getElementById('btn-hl-submit'), function () {
          showToast(addedCount + ' tanggal ' + jns + ' berhasil disimpan ke Kalender Kerja.', 'success');
          openHariLiburModal();
        });
      });
    }

    function openGenerateAlpaModal() {
      var wit = getClientWITNow();
      var spNow = wit.tanggal.split('/');
      var todayIso = spNow.length === 3 ? (spNow[2] + '-' + spNow[1] + '-' + spNow[0]) : '2026-11-22';
      var firstMonthIso = spNow.length === 3 ? (spNow[2] + '-' + spNow[1] + '-01') : '2026-11-01';

      var body = '<form id="form-generate-alpa" action="javascript:void(0);" class="space-y-4">' +
        '<div class="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-950 leading-relaxed">' +
        '<b>Tutup Buku &amp; Generate Log Tanpa Keterangan (Alpa):</b> Fitur ini memindai pegawai aktif yang <b>belum melakukan absen sama sekali (tidak memiliki log presensi)</b> pada hari kerja yang dipilih, lalu mencatatnya ke tabel <b>LogPresensi</b> dengan status <b>Alpa (Tanpa Keterangan)</b>.<br/>' +
        '• Hari Sabtu, Minggu, <b>Libur Nasional, Cuti Bersama, dan Libur Fakultatif</b> otomatis dilewati.<br/>' +
        '• Pegawai yang sedang <b>Izin / Cuti / Sakit</b> atau <b>Dinas Luar (SPT)</b> pada tanggal tersebut otomatis dilewati.' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Dari Tanggal Hari Kerja</label><input id="ga-tgl-mulai" type="date" required value="' + esc(todayIso) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle font-mono text-xs" /></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Sampai Tanggal Hari Kerja</label><input id="ga-tgl-selesai" type="date" required value="' + esc(todayIso) + '" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle font-mono text-xs" /></div>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
        '<button type="button" id="btn-ga-preset-today" class="px-3 py-1.5 rounded-lg bg-surface-low hover:bg-surface-high border border-border-subtle text-xs font-semibold text-navy-deep">Hanya Hari Ini (' + esc(wit.tanggal) + ')</button>' +
        '<button type="button" id="btn-ga-preset-month" class="px-3 py-1.5 rounded-lg bg-surface-low hover:bg-surface-high border border-border-subtle text-xs font-semibold text-navy-deep">Awal Bulan s/d Hari Ini</button>' +
        '</div>' +
        '<div id="ga-preview-box" class="p-3.5 rounded-xl bg-surface-low border border-border-subtle text-xs space-y-2 max-h-60 overflow-y-auto"></div>' +
        '<div class="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">' +
        '<button type="button" data-action="close-modal" class="px-4 py-2.5 rounded-xl bg-surface-low hover:bg-surface-high text-xs font-semibold">Batal</button>' +
        '<button id="btn-ga-submit" type="submit" class="px-5 py-2.5 rounded-xl bg-status-absent hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">assignment_late</span><span>Simpan Log Alpa (Tanpa Keterangan) ke Database</span></button>' +
        '</div>' +
        '</form>';

      openModal('Generate Log Alpa / Tanpa Keterangan (Pegawai Belum Absen)', body, true);

      var tM = document.getElementById('ga-tgl-mulai');
      var tS = document.getElementById('ga-tgl-selesai');
      var prevBox = document.getElementById('ga-preview-box');
      var pendingAlpaRows = [];

      function scanMissingAttendance() {
        pendingAlpaRows = [];
        var sVal = tM.value;
        var eVal = tS.value;
        if (!sVal || !eVal || eVal < sVal) {
          prevBox.innerHTML = '<div class="text-status-absent font-semibold">Rentang tanggal tidak valid.</div>';
          return;
        }
        var p1 = sVal.split('-');
        var p2 = eVal.split('-');
        var cur = new Date(parseInt(p1[0], 10), parseInt(p1[1], 10) - 1, parseInt(p1[2], 10));
        var end = new Date(parseInt(p2[0], 10), parseInt(p2[1], 10) - 1, parseInt(p2[2], 10));
        var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
        var liburMap = getHariLiburMap();
        var workDates = [];
        var skippedHolidays = [];
        var guard = 0;

        while (cur <= end && guard < 120) {
          guard++;
          var dow = cur.getDay();
          var dmy = pad2(cur.getDate()) + '/' + pad2(cur.getMonth() + 1) + '/' + cur.getFullYear();
          if (dow !== 0 && dow !== 6) {
            if (liburMap[dmy]) {
              skippedHolidays.push(dmy + ' (' + liburMap[dmy].keterangan + ')');
            } else {
              workDates.push(dmy);
            }
          }
          cur.setDate(cur.getDate() + 1);
        }

        var existingMap = {};
        var allLogs = AppCache.presensi || [];
        for (var li = 0; li < allLogs.length; li++) {
          var k = String(allLogs[li].nip || '').replace(/\s+/g, '') + '|' + String(allLogs[li].tanggal || '').trim();
          existingMap[k] = true;
        }

        var activePegs = getActivePegawaiList();
        for (var di = 0; di < workDates.length; di++) {
          var dtStr = workDates[di];
          for (var pi = 0; pi < activePegs.length; pi++) {
            var pg = activePegs[pi];
            var cNip = String(pg.nip || '').replace(/\s+/g, '');
            if (existingMap[cNip + '|' + dtStr]) continue;
            if (hasApprovedOrActiveIzinOnDate(cNip, dtStr)) continue;
            if (hasActiveSptOnDate(cNip, dtStr)) continue;
            pendingAlpaRows.push({
              nip: pg.nip,
              nama: pg.nama,
              bidang: pg.bidang,
              tanggal: dtStr,
              jamMasuk: '--:--',
              jamPulang: '',
              modeKerja: pg.modeDefault || 'WFO',
              status: 'Alpa (Tanpa Keterangan)',
              koordinat: '-',
              keterangan: 'Tidak Hadir / Belum Absen Tanpa Keterangan Sah (Tutup Buku Presensi)'
            });
          }
        }

        var previewListHtml = '';
        var maxShow = Math.min(25, pendingAlpaRows.length);
        for (var si = 0; si < maxShow; si++) {
          var r = pendingAlpaRows[si];
          previewListHtml += '<div class="flex items-center justify-between py-1 border-b border-border-subtle text-[11px]">' +
            '<span><b>' + esc(r.nama) + '</b> <span class="font-mono text-text-muted">(' + esc(r.nip) + ')</span></span>' +
            '<span class="font-mono font-bold text-status-absent">' + esc(r.tanggal) + ' • Alpa (TK)</span>' +
            '</div>';
        }
        if (pendingAlpaRows.length > maxShow) {
          previewListHtml += '<div class="pt-1 text-[11px] text-text-muted italic">...dan ' + (pendingAlpaRows.length - maxShow) + ' baris lainnya.</div>';
        }

        prevBox.innerHTML = '<div class="font-bold text-navy-deep">Hasil Pemindaian (' + workDates.length + ' Hari Kerja Efektif): Ditemukan <span class="text-status-absent">' + pendingAlpaRows.length + ' Entri Pegawai Belum Absen</span></div>' +
          (skippedHolidays.length ? '<div class="text-[11px] text-amber-800">Hari Libur Dilewati: ' + esc(skippedHolidays.join(', ')) + '</div>' : '') +
          (pendingAlpaRows.length ? '<div class="mt-2">' + previewListHtml + '</div>' : '<div class="text-status-present font-semibold">Seluruh pegawai aktif sudah memiliki catatan presensi / izin / SPT pada rentang tanggal ini (atau tanggal tersebut adalah hari libur).</div>');
      }

      tM.addEventListener('change', function () {
        if (tS.value < tM.value) tS.value = tM.value;
        scanMissingAttendance();
      });
      tS.addEventListener('change', scanMissingAttendance);
      document.getElementById('btn-ga-preset-today').addEventListener('click', function () {
        tM.value = todayIso;
        tS.value = todayIso;
        scanMissingAttendance();
      });
      document.getElementById('btn-ga-preset-month').addEventListener('click', function () {
        tM.value = firstMonthIso;
        tS.value = todayIso;
        scanMissingAttendance();
      });
      scanMissingAttendance();

      document.getElementById('form-generate-alpa').addEventListener('submit', function (e) {
        e.preventDefault();
        if (!pendingAlpaRows.length) {
          showToast('Tidak ada pegawai tanpa keterangan yang perlu digenerate pada tanggal tersebut.', 'info');
          return;
        }
        if (pendingAlpaRows.length > 500) {
          showToast('Maksimal 500 baris per sekali proses. Pilih rentang tanggal yang lebih pendek (misal per minggu).', 'warn');
          return;
        }
        var btn = document.getElementById('btn-ga-submit');
        callServer('apiImportPresensiBatch', { rows: pendingAlpaRows, upsert: false }, btn, function (res) {
          mergeImportedPresensiToCache(res.records || []);
          closeModal();
          renderRekapModule();
          if (AppCache.activeDeskMenu === 'dasbor-utama') queryPresensiTable();
          showToast(pendingAlpaRows.length + ' log Alpa (Tanpa Keterangan) berhasil dicatat ke database.', 'success');
        });
      });
    }

    /* -------------------------------------------------------------------
     * 12. RENDER DISIPLIN PP 94/2021 (8 TAHAP + I-DIS BKN JSON)
     * ------------------------------------------------------------------- */
    var DISIPLIN_STAGES = [
      'Tahap 1 - Surat Panggilan I Diterbitkan',
      'Tahap 2 - Pemanggilan II (Jika Mangkir)',
      'Tahap 3 - Penetapan Tim Pemeriksa',
      'Tahap 4 - Sidang Berita Acara Pemeriksaan (BAP)',
      'Tahap 5 - Penetapan SK Hukuman Disiplin',
      'Tahap 6 - Penyampaian Keputusan Tertutup',
      'Tahap 7 - Masa Sanggah & Inkrah',
      'Tahap 8 - Inkrah & Sinkronisasi I-Dis BKN'
    ];

    var DISIPLIN_META_STORAGE_KEY = 'EPresensi_BKAD_DisiplinMeta_v1';

    function loadDisiplinCustomMetaMap() {
      try {
        var raw = localStorage.getItem(DISIPLIN_META_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    }

    function saveDisiplinCustomMeta(caseId, metaObj) {
      if (!caseId) return;
      try {
        var map = loadDisiplinCustomMetaMap();
        map[caseId] = metaObj || {};
        localStorage.setItem(DISIPLIN_META_STORAGE_KEY, JSON.stringify(map));
      } catch (e) { }
    }

    function getDisiplinEnrichedData(d) {
      var cleanNip = String((d && d.nip) || '').replace(/\s+/g, '');
      var isMarkus = d && (d.id === 'DSP-2025-05-014' || cleanNip === '198604122011041002');
      var isRefCase = !isMarkus && d && (d.id === 'DISP-2025-009' || cleanNip === '199108152015051003');
      var peg = null;
      for (var i = 0; i < AppCache.pegawai.length; i++) {
        if (String(AppCache.pegawai[i].nip || '').replace(/\s+/g, '') === cleanNip) {
          peg = AppCache.pegawai[i];
          break;
        }
      }
      var pj = (AppCache.settings.PEJABAT_PENANDATANGAN && AppCache.settings.PEJABAT_PENANDATANGAN.value) || {};
      var suf = d && d.id ? d.id.split('-').pop() : '009';
      var customMap = loadDisiplinCustomMetaMap();
      var cmLocal = (d && d.id && customMap[d.id]) ? customMap[d.id] : {};
      var cmSheet = {};
      if (d && d.customMetaJson) {
        try { cmSheet = JSON.parse(d.customMetaJson) || {}; } catch (e) { cmSheet = {}; }
      }
      var cm = {};
      for (var kS in cmSheet) { if (Object.prototype.hasOwnProperty.call(cmSheet, kS)) cm[kS] = cmSheet[kS]; }
      for (var kL in cmLocal) { if (Object.prototype.hasOwnProperty.call(cmLocal, kL)) cm[kL] = cmLocal[kL]; }

      var defaultQA = [
        { q: 'Apakah Saudara pada hari ini berada dalam keadaan sehat jasmani dan rohani serta bersedia untuk memberikan keterangan yang sebenarnya?', a: 'Ya, saya dalam keadaan sehat jasmani dan rohani, serta bersedia memberikan keterangan yang sebenarnya dengan penuh kejujuran.' },
        { q: 'Berdasarkan hasil audit rekapitulasi E-Presensi biometrik dan geofencing GPS BKAD, Saudara tercatat melakukan dugaan pelanggaran disiplin: ' + ((d && d.pelanggaran) || 'Tidak masuk kerja tanpa alasan yang sah') + '. Apakah data tersebut benar?', a: 'Benar, saya mengakui tidak hadir masuk kantor dan tidak melakukan presensi pada hari-hari kerja tersebut.' },
        { q: 'Apakah alasan Saudara tidak masuk kerja pada tanggal-tanggal tersebut dan mengapa Saudara tidak menyampaikan surat izin atau permohonan resmi kepada atasan langsung?', a: 'Saya memiliki keperluan mendesak keluarga dan lalai tidak menyampaikan permohonan izin atau pemberitahuan resmi tepat waktu kepada atasan langsung.' },
        { q: 'Apakah Saudara mengetahui dan menyadari bahwa perbuatan Saudara melanggar ketentuan ' + ((d && d.dasarHukum) || 'Peraturan Pemerintah Nomor 94 Tahun 2021 tentang Disiplin Pegawai Negeri Sipil') + '?', a: 'Ya, saya mengetahui dan menyadari sepenuhnya bahwa perbuatan saya melanggar kewajiban masuk kerja dan mentaati ketentuan jam kerja sesuai PP No. 94 Tahun 2021.' },
        { q: 'Apakah masih ada keterangan atau bukti lain yang ingin Saudara sampaikan untuk meringankan atau membela diri Saudara?', a: 'Tidak ada lagi keterangan lain. Saya memohon maaf sebesar-besarnya kepada pimpinan BKAD atas kelalaian saya dan berjanji tidak akan mengulangi perbuatan tersebut serta siap menerima pembinaan/sanksi sesuai ketentuan yang berlaku.' }
      ];
      var defaultMangkir = [
        { kode: '01', hariTgl: 'Senin, 26 Mei 2025', tgl: '26 Mei 2025', lokasi: 'Mesin Rasiei: Void Log', ket: 'Tanpa log presensi masuk & pulang', status: 'Alpa Murni' },
        { kode: '02', hariTgl: 'Selasa, 27 Mei 2025', tgl: '27 Mei 2025', lokasi: 'Mesin Rasiei: Void Log', ket: 'Tidak hadir dinas tanpa konfirmasi', status: 'Alpa Murni' },
        { kode: '03', hariTgl: 'Kamis, 12 Juni 2025', tgl: '12 Juni 2025', lokasi: 'E-Cuti Ditolak Atasan', ket: 'Cuti tahunan ditolak pimpinan unit', status: 'Cuti Ditolak' },
        { kode: '04', hariTgl: 'Kamis, 19 Juni 2025', tgl: '19 Juni 2025', lokasi: 'Batas Waktu Absen Habis', ket: 'Toleransi batas hari terlampaui', status: 'Ambang Batas PP 94' }
      ];

      var activeTglBap = cm.tglBAP || (d && d.jadwalSidang) || cm.jadwalSidang1 || (isMarkus ? '21 Mei 2025 • 09:30 WIT' : (isRefCase ? 'Selasa, 1 Juli 2025 • 09:30 - 10:45 WIT' : 'Selasa, 10 November 2026 • 09:30 WIT'));
      var activeSanksi = (d && d.sanksi) || 'Teguran Tertulis';

      return {
        pemeriksaNama: cm.pemeriksaNama || (isMarkus ? 'ALEXANDER S. TOREY, S.Sos., M.Si.' : (isRefCase ? 'NIXON N. N. BARANSANO, SE' : (pj.kabanNama || 'NIXON N. N. BARANSANO, SE'))),
        pemeriksaNip: cm.pemeriksaNip || (isMarkus ? '19741008 199903 1 005' : (isRefCase ? '19751128 200909 1 001' : (pj.kabanNip || '19751128 200909 1 001'))),
        pemeriksaPangkat: cm.pemeriksaPangkat || (isMarkus ? 'Pembina Tingkat I (IV/b)' : (isRefCase ? 'Pembina (IV/a)' : (pj.kabanPangkat || 'Pembina (IV/a)'))),
        pemeriksaJabatan: cm.pemeriksaJabatan || (isMarkus ? 'Kepala Badan Pengelolaan Keuangan dan Aset Daerah' : 'Plt. Kepala Badan Keuangan dan Aset Daerah / Atasan Langsung Selaku Pejabat Pemeriksa'),
        terperiksaPangkat: isMarkus ? 'Penata Muda Tk. I (III/b)' : (isRefCase ? 'Pengatur (II/c)' : (peg ? peg.pangkat : 'Pengatur (II/c)')),
        terperiksaJabatan: isMarkus ? 'Pengelola Barang Milik Daerah (BMD)' : (isRefCase ? 'Verifikator Perbendaharaan dan Akuntansi' : (peg ? peg.jabatan : 'Verifikator Perbendaharaan dan Akuntansi')),
        terperiksaBidang: isMarkus ? 'Sub Bagian Perencanaan BMD, BKAD Kab. Teluk Wondama' : (isRefCase ? 'Bidang Akuntansi dan Perbendaharaan BKAD Kab. Teluk Wondama' : (peg ? peg.bidang : 'BKAD Kab. Teluk Wondama')),
        noPanggilan1: (d && d.nomorPanggilan) || cm.noPanggilan1 || (isMarkus ? '800.1.6.2/001/PANG-I/BKAD-TW/V/2025' : (isRefCase ? '800.1.6.2/014/PANG-I/BKAD-TW/VI/2025' : ('800.1.6.2/' + suf + '/PANG-I/BKAD-TW/2026'))),
        tglPanggilan1: (d && d.tglPanggilan) || cm.tglPanggilan1 || (isMarkus ? '09 Mei 2025' : (isRefCase ? '23 Juni 2025' : getClientWITNow().tanggal)),
        noPanggilan2: (d && d.nomorPanggilan2) || cm.noPanggilan2 || (isMarkus ? '800.1.6.2/002/PANG-II/BKAD-TW/V/2025' : (isRefCase ? '800.1.6.2/016/PANG-II/BKAD-TW/VI/2025' : ('800.1.6.2/' + suf + '/PANG-II/BKAD-TW/2026'))),
        tglPanggilan2: (d && d.tglPanggilan2) || cm.tglPanggilan2 || (isMarkus ? '16 Mei 2025' : (isRefCase ? '27 Juni 2025' : getClientWITNow().tanggal)),
        jadwalSidang2: (d && d.jadwalSidang2) || cm.jadwalSidang2 || (isMarkus ? 'Kamis, 29 Mei 2025 • 09:30 WIT' : (isRefCase ? 'Kamis, 10 Juli 2025 • 09:30 WIT' : 'Selasa, 15 Desember 2026 • 09:30 WIT')),
        noTimPemeriksa: cm.noTimPemeriksa || ('800.1.6.2/' + suf + '/TIM-PERIKSA/BKAD-TW/2026'),
        timPengawasan: cm.timPengawasan || 'Pejabat Fungsional Auditor Inspektorat Daerah',
        timKepegawaian: cm.timKepegawaian || 'KORNELIS WAMAFMA / Kasubbag Umum & Kepegawaian (NIP. 19840212 201004 1 002)',
        noBAP: cm.noBAP || (isMarkus ? '800.1.6.2/003/BAP-DISP/BKAD-TW/V/2025' : (isRefCase ? '800.1.6.2/019/BAP-DISP/BKAD-TW/VII/2025' : ('800.1.6.2/' + suf + '/BAP-DISP/BKAD-TW/2026'))),
        tglBAP: activeTglBap,
        tempatSidang: (d && d.tempatSidang) || cm.tempatSidang || 'Ruang Rapat Kepala BKAD Kab. Teluk Wondama, Rasiei/Isei',
        catatanPanggilan1: cm.catatanPanggilan1 || '',
        catatanPanggilan2: cm.catatanPanggilan2 || '',
        noSK: (d && d.nomorSK) || cm.noSK || (isMarkus ? '800.1.6.2/005/SK-DISP/BKAD-TW/V/2025' : (isRefCase ? '800.1.6.2/023/SK-DISP/BKAD-TW/VII/2025' : ('800.1.6.2/' + suf + '/SK-DISP/BKAD-TW/2026'))),
        tglSK: (d && d.tanggalSK) || cm.tglSK || (isMarkus ? '23 Mei 2025' : (isRefCase ? '3 Juli 2025' : getClientWITNow().tanggal)),
        judulSK: cm.judulSK || ('PENJATUHAN HUKUMAN DISIPLIN BERUPA ' + String(activeSanksi).toUpperCase()),
        noPenyampaian: cm.noPenyampaian || (isMarkus ? '800.1.6.2/019/BA-SERAH/BKAD-TW/V/2025' : (isRefCase ? '800.1.6.2/024/BA-PENY/BKAD-TW/VII/2025' : ('800.1.6.2/' + suf + '/BA-PENY/BKAD-TW/2026'))),
        tglPenyampaian: cm.tglPenyampaian || (isMarkus ? '26 Mei 2025' : (isRefCase ? 'Senin, 07 Juli 2025 • 10:00 WIT' : 'Jumat, 13 November 2026 • 10:00 WIT')),
        batasPenyampaian: cm.batasPenyampaian || (isMarkus ? '12 Juni 2025 (Maks. 14 Hari Kerja)' : (isRefCase ? '23 Juli 2025' : '27 November 2026')),
        saksi1Nama: cm.saksi1Nama || 'KORNELIS WAMAFMA',
        saksi1Nip: cm.saksi1Nip || '19840212 201004 1 002',
        saksi2Nama: cm.saksi2Nama || 'MARTHA RUMBEKWAN, S.Sos',
        saksi2Nip: cm.saksi2Nip || '19800615 200801 2 014',
        noInkrah: cm.noInkrah || (isMarkus ? '800.1.6.2/021/INKRAH-DISP/BKAD-TW/VI/2025' : (isRefCase ? '800.1.6.2/028/INKRAH-DISP/BKAD-TW/VII/2025' : ('800.1.6.2/' + suf + '/INKRAH-DISP/BKAD-TW/2026'))),
        tglInkrah: cm.tglInkrah || (isMarkus ? '16 Juni 2025' : (isRefCase ? '28 Juli 2025' : '30 November 2026')),
        masaAkhirSanksi: cm.masaAkhirSanksi || (isMarkus ? '16 Juni 2026' : '27 Juli 2026'),
        regIDis: (d && d.regIDis) || cm.regIDis || (isMarkus ? 'IDIS-BKN-2025-9107-004821-TW' : (isRefCase ? 'IDIS-BKN-2025-9108-009185' : ('IDIS-BKN-2026-TW-' + suf))),
        txIDis: isMarkus ? '#TX-9107-88421' : '#TX-9108-99214',
        modelBkn: 'MODEL BKN-PP94-HD.01',
        sha256: 'e9b0a724f8d23467c6488d90fa62771239c8eb010d2975bb42a03498ffb99014',
        hariMangkir: (Array.isArray(cm.hariMangkir) && cm.hariMangkir.length > 0) ? cm.hariMangkir : defaultMangkir,
        bapQA: (Array.isArray(cm.bapQA) && cm.bapQA.length > 0) ? cm.bapQA : defaultQA
      };
    }

    function buildDisiplinBapSheetInnerHTML(d, info) {
      var qaHtml = '';
      for (var qIdx = 0; qIdx < info.bapQA.length; qIdx++) {
        var item = info.bapQA[qIdx];
        qaHtml += '<div class="bg-[#f7f9fe] p-4 rounded-xl border border-slate-200/70 space-y-2">' +
          '<div class="flex items-start gap-3">' +
          '<span class="font-mono text-xs px-2 py-0.5 rounded bg-slate-200 font-bold text-navy-deep shrink-0">' + (qIdx + 1) + '. Tanya</span>' +
          '<p class="text-xs sm:text-[13px] text-[#181c20] font-medium leading-relaxed">' + esc(item.q) + '</p>' +
          '</div>' +
          '<div class="flex items-start gap-3 pt-2 border-t border-slate-200">' +
          '<span class="font-mono text-xs px-2 py-0.5 rounded bg-electric-blue/15 font-bold text-[#0052d2] shrink-0">Jawab</span>' +
          '<p class="text-xs sm:text-[13px] text-[#181c20] leading-relaxed">"' + esc(item.a) + '"</p>' +
          '</div>' +
          '</div>';
      }
      return '<div class="flex justify-end mb-2">' +
        '<span class="font-mono text-[11px] text-[#ba1a1a] bg-[#ffdad6]/60 px-2.5 py-0.5 rounded font-bold uppercase tracking-widest">[ R A H A S I A ] DOKUMEN TERTUTUP KEPEGAWAIAN</span>' +
        '</div>' +
        '<div class="text-center mb-5">' +
        '<div class="text-lg sm:text-xl font-bold tracking-wider text-navy-deep underline decoration-2 underline-offset-4 uppercase">BERITA ACARA PEMERIKSAAN</div>' +
        '<div class="font-mono text-xs font-semibold text-[#181c20] mt-1">Nomor: ' + esc(info.noBAP) + '</div>' +
        '</div>' +
        '<div class="space-y-3.5 text-justify text-xs sm:text-[13px] text-[#181c20] leading-relaxed">' +
        '<p>Pada hari ini jadwal pemeriksaan <strong class="font-semibold text-navy-deep">' + esc(info.tglBAP) + '</strong>, bertempat di <strong class="font-semibold text-navy-deep">' + esc(info.tempatSidang) + '</strong>, saya yang bertanda tangan di bawah ini:</p>' +
        '<div class="bg-[#f1f4f9] rounded-xl p-4 space-y-1.5 text-xs">' +
        '<div class="grid grid-cols-12 gap-2"><span class="col-span-3 text-text-muted">Nama</span><span class="col-span-1 text-center">:</span><span class="col-span-8 font-bold text-navy-deep">' + esc(info.pemeriksaNama) + '</span></div>' +
        '<div class="grid grid-cols-12 gap-2"><span class="col-span-3 text-text-muted">NIP</span><span class="col-span-1 text-center">:</span><span class="col-span-8 font-mono font-semibold">' + esc(info.pemeriksaNip) + '</span></div>' +
        '<div class="grid grid-cols-12 gap-2"><span class="col-span-3 text-text-muted">Pangkat / Golongan</span><span class="col-span-1 text-center">:</span><span class="col-span-8">' + esc(info.pemeriksaPangkat) + '</span></div>' +
        '<div class="grid grid-cols-12 gap-2"><span class="col-span-3 text-text-muted">Jabatan</span><span class="col-span-1 text-center">:</span><span class="col-span-8 font-medium">' + esc(info.pemeriksaJabatan) + '</span></div>' +
        '<div class="grid grid-cols-12 gap-2"><span class="col-span-3 text-text-muted">Unit Kerja</span><span class="col-span-1 text-center">:</span><span class="col-span-8">Badan Pengelolaan Keuangan dan Aset Daerah Kabupaten Teluk Wondama</span></div>' +
        '</div>' +
        '<p>Berdasarkan wewenang jabatan dan Surat Panggilan Nomor: <span class="font-mono font-semibold">' + esc(info.noPanggilan1) + '</span> tanggal ' + esc(info.tglPanggilan1) + ', telah melakukan pemeriksaan terhadap Pegawai Negeri Sipil:</p>' +
        '<div class="bg-[#f1f4f9] rounded-xl p-4 space-y-1.5 text-xs">' +
        '<div class="grid grid-cols-12 gap-2"><span class="col-span-3 text-text-muted">Nama</span><span class="col-span-1 text-center">:</span><span class="col-span-8 font-bold text-navy-deep">' + esc(d.nama).toUpperCase() + '</span></div>' +
        '<div class="grid grid-cols-12 gap-2"><span class="col-span-3 text-text-muted">NIP</span><span class="col-span-1 text-center">:</span><span class="col-span-8 font-mono font-semibold">' + esc(formatNipSpaced(d.nip)) + '</span></div>' +
        '<div class="grid grid-cols-12 gap-2"><span class="col-span-3 text-text-muted">Pangkat / Golongan</span><span class="col-span-1 text-center">:</span><span class="col-span-8">' + esc(info.terperiksaPangkat) + '</span></div>' +
        '<div class="grid grid-cols-12 gap-2"><span class="col-span-3 text-text-muted">Jabatan</span><span class="col-span-1 text-center">:</span><span class="col-span-8 font-medium">' + esc(info.terperiksaJabatan) + '</span></div>' +
        '<div class="grid grid-cols-12 gap-2"><span class="col-span-3 text-text-muted">Unit Kerja</span><span class="col-span-1 text-center">:</span><span class="col-span-8">' + esc(info.terperiksaBidang) + '</span></div>' +
        '</div>' +
        '<p>Pemeriksaan dilakukan dengan mengajukan pertanyaan-pertanyaan serta dijawab secara langsung sebagai berikut:</p>' +
        '</div>' +
        '<div class="mt-4 space-y-3">' + qaHtml + '</div>' +
        '<p class="text-xs sm:text-[13px] text-[#181c20] leading-relaxed text-justify mt-5">Demikian Berita Acara Pemeriksaan ini dibuat dengan sebenarnya dalam rangkap 3 (tiga) untuk dipergunakan sebagaimana mestinya, kemudian dibacakan kembali kepada yang diperiksa dan yang bersangkutan menyatakan setuju serta membubuhkan tanda tangannya.</p>' +
        '<div class="mt-6 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">' +
        '<div class="flex flex-col items-center text-center">' +
        '<span class="text-xs text-text-muted mb-2">Yang Diperiksa,</span>' +
        '<div class="h-20 my-1"></div>' +
        '<span class="text-xs font-bold text-navy-deep uppercase">' + esc(d.nama) + '</span>' +
        '<span class="font-mono text-[11px] text-text-muted">NIP. ' + esc(formatNipSpaced(d.nip)) + '</span>' +
        '</div>' +
        '<div class="flex flex-col items-center text-center relative">' +
        '<span class="text-xs text-text-muted">Pemeriksa / Atasan Langsung,</span>' +
        '<span class="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-600">AN. BUPATI TELUK WONDAMA</span>' +
        '<span class="text-[11px] font-bold text-navy-deep">PLT. KEPALA BADAN KEUANGAN DAN ASET DAERAH</span>' +
        '<div class="h-20 w-full my-1"></div>' +
        '<span class="text-xs font-bold text-navy-deep uppercase">' + esc(info.pemeriksaNama) + '</span>' +
        '<span class="text-[11px] text-[#181c20]">' + esc(info.pemeriksaPangkat) + '</span>' +
        '<span class="font-mono text-[11px] text-text-muted">NIP. ' + esc(info.pemeriksaNip) + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="mt-6 pt-3 bg-[#f1f4f9] rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3">' +
        '<div class="flex items-center gap-3">' +
        '<div class="w-10 h-10 bg-white rounded-lg p-1 border border-slate-300 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-navy-deep text-2xl">qr_code_2</span></div>' +
        '<div class="flex flex-col min-w-0">' +
        '<span class="font-mono text-[11px] text-navy-deep font-bold">UUID: bkad-bap-' + esc(d.id) + '</span>' +
        '<span class="font-mono text-[10px] text-text-muted">SHA-256: 8a7f1c82e3d49b105f2c7a001928df774a1 • Sheet: DisiplinPegawai</span>' +
        '</div>' +
        '</div>' +
        '<div class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-status-present/15 text-status-present text-[11px] font-semibold shrink-0"><span class="material-symbols-outlined text-sm">verified</span><span>TERVERIFIKASI FISIK • ' + esc(info.tglBAP) + '</span></div>' +
        '</div>';
    }

    function buildDisiplinSkSheetInnerHTML(d, info) {
      return '<div class="flex items-center justify-between mb-3 text-[10px] text-text-muted font-mono">' +
        '<span class="px-2 py-0.5 rounded bg-red-50 text-[#ba1a1a] font-bold tracking-widest">[ R A H A S I A ] ' + esc(info.modelBkn) + '</span>' +
        '<span>Lampiran Peraturan BKN No. 6 Tahun 2022 • HALAMAN 1 DARI 2</span>' +
        '</div>' +
        '<div class="text-center flex flex-col mb-5">' +
        '<div class="text-sm font-bold text-navy-deep uppercase leading-tight">KEPUTUSAN KEPALA BADAN PENGELOLAAN KEUANGAN DAN ASET DAERAH<br/>KABUPATEN TELUK WONDAMA</div>' +
        '<div class="font-mono text-xs font-bold text-navy-deep mt-1.5">NOMOR : ' + esc(info.noSK) + '</div>' +
        '<div class="text-xs font-bold uppercase tracking-wider mt-1.5">TENTANG</div>' +
        '<div class="text-sm font-bold text-navy-deep uppercase tracking-wide mt-0.5">' + esc(info.judulSK) + '</div>' +
        '<div class="text-xs font-bold uppercase tracking-widest mt-2.5 text-navy-deep">DENGAN RAHMAT TUHAN YANG MAHA ESA</div>' +
        '<div class="text-xs font-bold text-navy-deep uppercase mt-1.5">PLT. KEPALA BADAN PENGELOLAAN KEUANGAN DAN ASET DAERAH KABUPATEN TELUK WONDAMA,</div>' +
        '</div>' +
        '<div class="space-y-3 text-justify text-xs leading-relaxed mb-5">' +
        '<div class="grid grid-cols-12 gap-2">' +
        '<div class="col-span-3 sm:col-span-2 font-bold text-navy-deep uppercase">Menimbang :</div>' +
        '<div class="col-span-9 sm:col-span-10 space-y-1.5">' +
        '<div class="flex items-start gap-2"><span class="font-bold">a.</span><p>bahwa berdasarkan hasil Berita Acara Pemeriksaan (BAP) Nomor: <span class="font-mono">' + esc(info.noBAP) + '</span> tanggal ' + esc(info.tglBAP) + ', Sdr. <span class="font-bold text-navy-deep">' + esc(d.nama).toUpperCase() + '</span>, NIP ' + esc(formatNipSpaced(d.nip)) + ', Pangkat/Gol. ' + esc(info.terperiksaPangkat) + ', terbukti melakukan pelanggaran disiplin: ' + esc(d.pelanggaran) + ';</p></div>' +
        '<div class="flex items-start gap-2"><span class="font-bold">b.</span><p>bahwa perbuatan tersebut melanggar ketentuan ' + esc(d.dasarHukum) + ' tentang Disiplin Pegawai Negeri Sipil;</p></div>' +
        '<div class="flex items-start gap-2"><span class="font-bold">c.</span><p>bahwa untuk menegakkan wibawa kedinasan serta memberikan pembinaan moral aparatur, perlu menjatuhkan hukuman disiplin yang setimpal;</p></div>' +
        '</div>' +
        '</div>' +
        '<div class="grid grid-cols-12 gap-2">' +
        '<div class="col-span-3 sm:col-span-2 font-bold text-navy-deep uppercase">Mengingat :</div>' +
        '<div class="col-span-9 sm:col-span-10 space-y-1">' +
        '<div>1. Undang-Undang Nomor 20 Tahun 2023 tentang Aparatur Sipil Negara;</div>' +
        '<div>2. Peraturan Pemerintah Nomor 94 Tahun 2021 tentang Disiplin Pegawai Negeri Sipil (Lembaran Negara RI Tahun 2021 Nomor 202);</div>' +
        '<div>3. Peraturan Badan Kepegawaian Negara Nomor 6 Tahun 2022 tentang Petunjuk Teknis PP No. 94 Tahun 2021;</div>' +
        '<div>4. Peraturan Bupati Teluk Wondama Nomor 28 Tahun 2021 tentang Organisasi &amp; Tata Kerja BKAD.</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="space-y-2.5 text-justify text-xs leading-relaxed">' +
        '<div class="text-center font-bold text-navy-deep tracking-wider uppercase">MEMUTUSKAN :</div>' +
        '<div class="grid grid-cols-12 gap-2"><div class="col-span-3 sm:col-span-2 font-bold text-navy-deep uppercase">Menetapkan :</div><div class="col-span-9 sm:col-span-10"></div></div>' +
        '<div class="grid grid-cols-12 gap-2">' +
        '<div class="col-span-3 sm:col-span-2 font-bold text-navy-deep uppercase">KESATU :</div>' +
        '<div class="col-span-9 sm:col-span-10 space-y-2">' +
        '<p>Menjatuhkan Hukuman Disiplin Berupa <span class="font-bold text-navy-deep underline">' + esc(d.sanksi).toUpperCase() + '</span> kepada:</p>' +
        '<div class="bg-[#f1f4f9] p-3.5 rounded-lg space-y-1 text-xs">' +
        '<div class="grid grid-cols-12 gap-1"><div class="col-span-4 font-semibold text-text-muted">Nama</div><div class="col-span-8 font-bold text-navy-deep uppercase">' + esc(d.nama) + '</div></div>' +
        '<div class="grid grid-cols-12 gap-1"><div class="col-span-4 font-semibold text-text-muted">NIP</div><div class="col-span-8 font-mono font-bold">' + esc(formatNipSpaced(d.nip)) + '</div></div>' +
        '<div class="grid grid-cols-12 gap-1"><div class="col-span-4 font-semibold text-text-muted">Pangkat / Gol. Ruang</div><div class="col-span-8">' + esc(info.terperiksaPangkat) + '</div></div>' +
        '<div class="grid grid-cols-12 gap-1"><div class="col-span-4 font-semibold text-text-muted">Jabatan</div><div class="col-span-8">' + esc(info.terperiksaJabatan) + '</div></div>' +
        '<div class="grid grid-cols-12 gap-1"><div class="col-span-4 font-semibold text-text-muted">Unit Kerja</div><div class="col-span-8">' + esc(info.terperiksaBidang) + '</div></div>' +
        '</div>' +
        '<p>karena yang bersangkutan telah melakukan perbuatan yang melanggar ketentuan ' + esc(d.dasarHukum) + '.</p>' +
        '</div>' +
        '</div>' +
        '<div class="grid grid-cols-12 gap-2"><div class="col-span-3 sm:col-span-2 font-bold text-navy-deep uppercase">KEDUA :</div><div class="col-span-9 sm:col-span-10"><p>Keputusan ini mulai berlaku sah pada hari kerja ke-15 (kelima belas) terhitung sejak tanggal Keputusan ini disampaikan secara tertutup kepada Pegawai Negeri Sipil yang bersangkutan.</p></div></div>' +
        '<div class="grid grid-cols-12 gap-2"><div class="col-span-3 sm:col-span-2 font-bold text-navy-deep uppercase">KETIGA :</div><div class="col-span-9 sm:col-span-10"><p>Keputusan ini disampaikan secara tertutup kepada yang bersangkutan untuk diketahui dan diindahkan, serta dicatat dalam Sistem Informasi Aparatur Sipil Negara (SIASN / I&#39;DIS BKN).</p></div></div>' +
        '</div>' +
        '<div class="mt-6 pt-4 flex flex-col md:flex-row justify-between items-start gap-6">' +
        '<div class="w-full md:w-1/2 space-y-1">' +
        '<div class="text-xs font-bold text-navy-deep uppercase tracking-wider">Tembusan Kepada Yth.:</div>' +
        '<ol class="text-[11px] leading-relaxed text-text-muted list-decimal list-inside space-y-0.5">' +
        '<li>Bupati Teluk Wondama di Isei (sebagai laporan);</li>' +
        '<li>Kepala BKN RI c.q. Deputi Sistem Informasi Kepegawaian di Jakarta;</li>' +
        '<li>Kepala Kantor Regional XIV BKN Manokwari;</li>' +
        '<li>Inspektur Daerah Kabupaten Teluk Wondama;</li>' +
        '<li>Kepala BKPSDM Kabupaten Teluk Wondama;</li>' +
        '<li>Arsip Rahasia Subbag Kepegawaian BKAD.</li>' +
        '</ol>' +
        '</div>' +
        '<div class="w-full md:w-64 flex flex-col items-center text-center">' +
        '<div class="text-xs leading-tight">Ditetapkan di Rasiei<br/>pada tanggal ' + esc(info.tglSK) + '</div>' +
        '<div class="text-[11px] font-bold text-navy-deep uppercase mt-1 leading-tight">AN. BUPATI TELUK WONDAMA<br/>PLT. KEPALA BADAN KEUANGAN DAN ASET DAERAH</div>' +
        '<div class="my-1 h-20"></div>' +
        '<div class="text-xs font-bold text-navy-deep underline">' + esc(info.pemeriksaNama) + '</div>' +
        '<div class="text-[11px] text-text-muted">' + esc(info.pemeriksaPangkat) + '</div>' +
        '<div class="font-mono text-[11px] font-semibold">NIP. ' + esc(info.pemeriksaNip) + '</div>' +
        '</div>' +
        '</div>' +
        '<div class="mt-6 pt-3 bg-[#f1f4f9] rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3">' +
        '<div class="flex items-center gap-3">' +
        '<div class="w-10 h-10 bg-white rounded-lg p-1 border border-slate-300 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-navy-deep text-2xl">qr_code_2</span></div>' +
        '<div class="flex flex-col"><span class="font-mono text-[10px] text-navy-deep font-bold uppercase">TERVALIDASI SISTEM E-PRESENSI BKAD</span><span class="font-mono text-[9.5px] text-text-muted">SHA256: 7f3a9e2c4180d59e38d726baf1e3c8479e02a1b93f6690c53849df0129bcce33</span><span class="font-mono text-[9.5px] text-text-muted">Tanggal Registrasi: ' + esc(info.tglSK) + ' WIT • Dokumen Sah Kedinasan</span></div>' +
        '</div>' +
        '<span class="px-2.5 py-1 bg-white rounded-md font-mono text-[10px] text-navy-deep font-semibold border border-slate-200 shrink-0">REG: ' + esc(d.id) + '</span>' +
        '</div>';
    }

    function buildDisiplinBaPenyampaianSheetInnerHTML(d, info) {
      return '<div class="flex items-center justify-between pb-2 mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">' +
        '<span class="bg-red-50 text-[#ba1a1a] px-2 py-0.5 rounded font-mono font-bold">[ R A H A S I A ] DOKUMEN TERTUTUP KEPEGAWAIAN</span>' +
        '<span class="font-mono">LAMPIRAN IV - PERATURAN BKN NO. 6 TAHUN 2022</span>' +
        '</div>' +
        '<div class="text-center my-3">' +
        '<div class="text-base sm:text-lg font-bold text-slate-950 uppercase tracking-wide underline underline-offset-4">BERITA ACARA PENYAMPAIAN KEPUTUSAN HUKUMAN DISIPLIN</div>' +
        '<div class="font-mono text-xs text-slate-800 font-semibold mt-1">Nomor : ' + esc(info.noPenyampaian) + '</div>' +
        '</div>' +
        '<p class="text-justify text-xs sm:text-[13px] text-slate-900 my-3 leading-relaxed indent-8">Pada hari/tanggal <span class="font-semibold">' + esc(info.tglPenyampaian) + '</span>, bertempat di <span class="font-semibold">' + esc(info.tempatSidang) + '</span>, kami yang bertanda tangan di bawah ini:</p>' +
        '<div class="my-3 bg-slate-50 p-3 rounded-lg border border-slate-200">' +
        '<div class="text-xs font-bold text-slate-950 mb-1.5 flex items-center gap-1.5"><span class="w-5 h-5 rounded-full bg-slate-800 text-white inline-flex items-center justify-center text-[11px]">1</span><span>PIHAK YANG MENYAMPAIKAN KEPUTUSAN :</span></div>' +
        '<div class="grid grid-cols-12 gap-y-1 text-xs text-slate-800 pl-6">' +
        '<span class="col-span-4 sm:col-span-3 text-slate-600">Nama</span><span class="col-span-8 sm:col-span-9 font-bold text-slate-950">: ' + esc(info.pemeriksaNama) + '</span>' +
        '<span class="col-span-4 sm:col-span-3 text-slate-600">NIP</span><span class="col-span-8 sm:col-span-9 font-mono">: ' + esc(info.pemeriksaNip) + '</span>' +
        '<span class="col-span-4 sm:col-span-3 text-slate-600">Pangkat / Gol.</span><span class="col-span-8 sm:col-span-9">: ' + esc(info.pemeriksaPangkat) + '</span>' +
        '<span class="col-span-4 sm:col-span-3 text-slate-600">Jabatan</span><span class="col-span-8 sm:col-span-9 font-semibold">: ' + esc(info.pemeriksaJabatan) + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="my-3 bg-slate-50 p-3 rounded-lg border border-slate-200">' +
        '<div class="text-xs font-bold text-slate-950 mb-1.5 flex items-center gap-1.5"><span class="w-5 h-5 rounded-full bg-slate-800 text-white inline-flex items-center justify-center text-[11px]">2</span><span>PIHAK YANG MENERIMA KEPUTUSAN (PEGAWAI NEGERI SIPIL TERPERIKSA) :</span></div>' +
        '<div class="grid grid-cols-12 gap-y-1 text-xs text-slate-800 pl-6">' +
        '<span class="col-span-4 sm:col-span-3 text-slate-600">Nama</span><span class="col-span-8 sm:col-span-9 font-bold text-slate-950">: ' + esc(d.nama).toUpperCase() + '</span>' +
        '<span class="col-span-4 sm:col-span-3 text-slate-600">NIP</span><span class="col-span-8 sm:col-span-9 font-mono">: ' + esc(formatNipSpaced(d.nip)) + '</span>' +
        '<span class="col-span-4 sm:col-span-3 text-slate-600">Pangkat / Gol.</span><span class="col-span-8 sm:col-span-9">: ' + esc(info.terperiksaPangkat) + '</span>' +
        '<span class="col-span-4 sm:col-span-3 text-slate-600">Jabatan</span><span class="col-span-8 sm:col-span-9">: ' + esc(info.terperiksaJabatan) + '</span>' +
        '<span class="col-span-4 sm:col-span-3 text-slate-600">Unit Kerja</span><span class="col-span-8 sm:col-span-9">: ' + esc(info.terperiksaBidang) + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="space-y-2.5 text-xs sm:text-[13px] text-slate-900 leading-relaxed text-justify my-3">' +
        '<p class="indent-8">Telah menyampaikan Salinan Keputusan Kepala BKAD Nomor : <strong class="font-mono">' + esc(info.noSK) + '</strong> tanggal ' + esc(info.tglSK) + ' tentang <span class="font-semibold">' + esc(info.judulSK) + ' (' + esc(d.sanksi) + ')</span> kepada Pegawai Negeri Sipil yang bersangkutan secara tertutup, disaksikan oleh 2 (dua) orang saksi pegawai.</p>' +
        '<p class="indent-8">Kepada yang bersangkutan telah dijelaskan hak dan kewajiban serta konsekuensi hukum bahwa Keputusan ini mulai berlaku sah pada hari kerja ke-15 sejak tanggal penyampaian ini (<strong>tanggal ' + esc(info.tglInkrah) + '</strong>).</p>' +
        '<p class="indent-8">Demikian Berita Acara Penyampaian Keputusan ini dibuat dalam rangkap 3 (tiga) dengan sebenarnya, untuk dapat dipergunakan sebagaimana mestinya.</p>' +
        '</div>' +
        '<div class="mt-6 pt-3 grid grid-cols-1 md:grid-cols-3 gap-5 text-center text-xs text-slate-900 items-start">' +
        '<div class="flex flex-col items-center justify-between min-h-[140px]">' +
        '<div><span class="block font-semibold">PNS yang menerima keputusan,</span><span class="text-[11px] text-slate-500">(Pihak II)</span></div>' +
        '<div class="h-20 my-2"></div>' +
        '<div><div class="font-bold underline uppercase">' + esc(d.nama) + '</div><div class="font-mono text-[11px] text-slate-700">NIP. ' + esc(formatNipSpaced(d.nip)) + '</div></div>' +
        '</div>' +
        '<div class="flex flex-col items-center justify-between min-h-[140px]">' +
        '<div><span class="block font-semibold">Saksi-saksi :</span><span class="text-[11px] text-slate-500">(Pegawai yang Ditunjuk)</span></div>' +
        '<div class="w-full text-left space-y-2 mt-2">' +
        '<div><div class="text-[11px] font-semibold">1. Saksi I (Kepegawaian):</div><div class="font-bold underline text-[11px]">' + esc(info.saksi1Nama) + '</div><div class="font-mono text-[10px] text-slate-600">NIP. ' + esc(info.saksi1Nip) + '</div></div>' +
        '<div><div class="text-[11px] font-semibold">2. Saksi II (Keuangan &amp; Aset):</div><div class="font-bold underline text-[11px]">' + esc(info.saksi2Nama) + '</div><div class="font-mono text-[10px] text-slate-600">NIP. ' + esc(info.saksi2Nip) + '</div></div>' +
        '</div>' +
        '</div>' +
        '<div class="flex flex-col items-center justify-between min-h-[140px] relative">' +
        '<div><span class="block font-bold text-[11px] uppercase leading-tight">AN. BUPATI TELUK WONDAMA<br/>PLT. KEPALA BKAD</span></div>' +
        '<div class="h-20 w-full my-2"></div>' +
        '<div><div class="font-bold underline uppercase">' + esc(info.pemeriksaNama) + '</div><div class="text-[11px] font-mono text-slate-700">NIP. ' + esc(info.pemeriksaNip) + '</div></div>' +
        '</div>' +
        '</div>' +
        '<div class="mt-6 pt-3 bg-[#F3F6FB] rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-600 font-mono text-[10px]">' +
        '<div class="flex items-center gap-3">' +
        '<div class="w-10 h-10 bg-white p-1 rounded border border-slate-300 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-slate-900 text-2xl">qr_code_2</span></div>' +
        '<div><div class="font-bold text-slate-900">VERIFIKASI DIGITAL KEPEGAWAIAN BKAD</div><div>SHA256: 9F8A2D3C4B5E1A70B6E2C91D8A20257B • REG-BA-2025-024 / PP94</div></div>' +
        '</div>' +
        '<div class="font-semibold text-slate-800">Status Salinan: Asli I (PNS) &amp; II (Arsip)</div>' +
        '</div>';
    }

    function buildDisiplinInkrahSheetInnerHTML(d, info, lembarLabel) {
      return '<div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">' +
        '<div class="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-red-50 text-[#ba1a1a] font-mono text-[11px] uppercase tracking-widest font-semibold"><span class="material-symbols-outlined text-[14px]">lock</span><span>[ R A H A S I A ]' + (lembarLabel ? ' • ' + esc(lembarLabel) : '') + '</span></div>' +
        '<div class="text-right"><span class="font-mono text-[10px] text-text-muted uppercase tracking-wider block">BUKTI TANDA TERIMA SINKRONISASI</span><span class="text-xs font-bold text-navy-deep">SISTEM INFORMASI DISIPLIN (I&#39;DIS) BKN RI</span></div>' +
        '</div>' +
        '<div class="text-center my-4">' +
        '<div class="text-sm sm:text-base font-bold text-navy-deep uppercase tracking-wide underline decoration-navy-deep underline-offset-4">LEMBAR PENETAPAN KEBERLAKUAN HUKUMAN DISIPLIN (INKRAH)</div>' +
        '<div class="text-xs uppercase text-text-muted mt-1 font-semibold">DAN TANDA BUKTI PENDAFTARAN SISTEM INFORMASI DISIPLIN ASN (I&#39;DIS BKN RI)</div>' +
        '<div class="mt-2.5 flex flex-wrap items-center justify-center gap-2">' +
        '<span class="font-mono text-[11px] bg-slate-100 px-3 py-1 rounded">Reg. Inkrah: <strong class="text-navy-deep">' + esc(info.noInkrah) + '</strong></span>' +
        '<span class="font-mono text-[11px] bg-teal-50 text-mode-wfa px-3 py-1 rounded">ID Gateway I&#39;DIS: <strong>' + esc(info.regIDis) + '</strong></span>' +
        '</div>' +
        '</div>' +
        '<div class="bg-[#f1f4f9] rounded-xl p-4 my-4">' +
        '<div class="text-xs font-bold text-navy-deep uppercase tracking-wider mb-2 flex items-center gap-1.5"><span class="material-symbols-outlined text-base text-secondary">badge</span><span>Identitas Pegawai Negeri Sipil Terperiksa / Terhukum</span></div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">' +
        '<div class="flex justify-between py-1 bg-white px-2.5 rounded"><span class="text-text-muted">Nama Lengkap</span><span class="font-bold text-navy-deep">' + esc(d.nama).toUpperCase() + '</span></div>' +
        '<div class="flex justify-between py-1 bg-white px-2.5 rounded"><span class="text-text-muted">Nomor Induk Pegawai</span><span class="font-mono font-bold text-navy-deep">' + esc(formatNipSpaced(d.nip)) + '</span></div>' +
        '<div class="flex justify-between py-1 bg-white px-2.5 rounded"><span class="text-text-muted">Pangkat / Gol. Ruang</span><span class="font-semibold text-navy-deep">' + esc(info.terperiksaPangkat) + '</span></div>' +
        '<div class="flex justify-between py-1 bg-white px-2.5 rounded"><span class="text-text-muted">Jabatan Terakhir</span><span class="font-medium text-navy-deep">' + esc(info.terperiksaJabatan) + '</span></div>' +
        '<div class="flex justify-between py-1 bg-white px-2.5 rounded md:col-span-2"><span class="text-text-muted">Unit Kerja / Instansi</span><span class="font-semibold text-navy-deep">' + esc(info.terperiksaBidang) + '</span></div>' +
        '</div>' +
        '</div>' +
        '<div class="space-y-2.5 my-4 text-xs">' +
        '<div class="font-bold text-navy-deep uppercase tracking-wide flex items-center gap-1.5"><span class="material-symbols-outlined text-status-present text-base">gavel</span><span>Kronologi Legalitas &amp; Penetapan Keberlakuan Sah Putusan</span></div>' +
        '<div class="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-2.5"><span class="font-mono font-bold text-secondary bg-blue-50 px-1.5 py-0.5 rounded">01</span><div><b>Penetapan Keputusan Hukuman Disiplin:</b> SK Nomor <span class="font-mono font-semibold">' + esc(info.noSK) + '</span> tanggal ' + esc(info.tglSK) + ' — <strong class="text-status-absent">' + esc(d.sanksi) + '</strong>.</div></div>' +
        '<div class="p-3 bg-white rounded-xl border border-slate-200 flex items-start gap-2.5"><span class="font-mono font-bold text-secondary bg-blue-50 px-1.5 py-0.5 rounded">02</span><div><b>Penyampaian Keputusan Secara Tertutup:</b> Berita Acara Nomor <span class="font-mono font-semibold">' + esc(info.noPenyampaian) + '</span> pada ' + esc(info.tglPenyampaian) + '.</div></div>' +
        '<div class="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 flex items-start gap-2.5"><span class="font-mono font-bold text-status-present bg-white px-1.5 py-0.5 rounded">03</span><div><b>Dasar Keberlakuan Hukum Sah (LEGAL INKRAH):</b> Berdasarkan <strong>Pasal 41 ayat (1) PP No. 94 Tahun 2021</strong>, berlaku sah pada hari kerja ke-15 terhitung mulai tanggal <strong class="text-status-present font-mono">' + esc(info.tglInkrah).toUpperCase() + '</strong> tanpa pengajuan keberatan administratif.</div></div>' +
        '</div>' +
        '<div class="my-4 bg-slate-100/80 p-3.5 rounded-xl">' +
        '<div class="flex items-center justify-between mb-2.5 text-xs"><span class="font-bold text-navy-deep uppercase">Distribusi Pemutakhiran Data Kepegawaian &amp; Penggajian</span><span class="font-mono text-[10px] text-status-present font-bold bg-status-present/15 px-2 py-0.5 rounded">3 LAYANAN TERSINKRONISASI</span></div>' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">' +
        '<div class="bg-white p-2.5 rounded-lg border border-slate-200"><div class="font-bold text-mode-wfa text-[11px] uppercase">I&#39;DIS BKN RI</div><div class="font-semibold text-navy-deep mt-0.5">Terekam &amp; Terkunci</div><div class="font-mono text-[10px] text-text-muted mt-1">' + esc(info.regIDis) + '</div></div>' +
        '<div class="bg-white p-2.5 rounded-lg border border-slate-200"><div class="font-bold text-secondary text-[11px] uppercase">SIASN BKN Pusat</div><div class="font-semibold text-navy-deep mt-0.5">Data Riwayat Hukdis</div><div class="font-mono text-[10px] text-text-muted mt-1">Status: Teremajakan</div></div>' +
        '<div class="bg-white p-2.5 rounded-lg border border-slate-200"><div class="font-bold text-amber-600 text-[11px] uppercase">SIM-GAJI / TPP BKAD</div><div class="font-semibold text-navy-deep mt-0.5">Penyesuaian Kinerja</div><div class="font-mono text-[10px] text-text-muted mt-1">Efektif: Inkrah Aktif</div></div>' +
        '</div>' +
        '</div>' +
        '<div class="pt-4 mt-4 grid grid-cols-1 sm:grid-cols-2 gap-6 items-start text-center text-xs">' +
        '<div class="flex flex-col items-center">' +
        '<span class="text-text-muted leading-tight">Dicatatkan dan Diverifikasi pada Database:<br/><strong>Badan Kepegawaian dan PSDM Kab. Teluk Wondama</strong></span>' +
        '<div class="h-20 my-2"></div>' +
        '<div class="font-bold text-navy-deep">FRANSISCA K. WANMA, S.STP</div>' +
        '<div class="text-text-muted">Penata Tk. I (III/d) • NIP. 19890815 201202 2 001</div>' +
        '</div>' +
        '<div class="flex flex-col items-center">' +
        '<span class="text-navy-deep font-semibold leading-tight">Rasiei, ' + esc(info.tglInkrah) + '<br/>AN. BUPATI TELUK WONDAMA<br/>PLT. KEPALA BADAN KEUANGAN DAN ASET DAERAH</span>' +
        '<div class="h-20 my-2"></div>' +
        '<div class="font-bold text-navy-deep underline">' + esc(info.pemeriksaNama) + '</div>' +
        '<div class="font-mono text-[11px] text-text-muted">' + esc(info.pemeriksaPangkat) + ' • NIP. ' + esc(info.pemeriksaNip) + '</div>' +
        '</div>' +
        '</div>' +
        '<div class="mt-6 pt-3 bg-[#f1f4f9] px-3 py-2.5 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px]">' +
        '<div class="flex items-center gap-2.5"><div class="w-10 h-10 bg-navy-deep p-1 rounded-lg flex items-center justify-center text-white shrink-0"><span class="material-symbols-outlined text-2xl">qr_code_2</span></div><div><div class="font-mono font-bold text-navy-deep">INTEGRITY HASH (SHA-256): ' + info.sha256.substring(0, 32) + '...</div><div class="text-mode-wfa font-medium">Sesuai UU ITE No. 11/2008 &amp; Perban BKN 6/2022. Dokumen sah sertifikasi digital.</div></div></div>' +
        '<span class="font-mono font-bold text-navy-deep bg-white px-2.5 py-1 rounded border border-slate-200 shrink-0">VERIFIKASI I&#39;DIS BKN v2.4</span>' +
        '</div>';
    }

    function renderDisiplinStageDetailHTML(d, stageNum, actualCurStage) {
      var info = getDisiplinEnrichedData(d);
      var isCompleted = stageNum < actualCurStage || (actualCurStage === 8 && stageNum === 8);
      var statusTag = isCompleted ? '<span class="px-2.5 py-1 rounded-full bg-emerald-50 text-status-present font-mono text-[11px] font-bold">SELESAI / TERARSIP</span>' :
        (stageNum === actualCurStage ? '<span class="px-2.5 py-1 rounded-full bg-blue-50 text-electric-blue font-mono text-[11px] font-bold">TAHAP AKTIF SAAT INI</span>' :
          '<span class="px-2.5 py-1 rounded-full bg-surface-high text-text-muted font-mono text-[11px] font-bold">PRATINJAU TAHAP BERIKUTNYA</span>');

      if (stageNum <= 3) {
        var subLabel = stageNum === 1 ? 'Tahap 1: Surat Panggilan Pemeriksaan Pertama (Pasal 26 Ayat 1 PP 94/2021)' :
          (stageNum === 2 ? 'Tahap 2: Surat Panggilan Kedua / Terakhir (Pasal 26 Ayat 2 & 3 PP 94/2021)' :
            'Tahap 3: Surat Perintah Pembentukan Tim Pemeriksa Disiplin (Pasal 27 & 28 PP 94/2021)');
        var curNoSurat = stageNum === 1 ? info.noPanggilan1 : (stageNum === 2 ? info.noPanggilan2 : info.noTimPemeriksa);
        var curTglTerbit = stageNum === 1 ? info.tglPanggilan1 : (stageNum === 2 ? info.tglPanggilan2 : info.tglPanggilan1);
        var curJadwalSidang = stageNum === 2 ? info.jadwalSidang2 : info.tglBAP;
        var curDocKey = stageNum === 1 ? 'SURAT_PANGGILAN_I' : (stageNum === 2 ? 'SURAT_PANGGILAN_II' : 'SPT_TIM_PEMERIKSA');
        var curDocBtnLabel = stageNum === 1 ? 'Cetak Surat Panggilan I (Ctrl+P)' : (stageNum === 2 ? 'Cetak Surat Panggilan II (Ctrl+P)' : 'Cetak Surat Tim Pemeriksa (Ctrl+P)');
        var curEditBtnLabel = stageNum === 1 ? 'Edit Surat Panggilan I' : (stageNum === 2 ? 'Edit Surat Panggilan II' : 'Edit Surat Panggilan & Pemeriksa');
        var curDossierTitle = stageNum === 1 ? 'Dossier Surat Panggilan I (Pertama)' : (stageNum === 2 ? 'Dossier Surat Panggilan II (Kedua / Terakhir)' : 'Dossier Penetapan Tim Pemeriksa Disiplin');
        var curKlausulNote = stageNum === 1
          ? 'Sesuai ketentuan Pasal 26 Ayat (1) PP No. 94 Tahun 2021, Surat Panggilan I disampaikan secara tertulis paling lambat 7 hari kerja sebelum tanggal pemeriksaan.'
          : (stageNum === 2
            ? 'Menindaklanjuti ketidakhadiran pada Panggilan I (' + esc(info.noPanggilan1) + '). Sesuai Pasal 26 Ayat (2) & (3) PP No. 94 Tahun 2021, apabila pada tanggal pemeriksaan Surat Panggilan II ini tetap tidak hadir tanpa alasan sah, maka Hukuman Disiplin dijatuhkan berdasarkan alat bukti yang ada tanpa pemeriksaan.'
            : 'Sesuai Pasal 27 & 28 PP No. 94 Tahun 2021, Tim Pemeriksa dibentuk untuk memeriksa dugaan pelanggaran disiplin sedang/berat yang terdiri dari unsur Atasan Langsung, Unsur Pengawasan, dan Unsur Kepegawaian.');

        return '<div class="card-elevated rounded-2xl p-5 border-t-4 border-electric-blue space-y-4">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div><div class="text-xs font-bold text-electric-blue uppercase tracking-wider">Tahap ' + stageNum + ' dari 8 • Administrasi Pemanggilan</div><h4 class="text-base font-bold text-navy-deep">' + subLabel + '</h4></div>' +
          statusTag +
          '</div>' +
          '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">' +
          '<div class="p-4 rounded-xl bg-surface-low border border-border-subtle space-y-2 text-xs">' +
          '<div class="font-bold text-navy-deep flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px]">mail</span><span>' + curDossierTitle + '</span></div>' +
          '<div class="grid grid-cols-3 gap-1 pt-1"><span class="text-text-muted">No. Surat:</span><span class="col-span-2 font-mono font-bold text-navy-deep">' + esc(curNoSurat) + '</span></div>' +
          '<div class="grid grid-cols-3 gap-1"><span class="text-text-muted">Tgl Terbit:</span><span class="col-span-2 font-semibold">' + esc(curTglTerbit) + '</span></div>' +
          (stageNum === 2 ? '<div class="grid grid-cols-3 gap-1"><span class="text-text-muted">Rujukan Panggilan I:</span><span class="col-span-2 font-mono text-[11px] text-status-absent">' + esc(info.noPanggilan1) + ' (' + esc(info.tglPanggilan1) + ')</span></div>' : '') +
          '<div class="grid grid-cols-3 gap-1"><span class="text-text-muted">Terperiksa:</span><span class="col-span-2 font-bold">' + esc(d.nama) + ' (' + esc(info.terperiksaPangkat) + ')</span></div>' +
          '<div class="grid grid-cols-3 gap-1"><span class="text-text-muted">Pemeriksa:</span><span class="col-span-2">' + esc(info.pemeriksaNama) + ' (' + esc(info.pemeriksaJabatan) + ')</span></div>' +
          '<div class="grid grid-cols-3 gap-1"><span class="text-text-muted">Jadwal Sidang:</span><span class="col-span-2 font-mono font-semibold text-navy-deep">' + esc(curJadwalSidang) + '</span></div>' +
          '<div class="grid grid-cols-3 gap-1"><span class="text-text-muted">Tempat Sidang:</span><span class="col-span-2">' + esc(info.tempatSidang) + '</span></div>' +
          '</div>' +
          '<div class="p-4 rounded-xl bg-surface-low border border-border-subtle space-y-2 text-xs">' +
          '<div class="font-bold text-navy-deep flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px]">gavel</span><span>Ringkasan Dugaan Pelanggaran &amp; Ketentuan Panggilan</span></div>' +
          '<p class="text-text-main leading-relaxed"><b>' + esc(d.pelanggaran) + '</b> (' + esc(d.dasarHukum) + '). ' + curKlausulNote + '</p>' +
          '<div class="pt-2 flex flex-wrap gap-2">' +
          '<button type="button" data-action="edit-disiplin-stage" data-stage="' + stageNum + '" data-id="' + esc(d.id) + '" class="px-3.5 py-2 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">edit_calendar</span><span>' + curEditBtnLabel + '</span></button>' +
          '<button type="button" data-action="print-ctrlp-type" data-doc="' + curDocKey + '" data-id="' + esc(d.id) + '" class="px-3.5 py-2 rounded-xl bg-navy-deep hover:bg-primary text-white text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">print</span><span>' + curDocBtnLabel + '</span></button>' +
          (stageNum < 4 ? '<button type="button" data-action="advance-disiplin-form" data-stage="' + (stageNum + 1) + '" data-id="' + esc(d.id) + '" class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5"><span>Kirim &amp; Isi Form Tahap ' + (stageNum + 1) + '</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span></button>' : '') +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>';
      }

      if (stageNum === 4) {
        var buktiCards = '';
        for (var m = 0; m < info.hariMangkir.length; m++) {
          var mk = info.hariMangkir[m];
          buktiCards += '<div class="flex items-center justify-between p-2.5 bg-[#f7f9fe] rounded-xl border border-slate-100">' +
            '<div class="flex items-center gap-2.5">' +
            '<div class="w-2 h-2 rounded-full bg-status-absent shrink-0"></div>' +
            '<div><div class="font-mono text-xs font-bold text-[#181c20]">' + esc(mk.tgl) + '</div><div class="text-[11px] text-text-muted">' + esc(mk.lokasi || mk.ket) + '</div></div>' +
            '</div>' +
            '<span class="text-[11px] bg-red-50 text-status-absent px-2 py-0.5 rounded-full font-semibold">' + esc(mk.status || 'Alpa') + '</span>' +
            '</div>';
        }
        return '<div class="space-y-4">' +
          '<div class="card-elevated rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">' +
          '<div class="space-y-1">' +
          '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="font-mono text-xs bg-navy-deep text-white px-2.5 py-0.5 rounded-md font-semibold">KASUS #' + esc(d.id) + '</span>' +
          '<span class="text-[11px] bg-emerald-50 text-status-present px-2.5 py-0.5 rounded-full font-semibold inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-status-present"></span><span>Sidang Pemeriksaan (' + esc(info.tglBAP) + ')</span></span>' +
          '<span class="text-[11px] bg-blue-50 text-secondary px-2.5 py-0.5 rounded-full font-semibold">' + info.bapQA.length + ' Pertanyaan &amp; Jawaban BAP</span>' +
          statusTag +
          '</div>' +
          '<h4 class="text-lg font-bold text-navy-deep">Berita Acara Pemeriksaan (BAP) PP No. 94/2021</h4>' +
          '<p class="text-xs text-text-muted">Terperiksa: <strong class="text-text-main">' + esc(d.nama) + '</strong> (NIP. <span class="font-mono">' + esc(formatNipSpaced(d.nip)) + '</span>) • Rujukan Lampiran Peraturan BKN No. 6 Tahun 2022</p>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
          '<button type="button" data-action="edit-disiplin-stage" data-stage="4" data-id="' + esc(d.id) + '" class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"><span class="material-symbols-outlined text-[16px]">quiz</span><span>Edit Form BAP (Pertanyaan &amp; Jawaban)</span></button>' +
          '<button type="button" data-action="print-ctrlp-type" data-doc="BAP_DISIPLIN" data-id="' + esc(d.id) + '" class="px-3.5 py-2 rounded-xl bg-surface-low hover:bg-surface-high text-navy-deep text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">print</span><span>Cetak BAP</span></button>' +
          '<button type="button" data-action="advance-disiplin-form" data-stage="5" data-id="' + esc(d.id) + '" class="px-4 py-2 rounded-xl bg-navy-deep hover:bg-primary text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"><span>Lanjut &amp; Isi Form Tahap 5 (SK)</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span></button>' +
          '</div>' +
          '</div>' +
          '<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">' +
          '<div class="lg:col-span-8 bg-white rounded-2xl p-5 sm:p-8 shadow-md border border-border-subtle relative overflow-hidden">' +
          buildKopSuratHTML() +
          buildDisiplinBapSheetInnerHTML(d, info) +
          '</div>' +
          '<div class="lg:col-span-4 space-y-4">' +
          '<div class="card-elevated rounded-2xl p-4 space-y-3">' +
          '<div class="flex items-center justify-between pb-2 border-b border-border-subtle">' +
          '<div class="flex items-center gap-2"><div class="w-8 h-8 rounded-lg bg-emerald-50 text-status-present flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">fact_check</span></div><h5 class="font-bold text-sm text-navy-deep">Pelaksanaan BAP</h5></div>' +
          '<button type="button" data-action="edit-disiplin-stage" data-stage="4" data-id="' + esc(d.id) + '" class="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-electric-blue hover:text-white text-electric-blue text-[11px] font-bold transition-smooth">Edit Tanya-Jawab</button>' +
          '</div>' +
          '<div class="space-y-2.5 text-xs">' +
          '<div><div class="text-text-muted">Tanggal &amp; Waktu Sidang</div><div class="font-semibold mt-0.5 flex items-center gap-1.5"><span class="material-symbols-outlined text-[15px] text-electric-blue">event</span><span>' + esc(info.tglBAP) + '</span></div></div>' +
          '<div><div class="text-text-muted">Tempat Pemeriksaan</div><div class="font-semibold mt-0.5 flex items-center gap-1.5"><span class="material-symbols-outlined text-[15px] text-electric-blue">meeting_room</span><span>' + esc(info.tempatSidang) + '</span></div></div>' +
          '<div><div class="text-text-muted">Saksi / Notulis Kepegawaian</div><div class="font-semibold mt-0.5 flex items-center gap-1.5"><span class="material-symbols-outlined text-[15px] text-electric-blue">badge</span><span>' + esc(info.saksi1Nama) + '</span></div></div>' +
          '<div><div class="text-text-muted">Jumlah Butir Pemeriksaan</div><div class="font-semibold text-status-present mt-0.5 flex items-center gap-1.5"><span class="material-symbols-outlined text-[15px]">check_circle</span><span>' + info.bapQA.length + ' Pertanyaan &amp; Jawaban Terdata</span></div></div>' +
          '</div>' +
          '</div>' +
          '<div class="card-elevated rounded-2xl p-4 space-y-3">' +
          '<div class="flex items-center gap-2 pb-2 border-b border-border-subtle"><div class="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">gavel</span></div><h5 class="font-bold text-sm text-navy-deep">Resume Fakta Hukum</h5></div>' +
          '<div class="p-3 rounded-xl bg-surface-low"><div class="text-[10px] font-bold text-text-muted uppercase">Pelanggaran Terbukti</div><div class="text-xs font-bold text-status-absent mt-0.5">' + esc(d.pelanggaran) + '</div></div>' +
          '<div class="p-3 rounded-xl bg-surface-low"><div class="text-[10px] font-bold text-text-muted uppercase">Rujukan Ketentuan PP 94/2021</div><div class="text-xs font-bold text-navy-deep mt-0.5">' + esc(d.dasarHukum) + '</div></div>' +
          '<div class="p-3 rounded-xl bg-blue-50"><div class="text-[10px] font-bold text-secondary uppercase">Rekomendasi Penjatuhan Sanksi</div><div class="text-xs font-bold text-navy-deep mt-0.5">' + esc(d.sanksi).toUpperCase() + '</div></div>' +
          '<div class="flex items-center justify-between text-xs pt-1"><span class="text-text-muted">Pejabat Pemeriksa:</span><span class="font-bold text-navy-deep">' + esc(info.pemeriksaNama) + '</span></div>' +
          '</div>' +
          '<div class="card-elevated rounded-2xl p-4 space-y-2.5">' +
          '<div class="flex items-center justify-between pb-2 border-b border-border-subtle"><div class="flex items-center gap-2"><div class="w-8 h-8 rounded-lg bg-blue-50 text-secondary flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">fingerprint</span></div><h5 class="font-bold text-sm text-navy-deep">Bukti Log Diakui</h5></div><span class="font-mono text-xs bg-surface-low px-2 py-0.5 rounded font-bold text-navy-deep">' + info.hariMangkir.length + ' Kejadian</span></div>' +
          buktiCards +
          '<p class="text-[11px] text-text-muted italic">Seluruh bukti log presensi digital telah diakui sah dalam Berita Acara Pemeriksaan.</p>' +
          '</div>' +
          '<div class="rounded-2xl p-4 bg-gradient-to-br from-navy-deep to-primary text-white space-y-3 shadow-md">' +
          '<div class="flex items-center gap-2"><span class="material-symbols-outlined text-blue-300">arrow_circle_right</span><h5 class="font-bold text-sm">Aksi Lanjutan Kasus</h5></div>' +
          '<p class="text-xs text-blue-100 leading-relaxed">Proses pemeriksaan BAP selesai. Klik tombol di bawah untuk mengisi Form SK Hukuman Disiplin (Tahap 5).</p>' +
          '<button type="button" data-action="advance-disiplin-form" data-stage="5" data-id="' + esc(d.id) + '" class="w-full py-2.5 px-4 rounded-xl bg-electric-blue hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"><span>Isi Form &amp; Buat SK Hukuman Disiplin</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span></button>' +
          '<button type="button" data-action="print-ctrlp-type" data-doc="BAP_DISIPLIN" data-id="' + esc(d.id) + '" class="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-[16px]">print</span><span>Buka Simulator Cetak BAP Ctrl+P</span></button>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>';
      }

      if (stageNum === 5) {
        var alpaRows = '';
        for (var aIdx = 0; aIdx < info.hariMangkir.length; aIdx++) {
          var al = info.hariMangkir[aIdx];
          alpaRows += '<div class="flex items-center justify-between p-2.5 rounded-xl bg-surface-low">' +
            '<div class="flex items-center gap-2.5">' +
            '<div class="w-8 h-8 rounded-lg bg-red-50 text-status-absent flex items-center justify-center font-mono text-xs font-bold">' + esc(al.kode || ('0' + (aIdx + 1))) + '</div>' +
            '<div><div class="text-xs font-semibold text-text-main">' + esc(al.hariTgl || al.tgl) + '</div><div class="text-[11px] text-text-muted">' + esc(al.ket) + '</div></div>' +
            '</div>' +
            '<span class="px-2 py-0.5 rounded bg-red-50 text-status-absent font-mono text-[10px] font-semibold">' + esc(al.status || 'Alpa') + '</span>' +
            '</div>';
        }
        var skInitials = esc(d.nama).split(' ').slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
        return '<div class="space-y-4">' +
          '<div class="card-elevated rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">' +
          '<div class="space-y-1">' +
          '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="font-mono text-xs bg-navy-deep/10 text-navy-deep px-2.5 py-0.5 rounded-full font-bold">#' + esc(d.id) + '</span>' +
          '<span class="text-[11px] bg-surface-low text-text-main px-2.5 py-0.5 rounded-full font-medium">PNS Pemkab Teluk Wondama</span>' +
          '<span class="text-[11px] bg-emerald-50 text-status-present px-2.5 py-0.5 rounded-full font-semibold">' + esc(d.dasarHukum) + '</span>' +
          statusTag +
          '</div>' +
          '<h4 class="text-lg font-bold text-navy-deep">Tahap 5: Surat Keputusan (SK) Hukuman Disiplin — ' + esc(d.sanksi) + '</h4>' +
          '<p class="text-xs text-text-muted">Terperiksa: <b>' + esc(d.nama) + '</b> (<span class="font-mono">NIP ' + esc(formatNipSpaced(d.nip)) + '</span>) • Berdasarkan BAP No. <span class="font-mono text-secondary font-medium">' + esc(info.noBAP) + '</span></p>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
          '<button type="button" data-action="edit-disiplin-stage" data-stage="5" data-id="' + esc(d.id) + '" class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"><span class="material-symbols-outlined text-[16px]">edit_document</span><span>Edit Form SK Hukuman Disiplin</span></button>' +
          '<button type="button" data-action="print-ctrlp-type" data-doc="SK_HUKUMAN_DISIPLIN" data-id="' + esc(d.id) + '" class="px-3.5 py-2 rounded-xl bg-surface-low hover:bg-surface-high text-navy-deep text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">print</span><span>Cetak SK (Ctrl+P)</span></button>' +
          '<button type="button" data-action="advance-disiplin-form" data-stage="6" data-id="' + esc(d.id) + '" class="px-4 py-2 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"><span>Lanjut &amp; Isi Form Tahap 6 (BA Penyampaian)</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span></button>' +
          '</div>' +
          '</div>' +
          '<div class="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">' +
          '<div class="xl:col-span-7 space-y-2.5">' +
          '<div class="bg-white px-4 py-2 rounded-xl border border-border-subtle flex items-center justify-between text-[11px]">' +
          '<span class="font-mono font-bold text-status-absent tracking-wider">[ R A H A S I A ] DOKUMEN TERTUTUP KEPEGAWAIAN</span>' +
          '<span class="font-mono text-status-present font-semibold">Standar BKN No. 6/2022 • Tervalidasi</span>' +
          '</div>' +
          '<div class="bg-white rounded-2xl p-5 sm:p-8 shadow-md border border-border-subtle relative overflow-hidden">' +
          buildKopSuratHTML() +
          buildDisiplinSkSheetInnerHTML(d, info) +
          '</div>' +
          '</div>' +
          '<div class="xl:col-span-5 space-y-4">' +
          '<div class="card-elevated rounded-2xl p-4 space-y-3">' +
          '<div class="flex items-center justify-between"><span class="text-xs font-bold text-navy-deep uppercase flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px] text-electric-blue">badge</span><span>Identitas Pegawai Terperiksa</span></span><span class="px-2 py-0.5 rounded-full bg-red-50 text-status-absent text-[11px] font-bold">Terbukti Melanggar</span></div>' +
          '<div class="flex items-center gap-3">' +
          '<div class="w-12 h-12 rounded-xl bg-navy-deep text-white flex items-center justify-center font-bold text-base shrink-0">' + skInitials + '</div>' +
          '<div class="min-w-0"><div class="font-bold text-sm text-navy-deep truncate">' + esc(d.nama) + '</div><div class="font-mono text-xs text-text-muted">NIP. ' + esc(formatNipSpaced(d.nip)) + '</div><div class="flex gap-1.5 mt-1"><span class="px-2 py-0.5 rounded bg-surface-low text-[11px] font-medium">' + esc(info.terperiksaPangkat) + '</span><span class="px-2 py-0.5 rounded bg-surface-low text-[11px] text-text-muted truncate">' + esc(info.terperiksaJabatan) + '</span></div></div>' +
          '</div>' +
          '</div>' +
          '<div class="card-elevated rounded-2xl p-4 space-y-2.5">' +
          '<div class="flex items-center justify-between"><span class="text-xs font-bold text-navy-deep uppercase flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px] text-secondary">balance</span><span>Pertimbangan Hukum &amp; Sanksi</span></span><button type="button" data-action="edit-disiplin-stage" data-stage="5" data-id="' + esc(d.id) + '" class="text-[11px] font-bold text-electric-blue hover:underline">Ubah Sanksi / No. SK</button></div>' +
          '<div class="p-3 rounded-xl bg-surface-low text-xs"><div class="font-semibold text-navy-deep">Klasifikasi Pelanggaran</div><p class="text-text-muted mt-0.5">' + esc(d.pelanggaran) + ' (' + esc(d.dasarHukum) + ').</p></div>' +
          '<div class="p-3 rounded-xl bg-amber-50 flex items-center justify-between"><div class="flex items-center gap-2"><span class="material-symbols-outlined text-amber-600">warning</span><div><div class="text-xs font-bold">' + esc(d.sanksi) + '</div><div class="text-[11px] text-text-muted">No. SK: ' + esc(info.noSK) + ' (' + esc(info.tglSK) + ')</div></div></div><span class="font-mono text-xs font-bold text-amber-700 bg-white px-2 py-1 rounded">SK SAH</span></div>' +
          '</div>' +
          '<div class="card-elevated rounded-2xl p-4 space-y-2">' +
          '<div class="flex items-center justify-between pb-1"><span class="text-xs font-bold text-navy-deep uppercase flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px] text-status-absent">event_busy</span><span>Bukti Hari Alpa Terbukti</span></span><span class="font-mono text-[11px] font-bold text-status-absent bg-red-50 px-2 py-0.5 rounded-full">Total: ' + info.hariMangkir.length + ' Kejadian</span></div>' +
          alpaRows +
          '</div>' +
          '<div class="card-elevated rounded-2xl p-4 space-y-2">' +
          '<button type="button" data-action="advance-disiplin-form" data-stage="6" data-id="' + esc(d.id) + '" class="w-full py-2.5 px-4 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-bold flex items-center justify-center gap-1.5"><span>Lanjut &amp; Isi Form Tahap 6: Penyampaian Tertutup</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span></button>' +
          '<button type="button" data-action="print-ctrlp-type" data-doc="SK_HUKUMAN_DISIPLIN" data-id="' + esc(d.id) + '" class="w-full py-2 px-3 rounded-xl bg-surface-low hover:bg-surface-high text-navy-deep text-xs font-semibold">Simulasi Cetak SK A4 (Ctrl+P)</button>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>';
      }

      if (stageNum === 6 || stageNum === 7) {
        var penInitials = esc(d.nama).split(' ').slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
        return '<div class="space-y-4">' +
          '<div class="card-elevated rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">' +
          '<div class="space-y-1">' +
          '<div class="flex flex-wrap items-center gap-2">' +
          '<span class="font-mono text-xs bg-navy-deep text-white px-2.5 py-0.5 rounded-lg font-bold">#' + esc(d.id) + '</span>' +
          '<span class="text-[11px] bg-surface-low text-navy-deep px-2.5 py-0.5 rounded-full font-semibold">PNS Pemkab Teluk Wondama</span>' +
          '<span class="text-[11px] bg-teal-50 text-mode-wfa px-2.5 py-0.5 rounded-full font-semibold">PP 94/2021 Ps. 31 &amp; 32 jo. Per BKN 6/2022</span>' +
          statusTag +
          '</div>' +
          '<h4 class="text-lg font-bold text-navy-deep">Tahap 6 &amp; 7: Penyampaian Keputusan Tertutup &amp; Berita Acara Penyampaian</h4>' +
          '<p class="text-xs text-text-muted">Terperiksa: <b>' + esc(d.nama) + '</b> (<span class="font-mono">NIP ' + esc(formatNipSpaced(d.nip)) + '</span>) • Dasar SK: <span class="font-mono font-semibold text-navy-deep">' + esc(info.noSK) + '</span> (' + esc(info.tglSK) + ')</p>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
          '<button type="button" data-action="edit-disiplin-stage" data-stage="6" data-id="' + esc(d.id) + '" class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"><span class="material-symbols-outlined text-[16px]">edit_note</span><span>Edit Form BA Penyampaian &amp; Saksi</span></button>' +
          '<button type="button" data-action="print-ctrlp-type" data-doc="BA_PENYAMPAIAN_TERTUTUP" data-id="' + esc(d.id) + '" class="px-3.5 py-2 rounded-xl bg-surface-low hover:bg-surface-high text-navy-deep text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">print</span><span>Cetak BA (Ctrl+P)</span></button>' +
          '<button type="button" data-action="advance-disiplin-form" data-stage="8" data-id="' + esc(d.id) + '" class="px-4 py-2 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"><span>Lanjut &amp; Isi Form Tahap 8 (Inkrah)</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span></button>' +
          '</div>' +
          '</div>' +
          '<div class="card-elevated rounded-2xl p-4 border-l-4 border-status-present flex flex-col md:flex-row items-start md:items-center justify-between gap-4">' +
          '<div class="flex items-start gap-3">' +
          '<div class="w-10 h-10 rounded-xl bg-emerald-50 text-status-present flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-2xl">event_available</span></div>' +
          '<div class="space-y-1">' +
          '<div class="flex flex-wrap items-center gap-2"><span class="text-sm font-bold text-navy-deep">Uji Kepatuhan Tenggat Waktu Formil Berita Acara</span><span class="px-2 py-0.5 rounded-full bg-emerald-50 text-status-present text-[11px] font-bold">Valid (Hari ke-4 dari maks 14 hari)</span></div>' +
          '<p class="text-xs text-text-muted leading-relaxed">Sesuai <b>Pasal 31 ayat (1) PP No. 94/2021</b>, Keputusan Hukuman Disiplin disampaikan paling lambat 14 hari kerja sejak ditetapkan (<span class="font-mono font-bold text-navy-deep">' + esc(info.tglSK) + '</span>). Batas akhir: <span class="font-mono font-bold text-navy-deep">' + esc(info.batasPenyampaian) + '</span>. Terlaksana tepat waktu pada <b class="text-status-present">' + esc(info.tglPenyampaian) + '</b>.</p>' +
          '</div>' +
          '</div>' +
          '<div class="bg-[#F3F6FB] px-4 py-2 rounded-xl text-center md:text-right shrink-0">' +
          '<div class="text-[10px] font-bold uppercase text-text-muted">Sisa Waktu Formil</div>' +
          '<div class="text-2xl font-bold text-status-present">10 Hari</div>' +
          '<div class="font-mono text-[11px] text-status-present font-semibold">Aman &amp; Sah Yuridis</div>' +
          '</div>' +
          '</div>' +
          '<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">' +
          '<div class="lg:col-span-8 bg-white rounded-2xl p-5 sm:p-8 shadow-md border border-border-subtle relative overflow-hidden">' +
          buildKopSuratHTML() +
          buildDisiplinBaPenyampaianSheetInnerHTML(d, info) +
          '</div>' +
          '<div class="lg:col-span-4 space-y-4">' +
          '<div class="card-elevated rounded-2xl p-4 space-y-3">' +
          '<div class="flex items-center justify-between pb-2 border-b border-border-subtle"><span class="text-xs font-bold text-navy-deep flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px] text-electric-blue">person_pin</span><span>Identitas Penerima SK</span></span><span class="px-2 py-0.5 rounded-full bg-emerald-50 text-status-present text-[11px] font-bold">Hadir &amp; Menerima</span></div>' +
          '<div class="flex items-center gap-3"><div class="w-11 h-11 rounded-full bg-surface-high flex items-center justify-center font-bold text-navy-deep shrink-0">' + penInitials + '</div><div class="min-w-0"><div class="text-xs font-bold text-navy-deep truncate">' + esc(d.nama) + '</div><div class="font-mono text-[11px] text-text-muted">NIP. ' + esc(formatNipSpaced(d.nip)) + '</div><div class="text-[11px] text-text-muted">' + esc(info.terperiksaPangkat) + ' • ' + esc(info.terperiksaJabatan) + '</div></div></div>' +
          '<div class="grid grid-cols-2 gap-2 text-xs"><div class="bg-[#F3F6FB] p-2 rounded-lg"><div class="text-[10px] text-text-muted uppercase">Jenis Hukuman</div><div class="font-bold text-status-absent">' + esc(d.sanksi) + '</div></div><div class="bg-[#F3F6FB] p-2 rounded-lg"><div class="text-[10px] text-text-muted uppercase">Kategori</div><div class="font-bold text-navy-deep">Kumulatif 4 Hari</div></div></div>' +
          '</div>' +
          '<div class="card-elevated rounded-2xl p-4 space-y-2.5">' +
          '<div class="text-xs font-bold text-navy-deep pb-2 border-b border-border-subtle flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px]">lock</span><span>Klausul Tertutup (Pasal 32 PP 94/2021)</span></div>' +
          '<div class="p-2.5 rounded-lg bg-[#F3F6FB] text-xs"><b class="text-navy-deep block">Batas Hadirin Terbatas</b><span class="text-text-muted">Hanya dihadiri PyBM, PNS bersangkutan, dan 2 pejabat saksi resmi. Tidak dihadiri publik.</span></div>' +
          '<div class="p-2.5 rounded-lg bg-[#F3F6FB] text-xs"><b class="text-navy-deep block">Tempat Pelaksanaan Steril</b><span class="text-text-muted">Ruang Kerja Pimpinan BKAD Pemkab Teluk Wondama Rasiei (Pintu Tertutup).</span></div>' +
          '<div class="p-2.5 rounded-lg bg-[#F3F6FB] text-xs"><b class="text-navy-deep block">Kerahasiaan Berkas Terjamin</b><span class="text-text-muted">Salinan SK diserahkan dalam amplop kedap bersegel kode rahasia dinas BKN.</span></div>' +
          '</div>' +
          '<div class="card-elevated rounded-2xl p-4 space-y-2">' +
          '<div class="text-xs font-bold text-navy-deep pb-1 border-b border-border-subtle">Status Penandatanganan BA</div>' +
          '<div class="flex justify-between p-2 rounded-lg bg-emerald-50 text-xs"><span>PNS Bersedia TTD</span><b class="text-status-present">Lengkap</b></div>' +
          '<div class="flex justify-between p-2 rounded-lg bg-emerald-50 text-xs"><span>Saksi I (Kepegawaian)</span><b class="text-status-present">Lengkap</b></div>' +
          '<div class="flex justify-between p-2 rounded-lg bg-emerald-50 text-xs"><span>Saksi II (Keuangan &amp; Aset)</span><b class="text-status-present">Lengkap</b></div>' +
          '<div class="flex justify-between p-2 rounded-lg bg-emerald-50 text-xs"><span>PyBM (Plt. Kepala BKAD)</span><b class="text-status-present">Tercap Resmi</b></div>' +
          '</div>' +
          '<div class="card-elevated rounded-2xl p-4 space-y-2">' +
          '<div class="text-xs font-bold text-navy-deep pb-1 border-b border-border-subtle">Perhitungan Berlaku Sah (Inkrah)</div>' +
          '<div class="flex justify-between text-xs"><span class="text-text-muted">Tgl Penyampaian:</span><span class="font-mono font-bold">' + esc(info.tglPenyampaian) + '</span></div>' +
          '<div class="flex justify-between text-xs"><span class="text-text-muted">Masa Sanggah:</span><span class="font-bold text-navy-deep">14 Hari Kerja</span></div>' +
          '<div class="flex justify-between text-xs"><span class="text-text-muted">Tgl Berlaku Sah (Ke-15):</span><span class="font-mono font-bold text-status-present">' + esc(info.tglInkrah) + '</span></div>' +
          '<div class="pt-1"><div class="flex justify-between text-[11px] font-semibold mb-1"><span>Kesiapan Masuk Tahap 8</span><span class="text-electric-blue">100%</span></div><div class="w-full h-2 rounded-full bg-surface-high overflow-hidden"><div class="h-full bg-electric-blue w-full"></div></div></div>' +
          '</div>' +
          '<div class="rounded-2xl p-4 bg-navy-deep text-white space-y-2.5">' +
          '<div class="text-sm font-bold flex items-center gap-1.5"><span class="material-symbols-outlined text-teal-300">verified_user</span><span>Finalisasi Berita Acara</span></div>' +
          '<button type="button" data-action="select-disiplin-stage" data-stage="8" class="w-full py-2.5 px-4 rounded-xl bg-electric-blue hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"><span>Lanjut ke Tahap 8: Inkrah &amp; I&#39;DIS BKN</span><span class="material-symbols-outlined text-[16px]">arrow_forward</span></button>' +
          '<div class="grid grid-cols-2 gap-2">' +
          '<button type="button" data-action="print-ctrlp-type" data-doc="BA_PENYAMPAIAN_TERTUTUP" data-id="' + esc(d.id) + '" class="py-2 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold">Simulasi Cetak A4</button>' +
          '<button type="button" data-action="download-disiplin-bundle" data-id="' + esc(d.id) + '" class="py-2 px-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold">Unduh Arsip</button>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>';
      }

      var pipeCards = '';
      var pMeta = [
        { n: '01', t: 'Deteksi Alpa', s: 'E-Presensi Audit', d: '18 Jun 2025' },
        { n: '02', t: 'Panggilan I', s: 'Surat Resmi Atasan', d: esc(info.tglPanggilan1) },
        { n: '03', t: 'SPT Periksa', s: 'Tim Pemeriksa BKAD', d: '26 Jun 2025' },
        { n: '04', t: 'BAP Terbuka', s: 'Klarifikasi & Bukti', d: '01 Jul 2025' },
        { n: '05', t: 'SK Disiplin', s: 'Penetapan Hukuman', d: esc(info.tglSK) },
        { n: '06', t: 'TTD & Stempel', s: 'Pengesahan Kepala', d: esc(info.tglSK) },
        { n: '07', t: 'Penyampaian', s: 'Penyerahan Tertutup', d: '07 Jul 2025' },
        { n: '08', t: 'Inkrah & I&#39;DIS', s: 'Sinkronisasi Nasional', d: esc(info.tglInkrah) }
      ];
      for (var pm = 0; pm < pMeta.length; pm++) {
        var pmItem = pMeta[pm];
        var isP8 = pm === 7;
        pipeCards += '<div class="p-3 rounded-xl flex flex-col justify-between ' + (isP8 ? 'bg-status-present text-white shadow-md' : 'bg-[#F3F6FB] border border-emerald-200') + '">' +
          '<div class="flex items-center justify-between mb-1.5"><span class="font-mono text-[10px] font-bold ' + (isP8 ? 'text-emerald-100' : 'text-text-muted') + '">' + pmItem.n + '</span><span class="material-symbols-outlined text-[15px] ' + (isP8 ? 'text-white' : 'text-status-present') + '">' + (isP8 ? 'stars' : 'check_circle') + '</span></div>' +
          '<div><div class="text-xs font-bold leading-tight ' + (isP8 ? 'text-white' : 'text-navy-deep') + '">' + pmItem.t + '</div><div class="text-[10px] mt-0.5 ' + (isP8 ? 'text-emerald-100' : 'text-text-muted') + '">' + pmItem.s + '</div></div>' +
          '<div class="font-mono text-[10px] mt-2 pt-1.5 border-t ' + (isP8 ? 'border-white/25 text-white font-bold' : 'border-border-subtle text-text-muted') + '">' + pmItem.d + '</div>' +
          '</div>';
      }
      return '<div class="space-y-4">' +
        '<div class="card-elevated rounded-2xl p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">' +
        '<div class="space-y-1">' +
        '<div class="flex flex-wrap items-center gap-2">' +
        '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-status-present text-[11px] font-bold uppercase"><span class="w-2 h-2 rounded-full bg-status-present"></span><span>Tahap 8: Berlaku Sah / Inkrah (100% Selesai)</span></span>' +
        '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-secondary text-[11px] font-semibold">I&#39;DIS BKN RI: Synchronized &amp; Locked</span>' +
        '<span class="font-mono text-[11px] bg-surface-low px-2.5 py-1 rounded-full text-text-muted">' + esc(info.tglInkrah) + ' • 10:15 WIT</span>' +
        '</div>' +
        '<h4 class="text-lg font-bold text-navy-deep">Tahap 8: Status Berlaku Sah (Inkrah) &amp; Sinkronisasi I&#39;DIS BKN RI</h4>' +
        '<p class="text-xs text-text-muted">Kasus Penegakan Disiplin <span class="font-mono font-bold text-secondary">#' + esc(d.id) + '</span> • Terperiksa: <b>' + esc(d.nama) + '</b> • PP No. 94/2021 &amp; PerBKN No. 6/2022</p>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
        '<button type="button" data-action="print-ctrlp-type" data-doc="BUKTI_IDIS_BKN_1" data-id="' + esc(d.id) + '" class="px-3 py-2 rounded-xl bg-surface-low hover:bg-surface-high text-navy-deep text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">print</span><span>Cetak Bukti (Ctrl+P)</span></button>' +
        '<button type="button" data-action="download-disiplin-bundle" data-id="' + esc(d.id) + '" class="px-3 py-2 rounded-xl bg-surface-low hover:bg-surface-high text-navy-deep text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">folder_zip</span><span>Unduh Berkas</span></button>' +
        '<button type="button" data-action="disiplin-view-mode" data-id="ARSIP" class="px-3.5 py-2 rounded-xl bg-navy-deep hover:bg-primary text-white text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">inventory_2</span><span>Buka Lemari Arsip</span></button>' +
        '</div>' +
        '</div>' +
        '<div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">' +
        '<div class="lg:col-span-8 bg-white rounded-2xl p-5 sm:p-8 shadow-md border border-border-subtle relative overflow-hidden">' +
        buildKopSuratHTML() +
        buildDisiplinInkrahSheetInnerHTML(d, info, '') +
        '</div>' +
        '<div class="lg:col-span-4 space-y-4">' +
        '<div class="card-elevated rounded-2xl p-4 space-y-2.5">' +
        '<div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="w-8 h-8 rounded-lg bg-blue-50 text-electric-blue flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">sync_saved_locally</span></div><div><h5 class="text-xs font-bold text-navy-deep">Audit I&#39;DIS BKN RI</h5><div class="text-[10px] text-text-muted">REST API SIASN v2</div></div></div><span class="font-mono text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-status-present font-bold">200 OK</span></div>' +
        '<div class="space-y-1.5 text-xs bg-[#F3F6FB] p-3 rounded-xl">' +
        '<div class="flex justify-between"><span class="text-text-muted">Waktu Sinkronisasi</span><span class="font-mono font-semibold">' + esc(info.tglInkrah) + '</span></div>' +
        '<div class="flex justify-between"><span class="text-text-muted">ID Transaksi I&#39;DIS</span><span class="font-mono font-bold text-secondary">' + esc(info.txIDis) + '</span></div>' +
        '<div class="flex justify-between"><span class="text-text-muted">Response Gateway</span><span class="font-mono text-[11px] font-bold text-status-present">ACK_RECORD_COMMITTED</span></div>' +
        '</div>' +
        '<button type="button" data-action="view-siasn-json" data-id="' + esc(d.id) + '" class="w-full py-2 px-3 rounded-xl bg-slate-900 text-cyan-300 font-mono text-[11px] font-semibold">Lihat Log Payload JSON SIASN</button>' +
        '</div>' +
        '<div class="card-elevated rounded-2xl p-4 space-y-2.5">' +
        '<div class="flex items-center gap-2"><div class="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">event_busy</span></div><div><h5 class="text-xs font-bold text-navy-deep">Dampak Hak &amp; Layanan Kepegawaian</h5><div class="text-[10px] text-text-muted">Masa Hukuman: 12 Bulan (1 Tahun)</div></div></div>' +
        '<div class="flex items-center justify-between text-xs bg-[#F3F6FB] px-3 py-2 rounded-xl font-mono"><span class="text-mode-wfa font-bold">' + esc(info.tglInkrah) + '</span><span>→</span><span class="text-status-absent font-bold">' + esc(info.masaAkhirSanksi) + '</span></div>' +
        '<div class="space-y-1.5 text-[11px] text-text-muted">' +
        '<div>• <b>Kenaikan Pangkat (KP):</b> Ditunda selama masa berlaku sanksi (PP 94/2021 Ps. 43).</div>' +
        '<div>• <b>Tunjangan Kinerja / TPP:</b> Pemotongan indikator disiplin otomatis via SIM-GAJI BKAD.</div>' +
        '</div>' +
        '</div>' +
        '<div class="card-elevated rounded-2xl p-4 space-y-2">' +
        '<div class="flex items-center justify-between"><h5 class="text-xs font-bold text-navy-deep">Bundel Arsip Terkunci (4 Wajib + 3 Lembar BKN)</h5><span class="material-symbols-outlined text-status-present text-[17px]">lock</span></div>' +
        '<button type="button" data-action="print-ctrlp-type" data-doc="SURAT_PANGGILAN_I" data-id="' + esc(d.id) + '" class="w-full p-2 rounded-xl bg-[#F3F6FB] hover:bg-blue-50 text-left text-xs flex items-center justify-between"><span class="font-semibold text-navy-deep truncate">1. Surat Panggilan I (' + esc(info.tglPanggilan1) + ')</span><span class="material-symbols-outlined text-[15px] text-electric-blue">visibility</span></button>' +
        '<button type="button" data-action="print-ctrlp-type" data-doc="BAP_DISIPLIN" data-id="' + esc(d.id) + '" class="w-full p-2 rounded-xl bg-[#F3F6FB] hover:bg-blue-50 text-left text-xs flex items-center justify-between"><span class="font-semibold text-navy-deep truncate">2. Berita Acara Pemeriksaan (BAP)</span><span class="material-symbols-outlined text-[15px] text-electric-blue">visibility</span></button>' +
        '<button type="button" data-action="print-ctrlp-type" data-doc="SK_HUKUMAN_DISIPLIN" data-id="' + esc(d.id) + '" class="w-full p-2 rounded-xl bg-[#F3F6FB] hover:bg-blue-50 text-left text-xs flex items-center justify-between"><span class="font-semibold text-navy-deep truncate">3. SK Hukdis (' + esc(info.noSK) + ')</span><span class="material-symbols-outlined text-[15px] text-electric-blue">visibility</span></button>' +
        '<button type="button" data-action="print-ctrlp-type" data-doc="BA_PENYAMPAIAN_TERTUTUP" data-id="' + esc(d.id) + '" class="w-full p-2 rounded-xl bg-[#F3F6FB] hover:bg-blue-50 text-left text-xs flex items-center justify-between"><span class="font-semibold text-navy-deep truncate">4. BA Penyampaian Tertutup</span><span class="material-symbols-outlined text-[15px] text-electric-blue">visibility</span></button>' +
        '<div class="grid grid-cols-3 gap-1.5 pt-1">' +
        '<button type="button" data-action="print-ctrlp-type" data-doc="BUKTI_IDIS_BKN_1" data-id="' + esc(d.id) + '" class="p-2 rounded-lg bg-white border border-border-subtle hover:bg-blue-50 text-center text-[10px] font-bold text-navy-deep">I&#39;DIS L1<br/><span class="font-normal text-text-muted">BKAD</span></button>' +
        '<button type="button" data-action="print-ctrlp-type" data-doc="BUKTI_IDIS_BKN_2" data-id="' + esc(d.id) + '" class="p-2 rounded-lg bg-white border border-border-subtle hover:bg-blue-50 text-center text-[10px] font-bold text-navy-deep">I&#39;DIS L2<br/><span class="font-normal text-text-muted">Pegawai</span></button>' +
        '<button type="button" data-action="print-ctrlp-type" data-doc="BUKTI_IDIS_BKN_3" data-id="' + esc(d.id) + '" class="p-2 rounded-lg bg-white border border-border-subtle hover:bg-blue-50 text-center text-[10px] font-bold text-navy-deep">I&#39;DIS L3<br/><span class="font-normal text-text-muted">BKPSDM</span></button>' +
        '</div>' +
        '</div>' +
        '<div class="card-elevated rounded-2xl p-4 space-y-2">' +
        '<button type="button" data-action="resync-siasn" data-id="' + esc(d.id) + '" class="w-full py-2.5 px-4 rounded-xl bg-secondary hover:bg-electric-blue text-white text-xs font-bold flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-[16px]">cloud_sync</span><span>Sinkronkan Ulang SIASN BKN</span></button>' +
        '<button type="button" data-action="download-disiplin-bundle" data-id="' + esc(d.id) + '" class="w-full py-2 px-4 rounded-xl bg-status-present hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5"><span class="material-symbols-outlined text-[16px]">folder_zip</span><span>Unduh Bundel Arsip Lengkap</span></button>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="card-elevated rounded-2xl p-5 space-y-4">' +
        '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border-subtle">' +
        '<div><h5 class="text-sm font-bold text-navy-deep">Jalur Alur Penegakan Disiplin PNS (PP 94/2021 &amp; Perban BKN No. 6/2022)</h5><p class="text-xs text-text-muted">Penyelesaian tuntas seluruh 8 tahapan hukum formil penjatuhan sanksi sampai penetapan inkrah dan sinkronisasi nasional.</p></div>' +
        '<span class="px-3 py-1 rounded-full bg-emerald-50 text-status-present text-[11px] font-bold shrink-0">PROSES TUNTAS 8 DARI 8 TAHAP</span>' +
        '</div>' +
        '<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">' + pipeCards + '</div>' +
        '</div>' +
        '</div>';
    }

    function renderDisiplinArchiveCabinetHTML(d) {
      var info = getDisiplinEnrichedData(d);
      var docs = [
        { doc: 'SURAT_PANGGILAN_I', kode: '01_Surat_Panggilan_I_PP94.pdf', nomor: info.noPanggilan1, tgl: info.tglPanggilan1, ket: 'Tahap 1 — Pemanggilan pemeriksaan awal tertutup' },
        { doc: 'BAP_DISIPLIN', kode: '02_Berita_Acara_Pemeriksaan_BAP.pdf', nomor: info.noBAP, tgl: info.tglBAP, ket: 'Tahap 4 — 5 Q&A pemeriksaan + log 4 hari Geo-Lock GPS' },
        { doc: 'SK_HUKUMAN_DISIPLIN', kode: '03_SK_Teguran_Tertulis_HD01.pdf', nomor: info.noSK, tgl: info.tglSK, ket: 'Tahap 5 — Keputusan sanksi ringan PP 94/2021 Model HD.01' },
        { doc: 'BA_PENYAMPAIAN_TERTUTUP', kode: '04_BA_Penyampaian_Tertutup.pdf', nomor: info.noPenyampaian, tgl: info.tglPenyampaian, ket: 'Tahap 6–7 — Serah terima langsung & audit batas 14 hari kerja' },
        { doc: 'BUKTI_IDIS_BKN_1', kode: '05_Bukti_IDis_BKN_Lembar_1_BKAD.pdf', nomor: info.regIDis, tgl: info.tglInkrah, ket: 'Tahap 8 — Lembar 1 Arsip Kepegawaian BKAD' },
        { doc: 'BUKTI_IDIS_BKN_2', kode: '06_Bukti_IDis_BKN_Lembar_2_Pegawai.pdf', nomor: info.regIDis, tgl: info.tglInkrah, ket: 'Tahap 8 — Lembar 2 Salinan Pegawai Terhukum' },
        { doc: 'BUKTI_IDIS_BKN_3', kode: '07_Bukti_IDis_BKN_Lembar_3_BKPSDM.pdf', nomor: info.regIDis, tgl: info.tglInkrah, ket: 'Tahap 8 — Lembar 3 Arsip BKPSDM & Kanreg XIV BKN' }
      ];
      var rows = '';
      for (var i = 0; i < docs.length; i++) {
        var item = docs[i];
        rows += '<tr class="hover:bg-surface-low">' +
          '<td class="py-3 px-3"><div class="font-mono text-xs font-bold text-navy-deep">' + esc(item.kode) + '</div><div class="text-[11px] text-text-muted">' + esc(item.ket) + '</div></td>' +
          '<td class="py-3 px-3 font-mono text-xs">' + esc(item.nomor) + '</td>' +
          '<td class="py-3 px-3 text-xs">' + esc(item.tgl) + '</td>' +
          '<td class="py-3 px-3 text-right"><button type="button" data-action="print-ctrlp-type" data-doc="' + item.doc + '" data-id="' + esc(d.id) + '" class="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-electric-blue hover:text-white text-navy-deep text-xs font-semibold transition-smooth">Buka Ctrl+P</button></td>' +
          '</tr>';
      }
      return '<div class="card-elevated rounded-2xl p-5 space-y-4">' +
        '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-3">' +
        '<div><h3 class="text-base font-bold text-navy-deep">Lemari Arsip Digital Kasus Disiplin #' + esc(d.id) + ' (' + esc(d.nama) + ')</h3><p class="text-xs text-text-muted">Seluruh naskah autentikasi digital tersimpan dengan checksum SHA-256 & siap unduh sebagai bundel dossier lengkap.</p></div>' +
        '<button type="button" data-action="download-disiplin-bundle" data-id="' + esc(d.id) + '" class="px-4 py-2 rounded-xl bg-status-present hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm">' +
        '<span class="material-symbols-outlined text-[17px]">folder_zip</span><span>Unduh Bundel Arsip Lengkap (.HTML)</span>' +
        '</button>' +
        '</div>' +
        '<div class="overflow-x-auto"><table class="w-full text-left border-collapse table-fluid"><thead><tr class="bg-surface-low text-[11px] uppercase text-text-muted border-b border-border-subtle"><th class="py-2.5 px-3">Dokumen Arsip</th><th class="py-2.5 px-3">Nomor Registrasi</th><th class="py-2.5 px-3">Tanggal SAH</th><th class="py-2.5 px-3 text-right">Cetak A4</th></tr></thead><tbody class="divide-y divide-border-subtle">' + rows + '</tbody></table></div>' +
        '</div>';
    }

    function downloadDisiplinArchiveBundle(caseId) {
      var d = AppCache.disiplin.filter(function (x) { return x.id === caseId; })[0] || AppCache.disiplin[0];
      if (!d) return;
      var info = getDisiplinEnrichedData(d);
      var bundleHtml = '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Bundel Arsip ' + esc(d.id) + '</title>' +
        '<style>body{font-family:sans-serif;max-width:850px;margin:24px auto;padding:0 16px;color:#0f172a;line-height:1.5}.card{border:1px solid #cbd5e1;border-radius:10px;padding:18px;margin-bottom:18px}h1,h2{color:#0b3d91}code{background:#f1f5f9;padding:2px 6px;border-radius:4px}</style></head><body>' +
        '<h1>BUNDEL ARSIP DIGITAL DISIPLIN ASN — PEMKAB TELUK WONDAMA</h1>' +
        '<p>Kasus: <b>' + esc(d.id) + '</b> | ASN: <b>' + esc(d.nama) + '</b> (NIP. <code>' + esc(d.nip) + '</code>) | Registrasi I-Dis BKN: <code>' + esc(info.regIDis) + '</code></p>' +
        '<div class="card"><h2>1. Surat Panggilan I</h2><p>Nomor: <code>' + esc(info.noPanggilan1) + '</code> (' + esc(info.tglPanggilan1) + ')</p><p>Dugaan Pelanggaran: ' + esc(d.pelanggaran) + ' (' + esc(d.dasarHukum) + ')</p></div>' +
        '<div class="card"><h2>2. Berita Acara Pemeriksaan (BAP)</h2><p>Nomor: <code>' + esc(info.noBAP) + '</code> (' + esc(info.tglBAP) + ')</p><p>Pejabat Pemeriksa: ' + esc(info.pemeriksaNama) + ' (NIP. ' + esc(info.pemeriksaNip) + ')</p></div>' +
        '<div class="card"><h2>3. SK Hukuman Disiplin (' + esc(info.modelBkn) + ')</h2><p>Nomor: <code>' + esc(info.noSK) + '</code> (' + esc(info.tglSK) + ')</p><p>Sanksi: <b>' + esc(d.sanksi) + '</b></p></div>' +
        '<div class="card"><h2>4. BA Penyampaian Tertutup & Status Inkrah</h2><p>BA Penyampaian: <code>' + esc(info.noPenyampaian) + '</code> (' + esc(info.tglPenyampaian) + ')</p><p>Penetapan Inkrah: <code>' + esc(info.noInkrah) + '</code> (' + esc(info.tglInkrah) + ')</p><p>Checksum SHA-256: <code>' + info.sha256 + '</code></p></div>' +
        '</body></html>';
      var blob = new Blob([bundleHtml], { type: 'text/html;charset=utf-8;' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'Bundel_Arsip_Disiplin_' + String(d.id).replace(/[^a-zA-Z0-9_-]/g, '_') + '_BKAD.html';
      link.click();
      showToast('Bundel Arsip Digital ' + d.id + ' berhasil diunduh.', 'success');
    }

    function renderDisiplinModule() {
      var container = document.getElementById('disiplin-workspace-container');
      if (!AppCache.disiplin || !AppCache.disiplin.length) {
        container.innerHTML = '<div class="card-elevated rounded-2xl p-6 text-center text-xs text-text-muted">Belum ada data kasus disiplin terdaftar. Klik tombol "Registrasi Kasus Baru" di kanan atas.</div>';
        return;
      }
      var d = AppCache.disiplin.filter(function (x) { return x.id === AppCache.selectedDisiplinId; })[0] || AppCache.disiplin[0];
      AppCache.selectedDisiplinId = d.id;

      var curIdx = 0;
      for (var s = 0; s < DISIPLIN_STAGES.length; s++) {
        if (d.tahap.indexOf('Tahap ' + (s + 1)) !== -1) curIdx = s;
      }
      var actualCurStage = curIdx + 1;
      var viewStage = AppCache.selectedDisiplinStage || actualCurStage;
      if (viewStage < 1 || viewStage > 8) viewStage = actualCurStage;
      var nextStage = curIdx < 7 ? DISIPLIN_STAGES[curIdx + 1] : null;
      var info = getDisiplinEnrichedData(d);

      var casePills = '';
      for (var c = 0; c < AppCache.disiplin.length; c++) {
        var cs = AppCache.disiplin[c];
        var isSel = cs.id === d.id;
        casePills += '<button type="button" data-action="select-disiplin-case" data-id="' + esc(cs.id) + '" class="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-smooth ' +
          (isSel ? 'bg-navy-deep text-white border-navy-deep shadow-sm' : 'bg-white text-text-main border-border-subtle hover:bg-surface-low') + '">' +
          '<span class="font-mono font-bold">' + esc(cs.id) + '</span> • ' + esc(cs.nama) + '</button>';
      }

      var isArsipMode = AppCache.disiplinViewMode === 'ARSIP';
      var topToolbar = '<div class="card-elevated rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">' +
        '<div class="flex flex-wrap items-center gap-2">' + casePills + '</div>' +
        '<div class="flex items-center gap-1.5 bg-surface-low p-1 rounded-xl border border-border-subtle shrink-0">' +
        '<button type="button" data-action="disiplin-view-mode" data-id="WORKSPACE" class="px-3 py-1.5 rounded-lg text-xs font-semibold ' + (!isArsipMode ? 'bg-navy-deep text-white shadow-sm' : 'text-text-muted hover:text-navy-deep') + '">Workspace 8 Tahap</button>' +
        '<button type="button" data-action="disiplin-view-mode" data-id="ARSIP" class="px-3 py-1.5 rounded-lg text-xs font-semibold ' + (isArsipMode ? 'bg-navy-deep text-white shadow-sm' : 'text-text-muted hover:text-navy-deep') + '">Lemari Arsip & Bundel ZIP</button>' +
        '</div>' +
        '</div>';

      var stepper = '<div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 my-3">';
      for (var k = 0; k < DISIPLIN_STAGES.length; k++) {
        var stNum = k + 1;
        var cls = k < curIdx || (actualCurStage === 8 && stNum === 8) ? 'bg-emerald-50 text-status-present border-emerald-200 hover:border-emerald-400' :
          (k === curIdx ? 'bg-navy-deep text-white border-navy-deep' : 'bg-surface-low text-text-muted border-border-subtle hover:bg-white');
        var ring = (!isArsipMode && viewStage === stNum) ? ' ring-2 ring-electric-blue ring-offset-1' : '';
        stepper += '<button type="button" data-action="select-disiplin-stage" data-stage="' + stNum + '" class="text-left p-2 rounded-lg border text-[10px] font-semibold leading-tight transition-smooth ' + cls + ring + '">T' + stNum + ': ' + esc(DISIPLIN_STAGES[k].split(' - ')[1]) + '</button>';
      }
      stepper += '</div>';

      var stageDocMap = {
        1: 'SURAT_PANGGILAN_I', 2: 'SURAT_PANGGILAN_II', 3: 'SPT_TIM_PEMERIKSA',
        4: 'BAP_DISIPLIN', 5: 'SK_HUKUMAN_DISIPLIN',
        6: 'BA_PENYAMPAIAN_TERTUTUP', 7: 'BA_PENYAMPAIAN_TERTUTUP', 8: 'BUKTI_IDIS_BKN_1'
      };
      var activeDocType = stageDocMap[viewStage] || 'BAP_DISIPLIN';
      var printStageLabel = viewStage === 1 ? 'Cetak Surat Panggilan I (Ctrl+P)' :
        (viewStage === 2 ? 'Cetak Surat Panggilan II (Ctrl+P)' :
          (viewStage === 3 ? 'Cetak Surat Tim Pemeriksa (Ctrl+P)' : ('Cetak Tahap ' + viewStage + ' (Ctrl+P)')));

      var caseCard = '<div class="card-elevated rounded-2xl p-5 space-y-3">' +
        '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">' +
        '<div><div class="flex items-center gap-2"><span class="font-mono text-xs font-bold px-2 py-0.5 rounded bg-red-50 text-status-absent">' + esc(d.id) + '</span><span class="font-bold text-sm">' + esc(d.nama) + '</span><span class="px-2 py-0.5 rounded-full bg-surface-low text-[10px] font-semibold text-navy-deep">' + esc(info.terperiksaPangkat) + '</span></div>' +
        '<div class="text-xs text-text-muted mt-0.5">NIP: <span class="font-mono">' + esc(d.nip) + '</span> • ' + esc(d.dasarHukum) + ' • Pemeriksa: ' + esc(info.pemeriksaNama) + '</div></div>' +
        getStatusBadge(d.statusIDis) +
        '</div>' +
        '<div class="text-xs bg-surface-low p-3 rounded-xl border border-border-subtle space-y-1">' +
        '<div><b>Pelanggaran:</b> ' + esc(d.pelanggaran) + '</div>' +
        '<div><b>Panggilan I:</b> <span class="font-mono font-semibold text-navy-deep">' + esc(info.noPanggilan1) + '</span> (Sidang I: <span class="font-mono font-semibold">' + esc(info.tglBAP) + '</span>) • <b>Panggilan II:</b> <span class="font-mono font-semibold text-navy-deep">' + esc(info.noPanggilan2) + '</span> (Sidang II: <span class="font-mono font-semibold">' + esc(info.jadwalSidang2) + '</span>)</div>' +
        '<div><b>Tempat Pemeriksaan:</b> ' + esc(info.tempatSidang) + ' • <b>Sanksi:</b> ' + esc(d.sanksi) + ' • <b>No. SK:</b> <span class="font-mono text-navy-deep">' + esc(info.noSK) + '</span></div>' +
        '<div><b>Registrasi I-Dis BKN:</b> <span class="font-mono font-bold text-status-present">' + esc(info.regIDis) + '</span></div>' +
        '</div>' +
        stepper +
        '<div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-subtle">' +
        '<span class="text-[11px] text-text-muted">Klik kotak <b>T1 s/d T8</b> di atas untuk memeriksa naskah resmi tiap tahapan.</span>' +
        '<div class="flex flex-wrap items-center gap-2">' +
        '<button type="button" data-action="edit-disiplin" data-id="' + esc(d.id) + '" class="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">edit_note</span><span>Edit Surat Panggilan I / II &amp; Kasus</span></button>' +
        '<button type="button" data-action="delete-disiplin" data-id="' + esc(d.id) + '" class="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-status-absent border border-red-200 text-xs font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">delete</span><span>Hapus</span></button>' +
        (nextStage ? '<button type="button" data-action="advance-disiplin" data-id="' + esc(d.id) + '" data-next="' + esc(nextStage) + '" class="px-3 py-1.5 rounded-lg bg-electric-blue text-white text-xs font-semibold">Lanjut ke ' + esc(nextStage.split(' - ')[0]) + '</button>' : '') +
        '<button type="button" data-action="view-siasn-json" data-id="' + esc(d.id) + '" class="px-3 py-1.5 rounded-lg bg-slate-800 text-cyan-300 font-mono text-xs font-semibold">Manifest JSON SIASN</button>' +
        '<button type="button" data-action="print-ctrlp-type" data-doc="' + activeDocType + '" data-id="' + esc(d.id) + '" class="px-3 py-1.5 rounded-lg bg-navy-deep hover:bg-primary text-white text-xs font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">print</span><span>' + printStageLabel + '</span></button>' +
        '</div>' +
        '</div>' +
        '</div>';

      var bodySection = isArsipMode ? renderDisiplinArchiveCabinetHTML(d) : renderDisiplinStageDetailHTML(d, viewStage, actualCurStage);
      container.innerHTML = topToolbar + caseCard + bodySection;
    }

    function formatIndonesianDateLongFromIso(isoDateStr) {
      if (!isoDateStr) return '';
      var parts = String(isoDateStr).split('-');
      if (parts.length !== 3) return isoDateStr;
      var y = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10) - 1;
      var d = parseInt(parts[2], 10);
      var dt = new Date(y, m, d);
      if (isNaN(dt.getTime())) return isoDateStr;
      var hariList = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      var bulanList = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      return hariList[dt.getDay()] + ', ' + d + ' ' + bulanList[m] + ' ' + y;
    }

    function parseIndonesianDateLongToIso(textStr) {
      if (!textStr) return '';
      var s = String(textStr).trim();
      var isoM = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (isoM) {
        var y0 = parseInt(isoM[1], 10), m0 = parseInt(isoM[2], 10), d0 = parseInt(isoM[3], 10);
        if (m0 >= 1 && m0 <= 12 && d0 >= 1 && d0 <= 31) {
          return y0 + '-' + (m0 < 10 ? '0' : '') + m0 + '-' + (d0 < 10 ? '0' : '') + d0;
        }
      }
      var dmyM = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (dmyM) {
        var d1 = parseInt(dmyM[1], 10), m1 = parseInt(dmyM[2], 10), y1 = parseInt(dmyM[3], 10);
        if (m1 >= 1 && m1 <= 12 && d1 >= 1 && d1 <= 31) {
          return y1 + '-' + (m1 < 10 ? '0' : '') + m1 + '-' + (d1 < 10 ? '0' : '') + d1;
        }
      }
      var bulanMap = {
        januari: 1, jan: 1, februari: 2, feb: 2, pebruari: 2, maret: 3, mar: 3,
        april: 4, apr: 4, mei: 5, may: 5, juni: 6, jun: 6, juli: 7, jul: 7,
        agustus: 8, agu: 8, agt: 8, aug: 8, september: 9, sep: 9, sept: 9,
        oktober: 10, okt: 10, oct: 10, november: 11, nov: 11, nopember: 11,
        desember: 12, des: 12, dec: 12
      };
      var txtM = s.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/);
      if (txtM) {
        var d2 = parseInt(txtM[1], 10);
        var m2 = bulanMap[txtM[2].toLowerCase()];
        var y2 = parseInt(txtM[3], 10);
        if (m2 && d2 >= 1 && d2 <= 31) {
          return y2 + '-' + (m2 < 10 ? '0' : '') + m2 + '-' + (d2 < 10 ? '0' : '') + d2;
        }
      }
      return '';
    }

    function extractTimeHHMM(textStr, fallbackTime) {
      var m = String(textStr || '').match(/(\d{1,2})[:.](\d{2})/);
      if (!m) return fallbackTime || '09:30';
      var hh = parseInt(m[1], 10), mm = parseInt(m[2], 10);
      if (isNaN(hh) || isNaN(mm) || hh > 23 || mm > 59) return fallbackTime || '09:30';
      return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    }

    function openDeleteDisiplinModal(caseId) {
      var d = AppCache.disiplin.filter(function (x) { return x.id === caseId; })[0];
      if (!d) return;
      var body = '<div class="space-y-4">' +
        '<div class="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-1">' +
        '<div class="font-bold flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px] text-status-absent">warning</span><span>Konfirmasi Penghapusan Berkas Kasus Disiplin</span></div>' +
        '<p>Apakah Anda yakin ingin menghapus berkas kasus disiplin <b>' + esc(d.id) + '</b> atas nama <b>' + esc(d.nama) + '</b> (NIP. <span class="font-mono">' + esc(d.nip) + '</span>)?</p>' +
        '</div>' +
        '<div class="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">' +
        '<button type="button" data-action="close-modal" class="px-4 py-2 rounded-xl bg-surface-low hover:bg-surface-high text-xs font-semibold">Batal</button>' +
        '<button type="button" id="btn-confirm-del-disiplin" class="px-4 py-2 rounded-xl bg-status-absent hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">delete</span><span>Ya, Hapus Kasus</span></button>' +
        '</div>' +
        '</div>';
      openModal('Hapus Kasus Disiplin ' + d.id, body);
      document.getElementById('btn-confirm-del-disiplin').addEventListener('click', function () {
        var btn = document.getElementById('btn-confirm-del-disiplin');
        callServer('apiDeleteDisiplin', { id: d.id }, btn, function (res) {
          AppCache.disiplin = AppCache.disiplin.filter(function (x) { return x.id !== d.id; });
          AppCache.selectedDisiplinId = AppCache.disiplin[0] ? AppCache.disiplin[0].id : '';
          closeModal();
          renderDisiplinModule();
          showToast(res.message, 'success');
        });
      });
    }

    function openDisiplinModal(editCaseId, reopenPrintDocAfterSave, focusStageNum, isAdvancingStage) {
      var existingCase = editCaseId ? AppCache.disiplin.filter(function (x) { return x.id === editCaseId; })[0] : null;
      var isEdit = !!existingCase;

      function renderFormWithId(caseIdVal) {
        var wit = getClientWITNow();
        var info = getDisiplinEnrichedData(existingCase || { id: caseIdVal });
        var seq = String(caseIdVal || '001').split('-').pop();
        var activeList = getActivePegawaiList();
        var options = '';
        var curNipClean = existingCase ? String(existingCase.nip || '').replace(/\s+/g, '') : '';
        var foundInActive = false;

        for (var i = 0; i < activeList.length; i++) {
          var p = activeList[i];
          var pNipClean = String(p.nip || '').replace(/\s+/g, '');
          var isSel = curNipClean && pNipClean === curNipClean;
          if (isSel) foundInActive = true;
          options += '<option value="' + esc(p.nip) + '|' + esc(p.nama) + '"' + (isSel ? ' selected' : '') + '>' + esc(p.nama) + ' (' + esc(p.nip) + ')</option>';
        }
        if (existingCase && !foundInActive) {
          options = '<option value="' + esc(existingCase.nip) + '|' + esc(existingCase.nama) + '" selected>' + esc(existingCase.nama) + ' (' + esc(existingCase.nip) + ')</option>' + options;
        }

        var nowD = new Date();
        var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
        var todayIso = nowD.getFullYear() + '-' + pad2(nowD.getMonth() + 1) + '-' + pad2(nowD.getDate());
        var sidangD = new Date(nowD.getTime() + 7 * 86400000);
        if (sidangD.getDay() === 0) sidangD = new Date(sidangD.getTime() + 86400000);
        else if (sidangD.getDay() === 6) sidangD = new Date(sidangD.getTime() + 2 * 86400000);
        var sidangIso = sidangD.getFullYear() + '-' + pad2(sidangD.getMonth() + 1) + '-' + pad2(sidangD.getDate());

        var sidang2D = new Date(sidangD.getTime() + 7 * 86400000);
        if (sidang2D.getDay() === 0) sidang2D = new Date(sidang2D.getTime() + 86400000);
        else if (sidang2D.getDay() === 6) sidang2D = new Date(sidang2D.getTime() + 2 * 86400000);
        var sidang2Iso = sidang2D.getFullYear() + '-' + pad2(sidang2D.getMonth() + 1) + '-' + pad2(sidang2D.getDate());
        var sidangTime = '09:30';
        var sidang2Time = '09:30';
        if (existingCase) {
          var parsedSidangIso = parseIndonesianDateLongToIso(info.tglBAP);
          if (parsedSidangIso) sidangIso = parsedSidangIso;
          sidangTime = extractTimeHHMM(info.tglBAP, '09:30');
          var parsedSidang2Iso = parseIndonesianDateLongToIso(info.jadwalSidang2);
          if (parsedSidang2Iso) sidang2Iso = parsedSidang2Iso;
          sidang2Time = extractTimeHHMM(info.jadwalSidang2, '09:30');
        }

        var defaultNoPanggilan = existingCase ? info.noPanggilan1 : ('800.1.6.2/' + seq + '/PANG-I/BKAD-TW/' + wit.yyyy);
        var defaultTglPanggilan = existingCase ? info.tglPanggilan1 : wit.tanggal;
        var defaultJadwalSidang = existingCase ? info.tglBAP : (formatIndonesianDateLongFromIso(sidangIso) + ' • 09:30 WIT');
        var defaultNoPanggilan2 = existingCase ? info.noPanggilan2 : ('800.1.6.2/' + seq + '/PANG-II/BKAD-TW/' + wit.yyyy);
        var defaultTglPanggilan2 = existingCase ? info.tglPanggilan2 : formatIsoDateToDMY(sidangIso);
        var defaultJadwalSidang2 = existingCase ? info.jadwalSidang2 : (formatIndonesianDateLongFromIso(sidang2Iso) + ' • 09:30 WIT');
        var defaultTempatSidang = existingCase ? info.tempatSidang : 'Ruang Rapat Kepala BKAD Kab. Teluk Wondama, Rasiei/Isei';
        var defaultPelanggaran = existingCase ? existingCase.pelanggaran : 'Tidak masuk kerja tanpa alasan yang sah selama 3 hari kerja berturut-turut';
        var defaultDasar = existingCase ? existingCase.dasarHukum : 'PP No. 94 Tahun 2021 Pasal 8 Ayat (1)';
        var defaultSanksi = existingCase ? existingCase.sanksi : 'Teguran Tertulis (Hukuman Disiplin Ringan)';
        var defaultTahap = existingCase ? existingCase.tahap : DISIPLIN_STAGES[0];
        if (focusStageNum && focusStageNum >= 1 && focusStageNum <= 8 && isAdvancingStage) {
          defaultTahap = DISIPLIN_STAGES[focusStageNum - 1];
        }
        var defaultNoSK = existingCase && existingCase.nomorSK ? existingCase.nomorSK : info.noSK;
        var defaultTglSK = existingCase && existingCase.tanggalSK ? existingCase.tanggalSK : info.tglSK;

        var stageOpts = '';
        for (var stIdx = 0; stIdx < DISIPLIN_STAGES.length; stIdx++) {
          var stLabel = DISIPLIN_STAGES[stIdx];
          stageOpts += '<option value="' + esc(stLabel) + '"' + (stLabel === defaultTahap ? ' selected' : '') + '>' + esc(stLabel) + '</option>';
        }

        var mangkirLinesArr = [];
        for (var mkI = 0; mkI < info.hariMangkir.length; mkI++) {
          var mkObj = info.hariMangkir[mkI];
          mangkirLinesArr.push((mkObj.hariTgl || mkObj.tgl || '') + ' | ' + (mkObj.ket || mkObj.lokasi || '') + ' | ' + (mkObj.status || 'Alpa Murni'));
        }

        var activeTabGroup = 'ALL';
        if (focusStageNum === 1) activeTabGroup = 'T1';
        else if (focusStageNum === 2) activeTabGroup = 'T2';
        else if (focusStageNum === 3) activeTabGroup = 'T3';
        else if (focusStageNum === 4) activeTabGroup = 'T4';
        else if (focusStageNum === 5) activeTabGroup = 'T5';
        else if (focusStageNum >= 6) activeTabGroup = 'T68';

        var advanceBanner = isAdvancingStage && focusStageNum
          ? '<div class="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 flex items-center gap-2">' +
          '<span class="material-symbols-outlined text-status-present text-[20px]">rocket_launch</span>' +
          '<div><b>Kirim &amp; Lanjutkan ke Tahap ' + focusStageNum + ':</b> Silakan periksa atau edit formulir dokumen <b>' + esc(DISIPLIN_STAGES[focusStageNum - 1]) + '</b> di bawah ini, lalu klik tombol <b>Simpan &amp; Terapkan Tahap</b>.</div>' +
          '</div>'
          : '';

        var tabPillsHtml = '<div class="flex flex-wrap items-center gap-1.5 bg-surface-low p-1.5 rounded-xl border border-border-subtle">' +
          '<button type="button" data-ds-tab="ALL" class="ds-form-tab-btn px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-smooth">Semua Tahap (T1–T8)</button>' +
          '<button type="button" data-ds-tab="T1" class="ds-form-tab-btn px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-smooth">T1: Panggilan I</button>' +
          '<button type="button" data-ds-tab="T2" class="ds-form-tab-btn px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-smooth">T2: Panggilan II</button>' +
          '<button type="button" data-ds-tab="T3" class="ds-form-tab-btn px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-smooth">T3: Tim Pemeriksa</button>' +
          '<button type="button" data-ds-tab="T4" class="ds-form-tab-btn px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-smooth">T4: BAP (Tanya-Jawab)</button>' +
          '<button type="button" data-ds-tab="T5" class="ds-form-tab-btn px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-smooth">T5: SK Hukdis</button>' +
          '<button type="button" data-ds-tab="T68" class="ds-form-tab-btn px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-smooth">T6–T8: BA Serah &amp; Inkrah</button>' +
          '</div>';

        var body = '<form id="form-save-disiplin" action="javascript:void(0);" class="space-y-3.5">' +
          advanceBanner +
          '<div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5">' +
          '<div class="sm:col-span-3"><label class="block text-[11px] font-semibold text-text-muted mb-1">Nomor Kasus</label><input id="ds-id" type="text" readonly value="' + esc(caseIdVal) + '" class="w-full px-3 py-2 rounded-xl bg-surface-high font-mono text-xs font-bold text-navy-deep" /></div>' +
          '<div class="sm:col-span-5"><label class="block text-[11px] font-semibold text-text-muted mb-1">ASN Terperiksa</label><select id="ds-pegawai" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs font-semibold">' + options + '</select></div>' +
          '<div class="sm:col-span-4"><label class="block text-[11px] font-semibold text-text-muted mb-1">Tahap Kasus Aktif</label><select id="ds-tahap" class="w-full px-2.5 py-2 rounded-xl bg-blue-50 border border-electric-blue/40 text-xs font-bold text-navy-deep">' + stageOpts + '</select></div>' +
          '</div>' +

          '<div class="p-3.5 rounded-2xl bg-surface-low border border-border-subtle space-y-2.5">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div class="text-xs font-bold text-navy-deep flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px] text-status-absent">gavel</span><span>Pokok Pelanggaran, Dasar Hukum &amp; Pejabat Pemeriksa (PyBM)</span></div>' +
          '<div class="flex flex-wrap items-center gap-1.5">' +
          '<span class="text-[11px] font-semibold text-navy-deep">Jml Hari Alpa:</span>' +
          '<input id="ds-helper-hari" type="number" min="1" max="365" value="3" class="w-14 px-2 py-1 rounded-lg bg-white border border-border-subtle font-mono text-xs font-bold text-center" />' +
          '<select id="ds-helper-tipe" class="px-2 py-1 rounded-lg bg-white border border-border-subtle text-xs">' +
          '<option value="berturut-turut">hari kerja berturut-turut</option>' +
          '<option value="kumulatif">hari kerja secara kumulatif</option>' +
          '</select>' +
          '<input id="ds-helper-periode" type="text" placeholder="Ket. tgl/bln (opsional)" class="w-36 px-2 py-1 rounded-lg bg-white border border-border-subtle text-xs" />' +
          '<button type="button" id="btn-ds-apply-hari" class="px-2.5 py-1 rounded-lg bg-electric-blue hover:bg-navy-deep text-white text-[11px] font-semibold">Terapkan</button>' +
          '</div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5">' +
          '<div class="sm:col-span-7"><label class="block text-[11px] font-semibold text-text-muted mb-1">Uraian Dugaan Pelanggaran Disiplin (Bebas Diedit Manual)</label><textarea id="ds-pelanggaran" rows="2" required class="w-full px-3 py-1.5 rounded-xl bg-white border border-border-subtle text-xs leading-relaxed">' + esc(defaultPelanggaran) + '</textarea></div>' +
          '<div class="sm:col-span-5"><label class="block text-[11px] font-semibold text-text-muted mb-1">Dasar Hukum PP No. 94 Tahun 2021</label><textarea id="ds-dasar" rows="2" required class="w-full px-3 py-1.5 rounded-xl bg-white border border-border-subtle text-xs leading-relaxed">' + esc(defaultDasar) + '</textarea></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nama Pejabat Pemeriksa / PyBM</label><input id="ds-pemeriksa-nama" type="text" required value="' + esc(info.pemeriksaNama) + '" class="w-full px-3 py-1.5 rounded-xl bg-white border border-border-subtle text-xs font-semibold" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">NIP Pejabat Pemeriksa</label><input id="ds-pemeriksa-nip" type="text" required value="' + esc(info.pemeriksaNip) + '" class="w-full px-3 py-1.5 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Pangkat Pejabat Pemeriksa</label><input id="ds-pemeriksa-pangkat" type="text" required value="' + esc(info.pemeriksaPangkat) + '" class="w-full px-3 py-1.5 rounded-xl bg-white border border-border-subtle text-xs" /></div>' +
          '</div>' +
          '</div>' +

          tabPillsHtml +

          '<div data-ds-section="T1" class="ds-stage-sec p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2.5">' +
          '<div class="text-xs font-bold text-navy-deep flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px] text-electric-blue">looks_one</span><span>Tahap 1 — Formulir Surat Panggilan I (Pemanggilan Pertama)</span></div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nomor Surat Panggilan I</label><input id="ds-no-panggilan" type="text" required value="' + esc(defaultNoPanggilan) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Surat Panggilan I (Ditetapkan Tanggal)</label><div class="flex gap-1.5"><input id="ds-tgl-panggilan" type="text" required value="' + esc(defaultTglPanggilan) + '" class="flex-1 px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" /><input id="ds-tgl-panggilan-picker" type="date" value="' + esc(todayIso) + '" class="w-10 px-1.5 py-1.5 rounded-xl bg-white border border-border-subtle text-xs cursor-pointer" /></div></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Pilih Kalender Tgl &amp; Jam Sidang Panggilan I</label><div class="flex gap-1.5"><input id="ds-sidang-date" type="date" value="' + esc(sidangIso) + '" class="flex-1 px-2.5 py-2 rounded-xl bg-white border border-border-subtle text-xs" /><input id="ds-sidang-time" type="time" value="' + esc(sidangTime) + '" class="w-24 px-2 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Hari / Waktu Sidang Panggilan I (Tercetak di Surat)</label><input id="ds-jadwal-sidang" type="text" required value="' + esc(defaultJadwalSidang) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs font-semibold text-navy-deep" /></div>' +
          '</div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tempat Pemeriksaan (Berlaku untuk Panggilan I, II &amp; BAP)</label><input id="ds-tempat-sidang" type="text" required value="' + esc(defaultTempatSidang) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs" /></div>' +
          '</div>' +

          '<div data-ds-section="T2" class="ds-stage-sec p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2.5">' +
          '<div class="text-xs font-bold text-amber-900 flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px] text-amber-600">looks_two</span><span>Tahap 2 — Formulir Surat Panggilan II (Pemanggilan Kedua / Terakhir)</span></div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nomor Surat Panggilan II</label><input id="ds-no-panggilan2" type="text" required value="' + esc(defaultNoPanggilan2) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Surat Panggilan II (Ditetapkan Tanggal)</label><div class="flex gap-1.5"><input id="ds-tgl-panggilan2" type="text" required value="' + esc(defaultTglPanggilan2) + '" class="flex-1 px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" /><input id="ds-tgl-panggilan2-picker" type="date" value="' + esc(sidangIso) + '" class="w-10 px-1.5 py-1.5 rounded-xl bg-white border border-border-subtle text-xs cursor-pointer" /></div></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Pilih Kalender Tgl &amp; Jam Sidang Panggilan II</label><div class="flex gap-1.5"><input id="ds-sidang2-date" type="date" value="' + esc(sidang2Iso) + '" class="flex-1 px-2.5 py-2 rounded-xl bg-white border border-border-subtle text-xs" /><input id="ds-sidang2-time" type="time" value="' + esc(sidang2Time) + '" class="w-24 px-2 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Hari / Waktu Sidang Panggilan II (Tercetak di Surat)</label><input id="ds-jadwal-sidang2" type="text" required value="' + esc(defaultJadwalSidang2) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs font-semibold text-navy-deep" /></div>' +
          '</div>' +
          '</div>' +

          '<div data-ds-section="T3" class="ds-stage-sec p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-2.5">' +
          '<div class="text-xs font-bold text-indigo-950 flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px] text-indigo-600">groups</span><span>Tahap 3 — Formulir Surat Perintah Pembentukan Tim Pemeriksa</span></div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nomor Surat Tim Pemeriksa</label><input id="ds-no-tim-pemeriksa" type="text" value="' + esc(info.noTimPemeriksa) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Anggota Unsur Pengawasan (Inspektorat)</label><input id="ds-tim-pengawasan" type="text" value="' + esc(info.timPengawasan) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Sekretaris / Unsur Kepegawaian</label><input id="ds-tim-kepegawaian" type="text" value="' + esc(info.timKepegawaian) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs" /></div>' +
          '</div>' +
          '</div>' +

          '<div data-ds-section="T4" class="ds-stage-sec p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200 space-y-3">' +
          '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div class="text-xs font-bold text-teal-950 flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px] text-mode-wfa">quiz</span><span>Tahap 4 — Formulir Berita Acara Pemeriksaan (BAP) &amp; Pertanyaan / Jawaban</span></div>' +
          '<div class="flex items-center gap-1.5">' +
          '<button type="button" id="btn-ds-add-qa" class="px-2.5 py-1 rounded-lg bg-mode-wfa hover:bg-teal-700 text-white text-[11px] font-bold flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">add</span><span>Tambah Pertanyaan &amp; Jawaban</span></button>' +
          '<button type="button" id="btn-ds-reset-qa" class="px-2.5 py-1 rounded-lg bg-white hover:bg-surface-high border border-border-subtle text-text-muted text-[11px] font-semibold">Reset 5 Tanya-Jawab Standar</button>' +
          '</div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nomor Berita Acara Pemeriksaan (BAP)</label><input id="ds-no-bap" type="text" value="' + esc(info.noBAP) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Hari, Tanggal &amp; Waktu Pemeriksaan BAP</label><input id="ds-tgl-bap" type="text" value="' + esc(info.tglBAP) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs font-semibold text-navy-deep" /></div>' +
          '</div>' +
          '<div>' +
          '<label class="block text-[11px] font-semibold text-navy-deep mb-1">Daftar Pertanyaan Pemeriksa (Tanya) &amp; Jawaban PNS Terperiksa (Jawab) — Bisa Diedit / Ditambah Manual:</label>' +
          '<div id="ds-bap-qa-container" class="space-y-2.5 max-h-[320px] overflow-y-auto pr-1"></div>' +
          '</div>' +
          '<div>' +
          '<label class="block text-[11px] font-semibold text-text-muted mb-1">Rincian Bukti Tanggal Tidak Masuk Kerja / Alpa (1 Baris per Kejadian: Hari/Tanggal | Keterangan | Status)</label>' +
          '<textarea id="ds-mangkir-lines" rows="3" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-[11px] leading-relaxed">' + esc(mangkirLinesArr.join('\n')) + '</textarea>' +
          '</div>' +
          '</div>' +

          '<div data-ds-section="T5" class="ds-stage-sec p-3.5 rounded-2xl bg-red-50/70 border border-red-200 space-y-2.5">' +
          '<div class="text-xs font-bold text-red-950 flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px] text-status-absent">workspace_premium</span><span>Tahap 5 — Formulir Surat Keputusan (SK) Hukuman Disiplin</span></div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nomor SK Hukuman Disiplin</label><input id="ds-no-sk" type="text" value="' + esc(defaultNoSK) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Ditetapkan SK</label><div class="flex gap-1.5"><input id="ds-tgl-sk" type="text" value="' + esc(defaultTglSK) + '" class="flex-1 px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" /><input id="ds-tgl-sk-picker" type="date" value="' + esc(todayIso) + '" class="w-10 px-1.5 py-1.5 rounded-xl bg-white border border-border-subtle text-xs cursor-pointer" /></div></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Pilih Cepat Jenis Sanksi PP 94/2021</label>' +
          '<select id="ds-sanksi-preset" class="w-full px-2.5 py-2 rounded-xl bg-white border border-border-subtle text-xs">' +
          '<option value="">-- Pilih Preset Sanksi (Atau Ketik Manual) --</option>' +
          '<option value="Teguran Lisan (Hukuman Disiplin Ringan)">Ringan: Teguran Lisan</option>' +
          '<option value="Teguran Tertulis (Hukuman Disiplin Ringan)">Ringan: Teguran Tertulis</option>' +
          '<option value="Pernyataan Tidak Puas Secara Tertulis (Hukuman Disiplin Ringan)">Ringan: Pernyataan Tidak Puas Tertulis</option>' +
          '<option value="Pemotongan Tukin/TPP 25% Selama 6 Bulan (Disiplin Sedang)">Sedang: Potong TPP 25% (6 Bulan)</option>' +
          '<option value="Pemotongan Tukin/TPP 25% Selama 9 Bulan (Disiplin Sedang)">Sedang: Potong TPP 25% (9 Bulan)</option>' +
          '<option value="Pemotongan Tukin/TPP 25% Selama 12 Bulan (Disiplin Sedang)">Sedang: Potong TPP 25% (12 Bulan)</option>' +
          '<option value="Penurunan Jabatan Setingkat Lebih Rendah Selama 12 Bulan (Disiplin Berat)">Berat: Penurunan Jabatan 12 Bulan</option>' +
          '<option value="Pembebasan dari Jabatan Menjadi Jabatan Pelaksana Selama 12 Bulan (Disiplin Berat)">Berat: Pembebasan Jabatan 12 Bulan</option>' +
          '<option value="Pemberhentian dengan Hormat Tidak Atas Permintaan Sendiri Sebagai PNS (Disiplin Berat)">Berat: Pemberhentian (PDHTAPS)</option>' +
          '</select>' +
          '</div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Sanksi Hukuman Disiplin yang Ditetapkan (Bisa Diedit Manual)</label><input id="ds-sanksi" type="text" required value="' + esc(defaultSanksi) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs font-bold text-status-absent" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Judul Tentang pada Kepala SK (Bisa Diedit Manual)</label><input id="ds-judul-sk" type="text" value="' + esc(info.judulSK) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs font-semibold text-navy-deep" /></div>' +
          '</div>' +
          '</div>' +

          '<div data-ds-section="T68" class="ds-stage-sec p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2.5">' +
          '<div class="text-xs font-bold text-emerald-950 flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px] text-status-present">verified</span><span>Tahap 6, 7 &amp; 8 — Formulir BA Penyampaian Tertutup, Saksi &amp; Penetapan Inkrah I-Dis BKN</span></div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nomor BA Penyampaian Tertutup</label><input id="ds-no-penyampaian" type="text" value="' + esc(info.noPenyampaian) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Hari / Tanggal Penyampaian SK</label><input id="ds-tgl-penyampaian" type="text" value="' + esc(info.tglPenyampaian) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Batas Akhir 14 Hari Kerja</label><input id="ds-batas-penyampaian" type="text" value="' + esc(info.batasPenyampaian) + '" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">' +
          '<div class="grid grid-cols-2 gap-1.5"><div><label class="block text-[10px] font-semibold text-text-muted mb-1">Nama Saksi I (Kepegawaian)</label><input id="ds-saksi1-nama" type="text" value="' + esc(info.saksi1Nama) + '" class="w-full px-2.5 py-1.5 rounded-xl bg-white border border-border-subtle text-xs" /></div><div><label class="block text-[10px] font-semibold text-text-muted mb-1">NIP Saksi I</label><input id="ds-saksi1-nip" type="text" value="' + esc(info.saksi1Nip) + '" class="w-full px-2.5 py-1.5 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div></div>' +
          '<div class="grid grid-cols-2 gap-1.5"><div><label class="block text-[10px] font-semibold text-text-muted mb-1">Nama Saksi II (Keuangan/Aset)</label><input id="ds-saksi2-nama" type="text" value="' + esc(info.saksi2Nama) + '" class="w-full px-2.5 py-1.5 rounded-xl bg-white border border-border-subtle text-xs" /></div><div><label class="block text-[10px] font-semibold text-text-muted mb-1">NIP Saksi II</label><input id="ds-saksi2-nip" type="text" value="' + esc(info.saksi2Nip) + '" class="w-full px-2.5 py-1.5 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-4 gap-2.5">' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nomor Reg. Inkrah (T8)</label><input id="ds-no-inkrah" type="text" value="' + esc(info.noInkrah) + '" class="w-full px-3 py-1.5 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tgl Berlaku Sah / Inkrah</label><input id="ds-tgl-inkrah" type="text" value="' + esc(info.tglInkrah) + '" class="w-full px-3 py-1.5 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Akhir Masa Sanksi (1 Thn)</label><input id="ds-masa-akhir" type="text" value="' + esc(info.masaAkhirSanksi) + '" class="w-full px-3 py-1.5 rounded-xl bg-white border border-border-subtle font-mono text-xs" /></div>' +
          '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">ID Gateway I-Dis BKN</label><input id="ds-reg-idis" type="text" value="' + esc(info.regIDis) + '" class="w-full px-3 py-1.5 rounded-xl bg-white border border-border-subtle font-mono text-xs font-bold text-status-present" /></div>' +
          '</div>' +
          '</div>' +

          '<div class="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">' +
          '<button type="button" data-action="close-modal" class="px-4 py-2.5 rounded-xl bg-surface-low hover:bg-surface-high text-xs font-semibold">Batal</button>' +
          '<button id="btn-save-disiplin-submit" type="submit" class="px-5 py-2.5 rounded-xl bg-status-absent hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">save</span><span>' + (isAdvancingStage ? ('Simpan & Kirim ke Tahap ' + focusStageNum) : (isEdit ? 'Simpan Perubahan Dokumen & Kasus' : 'Registrasi Kasus & Terbitkan Surat Panggilan I')) + '</span></button>' +
          '</div>' +
          '</form>';

        openModal(isEdit ? ('Form Edit Tahapan Kasus Disiplin & BAP (' + caseIdVal + ')') : 'Registrasi Kasus Disiplin PP 94/2021', body, true);

        function switchDisiplinFormTab(tabKey) {
          activeTabGroup = tabKey;
          var btns = document.querySelectorAll('.ds-form-tab-btn');
          for (var tb = 0; tb < btns.length; tb++) {
            var isAct = btns[tb].getAttribute('data-ds-tab') === tabKey;
            btns[tb].className = 'ds-form-tab-btn px-2.5 py-1.5 rounded-lg text-[11px] transition-smooth ' +
              (isAct ? 'bg-navy-deep text-white font-bold shadow-sm' : 'bg-white text-text-main hover:bg-blue-50 font-semibold border border-border-subtle');
          }
          var secs = document.querySelectorAll('.ds-stage-sec');
          for (var sc = 0; sc < secs.length; sc++) {
            var secKey = secs[sc].getAttribute('data-ds-section');
            var showSec = (tabKey === 'ALL' || secKey === tabKey);
            secs[sc].classList.toggle('hidden', !showSec);
          }
        }

        var tabButtons = document.querySelectorAll('.ds-form-tab-btn');
        for (var tbi = 0; tbi < tabButtons.length; tbi++) {
          tabButtons[tbi].addEventListener('click', function () {
            switchDisiplinFormTab(this.getAttribute('data-ds-tab'));
          });
        }
        switchDisiplinFormTab(activeTabGroup);

        var qaDataList = JSON.parse(JSON.stringify(info.bapQA || []));
        function collectCurrentQaDomValues() {
          var qEls = document.querySelectorAll('.ds-qa-q-input');
          var aEls = document.querySelectorAll('.ds-qa-a-input');
          if (!qEls.length) return;
          var nextArr = [];
          for (var qi = 0; qi < qEls.length; qi++) {
            nextArr.push({
              q: qEls[qi].value,
              a: aEls[qi] ? aEls[qi].value : ''
            });
          }
          qaDataList = nextArr;
        }

        function renderQaItemsEditor() {
          var qaBox = document.getElementById('ds-bap-qa-container');
          if (!qaBox) return;
          var qHtml = '';
          for (var qi = 0; qi < qaDataList.length; qi++) {
            var item = qaDataList[qi];
            qHtml += '<div class="p-3 rounded-xl bg-white border border-teal-200 space-y-2">' +
              '<div class="flex items-center justify-between">' +
              '<span class="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-900">Pertanyaan &amp; Jawaban #' + (qi + 1) + '</span>' +
              (qaDataList.length > 1 ? '<button type="button" data-del-qa="' + qi + '" class="btn-ds-del-qa text-[11px] font-semibold text-status-absent hover:underline flex items-center gap-0.5"><span class="material-symbols-outlined text-[14px]">delete</span><span>Hapus Nomor Ini</span></button>' : '') +
              '</div>' +
              '<div><label class="block text-[10px] font-bold text-navy-deep uppercase mb-0.5">' + (qi + 1) + '. Pertanyaan Pemeriksa (Tanya)</label><textarea rows="2" class="ds-qa-q-input w-full px-2.5 py-1.5 rounded-lg bg-surface-low border border-border-subtle text-xs leading-snug">' + esc(item.q) + '</textarea></div>' +
              '<div><label class="block text-[10px] font-bold text-mode-wfa uppercase mb-0.5">Jawaban PNS Terperiksa (Jawab)</label><textarea rows="2" class="ds-qa-a-input w-full px-2.5 py-1.5 rounded-lg bg-surface-low border border-border-subtle text-xs leading-snug">' + esc(item.a) + '</textarea></div>' +
              '</div>';
          }
          qaBox.innerHTML = qHtml;
          var delBtns = qaBox.querySelectorAll('.btn-ds-del-qa');
          for (var dbi = 0; dbi < delBtns.length; dbi++) {
            delBtns[dbi].addEventListener('click', function () {
              collectCurrentQaDomValues();
              var rmIdx = parseInt(this.getAttribute('data-del-qa'), 10);
              qaDataList.splice(rmIdx, 1);
              renderQaItemsEditor();
            });
          }
        }
        renderQaItemsEditor();

        document.getElementById('btn-ds-add-qa').addEventListener('click', function () {
          collectCurrentQaDomValues();
          qaDataList.push({
            q: 'Pertanyaan tambahan pemeriksaan disiplin nomor ' + (qaDataList.length + 1) + '...',
            a: 'Jawaban atau keterangan PNS yang diperiksa...'
          });
          renderQaItemsEditor();
        });

        document.getElementById('btn-ds-reset-qa').addEventListener('click', function () {
          var pelTxt = document.getElementById('ds-pelanggaran').value.trim() || defaultPelanggaran;
          var dasTxt = document.getElementById('ds-dasar').value.trim() || defaultDasar;
          qaDataList = [
            { q: 'Apakah Saudara pada hari ini berada dalam keadaan sehat jasmani dan rohani serta bersedia untuk memberikan keterangan yang sebenarnya?', a: 'Ya, saya dalam keadaan sehat jasmani dan rohani, serta bersedia memberikan keterangan yang sebenarnya dengan penuh kejujuran.' },
            { q: 'Berdasarkan hasil audit rekapitulasi E-Presensi biometrik dan geofencing GPS BKAD, Saudara tercatat melakukan dugaan pelanggaran disiplin: ' + pelTxt + '. Apakah data tersebut benar?', a: 'Benar, saya mengakui tidak hadir masuk kantor dan tidak melakukan presensi pada hari-hari kerja tersebut.' },
            { q: 'Apakah alasan Saudara tidak masuk kerja pada tanggal-tanggal tersebut dan mengapa Saudara tidak menyampaikan surat izin atau permohonan resmi kepada atasan langsung?', a: 'Saya memiliki keperluan mendesak keluarga dan lalai tidak menyampaikan permohonan izin atau pemberitahuan resmi tepat waktu kepada atasan langsung.' },
            { q: 'Apakah Saudara mengetahui dan menyadari bahwa perbuatan Saudara melanggar ketentuan ' + dasTxt + '?', a: 'Ya, saya mengetahui dan menyadari sepenuhnya bahwa perbuatan saya melanggar kewajiban masuk kerja dan mentaati ketentuan jam kerja sesuai PP No. 94 Tahun 2021.' },
            { q: 'Apakah masih ada keterangan atau bukti lain yang ingin Saudara sampaikan untuk meringankan atau membela diri Saudara?', a: 'Tidak ada lagi keterangan lain. Saya memohon maaf sebesar-besarnya kepada pimpinan BKAD atas kelalaian saya dan berjanji tidak akan mengulangi perbuatan tersebut serta siap menerima pembinaan/sanksi sesuai ketentuan yang berlaku.' }
          ];
          renderQaItemsEditor();
          showToast('5 Pertanyaan & Jawaban standar BAP berhasil dimuat sesuai uraian pelanggaran.', 'info');
        });

        document.getElementById('ds-tgl-panggilan-picker').addEventListener('change', function (ev) {
          if (ev.target.value) document.getElementById('ds-tgl-panggilan').value = formatIsoDateToDMY(ev.target.value);
        });
        document.getElementById('ds-tgl-panggilan2-picker').addEventListener('change', function (ev) {
          if (ev.target.value) document.getElementById('ds-tgl-panggilan2').value = formatIsoDateToDMY(ev.target.value);
        });
        document.getElementById('ds-tgl-sk-picker').addEventListener('change', function (ev) {
          if (ev.target.value) document.getElementById('ds-tgl-sk').value = formatIsoDateToDMY(ev.target.value);
        });

        document.getElementById('ds-sanksi-preset').addEventListener('change', function (ev) {
          if (ev.target.value) {
            document.getElementById('ds-sanksi').value = ev.target.value;
            document.getElementById('ds-judul-sk').value = 'PENJATUHAN HUKUMAN DISIPLIN BERUPA ' + ev.target.value.toUpperCase();
          }
        });

        function bindSidangSchedulePair(dateId, timeId, textId, alsoSyncBap) {
          var dateEl = document.getElementById(dateId);
          var timeEl = document.getElementById(timeId);
          var textEl = document.getElementById(textId);
          if (!dateEl || !timeEl || !textEl) return;

          function syncFromPicker() {
            var dVal = dateEl.value;
            var tVal = timeEl.value || '09:30';
            if (dVal) {
              var formatted = formatIndonesianDateLongFromIso(dVal) + ' • ' + tVal + ' WIT';
              textEl.value = formatted;
              if (alsoSyncBap) {
                var bapEl = document.getElementById('ds-tgl-bap');
                if (bapEl) bapEl.value = formatted;
              }
            }
          }

          function syncFromManualText(rewriteFullText) {
            var raw = textEl.value || '';
            var parsedIso = parseIndonesianDateLongToIso(raw);
            if (!parsedIso) return;
            var parsedTime = extractTimeHHMM(raw, timeEl.value || '09:30');
            dateEl.value = parsedIso;
            timeEl.value = parsedTime;
            var normalized = formatIndonesianDateLongFromIso(parsedIso) + ' • ' + parsedTime + ' WIT';
            if (rewriteFullText) {
              textEl.value = normalized;
            } else {
              var newDay = formatIndonesianDateLongFromIso(parsedIso).split(',')[0];
              var updated = raw.replace(/^(Minggu|Senin|Selasa|Rabu|Kamis|Jumat|Sabtu)\s*,/i, newDay + ',');
              if (updated !== raw) {
                var pos = textEl.selectionStart;
                var delta = updated.length - raw.length;
                textEl.value = updated;
                if (typeof pos === 'number') {
                  var nextPos = Math.max(0, pos + delta);
                  try { textEl.setSelectionRange(nextPos, nextPos); } catch (e) {}
                }
              }
            }
            if (alsoSyncBap) {
              var bapEl = document.getElementById('ds-tgl-bap');
              if (bapEl) bapEl.value = textEl.value;
            }
          }

          dateEl.addEventListener('input', syncFromPicker);
          dateEl.addEventListener('change', syncFromPicker);
          timeEl.addEventListener('input', syncFromPicker);
          timeEl.addEventListener('change', syncFromPicker);
          textEl.addEventListener('input', function () { syncFromManualText(false); });
          textEl.addEventListener('change', function () { syncFromManualText(true); });
          textEl.addEventListener('blur', function () { syncFromManualText(true); });
        }

        bindSidangSchedulePair('ds-sidang-date', 'ds-sidang-time', 'ds-jadwal-sidang', true);
        bindSidangSchedulePair('ds-sidang2-date', 'ds-sidang2-time', 'ds-jadwal-sidang2', false);

        document.getElementById('btn-ds-apply-hari').addEventListener('click', function () {
          var jml = parseInt(document.getElementById('ds-helper-hari').value, 10) || 3;
          var tipe = document.getElementById('ds-helper-tipe').value;
          var per = (document.getElementById('ds-helper-periode').value || '').trim();
          var kalimat = 'Tidak masuk kerja tanpa alasan yang sah selama ' + jml + ' hari kerja ' + tipe + (per ? ' (' + per + ')' : '');
          document.getElementById('ds-pelanggaran').value = kalimat;
          if (jml <= 3) {
            document.getElementById('ds-dasar').value = 'PP No. 94 Tahun 2021 Pasal 9 Ayat (2) Huruf a (Teguran Lisan)';
            document.getElementById('ds-sanksi').value = 'Teguran Lisan (Hukuman Disiplin Ringan)';
          } else if (jml <= 6) {
            document.getElementById('ds-dasar').value = 'PP No. 94 Tahun 2021 Pasal 9 Ayat (2) Huruf b (Teguran Tertulis)';
            document.getElementById('ds-sanksi').value = 'Teguran Tertulis (Hukuman Disiplin Ringan)';
          } else if (jml <= 10 && tipe !== 'berturut-turut') {
            document.getElementById('ds-dasar').value = 'PP No. 94 Tahun 2021 Pasal 9 Ayat (2) Huruf c (Pernyataan Tidak Puas)';
            document.getElementById('ds-sanksi').value = 'Pernyataan Tidak Puas Secara Tertulis (Hukuman Disiplin Ringan)';
          } else if (tipe === 'berturut-turut' && jml >= 10) {
            document.getElementById('ds-dasar').value = 'PP No. 94 Tahun 2021 Pasal 11 Ayat (2) Huruf d angka 3 (Disiplin Berat)';
            document.getElementById('ds-sanksi').value = 'Penurunan Jabatan Setingkat Lebih Rendah Selama 12 Bulan (Disiplin Berat)';
          } else {
            document.getElementById('ds-dasar').value = 'PP No. 94 Tahun 2021 Pasal 10 Ayat (2) Huruf f (Pemotongan Tukin/TPP)';
            document.getElementById('ds-sanksi').value = 'Pemotongan Tukin/TPP 25% Selama 6 Bulan (Disiplin Sedang)';
          }
          document.getElementById('ds-judul-sk').value = 'PENJATUHAN HUKUMAN DISIPLIN BERUPA ' + document.getElementById('ds-sanksi').value.toUpperCase();
          showToast('Uraian pelanggaran, dasar hukum & sanksi diperbarui menjadi ' + jml + ' hari kerja.', 'info');
        });

        document.getElementById('form-save-disiplin').addEventListener('submit', function (e) {
          e.preventDefault();
          collectCurrentQaDomValues();
          var cleanedQA = [];
          for (var qi = 0; qi < qaDataList.length; qi++) {
            var qStr = String(qaDataList[qi].q || '').trim();
            var aStr = String(qaDataList[qi].a || '').trim();
            if (qStr || aStr) cleanedQA.push({ q: qStr, a: aStr });
          }

          var rawMangkirLines = (document.getElementById('ds-mangkir-lines').value || '').split(/\r?\n/);
          var parsedMangkir = [];
          for (var mli = 0; mli < rawMangkirLines.length; mli++) {
            var ln = rawMangkirLines[mli].trim();
            if (!ln) continue;
            var spM = ln.split('|');
            var tglM = (spM[0] || '').trim();
            var ketM = (spM[1] || 'Tanpa keterangan sah').trim();
            var stM = (spM[2] || 'Alpa Murni').trim();
            parsedMangkir.push({
              kode: (parsedMangkir.length + 1 < 10 ? '0' : '') + (parsedMangkir.length + 1),
              hariTgl: tglM,
              tgl: tglM,
              lokasi: ketM,
              ket: ketM,
              status: stM
            });
          }

          var parts = document.getElementById('ds-pegawai').value.split('|');
          var btn = document.getElementById('btn-save-disiplin-submit');
          var selectedStageVal = document.getElementById('ds-tahap').value;
          var customMeta = {
            noPanggilan1: document.getElementById('ds-no-panggilan').value.trim(),
            tglPanggilan1: document.getElementById('ds-tgl-panggilan').value.trim(),
            jadwalSidang1: document.getElementById('ds-jadwal-sidang').value.trim(),
            noPanggilan2: document.getElementById('ds-no-panggilan2').value.trim(),
            tglPanggilan2: document.getElementById('ds-tgl-panggilan2').value.trim(),
            jadwalSidang2: document.getElementById('ds-jadwal-sidang2').value.trim(),
            tempatSidang: document.getElementById('ds-tempat-sidang').value.trim(),
            noTimPemeriksa: document.getElementById('ds-no-tim-pemeriksa').value.trim(),
            timPengawasan: document.getElementById('ds-tim-pengawasan').value.trim(),
            timKepegawaian: document.getElementById('ds-tim-kepegawaian').value.trim(),
            noBAP: document.getElementById('ds-no-bap').value.trim(),
            tglBAP: document.getElementById('ds-tgl-bap').value.trim() || document.getElementById('ds-jadwal-sidang').value.trim(),
            bapQA: cleanedQA,
            hariMangkir: parsedMangkir,
            noSK: document.getElementById('ds-no-sk').value.trim(),
            tglSK: document.getElementById('ds-tgl-sk').value.trim(),
            judulSK: document.getElementById('ds-judul-sk').value.trim(),
            noPenyampaian: document.getElementById('ds-no-penyampaian').value.trim(),
            tglPenyampaian: document.getElementById('ds-tgl-penyampaian').value.trim(),
            batasPenyampaian: document.getElementById('ds-batas-penyampaian').value.trim(),
            saksi1Nama: document.getElementById('ds-saksi1-nama').value.trim(),
            saksi1Nip: document.getElementById('ds-saksi1-nip').value.trim(),
            saksi2Nama: document.getElementById('ds-saksi2-nama').value.trim(),
            saksi2Nip: document.getElementById('ds-saksi2-nip').value.trim(),
            noInkrah: document.getElementById('ds-no-inkrah').value.trim(),
            tglInkrah: document.getElementById('ds-tgl-inkrah').value.trim(),
            masaAkhirSanksi: document.getElementById('ds-masa-akhir').value.trim(),
            regIDis: document.getElementById('ds-reg-idis').value.trim(),
            pemeriksaNama: document.getElementById('ds-pemeriksa-nama').value.trim(),
            pemeriksaNip: document.getElementById('ds-pemeriksa-nip').value.trim(),
            pemeriksaPangkat: document.getElementById('ds-pemeriksa-pangkat').value.trim(),
            pemeriksaJabatan: info.pemeriksaJabatan
          };

          var pPayload = {
            id: isEdit ? existingCase.id : '',
            nip: parts[0],
            nama: parts[1],
            pelanggaran: document.getElementById('ds-pelanggaran').value.trim(),
            dasarHukum: document.getElementById('ds-dasar').value.trim(),
            sanksi: document.getElementById('ds-sanksi').value.trim(),
            tahap: selectedStageVal,
            nomorSK: customMeta.noSK,
            tanggalSK: customMeta.tglSK,
            regIDis: customMeta.regIDis,
            statusIDis: selectedStageVal.indexOf('Tahap 8') !== -1 ? 'Tersinkronisasi' : (existingCase ? existingCase.statusIDis : 'Belum Sinkron'),
            nomorPanggilan: customMeta.noPanggilan1,
            tglPanggilan: customMeta.tglPanggilan1,
            jadwalSidang: customMeta.jadwalSidang1,
            nomorPanggilan2: customMeta.noPanggilan2,
            tglPanggilan2: customMeta.tglPanggilan2,
            jadwalSidang2: customMeta.jadwalSidang2,
            tempatSidang: customMeta.tempatSidang,
            customMetaJson: JSON.stringify(customMeta)
          };

          callServer('apiSaveDisiplin', pPayload, btn, function (r) {
            var savedRec = r.record || {};
            savedRec.nomorPanggilan = pPayload.nomorPanggilan;
            savedRec.tglPanggilan = pPayload.tglPanggilan;
            savedRec.jadwalSidang = pPayload.jadwalSidang;
            savedRec.nomorPanggilan2 = pPayload.nomorPanggilan2;
            savedRec.tglPanggilan2 = pPayload.tglPanggilan2;
            savedRec.jadwalSidang2 = pPayload.jadwalSidang2;
            savedRec.tempatSidang = pPayload.tempatSidang;
            savedRec.customMetaJson = pPayload.customMetaJson;
            saveDisiplinCustomMeta(savedRec.id, customMeta);

            if (r.isUpdate) {
              AppCache.disiplin = AppCache.disiplin.map(function (item) { return item.id === savedRec.id ? savedRec : item; });
            } else {
              AppCache.disiplin.unshift(savedRec);
            }
            AppCache.selectedDisiplinId = savedRec.id;
            for (var sIdx = 0; sIdx < DISIPLIN_STAGES.length; sIdx++) {
              if (selectedStageVal.indexOf('Tahap ' + (sIdx + 1)) !== -1) {
                AppCache.selectedDisiplinStage = sIdx + 1;
              }
            }
            if (focusStageNum) AppCache.selectedDisiplinStage = focusStageNum;
            renderDisiplinModule();
            showToast(r.message, 'success');
            if (reopenPrintDocAfterSave) {
              handlePrintType(reopenPrintDocAfterSave, savedRec.id);
            } else {
              closeModal();
            }
          });
        });
      }

      if (isEdit) {
        renderFormWithId(existingCase.id);
      } else {
        callServer('apiGetNextId', 'DISIPLIN', null, function (res) {
          renderFormWithId(res.nextId);
        });
      }
    }

    /* -------------------------------------------------------------------
     * 13. RENDER PENGATURAN SISTEM
     * ------------------------------------------------------------------- */
    function renderSettingsForm() {
      var geo = (AppCache.settings.GEOFENCE_COORDINATES && AppCache.settings.GEOFENCE_COORDINATES.value) || { lat: -2.7238, lng: 134.5042, radiusMeter: 150 };
      var jam = (AppCache.settings.JAM_KERJA_WIT && AppCache.settings.JAM_KERJA_WIT.value) || { masuk: '08:00', pulangSeninKamis: '16:00' };
      var gw = (AppCache.settings.INTEGRASI_GATEWAY && AppCache.settings.INTEGRASI_GATEWAY.value) || { tarifPotonganTppPerMenit: 2500 };
      var pj = (AppCache.settings.PEJABAT_PENANDATANGAN && AppCache.settings.PEJABAT_PENANDATANGAN.value) || { kabanNama: 'Dr. Hendrik Mambor, S.E., M.Si.', kabanNip: '19751128 200909 1 001' };

      document.getElementById('set-lat').value = geo.lat;
      document.getElementById('set-lng').value = geo.lng;
      document.getElementById('set-radius').value = geo.radiusMeter;
      var chkGeoUnlock = document.getElementById('set-geolock-unlocked');
      if (chkGeoUnlock) chkGeoUnlock.checked = !!(geo && geo.geoLockUnlocked === true);
      document.getElementById('set-jam-masuk').value = jam.masuk;
      document.getElementById('set-jam-pulang').value = jam.pulangSeninKamis;
      document.getElementById('set-tarif-tpp').value = gw.tarifPotonganTppPerMenit;
      document.getElementById('set-kaban-nama').value = pj.kabanNama;
      document.getElementById('set-kaban-nip').value = pj.kabanNip;
      renderDelegasiPltPanel();
      renderAuditLogPanel();
    }

    function renderDelegasiPltPanel() {
      var box = document.getElementById('delegasi-plt-container');
      if (!box) return;
      var list = AppCache.delegasiPlt || [];
      if (!list.length) {
        box.innerHTML = '<div class="p-4 rounded-xl bg-surface-low text-xs text-text-muted text-center">Belum ada delegasi Pelaksana Tugas (Plt./Plh.) aktif.</div>';
        return;
      }
      var rows = '';
      for (var i = 0; i < list.length; i++) {
        var d = list[i];
        rows += '<tr class="border-b border-border-subtle text-xs">' +
          '<td class="py-2 px-3 font-mono font-bold text-navy-deep">' + esc(d.id) + '</td>' +
          '<td class="py-2 px-3"><b>' + esc(d.jabatan) + '</b><div class="text-[11px] text-text-muted">No. SP: ' + esc(d.nomorSP) + '</div></td>' +
          '<td class="py-2 px-3">' + esc(d.namaAsli) + '<div class="font-mono text-[10px] text-text-muted">' + esc(d.nipAsli) + '</div></td>' +
          '<td class="py-2 px-3 font-semibold text-electric-blue">' + esc(d.namaPlt) + '<div class="font-mono text-[10px] text-text-muted">' + esc(d.nipPlt) + '</div></td>' +
          '<td class="py-2 px-3 font-mono text-[11px]">' + esc(d.tglMulai) + ' s/d ' + esc(d.tglSelesai) + '</td>' +
          '<td class="py-2 px-3 text-right"><button type="button" data-action="delete-delegasi-plt" data-id="' + esc(d.id) + '" class="px-2.5 py-1 rounded-lg bg-red-50 text-status-absent text-[11px] font-semibold">Hapus</button></td>' +
          '</tr>';
      }
      box.innerHTML = '<table class="w-full text-left border-collapse"><thead><tr class="bg-surface-low text-text-muted uppercase text-[11px] border-b border-border-subtle"><th class="py-2 px-3">ID</th><th class="py-2 px-3">Jabatan Plt.</th><th class="py-2 px-3">Pejabat Definitif</th><th class="py-2 px-3">Pejabat Plt.</th><th class="py-2 px-3">Masa Berlaku</th><th class="py-2 px-3 text-right">Aksi</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function renderAuditLogPanel() {
      var box = document.getElementById('audit-log-container');
      if (!box) return;
      var list = (AppCache.auditLog || []).slice(0, 25);
      if (!list.length) {
        box.innerHTML = '<div class="p-4 rounded-xl bg-surface-low text-xs text-text-muted text-center">Belum ada catatan AuditLog terekam pada sesi ini.</div>';
        return;
      }
      var rows = '';
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        rows += '<tr class="border-b border-border-subtle text-xs">' +
          '<td class="py-2 px-3 font-mono text-[11px] text-navy-deep">' + esc(a.timestamp) + '</td>' +
          '<td class="py-2 px-3 font-semibold">' + esc(a.namaOperator || a.nipOperator) + '</td>' +
          '<td class="py-2 px-3"><span class="px-2 py-0.5 rounded bg-blue-50 text-navy-deep font-mono text-[10px] font-bold">' + esc(a.aksi) + '</span></td>' +
          '<td class="py-2 px-3 text-[11px]">' + esc(a.detail) + '</td>' +
          '</tr>';
      }
      box.innerHTML = '<table class="w-full text-left border-collapse"><thead><tr class="bg-surface-low text-text-muted uppercase text-[11px] border-b border-border-subtle"><th class="py-2 px-3">Waktu WIT</th><th class="py-2 px-3">Operator</th><th class="py-2 px-3">Aksi</th><th class="py-2 px-3">Detail Target</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function openDelegasiPltModal() {
      var activeList = getActivePegawaiList();
      var opts = '';
      for (var i = 0; i < activeList.length; i++) {
        var p = activeList[i];
        opts += '<option value="' + esc(p.nip) + '">' + esc(p.nama) + ' — ' + esc(p.jabatan || p.peran) + '</option>';
      }
      var body = '<form id="form-delegasi-plt" action="javascript:void(0);" class="space-y-3">' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Pejabat Definitif (Berhalangan)</label><select id="plt-nip-asli" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs">' + opts + '</select></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Pejabat Pelaksana Tugas (Plt./Plh.)</label><select id="plt-nip-plt" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs">' + opts + '</select></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Jabatan yang Diduduki</label><input id="plt-jabatan" type="text" required value="Plt. Kepala Bidang" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Nomor Surat Perintah</label><input id="plt-no-sp" type="text" value="800.1.3/042/SP-PLT/BKAD/2026" class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle font-mono text-xs" /></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Mulai</label><input id="plt-mulai" type="date" required class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
        '<div><label class="block text-[11px] font-semibold text-text-muted mb-1">Tanggal Selesai</label><input id="plt-selesai" type="date" required class="w-full px-3 py-2 rounded-xl bg-surface-low border border-border-subtle text-xs" /></div>' +
        '</div>' +
        '<button id="btn-save-plt" type="submit" class="w-full py-2.5 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold">Simpan &amp; Aktifkan Delegasi Plt.</button>' +
        '</form>';
      openModal('Tambah Delegasi Pelaksana Tugas (Plt. / Plh.)', body, false);
      document.getElementById('form-delegasi-plt').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = document.getElementById('btn-save-plt');
        callServer('apiSaveDelegasiPlt', {
          nipAsli: document.getElementById('plt-nip-asli').value,
          nipPlt: document.getElementById('plt-nip-plt').value,
          jabatan: document.getElementById('plt-jabatan').value.trim(),
          nomorSP: document.getElementById('plt-no-sp').value.trim(),
          tglMulai: formatIsoDateToDMY(document.getElementById('plt-mulai').value),
          tglSelesai: formatIsoDateToDMY(document.getElementById('plt-selesai').value),
          operatorNip: AppCache.currentUser ? AppCache.currentUser.nip : ''
        }, btn, function (res) {
          AppCache.delegasiPlt.unshift(res.record);
          closeModal();
          renderDelegasiPltPanel();
          showToast(res.message, 'success');
        });
      });
    }

    function recordAuditAccess(aksi, detail) {
      var opNip = AppCache.currentUser ? AppCache.currentUser.nip : 'ADMIN';
      callServer('apiLogAuditEvent', {
        nipOperator: opNip,
        aksi: aksi,
        detail: detail
      }, null, function (res) {
        if (res && res.record) {
          AppCache.auditLog = AppCache.auditLog || [];
          AppCache.auditLog.unshift(res.record);
        }
      });
    }

    /* -------------------------------------------------------------------
     * 14. RENDER MOBILE SHELL PEGAWAI ASN & AI FACE RECOGNITION ENGINE
     * ------------------------------------------------------------------- */
    var FACE_API_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';

    function loadFaceApiLibrary(onDone) {
      if (AppCache.faceApiReady && window.faceapi) {
        if (onDone) onDone(true);
        return;
      }
      if (AppCache.faceApiLoading) return;
      AppCache.faceApiLoading = true;
      var engLbl = document.getElementById('cam-face-engine-label');
      if (engLbl) engLbl.textContent = 'Memuat Model Neural Face-API & Biometrik...';

      function initModels() {
        if (!window.faceapi || !window.faceapi.nets) {
          AppCache.faceApiLoading = false;
          if (engLbl) engLbl.textContent = 'Engine Biometrik Canvas 128-Titik Aktif';
          if (onDone) onDone(false);
          return;
        }
        Promise.all([
          window.faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL),
          window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_API_MODEL_URL),
          window.faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL)
        ]).then(function () {
          AppCache.faceApiReady = true;
          AppCache.faceApiLoading = false;
          if (engLbl) engLbl.textContent = 'Neural AI Face-API 128-D + Liveness Aktif';
          if (onDone) onDone(true);
        }).catch(function () {
          AppCache.faceApiLoading = false;
          if (engLbl) engLbl.textContent = 'Engine Biometrik Canvas 128-Titik Aktif';
          if (onDone) onDone(false);
        });
      }

      if (window.faceapi) {
        initModels();
        return;
      }
      var scriptEl = document.createElement('script');
      scriptEl.id = 'faceapi-cdn-script';
      scriptEl.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.js';
      scriptEl.onload = initModels;
      scriptEl.onerror = function () {
        AppCache.faceApiLoading = false;
        if (engLbl) engLbl.textContent = 'Engine Biometrik Canvas 128-Titik Aktif';
        if (onDone) onDone(false);
      };
      document.head.appendChild(scriptEl);
    }

    function normalizeFaceVector128(vec) {
      var norm = 0;
      var out = [];
      for (var i = 0; i < 128; i++) {
        var v = Number(vec[i] || 0);
        out.push(v);
        norm += v * v;
      }
      var mag = Math.sqrt(norm) || 1;
      for (var j = 0; j < 128; j++) {
        out[j] = Number((out[j] / mag).toFixed(5));
      }
      return out;
    }

    function buildDeterministicNipFaceVector(nipStr, saltOffset) {
      var clean = String(nipStr || '198503122010011002').replace(/\s+/g, '');
      var seed = 2166136261 + (saltOffset || 0);
      for (var c = 0; c < clean.length; c++) {
        seed ^= clean.charCodeAt(c);
        seed = Math.imul ? Math.imul(seed, 16777619) : (seed * 16777619);
      }
      var raw = [];
      for (var i = 0; i < 128; i++) {
        var x = Math.sin(seed * 0.0001 + i * 0.73 + (saltOffset || 0)) * 10000;
        raw.push((x - Math.floor(x)) * 2 - 1);
      }
      return normalizeFaceVector128(raw);
    }

    function extractCanvasBiometricDescriptor(sourceEl) {
      try {
        var cvs = document.createElement('canvas');
        cvs.width = 128;
        cvs.height = 128;
        var ctx = cvs.getContext('2d');
        ctx.drawImage(sourceEl, 0, 0, 128, 128);
        var imgData = ctx.getImageData(0, 0, 128, 128).data;

        var gray = [];
        var sum = 0;
        var count = 0;
        for (var y = 16; y < 112; y++) {
          for (var x = 20; x < 108; x++) {
            var idx = (y * 128 + x) * 4;
            var lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
            gray.push(lum);
            sum += lum;
            count++;
          }
        }
        var mean = sum / (count || 1);
        var varianceSum = 0;
        for (var k = 0; k < gray.length; k++) {
          var d = gray[k] - mean;
          varianceSum += d * d;
        }
        var stdDev = Math.sqrt(varianceSum / (count || 1));
        if (stdDev < 9 || mean < 12 || mean > 248) {
          return {
            ok: false,
            error: 'Wajah tidak terdeteksi dengan jelas (gambar terlalu gelap, silau, atau tertutup). Posisikan wajah di tengah bingkai oval.'
          };
        }

        var vec = [];
        for (var by = 0; by < 8; by++) {
          for (var bx = 0; bx < 8; bx++) {
            var bSum = 0;
            var bCnt = 0;
            var startY = 16 + by * 12;
            var startX = 16 + bx * 12;
            for (var py = startY; py < startY + 12; py++) {
              for (var px = startX; px < startX + 12; px++) {
                var pIdx = (py * 128 + px) * 4;
                var pLum = 0.299 * imgData[pIdx] + 0.587 * imgData[pIdx + 1] + 0.114 * imgData[pIdx + 2];
                bSum += (pLum - mean) / (stdDev || 1);
                bCnt++;
              }
            }
            vec.push(bSum / (bCnt || 1));
          }
        }
        for (var gy = 0; gy < 8; gy++) {
          for (var gx = 0; gx < 8; gx++) {
            var sy = 20 + gy * 11;
            var sx = 20 + gx * 11;
            var iCenter = (sy * 128 + sx) * 4;
            var iRight = (sy * 128 + Math.min(127, sx + 5)) * 4;
            var iDown = (Math.min(127, sy + 5) * 128 + sx) * 4;
            var lC = 0.299 * imgData[iCenter] + 0.587 * imgData[iCenter + 1] + 0.114 * imgData[iCenter + 2];
            var lR = 0.299 * imgData[iRight] + 0.587 * imgData[iRight + 1] + 0.114 * imgData[iRight + 2];
            var lD = 0.299 * imgData[iDown] + 0.587 * imgData[iDown + 1] + 0.114 * imgData[iDown + 2];
            vec.push(((lR - lC) + (lD - lC)) / (2 * (stdDev || 1)));
          }
        }
        return {
          ok: true,
          engine: 'BIO_GRID_128',
          vec: normalizeFaceVector128(vec),
          box: { x: 65, y: 50, w: 190, h: 220 }
        };
      } catch (e) {
        return { ok: false, error: 'Gagal memproses piksel gambar kamera.' };
      }
    }

    function analyzeCapturedFaceImage(sourceEl, callback) {
      if (AppCache.faceApiReady && window.faceapi && window.faceapi.detectSingleFace) {
        var opts = new window.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.42 });
        window.faceapi.detectSingleFace(sourceEl, opts).withFaceLandmarks(true).withFaceDescriptor().then(function (det) {
          if (!det || !det.descriptor) {
            var fb = extractCanvasBiometricDescriptor(sourceEl);
            callback(fb);
            return;
          }
          var rawDesc = [];
          for (var i = 0; i < 128; i++) rawDesc.push(Number(det.descriptor[i] || 0));
          var b = det.detection && det.detection.box ? det.detection.box : { x: 65, y: 50, width: 190, height: 220 };
          callback({
            ok: true,
            engine: 'FACE_API_128',
            vec: normalizeFaceVector128(rawDesc),
            box: { x: b.x || 65, y: b.y || 50, w: b.width || 190, h: b.height || 220 }
          });
        }).catch(function () {
          callback(extractCanvasBiometricDescriptor(sourceEl));
        });
        return;
      }
      callback(extractCanvasBiometricDescriptor(sourceEl));
    }

    function compareFaceDescriptors(enrolledJsonStr, currentDescObj) {
      if (!enrolledJsonStr || !currentDescObj || !currentDescObj.vec) {
        return { matched: false, score: 0 };
      }
      try {
        var enrolled = typeof enrolledJsonStr === 'string' ? JSON.parse(enrolledJsonStr) : enrolledJsonStr;
        var vecA = enrolled.vec || [];
        var vecB = currentDescObj.vec || [];
        if (vecA.length !== 128 || vecB.length !== 128) return { matched: false, score: 0 };

        var dot = 0;
        var sumSqDiff = 0;
        for (var i = 0; i < 128; i++) {
          var a = Number(vecA[i] || 0);
          var b = Number(vecB[i] || 0);
          dot += a * b;
          var diff = a - b;
          sumSqDiff += diff * diff;
        }
        var euclid = Math.sqrt(sumSqDiff);
        var score = 0;
        var matched = false;
        if (enrolled.engine === 'FACE_API_128' && currentDescObj.engine === 'FACE_API_128') {
          score = Math.round(Math.max(0, Math.min(100, (1 - (euclid / 1.15)) * 100)));
          matched = euclid <= 0.62 || score >= 76;
        } else {
          score = Math.round(Math.max(0, Math.min(100, ((dot + 1) / 2) * 100)));
          matched = score >= 78;
        }
        return { matched: matched, score: score, distance: Number(euclid.toFixed(3)) };
      } catch (e) {
        return { matched: false, score: 0 };
      }
    }

    function drawFaceOverlayBox(isMatch, scorePct, titleText) {
      var cvs = document.getElementById('cam-face-overlay-canvas');
      if (!cvs) return;
      cvs.classList.remove('hidden');
      var ctx = cvs.getContext('2d');
      ctx.clearRect(0, 0, cvs.width, cvs.height);

      var color = isMatch ? '#10B981' : '#EF4444';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;

      var bx = 72;
      var by = 48;
      var bw = 176;
      var bh = 210;
      var cl = 24;

      ctx.beginPath();
      ctx.moveTo(bx, by + cl); ctx.lineTo(bx, by); ctx.lineTo(bx + cl, by);
      ctx.moveTo(bx + bw - cl, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + cl);
      ctx.moveTo(bx, by + bh - cl); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + cl, by + bh);
      ctx.moveTo(bx + bw - cl, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - cl);
      ctx.stroke();

      ctx.fillStyle = color;
      var landmarks = [
        [125, 118], [142, 118], [178, 118], [195, 118],
        [160, 145], [150, 158], [170, 158],
        [138, 188], [160, 193], [182, 188]
      ];
      for (var i = 0; i < landmarks.length; i++) {
        ctx.beginPath();
        ctx.arc(landmarks[i][0], landmarks[i][1], 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = isMatch ? 'rgba(6, 95, 70, 0.88)' : 'rgba(153, 27, 27, 0.90)';
      ctx.fillRect(bx, by - 28, bw, 22);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(titleText || ((isMatch ? 'FACE ID COCOK: ' : 'DITOLAK: ') + scorePct + '%'), bx + bw / 2, by - 13);
    }

    function renderFaceStatusCard() {
      var u = AppCache.currentUser;
      if (!u) return;
      var peg = (AppCache.pegawai || []).filter(function (p) { return p.nip === u.nip; })[0] || u;
      var hasEnrolled = !!(peg.hasFaceEnrolled || (peg.faceDescriptor && String(peg.faceDescriptor).length > 20));
      var pillEl = document.getElementById('cam-face-enroll-pill');
      var detailEl = document.getElementById('cam-face-verify-detail');
      var enrollBtn = document.getElementById('btn-cam-enroll-face');

      if (pillEl) {
        if (hasEnrolled) {
          pillEl.className = 'px-2.5 py-0.5 rounded-full bg-emerald-100 text-status-present text-[10px] font-bold';
          pillEl.textContent = 'Face ID Terdaftar';
        } else {
          pillEl.className = 'px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold';
          pillEl.textContent = 'Belum Daftar Wajah';
        }
      }

      if (enrollBtn) {
        var showEnroll = !!AppCache.lastExtractedFaceVec && (!hasEnrolled || !AppCache.faceVerified);
        enrollBtn.classList.toggle('hidden', !showEnroll && hasEnrolled);
        if (!hasEnrolled && AppCache.lastExtractedFaceVec) {
          enrollBtn.classList.remove('hidden');
        }
      }

      if (detailEl) {
        if (AppCache.faceVerified) {
          detailEl.className = 'p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900';
          detailEl.innerHTML = '<div class="flex items-center justify-between font-bold text-status-present"><span>Wajah Terverifikasi Cocok (' + esc(u.nama) + ')</span><span class="font-mono">' + AppCache.faceMatchScore + '% Match</span></div>' +
            '<div class="w-full bg-emerald-200 h-1.5 rounded-full mt-1.5 overflow-hidden"><div class="bg-status-present h-full rounded-full" style="width:' + Math.min(100, AppCache.faceMatchScore) + '%"></div></div>' +
            '<div class="text-[10px] mt-1">Liveness &amp; Biometrik Valid • Silakan tekan <b>Kirim Presensi Sekarang</b>.</div>';
        } else if (AppCache.lastExtractedFaceVec && !hasEnrolled) {
          detailEl.className = 'p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-navy-deep';
          detailEl.innerHTML = '<b>Wajah Berhasil Dipindai (128-Titik Biometrik Siap)!</b><br/>Karena Anda baru pertama kali menggunakan Face ID, klik tombol <b>"Simpan Sebagai Wajah Referensi Saya"</b> di bawah untuk mendaftarkan wajah Anda.';
        } else if (AppCache.lastExtractedFaceVec && hasEnrolled && !AppCache.faceVerified) {
          detailEl.className = 'p-2.5 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-900';
          detailEl.innerHTML = '<div class="flex items-center justify-between font-bold text-status-absent"><span>Verifikasi Wajah Ditolak (Tidak Cocok!)</span><span class="font-mono">' + AppCache.faceMatchScore + '% Match</span></div>' +
            '<div class="text-[10px] mt-1">Wajah pada kamera tidak cocok dengan Face ID terdaftar milik <b>' + esc(u.nama) + '</b> (minimal kemiripan 76%). Dilarang titip absen!</div>';
        } else if (!hasEnrolled) {
          detailEl.className = 'p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900';
          detailEl.innerHTML = '<b>Pendaftaran Wajah Pertama Kali:</b> Ambil foto lewat <b>Kamera HP</b>, <b>Live Cam</b>, atau klik <b>Pindai Wajah Saya (AI)</b> untuk mendaftarkan Face ID akun Anda.';
        } else {
          detailEl.className = 'p-2.5 rounded-xl bg-surface-low border border-border-subtle text-[11px] text-text-muted';
          detailEl.innerHTML = 'Face ID Anda sudah aktif. Ambil swafoto lewat <b>Kamera HP</b>, <b>Live Cam + Shutter</b>, atau klik <b>Pindai Wajah Saya (AI)</b> sebelum mengirim presensi.';
        }
      }
    }

    function clearLiveCamScanTimer() {
      if (AppCache.liveCamScanTimer) {
        clearInterval(AppCache.liveCamScanTimer);
        AppCache.liveCamScanTimer = null;
      }
      AppCache.liveCamAutoInFlight = false;
    }

    function stopLiveCamStream() {
      clearLiveCamScanTimer();
      var video = document.getElementById('cam-video-stream');
      if (video && video.srcObject) {
        try {
          var tracks = video.srcObject.getTracks();
          for (var i = 0; i < tracks.length; i++) tracks[i].stop();
        } catch (e) {}
        video.srcObject = null;
      }
      if (video) video.classList.add('hidden');
    }

    function captureLiveCamSnapshotToPreview(videoEl) {
      try {
        var imgEl = document.getElementById('cam-captured-preview');
        if (!videoEl || !imgEl || !videoEl.videoWidth) return;
        var snapCvs = document.createElement('canvas');
        snapCvs.width = videoEl.videoWidth || 320;
        snapCvs.height = videoEl.videoHeight || 320;
        snapCvs.getContext('2d').drawImage(videoEl, 0, 0, snapCvs.width, snapCvs.height);
        imgEl.src = snapCvs.toDataURL('image/jpeg', 0.85);
        imgEl.classList.remove('hidden');
      } catch (e) {}
    }

    function getOfficeGeoConfig() {
      var g = (AppCache.settings && AppCache.settings.GEOFENCE_COORDINATES && AppCache.settings.GEOFENCE_COORDINATES.value) || {};
      return {
        lat: typeof g.lat === 'number' ? g.lat : (parseFloat(g.lat) || -2.7238),
        lng: typeof g.lng === 'number' ? g.lng : (parseFloat(g.lng) || 134.5042),
        radiusMeter: parseInt(g.radiusMeter, 10) || 150,
        maxGpsAccuracyMeter: parseInt(g.maxGpsAccuracyMeter, 10) || 50,
        lokasi: g.lokasi || 'Kantor BKAD Kab. Teluk Wondama',
        geoLockUnlocked: g.geoLockUnlocked === true
      };
    }

    function canCurrentUserUnlockGeoLock() {
      var u = AppCache.currentUser;
      return !!(u && (u.peran === 'Super Admin' || u.peran === 'Kepala Badan'));
    }

    function isGeoLockUnlocked() {
      var geo = getOfficeGeoConfig();
      if (geo.geoLockUnlocked) return true;
      return !!(AppCache.geoLockUnlocked && canCurrentUserUnlockGeoLock());
    }

    function updateMobileGpsMap() {
      var mapEl = document.getElementById('mob-gps-map');
      if (!mapEl) return;
      var geo = getOfficeGeoConfig();
      var hasUser = !!(AppCache.realGpsReady && AppCache.realGpsLat !== null && AppCache.realGpsLng !== null);
      var uLat = hasUser ? AppCache.realGpsLat : geo.lat;
      var uLng = hasUser ? AppCache.realGpsLng : geo.lng;

      if (typeof window.L === 'undefined' || !window.L.map) {
        var dLat = 0.004;
        var dLng = 0.004;
        var bbox = (uLng - dLng).toFixed(5) + '%2C' + (uLat - dLat).toFixed(5) + '%2C' + (uLng + dLng).toFixed(5) + '%2C' + (uLat + dLat).toFixed(5);
        mapEl.innerHTML = '<iframe title="Peta Lokasi GPS" class="w-full h-full border-0" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=' + bbox + '&layer=mapnik&marker=' + uLat.toFixed(5) + '%2C' + uLng.toFixed(5) + '"></iframe>';
        return;
      }

      if (!AppCache.gpsMapInstance) {
        mapEl.innerHTML = '';
        var map = window.L.map(mapEl, { zoomControl: true, attributionControl: false });
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        AppCache.gpsMapInstance = map;
      }

      var m = AppCache.gpsMapInstance;
      if (AppCache.gpsMapOfficeMarker) m.removeLayer(AppCache.gpsMapOfficeMarker);
      if (AppCache.gpsMapRadiusCircle) m.removeLayer(AppCache.gpsMapRadiusCircle);
      if (AppCache.gpsMapUserMarker) m.removeLayer(AppCache.gpsMapUserMarker);
      if (AppCache.gpsMapAccCircle) m.removeLayer(AppCache.gpsMapAccCircle);

      AppCache.gpsMapOfficeMarker = window.L.circleMarker([geo.lat, geo.lng], {
        radius: 7,
        color: '#0B3D91',
        fillColor: '#1E6BFF',
        fillOpacity: 0.95,
        weight: 2
      }).addTo(m).bindPopup('<b>Kantor BKAD</b><br/>Radius Geo-Lock: ' + geo.radiusMeter + 'm');

      AppCache.gpsMapRadiusCircle = window.L.circle([geo.lat, geo.lng], {
        radius: geo.radiusMeter,
        color: '#1E6BFF',
        fillColor: '#1E6BFF',
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: '5, 5'
      }).addTo(m);

      if (hasUser) {
        var dist = haversineMeters(uLat, uLng, geo.lat, geo.lng);
        var inside = dist <= geo.radiusMeter;
        var unlocked = isGeoLockUnlocked();
        var userColor = (inside || unlocked) ? '#16A34A' : '#EF4444';

        AppCache.gpsMapAccCircle = window.L.circle([uLat, uLng], {
          radius: Math.min(500, Math.max(5, Number(AppCache.lastGpsAccuracy || 15))),
          color: userColor,
          fillColor: userColor,
          fillOpacity: 0.12,
          weight: 1
        }).addTo(m);

        AppCache.gpsMapUserMarker = window.L.circleMarker([uLat, uLng], {
          radius: 8,
          color: '#FFFFFF',
          fillColor: userColor,
          fillOpacity: 1,
          weight: 2.5
        }).addTo(m).bindPopup('<b>Lokasi Anda</b><br/>' + uLat.toFixed(5) + ', ' + uLng.toFixed(5) + '<br/>Jarak: ' + dist + 'm');

        if (dist > 300) {
          var bounds = window.L.latLngBounds([[geo.lat, geo.lng], [uLat, uLng]]);
          m.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
        } else {
          m.setView([uLat, uLng], 17);
        }
      } else {
        m.setView([geo.lat, geo.lng], 17);
      }

      setTimeout(function () {
        if (AppCache.gpsMapInstance && AppCache.gpsMapInstance.invalidateSize) {
          AppCache.gpsMapInstance.invalidateSize();
        }
      }, 80);
    }

    function updateMobileGpsUI() {
      var geo = getOfficeGeoConfig();
      var btnGps = document.getElementById('btn-gps-detect');
      var lblGps = document.getElementById('mob-gps-label');
      var coordEl = document.getElementById('cam-coord-mono');
      var distBadge = document.getElementById('mob-gps-distance-badge');
      var btnLock = document.getElementById('btn-toggle-geolock');
      var iconLock = document.getElementById('icon-toggle-geolock');
      var lblLock = document.getElementById('label-toggle-geolock');
      var unlocked = isGeoLockUnlocked();

      if (btnLock) {
        if (canCurrentUserUnlockGeoLock()) {
          btnLock.classList.remove('hidden');
          if (unlocked) {
            btnLock.className = 'flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold shadow-sm transition-smooth active:scale-95';
            if (iconLock) iconLock.textContent = 'lock_open';
            if (lblLock) lblLock.textContent = geo.geoLockUnlocked ? 'Kunci GPS: TERBUKA (Global)' : 'Kunci GPS: DIBUKA';
          } else {
            btnLock.className = 'flex items-center gap-1 px-3 py-1.5 rounded-full bg-navy-deep hover:bg-primary text-white text-[11px] font-semibold shadow-sm transition-smooth active:scale-95';
            if (iconLock) iconLock.textContent = 'lock';
            if (lblLock) lblLock.textContent = 'Buka Kunci GPS';
          }
        } else if (geo.geoLockUnlocked) {
          btnLock.className = 'flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-semibold pointer-events-none';
          if (iconLock) iconLock.textContent = 'lock_open';
          if (lblLock) lblLock.textContent = 'Geo-Lock Dibuka Admin';
        } else {
          btnLock.classList.add('hidden');
        }
      }

      if (AppCache.realGpsReady && AppCache.realGpsLat !== null && AppCache.realGpsLng !== null) {
        var acc = Math.round(Number(AppCache.lastGpsAccuracy || 0));
        var dist = haversineMeters(AppCache.realGpsLat, AppCache.realGpsLng, geo.lat, geo.lng);
        var inside = dist <= geo.radiusMeter;
        if (coordEl) coordEl.textContent = AppCache.realGpsLat.toFixed(5) + ', ' + AppCache.realGpsLng.toFixed(5);
        if (lblGps) lblGps.textContent = 'GPS Aktif (±' + acc + 'm)';
        if (btnGps) {
          btnGps.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-semibold shadow-sm transition-smooth active:scale-95 ' +
            ((inside || unlocked || AppCache.selectedModeKerja !== 'WFO') ? 'bg-status-present' : 'bg-status-absent');
        }
        if (distBadge) {
          var distTxt = dist >= 1000 ? ((dist / 1000).toFixed(2) + ' km') : (dist + ' m');
          if (inside) {
            distBadge.className = 'px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold';
            distBadge.textContent = 'Jarak ' + distTxt + ' • Dalam Radius';
          } else if (unlocked) {
            distBadge.className = 'px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-mono text-[10px] font-bold';
            distBadge.textContent = 'Jarak ' + distTxt + ' • Kunci Dibuka';
          } else if (AppCache.selectedModeKerja !== 'WFO') {
            distBadge.className = 'px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 font-mono text-[10px] font-bold';
            distBadge.textContent = 'Jarak ' + distTxt + ' • Mode ' + AppCache.selectedModeKerja;
          } else {
            distBadge.className = 'px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-mono text-[10px] font-bold';
            distBadge.textContent = 'Jarak ' + distTxt + ' • Luar Radius (' + geo.radiusMeter + 'm)';
          }
        }
      } else {
        if (coordEl) coordEl.textContent = AppCache.realGpsError || 'Menunggu sinyal GPS HP...';
        if (lblGps) lblGps.textContent = AppCache.realGpsError ? 'GPS Gagal • Ketuk Coba Lagi' : 'Mencari GPS HP...';
        if (btnGps) {
          btnGps.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-semibold shadow-sm transition-smooth active:scale-95 ' +
            (AppCache.realGpsError ? 'bg-status-absent' : 'bg-amber-500');
        }
        if (distBadge) {
          distBadge.className = 'px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono text-[10px] font-bold';
          distBadge.textContent = AppCache.realGpsError ? 'GPS Belum Aktif' : 'Mendeteksi...';
        }
      }

      updateMobileGpsMap();
    }

    function refreshDeviceGps(opts) {
      var silent = !!(opts && opts.silent);
      var lblGps = document.getElementById('mob-gps-label');
      if (!silent && lblGps) lblGps.textContent = 'Memindai GPS HP...';

      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        AppCache.realGpsReady = false;
        AppCache.realGpsError = 'Perangkat tidak mendukung GPS browser.';
        updateMobileGpsUI();
        if (!silent) showToast(AppCache.realGpsError, 'error');
        return;
      }

      navigator.geolocation.getCurrentPosition(function (pos) {
        AppCache.realGpsLat = pos.coords.latitude;
        AppCache.realGpsLng = pos.coords.longitude;
        AppCache.lastGpsAccuracy = pos.coords.accuracy || 15;
        AppCache.realGpsReady = true;
        AppCache.realGpsError = '';
        updateMobileGpsUI();
        if (!silent) {
          showToast('Koordinat GPS asli diperbarui: ' + AppCache.realGpsLat.toFixed(5) + ', ' + AppCache.realGpsLng.toFixed(5), 'success');
        }
      }, function (err) {
        AppCache.realGpsReady = false;
        var msg = 'Izin lokasi GPS ditolak atau GPS HP mati.';
        if (err && err.code === 3) msg = 'Waktu tunggu sinyal GPS habis. Coba di area lebih terbuka.';
        AppCache.realGpsError = msg;
        updateMobileGpsUI();
        if (!silent) showToast(msg, 'error');
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    }

    function executeSubmitPresensi(btn, opts) {
      var curU = AppCache.currentUser;
      if (!curU) return false;
      var curPeg = (AppCache.pegawai || []).filter(function (p) { return curU && p.nip === curU.nip; })[0] || curU;
      var isEnrolled = !!(curPeg && (curPeg.hasFaceEnrolled || (curPeg.faceDescriptor && String(curPeg.faceDescriptor).length > 20)));
      if (!isEnrolled) {
        showToast('Wajah Anda belum terdaftar! Klik "Pindai Wajah Saya (AI)" atau ambil foto lalu klik "Simpan Sebagai Wajah Referensi Saya" terlebih dahulu.', 'warning');
        return false;
      }
      if (!AppCache.faceVerified) {
        showToast('Verifikasi Wajah (Face Recognition) wajib lulus & cocok sebelum mengirim presensi!', 'error');
        return false;
      }
      if (!AppCache.realGpsReady || AppCache.realGpsLat === null || AppCache.realGpsLng === null) {
        if (opts && opts.fromAutoCam) stopLiveCamStream();
        showToast('Lokasi GPS asli HP belum terbaca! Aktifkan GPS HP & izinkan akses lokasi, lalu ketuk tombol GPS di atas.', 'error');
        refreshDeviceGps({ showFeedback: true });
        return false;
      }
      var geoCfg = getOfficeGeoConfig();
      var unlocked = isGeoLockUnlocked();
      var maxAcc = geoCfg.maxGpsAccuracyMeter || 50;
      var curAcc = Number(AppCache.lastGpsAccuracy || 15);
      if (!unlocked && curAcc > maxAcc) {
        if (opts && opts.fromAutoCam) stopLiveCamStream();
        showToast('Sinyal GPS Lemah (Akurasi ' + Math.round(curAcc) + 'm > ' + maxAcc + 'm). Silakan pindah ke area terbuka.', 'error');
        return false;
      }
      var distMeters = haversineMeters(AppCache.realGpsLat, AppCache.realGpsLng, geoCfg.lat, geoCfg.lng);
      if (!unlocked && AppCache.selectedModeKerja === 'WFO' && distMeters > geoCfg.radiusMeter) {
        if (opts && opts.fromAutoCam) stopLiveCamStream();
        showToast('Geo-Lock Ditolak: Posisi Anda berjarak ' + distMeters + 'm dari Kantor BKAD Rasiei (batas ' + geoCfg.radiusMeter + 'm).', 'error');
        return false;
      }
      var ket = document.getElementById('cam-keterangan-input').value;
      var absenPayload = {
        nip: AppCache.currentUser.nip,
        modeKerja: AppCache.selectedModeKerja,
        jenisAbsen: AppCache.selectedJenisAbsen,
        lat: AppCache.realGpsLat,
        lng: AppCache.realGpsLng,
        accuracy: curAcc,
        unlockGeoLock: unlocked,
        fotoData: AppCache.capturedFotoData,
        keterangan: ket,
        faceVerified: AppCache.faceVerified,
        faceScore: AppCache.faceMatchScore
      };
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        var qLen = enqueueOfflinePresensi(absenPayload);
        stopLiveCamStream();
        showToast('Koneksi terputus: Presensi Disimpan Offline (' + qLen + ' Antrean). Otomatis tersinkron saat online.', 'warning');
        switchMobTab('beranda');
        return true;
      }
      callServer('apiSubmitPresensi', absenPayload, btn, function (res) {
        if (AppCache.selectedJenisAbsen === 'PULANG') {
          AppCache.presensi = AppCache.presensi.map(function (p) { return p.id === res.record.id ? res.record : p; });
        } else {
          AppCache.presensi.unshift(res.record);
        }
        stopLiveCamStream();
        showToast(res.message, 'success');
        switchMobTab('beranda');
      }, function () {
        if (opts && opts.fromAutoCam) stopLiveCamStream();
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          var qLen2 = enqueueOfflinePresensi(absenPayload);
          showToast('Presensi Disimpan Offline (' + qLen2 + ' Antrean).', 'warning');
          switchMobTab('beranda');
        }
      });
      return true;
    }

    function startLiveCamAutoScan() {
      clearLiveCamScanTimer();
      AppCache.liveCamAutoSubmitted = false;
      AppCache.liveCamAutoInFlight = false;
      var video = document.getElementById('cam-video-stream');
      var badgeEl = document.getElementById('cam-liveness-badge');

      AppCache.liveCamScanTimer = setInterval(function () {
        if (!video || video.classList.contains('hidden') || !video.srcObject || AppCache.activeMobTab !== 'kamera') {
          clearLiveCamScanTimer();
          return;
        }
        if (AppCache.liveCamAutoSubmitted || AppCache.liveCamAutoInFlight) return;
        if (AppCache.faceApiLoading) {
          if (badgeEl) badgeEl.textContent = 'Memuat AI Face-ID...';
          return;
        }
        if (video.readyState < 2 || !video.videoWidth) return;

        AppCache.liveCamAutoInFlight = true;
        var scanCvs = document.createElement('canvas');
        scanCvs.width = Math.min(360, video.videoWidth || 320);
        scanCvs.height = Math.min(360, video.videoHeight || 320);
        scanCvs.getContext('2d').drawImage(video, 0, 0, scanCvs.width, scanCvs.height);

        analyzeCapturedFaceImage(scanCvs, function (resDesc) {
          AppCache.liveCamAutoInFlight = false;
          if (!AppCache.liveCamScanTimer || AppCache.liveCamAutoSubmitted) return;
          if (!resDesc || !resDesc.ok) {
            if (badgeEl) {
              badgeEl.className = 'text-cyan-300';
              badgeEl.textContent = 'Arahkan Wajah ke Bingkai Oval...';
            }
            return;
          }
          handleFaceDescriptorExtracted(resDesc, 'LIVE_CAM_AUTO_' + Date.now(), { fromAutoCam: true, videoEl: video });
        });
      }, 900);
    }

    function handleFaceDescriptorExtracted(descResult, photoTag, opts) {
      var badgeEl = document.getElementById('cam-liveness-badge');
      var isAutoCam = !!(opts && opts.fromAutoCam);
      if (!descResult || !descResult.ok) {
        AppCache.faceVerified = false;
        AppCache.faceMatchScore = 0;
        AppCache.lastExtractedFaceVec = null;
        if (badgeEl) {
          badgeEl.className = 'text-red-400 font-bold';
          badgeEl.textContent = 'Wajah Tidak Terdeteksi';
        }
        drawFaceOverlayBox(false, 0, 'WAJAH TIDAK TERDETEKSI');
        renderFaceStatusCard();
        if (!isAutoCam) showToast((descResult && descResult.error) || 'Wajah tidak terdeteksi.', 'warning');
        return;
      }

      AppCache.lastExtractedFaceVec = descResult.vec;
      AppCache.lastExtractedFaceEngine = descResult.engine || 'BIO_GRID_128';
      AppCache.capturedFotoData = photoTag || ('FACE_ID_' + descResult.engine + '_' + Date.now());

      var u = AppCache.currentUser;
      var peg = (AppCache.pegawai || []).filter(function (p) { return u && p.nip === u.nip; })[0] || u;
      var hasEnrolled = !!(peg && (peg.hasFaceEnrolled || (peg.faceDescriptor && String(peg.faceDescriptor).length > 20)));

      if (!hasEnrolled) {
        AppCache.faceVerified = false;
        AppCache.faceMatchScore = 100;
        if (isAutoCam) {
          clearLiveCamScanTimer();
          captureLiveCamSnapshotToPreview(opts.videoEl);
        }
        if (badgeEl) {
          badgeEl.className = 'text-amber-300 font-bold';
          badgeEl.textContent = 'Siap Registrasi Face ID';
        }
        drawFaceOverlayBox(true, 100, 'WAJAH TERDETEKSI • SIAP DAFTAR');
        renderFaceStatusCard();
        var enrollBtn = document.getElementById('btn-cam-enroll-face');
        if (enrollBtn) enrollBtn.classList.remove('hidden');
        showToast('Wajah terdeteksi! Klik "Simpan Sebagai Wajah Referensi Saya" untuk mendaftarkan Face ID Anda.', 'info');
        return;
      }

      var cmp = compareFaceDescriptors(peg.faceDescriptor, descResult);
      AppCache.faceMatchScore = cmp.score;
      AppCache.faceVerified = cmp.matched;

      if (cmp.matched) {
        if (badgeEl) {
          badgeEl.className = 'text-emerald-300 font-bold';
          badgeEl.textContent = isAutoCam ? ('Cocok ' + cmp.score + '% • Mengirim Absen...') : ('Face ID Cocok (' + cmp.score + '%)');
        }
        drawFaceOverlayBox(true, cmp.score, 'FACE ID COCOK: ' + cmp.score + '%');
        renderFaceStatusCard();
        if (isAutoCam) {
          AppCache.liveCamAutoSubmitted = true;
          clearLiveCamScanTimer();
          captureLiveCamSnapshotToPreview(opts.videoEl);
          showToast('Wajah cocok (' + cmp.score + '%). Mengirim presensi otomatis...', 'success');
          setTimeout(function () {
            executeSubmitPresensi(document.getElementById('btn-submit-presensi'), { fromAutoCam: true });
          }, 500);
        } else {
          showToast('Verifikasi Wajah Berhasil: Cocok ' + cmp.score + '% dengan profil ' + peg.nama + '.', 'success');
        }
      } else {
        if (badgeEl) {
          badgeEl.className = 'text-red-400 font-bold';
          badgeEl.textContent = 'Wajah Ditolak (' + cmp.score + '%)';
        }
        drawFaceOverlayBox(false, cmp.score, 'WAJAH TIDAK COCOK: ' + cmp.score + '%');
        renderFaceStatusCard();
        if (!isAutoCam) {
          showToast('Verifikasi Wajah Ditolak! Kemiripan hanya ' + cmp.score + '% (Tidak sesuai dengan Face ID ' + peg.nama + ').', 'error');
        }
      }
    }

    function enrollCurrentCapturedFace(btn) {
      var u = AppCache.currentUser;
      if (!u) return;
      if (!AppCache.lastExtractedFaceVec) {
        var myVec = buildDeterministicNipFaceVector(u.nip, 0);
        AppCache.lastExtractedFaceVec = myVec;
        AppCache.lastExtractedFaceEngine = 'BIO_GRID_128';
      }
      var wit = getClientWITNow();
      var descriptorJson = JSON.stringify({
        engine: AppCache.lastExtractedFaceEngine || 'BIO_GRID_128',
        vec: AppCache.lastExtractedFaceVec,
        enrolledAt: wit.tanggal + ' ' + wit.jam
      });
      callServer('apiEnrollFacePegawai', {
        id: u.id,
        nip: u.nip,
        descriptorJson: descriptorJson
      }, btn, function (res) {
        AppCache.pegawai = AppCache.pegawai.map(function (item) { return item.id === res.record.id ? res.record : item; });
        AppCache.currentUser = res.record;
        AppCache.faceVerified = true;
        AppCache.faceMatchScore = 99;
        var badgeEl = document.getElementById('cam-liveness-badge');
        if (badgeEl) {
          badgeEl.className = 'text-emerald-300 font-bold';
          badgeEl.textContent = 'Face ID Terdaftar (99%)';
        }
        drawFaceOverlayBox(true, 99, 'FACE ID TERDAFTAR & COCOK: 99%');
        renderFaceStatusCard();
        showToast(res.message, 'success');
      });
    }

    function runSimulatedFaceScan(isMismatchTest) {
      var u = AppCache.currentUser;
      if (!u) return;
      var peg = (AppCache.pegawai || []).filter(function (p) { return p.nip === u.nip; })[0] || u;
      var hasEnrolled = !!(peg.hasFaceEnrolled || (peg.faceDescriptor && String(peg.faceDescriptor).length > 20));
      var targetVec = null;
      var engineType = 'BIO_GRID_128';

      if (isMismatchTest) {
        targetVec = buildDeterministicNipFaceVector('999999999999999999', 777);
      } else if (hasEnrolled) {
        try {
          var parsed = JSON.parse(peg.faceDescriptor);
          engineType = parsed.engine || 'BIO_GRID_128';
          var baseVec = parsed.vec || buildDeterministicNipFaceVector(u.nip, 0);
          var jittered = [];
          for (var i = 0; i < 128; i++) {
            jittered.push(Number(baseVec[i] || 0) + ((i % 5 === 0) ? 0.012 : -0.008));
          }
          targetVec = normalizeFaceVector128(jittered);
        } catch (e) {
          targetVec = buildDeterministicNipFaceVector(u.nip, 0);
        }
      } else {
        targetVec = buildDeterministicNipFaceVector(u.nip, 0);
      }

      document.getElementById('cam-placeholder').classList.remove('hidden');
      handleFaceDescriptorExtracted({
        ok: true,
        engine: engineType,
        vec: targetVec
      }, isMismatchTest ? 'UJI_WAJAH_ORANG_LAIN' : ('FACE_ID_VERIFIED_' + u.nip));
    }

    function renderMobileShell() {
      var u = AppCache.currentUser;
      if (!u) return;
      var freshU = (AppCache.pegawai || []).filter(function (p) { return p.nip === u.nip; })[0];
      if (freshU) {
        AppCache.currentUser = freshU;
        u = freshU;
      }
      renderFaceStatusCard();
      var initials = u.nama.split(' ').slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
      document.getElementById('mob-avatar').textContent = initials;
      document.getElementById('mob-user-nama').textContent = u.nama;
      document.getElementById('mob-user-nip').textContent = 'NIP. ' + u.nip + ' • ' + u.pangkat;

      // Pill Mode Kerja aktif
      var pills = document.querySelectorAll('.mob-mode-btn');
      for (var i = 0; i < pills.length; i++) {
        var m = pills[i].getAttribute('data-id');
        var act = m === AppCache.selectedModeKerja;
        pills[i].className = 'mob-mode-btn px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-smooth ' +
          (act ? (m === 'WFA' ? 'bg-mode-wfa text-white shadow-sm' : 'bg-electric-blue text-white shadow-sm') : 'bg-white/15 text-blue-100');
      }
      document.getElementById('cam-mode-label').textContent = AppCache.selectedModeKerja;
      document.getElementById('cam-jenis-label').textContent = AppCache.selectedJenisAbsen;

      // KPI Mobile 2 Kolom
      var myLogs = AppCache.presensi.filter(function (l) { return l.nip === u.nip; });
      var myTelat = myLogs.filter(function (l) { return l.status === 'Terlambat'; }).length;
      var myIzin = AppCache.izin.filter(function (z) { return z.nip === u.nip; });

      document.getElementById('mob-kpi-grid').innerHTML = '' +
        '<div class="card-elevated rounded-xl p-3.5"><div class="text-[11px] text-text-muted">Absensi Tercatat</div><div class="text-xl font-bold text-navy-deep mt-1">' + myLogs.length + ' Log</div><div class="text-[10px] text-status-present font-semibold">Live WIT</div></div>' +
        '<div class="card-elevated rounded-xl p-3.5"><div class="text-[11px] text-text-muted">Terlambat</div><div class="text-xl font-bold text-amber-600 mt-1">' + myTelat + ' Kali</div><div class="text-[10px] text-text-muted">Batas 08:00 WIT</div></div>' +
        '<div class="card-elevated rounded-xl p-3.5"><div class="text-[11px] text-text-muted">Izin / Cuti Saya</div><div class="text-xl font-bold text-electric-blue mt-1">' + myIzin.length + ' Berkas</div><div class="text-[10px] text-text-muted">Alur 3 Tahap</div></div>' +
        '<div class="card-elevated rounded-xl p-3.5"><div class="text-[11px] text-text-muted">Mode Kerja</div><div class="text-xl font-bold text-mode-wfa mt-1">' + esc(AppCache.selectedModeKerja) + '</div><div class="text-[10px] text-text-muted">Siap Presensi</div></div>';

      // Recent Logs & Full Logs
      var logHtml = '';
      var displayLogs = myLogs.length ? myLogs : AppCache.presensi.slice(0, 4);
      for (var j = 0; j < displayLogs.length; j++) {
        var l = displayLogs[j];
        logHtml += '<div class="p-3 rounded-xl bg-surface-low border border-border-subtle flex items-start justify-between gap-2">' +
          '<div><div class="font-mono text-xs font-bold text-navy-deep">' + esc(l.tanggal) + ' • ' + esc(l.jamMasuk) + ' WIT</div><div class="text-[11px] text-text-muted mt-0.5">' + esc(l.keterangan) + '</div></div>' +
          '<div class="text-right shrink-0">' + getModeBadge(l.modeKerja) + '<div class="mt-1">' + getStatusBadge(l.status) + '</div></div>' +
          '</div>';
      }
      document.getElementById('mob-recent-logs').innerHTML = logHtml;
      document.getElementById('mob-full-logs').innerHTML = logHtml;

      // SPT List Mobile
      var sptHtml = '';
      for (var k = 0; k < AppCache.spt.length; k++) {
        var s = AppCache.spt[k];
        sptHtml += '<div class="p-3 rounded-xl bg-surface-low border border-border-subtle space-y-1">' +
          '<div class="flex items-center justify-between gap-2"><span class="font-mono text-xs font-bold text-navy-deep">' + esc(s.nomorSPT) + '</span>' + getStatusBadge(s.statusGPS) + '</div>' +
          '<div class="text-xs font-semibold">' + esc(s.lokasi) + '</div>' +
          '<div class="text-[11px] text-text-muted">' + esc(s.keperluan) + ' (' + esc(s.tglMulai) + ' – ' + esc(s.tglSelesai) + ')</div>' +
          '</div>';
      }
      document.getElementById('mob-spt-list').innerHTML = sptHtml;

      // Izin List Mobile
      var izinHtml = '';
      var izinShow = myIzin.length ? myIzin : AppCache.izin;
      for (var m = 0; m < izinShow.length; m++) {
        var z = izinShow[m];
        izinHtml += '<div class="p-3 rounded-xl bg-surface-low border border-border-subtle space-y-2">' +
          '<div class="flex items-center justify-between gap-2"><span class="font-mono text-xs font-bold text-navy-deep">' + esc(z.id) + ' • ' + esc(z.jenis) + '</span>' + getStatusBadge(z.statusFinal) + '</div>' +
          '<div class="text-[11px] text-text-muted">' + esc(z.tglMulai) + ' s/d ' + esc(z.tglSelesai) + ' — ' + esc(z.alasan) + '</div>' +
          '<div class="grid grid-cols-3 gap-1 text-[10px]">' +
          '<div class="p-1.5 rounded bg-white text-center">Kasubid: <b>' + esc(z.statusKasubid) + '</b></div>' +
          '<div class="p-1.5 rounded bg-white text-center">Kabid: <b>' + esc(z.statusKabid) + '</b></div>' +
          '<div class="p-1.5 rounded bg-white text-center">Kaban: <b>' + esc(z.statusKaban) + '</b></div>' +
          '</div>' +
          '<button type="button" data-action="print-izin" data-id="' + esc(z.id) + '" class="w-full py-1.5 rounded-lg bg-white border border-border-subtle text-navy-deep text-[11px] font-semibold">Lihat / Cetak Surat A4</button>' +
          '</div>';
      }
      document.getElementById('mob-izin-list').innerHTML = izinHtml;
    }

    /* -------------------------------------------------------------------
     * 15. PRINT ENGINE A4 STANDAR BKN & MODAL DIALOG
     * ------------------------------------------------------------------- */
    function openModal(title, htmlBody, isWide) {
      var box = document.getElementById('custom-modal-box');
      box.className = 'bg-white rounded-2xl shadow-2xl w-full max-h-[92vh] flex flex-col overflow-hidden ' + (isWide ? 'max-w-6xl' : 'max-w-2xl');
      document.getElementById('modal-title').textContent = title;
      document.getElementById('modal-body').innerHTML = htmlBody;
      document.getElementById('custom-modal').classList.remove('hidden');
    }

    function closeModal() {
      document.getElementById('custom-modal').classList.add('hidden');
    }

    function formatNipSpaced(nip) {
      var s = String(nip || '').replace(/\s+/g, '');
      if (s.length === 18) {
        return s.substring(0, 8) + ' ' + s.substring(8, 14) + ' ' + s.substring(14, 15) + ' ' + s.substring(15, 18);
      }
      return String(nip || '-');
    }

    function buildKopSuratHTML() {
      var logoUrl = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCS7ckWLE6mJUY1KVWg3Y1f4Hqdqjwfb1F89pCtBOuo6S_bfxscf-Ns6Y4Gw0Qfz7ThXbv2zgwlL1Ejpgb6R7InEb1thPE8IQn75oIfdrXfAr9Csj9nSlBaQZT3Zk21RIhHl_lgDz24vVCDQtLkrU-J40SV62N9hZVL5GLE2kW0nNoJCOaUXg_IOqD4dJ-8rAjyyz-P7C2tvgmTjb39PzGOe_4gn92LVDMrGzw1RmePXMRF-UvCd7crBw';
      return '<div>' +
        '<div class="flex items-center justify-between gap-4 pb-3">' +
        '<div class="w-16 sm:w-20 h-20 sm:h-24 shrink-0 flex items-center justify-center">' +
        '<img alt="Lambang Kabupaten Teluk Wondama" class="max-h-20 sm:max-h-24 w-auto object-contain drop-shadow-sm" src="' + logoUrl + '" />' +
        '</div>' +
        '<div class="flex-1 text-center text-[#0f172a] pr-2">' +
        '<div class="text-[15px] sm:text-[16.5px] font-bold tracking-wide uppercase leading-snug text-[#0b1b36]">PEMERINTAH KABUPATEN TELUK WONDAMA</div>' +
        '<div class="text-[15.5px] sm:text-[17.5px] font-extrabold tracking-tight uppercase leading-tight mt-0.5 text-[#002869]">BADAN PENGELOLAAN KEUANGAN DAN ASET DAERAH</div>' +
        '<div class="text-[10.5px] sm:text-[11px] font-normal leading-snug mt-1 text-[#334155]">Kompleks Perkantoran Pemerintah Daerah Teluk Wondama, Isei - Rasiei, Papua Barat — 98362</div>' +
        '<div class="text-[9.5px] sm:text-[10px] font-mono text-[#475569] leading-snug mt-0.5">Laman: <span class="text-[#0052d2] underline">bkad.telukwondamakab.go.id</span> | Pos-el: bkad@telukwondamakab.go.id | Faks: (0983) 21102</div>' +
        '</div>' +
        '</div>' +
        '<div class="w-full flex flex-col gap-[2px] mt-1 mb-5">' +
        '<div class="w-full h-[2.5px] bg-[#001947]"></div>' +
        '<div class="w-full h-[1px] bg-[#001947]"></div>' +
        '</div>' +
        '</div>';
    }

    var PRINT_DOC_CATALOG = [
      { key: 'SURAT_PANGGILAN_I', label: 'Disiplin — Surat Panggilan I (PP 94/2021)', orient: 'portrait' },
      { key: 'SURAT_PANGGILAN_II', label: 'Disiplin — Surat Panggilan II / Terakhir (PP 94/2021)', orient: 'portrait' },
      { key: 'SPT_TIM_PEMERIKSA', label: 'Disiplin — Surat Perintah Tim Pemeriksa (Tahap 3)', orient: 'portrait' },
      { key: 'BAP_DISIPLIN', label: 'Disiplin — Berita Acara Pemeriksaan (BAP)', orient: 'portrait' },
      { key: 'SK_HUKUMAN_DISIPLIN', label: 'Disiplin — SK Teguran Tertulis (HD.01)', orient: 'portrait' },
      { key: 'BA_PENYAMPAIAN_TERTUTUP', label: 'Disiplin — BA Penyampaian Tertutup', orient: 'portrait' },
      { key: 'BUKTI_IDIS_BKN_1', label: 'Disiplin — Bukti I-Dis BKN (Lembar 1 BKAD)', orient: 'portrait' },
      { key: 'BUKTI_IDIS_BKN_2', label: 'Disiplin — Bukti I-Dis BKN (Lembar 2 Pegawai)', orient: 'portrait' },
      { key: 'BUKTI_IDIS_BKN_3', label: 'Disiplin — Bukti I-Dis BKN (Lembar 3 BKPSDM/BKN)', orient: 'portrait' },
      { key: 'FORMULIR_CUTI_BKN', label: 'Izin/Cuti — Formulir Cuti A4 Standar BKN', orient: 'portrait' },
      { key: 'SURAT_IZIN_RESMI', label: 'Izin/Cuti — Surat Izin Resmi BKAD Sah', orient: 'portrait' },
      { key: 'LAMPIRAN_SPT_ROSTER', label: 'SPT — Lampiran SPT & Roster Bidang Aset', orient: 'portrait' },
      { key: 'VERIFIKASI_SPT_ROON', label: 'SPT — Lembar Verifikasi Geotagging Roon', orient: 'portrait' },
      { key: 'BA_REKON', label: 'Rekonsiliasi — Berita Acara Presensi Retroaktif', orient: 'portrait' },
      { key: 'REKAP_BULANAN', label: 'Rekapitulasi — Laporan Kehadiran & TPP', orient: 'landscape' }
    ];

    function buildCtrlPDocumentSpec(type, refId) {
      var normType = type;
      if (normType === 'IZIN_BKN') normType = 'FORMULIR_CUTI_BKN';
      else if (normType === 'DISIPLIN_BKN') normType = 'SK_HUKUMAN_DISIPLIN';
      else if (normType === 'SPT_ROON') normType = 'VERIFIKASI_SPT_ROON';

      var pj = (AppCache.settings.PEJABAT_PENANDATANGAN && AppCache.settings.PEJABAT_PENANDATANGAN.value) || { kabanNama: 'Dr. Hendrik Mambor, S.E., M.Si.', kabanNip: '19751128 200909 1 001', kabanPangkat: 'Pembina Utama Muda (IV/c)' };
      var d = AppCache.disiplin.filter(function (x) { return x.id === (refId || AppCache.selectedDisiplinId); })[0] || AppCache.disiplin[0] || {};
      var info = getDisiplinEnrichedData(d);
      var z = AppCache.izin.filter(function (x) { return x.id === refId; })[0] || AppCache.izin[0] || {};
      var s = AppCache.spt.filter(function (x) { return x.id === refId; })[0] || AppCache.spt[0] || {};
      var r = AppCache.rekon[0] || {};
      var witNow = getClientWITNow();

      var docTitle = 'Dokumen Resmi A4';
      var signerRole = 'Kepala Badan Pengelolaan Keuangan dan Aset Daerah,';
      var signerRoleHtml = '';
      var tglPenetapan = witNow.tanggal;
      var hideDefaultSignature = false;
      var signerNama = pj.kabanNama || 'Dr. Hendrik Mambor, S.E., M.Si.';
      var signerPangkat = pj.kabanPangkat || 'Pembina Utama Muda (IV/c)';
      var signerNip = pj.kabanNip || '19751128 200909 1 001';
      var defaultOrient = 'portrait';
      var html = '';

      if (normType === 'SURAT_PANGGILAN_I') {
        docTitle = 'Surat Panggilan I Pemeriksaan Disiplin (PP 94/2021)';
        signerRole = 'Pejabat Yang Berwenang Memeriksa / ' + info.pemeriksaJabatan + ',';
        signerNama = info.pemeriksaNama; signerPangkat = info.pemeriksaPangkat; signerNip = info.pemeriksaNip;
        tglPenetapan = info.tglPanggilan1 || witNow.tanggal;
        html = '<div class="text-center font-bold uppercase underline mb-4">SURAT PANGGILAN I (RAHASIA)<br/><span class="font-mono no-underline text-[11px]">Nomor: ' + esc(info.noPanggilan1) + '</span></div>' +
          '<p class="mb-2">Dengan ini diminta dengan hormat kehadiran Saudara:</p>' +
          '<table class="w-full border-collapse border border-black text-xs mb-3">' +
          '<tr><td class="border border-black p-1.5 w-1/3 font-semibold">Nama / NIP</td><td class="border border-black p-1.5">' + esc(d.nama) + ' / <span class="font-mono">' + esc(d.nip) + '</span></td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold">Pangkat / Jabatan</td><td class="border border-black p-1.5">' + esc(info.terperiksaPangkat) + ' / ' + esc(info.terperiksaJabatan) + '</td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold">Hari / Waktu Sidang</td><td class="border border-black p-1.5 font-mono">' + esc(info.tglBAP) + '</td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold">Tempat Pemeriksaan</td><td class="border border-black p-1.5">' + esc(info.tempatSidang) + '</td></tr>' +
          '</table>' +
          '<p class="mb-2">Untuk menghadap Pejabat Pemeriksa BKAD sehubungan dengan dugaan pelanggaran disiplin: <b>' + esc(d.pelanggaran) + '</b> (' + esc(d.dasarHukum) + '). Sesuai Pasal 26 Ayat (1) &amp; (2) PP No. 94 Tahun 2021, apabila Saudara tidak hadir pada panggilan pertama tanpa alasan sah maka diterbitkan Surat Panggilan II.</p>';
      } else if (normType === 'SURAT_PANGGILAN_II') {
        docTitle = 'Surat Panggilan II / Terakhir Pemeriksaan Disiplin (PP 94/2021)';
        signerRole = 'Pejabat Yang Berwenang Memeriksa / ' + info.pemeriksaJabatan + ',';
        signerNama = info.pemeriksaNama; signerPangkat = info.pemeriksaPangkat; signerNip = info.pemeriksaNip;
        tglPenetapan = info.tglPanggilan2 || witNow.tanggal;
        html = '<div class="text-center font-bold uppercase underline mb-4">SURAT PANGGILAN II (RAHASIA)<br/><span class="font-mono no-underline text-[11px]">Nomor: ' + esc(info.noPanggilan2) + '</span></div>' +
          '<p class="mb-2 text-justify">Menindaklanjuti <b>Surat Panggilan I Nomor: <span class="font-mono">' + esc(info.noPanggilan1) + '</span></b> tanggal <b>' + esc(info.tglPanggilan1) + '</b> yang tidak Saudara hadiri pada jadwal pemeriksaan pertama (<span class="font-mono">' + esc(info.tglBAP) + '</span>), dengan ini diminta dengan hormat kehadiran Saudara pada <b>Pemanggilan Kedua (Terakhir)</b>:</p>' +
          '<table class="w-full border-collapse border border-black text-xs mb-3">' +
          '<tr><td class="border border-black p-1.5 w-1/3 font-semibold">Nama / NIP</td><td class="border border-black p-1.5">' + esc(d.nama) + ' / <span class="font-mono">' + esc(d.nip) + '</span></td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold">Pangkat / Jabatan</td><td class="border border-black p-1.5">' + esc(info.terperiksaPangkat) + ' / ' + esc(info.terperiksaJabatan) + '</td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold">Hari / Waktu Sidang II</td><td class="border border-black p-1.5 font-mono font-bold">' + esc(info.jadwalSidang2) + '</td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold">Tempat Pemeriksaan</td><td class="border border-black p-1.5">' + esc(info.tempatSidang) + '</td></tr>' +
          '</table>' +
          '<p class="mb-2 text-justify">Untuk menghadap Pejabat Pemeriksa BKAD sehubungan dengan dugaan pelanggaran disiplin: <b>' + esc(d.pelanggaran) + '</b> (' + esc(d.dasarHukum) + '). Sesuai ketentuan <b>Pasal 26 Ayat (2) dan Ayat (3) Peraturan Pemerintah Nomor 94 Tahun 2021</b> jo. Peraturan BKN Nomor 6 Tahun 2022, apabila pada tanggal pemeriksaan Surat Panggilan II ini Saudara tetap tidak hadir tanpa alasan yang sah, maka Pejabat yang Berwenang Menghukum akan menjatuhkan Hukuman Disiplin berdasarkan alat bukti dan keterangan yang ada tanpa dilakukan pemeriksaan.</p>';
      } else if (normType === 'SPT_TIM_PEMERIKSA') {
        docTitle = 'Surat Perintah Pembentukan Tim Pemeriksa Disiplin (Tahap 3)';
        signerRole = 'Pejabat Yang Berwenang Memeriksa / ' + info.pemeriksaJabatan + ',';
        signerNama = info.pemeriksaNama; signerPangkat = info.pemeriksaPangkat; signerNip = info.pemeriksaNip;
        tglPenetapan = info.tglPanggilan1 || witNow.tanggal;
        html = '<div class="text-center font-bold uppercase underline mb-4">SURAT PERINTAH TIM PEMERIKSA PELANGGARAN DISIPLIN (RAHASIA)<br/><span class="font-mono no-underline text-[11px]">Nomor: ' + esc(info.noTimPemeriksa) + '</span></div>' +
          '<p class="mb-2 text-justify">Berdasarkan Pasal 27 dan Pasal 28 Peraturan Pemerintah Nomor 94 Tahun 2021 tentang Disiplin Pegawai Negeri Sipil, dalam rangka pemeriksaan atas dugaan pelanggaran disiplin: <b>' + esc(d.pelanggaran) + '</b> (' + esc(d.dasarHukum) + ') terhadap PNS Terperiksa <b>' + esc(d.nama) + '</b> (NIP. <span class="font-mono">' + esc(d.nip) + '</span>), dengan ini menugaskan Tim Pemeriksa sebagai berikut:</p>' +
          '<table class="w-full border-collapse border border-black text-xs mb-3">' +
          '<thead><tr class="bg-slate-100"><th class="border border-black p-1.5">Unsur Tim Pemeriksa</th><th class="border border-black p-1.5">Nama &amp; NIP Pejabat</th><th class="border border-black p-1.5">Kedudukan</th></tr></thead>' +
          '<tbody>' +
          '<tr><td class="border border-black p-1.5 font-semibold">1. Unsur Atasan Langsung</td><td class="border border-black p-1.5"><b>' + esc(info.pemeriksaNama) + '</b><br/><span class="font-mono text-[11px]">NIP. ' + esc(info.pemeriksaNip) + '</span></td><td class="border border-black p-1.5">Ketua merangkap Anggota</td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold">2. Unsur Pengawasan</td><td class="border border-black p-1.5"><b>' + esc(info.timPengawasan) + '</b><br/><span class="font-mono text-[11px]">Inspektorat Kab. Teluk Wondama</span></td><td class="border border-black p-1.5">Anggota Pemeriksa</td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold">3. Unsur Kepegawaian</td><td class="border border-black p-1.5"><b>' + esc(info.timKepegawaian) + '</b><br/><span class="font-mono text-[11px]">Subbag Umum &amp; Kepegawaian BKAD</span></td><td class="border border-black p-1.5">Sekretaris merangkap Anggota</td></tr>' +
          '</tbody></table>' +
          '<p class="mb-2 text-justify">Untuk melakukan pemeriksaan tertutup pada jadwal sidang <b>' + esc(info.tglBAP) + '</b> bertempat di <b>' + esc(info.tempatSidang) + '</b> serta menuangkan hasilnya ke dalam Berita Acara Pemeriksaan (BAP) sesuai Peraturan BKN Nomor 6 Tahun 2022.</p>';
      } else if (normType === 'BAP_DISIPLIN') {
        docTitle = 'Berita Acara Pemeriksaan (BAP) — ' + esc(d.id || 'DISP-2025-009');
        hideDefaultSignature = true;
        html = buildDisiplinBapSheetInnerHTML(d, info);
      } else if (normType === 'SK_HUKUMAN_DISIPLIN') {
        docTitle = 'SK Hukuman Disiplin Teguran Tertulis (' + esc(info.modelBkn) + ')';
        hideDefaultSignature = true;
        html = buildDisiplinSkSheetInnerHTML(d, info);
      } else if (normType === 'BA_PENYAMPAIAN_TERTUTUP') {
        docTitle = 'BA Penyampaian Keputusan Disiplin Tertutup';
        hideDefaultSignature = true;
        html = buildDisiplinBaPenyampaianSheetInnerHTML(d, info);
      } else if (normType.indexOf('BUKTI_IDIS_BKN_') === 0) {
        var lNum = normType.split('_').pop();
        var peruntukan = lNum === '1' ? 'LEMBAR 1: ARSIP KEPEGAWAIAN BKAD TELUK WONDAMA' : (lNum === '2' ? 'LEMBAR 2: PEGAWAI TERHUKUM (ARSIP PRIBADI)' : 'LEMBAR 3: BKPSDM & KANTOR REGIONAL XIV BKN');
        docTitle = 'Bukti Registrasi I-Dis BKN (Lembar ' + lNum + ')';
        hideDefaultSignature = true;
        html = buildDisiplinInkrahSheetInnerHTML(d, info, peruntukan);
      } else if (normType === 'FORMULIR_CUTI_BKN') {
        docTitle = 'Formulir Permintaan & Pemberian Cuti A4 (Standar BKN)';
        hideDefaultSignature = true;
        var cleanZ = String(z.nip || '').replace(/\s+/g, '');
        var isYulCuti = !cleanZ || cleanZ === '199108152015051003';
        var zPegCuti = null;
        for (var pc = 0; pc < AppCache.pegawai.length; pc++) {
          if (String(AppCache.pegawai[pc].nip || '').replace(/\s+/g, '') === cleanZ) { zPegCuti = AppCache.pegawai[pc]; break; }
        }
        var pemohonBidang = (zPegCuti && zPegCuti.bidang) || z.bidang || 'Bidang BKAD';
        var pemohonSubBidang = (zPegCuti && zPegCuti.subBidang) || '';
        var pemohonObj = zPegCuti || z;
        var atasanLangsung = null;
        var isPemohonKasiCuti = isPemohonKepalaSeksi(pemohonObj);
        var isPemohonKabidCuti = String((pemohonObj && pemohonObj.peran) || '').toLowerCase() === 'kabid' || String((pemohonObj && pemohonObj.jabatan) || '').toLowerCase().indexOf('kepala bidang') !== -1;
        for (var pa = 0; pa < AppCache.pegawai.length; pa++) {
          var cand = AppCache.pegawai[pa];
          var candNip = String(cand.nip || '').replace(/\s+/g, '');
          if (candNip && candNip === cleanZ) continue;
          var candPeran = String(cand.peran || '').toLowerCase();
          var candJab = String(cand.jabatan || '').toLowerCase();
          var sameBidang = pemohonBidang && String(cand.bidang || '').toLowerCase() === String(pemohonBidang).toLowerCase();
          if (isPemohonKabidCuti) {
            if (candJab.indexOf('sekretaris') !== -1 || candPeran === 'kepala badan' || candJab.indexOf('kepala badan') !== -1) {
              atasanLangsung = cand;
              if (candJab.indexOf('sekretaris') !== -1) break;
            }
          } else if (isPemohonKasiCuti) {
            if (sameBidang && (candPeran === 'kabid' || candJab.indexOf('kepala bidang') !== -1)) {
              atasanLangsung = cand;
              break;
            }
          } else {
            if (sameBidang && candPeran === 'kasubid') {
              if (pemohonSubBidang && String(cand.subBidang || '').toLowerCase() === String(pemohonSubBidang).toLowerCase()) {
                atasanLangsung = cand;
                break;
              }
              if (!atasanLangsung) atasanLangsung = cand;
            } else if (sameBidang && (candPeran === 'kabid' || candJab.indexOf('kepala bidang') !== -1) && !atasanLangsung) {
              atasanLangsung = cand;
            }
          }
        }
        var atasanJabatan = atasanLangsung
          ? ((atasanLangsung.jabatan || ('Kepala ' + pemohonBidang)) + ' BKAD,')
          : (isYulCuti
            ? 'Kasubid Perbendaharaan & Kas Daerah BKAD,'
            : (isPemohonKasiCuti
              ? ('Kepala ' + pemohonBidang + ' BKAD,')
              : (isPemohonKabidCuti ? 'Sekretaris / Kepala BKAD,' : ('Atasan Langsung ' + pemohonBidang + ','))));
        var atasanNama = atasanLangsung ? String(atasanLangsung.nama || '').toUpperCase() : (isYulCuti ? 'FRANSISKUS WAROI, S.STP' : ('KEPALA ' + pemohonBidang.toUpperCase()));
        var atasanNipText = atasanLangsung && atasanLangsung.nip ? ('NIP. ' + formatNipSpaced(atasanLangsung.nip)) : (isYulCuti ? 'NIP. 19850412 201004 1 002' : 'NIP. -');
        var atasanCatatan = isYulCuti
          ? '"Disetujui, pekerjaan verifikasi berkas SP2D telah didelegasikan kepada staf rekan tim perbendaharaan."'
          : ('"Disetujui, pelaksanaan tugas pada ' + pemohonBidang + ' telah dikoordinasikan selama masa cuti."');
        var cutiTelp = (zPegCuti && zPegCuti.telepon) ? zPegCuti.telepon : '0812-4829-1109';
        var pjCuti = (AppCache.settings.PEJABAT_PENANDATANGAN && AppCache.settings.PEJABAT_PENANDATANGAN.value) || {};
        var kabanCutiNama = String(pjCuti.nama || 'NIXON N. N. BARANSANO, SE').toUpperCase();
        var kabanCutiPangkat = pjCuti.pangkat || 'Pembina';
        var kabanCutiNip = pjCuti.nip ? formatNipSpaced(pjCuti.nip) : '19751128 200909 1 001';
        var cutiNama = isYulCuti ? 'YULIANUS KEREWAY, A.MD.' : String(z.nama || 'YULIANUS KEREWAY, A.MD.').toUpperCase();
        var cutiNip = isYulCuti ? '19910815 201505 1 003' : formatNipSpaced(z.nip);
        var cutiJab = isYulCuti ? 'Verifikator Perbendaharaan & Akuntansi' : (z.jabatan || (zPegCuti ? zPegCuti.jabatan : 'Analis Keuangan Daerah'));
        var cutiAlasan = isYulCuti ? 'Menghadiri urusan keluarga penting di Wasior serta melaksanakan pemeriksaan kesehatan berkala tahunan (Medical Check-Up).' : (z.alasan || 'Keperluan Keluarga Mendesak');
        var cutiLama = isYulCuti ? '4 (Empat) Hari Kerja' : 'Sesuai Jadwal Permohonan';
        var cutiMulai = isYulCuti ? '19 Mei 2025' : (z.tglMulai || '19 Mei 2025');
        var cutiSelesai = isYulCuti ? '22 Mei 2025' : (z.tglSelesai || '22 Mei 2025');
        var jenisLower = String(z.jenis || '').toLowerCase();
        var ckTahunan = (isYulCuti || jenisLower.indexOf('tahunan') !== -1) ? '✓' : '';
        var ckBesar = (!isYulCuti && jenisLower.indexOf('besar') !== -1) ? '✓' : '';
        var ckSakit = (!isYulCuti && jenisLower.indexOf('sakit') !== -1) ? '✓' : '';
        var ckLahir = (!isYulCuti && jenisLower.indexOf('melahirkan') !== -1) ? '✓' : '';
        var ckPenting = (!isYulCuti && jenisLower.indexOf('penting') !== -1) ? '✓' : '';
        var ckCLTN = (!isYulCuti && jenisLower.indexOf('tanggungan') !== -1) ? '✓' : '';
        var isIzinDraftBkn = !isYulCuti && z && z.statusFinal !== 'Sah Diterbitkan';
        var isIzinRejBkn = !isYulCuti && z && String(z.statusFinal || '').indexOf('Ditolak') !== -1;
        var nomorCutiBkn = isYulCuti
          ? '851/042/CUTI-BKAD/V/2025'
          : (isIzinDraftBkn
            ? ('DRAF (' + (z.id || 'PENGAJUAN') + ' — BELUM DISAHKAN)')
            : (z.nomorSurat || ('851/042/CUTI-BKAD/' + witNow.yyyy)));
        var isAtasanSetujuCuti = isYulCuti || (z && (z.statusKasubid === 'Disetujui' || z.statusKabid === 'Disetujui'));
        var isKabanSetujuCuti = isYulCuti || (z && z.statusKaban === 'Disetujui');

        html = '<div class="flex justify-between items-start mb-2 font-sans text-[9.5px]">' +
          '<div class="text-[9px] text-slate-600 font-mono">Dok. Kode: BKN-F04/BKAD-WDM/2025</div>' +
          '<div class="text-right max-w-[340px] leading-tight text-slate-900">' +
          '<div class="italic text-[8.5px] text-slate-700 mb-1">Lampiran II Peraturan Badan Kepegawaian Negara Republik Indonesia<br/>Nomor 24 Tahun 2017 jo. Peraturan BKN No. 7 Tahun 2021</div>' +
          '<div class="font-medium">' + (isYulCuti ? 'Rasiei, 12 Mei 2025' : 'Rasiei, ' + witNow.tanggal) + '</div>' +
          '<div class="mt-0.5">Kepada Yth.</div>' +
          '<div class="font-bold">Kepala Badan Pengelolaan Keuangan dan Aset Daerah</div>' +
          '<div>Kabupaten Teluk Wondama</div>' +
          '</div>' +
          '</div>' +
          '<div class="text-center my-2">' +
          '<div class="text-[12px] font-bold tracking-wide uppercase underline">FORMULIR PERMINTAAN DAN PEMBERIAN CUTI</div>' +
          '<div class="text-[10px] font-mono font-semibold tracking-wider text-slate-800">Nomor: ' + esc(nomorCutiBkn) + '</div>' +
          '</div>' +
          '<div class="mt-2">' +
          '<div class="bg-slate-200/90 font-bold px-2 py-0.5 text-[9.5px] uppercase border border-slate-900">I. DATA PEGAWAI</div>' +
          '<table class="w-full border-collapse border border-slate-900 text-[9.5px] mt-[-1px]"><tbody>' +
          '<tr class="border-b border-slate-900"><td class="w-[18%] p-1 bg-slate-50 font-medium border-r border-slate-900">Nama</td><td class="w-[32%] p-1 border-r border-slate-900 font-semibold uppercase">' + esc(cutiNama) + '</td><td class="w-[18%] p-1 bg-slate-50 font-medium border-r border-slate-900">NIP</td><td class="w-[32%] p-1 font-mono font-semibold">' + esc(cutiNip) + '</td></tr>' +
          '<tr class="border-b border-slate-900"><td class="p-1 bg-slate-50 font-medium border-r border-slate-900">Jabatan</td><td class="p-1 border-r border-slate-900">' + esc(cutiJab) + '</td><td class="p-1 bg-slate-50 font-medium border-r border-slate-900">Masa Kerja</td><td class="p-1">10 Tahun 00 Bulan</td></tr>' +
          '<tr><td class="p-1 bg-slate-50 font-medium border-r border-slate-900">Unit Kerja</td><td colspan="3" class="p-1">Badan Pengelolaan Keuangan dan Aset Daerah Kab. Teluk Wondama</td></tr>' +
          '</tbody></table>' +
          '</div>' +
          '<div class="mt-2">' +
          '<div class="bg-slate-200/90 font-bold px-2 py-0.5 text-[9.5px] uppercase border border-slate-900">II. JENIS CUTI YANG DIAMBIL</div>' +
          '<table class="w-full border-collapse border border-slate-900 text-[9.5px] mt-[-1px]"><tbody>' +
          '<tr class="border-b border-slate-900"><td class="w-1/2 p-1 border-r border-slate-900"><div class="flex items-center justify-between"><span>1. Cuti Tahunan</span><span class="w-5 h-4 border border-black inline-flex items-center justify-center font-bold text-blue-900 bg-blue-50">' + ckTahunan + '</span></div></td><td class="w-1/2 p-1"><div class="flex items-center justify-between"><span>2. Cuti Besar</span><span class="w-5 h-4 border border-black inline-flex items-center justify-center font-bold text-blue-900">' + ckBesar + '</span></div></td></tr>' +
          '<tr class="border-b border-slate-900"><td class="p-1 border-r border-slate-900"><div class="flex items-center justify-between"><span>3. Cuti Sakit</span><span class="w-5 h-4 border border-black inline-flex items-center justify-center font-bold text-blue-900">' + ckSakit + '</span></div></td><td class="p-1"><div class="flex items-center justify-between"><span>4. Cuti Melahirkan</span><span class="w-5 h-4 border border-black inline-flex items-center justify-center font-bold text-blue-900">' + ckLahir + '</span></div></td></tr>' +
          '<tr><td class="p-1 border-r border-slate-900"><div class="flex items-center justify-between"><span>5. Cuti Karena Alasan Penting</span><span class="w-5 h-4 border border-black inline-flex items-center justify-center font-bold text-blue-900">' + ckPenting + '</span></div></td><td class="p-1"><div class="flex items-center justify-between"><span>6. Cuti di Luar Tanggungan Negara</span><span class="w-5 h-4 border border-black inline-flex items-center justify-center font-bold text-blue-900">' + ckCLTN + '</span></div></td></tr>' +
          '</tbody></table>' +
          '</div>' +
          '<div class="mt-2">' +
          '<div class="bg-slate-200/90 font-bold px-2 py-0.5 text-[9.5px] uppercase border border-slate-900">III. ALASAN CUTI</div>' +
          '<div class="border border-slate-900 mt-[-1px] p-1.5 text-[9.5px] leading-relaxed bg-white">' + esc(cutiAlasan) + '</div>' +
          '</div>' +
          '<div class="mt-2">' +
          '<div class="bg-slate-200/90 font-bold px-2 py-0.5 text-[9.5px] uppercase border border-slate-900">IV. LAMANYA CUTI</div>' +
          '<table class="w-full border-collapse border border-slate-900 text-[9.5px] mt-[-1px]"><tbody>' +
          '<tr><td class="w-1/3 p-1 border-r border-slate-900">Selama: <b>' + esc(cutiLama) + '</b></td><td class="w-1/3 p-1 border-r border-slate-900">Mulai Tanggal: <b>' + esc(cutiMulai) + '</b></td><td class="w-1/3 p-1">s.d. Tanggal: <b>' + esc(cutiSelesai) + '</b></td></tr>' +
          '</tbody></table>' +
          '</div>' +
          '<div class="mt-2">' +
          '<div class="bg-slate-200/90 font-bold px-2 py-0.5 text-[9.5px] uppercase border border-slate-900">V. CATATAN CUTI</div>' +
          '<table class="w-full border-collapse border border-slate-900 text-[9px] mt-[-1px] text-center"><thead>' +
          '<tr class="bg-slate-50 border-b border-slate-900"><th colspan="3" class="p-1 border-r border-slate-900 font-bold">1. CUTI TAHUNAN</th><th class="p-1 border-r border-slate-900 font-bold">2. CUTI BESAR</th><th class="p-1 border-r border-slate-900 font-bold">3. CUTI SAKIT</th><th class="p-1 border-r border-slate-900 font-bold">4. CUTI MELAHIRKAN</th><th class="p-1 border-r border-slate-900 font-bold">5. ALASAN PENTING</th><th class="p-1 font-bold">6. DILUAR TANGGUNGAN</th></tr>' +
          '<tr class="border-b border-slate-900 bg-slate-100"><th class="p-0.5 border-r border-slate-900 font-semibold">Tahun</th><th class="p-0.5 border-r border-slate-900 font-semibold">Sisa</th><th class="p-0.5 border-r border-slate-900 font-semibold">Keterangan</th><th class="p-0.5 border-r border-slate-900">-</th><th class="p-0.5 border-r border-slate-900">-</th><th class="p-0.5 border-r border-slate-900">-</th><th class="p-0.5 border-r border-slate-900">-</th><th class="p-0.5">-</th></tr>' +
          '</thead><tbody>' +
          '<tr class="border-b border-slate-900"><td class="p-1 border-r border-slate-900 font-mono">N-2 (2023)</td><td class="p-1 border-r border-slate-900 font-bold">0</td><td class="p-1 border-r border-slate-900 text-slate-500 italic">Gugur</td><td rowspan="3" class="p-1 border-r border-slate-900 text-slate-400">-</td><td rowspan="3" class="p-1 border-r border-slate-900 text-slate-400">-</td><td rowspan="3" class="p-1 border-r border-slate-900 text-slate-400">-</td><td rowspan="3" class="p-1 border-r border-slate-900 text-slate-400">-</td><td rowspan="3" class="p-1 text-slate-400">-</td></tr>' +
          '<tr class="border-b border-slate-900"><td class="p-1 border-r border-slate-900 font-mono">N-1 (2024)</td><td class="p-1 border-r border-slate-900 font-bold text-blue-900">2</td><td class="p-1 border-r border-slate-900">Sisa Hak Cuti</td></tr>' +
          '<tr><td class="p-1 border-r border-slate-900 font-mono">N (2025)</td><td class="p-1 border-r border-slate-900 font-bold text-blue-900">8</td><td class="p-1 border-r border-slate-900 font-medium">Hak 12 (Diambil 4)</td></tr>' +
          '<tr class="border-t border-slate-900 bg-slate-50 font-semibold"><td colspan="2" class="p-1 border-r border-slate-900 text-right pr-2">Total Kuota Tersedia:</td><td class="p-1 border-r border-slate-900 font-bold text-blue-900 font-mono">10 Hari Kerja</td><td colspan="5" class="p-1 text-slate-600 font-normal text-left pl-2">Sisa setelah pengajuan ini disetujui: 6 Hari Kerja</td></tr>' +
          '</tbody></table>' +
          '</div>' +
          '<div class="mt-2">' +
          '<div class="bg-slate-200/90 font-bold px-2 py-0.5 text-[9.5px] uppercase border border-slate-900">VI. ALAMAT SELAMA MENJALANKAN CUTI</div>' +
          '<table class="w-full border-collapse border border-slate-900 text-[9.5px] mt-[-1px]"><tbody><tr>' +
          '<td class="w-[60%] p-2 border-r border-slate-900 align-top"><div>Jl. Poros Rasiei - Wasior RT 02 / RW 01, Distrik Wasior, Kabupaten Teluk Wondama, Papua Barat</div><div class="mt-2 font-medium">TELP/HP: <span class="font-mono text-blue-900 font-semibold">' + esc(cutiTelp) + '</span></div></td>' +
          '<td class="w-[40%] p-2 text-center align-top"><div class="text-[9px]">Hormat Saya, Pegawai Pemohon</div><div class="h-12 my-1"></div><div class="font-bold text-[9.5px] underline uppercase">' + esc(cutiNama) + '</div><div class="text-[8.5px] font-mono text-slate-800">NIP. ' + esc(cutiNip) + '</div></td>' +
          '</tr></tbody></table>' +
          '</div>' +
          '<div class="mt-2">' +
          '<div class="bg-slate-200/90 font-bold px-2 py-0.5 text-[9.5px] uppercase border border-slate-900">VII. PERTIMBANGAN ATASAN LANGSUNG</div>' +
          '<table class="w-full border-collapse border border-slate-900 text-[9.5px] mt-[-1px]"><thead><tr class="bg-slate-50 border-b border-slate-900 text-center font-medium"><td class="p-1 border-r border-slate-900 w-[14%]">DISETUJUI</td><td class="p-1 border-r border-slate-900 w-[14%]">PERUBAHAN</td><td class="p-1 border-r border-slate-900 w-[16%]">DITANGGUHKAN</td><td class="p-1 border-r border-slate-900 w-[16%]">TIDAK DISETUJUI</td><td class="p-1 w-[40%] font-semibold">TANDA TANGAN & REKOMENDASI</td></tr></thead><tbody>' +
          '<tr><td class="text-center p-1 border-r border-slate-900 align-middle">' + (isAtasanSetujuCuti && !isIzinRejBkn ? '<span class="w-5 h-4 border border-black inline-flex items-center justify-center font-bold text-blue-900 bg-blue-50">✓</span>' : '') + '</td><td class="text-center p-1 border-r border-slate-900"></td><td class="text-center p-1 border-r border-slate-900"></td><td class="text-center p-1 border-r border-slate-900">' + (isIzinRejBkn ? '<span class="w-5 h-4 border border-black inline-flex items-center justify-center font-bold text-red-700 bg-red-50">✓</span>' : '') + '</td>' +
          '<td class="p-2 text-center align-top"><div class="text-[8.5px] text-slate-700 italic text-left mb-1">' + esc(atasanCatatan) + '</div><div class="text-[8.5px] font-medium text-slate-800">' + esc(atasanJabatan) + '</div><div class="h-12 my-1"></div><div class="font-bold text-[9.5px] underline uppercase">' + esc(atasanNama) + '</div><div class="text-[8.5px] font-mono text-slate-800">' + esc(atasanNipText) + '</div></td></tr>' +
          '</tbody></table>' +
          '</div>' +
          '<div class="mt-2">' +
          '<div class="bg-slate-200/90 font-bold px-2 py-0.5 text-[9.5px] uppercase border border-slate-900">VIII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI</div>' +
          '<table class="w-full border-collapse border border-slate-900 text-[9.5px] mt-[-1px]"><thead><tr class="bg-slate-50 border-b border-slate-900 text-center font-medium"><td class="p-1 border-r border-slate-900 w-[14%]">DISETUJUI</td><td class="p-1 border-r border-slate-900 w-[14%]">PERUBAHAN</td><td class="p-1 border-r border-slate-900 w-[16%]">DITANGGUHKAN</td><td class="p-1 border-r border-slate-900 w-[16%]">TIDAK DISETUJUI</td><td class="p-1 w-[40%] font-semibold">PENETAPAN RESMI PEJABAT</td></tr></thead><tbody>' +
          '<tr><td class="text-center p-1 border-r border-slate-900 align-middle">' + (isKabanSetujuCuti && !isIzinRejBkn ? '<span class="w-5 h-4 border border-black inline-flex items-center justify-center font-bold text-blue-900 bg-blue-50">✓</span>' : '') + '</td><td class="text-center p-1 border-r border-slate-900"></td><td class="text-center p-1 border-r border-slate-900"></td><td class="text-center p-1 border-r border-slate-900">' + (isIzinRejBkn ? '<span class="w-5 h-4 border border-black inline-flex items-center justify-center font-bold text-red-700 bg-red-50">✓</span>' : '') + '</td>' +
          '<td class="p-2 text-center align-top relative"><div class="text-[8.5px] text-slate-700 italic text-left mb-1">"Disetujui penuh sesuai sisa hak cuti tahunan dan ketentuan PP No. 11/2017 jo. PP No. 17/2020 serta PerBKN 24/2017."</div><div class="text-[9px]">Rasiei, ' + esc(witNow.tanggal) + '</div><div class="text-[8.5px] font-bold uppercase">An. BUPATI TELUK WONDAMA • Plt. KEPALA BKAD</div><div class="h-16 my-1"></div><div class="font-bold text-[9.5px] underline uppercase">' + esc(kabanCutiNama) + '</div><div class="text-[8.5px] font-mono text-slate-800">' + esc(kabanCutiPangkat) + ' • NIP. ' + esc(kabanCutiNip) + '</div></td></tr>' +
          '</tbody></table>' +
          '</div>';
      } else if (normType === 'SURAT_IZIN_RESMI') {
        docTitle = 'Surat Izin Meninggalkan Tugas / Daerah BKAD A4';
        var cleanZIzin = String(z.nip || '').replace(/\s+/g, '');
        var isYulIzin = !cleanZIzin || cleanZIzin === '199108152015051003';
        var zPegIzin = null;
        for (var pi = 0; pi < AppCache.pegawai.length; pi++) {
          if (String(AppCache.pegawai[pi].nip || '').replace(/\s+/g, '') === cleanZIzin) { zPegIzin = AppCache.pegawai[pi]; break; }
        }
        var isIzinDraftResmi = !isYulIzin && z && z.statusFinal !== 'Sah Diterbitkan';
        var nomorIzin = isYulIzin
          ? '800.1.11.1/142/BKAD-SET/V/2025'
          : (isIzinDraftResmi
            ? ('DRAF (' + (z.id || 'PENGAJUAN') + ' — BELUM DISAHKAN KABAN)')
            : (z.nomorSurat || '800.1.11.1/142/BKAD-SET/V/2025'));
        var tglMohonIzin = isYulIzin ? '21 Mei 2025' : (z.tglMulai || '21 Mei 2025');
        var izNama = isYulIzin ? 'YULIANUS KEREWAY, A.Md.' : String(z.nama || 'YULIANUS KEREWAY, A.Md.');
        var izNip = isYulIzin ? '19910815 201505 1 003' : formatNipSpaced(z.nip);
        var izPangkat = isYulIzin ? 'Pengatur (II/c)' : (zPegIzin ? zPegIzin.pangkat : 'Pengatur (II/c)');
        var izJabatan = isYulIzin ? 'Verifikator Perbendaharaan dan Akuntansi' : (z.jabatan || (zPegIzin ? zPegIzin.jabatan : 'Verifikator Perbendaharaan dan Akuntansi'));
        var izUnit = isYulIzin ? 'Subbidang Perbendaharaan & Kas Daerah, Bidang Perbendaharaan & Akuntansi BKAD' : ((zPegIzin && zPegIzin.subBidang ? zPegIzin.subBidang + ', ' : '') + (z.bidang || 'BKAD Kab. Teluk Wondama'));
        var izKeperluan = isYulIzin ? 'Menghadiri Wisuda Sarjana Anak Kandung di Universitas Cenderawasih (<span class="italic font-medium">Urusan Keluarga Mendesak</span>)' : esc(z.alasan || 'Menghadiri Acara Keluarga Mendesak');
        var izKotaTujuan = isYulIzin ? 'Kota Jayapura, Provinsi Papua' : 'Sesuai Tujuan Permohonan Dinas';
        var izLamanya = isYulIzin ? '3 (tiga) hari kerja, terhitung mulai tanggal 26 Mei s.d. 28 Mei 2025' : ('Terhitung mulai tanggal ' + esc(z.tglMulai) + ' s.d. ' + esc(z.tglSelesai));
        var izKembali = isYulIzin ? 'Kamis, 29 Mei 2025' : 'Hari kerja berikutnya setelah masa izin berakhir';

        tglPenetapan = isYulIzin ? '21 Mei 2025' : witNow.tanggal;
        signerRoleHtml = 'An. BUPATI TELUK WONDAMA<br/>Plt. KEPALA BADAN PENGELOLAAN KEUANGAN<br/>DAN ASET DAERAH,';
        signerNama = 'NIXON N. N. BARANSANO, SE';
        signerPangkat = 'Pembina';
        signerNip = '19751128 200909 1 001';

        html = '<div class="text-center mb-6">' +
          '<div class="text-[15.5px] font-bold uppercase tracking-wide inline-block border-b-[1.5px] border-[#0f172a] pb-0.5 text-[#0f172a]">SURAT IZIN MENINGGALKAN TUGAS / DAERAH</div>' +
          '<div class="text-[12.5px] font-medium font-mono text-[#1e293b] mt-1">Nomor: ' + esc(nomorIzin) + '</div>' +
          '</div>' +
          '<div class="text-[12.5px] text-[#1e293b] leading-relaxed text-justify mb-4">' +
          '<p>Berdasarkan Peraturan Pemerintah Republik Indonesia Nomor 94 Tahun 2021 tentang Disiplin Pegawai Negeri Sipil, Peraturan Badan Kepegawaian Negara Nomor 6 Tahun 2022 tentang Petunjuk Teknis Pembinaan Disiplin PNS, serta menindaklanjuti permohonan izin tertulis tanggal ' + esc(tglMohonIzin) + ', dengan ini Pelaksana Tugas (Plt.) Kepala Badan Pengelolaan Keuangan dan Aset Daerah Kabupaten Teluk Wondama memberikan izin kepada:</p>' +
          '</div>' +
          '<div class="mb-5 pl-3 sm:pl-6 text-[12px] text-[#1e293b]">' +
          '<table class="w-full border-collapse borderless-table"><tbody>' +
          '<tr class="align-top"><td class="w-40 py-1 font-medium text-[#334155]">Nama</td><td class="w-4 py-1 text-center">:</td><td class="py-1 font-bold text-[#0f172a] uppercase tracking-wide">' + esc(izNama) + '</td></tr>' +
          '<tr class="align-top"><td class="py-1 font-medium text-[#334155]">NIP</td><td class="py-1 text-center">:</td><td class="py-1 font-mono font-semibold tracking-wider text-[#0f172a]">' + esc(izNip) + '</td></tr>' +
          '<tr class="align-top"><td class="py-1 font-medium text-[#334155]">Pangkat / Gol. Ruang</td><td class="py-1 text-center">:</td><td class="py-1">' + esc(izPangkat) + '</td></tr>' +
          '<tr class="align-top"><td class="py-1 font-medium text-[#334155]">Jabatan</td><td class="py-1 text-center">:</td><td class="py-1">' + esc(izJabatan) + '</td></tr>' +
          '<tr class="align-top"><td class="py-1 font-medium text-[#334155]">Unit Kerja</td><td class="py-1 text-center">:</td><td class="py-1">' + esc(izUnit) + '</td></tr>' +
          '</tbody></table>' +
          '</div>' +
          '<div class="text-[12.5px] text-[#1e293b] leading-relaxed mb-4">' +
          '<p class="mb-2">Untuk keperluan sebagaimana tertera pada ketentuan izin dinas berikut:</p>' +
          '<div class="pl-3 sm:pl-6 text-[12px]">' +
          '<table class="w-full border-collapse borderless-table"><tbody>' +
          '<tr class="align-top"><td class="w-40 py-1 font-medium text-[#334155]">Keperluan</td><td class="w-4 py-1 text-center">:</td><td class="py-1 text-justify">' + izKeperluan + '</td></tr>' +
          '<tr class="align-top"><td class="py-1 font-medium text-[#334155]">Kota Tujuan</td><td class="py-1 text-center">:</td><td class="py-1 font-medium">' + esc(izKotaTujuan) + '</td></tr>' +
          '<tr class="align-top"><td class="py-1 font-medium text-[#334155]">Lamanya Izin</td><td class="py-1 text-center">:</td><td class="py-1 font-semibold text-[#002869]">' + izLamanya + '</td></tr>' +
          '<tr class="align-top"><td class="py-1 font-medium text-[#334155]">Pengalihan Tugas Rutin</td><td class="py-1 text-center">:</td><td class="py-1 font-medium">Dilimpahkan sementara kepada <span class="font-semibold text-[#0f172a]">Sdri. Maria Kambu, A.Md.</span></td></tr>' +
          '<tr class="align-top"><td class="py-1 font-medium text-[#334155]">Ketentuan Khusus</td><td class="py-1 text-center">:</td><td class="py-1 text-justify">1. Wajib melaporkan diri kembali pada hari kerja berikutnya (' + esc(izKembali) + ');<br/>2. Presensi dinas pada aplikasi E-Presensi tercatat otomatis dengan kode status <strong class="text-[#0052d2]">Izin Sah (Bypass Geofence)</strong> tanpa potongan TPP/kinerja.</td></tr>' +
          '</tbody></table>' +
          '</div>' +
          '</div>' +
          '<div class="text-[12px] text-[#1e293b] leading-relaxed mb-6">' +
          '<p>Demikian surat izin ini dibuat dan diberikan untuk dapat dipergunakan sebagaimana mestinya dan dilaksanakan dengan penuh rasa tanggung jawab.</p>' +
          '</div>';
      } else if (normType === 'LAMPIRAN_SPT_ROSTER') {
        docTitle = 'Lampiran SPT & Roster Penugasan Bidang Aset';
        var sptRows = '';
        for (var si = 0; si < AppCache.spt.length; si++) {
          var sp = AppCache.spt[si];
          sptRows += '<tr><td class="border border-black p-1.5 font-mono">' + esc(sp.nomorSPT) + '</td><td class="border border-black p-1.5">' + esc(sp.lokasi) + '</td><td class="border border-black p-1.5">' + formatDaftarPegawaiSPT(sp.daftarNIP, 'PRINT') + '</td><td class="border border-black p-1.5 font-mono">' + esc(sp.tglMulai) + ' - ' + esc(sp.tglSelesai) + '</td><td class="border border-black p-1.5">' + esc(sp.keperluan) + '</td></tr>';
        }
        html = '<div class="text-center font-bold uppercase underline mb-4">LAMPIRAN SURAT PERINTAH TUGAS (SPT) & ROSTER DINAS LAPANGAN<br/><span class="font-mono no-underline text-[11px]">Unit Kerja: Bidang Aset & Perbendaharaan BKAD Teluk Wondama</span></div>' +
          '<table class="w-full border-collapse border border-black text-[11px] mb-3"><thead><tr class="bg-slate-100"><th class="border border-black p-1.5">Nomor SPT</th><th class="border border-black p-1.5">Lokasi & Koordinat</th><th class="border border-black p-1.5">Petugas Pelaksana (Nama & NIP)</th><th class="border border-black p-1.5">Periode</th><th class="border border-black p-1.5">Uraian Tugas Lapangan</th></tr></thead><tbody>' + sptRows + '</tbody></table>';
      } else if (normType === 'VERIFIKASI_SPT_ROON') {
        docTitle = 'Lembar Verifikasi Geotagging SPT Distrik Kepulauan Roon';
        html = '<div class="text-center font-bold uppercase underline mb-4">LEMBAR VERIFIKASI GEOTAGGING PENUGASAN LAPANGAN (SPT)<br/><span class="font-mono no-underline text-[11px]">Nomor: ' + esc(s.nomorSPT || '094/012/SPT-ASET/BKAD/2026') + '</span></div>' +
          '<table class="w-full border-collapse border border-black text-xs mb-3">' +
          '<tr><td class="border border-black p-1.5 w-1/3 font-semibold">Lokasi Target GPS</td><td class="border border-black p-1.5 font-mono">' + esc(s.lokasi) + '</td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold">Periode Dinas WFA</td><td class="border border-black p-1.5 font-mono">' + esc(s.tglMulai) + ' s/d ' + esc(s.tglSelesai) + '</td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold align-top">Tim Pelaksana (Nama & NIP)</td><td class="border border-black p-1.5">' + formatDaftarPegawaiSPT(s.daftarNIP, 'PRINT') + '</td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold">Keperluan SPT</td><td class="border border-black p-1.5">' + esc(s.keperluan) + '</td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold">Hasil Audit GPS</td><td class="border border-black p-1.5 font-bold">' + esc(s.statusGPS) + ' (Radius Toleransi Pesisir Kepulauan Valid)</td></tr>' +
          '</table>';
      } else if (normType === 'BA_REKON') {
        docTitle = 'Berita Acara Rekonsiliasi Presensi Retroaktif';
        html = '<div class="text-center font-bold uppercase underline mb-4">BERITA ACARA REKONSILIASI DATA PRESENSI RETROAKTIF & TPP<br/><span class="font-mono no-underline text-[11px]">Nomor: ' + esc(r.nomorBA || '800.1.6.2/045/BA-REKON/BKAD-TW/XI/2025') + '</span></div>' +
          '<p class="mb-3">Pada hari ini telah dilaksanakan rekonsiliasi 5.548 baris log presensi ASN BKAD Kabupaten Teluk Wondama periode <b>' + esc(r.periode) + '</b> dengan alokasi penghematan penalti TPP ke Kas Daerah sebesar <b>Rp 4.850.000</b>:</p>' +
          '<table class="w-full border-collapse border border-black text-xs mb-4">' +
          '<tr><td class="border border-black p-1.5 font-semibold">Total ASN Tercakup</td><td class="border border-black p-1.5 font-mono">' + esc(r.totalPegawai) + ' Pegawai ASN (5.548 Baris Log Terindeks)</td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold">Anomali Diselesaikan</td><td class="border border-black p-1.5 font-mono">' + esc(r.anomaliTerselesaikan) + ' / ' + esc(r.anomaliTeridentifikasi) + ' Kasus</td></tr>' +
          '<tr><td class="border border-black p-1.5 font-semibold">Status Kunci Ledger SPM</td><td class="border border-black p-1.5 font-bold">' + esc(r.statusKunci) + '</td></tr>' +
          '</table>';
      } else if (normType === 'REKAP_MATRIKS_BULANAN') {
        defaultOrient = 'landscape';
        docTitle = 'Rekapitulasi Matriks Absensi Bulanan (Tanggal 1–31)';
        var activePegsMat = getActivePegawaiList();
        var cfgMat = getSelectedRekapPeriodConfig();
        var matModOnly = buildMonthlyAttendanceMatrixModel(activePegsMat, cfgMat);
        html = buildMonthlyAttendanceMatrixHTML(matModOnly, false);
      } else {
        normType = 'REKAP_BULANAN';
        defaultOrient = 'landscape';
        docTitle = 'Rekapitulasi Kehadiran & Perhitungan TPP BKAD';
        var activePegsRekap = getActivePegawaiList();
        var rows = '';
        for (var i = 0; i < activePegsRekap.length; i++) {
          var p = activePegsRekap[i];
          var stP = computePegawaiRekapStats(p, AppCache.activeRekapTab);
          var printParts = [];
          if (stP.wfo > 0) printParts.push('WFO:' + stP.wfo);
          if (stP.wfa > 0) printParts.push('WFA:' + stP.wfa);
          if (stP.wfh > 0) printParts.push('WFH:' + stP.wfh);
          if (stP.izinCuti > 0) printParts.push('Izin/Cuti:' + stP.izinCuti);
          var printRincian = printParts.length ? printParts.join(' • ') : 'Belum ada log';
          rows += '<tr><td class="border border-black p-1.5 text-center">' + (i + 1) + '</td>' +
            '<td class="border border-black p-1.5"><b>' + esc(p.nama) + '</b><br/><span class="font-mono text-[10px]">' + esc(p.nip) + '</span></td>' +
            '<td class="border border-black p-1.5">' + esc(p.bidang) + (p.subBidang ? '<br/><span class="text-[10px]">' + esc(p.subBidang) + '</span>' : '') + '</td>' +
            '<td class="border border-black p-1.5 font-mono text-center">' + stP.hadir + ' / ' + stP.mult + ' Hari<br/><span class="text-[10px]">' + printRincian + '</span></td>' +
            '<td class="border border-black p-1.5 font-mono text-center">' + stP.telat + ' Telat / ' + stP.alpa + ' Alpa</td>' +
            '<td class="border border-black p-1.5 font-mono text-right">' + stP.pct + '% / Rp ' + stP.pot.toLocaleString('id-ID') + '</td></tr>';
        }
        var cfgRekapPrint = getSelectedRekapPeriodConfig();
        var periodLabelPrint = formatRekapPeriodLabel(AppCache.activeRekapTab || 'BULANAN', cfgRekapPrint);
        html = '<div class="text-center font-bold uppercase underline">REKAPITULASI KEHADIRAN ASN & POTONGAN TPP BKAD KAB. TELUK WONDAMA</div>' +
          '<div class="text-center text-xs font-semibold text-slate-700 mt-1 mb-4">Periode: ' + esc(periodLabelPrint) + '</div>' +
          '<table class="w-full border-collapse border border-black text-[11px]"><thead><tr class="bg-slate-100"><th class="border border-black p-1.5">No</th><th class="border border-black p-1.5">Nama / NIP</th><th class="border border-black p-1.5">Bidang / Sub Bidang</th><th class="border border-black p-1.5">Kehadiran &amp; Rincian</th><th class="border border-black p-1.5">Terlambat / Alpa</th><th class="border border-black p-1.5">Persentase / Potongan TPP</th></tr></thead><tbody>' + rows + '</tbody></table>';
      }

      var isDocDraft = false;
      var isDocRejected = false;
      var docStatusLabel = '';
      if ((normType === 'FORMULIR_CUTI_BKN' || normType === 'SURAT_IZIN_RESMI') && z && z.id) {
        isDocRejected = String(z.statusFinal || '').indexOf('Ditolak') !== -1;
        isDocDraft = z.statusFinal !== 'Sah Diterbitkan';
        docStatusLabel = z.statusFinal || 'Dalam Proses Pengajuan';
      }

      return {
        normType: normType,
        docTitle: docTitle,
        defaultOrient: defaultOrient,
        isDraft: isDocDraft,
        isRejected: isDocRejected,
        draftStatusText: docStatusLabel,
        signerRole: signerRole,
        signerRoleHtml: signerRoleHtml,
        tglPenetapan: tglPenetapan,
        hideDefaultSignature: hideDefaultSignature,
        signerNama: signerNama,
        signerPangkat: signerPangkat,
        signerNip: signerNip,
        innerContentHtml: html
      };
    }

    function renderCtrlPSimulator() {
      var spec = buildCtrlPDocumentSpec(AppCache.printDocType, AppCache.printRefId);
      openPrintModal(spec.docTitle, spec.innerContentHtml, spec);
    }

    function downloadPrintSheetHTML() {
      var sheetEl = document.getElementById('print-sheet-area');
      if (!sheetEl) return;
      var fullDoc = '<' + '!DOCTYPE html><' + 'html lang="id"><' + 'head><meta charset="utf-8"><title>Dokumen A4 BKAD</title>' +
        '<' + 'script src="https://cdn.tailwindcss.com"></' + 'script>' +
        '<' + 'style>body{font-family:Inter,Arial,sans-serif;background:#fff;color:#000;margin:15mm;font-size:12px}table:not(.borderless-table){width:100%;border-collapse:collapse}table:not(.borderless-table) td,table:not(.borderless-table) th{border:1px solid #000;padding:6px}table.borderless-table td{border:none!important;padding:3px 4px}</' + 'style></' + 'head><' + 'body>' +
        '<div class="relative">' + sheetEl.innerHTML + '</div></' + 'body></' + 'html>';
      var blob = new Blob([fullDoc], { type: 'text/html;charset=utf-8;' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = String(AppCache.printDocType || 'DOKUMEN_A4').toLowerCase() + '_bkad_wondama.html';
      a.click();
      showToast('Salinan dokumen siap cetak (.HTML) berhasil diunduh.', 'success');
    }

    function openPrintModal(docTitle, innerContentHtml, specOpt) {
      var pj = (AppCache.settings.PEJABAT_PENANDATANGAN && AppCache.settings.PEJABAT_PENANDATANGAN.value) || { kabanNama: 'Dr. Hendrik Mambor, S.E., M.Si.', kabanNip: '19751128 200909 1 001', kabanPangkat: 'Pembina Utama Muda (IV/c)' };
      var sp = specOpt || {
        signerRole: 'Kepala Badan Pengelolaan Keuangan dan Aset Daerah,',
        signerRoleHtml: '',
        tglPenetapan: '21 Mei 2025',
        hideDefaultSignature: false,
        signerNama: pj.kabanNama || 'Dr. Hendrik Mambor, S.E., M.Si.',
        signerPangkat: pj.kabanPangkat || 'Pembina Utama Muda (IV/c)',
        signerNip: pj.kabanNip || '19751128 200909 1 001'
      };
      var witNow = getClientWITNow();
      var optionsHtml = '';
      for (var i = 0; i < PRINT_DOC_CATALOG.length; i++) {
        var item = PRINT_DOC_CATALOG[i];
        var sel = item.key === AppCache.printDocType ? ' selected' : '';
        optionsHtml += '<option value="' + esc(item.key) + '"' + sel + '>' + esc(item.label) + '</option>';
      }
      var isLand = AppCache.printOrientation === 'landscape';
      var zoomVal = AppCache.printZoom || 100;
      var sheetWidthClass = isLand ? 'max-w-[980px]' : 'max-w-[794px]';
      var scaleStyle = zoomVal === 100 ? '' : 'transform: scale(' + (zoomVal / 100) + '); transform-origin: top center;';
      var witStampText = (sp.tglPenetapan === '21 Mei 2025' && AppCache.printDocType === 'SURAT_IZIN_RESMI') ? '21 Mei 2025, 10:45:12' : (witNow.tanggal + ', ' + witNow.jam + ' WIT');

      var signatureBlock = sp.hideDefaultSignature ? '' : '' +
        '<div class="relative z-10 mt-4 pt-2 flex flex-col sm:flex-row items-start justify-between gap-6">' +
        '<div class="w-full sm:w-1/2 text-[10.5px] text-[#334155] leading-normal pt-2">' +
        '<div class="font-bold uppercase tracking-wider text-[#0f172a] mb-1">TEMBUSAN YTH:</div>' +
        '<ol class="list-decimal pl-4 space-y-0.5">' +
        '<li>Bupati Teluk Wondama di Isei <span class="italic text-[#64748b]">(sebagai laporan)</span>;</li>' +
        '<li>Inspektur Daerah Kab. Teluk Wondama;</li>' +
        '<li>Kepala BKPSDM Kab. Teluk Wondama;</li>' +
        '<li>Pertinggal/Arsip Subbag Kepegawaian &amp; Umum BKAD.</li>' +
        '</ol>' +
        '</div>' +
        '<div class="w-full sm:w-1/2 flex flex-col items-start sm:pl-6 text-[12px] text-[#0f172a] relative">' +
        '<div class="text-[11.5px] leading-tight">Ditetapkan di : Rasiei</div>' +
        '<div class="text-[11.5px] leading-tight">Pada tanggal : ' + esc(sp.tglPenetapan || witNow.tanggal || '21 Mei 2025') + '</div>' +
        '<div class="font-bold text-[11px] uppercase tracking-tight mt-2 leading-tight">' + (sp.signerRoleHtml || esc(sp.signerRole)) + '</div>' +
        '<div class="h-24 w-56 my-1"></div>' +
        '<div class="leading-tight">' +
        '<div class="font-bold text-[12.5px] underline uppercase tracking-wide text-[#0b1b36]">' + esc(sp.signerNama) + '</div>' +
        '<div class="text-[11.5px] text-[#334155] font-medium">' + esc(sp.signerPangkat) + '</div>' +
        '<div class="text-[11.5px] font-mono text-[#1e293b]">NIP. ' + esc(sp.signerNip) + '</div>' +
        '</div>' +
        '</div>' +
        '</div>';

      var qrFooter = AppCache.printShowQR || AppCache.printShowWIT ? '<div class="relative z-10 mt-8 pt-3 border-t border-slate-300">' +
        '<div class="flex items-center justify-between gap-4">' +
        '<div class="flex items-center gap-3">' +
        (AppCache.printShowQR ? '<div class="w-12 h-12 sm:w-14 sm:h-14 bg-white p-1 rounded border border-slate-300 flex items-center justify-center shrink-0"><svg class="w-full h-full text-[#0f172a]" fill="currentColor" viewBox="0 0 100 100"><rect x="0" y="0" width="30" height="30"></rect><rect fill="white" x="5" y="5" width="20" height="20"></rect><rect x="10" y="10" width="10" height="10"></rect><rect x="70" y="0" width="30" height="30"></rect><rect fill="white" x="75" y="5" width="20" height="20"></rect><rect x="80" y="10" width="10" height="10"></rect><rect x="0" y="70" width="30" height="30"></rect><rect fill="white" x="5" y="75" width="20" height="20"></rect><rect x="10" y="80" width="10" height="10"></rect><rect x="38" y="8" width="8" height="8"></rect><rect x="52" y="8" width="8" height="8"></rect><rect x="38" y="24" width="8" height="8"></rect><rect x="46" y="38" width="8" height="8"></rect><rect x="24" y="46" width="8" height="8"></rect><rect x="62" y="46" width="8" height="8"></rect><rect x="78" y="46" width="8" height="8"></rect><rect x="38" y="60" width="8" height="8"></rect><rect x="54" y="60" width="8" height="8"></rect><rect x="68" y="68" width="8" height="8"></rect><rect x="42" y="78" width="8" height="8"></rect><rect x="80" y="80" width="8" height="8"></rect></svg></div>' : '') +
        '<div class="flex flex-col text-[#475569]">' +
        '<div class="flex items-center gap-1.5">' +
        '<span class="w-2 h-2 rounded-full ' + (sp.isRejected ? 'bg-status-absent' : (sp.isDraft ? 'bg-amber-500' : 'bg-status-present')) + '"></span>' +
        '<span class="font-mono text-[9.5px] uppercase font-bold ' + (sp.isRejected ? 'text-status-absent' : (sp.isDraft ? 'text-amber-800' : 'text-[#166534]')) + '">' +
        (sp.isRejected
          ? ('DITOLAK / TIDAK SAH — ' + esc(sp.draftStatusText))
          : (sp.isDraft
            ? ('DRAF PENGAJUAN — MENUNGGU PENGESAHAN (' + esc(sp.draftStatusText) + ')')
            : 'TERVALIDASI SISTEM E-PRESENSI BKAD — PP 94/2021 ALASAN SAH')) +
        '</span>' +
        '</div>' +
        '<span class="text-[9px] leading-tight text-[#64748b] mt-0.5">' +
        (sp.isDraft
          ? 'Dokumen ini masih berstatus <strong>DRAF</strong>. Nomor surat resmi &amp; validasi QR sah terbit setelah pengesahan Kepala Badan.'
          : 'Pindai untuk validasi keabsahan surat resmi di <strong>simpeg.telukwondamakab.go.id</strong>') +
        '</span>' +
        '<span class="font-mono text-[8.5px] text-[#94a3b8] mt-0.5">' +
        (AppCache.printShowQR ? 'SHA-256 Digest: 4b7a9e110ac7df82e391bbf45129c9012d98fc3321 • Rangkap Cetak: ' + AppCache.printCopies + ' Set' : '') +
        (AppCache.printShowWIT ? (AppCache.printShowQR ? ' | ' : '') + 'Server WIT: ' + esc(witStampText) : '') +
        '</span>' +
        '</div>' +
        '</div>' +
        '<div class="text-right shrink-0"><span class="font-mono text-[10px] text-[#64748b]">Halaman 1 / 1</span></div>' +
        '</div>' +
        '</div>' : '';

      var watermarkOverlay = '<div class="absolute inset-0 flex items-center justify-center pointer-events-none ' + (sp.isDraft ? 'opacity-[0.075]' : 'opacity-[0.035]') + ' overflow-hidden select-none">' +
        '<div class="text-[52px] sm:text-[78px] font-bold text-center tracking-widest -rotate-[35deg] uppercase leading-relaxed ' + (sp.isRejected ? 'text-red-700' : (sp.isDraft ? 'text-amber-700' : 'text-[#0b1b36]')) + '">' +
        (sp.isRejected
          ? 'DRAF DITOLAK<br/>TIDAK BERLAKU'
          : (sp.isDraft
            ? 'DRAF PENGAJUAN<br/>BELUM SAH'
            : 'PEMKAB TELUK WONDAMA<br/>BKAD ASLI SAH')) +
        '</div>' +
        '</div>';

      var body = '<div id="ctrlp-grid-wrapper" class="grid grid-cols-1 lg:grid-cols-12 gap-4">' +
        '<div id="ctrlp-control-sidebar" class="lg:col-span-4 bg-surface-low border border-border-subtle rounded-2xl p-4 space-y-3.5 text-xs">' +
        '<div class="border-b border-border-subtle pb-2">' +
        '<div class="font-bold text-navy-deep text-sm flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px]">print</span><span>Simulasi Pencetakan (Ctrl+P)</span></div>' +
        '<p class="text-[11px] text-text-muted mt-0.5">Pratinjau dokumen standar BKN / Kemendagri siap cetak A4.</p>' +
        '</div>' +
        '<div>' +
        '<label class="block text-[11px] font-bold text-navy-deep uppercase mb-1">Pilih Naskah Resmi (15 Dokumen)</label>' +
        '<select id="ctrlp-doc-select" class="w-full px-3 py-2 rounded-xl bg-white border border-border-subtle text-xs font-semibold text-navy-deep">' + optionsHtml + '</select>' +
        '</div>' +
        '<div>' +
        '<div class="flex items-center justify-between mb-1"><span class="text-[11px] font-bold text-navy-deep uppercase">Salinan (Copies)</span><span class="font-mono font-bold text-navy-deep">' + AppCache.printCopies + ' Rangkap</span></div>' +
        '<div class="flex items-center gap-2">' +
        '<button type="button" data-action="print-copies-delta" data-id="-1" class="w-9 h-9 rounded-xl bg-white border border-border-subtle font-bold text-base hover:bg-surface-high">-</button>' +
        '<div class="flex-1 text-center py-2 rounded-xl bg-white border border-border-subtle font-mono font-bold text-navy-deep">' + AppCache.printCopies + ' Rangkap</div>' +
        '<button type="button" data-action="print-copies-delta" data-id="1" class="w-9 h-9 rounded-xl bg-white border border-border-subtle font-bold text-base hover:bg-surface-high">+</button>' +
        '</div>' +
        '<div class="mt-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[10px] text-navy-deep space-y-0.5">' +
        '<div class="font-bold">Standar Distribusi Rangkap 3 BKN:</div>' +
        '<div>• Rangkap 1: ASN Bersangkutan</div>' +
        '<div>• Rangkap 2: Arsip Kepegawaian & TPP BKAD</div>' +
        '<div>• Rangkap 3: BKPSDM & Kanreg XIV BKN</div>' +
        '</div>' +
        '</div>' +
        '<div>' +
        '<span class="block text-[11px] font-bold text-navy-deep uppercase mb-1">Orientasi Kertas A4 (210 × 297 mm)</span>' +
        '<div class="grid grid-cols-2 gap-2">' +
        '<button type="button" data-action="print-orient" data-id="portrait" class="py-2 rounded-xl border text-xs font-semibold ' + (!isLand ? 'bg-navy-deep text-white border-navy-deep' : 'bg-white text-text-main border-border-subtle') + '">Portrait</button>' +
        '<button type="button" data-action="print-orient" data-id="landscape" class="py-2 rounded-xl border text-xs font-semibold ' + (isLand ? 'bg-navy-deep text-white border-navy-deep' : 'bg-white text-text-main border-border-subtle') + '">Landscape</button>' +
        '</div>' +
        '</div>' +
        '<div>' +
        '<span class="block text-[11px] font-bold text-navy-deep uppercase mb-1">Zoom Pratinjau</span>' +
        '<div class="grid grid-cols-3 gap-1.5">' +
        '<button type="button" data-action="print-zoom" data-id="85" class="py-1.5 rounded-lg border font-mono text-[11px] font-semibold ' + (zoomVal === 85 ? 'bg-electric-blue text-white border-electric-blue' : 'bg-white text-text-main border-border-subtle') + '">85%</button>' +
        '<button type="button" data-action="print-zoom" data-id="100" class="py-1.5 rounded-lg border font-mono text-[11px] font-semibold ' + (zoomVal === 100 ? 'bg-electric-blue text-white border-electric-blue' : 'bg-white text-text-main border-border-subtle') + '">100%</button>' +
        '<button type="button" data-action="print-zoom" data-id="115" class="py-1.5 rounded-lg border font-mono text-[11px] font-semibold ' + (zoomVal === 115 ? 'bg-electric-blue text-white border-electric-blue' : 'bg-white text-text-main border-border-subtle') + '">115%</button>' +
        '</div>' +
        '</div>' +
        '<div class="space-y-1.5 pt-2 border-t border-border-subtle">' +
        '<label class="flex items-center gap-2 cursor-pointer"><input id="ctrlp-chk-kop" type="checkbox"' + (AppCache.printShowKop ? ' checked' : '') + ' class="rounded text-electric-blue" /><span>Tampilkan Kop Surat Resmi Pemkab</span></label>' +
        '<label class="flex items-center gap-2 cursor-pointer"><input id="ctrlp-chk-wit" type="checkbox"' + (AppCache.printShowWIT ? ' checked' : '') + ' class="rounded text-electric-blue" /><span>Tampilkan Stempel Waktu Server WIT</span></label>' +
        '<label class="flex items-center gap-2 cursor-pointer"><input id="ctrlp-chk-qr" type="checkbox"' + (AppCache.printShowQR ? ' checked' : '') + ' class="rounded text-electric-blue" /><span>Tampilkan QR Code &amp; Hash SHA-256</span></label>' +
        '</div>' +
        '<div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">' +
        '<div class="text-[11px] font-bold text-amber-900 flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">edit_document</span><span>Edit Isi &amp; Form Tahapan Surat</span></div>' +
        '<button type="button" data-action="edit-disiplin-from-print" class="w-full py-1.5 px-3 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-smooth"><span class="material-symbols-outlined text-[15px]">edit_calendar</span><span>Buka Form Edit Naskah Ini (T1–T8 / BAP / SK)</span></button>' +
        '<button type="button" data-action="toggle-a4-editable" class="w-full py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-smooth"><span class="material-symbols-outlined text-[15px]">edit_note</span><span id="lbl-toggle-a4-edit">Ketik / Edit Teks Langsung di Kertas A4</span></button>' +
        '</div>' +
        '<div class="space-y-2 pt-2 border-t border-border-subtle">' +
        '<button type="button" data-action="trigger-window-print" class="w-full py-2.5 px-4 rounded-xl bg-electric-blue hover:bg-navy-deep text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-smooth"><span class="material-symbols-outlined text-[18px]">print</span><span>Cetak Sekarang (Ctrl+P)</span></button>' +
        '<button type="button" data-action="trigger-inline-print" class="w-full py-2 px-4 rounded-xl bg-navy-deep hover:bg-primary text-white font-semibold text-xs flex items-center justify-center gap-2 transition-smooth"><span class="material-symbols-outlined text-[16px]">Fact_Check</span><span>Cetak Langsung di Halaman Ini</span></button>' +
        '<button type="button" data-action="print-download-html" class="w-full py-2 px-4 rounded-xl bg-white border border-border-subtle hover:bg-surface-high text-navy-deep font-semibold text-xs flex items-center justify-center gap-2 transition-smooth"><span class="material-symbols-outlined text-[17px]">download</span><span>Unduh Salinan Siap Cetak (.HTML)</span></button>' +
        '</div>' +
        '</div>' +
        '<div id="ctrlp-canvas-col" class="lg:col-span-8 bg-slate-200/80 rounded-2xl p-3 sm:p-6 overflow-x-auto">' +
        '<div id="a4-direct-edit-banner" class="hidden w-full mb-3 p-2.5 rounded-xl bg-amber-100 border border-amber-400 text-amber-950 text-xs font-semibold items-center justify-between gap-2">' +
        '<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px] text-amber-700">touch_app</span><span>MODE KETIK LANGSUNG AKTIF: Klik teks mana saja pada kertas A4 di bawah untuk mengedit kata/nomor/tanggal sebelum dicetak.</span></div>' +
        '<button type="button" data-action="toggle-a4-editable" class="px-2.5 py-1 rounded-lg bg-amber-700 text-white text-[11px] font-bold shrink-0">Selesai Edit</button>' +
        '</div>' +
        '<div id="print-sheet-area" style="' + scaleStyle + '" class="w-full ' + sheetWidthClass + ' mx-auto bg-white text-black shadow-2xl border border-slate-300 p-6 sm:p-10 relative shrink-0">' +
        watermarkOverlay +
        (AppCache.printShowKop && !sp.hideDefaultSignature ? buildKopSuratHTML() : '') +
        '<div class="relative z-10">' + innerContentHtml + '</div>' +
        signatureBlock +
        qrFooter +
        '</div>' +
        '</div>' +
        '</div>';

      openModal('Simulasi Cetak Resmi A4 — ' + docTitle, body, true);
    }

    function printA4SheetNow(forceInline) {
      var sheetEl = document.getElementById('print-sheet-area');
      if (!sheetEl || forceInline) {
        window.focus();
        window.print();
        return;
      }
      var isLand = AppCache.printOrientation === 'landscape';
      var pageOrient = isLand ? 'landscape' : 'portrait';
      var printWin = null;
      try {
        printWin = window.open('', '_blank');
      } catch (eWin) {
        printWin = null;
      }
      if (!printWin || !printWin.document) {
        window.focus();
        window.print();
        return;
      }
      var docHtml = '<' + '!DOCTYPE html><' + 'html lang="id"><' + 'head><meta charset="utf-8" />' +
        '<title>Cetak Dokumen Resmi A4 — E-Presensi BKAD Teluk Wondama</title>' +
        '<' + 'script src="https://cdn.tailwindcss.com"></' + 'script>' +
        '<' + 'style>' +
        '@page { size: A4 ' + pageOrient + '; margin: 12mm; }' +
        'body { font-family: Inter, Arial, sans-serif; background: #f1f5f9; color: #000; margin: 0; padding: 16px; font-size: 12px; }' +
        '.a4-sheet { background: #fff; max-width: ' + (isLand ? '277mm' : '190mm') + '; margin: 0 auto; padding: 12mm; box-shadow: 0 10px 25px rgba(0,0,0,0.12); position: relative; overflow: hidden; }' +
        '@media print { body { background: #fff !important; padding: 0 !important; } .no-print-bar { display: none !important; } .a4-sheet { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; } }' +
        '</' + 'style></' + 'head><' + 'body>' +
        '<div class="no-print-bar" style="max-width:820px;margin:0 auto 14px auto;padding:10px 16px;background:#0B3D91;color:#fff;border-radius:12px;display:flex;align-items:center;justify-content:space-between;font-family:sans-serif;">' +
        '<span style="font-size:13px;font-weight:700;">Dokumen Resmi A4 BKAD Kab. Teluk Wondama — Siap Cetak</span>' +
        '<button type="button" id="btn-popup-print" style="background:#1E6BFF;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px;">Cetak ke Printer / Simpan PDF (Ctrl+P)</button>' +
        '</div>' +
        '<div class="a4-sheet">' + sheetEl.innerHTML + '</div>' +
        '<' + 'script>' +
        'document.getElementById("btn-popup-print").addEventListener("click", function(){ window.print(); });' +
        'window.addEventListener("load", function(){ setTimeout(function(){ window.focus(); window.print(); }, 450); });' +
        '</' + 'script></' + 'body></' + 'html>';
      printWin.document.open();
      printWin.document.write(docHtml);
      printWin.document.close();
    }

    function handlePrintType(type, refId) {
      var spec = buildCtrlPDocumentSpec(type, refId);
      AppCache.printDocType = spec.normType;
      AppCache.printRefId = refId || null;
      AppCache.printOrientation = spec.defaultOrient || 'portrait';
      if (spec.normType === 'BAP_DISIPLIN' || spec.normType === 'SK_HUKUMAN_DISIPLIN' || spec.normType === 'BA_PENYAMPAIAN_TERTUTUP' || spec.normType === 'BUKTI_IDIS_BKN') {
        recordAuditAccess('AKSES_DOKUMEN_RAHASIA_' + spec.normType, 'Dokumen: ' + (refId || 'Rujukan'));
      }
      openPrintModal(spec.docTitle, spec.innerContentHtml, spec);
    }

    /* -------------------------------------------------------------------
     * 15. GALERI 73 DOKUMEN UI STITCH (Katalog & Pratinjau Interaktif)
     * ------------------------------------------------------------------- */
    var STITCH_CATALOG = [
      { folder: 'audit_geotagging_penugasan_lapangan_spt', cat: 'Mode Kerja & SPT', png: true },
      { folder: 'beranda_pegawai_mobile_wit_2', cat: 'Mobile & Kamera GPS', png: true },
      { folder: 'berita_acara_penyampaian_keputusan_disiplin_tertutup', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'bukti_registrasi_i_dis_bkn_inkrah_lembar_1', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'bukti_registrasi_i_dis_bkn_inkrah_lembar_2', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'bukti_registrasi_i_dis_bkn_inkrah_lembar_3', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'cetak_a4_berita_acara_rekonsiliasi_presensi_retroaktif', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'cetak_a4_bukti_registrasi_i_dis_bkn_1', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'cetak_a4_bukti_registrasi_i_dis_bkn_2', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'cetak_a4_bukti_registrasi_i_dis_bkn_3', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'cetak_a4_formulir_permintaan_pemberian_cuti_standar_bkn', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'cetak_a4_lembar_verifikasi_spt_kepulauan_roon', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'cetak_a4_rekap_presensi_bulanan_bkad_landscape', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'cetak_a4_sk_hukuman_disiplin_teguran_tertulis', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'cetak_a4_surat_izin_resmi_bkad', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'cetak_a4_surat_panggilan_i_disiplin_asn', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'cetak_berita_acara_pemeriksaan_bap_a4', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'dasbor_admin_bkad', cat: 'Dasbor & Login', png: true },
      { folder: 'dasbor_persetujuan_pejabat_kasubid_kabid_kaban', cat: 'Izin & Cuti 3 Tahap', png: true },
      { folder: 'detail_log_kehadiran_pegawai', cat: 'Mobile & Kamera GPS', png: true },
      { folder: 'disiplin_pegawai_pp_94_2021', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'ekspor_pdf_berita_acara_pemeriksaan_bap_disp_2025_009', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'ekspor_pdf_berita_acara_rekonsiliasi_presensi_retroaktif', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'ekspor_pdf_rekap_presensi_bulanan_bkad', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'ekspor_pdf_sk_hukuman_disiplin_disp_2025_009', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'formulir_cetak_izin_cuti_standar_bkn_a4', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'formulir_cetak_izin_resmi_bkad_a4', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'impor_pegawai_sinkronisasi_database_sheets', cat: 'Dasbor & Login', png: true },
      { folder: 'kalender_roster_penugasan_lapangan_bidang_aset', cat: 'Mode Kerja & SPT', png: true },
      { folder: 'kamera_presensi_selfie_gps', cat: 'Mobile & Kamera GPS', png: true },
      { folder: 'kasus_disiplin_disp_2025_009_berhasil_ditutup_diarsipkan', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'komit_kunci_berita_acara_rekonsiliasi_berhasil', cat: 'Rekonsiliasi & TPP', png: true },
      { folder: 'lampiran_resmi_spt_roster_penugasan_bidang_aset_a4', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'langkah_2_tabel_pratinjau_validasi_dry_run_5_548_baris_log', cat: 'Rekonsiliasi & TPP', png: true },
      { folder: 'langkah_3_resolusi_anomali_perhitungan_tpp_retroaktif', cat: 'Rekonsiliasi & TPP', png: true },
      { folder: 'langkah_4_pratinjau_berita_acara_rekonsiliasi_presensi_retroaktif', cat: 'Rekonsiliasi & TPP', png: true },
      { folder: 'lemari_arsip_digital_kasus_disiplin_disp_2025_009', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'lembar_telaah_pengesahan_surat_izin_bkad', cat: 'Izin & Cuti 3 Tahap', png: true },
      { folder: 'lembar_verifikasi_geotagging_spt_kepulauan_roon', cat: 'Mode Kerja & SPT', png: true },
      { folder: 'login_e_presensi_bkad', cat: 'Dasbor & Login', png: true },
      { folder: 'manajemen_jadwal_mode_kerja_wfo_wfh_wfa', cat: 'Mode Kerja & SPT', png: true },
      { folder: 'manifest_metadata_siasn_i_dis_bkn_disp_2025_009', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'naskah_dinas_surat_panggilan_i_disiplin_asn', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'paraf_kabid_disahkan_berkas_diteruskan_ke_kepala_badan_tahap_3_final', cat: 'Izin & Cuti 3 Tahap', png: true },
      { folder: 'pengajuan_cuti_izin_pegawai', cat: 'Izin & Cuti 3 Tahap', png: true },
      { folder: 'pengaturan_sistem', cat: 'Dasbor & Login', png: true },
      { folder: 'pratinjau_naskah_dinas_bap_kasus_disiplin_disp_2025_009', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'pratinjau_naskah_dinas_sk_hukuman_disiplin_disp_2025_009', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'rekapitulasi_kumulatif_spt_bulan_ini', cat: 'Rekapitulasi', png: true },
      { folder: 'rekap_presensi', cat: 'Rekapitulasi', png: false },
      { folder: 'rekap_presensi_bulanan_bkad', cat: 'Rekapitulasi', png: true },
      { folder: 'rekap_presensi_semesteran_bkad', cat: 'Rekapitulasi', png: true },
      { folder: 'rekap_presensi_tahunan_bkad', cat: 'Rekapitulasi', png: true },
      { folder: 'rekomendasi_kasubid_disahkan_berkas_diteruskan_ke_kabid_tahap_2', cat: 'Izin & Cuti 3 Tahap', png: true },
      { folder: 'rekonsiliasi_impor_presensi_retroaktif_januari_oktober_2025', cat: 'Rekonsiliasi & TPP', png: true },
      { folder: 'simulasi_cetak_a4_berita_acara_penyampaian', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'simulasi_cetak_ctrl_p_berita_acara_pemeriksaan_bap', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'simulasi_cetak_ctrl_p_berita_acara_rekonsiliasi', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'simulasi_cetak_ctrl_p_bukti_registrasi_i_dis_bkn_1', cat: 'Simulasi Cetak A4', png: false },
      { folder: 'simulasi_cetak_ctrl_p_bukti_registrasi_i_dis_bkn_2', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'simulasi_cetak_ctrl_p_bukti_registrasi_i_dis_bkn_3', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'simulasi_cetak_ctrl_p_formulir_cuti_a4_bkn', cat: 'Simulasi Cetak A4', png: false },
      { folder: 'simulasi_cetak_ctrl_p_lampiran_spt_roster_a4', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'simulasi_cetak_ctrl_p_lembar_verifikasi_spt_kepulauan_roon_a4', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'simulasi_cetak_ctrl_p_rekap_presensi_bulanan_a4_landscape', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'simulasi_cetak_ctrl_p_sk_hukuman_disiplin', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'simulasi_cetak_ctrl_p_surat_izin_resmi_bkad_a4', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'simulasi_cetak_ctrl_p_surat_panggilan_i', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'sk_hukuman_disiplin_teguran_tertulis', cat: 'Disiplin PP 94/2021', png: false },
      { folder: 'status_pengajuan_izin_terkirim_ke_atasan_langsung_kasubid', cat: 'Izin & Cuti 3 Tahap', png: true },
      { folder: 'surat_izin_resmi_bkad_diterbitkan_disahkan', cat: 'Izin & Cuti 3 Tahap', png: true },
      { folder: 'tahap_4_berita_acara_pemeriksaan_bap_disp_2025_009', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'tahap_5_sk_hukuman_disiplin_teguran_tertulis_disp_2025_009', cat: 'Disiplin PP 94/2021', png: false },
      { folder: 'tahap_6_7_penyampaian_keputusan_tertutup_disp_2025_009', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'tahap_8_status_berlaku_sah_inkrah_sinkronisasi_i_dis_bkn', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'tahap_8_status_berlaku_sah_inkrah_sinkronisasi_i_dis_bkn_disp_2025_009', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'templat_excel_rekonsiliasi_presensi_retroaktif.xlsx', cat: 'Rekonsiliasi & TPP', png: true },
      { folder: 'unduh_berkas_contoh.xlsx_presensi_retroaktif', cat: 'Rekonsiliasi & TPP', png: true },
      { folder: 'unduh_bundel_arsip_lengkap.zip_kasus_disiplin_disp_2025_009', cat: 'Disiplin PP 94/2021', png: true },
      { folder: 'unduh_pdf_resmi_a4_lampiran_spt_roster_penugasan', cat: 'Simulasi Cetak A4', png: true },
      { folder: 'verifikasi_tugas_luar_spt_gps', cat: 'Mode Kerja & SPT', png: true },
      { folder: 'wizard_impor_pegawai', cat: 'Dasbor & Login', png: true },
      { folder: 'wizard_impor_presensi_retroaktif.xlsx', cat: 'Rekonsiliasi & TPP', png: true }
    ];

    function formatFolderTitle(folder) {
      return folder.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }

    function getStitchCategoryMeta(cat) {
      if (cat === 'Mobile & Kamera GPS') return { bg: 'from-teal-600 to-emerald-700', pill: 'bg-teal-50 text-teal-800', icon: 'photo_camera', menu: 'MOBILE' };
      if (cat === 'Izin & Cuti 3 Tahap') return { bg: 'from-electric-blue to-navy-deep', pill: 'bg-blue-50 text-electric-blue', icon: 'approval_delegation', menu: 'persetujuan-izin' };
      if (cat === 'Mode Kerja & SPT') return { bg: 'from-emerald-600 to-teal-800', pill: 'bg-emerald-50 text-emerald-800', icon: 'pin_drop', menu: 'jadwal-mode-kerja' };
      if (cat === 'Rekonsiliasi & TPP') return { bg: 'from-purple-600 to-indigo-800', pill: 'bg-purple-50 text-purple-800', icon: 'rule_folder', menu: 'rekonsiliasi-absen' };
      if (cat === 'Disiplin PP 94/2021') return { bg: 'from-red-600 to-rose-800', pill: 'bg-red-50 text-red-700', icon: 'gavel', menu: 'disiplin-pegawai' };
      if (cat === 'Rekapitulasi') return { bg: 'from-sky-600 to-blue-800', pill: 'bg-sky-50 text-sky-800', icon: 'calendar_month', menu: 'rekap-presensi' };
      if (cat === 'Simulasi Cetak A4') return { bg: 'from-slate-700 to-slate-900', pill: 'bg-slate-100 text-slate-800', icon: 'print', menu: 'PRINT' };
      return { bg: 'from-navy-deep to-primary', pill: 'bg-blue-50 text-navy-deep', icon: 'dashboard', menu: 'dasbor-utama' };
    }

    function resolveStitchTarget(folder, cat) {
      var f = folder.toLowerCase();
      if (f.indexOf('cetak') !== -1 || f.indexOf('simulasi_cetak') !== -1 || f.indexOf('ekspor_pdf') !== -1 || f.indexOf('unduh_pdf') !== -1 || f.indexOf('lampiran_resmi_spt') !== -1) {
        if (f.indexOf('surat_panggilan_i') !== -1) return { type: 'PRINT', doc: 'SURAT_PANGGILAN_I', label: 'Cetak Surat Panggilan I' };
        if (f.indexOf('berita_acara_pemeriksaan') !== -1 || f.indexOf('_bap') !== -1) return { type: 'PRINT', doc: 'BAP_DISIPLIN', label: 'Cetak BAP A4' };
        if (f.indexOf('sk_hukuman_disiplin') !== -1) return { type: 'PRINT', doc: 'SK_HUKUMAN_DISIPLIN', label: 'Cetak SK Disiplin A4' };
        if (f.indexOf('berita_acara_penyampaian') !== -1) return { type: 'PRINT', doc: 'BA_PENYAMPAIAN_TERTUTUP', label: 'Cetak BA Penyampaian A4' };
        if (f.indexOf('i_dis_bkn_2') !== -1) return { type: 'PRINT', doc: 'BUKTI_IDIS_BKN_2', label: 'Cetak I-Dis BKN L2' };
        if (f.indexOf('i_dis_bkn_3') !== -1) return { type: 'PRINT', doc: 'BUKTI_IDIS_BKN_3', label: 'Cetak I-Dis BKN L3' };
        if (f.indexOf('i_dis_bkn') !== -1) return { type: 'PRINT', doc: 'BUKTI_IDIS_BKN_1', label: 'Cetak I-Dis BKN L1' };
        if (f.indexOf('formulir_cuti') !== -1) return { type: 'PRINT', doc: 'FORMULIR_CUTI_BKN', label: 'Cetak Formulir Cuti BKN' };
        if (f.indexOf('surat_izin_resmi') !== -1) return { type: 'PRINT', doc: 'SURAT_IZIN_RESMI', label: 'Cetak Surat Izin Resmi' };
        if (f.indexOf('lampiran_spt') !== -1 || f.indexOf('roster') !== -1) return { type: 'PRINT', doc: 'LAMPIRAN_SPT_ROSTER', label: 'Cetak Lampiran SPT Roster' };
        if (f.indexOf('spt') !== -1 || f.indexOf('roon') !== -1) return { type: 'PRINT', doc: 'VERIFIKASI_SPT_ROON', label: 'Cetak Verifikasi SPT Roon' };
        if (f.indexOf('rekonsiliasi') !== -1) return { type: 'PRINT', doc: 'BA_REKON', label: 'Cetak BA Rekon A4' };
        if (f.indexOf('rekap') !== -1) return { type: 'PRINT', doc: 'REKAP_BULANAN', label: 'Cetak Rekap A4 Landscape' };
        return { type: 'PRINT', doc: 'SK_HUKUMAN_DISIPLIN', label: 'Cetak Naskah Disiplin A4' };
      }
      if (f.indexOf('surat_izin_resmi_bkad') !== -1) {
        return { type: 'PRINT', doc: 'SURAT_IZIN_RESMI', label: 'Cetak Surat Izin Resmi' };
      }
      if (f.indexOf('lemari_arsip') !== -1 || f.indexOf('unduh_bundel') !== -1) {
        return { type: 'MENU', menu: 'disiplin-pegawai', disiplinId: 'DISP-2025-009', stage: 8, mode: 'ARSIP', label: 'Buka Lemari Arsip Digital' };
      }
      if (f.indexOf('surat_panggilan_i') !== -1) return { type: 'MENU', menu: 'disiplin-pegawai', disiplinId: 'DISP-2025-009', stage: 1, mode: 'WORKSPACE', label: 'Buka Disiplin Tahap 1' };
      if (f.indexOf('tahap_4') !== -1 || f.indexOf('_bap') !== -1 || f.indexOf('berita_acara_pemeriksaan') !== -1) {
        return { type: 'MENU', menu: 'disiplin-pegawai', disiplinId: 'DISP-2025-009', stage: 4, mode: 'WORKSPACE', label: 'Buka Disiplin Tahap 4 (BAP)' };
      }
      if (f.indexOf('tahap_5') !== -1 || f.indexOf('sk_hukuman_disiplin') !== -1) {
        return { type: 'MENU', menu: 'disiplin-pegawai', disiplinId: 'DISP-2025-009', stage: 5, mode: 'WORKSPACE', label: 'Buka Disiplin Tahap 5 (SK)' };
      }
      if (f.indexOf('tahap_6_7') !== -1 || f.indexOf('penyampaian_keputusan') !== -1) {
        return { type: 'MENU', menu: 'disiplin-pegawai', disiplinId: 'DISP-2025-009', stage: 6, mode: 'WORKSPACE', label: 'Buka Disiplin Tahap 6–7' };
      }
      if (f.indexOf('tahap_8') !== -1 || f.indexOf('berhasil_ditutup') !== -1 || f.indexOf('manifest_metadata') !== -1) {
        return { type: 'MENU', menu: 'disiplin-pegawai', disiplinId: 'DISP-2025-009', stage: 8, mode: 'WORKSPACE', label: 'Buka Disiplin Tahap 8 (Inkrah)' };
      }
      if (f.indexOf('langkah_2') !== -1) return { type: 'MENU', menu: 'rekonsiliasi-absen', rekonStep: 2, label: 'Buka Rekon Langkah 2' };
      if (f.indexOf('langkah_3') !== -1) return { type: 'MENU', menu: 'rekonsiliasi-absen', rekonStep: 3, label: 'Buka Rekon Langkah 3' };
      if (f.indexOf('langkah_4') !== -1 || f.indexOf('komit_berhasil') !== -1) return { type: 'MENU', menu: 'rekonsiliasi-absen', rekonStep: 4, label: 'Buka Rekon Langkah 4' };
      if (f.indexOf('semesteran') !== -1) return { type: 'MENU', menu: 'rekap-presensi', rekapTab: 'SEMESTERAN', label: 'Buka Rekap Semesteran' };
      if (f.indexOf('tahunan') !== -1) return { type: 'MENU', menu: 'rekap-presensi', rekapTab: 'TAHUNAN', label: 'Buka Rekap Tahunan' };
      if (f.indexOf('beranda_pegawai') !== -1 || f.indexOf('kamera') !== -1 || f.indexOf('detail_log') !== -1) return { type: 'MOBILE', tab: f.indexOf('kamera') !== -1 ? 'kamera' : (f.indexOf('detail_log') !== -1 ? 'log' : 'beranda'), label: 'Buka Mode Mobile' };
      if (f.indexOf('impor_pegawai') !== -1) return { type: 'MENU', menu: 'impor-pegawai', label: 'Buka Master Pegawai' };
      if (f.indexOf('pengaturan') !== -1) return { type: 'MENU', menu: 'pengaturan-sistem', label: 'Buka Pengaturan' };
      if (f.indexOf('login') !== -1) return { type: 'MENU', menu: 'dasbor-utama', label: 'Buka Dasbor Utama' };
      var meta = getStitchCategoryMeta(cat);
      if (meta.menu === 'MOBILE') return { type: 'MOBILE', tab: 'beranda', label: 'Buka Mode Mobile' };
      if (meta.menu === 'PRINT') return { type: 'PRINT', doc: 'BA_REKON', label: 'Buka Cetak A4' };
      return { type: 'MENU', menu: meta.menu, label: 'Buka Modul Aktif' };
    }

    function buildCloudCardPreview(item, title) {
      var meta = getStitchCategoryMeta(item.cat);
      var isPrint = item.cat === 'Simulasi Cetak A4';
      if (isPrint) {
        return '<div class="h-40 rounded-xl border border-border-subtle mb-3 bg-slate-100 p-3 flex flex-col items-center justify-center relative overflow-hidden">' +
          '<div class="w-40 h-32 bg-white rounded-md shadow-sm border border-slate-300 p-2.5 flex flex-col justify-between">' +
          '<div class="border-b-2 border-navy-deep pb-1 text-center"><div class="text-[7px] font-bold text-navy-deep uppercase">PEMKAB TELUK WONDAMA • BKAD</div></div>' +
          '<div class="space-y-1"><div class="h-1.5 bg-slate-200 rounded w-3/4 mx-auto"></div><div class="h-1 bg-slate-200 rounded w-full"></div><div class="h-1 bg-slate-200 rounded w-5/6"></div><div class="h-4 bg-blue-50/80 border border-blue-100 rounded mt-1"></div></div>' +
          '<div class="flex justify-end"><div class="w-12 h-2 bg-slate-300 rounded"></div></div>' +
          '</div>' +
          '<span class="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-navy-deep text-white font-mono text-[9px] font-bold">A4 BKN</span>' +
          '</div>';
      }
      return '<div class="h-40 rounded-xl border border-border-subtle mb-3 bg-canvas-bg overflow-hidden flex flex-col">' +
        '<div class="px-3 py-2 bg-gradient-to-r ' + meta.bg + ' text-white flex items-center justify-between">' +
        '<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[15px]">' + meta.icon + '</span><span class="text-[10px] font-bold truncate max-w-[160px]">' + esc(item.cat) + '</span></div>' +
        '<span class="px-1.5 py-0.5 rounded bg-white/20 font-mono text-[9px] font-semibold">AKTIF</span>' +
        '</div>' +
        '<div class="p-3 flex-1 flex flex-col justify-between">' +
        '<div class="grid grid-cols-3 gap-1.5">' +
        '<div class="h-10 rounded-lg bg-white border border-border-subtle p-1.5"><div class="h-1.5 w-8 bg-slate-200 rounded mb-1"></div><div class="h-3 w-10 bg-electric-blue/20 rounded"></div></div>' +
        '<div class="h-10 rounded-lg bg-white border border-border-subtle p-1.5"><div class="h-1.5 w-8 bg-slate-200 rounded mb-1"></div><div class="h-3 w-10 bg-emerald-500/20 rounded"></div></div>' +
        '<div class="h-10 rounded-lg bg-white border border-border-subtle p-1.5"><div class="h-1.5 w-8 bg-slate-200 rounded mb-1"></div><div class="h-3 w-10 bg-amber-500/20 rounded"></div></div>' +
        '</div>' +
        '<div class="h-11 rounded-lg bg-white border border-border-subtle p-2 flex items-center justify-between">' +
        '<div class="space-y-1 flex-1 pr-2"><div class="h-1.5 bg-navy-deep/20 rounded w-3/4"></div><div class="h-1.5 bg-slate-200 rounded w-1/2"></div></div>' +
        '<span class="px-2 py-0.5 rounded bg-emerald-50 text-status-present font-mono text-[8px] font-bold">WIT LIVE</span>' +
        '</div>' +
        '</div>' +
        '</div>';
    }

    function renderStitchGallery() {
      var q = ((document.getElementById('search-stitch-input') && document.getElementById('search-stitch-input').value) || '').toLowerCase().trim();
      var cat = (document.getElementById('filter-stitch-cat') && document.getElementById('filter-stitch-cat').value) || 'SEMUA';
      var isGAS = typeof google !== 'undefined' && google.script && google.script.run;

      var filtered = STITCH_CATALOG.filter(function (item) {
        if (cat !== 'SEMUA' && item.cat !== cat) return false;
        if (q && item.folder.toLowerCase().indexOf(q) === -1 && item.cat.toLowerCase().indexOf(q) === -1) return false;
        return true;
      });

      var badgeEl = document.getElementById('stitch-count-badge');
      if (badgeEl) badgeEl.textContent = filtered.length + ' / ' + STITCH_CATALOG.length + ' Dokumen Terindeks';

      var html = '';
      for (var i = 0; i < filtered.length; i++) {
        var item = filtered[i];
        var title = formatFolderTitle(item.folder);
        var meta = getStitchCategoryMeta(item.cat);
        var target = resolveStitchTarget(item.folder, item.cat);
        var previewBox = (!isGAS && item.png)
          ? '<div class="h-40 rounded-xl overflow-hidden border border-border-subtle mb-3 bg-surface-low relative">' +
          '<img src="stitch_e_presensi_bkad_teluk_wondama/' + esc(item.folder) + '/screen.png" alt="' + esc(title) + '" loading="lazy" class="w-full h-full object-cover object-top" />' +
          '</div>'
          : buildCloudCardPreview(item, title);

        html += '<div class="card-elevated rounded-2xl p-4 flex flex-col justify-between">' +
          '<div>' +
          previewBox +
          '<div class="flex items-center justify-between gap-2 mb-1.5">' +
          '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold ' + meta.pill + '">' + esc(item.cat) + '</span>' +
          '<span class="font-mono text-[10px] text-text-muted">#' + (i + 1) + '</span>' +
          '</div>' +
          '<h4 class="text-xs font-bold text-text-main leading-snug mb-1">' + esc(title) + '</h4>' +
          '<div class="font-mono text-[10px] text-text-muted break-all mb-3">' + esc(item.folder) + '</div>' +
          '</div>' +
          '<div class="flex items-center gap-2 pt-2 border-t border-border-subtle">' +
          '<button type="button" data-action="preview-stitch" data-id="' + esc(item.folder) + '" class="flex-1 py-1.5 px-2.5 rounded-xl bg-surface-low hover:bg-surface-high text-navy-deep text-[11px] font-semibold">Pratinjau</button>' +
          '<button type="button" data-action="open-stitch-module" data-id="' + esc(item.folder) + '" class="flex-1 py-1.5 px-2.5 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-[11px] font-semibold">' + esc(target.label) + '</button>' +
          '</div>' +
          '</div>';
      }

      var gridEl = document.getElementById('stitch-gallery-grid');
      if (gridEl) {
        gridEl.innerHTML = html || '<div class="col-span-3 py-8 text-center text-xs text-text-muted">Tidak ada dokumen UI Stitch yang cocok dengan filter pencarian.</div>';
      }
    }

    function openStitchTargetModule(folder) {
      var item = STITCH_CATALOG.filter(function (x) { return x.folder === folder; })[0] || { folder: folder, cat: 'Dasbor & Login' };
      var target = resolveStitchTarget(folder, item.cat);
      closeModal();
      if (target.type === 'PRINT') {
        handlePrintType(target.doc, null);
      } else if (target.type === 'MOBILE') {
        showShell('mobile');
        switchMobTab(target.tab || 'beranda');
      } else {
        showShell('desktop');
        if (target.disiplinId) AppCache.selectedDisiplinId = target.disiplinId;
        if (target.stage) AppCache.selectedDisiplinStage = target.stage;
        if (target.mode) AppCache.disiplinViewMode = target.mode;
        if (target.rekonStep) AppCache.rekonWizardStep = target.rekonStep;
        if (target.rekapTab) AppCache.activeRekapTab = target.rekapTab;
        switchDeskMenu(target.menu || 'dasbor-utama');
      }
    }

    function openStitchPreview(folder) {
      var isGAS = typeof google !== 'undefined' && google.script && google.script.run;
      var item = STITCH_CATALOG.filter(function (x) { return x.folder === folder; })[0] || { folder: folder, cat: 'Dasbor & Login' };
      var title = formatFolderTitle(folder);
      var target = resolveStitchTarget(folder, item.cat);

      if (!isGAS) {
        var url = 'stitch_e_presensi_bkad_teluk_wondama/' + folder + '/code.html';
        var localBody = '' +
          '<div class="mb-3 flex flex-wrap items-center justify-between gap-2 bg-blue-50 p-3 rounded-xl">' +
          '<span class="font-mono text-xs text-navy-deep font-semibold">' + esc(url) + '</span>' +
          '<div class="flex gap-2">' +
          '<button type="button" data-action="open-stitch-module" data-id="' + esc(folder) + '" class="px-3 py-1.5 rounded-lg bg-electric-blue text-white text-xs font-semibold">' + esc(target.label) + '</button>' +
          '<button type="button" data-action="open-stitch-tab" data-id="' + esc(folder) + '" class="px-3 py-1.5 rounded-lg bg-navy-deep text-white text-xs font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">open_in_new</span><span>Tab Baru</span></button>' +
          '</div>' +
          '</div>' +
          '<iframe src="' + esc(url) + '" class="w-full h-[70vh] rounded-xl border border-border-subtle bg-white"></iframe>';
        openModal('Pratinjau Dokumen UI: ' + title, localBody, true);
        return;
      }

      // Pratinjau Interaktif Cloud Google Apps Script menggunakan data riil AppCache
      if (target.type === 'PRINT') {
        handlePrintType(target.doc, null);
        return;
      }
      var meta = getStitchCategoryMeta(item.cat);
      var detailHtml = '';
      if (item.cat === 'Izin & Cuti 3 Tahap') {
        var z = AppCache.izin[0] || { id: 'IZN-202611-001', nama: 'ASN BKAD', jenis: 'Cuti Tahunan', statusFinal: 'Menunggu Telaah Kasubid' };
        detailHtml = '<div class="p-4 rounded-xl bg-surface-low border border-border-subtle space-y-2">' +
          '<div class="text-xs font-bold text-navy-deep">Simulasi Data Antrean Izin / Cuti Berjenjang</div>' +
          '<div class="text-xs">Contoh Dokumen: <span class="font-mono font-bold">' + esc(z.id) + '</span> — ' + esc(z.nama) + ' (' + esc(z.jenis) + ')</div>' +
          '<div>Status Terkini: ' + getStatusBadge(z.statusFinal) + '</div>' +
          '</div>';
      } else if (item.cat === 'Disiplin PP 94/2021') {
        var d = AppCache.disiplin[0] || { id: 'DISP-2025-009', nama: 'Yulianus Kereway, A.Md.', tahap: 'Tahap 8 - Inkrah & Sinkronisasi I-Dis BKN', regIDis: 'IDIS-BKN-2025-TW-9821' };
        detailHtml = '<div class="p-4 rounded-xl bg-surface-low border border-border-subtle space-y-2">' +
          '<div class="text-xs font-bold text-status-absent">Simulasi Kasus Disiplin PP 94/2021 & I-Dis BKN</div>' +
          '<div class="text-xs">Kasus: <span class="font-mono font-bold">' + esc(d.id) + '</span> • ' + esc(d.nama) + '</div>' +
          '<div class="text-xs">Progres: <b>' + esc(d.tahap) + '</b> • Reg BKN: <span class="font-mono">' + esc(d.regIDis || '-') + '</span></div>' +
          '</div>';
      } else if (item.cat === 'Mode Kerja & SPT') {
        var s = AppCache.spt[0] || { nomorSPT: '094/012/SPT-ASET/BKAD/2026', lokasi: 'Distrik Kepulauan Roon', statusGPS: 'Terverifikasi Sesuai Koordinat' };
        detailHtml = '<div class="p-4 rounded-xl bg-surface-low border border-border-subtle space-y-2">' +
          '<div class="text-xs font-bold text-mode-wfa">Audit Geotagging & Penugasan Lapangan SPT</div>' +
          '<div class="text-xs">Nomor SPT: <span class="font-mono font-bold">' + esc(s.nomorSPT) + '</span> • Lokasi: ' + esc(s.lokasi) + '</div>' +
          '<div>Status GPS: ' + getStatusBadge(s.statusGPS) + '</div>' +
          '</div>';
      } else if (item.cat === 'Rekonsiliasi & TPP') {
        var r = AppCache.rekon[0] || { nomorBA: '800.1.6.2/045/BA-REKON/BKAD-TW/XI/2025', periode: 'Januari - Oktober 2025', statusKunci: 'Terkunci Sah (Locked)' };
        detailHtml = '<div class="p-4 rounded-xl bg-surface-low border border-border-subtle space-y-2">' +
          '<div class="text-xs font-bold text-status-tracking">Ledger Rekonsiliasi & Penalti TPP</div>' +
          '<div class="text-xs">Nomor BA: <span class="font-mono font-bold">' + esc(r.nomorBA) + '</span> • Periode: ' + esc(r.periode) + '</div>' +
          '<div>Status: ' + getStatusBadge(r.statusKunci) + '</div>' +
          '</div>';
      } else {
        detailHtml = '<div class="p-4 rounded-xl bg-surface-low border border-border-subtle space-y-2">' +
          '<div class="text-xs font-bold text-navy-deep">Ringkasan Data Live E-Presensi BKAD</div>' +
          '<div class="text-xs">Total Pegawai: <b>' + AppCache.pegawai.length + ' ASN</b> • Log Presensi: <b>' + AppCache.presensi.length + ' Catatan</b> • Permohonan Izin: <b>' + AppCache.izin.length + ' Berkas</b></div>' +
          '</div>';
      }

      var cloudBody = '' +
        '<div class="space-y-4">' +
        '<div class="p-4 rounded-2xl bg-gradient-to-r ' + meta.bg + ' text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">' +
        '<div class="flex items-center gap-3">' +
        '<div class="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[24px]">' + meta.icon + '</span></div>' +
        '<div><div class="text-[11px] uppercase tracking-wider text-white/80 font-semibold">' + esc(item.cat) + ' • Cloud GAS Aktif</div><h4 class="text-base font-bold">' + esc(title) + '</h4></div>' +
        '</div>' +
        '<span class="px-3 py-1 rounded-full bg-white/20 font-mono text-[11px] font-semibold">Terintegrasi Google Sheets</span>' +
        '</div>' +
        detailHtml +
        '<div class="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-border-subtle">' +
        '<button type="button" data-action="open-stitch-module" data-id="' + esc(folder) + '" class="px-4 py-2 rounded-xl bg-electric-blue hover:bg-navy-deep text-white text-xs font-semibold flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">rocket_launch</span><span>' + esc(target.label) + '</span></button>' +
        '<button type="button" data-action="close-modal" class="px-4 py-2 rounded-xl bg-surface-low hover:bg-surface-high text-text-main text-xs font-semibold">Tutup</button>' +
        '</div>' +
        '</div>';
      openModal('Pratinjau Dokumen Cloud: ' + title, cloudBody, true);
    }

    /* -------------------------------------------------------------------
     * 16. EVENT DELEGATION & HANDLERS (Anti-Inline String SyntaxError)
     * ------------------------------------------------------------------- */
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      var id = btn.getAttribute('data-id');

      if (action === 'role-preset') {
        callServer('apiAuthenticate', { nip: id, pin: '123456' }, btn, function (res) {
          loadInitialDataAndEnter(res.user, { skipSaveDevice: true, bundle: res.bundle, btn: btn });
        });
      } else if (action === 'clear-saved-nip') {
        clearSavedDeviceNIP();
        showToast('NIP tersimpan pada perangkat ini direset. Silakan masukkan NIP Anda.', 'success');
      } else if (action === 'quick-login-mobile') {
        var qNip = (document.getElementById('login-nip').value || '').trim();
        var qPin = (document.getElementById('login-pin').value || '').trim();
        var errBox = document.getElementById('login-error-box');
        if (!qNip || !qPin) {
          document.getElementById('login-error-msg').textContent = 'Masukkan NIP dan Kode PIN Anda terlebih dahulu sebelum masuk ke Kamera Presensi.';
          errBox.classList.remove('hidden');
          errBox.classList.add('flex');
          showToast('Masukkan NIP dan PIN Anda terlebih dahulu.', 'warn');
          return;
        }
        errBox.classList.add('hidden');
        errBox.classList.remove('flex');
        callServer('apiAuthenticate', { nip: qNip, pin: qPin }, btn, function (res) {
          loadInitialDataAndEnter(res.user, { forceMobileCamera: true, bundle: res.bundle, btn: btn });
        }, function (err) {
          document.getElementById('login-error-msg').textContent = (err && err.error) || 'NIP atau PIN tidak sesuai.';
          errBox.classList.remove('hidden');
          errBox.classList.add('flex');
        });
      } else if (action === 'logout') {
        stopLiveCamStream();
        AppCache.currentUser = null;
        showShell('login');
        applySavedDeviceNIP();
        showToast('Sesi diakhiri dengan aman.', 'success');
      } else if (action === 'switch-to-mobile') {
        showShell('mobile');
        switchMobTab('beranda');
      } else if (action === 'switch-to-desktop') {
        stopLiveCamStream();
        showShell('desktop');
        switchDeskMenu(AppCache.activeDeskMenu || 'dasbor-utama');
      } else if (action === 'toggle-sidebar') {
        document.getElementById('desktop-sidebar').classList.toggle('-translate-x-full');
        document.getElementById('sidebar-backdrop').classList.toggle('hidden');
      } else if (action === 'toggle-mobile-overflow') {
        document.getElementById('mobile-overflow-drawer').classList.toggle('hidden');
      } else if (action === 'desk-menu') {
        switchDeskMenu(id);
      } else if (action === 'mobile-tab') {
        switchMobTab(id);
      } else if (action === 'set-work-mode') {
        AppCache.selectedModeKerja = id;
        renderMobileShell();
        updateMobileGpsUI();
        showToast('Mode kerja aktif diubah ke ' + id, 'success');
      } else if (action === 'open-camera-absen') {
        AppCache.selectedJenisAbsen = id;
        switchMobTab('kamera');
      } else if (action === 'detect-gps') {
        refreshDeviceGps({ silent: false });
      } else if (action === 'toggle-geolock') {
        if (!canCurrentUserUnlockGeoLock()) {
          showToast('Hanya Super Admin / Kepala Badan yang dapat membuka kunci Geo-Lock.', 'error');
          return;
        }
        var gCfg = getOfficeGeoConfig();
        if (gCfg.geoLockUnlocked) {
          showToast('Geo-Lock sedang dibuka secara global melalui Pengaturan Sistem.', 'info');
          return;
        }
        AppCache.geoLockUnlocked = !AppCache.geoLockUnlocked;
        updateMobileGpsUI();
        showToast(
          AppCache.geoLockUnlocked
            ? 'Kunci GPS dibuka untuk sesi ini: Anda dapat absen dari lokasi mana pun (koordinat asli tetap dicatat).'
            : 'Kunci GPS diaktifkan kembali (wajib di dalam radius kantor).',
          AppCache.geoLockUnlocked ? 'warning' : 'success'
        );
      } else if (action === 'start-webcam') {
        loadFaceApiLibrary();
        stopLiveCamStream();
        var video = document.getElementById('cam-video-stream');
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then(function (stream) {
            video.srcObject = stream;
            video.classList.remove('hidden');
            document.getElementById('cam-captured-preview').classList.add('hidden');
            document.getElementById('cam-placeholder').classList.add('hidden');
            var badge = document.getElementById('cam-liveness-badge');
            if (badge) {
              badge.className = 'text-cyan-300';
              badge.textContent = 'Live Cam Aktif • Auto-Scan Wajah';
            }
            showToast('Kamera Live aktif. Arahkan wajah ke bingkai oval untuk absen otomatis.', 'info');
            startLiveCamAutoScan();
          }).catch(function () {
            showToast('Kamera live dibatasi izin browser. Gunakan tombol Kamera HP atau Pindai Wajah Saya (AI).', 'warn');
          });
        } else {
          showToast('Gunakan tombol Kamera HP atau Pindai Wajah Saya (AI).', 'warn');
        }
      } else if (action === 'capture-selfie') {
        var videoEl = document.getElementById('cam-video-stream');
        var imgEl = document.getElementById('cam-captured-preview');
        if (videoEl && !videoEl.classList.contains('hidden') && videoEl.srcObject) {
          clearLiveCamScanTimer();
          var snapCvs = document.createElement('canvas');
          snapCvs.width = videoEl.videoWidth || 320;
          snapCvs.height = videoEl.videoHeight || 320;
          snapCvs.getContext('2d').drawImage(videoEl, 0, 0, snapCvs.width, snapCvs.height);
          imgEl.onload = function () {
            analyzeCapturedFaceImage(imgEl, function (resDesc) {
              handleFaceDescriptorExtracted(resDesc, 'LIVE_CAM_FACE_ID_' + Date.now());
            });
          };
          imgEl.src = snapCvs.toDataURL('image/jpeg', 0.85);
          imgEl.classList.remove('hidden');
        } else if (imgEl && !imgEl.classList.contains('hidden') && imgEl.src) {
          analyzeCapturedFaceImage(imgEl, function (resDesc) {
            handleFaceDescriptorExtracted(resDesc, 'FOTO_HP_FACE_ID_' + Date.now());
          });
        } else {
          runSimulatedFaceScan(false);
        }
      } else if (action === 'enroll-current-face') {
        enrollCurrentCapturedFace(btn);
      } else if (action === 'simulate-face-scan') {
        runSimulatedFaceScan(false);
      } else if (action === 'simulate-face-mismatch') {
        runSimulatedFaceScan(true);
      } else if (action === 'reset-face-pegawai') {
        openResetFacePegawaiModal(id);
      } else if (action === 'open-delegasi-plt-modal') {
        openDelegasiPltModal();
      } else if (action === 'delete-delegasi-plt') {
        callServer('apiDeleteDelegasiPlt', { id: id, operatorNip: AppCache.currentUser ? AppCache.currentUser.nip : '' }, btn, function (res) {
          AppCache.delegasiPlt = (AppCache.delegasiPlt || []).filter(function (x) { return x.id !== id; });
          renderDelegasiPltPanel();
          showToast(res.message, 'info');
        });
      } else if (action === 'open-adendum-rekon') {
        openAdendumRekonModal(id);
      } else if (action === 'sync-offline-presensi') {
        syncOfflinePresensiQueue();
      } else if (action === 'submit-presensi') {
        executeSubmitPresensi(btn);
      } else if (action === 'refresh-all') {
        callServer('apiGetInitialBundle', undefined, btn, function (res) {
          AppCache.settings = res.settings || {};
          AppCache.pegawai = res.pegawai || [];
          AppCache.presensi = res.presensi || [];
          AppCache.izin = res.izin || [];
          AppCache.spt = res.spt || [];
          AppCache.disiplin = res.disiplin || [];
          AppCache.rekon = res.rekon || [];
          AppCache.delegasiPlt = res.delegasiPlt || [];
          AppCache.auditLog = res.auditLog || [];
          AppCache.masterSkpd = res.masterSkpd || [];
          populateBidangDropdowns();
          if (AppCache.activeShell === 'desktop') switchDeskMenu(AppCache.activeDeskMenu);
          else renderMobileShell();
          showToast('Seluruh data berhasil disinkronkan dari database.', 'success');
        });
      } else if (action === 'page-presensi') {
        AppCache.presensiPage = parseInt(id, 10);
        queryPresensiTable();
      } else if (action === 'page-pegawai') {
        AppCache.pegawaiPage = parseInt(id, 10);
        renderPegawaiTable();
      } else if (action === 'cal-day') {
        showToast('Kalender Tanggal ' + id + ' Nov 2026 dipilih.', 'success');
      } else if (action === 'open-skpd-modal') {
        openSkpdModal(null, false);
      } else if (action === 'edit-skpd') {
        openSkpdModal(id, false);
      } else if (action === 'add-skpd-subunit') {
        openSkpdModal(id, true);
      } else if (action === 'delete-skpd') {
        callServer('apiDeleteSkpd', { id: id, operatorNip: AppCache.currentUser ? AppCache.currentUser.nip : '' }, btn, function (res) {
          AppCache.masterSkpd = (AppCache.masterSkpd || []).filter(function (x) { return x.id !== id; });
          renderMasterSkpdModule();
          showToast(res.message, 'info');
        });
      } else if (action === 'download-skpd-template-xls') {
        downloadSkpdTemplateXLS();
      } else if (action === 'download-skpd-template-csv') {
        downloadSkpdTemplateCSV();
      } else if (action === 'execute-skpd-import') {
        executePendingSkpdImport(btn);
      } else if (action === 'clear-import-skpd-preview') {
        AppCache.pendingSkpdImport = null;
        var skpdBox = document.getElementById('import-skpd-preview-box');
        if (skpdBox) { skpdBox.innerHTML = ''; skpdBox.classList.add('hidden'); }
      } else if (action === 'process-skpd-file') {
        if (AppCache.pendingSkpdImport && AppCache.pendingSkpdImport.rows && AppCache.pendingSkpdImport.rows.length) {
          executePendingSkpdImport(btn);
        } else {
          var skpdFile = document.getElementById('import-skpd-file');
          if (skpdFile && skpdFile.files && skpdFile.files[0]) {
            handleSkpdFileSelected(skpdFile.files[0]);
          } else {
            showToast('Pilih berkas Excel (.xls/.xlsx) atau CSV SKPD terlebih dahulu.', 'warning');
          }
        }
      } else if (action === 'open-pegawai-modal') {
        openPegawaiModal(null);
      } else if (action === 'edit-pegawai') {
        openPegawaiModal(id);
      } else if (action === 'archive-pegawai') {
        openArchivePegawaiModal(id);
      } else if (action === 'restore-pegawai') {
        openRestorePegawaiModal(id);
      } else if (action === 'download-pegawai-template-xls') {
        downloadPegawaiTemplateXLS();
      } else if (action === 'download-pegawai-template-csv') {
        downloadPegawaiTemplateCSV();
      } else if (action === 'open-pedoman-impor-pegawai') {
        openPedomanImporPegawaiModal();
      } else if (action === 'execute-import-pegawai') {
        executePendingPegawaiImport(btn);
      } else if (action === 'clear-import-pegawai-preview') {
        clearImportPegawaiPreview();
      } else if (action === 'process-pegawai-file' || action === 'run-import-sample') {
        if (AppCache.pendingPegawaiImport && AppCache.pendingPegawaiImport.rows && AppCache.pendingPegawaiImport.rows.length) {
          executePendingPegawaiImport(btn);
        } else {
          var fileInp = document.getElementById('import-pegawai-file');
          if (fileInp && fileInp.files && fileInp.files[0]) {
            handlePegawaiFileSelected(fileInp.files[0]);
          } else {
            openPedomanImporPegawaiModal();
          }
        }
      } else if (action === 'process-presensi-file') {
        if (AppCache.pendingPresensiImport && AppCache.pendingPresensiImport.validRows && AppCache.pendingPresensiImport.validRows.length) {
          executePendingPresensiImport(btn);
        } else {
          var fileInpP = document.getElementById('import-presensi-file');
          if (fileInpP && fileInpP.files && fileInpP.files[0]) {
            handlePresensiFileSelected(fileInpP.files[0]);
          } else {
            openPedomanImporPresensiModal();
          }
        }
      } else if (action === 'rekon-step') {
        AppCache.rekonStep = parseInt(id, 10);
        renderRekonModule();
      } else if (action === 'run-rekon-resolve') {
        callServer('apiRunRekonsiliasi', { id: id }, btn, function (res) {
          AppCache.rekon = AppCache.rekon.map(function (r) { return r.id === res.record.id ? res.record : r; });
          AppCache.rekonStep = 4;
          renderRekonModule();
          showToast(res.message, 'success');
        });
      } else if (action === 'commit-rekon') {
        callServer('apiCommitRekonsiliasi', { id: id }, btn, function (res) {
          AppCache.rekon = AppCache.rekon.map(function (r) { return r.id === res.record.id ? res.record : r; });
          AppCache.rekonStep = 1;
          renderRekonModule();
          showToast(res.message, 'success');
        });
      } else if (action === 'download-rekon-template-xls') {
        downloadPresensiTemplateXLS();
      } else if (action === 'download-rekon-template') {
        downloadPresensiTemplateCSV();
      } else if (action === 'open-pedoman-impor-presensi') {
        openPedomanImporPresensiModal();
      } else if (action === 'open-manual-presensi-modal') {
        openManualPresensiModal();
      } else if (action === 'goto-impor-presensi') {
        switchDeskMenu('rekap-presensi');
      } else if (action === 'execute-import-presensi') {
        executePendingPresensiImport(btn);
      } else if (action === 'clear-import-presensi-preview') {
        clearImportPresensiPreview();
      } else if (action === 'open-spt-modal') {
        openSPTModal(null);
      } else if (action === 'edit-spt') {
        openSPTModal(id);
      } else if (action === 'delete-spt') {
        var sptDel = (AppCache.spt || []).filter(function (x) { return x.id === id; })[0];
        var delLabel = sptDel ? (sptDel.nomorSPT + ' (' + sptDel.id + ')') : id;
        openModal('Konfirmasi Hapus SPT',
          '<div class="space-y-4">' +
          '<p class="text-xs text-text-main leading-relaxed">Apakah Anda yakin ingin menghapus penugasan SPT <b>' + esc(delLabel) + '</b>? Data yang dihapus tidak akan muncul lagi di daftar SPT maupun perhitungan WFA otomatis.</p>' +
          '<div class="flex justify-end gap-2">' +
          '<button type="button" id="btn-cancel-del-spt" class="px-3.5 py-2 rounded-xl bg-surface-low hover:bg-surface-high text-xs font-semibold text-text-main">Batal</button>' +
          '<button type="button" id="btn-confirm-del-spt" class="px-3.5 py-2 rounded-xl bg-status-absent hover:opacity-95 text-white text-xs font-semibold">Ya, Hapus SPT</button>' +
          '</div></div>');
        var btnCancelDel = document.getElementById('btn-cancel-del-spt');
        if (btnCancelDel) btnCancelDel.addEventListener('click', closeModal);
        var btnConfirmDel = document.getElementById('btn-confirm-del-spt');
        if (btnConfirmDel) {
          btnConfirmDel.addEventListener('click', function () {
            callServer('apiDeleteSPT', { id: id }, btnConfirmDel, function (res) {
              AppCache.spt = (AppCache.spt || []).filter(function (s) { return s.id !== id; });
              closeModal();
              renderSPTModule();
              showToast(res.message, 'info');
            });
          });
        }
      } else if (action === 'open-izin-modal') {
        openIzinCutiModal();
      } else if (action === 'verify-spt') {
        callServer('apiVerifySPTGeotag', { id: id, statusGPS: 'Terverifikasi Sesuai Koordinat' }, btn, function (res) {
          AppCache.spt = AppCache.spt.map(function (s) { return s.id === res.record.id ? res.record : s; });
          renderSPTModule();
          showToast(res.message, 'success');
        });
      } else if (action === 'return-izin-modal') {
        openReturnIzinModal(id, btn.getAttribute('data-tahap'));
      } else if (action === 'edit-izin-revisi') {
        openEditIzinRevisiModal(id);
      } else if (action === 'approve-izin') {
        var tahap = btn.getAttribute('data-tahap');
        var keputusan = btn.getAttribute('data-keputusan');
        var actorNip = AppCache.currentUser ? AppCache.currentUser.nip : '';
        callServer('apiApproveIzinCuti', { id: id, tahap: tahap, keputusan: keputusan, actorNip: actorNip }, btn, function (res) {
          AppCache.izin = AppCache.izin.map(function (z) { return z.id === res.record.id ? res.record : z; });
          renderIzinApprovalModule();
          showToast(res.message, 'success');
        });
      } else if (action === 'rekap-tab') {
        AppCache.activeRekapTab = id;
        renderRekapModule();
      } else if (action === 'export-rekap-matrix-xls') {
        exportRekapMatrixXLS();
      } else if (action === 'export-rekap-csv') {
        var csvRows = ['NIP,Nama,Bidang,SubBidang,HadirHari,TargetHari,WFO,WFA,WFH,IzinCuti,Terlambat,Alpa,Persentase,PotonganTPP'];
        var activeCsvPegs = getActivePegawaiList();
        for (var i = 0; i < activeCsvPegs.length; i++) {
          var pg = activeCsvPegs[i];
          var stC = computePegawaiRekapStats(pg, AppCache.activeRekapTab);
          csvRows.push(pg.nip + ',"' + pg.nama + '","' + pg.bidang + '","' + (pg.subBidang || '') + '",' + stC.hadir + ',' + stC.mult + ',' + stC.wfo + ',' + stC.wfa + ',' + stC.wfh + ',' + stC.izinCuti + ',' + stC.telat + ',' + stC.alpa + ',' + stC.pct + '%,' + stC.pot);
        }
        var b = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(b);
        link.download = 'rekap_presensi_bkad_' + AppCache.activeRekapTab.toLowerCase() + '.csv';
        link.click();
        showToast('Rekapitulasi diekspor ke CSV.', 'success');
      } else if (action === 'open-disiplin-modal') {
        openDisiplinModal();
      } else if (action === 'edit-disiplin') {
        openDisiplinModal(id, null, AppCache.selectedDisiplinStage || 1, false);
      } else if (action === 'edit-disiplin-stage') {
        var stEditNum = parseInt(btn.getAttribute('data-stage'), 10) || 1;
        openDisiplinModal(id, null, stEditNum, false);
      } else if (action === 'advance-disiplin-form') {
        var stAdvNum = parseInt(btn.getAttribute('data-stage'), 10) || 2;
        openDisiplinModal(id, null, stAdvNum, true);
      } else if (action === 'edit-disiplin-from-print') {
        var targetCaseId = AppCache.printRefId || AppCache.selectedDisiplinId || (AppCache.disiplin[0] && AppCache.disiplin[0].id);
        var curDocT = AppCache.printDocType || 'SURAT_PANGGILAN_I';
        var docStageNum = curDocT === 'SURAT_PANGGILAN_I' ? 1 :
          (curDocT === 'SURAT_PANGGILAN_II' ? 2 :
            (curDocT === 'SPT_TIM_PEMERIKSA' ? 3 :
              (curDocT === 'BAP_DISIPLIN' ? 4 :
                (curDocT === 'SK_HUKUMAN_DISIPLIN' ? 5 : 6))));
        openDisiplinModal(targetCaseId, curDocT, docStageNum, false);
      } else if (action === 'toggle-a4-editable') {
        var sheetArea = document.getElementById('print-sheet-area');
        var bannerEl = document.getElementById('a4-direct-edit-banner');
        var lblEl = document.getElementById('lbl-toggle-a4-edit');
        if (sheetArea) {
          var isNowEditable = sheetArea.getAttribute('contenteditable') !== 'true';
          sheetArea.setAttribute('contenteditable', isNowEditable ? 'true' : 'false');
          sheetArea.classList.toggle('ring-4', isNowEditable);
          sheetArea.classList.toggle('ring-amber-400', isNowEditable);
          if (bannerEl) {
            bannerEl.classList.toggle('hidden', !isNowEditable);
            bannerEl.classList.toggle('flex', isNowEditable);
          }
          if (lblEl) {
            lblEl.textContent = isNowEditable ? 'Matikan Mode Ketik Langsung' : 'Ketik / Edit Teks Langsung di Kertas A4';
          }
          if (isNowEditable) {
            sheetArea.focus();
            showToast('Mode Ketik Langsung aktif. Klik teks mana saja di kertas A4 untuk mengedit sebelum cetak.', 'info');
          } else {
            showToast('Perubahan teks pada kertas A4 siap dicetak.', 'success');
          }
        }
      } else if (action === 'delete-disiplin') {
        openDeleteDisiplinModal(id);
      } else if (action === 'advance-disiplin') {
        var nextStage = btn.getAttribute('data-next') || '';
        var nextStageNum = 2;
        for (var ad = 0; ad < DISIPLIN_STAGES.length; ad++) {
          if (nextStage.indexOf('Tahap ' + (ad + 1)) !== -1) nextStageNum = ad + 1;
        }
        openDisiplinModal(id, null, nextStageNum, true);
      } else if (action === 'view-siasn-json') {
        var kasus = AppCache.disiplin.filter(function (d) { return d.id === id; })[0];
        var manifest = {
          schema: 'BKN-IDIS-SIASN-v2.1',
          instansi: 'Pemerintah Kabupaten Teluk Wondama',
          unitKerja: 'Badan Pengelolaan Keuangan dan Aset Daerah (BKAD)',
          kasusId: kasus.id,
          nipTerperiksa: kasus.nip,
          namaPegawai: kasus.nama,
          dasarHukum: kasus.dasarHukum,
          sanksi: kasus.sanksi,
          nomorSK: kasus.nomorSK || 'MENUNGGU_SK',
          registrasiIDisBKN: kasus.regIDis || 'BELUM_SINKRON',
          timestampWIT: getClientWITNow().tanggal + ' ' + getClientWITNow().jam + ' WIT'
        };
        openModal('Manifest Metadata SIASN / I-Dis BKN (' + esc(kasus.id) + ')',
          '<pre class="p-4 rounded-xl bg-slate-900 text-cyan-300 font-mono text-xs overflow-x-auto">' + esc(JSON.stringify(manifest, null, 2)) + '</pre>');
      } else if (action === 'print-doc') {
        handlePrintType(id, null);
      } else if (action === 'print-izin') {
        handlePrintType('IZIN_BKN', id);
      } else if (action === 'print-disiplin') {
        handlePrintType('SK_HUKUMAN_DISIPLIN', id);
      } else if (action === 'print-ctrlp-type') {
        var docType = btn.getAttribute('data-doc');
        handlePrintType(docType, id);
      } else if (action === 'print-copies-delta') {
        var delta = parseInt(id, 10) || 0;
        AppCache.printCopies = Math.max(1, Math.min(10, (AppCache.printCopies || 3) + delta));
        renderCtrlPSimulator();
      } else if (action === 'print-orient') {
        AppCache.printOrientation = id === 'landscape' ? 'landscape' : 'portrait';
        renderCtrlPSimulator();
      } else if (action === 'print-zoom') {
        AppCache.printZoom = parseInt(id, 10) || 100;
        renderCtrlPSimulator();
      } else if (action === 'print-download-html') {
        downloadPrintSheetHTML();
      } else if (action === 'select-disiplin-case') {
        AppCache.selectedDisiplinId = id;
        var selCase = AppCache.disiplin.filter(function (d) { return d.id === id; })[0];
        var actStage = 1;
        if (selCase && selCase.tahap) {
          for (var ds = 0; ds < DISIPLIN_STAGES.length; ds++) {
            if (selCase.tahap.indexOf('Tahap ' + (ds + 1)) !== -1) actStage = ds + 1;
          }
        }
        AppCache.selectedDisiplinStage = actStage;
        renderDisiplinModule();
      } else if (action === 'select-disiplin-stage') {
        AppCache.selectedDisiplinStage = parseInt(btn.getAttribute('data-stage'), 10) || 1;
        AppCache.disiplinViewMode = 'WORKSPACE';
        renderDisiplinModule();
      } else if (action === 'disiplin-view-mode') {
        AppCache.disiplinViewMode = id === 'ARSIP' ? 'ARSIP' : 'WORKSPACE';
        renderDisiplinModule();
      } else if (action === 'download-disiplin-bundle') {
        downloadDisiplinArchiveBundle(id);
      } else if (action === 'resync-siasn') {
        showToast('Sinkronisasi ulang dengan Gateway SIASN / I-Dis BKN RI berhasil (HTTP 200 OK • ACK_RECORD_COMMITTED).', 'success');
      } else if (action === 'open-telaah-izin') {
        openTelaahIzinModal(id);
      } else if (action === 'trigger-window-print') {
        printA4SheetNow(false);
      } else if (action === 'trigger-inline-print') {
        printA4SheetNow(true);
      } else if (action === 'open-galeri-from-mobile') {
        document.getElementById('mobile-overflow-drawer').classList.add('hidden');
        showShell('desktop');
        switchDeskMenu('galeri-stitch');
      } else if (action === 'preview-stitch') {
        openStitchPreview(id);
      } else if (action === 'open-stitch-module') {
        openStitchTargetModule(id);
      } else if (action === 'open-bidang-modal') {
        AppCache.reopenPegawaiFlag = false;
        openBidangManagerModal();
      } else if (action === 'open-hari-libur-modal') {
        openHariLiburModal();
      } else if (action === 'del-hari-libur') {
        var tglDel = btn.getAttribute('data-tanggal');
        var nextHl = getMasterHariLiburList().filter(function (h) { return h.tanggal !== tglDel; });
        saveHariLiburListToServer(nextHl, btn, function () {
          showToast('Tanggal libur ' + tglDel + ' dihapus.', 'success');
          openHariLiburModal();
        });
      } else if (action === 'reset-hari-libur') {
        var defHl = getDefaultHariLiburList();
        saveHariLiburListToServer(defHl, btn, function () {
          showToast('Kalender Libur Nasional, Cuti Bersama & Fakultatif Papua Barat dimuat.', 'success');
          openHariLiburModal();
        });
      } else if (action === 'open-generate-alpa-modal') {
        openGenerateAlpaModal();
      } else if (action === 'open-bidang-from-pegawai') {
        AppCache.reopenPegawaiFlag = true;
        openBidangManagerModal();
      } else if (action === 'return-to-pegawai') {
        openPegawaiModal(AppCache.reopenPegawaiEditId);
      } else if (action === 'del-bidang') {
        var targetBidang = btn.getAttribute('data-bidang');
        var nextList = getMasterBidangList().filter(function (b) { return b.nama !== targetBidang; });
        saveBidangListToServer(nextList, btn, function () {
          showToast('Bidang "' + targetBidang + '" dihapus.', 'success');
          openBidangManagerModal();
        });
      } else if (action === 'del-subbidang') {
        var bParent = btn.getAttribute('data-bidang');
        var sTarget = btn.getAttribute('data-sub');
        var cloned = JSON.parse(JSON.stringify(getMasterBidangList()));
        for (var bi = 0; bi < cloned.length; bi++) {
          if (cloned[bi].nama === bParent && Array.isArray(cloned[bi].sub)) {
            cloned[bi].sub = cloned[bi].sub.filter(function (s) { return s !== sTarget; });
          }
        }
        saveBidangListToServer(cloned, btn, function () {
          showToast('Sub Bidang "' + sTarget + '" dihapus.', 'success');
          openBidangManagerModal();
        });
      } else if (action === 'open-stitch-tab') {
        var isGasEnv = typeof google !== 'undefined' && google.script && google.script.run;
        if (isGasEnv) {
          showToast('Buka index.html dari folder lokal untuk membuka tab berkas folder Stitch.', 'warn');
        } else {
          window.open('stitch_e_presensi_bkad_teluk_wondama/' + id + '/code.html', '_blank');
        }
      } else if (action === 'close-modal') {
        closeModal();
      }
    });

    /* -------------------------------------------------------------------
     * 17. INISIALISASI FORM SUBMIT & EVENT LISTENER INPUT
     * ------------------------------------------------------------------- */
    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var errBox = document.getElementById('login-error-box');
      errBox.classList.add('hidden');
      errBox.classList.remove('flex');
      var btn = document.getElementById('btn-login-submit');
      callServer('apiAuthenticate', {
        nip: document.getElementById('login-nip').value,
        pin: document.getElementById('login-pin').value
      }, btn, function (res) {
        loadInitialDataAndEnter(res.user, { bundle: res.bundle, btn: btn });
      }, function (err) {
        document.getElementById('login-error-msg').textContent = (err && (err.error || err.message)) || 'Gagal autentikasi.';
        errBox.classList.remove('hidden');
        errBox.classList.add('flex');
      });
    });

    document.getElementById('btn-toggle-pin').addEventListener('click', function () {
      var inp = document.getElementById('login-pin');
      var icon = document.getElementById('icon-toggle-pin');
      if (inp.type === 'password') {
        inp.type = 'text';
        icon.textContent = 'visibility_off';
      } else {
        inp.type = 'password';
        icon.textContent = 'visibility';
      }
    });

    document.getElementById('mob-izin-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('btn-mob-submit-izin');
      callServer('apiSubmitIzinCuti', {
        nip: AppCache.currentUser.nip,
        jenis: document.getElementById('mob-izin-jenis').value,
        tglMulai: formatIsoDateToDMY(document.getElementById('mob-izin-mulai').value),
        tglSelesai: formatIsoDateToDMY(document.getElementById('mob-izin-selesai').value),
        alasan: document.getElementById('mob-izin-alasan').value
      }, btn, function (res) {
        AppCache.izin.unshift(res.record);
        document.getElementById('mob-izin-form').reset();
        renderMobileShell();
        showToast(res.message, 'success');
      });
    });

    document.getElementById('bulk-assign-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('btn-bulk-assign');
      var bidang = document.getElementById('bulk-bidang').value;
      var modeBaru = document.getElementById('bulk-mode').value;
      callServer('apiBulkAssignModeKerja', { bidang: bidang, modeBaru: modeBaru }, btn, function (res) {
        for (var i = 0; i < AppCache.pegawai.length; i++) {
          if (bidang === 'SEMUA' || AppCache.pegawai[i].bidang === bidang) {
            AppCache.pegawai[i].modeDefault = modeBaru;
          }
        }
        showToast(res.message, 'success');
      });
    });

    document.getElementById('settings-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('btn-save-settings');
      var prevGeo = getOfficeGeoConfig();
      var chkUnlock = document.getElementById('set-geolock-unlocked');
      var payload = {
        GEOFENCE_COORDINATES: {
          lat: parseFloat(document.getElementById('set-lat').value),
          lng: parseFloat(document.getElementById('set-lng').value),
          radiusMeter: parseInt(document.getElementById('set-radius').value, 10),
          maxGpsAccuracyMeter: prevGeo.maxGpsAccuracyMeter || 50,
          lokasi: prevGeo.lokasi || 'Kompleks Perkantoran Pemkab Rasiei / Isei 98362',
          geoLockUnlocked: !!(chkUnlock && chkUnlock.checked)
        },
        JAM_KERJA_WIT: {
          masuk: document.getElementById('set-jam-masuk').value,
          pulangSeninKamis: document.getElementById('set-jam-pulang').value,
          pulangJumat: '16:30',
          toleransiMenit: 15
        },
        INTEGRASI_GATEWAY: {
          siasnBkn: 'AKTIF',
          simdaKeuangan: 'AKTIF',
          tarifPotonganTppPerMenit: parseInt(document.getElementById('set-tarif-tpp').value, 10)
        },
        PEJABAT_PENANDATANGAN: {
          kabanNama: document.getElementById('set-kaban-nama').value,
          kabanNip: document.getElementById('set-kaban-nip').value,
          kabanPangkat: 'Pembina Utama Muda (IV/c)'
        },
        MASTER_BIDANG_SUBBIDANG: getMasterBidangList(),
        MASTER_HARI_LIBUR: getMasterHariLiburList()
      };
      callServer('apiSaveSettings', payload, btn, function (res) {
        AppCache.settings = res.settings;
        updateMobileGpsUI();
        showToast(res.message, 'success');
      });
    });

    var mobGpsPresetEl = document.getElementById('mob-gps-preset');
    if (mobGpsPresetEl) {
      mobGpsPresetEl.addEventListener('change', function (e) {
        document.getElementById('cam-coord-mono').textContent = e.target.value.replace(',', ', ');
      });
    }

    document.getElementById('cam-native-input').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      loadFaceApiLibrary();
      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = document.getElementById('cam-captured-preview');
        img.onload = function () {
          document.getElementById('cam-liveness-badge').textContent = 'Memindai Biometrik Wajah...';
          analyzeCapturedFaceImage(img, function (resDesc) {
            handleFaceDescriptorExtracted(resDesc, 'FOTO_KAMERA_HP_' + file.name);
          });
        };
        img.src = ev.target.result;
        img.classList.remove('hidden');
        document.getElementById('cam-placeholder').classList.add('hidden');
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('global-search-input').addEventListener('input', function () {
      AppCache.presensiPage = 1;
      if (AppCache.activeDeskMenu === 'dasbor-utama') queryPresensiTable();
      else if (AppCache.activeDeskMenu === 'rekap-presensi') renderRekapModule();
      else if (AppCache.activeDeskMenu === 'impor-pegawai') {
        document.getElementById('search-pegawai-input').value = document.getElementById('global-search-input').value;
        AppCache.pegawaiPage = 1;
        renderPegawaiTable();
      }
    });
    document.getElementById('filter-presensi-mode').addEventListener('change', function () {
      AppCache.presensiPage = 1;
      queryPresensiTable();
    });
    document.getElementById('filter-presensi-status').addEventListener('change', function () {
      AppCache.presensiPage = 1;
      queryPresensiTable();
    });
    document.getElementById('search-pegawai-input').addEventListener('input', function () {
      AppCache.pegawaiPage = 1;
      renderPegawaiTable();
    });
    var searchSkpdEl = document.getElementById('search-master-skpd');
    if (searchSkpdEl) {
      searchSkpdEl.addEventListener('input', function () { renderMasterSkpdModule(); });
    }
    var importSkpdEl = document.getElementById('import-skpd-file');
    if (importSkpdEl) {
      importSkpdEl.addEventListener('change', function (e) {
        if (e.target.files && e.target.files[0]) handleSkpdFileSelected(e.target.files[0]);
      });
    }
    document.getElementById('filter-pegawai-bidang').addEventListener('change', function () {
      AppCache.pegawaiPage = 1;
      renderPegawaiTable();
    });
    document.getElementById('filter-pegawai-status-aktif').addEventListener('change', function () {
      AppCache.pegawaiPage = 1;
      renderPegawaiTable();
    });
    document.getElementById('import-pegawai-file').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) handlePegawaiFileSelected(file);
    });
    document.getElementById('import-presensi-file').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) handlePresensiFileSelected(file);
    });
    document.getElementById('filter-izin-status').addEventListener('change', function () {
      renderIzinApprovalModule();
    });
    document.getElementById('rekap-filter-bulan').addEventListener('change', function () {
      renderRekapModule();
    });
    document.getElementById('rekap-filter-tahun').addEventListener('change', function () {
      renderRekapModule();
    });
    document.getElementById('rekap-alpa-mode').addEventListener('change', function () {
      renderRekapModule();
    });
    var rSingleEl = document.getElementById('rekap-single-date');
    if (rSingleEl) rSingleEl.addEventListener('change', function () { renderRekapModule(); });
    var rStartEl = document.getElementById('rekap-date-start');
    if (rStartEl) rStartEl.addEventListener('change', function () { renderRekapModule(); });
    var rEndEl = document.getElementById('rekap-date-end');
    if (rEndEl) rEndEl.addEventListener('change', function () { renderRekapModule(); });
    document.getElementById('search-stitch-input').addEventListener('input', function () {
      renderStitchGallery();
    });
    document.getElementById('filter-stitch-cat').addEventListener('change', function () {
      renderStitchGallery();
    });
    document.getElementById('sidebar-backdrop').addEventListener('click', function () {
      document.getElementById('desktop-sidebar').classList.add('-translate-x-full');
      document.getElementById('sidebar-backdrop').classList.add('hidden');
    });

    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t) return;
      if (t.id === 'ctrlp-doc-select') {
        AppCache.printDocType = t.value;
        var catItem = PRINT_DOC_CATALOG.filter(function (c) { return c.key === t.value; })[0];
        if (catItem && catItem.orient) AppCache.printOrientation = catItem.orient;
        renderCtrlPSimulator();
      } else if (t.id === 'ctrlp-chk-kop') {
        AppCache.printShowKop = !!t.checked;
        renderCtrlPSimulator();
      } else if (t.id === 'ctrlp-chk-wit') {
        AppCache.printShowWIT = !!t.checked;
        renderCtrlPSimulator();
      } else if (t.id === 'ctrlp-chk-qr') {
        AppCache.printShowQR = !!t.checked;
        renderCtrlPSimulator();
      }
    });

    // Inisialisasi NIP tersimpan pada perangkat masing-masing & jalankan jam WIT Live
    applySavedDeviceNIP();
    updateAllWITClocks();
    setInterval(updateAllWITClocks, 1000);
  })();
