// src/common.js - fungsi bantu bersama untuk kedua demo (status dan pemeriksaan)
const LOAD_TIMEOUT_MS = 90000; // batas waktu memuat (ms)

// Menampilkan status di elemen #status. state: idle | searching | found | error
export function setStatus(text, state) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.dataset.state = state;
}

// Memeriksa syarat dasar kamera. Mengembalikan null jika OK, atau pesan masalah.
export function checkCameraSupport() {
  if (!window.isSecureContext) {
    return 'Halaman bukan secure context. Buka lewat HTTPS (mis. GitHub Pages) '
      + 'atau http://localhost di laptop.';
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return 'Browser ini tidak menyediakan akses kamera (getUserMedia).';
  }
  return null;
}

// Memastikan sebuah file (mis. .mind) benar-benar bisa diunduh.
export async function checkFile(url) {
  setStatus('Memeriksa file ' + url + ' ...', 'idle');
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error('File ' + url + ' tidak bisa diakses. Cek server dan jaringan.');
  }
  if (!res.ok) {
    throw new Error('File ' + url + ' tidak ditemukan (HTTP ' + res.status + '). '
      + 'Cek nama file dan foldernya.');
  }
}

// Meminta izin kamera lebih dulu supaya penyebab gagalnya jelas.
export async function checkCameraAccess() {
  setStatus('Meminta izin kamera... klik Izinkan di browser', 'idle');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch (e) {
    const pesan = {
      NotAllowedError: 'Izin kamera ditolak. Klik ikon gembok di address bar, izinkan Kamera, lalu muat ulang.',
      NotFoundError: 'Kamera tidak ditemukan di perangkat ini.',
      NotReadableError: 'Kamera sedang dipakai aplikasi/tab lain. Tutup dulu lalu muat ulang.',
    };
    throw new Error(pesan[e.name] || ('Kamera gagal dibuka: ' + e.name));
  }
  setStatus('Kamera OK. Memuat...', 'idle');
}

// Menghubungkan tombol "Mulai" dengan fungsi start(). Kamera hanya diminta setelah tombol ditekan.
export function setupStartButton(startFn) {
  const btn = document.getElementById('startBtn');
  btn.addEventListener('click', async () => {
    const problem = checkCameraSupport();
    if (problem) { setStatus('Error: ' + problem, 'error'); return; }
    btn.disabled = true;
    document.getElementById('consent').style.display = 'none';
    setStatus('Memuat... izinkan kamera jika diminta', 'idle');
    try {
      // MindAR tidak selalu menolak (reject) saat unduhan model/target gagal; beri batas waktu.
      const timeout = new Promise((_, rej) =>
        setTimeout(() => rej(new Error('timeout')), LOAD_TIMEOUT_MS));
      await Promise.race([startFn(), timeout]);
    } catch (err) {
      console.error('Gagal memulai:', err);
      document.getElementById('consent').style.display = 'flex';
      btn.disabled = false;
      const detail = (err && err.message && err.message !== 'timeout')
        ? err.message
        : 'terlalu lama memuat. Periksa internet, HTTPS, GPU/WebGL, dan Console (F12).';
      setStatus('Error: ' + detail, 'error');
      document.getElementById('info').textContent = 'Error: ' + detail;
    }
  });
}