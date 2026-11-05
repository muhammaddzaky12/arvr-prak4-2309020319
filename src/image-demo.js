// src/image-demo.js - Demonstrasi 1: image tracking (MindAR + Three.js)
// Versi diagnosa: mencatat tiap tahap ke console, memeriksa WebGL dan file .mind,
// dan menampilkan pesan jelas jika loading macet lebih dari START_TIMEOUT_MS.
import * as THREE from 'three';
import { MindARThree } from '../vendor/mindar/mindar-image-three.prod.js';
import { setStatus, setupStartButton, checkFile, checkCameraAccess } from './common.js';

const TARGET_SRC = './targets/target-card.mind'; // hasil kompilasi target-card.png
const TARGET_ASPECT = 372 / 674; // tinggi/lebar gambar target (674x372 px)

// Konstanta yang boleh diubah untuk menyetel pesawat.
const PLANE_SCALE = 1.0;   // ukuran pesawat
const ORBIT_RADIUS = 0.2;  // jari-jari lingkaran terbang (lebar target = 1)
const ORBIT_SPEED = 0.9;   // kecepatan terbang
const FLY_HEIGHT = 0.18;   // tinggi terbang di atas gambar

const START_TIMEOUT_MS = 40000; // lewat dari ini dianggap macet

let foundCount = 0;

// ---------------- Diagnosa ----------------
const t0 = performance.now();
const log = (msg, ...rest) => console.log('[AR ' + ((performance.now() - t0) / 1000).toFixed(1) + 's] ' + msg, ...rest);

function showProblem(msg) {
  console.error('[AR] ' + msg);
  setStatus(msg, 'error');
  const info = document.getElementById('info');
  if (info) info.textContent = msg;
  // sembunyikan spinner bawaan MindAR supaya pesan terbaca
  document.querySelectorAll('.mindar-ui-overlay').forEach((el) => { el.style.display = 'none'; });
}

// Cek WebGL: MindAR menjalankan TensorFlow.js di WebGL. Tanpa akselerasi GPU, loading bisa tidak selesai.
function checkWebGL() {
  const cv = document.createElement('canvas');
  const gl = cv.getContext('webgl2') || cv.getContext('webgl');
  if (!gl) throw new Error('WebGL tidak tersedia. Aktifkan "Use hardware acceleration" di pengaturan browser.');
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'tidak diketahui';
  log('WebGL renderer: ' + renderer);
  if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) {
    console.warn('[AR] WebGL berjalan dengan software (' + renderer + '). Ini sangat lambat / bisa macet. Aktifkan hardware acceleration.');
  }
}

// Cek file .mind: harus biner, bukan halaman HTML (server kadang membalas 200 berisi HTML untuk file yang tidak ada).
async function checkMindFile(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('File target tidak bisa dimuat (' + res.status + '): ' + url);
  const buf = await res.arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 15))).toLowerCase();
  log('File .mind: ' + buf.byteLength + ' byte, content-type: ' + res.headers.get('content-type'));
  if (buf.byteLength < 1000 || head.includes('<!doctype') || head.includes('<html')) {
    throw new Error('File .mind bukan file target yang valid (isinya seperti halaman HTML atau terlalu kecil). Periksa path dan kompilasi ulang.');
  }
}

// Batas waktu untuk sebuah proses.
function withTimeout(promise, ms, msg) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(msg)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

window.addEventListener('unhandledrejection', (e) => console.error('[AR] Error tak tertangkap:', e.reason));
window.addEventListener('error', (e) => console.error('[AR] Error:', e.message));

// Pesawat dari bentuk dasar. Hidung mengarah ke +y, sayap rata di bidang xy, sirip tegak ke +z.
function buildAirplane() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.35, metalness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.6 });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.26, 20), body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 20), accent);
  nose.position.y = 0.175;

  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.012), accent);
  wing.position.y = -0.01;

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.01), accent);
  tailWing.position.y = -0.12;

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.07, 0.07), accent);
  fin.position.set(0, -0.115, 0.05);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), glass);
  cockpit.scale.set(1, 1.8, 0.8);
  cockpit.position.set(0, 0.075, 0.03);

  g.add(fuselage, nose, wing, tailWing, fin, cockpit);

  // Dua mesin di bawah sayap.
  for (const sx of [-1, 1]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 12), body);
    engine.position.set(sx * 0.1, 0.02, -0.03);
    g.add(engine);
  }
  return g;
}

async function start() {
  try {
    // Periksa dulu supaya kalau gagal, pesannya jelas (bukan loading tanpa akhir).
    log('Cek WebGL...');
    checkWebGL();
    log('Cek file target...');
    await checkFile(TARGET_SRC);
    await checkMindFile(TARGET_SRC);
    log('Cek kamera...');
    await checkCameraAccess();
    log('Kamera OK');

    const mindarThree = new MindARThree({
      container: document.getElementById('container'),
      imageTargetSrc: TARGET_SRC,
    });
    const { renderer, scene, camera } = mindarThree;

    // Anchor 0 = target pertama di file .mind. Lebar target = 1 satuan, pusat target = (0,0,0).
    const anchor = mindarThree.addAnchor(0);

    // Bingkai tipis seukuran target: membantu menilai kecocokan posisi dan skala.
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, TARGET_ASPECT)),
      new THREE.LineBasicMaterial({ color: 0x14b8a6 })
    );
    anchor.group.add(frame);

    // Pesawat: rig mengatur posisi dan arah terbang, plane mengatur kemiringan badan.
    const rig = new THREE.Group();
    const plane = buildAirplane();
    plane.scale.setScalar(PLANE_SCALE);
    plane.rotation.y = -0.35; // miring ke arah belokan
    rig.add(plane);
    anchor.group.add(rig);

    // Cahaya (MeshStandardMaterial butuh cahaya agar terlihat).
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(0.5, 1, 1);
    scene.add(dir);

    // Event siklus hidup target.
    anchor.onTargetFound = () => {
      foundCount++;
      setStatus('Target terdeteksi', 'found');
      document.getElementById('info').textContent = 'Target ditemukan ' + foundCount + ' kali.';
    };
    anchor.onTargetLost = () => {
      setStatus('Target hilang - mencari target', 'searching');
    };

    setStatus('Memuat model AR... bisa 10-30 detik', 'idle');
    log('mindarThree.start() dimulai (muat .mind, siapkan TensorFlow.js)...');
    await withTimeout(
      mindarThree.start(), // minta kamera, muat .mind, mulai tracking
      START_TIMEOUT_MS,
      'Loading macet lebih dari ' + (START_TIMEOUT_MS / 1000) + ' detik. Buka console (F12) untuk detailnya. ' +
      'Penyebab umum: hardware acceleration/WebGL mati, atau file .mind tidak cocok dengan versi MindAR.'
    );
    log('mindarThree.start() selesai');
    setStatus('Mencari target', 'searching');

    const clock = new THREE.Clock();
    let t = 0;
    renderer.setAnimationLoop(() => {
      t += clock.getDelta() * ORBIT_SPEED;
      // Terbang melingkar berlawanan arah jarum jam; hidung (+y) mengikuti arah gerak.
      rig.position.set(
        ORBIT_RADIUS * Math.cos(t),
        ORBIT_RADIUS * Math.sin(t),
        FLY_HEIGHT + 0.02 * Math.sin(t * 3)
      );
      rig.rotation.z = t;
      renderer.render(scene, camera);
    });
  } catch (err) {
    showProblem(err && err.message ? err.message : String(err));
    throw err;
  }
}

setupStartButton(start);