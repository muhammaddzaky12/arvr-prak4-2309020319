// src/face-demo.js - Demonstrasi 2: face tracking (MindAR + Three.js)
// Filter: dipeluk seseorang dari belakang. Lengan sweater berlipat, tangan detail
// (buku jari, kuku, cincin emas), dan beranimasi: napas, remasan, tepukan di bahu,
// jari "mengetuk", ibu jari mengelus. Pelukan mengerat saat kamu senyum / buka mulut,
// dan muncul hati kecil yang melayang. Semua dibuat dari kode (tanpa file 3D).
import * as THREE from 'three';
import { MindARThree } from '../vendor/mindar/mindar-face-three.prod.js';
import { setStatus, setupStartButton, checkCameraAccess } from './common.js';

// ======================= PENGATURAN =======================
const CAMERA_HD = true;          // minta kamera 1280x720; set false jika bermasalah
const MAX_PIXEL_RATIO = 2;       // ketajaman render
const SHOW_TUNER = true;         // tampilkan panel penggeser (tombol di kiri bawah)

const SLEEVE_COLOR = [92, 98, 120];   // warna lengan sweater [r, g, b]
const CUFF_COLOR = [58, 62, 80];      // warna manset
const SKIN_COLOR = [226, 176, 144];   // warna kulit tangan
const NAIL_COLOR = [238, 192, 190];   // warna kuku

const HUG_SIZE = 1.0;            // besar semua lengan (1 = ukuran standar)
const HUG_OFFSET = { x: 0, y: 0, z: 0 };  // geser pelukan (satuan = lebar wajah, relatif ke dagu)
const FOLLOW_HEAD = 0.4;         // 1 = lengan ikut berputar penuh dengan kepala, 0 = diam menghadap kamera

const ANIMATE = true;            // animasi napas, remasan, tepukan, jari
const REACT_TO_FACE = true;      // pelukan mengerat saat senyum / buka mulut
const HEARTS_ON = true;          // hati melayang saat pelukan erat
const RING_ON = true;            // cincin emas di jari manis tangan atas
const SMILE_BASE = 0.36;         // lebar mulut normal (rasio ke lebar wajah). Naikkan jika terlalu mudah "senyum"
// ===========================================================

const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const tick = () => new Promise((r) => setTimeout(r, 0));
const SEG = IS_MOBILE ? 14 : 22;         // kehalusan jari
const TUBE_M = IS_MOBILE ? 28 : 44;      // kehalusan keliling lengan
const TUBE_N = IS_MOBILE ? 48 : 72;      // kehalusan panjang lengan

// Nomor landmark wajah MediaPipe.
const CHIN = 152;
const FACE_SIDE_R = 234, FACE_SIDE_L = 454;
const LIP_TOP = 13, LIP_BOTTOM = 14, MOUTH_R = 61, MOUTH_L = 291;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// Nilai yang bisa digeser langsung lewat panel.
const tune = {
  hugSize: HUG_SIZE, hugX: HUG_OFFSET.x, hugY: HUG_OFFSET.y, hugZ: HUG_OFFSET.z, follow: FOLLOW_HEAD,
  animSpeed: 1.0, smileBase: SMILE_BASE,
};
const TUNE_FIELDS = [
  ['hugSize', 'Lengan: ukuran', 0.3, 1.8, 0.01],
  ['hugX', 'Lengan: kiri-kanan', -1, 1, 0.01],
  ['hugY', 'Lengan: naik-turun', -1.5, 1.5, 0.01],
  ['hugZ', 'Lengan: maju-mundur', -1.5, 1.5, 0.01],
  ['follow', 'Ikut gerak kepala', 0, 1, 0.01],
  ['animSpeed', 'Kecepatan animasi', 0, 2.5, 0.05],
  ['smileBase', 'Batas senyum (mulut normal)', 0.25, 0.5, 0.005],
];

// Panel penggeser kecil di kiri bawah layar.
function buildTuner() {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;font:12px sans-serif;color:#fff;';
  const btn = document.createElement('button');
  btn.textContent = '⚙ Atur';
  btn.style.cssText = 'padding:6px 10px;border:0;border-radius:8px;background:rgba(0,0,0,.65);color:#fff;font:12px sans-serif;';
  const panel = document.createElement('div');
  panel.style.cssText = 'display:none;margin-top:6px;padding:8px;border-radius:8px;background:rgba(0,0,0,.65);' +
    'width:230px;max-height:45vh;overflow:auto;';
  const out = document.createElement('pre');
  out.style.cssText = 'margin:6px 0 0;font:11px monospace;white-space:pre-wrap;color:#cfe;';
  const live = document.createElement('div');
  live.style.cssText = 'margin-top:6px;font:11px monospace;color:#fd9;';
  const refresh = () => {
    out.textContent = TUNE_FIELDS.map(([k]) => k + ': ' + Number(tune[k]).toFixed(3)).join('\n');
  };
  for (const [key, label, min, max, step] of TUNE_FIELDS) {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;margin-bottom:6px;';
    row.textContent = label;
    const input = document.createElement('input');
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = tune[key];
    input.style.cssText = 'display:block;width:100%;';
    input.addEventListener('input', () => { tune[key] = parseFloat(input.value); refresh(); });
    row.appendChild(input);
    panel.appendChild(row);
  }
  panel.appendChild(out);
  panel.appendChild(live);
  refresh();
  btn.addEventListener('click', () => { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; });
  wrap.appendChild(btn);
  wrap.appendChild(panel);
  document.body.appendChild(wrap);
  return { setLive: (txt) => { if (panel.style.display !== 'none') live.textContent = txt; } };
}

// Angka acak yang bisa diulang.
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Minta resolusi kamera lebih tinggi (hanya sekali).
let hdCameraApplied = false;
function enableHdCamera() {
  if (hdCameraApplied || !navigator.mediaDevices) return;
  hdCameraApplied = true;
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = (constraints) => {
    if (constraints && constraints.video) {
      const v = typeof constraints.video === 'object' ? constraints.video : {};
      constraints = { ...constraints, video: { ...v, width: { ideal: 1280 }, height: { ideal: 720 } } };
    }
    return orig(constraints);
  };
}

// Lingkungan studio buatan (tanpa file HDR) untuk pantulan cahaya yang lembut.
function makeEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.BoxGeometry(10, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x4a4e57, side: THREE.BackSide })
  ));
  const panel = (w, h, pos, intensity) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(pos[0], pos[1], pos[2]);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(4, 3, [0, 3, 4.5], 12);
  panel(2, 4, [-4.5, 1, 1], 6);
  panel(2, 4, [4.5, 1, 1], 6);
  panel(4, 2, [0, 4.5, -1], 5);
  const tex = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  return tex;
}

// ---------------------------------------------------------------
// TEKSTUR PROSEDURAL
// ---------------------------------------------------------------
const rgb = (c) => new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255);

// Relief rajutan sweater.
function makeKnitBump() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const rnd = makeRng(11);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const knit = 0.5 + 0.5 * Math.sin(x * 0.5) * Math.sin(y * 0.25 + Math.sin(x * 0.25) * 0.8);
      const v = 128 + (knit - 0.5) * 80 + (rnd() - 0.5) * 24;
      const o = (y * S + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 12);
  return tex;
}

// Pori-pori dan guratan halus kulit.
function makeSkinBump() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const rnd = makeRng(5);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fine = (rnd() - 0.5) * 40;
      const lines = Math.sin((x + Math.sin(y * 0.12) * 5) * 0.35) * 10;
      const v = 128 + fine + lines;
      const o = (y * S + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function makeHeartTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.setTransform(S / 64, 0, 0, S / 64, S / 2, S / 2 + 3);
  ctx.beginPath();
  ctx.moveTo(0, 15);
  ctx.bezierCurveTo(-32, -6, -13, -27, 0, -10);
  ctx.bezierCurveTo(13, -27, 32, -6, 0, 15);
  ctx.closePath();
  const g = ctx.createRadialGradient(-6, -8, 2, 0, 0, 28);
  g.addColorStop(0, '#ff9bb8');
  g.addColorStop(1, '#ff2d6f');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-9, -12, 5, 3, -0.6, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------
// GEOMETRI
// Satuan: lebar wajah = 1. Titik asal = dagu. +x = kanan layar, +y = atas, +z = ke arah kamera.
// ---------------------------------------------------------------
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(0, 0, 1);

// Kapsul meruncing (radius r0 di bawah, r1 di atas) dengan ujung membulat.
function taperedCapsule(r0, r1, len) {
  const pts = [];
  const cap = 6;
  for (let i = 0; i <= cap; i++) {
    const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, r0 * Math.cos(a)), r0 * Math.sin(a)));
  }
  for (let i = 1; i <= cap; i++) {
    const a = (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, r1 * Math.cos(a)), len + r1 * Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, SEG);
}

// Telapak tangan: lonjong yang melebar ke arah buku jari dan menebal di tengah.
function makePalmGeometry() {
  const g = new THREE.SphereGeometry(1, 40, 28);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ty = (y + 1) / 2;
    const width = 0.19 + 0.10 * sstep(0, 1, Math.pow(ty, 0.8));
    const thick = 0.045 + 0.075 * Math.pow(Math.sin(Math.PI * Math.min(1, ty * 1.05)), 0.7);
    p.setXYZ(i, x * width, ty * 0.66, z * thick * (z < 0 ? 0.8 : 1));
  }
  g.computeVertexNormals();
  return g;
}

// Tabung yang mengikuti kurva dengan radius yang bisa diatur per titik (untuk lengan baju berlipat).
function tubeAlong(curve, N, M, radiusFn) {
  const pos = [], uv = [], idx = [];
  const T0 = curve.getTangentAt(0);
  const Nv = new THREE.Vector3(0, 0, 1);
  Nv.addScaledVector(T0, -Nv.dot(T0));
  if (Nv.lengthSq() < 1e-6) Nv.set(0, 1, 0);
  Nv.normalize();
  const P = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    Nv.addScaledVector(T, -Nv.dot(T)).normalize();   // transport paralel supaya tidak terpuntir
    B.crossVectors(T, Nv).normalize();
    for (let j = 0; j <= M; j++) {
      const th = (j / M) * Math.PI * 2;
      n.copy(Nv).multiplyScalar(Math.cos(th)).addScaledVector(B, Math.sin(th));
      const r = radiusFn(t, th, n);
      pos.push(P.x + n.x * r, P.y + n.y * r, P.z + n.z * r);
      uv.push(j / M, t);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + M + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // samakan normal di sambungan supaya tidak ada garis
  const nr = g.attributes.normal;
  for (let i = 0; i <= N; i++) {
    const a = i * (M + 1), b = a + M;
    const nx = (nr.getX(a) + nr.getX(b)) / 2, ny = (nr.getY(a) + nr.getY(b)) / 2, nz = (nr.getZ(a) + nr.getZ(b)) / 2;
    nr.setXYZ(a, nx, ny, nz); nr.setXYZ(b, nx, ny, nz);
  }
  return g;
}

// ---------------------------------------------------------------
// TANGAN
// Sumbu lokal: jari ke +y, punggung tangan ke +z, ibu jari ke +x.
// ---------------------------------------------------------------
function makeFinger(d, mats, ring) {
  const base = new THREE.Group();
  base.position.set(d.x, 0.60, 0);
  base.rotation.z = d.splay;
  const [l1, l2, l3] = d.L;
  const r0 = d.r, r1 = r0 * 0.92, r2 = r0 * 0.84, r3 = r0 * 0.74;

  const s1 = new THREE.Mesh(taperedCapsule(r0, r1, l1), mats.skin);
  base.add(s1);
  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.62, 14, 10), mats.skin);
  knuckle.scale.set(1.05, 0.8, 0.7);
  knuckle.position.set(0, 0.01, r0 * 0.72);
  base.add(knuckle);

  const j2 = new THREE.Group();
  j2.position.y = l1;
  j2.add(new THREE.Mesh(taperedCapsule(r1, r2, l2), mats.skin));
  base.add(j2);

  const j3 = new THREE.Group();
  j3.position.y = l2;
  const s3 = new THREE.Mesh(taperedCapsule(r2, r3, l3), mats.skin);
  j3.add(s3);
  const nail = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mats.nail);
  nail.scale.set(r3 * 0.78, l3 * 0.36, r3 * 0.22);
  nail.position.set(0, l3 * 0.62, r3 * 0.78);
  nail.rotation.x = -0.12;
  j3.add(nail);
  j2.add(j3);

  if (ring) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r0 * 1.0, 0.012, 10, 28), mats.gold);
    band.rotation.x = Math.PI / 2;
    band.position.y = l1 * 0.62;
    base.add(band);
  }
  return { base, j2, j3, curl: d.curl, splay: d.splay };
}

function makeHand(mats, withRing) {
  const g = new THREE.Group();
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.165, 0.34, 24), mats.skin);
  wrist.scale.z = 0.72;
  wrist.position.y = -0.04;
  g.add(wrist);
  g.add(new THREE.Mesh(makePalmGeometry(), mats.skin));

  // gundukan pangkal ibu jari
  const thenar = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mats.skin);
  thenar.scale.set(0.12, 0.22, 0.075);
  thenar.position.set(0.15, 0.2, -0.015);
  thenar.rotation.z = -0.25;
  g.add(thenar);

  const defs = [
    { x: 0.20, L: [0.25, 0.17, 0.15], r: 0.064, curl: [0.28, 0.42, 0.28], splay: -0.05 },   // telunjuk
    { x: 0.07, L: [0.28, 0.19, 0.16], r: 0.066, curl: [0.34, 0.50, 0.32], splay: 0.0 },     // tengah
    { x: -0.065, L: [0.26, 0.18, 0.15], r: 0.062, curl: [0.42, 0.55, 0.34], splay: 0.04 },  // manis
    { x: -0.19, L: [0.20, 0.14, 0.13], r: 0.054, curl: [0.50, 0.60, 0.36], splay: 0.09 },   // kelingking
  ];
  const fingers = defs.map((d, i) => {
    const f = makeFinger(d, mats, withRing && i === 2);
    g.add(f.base);
    return f;
  });

  // ibu jari: tiga ruas
  const thumbBase = new THREE.Group();
  thumbBase.position.set(0.17, 0.13, -0.01);
  const thumbRotZ = -0.95;
  thumbBase.rotation.set(-0.25, 0, thumbRotZ);
  thumbBase.add(new THREE.Mesh(taperedCapsule(0.088, 0.078, 0.15), mats.skin));
  const tj1 = new THREE.Group();
  tj1.position.y = 0.15;
  tj1.rotation.x = -0.15;
  tj1.add(new THREE.Mesh(taperedCapsule(0.078, 0.07, 0.15), mats.skin));
  const tj2 = new THREE.Group();
  tj2.position.y = 0.15;
  tj2.rotation.x = -0.2;
  tj2.add(new THREE.Mesh(taperedCapsule(0.07, 0.06, 0.12), mats.skin));
  const tn = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mats.nail);
  tn.scale.set(0.05, 0.045, 0.016);
  tn.position.set(0, 0.075, 0.052);
  tn.rotation.x = -0.1;
  tj2.add(tn);
  tj1.add(tj2);
  thumbBase.add(tj1);
  g.add(thumbBase);

  return { group: g, fingers, thumb: { base: thumbBase, j1: tj1, j2: tj2, rotZ: thumbRotZ } };
}

// Arahkan tangan: jari searah lengan bawah, punggung tangan menghadap kamera.
function orientHand(hand, dir) {
  const y = dir.clone().normalize();
  const z = _fwd.clone().addScaledVector(y, -_fwd.dot(y));
  if (z.lengthSq() < 1e-4) z.set(0, 1, 0);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// ---------------------------------------------------------------
// LENGAN: sweater berlipat, manset berusuk, tangan di ujung.
// s = +1 (kanan layar) atau -1 (kiri layar). Lengan menyilang ke sisi seberang.
// ---------------------------------------------------------------
function makeArm(s, top, mats) {
  const arm = new THREE.Group();
  const zOff = top ? 0.45 : 0.0;                  // lengan "atas" ada di depan lengan lainnya
  const S = V3(s * 1.95, -1.25, -1.6);            // bahu si pemeluk (di belakang, di luar layar)
  const E = V3(s * 1.55, top ? -1.15 : -1.45, 0.10 + zOff);     // siku
  const Wr = V3(-s * 0.15, top ? -0.52 : -0.80, 0.22 + zOff);   // pergelangan, di bawah dagu
  const dir = Wr.clone().sub(E).normalize();
  const WrS = Wr.clone().addScaledVector(dir, -0.20);           // ujung sweater (di atas manset)

  const m1 = S.clone().lerp(E, 0.5).add(V3(s * 0.10, 0.02, 0));
  const m2 = E.clone().lerp(WrS, 0.5).add(V3(0, -0.04, 0.07));
  const curve = new THREE.CatmullRomCurve3([S, m1, E, m2, WrS], false, 'centripetal');

  // posisi siku di sepanjang kurva dan arah tekukan (sisi dalam siku)
  let tE = 0.5, best = 1e9;
  const tmp = new THREE.Vector3();
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const dd = curve.getPointAt(t, tmp).distanceTo(E);
    if (dd < best) { best = dd; tE = t; }
  }
  const bend = curve.getTangentAt(Math.min(1, tE + 0.12)).sub(curve.getTangentAt(Math.max(0, tE - 0.12))).normalize();

  const radiusFn = (t, th, n) => {
    const base = t < tE
      ? 0.31 - 0.03 * sstep(0, tE, t)
      : 0.28 - 0.045 * sstep(0, 0.85, (t - tE) / (1 - tE));
    const inner = Math.max(0, n.dot(bend));
    const elbowW = Math.exp(-Math.pow((t - tE) / 0.07, 2));
    const creases = 0.05 * elbowW * inner * Math.sin(t * 150 + th * 2.0);   // kerutan di lipatan siku
    const squash = -0.05 * elbowW * inner;                                 // sisi dalam siku tertekan
    const bunch = 0.065 * sstep(0.74, 0.97, t) * (0.55 + 0.45 * Math.sin(th * 3 + 1.0)) * Math.sin(t * 95); // kain menumpuk di pergelangan
    const fold = 0.014 * Math.sin(th * 5 + t * 6);                         // lipatan memanjang yang lembut
    const ang = Math.min(Math.abs(th), Math.abs(th - Math.PI * 2));
    const seam = -0.012 * Math.exp(-Math.pow(ang / 0.06, 2));              // alur jahitan
    return base * (1 + creases + squash + bunch + fold + seam);
  };
  arm.add(new THREE.Mesh(tubeAlong(curve, TUBE_N, TUBE_M, radiusFn), mats.sleeve));

  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.31, 24, 16), mats.sleeve);
  shoulder.position.copy(S);
  arm.add(shoulder);

  // manset berusuk
  const cuffCurve = new THREE.LineCurve3(WrS.clone().addScaledVector(dir, -0.03), Wr.clone());
  const cuffGeo = tubeAlong(cuffCurve, 6, TUBE_M, (t, th) => 0.208 * (1 + 0.035 * Math.cos(th * 26)) * (1 - 0.03 * t));
  arm.add(new THREE.Mesh(cuffGeo, mats.cuff));
  const cuffEnd = new THREE.Mesh(new THREE.TorusGeometry(0.208, 0.028, 12, 40), mats.cuff);
  cuffEnd.position.copy(Wr);
  cuffEnd.quaternion.setFromUnitVectors(_fwd, dir);
  arm.add(cuffEnd);

  // tangan: pivot di pergelangan supaya bisa diayun (menepuk)
  const pivot = new THREE.Group();
  pivot.position.copy(Wr);
  const handParts = makeHand(mats, RING_ON && top);
  const hand = handParts.group;
  hand.position.copy(dir).multiplyScalar(-0.12);
  orientHand(hand, dir);
  if (s < 0) hand.scale.x = -1;   // cerminkan supaya ibu jari tetap di atas
  pivot.add(hand);
  arm.add(pivot);

  const patAxis = new THREE.Vector3().crossVectors(dir, _fwd).normalize();
  return { group: arm, pivot, hand: handParts, s, top, patAxis };
}

function makeHug() {
  const knit = makeKnitBump();
  const skinBump = makeSkinBump();
  const mats = {
    sleeve: new THREE.MeshStandardMaterial({
      color: rgb(SLEEVE_COLOR), roughness: 0.93, metalness: 0, bumpMap: knit, bumpScale: 1.6,
      envMapIntensity: 0.4, side: THREE.DoubleSide,
    }),
    cuff: new THREE.MeshStandardMaterial({
      color: rgb(CUFF_COLOR), roughness: 0.92, bumpMap: knit, bumpScale: 1.2, envMapIntensity: 0.4, side: THREE.DoubleSide,
    }),
    skin: new THREE.MeshPhysicalMaterial({
      color: rgb(SKIN_COLOR), roughness: 0.58, metalness: 0, bumpMap: skinBump, bumpScale: 0.35,
      sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color(1.0, 0.55, 0.5),
      emissive: rgb(SKIN_COLOR).multiplyScalar(0.07),   // sedikit "cahaya dari dalam" kulit
      envMapIntensity: 0.6,
    }),
    nail: new THREE.MeshPhysicalMaterial({
      color: rgb(NAIL_COLOR), roughness: 0.25, clearcoat: 1.0, clearcoatRoughness: 0.15, envMapIntensity: 1.0,
    }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe8c36a, metalness: 1.0, roughness: 0.25, envMapIntensity: 1.4 }),
  };
  const g = new THREE.Group();
  const arms = [makeArm(+1, true, mats), makeArm(-1, false, mats)];
  for (const a of arms) g.add(a.group);
  return { group: g, arms };
}

// ---------------------------------------------------------------
// ANIMASI
// ---------------------------------------------------------------
// Denyut yang aktif sebentar lalu istirahat: 0..1.
function burst(t, period, dur, offset) {
  const ph = (((t + offset) % period) + period) % period;
  return ph < dur ? Math.sin(Math.PI * ph / dur) : 0;
}

function animateHug(hug, t, sq) {
  for (const arm of hug.arms) {
    const k = arm.top ? 0 : 1;
    const s = arm.s;

    // remasan: lengan bergeser sedikit ke dalam dan ke depan, ukurannya agak mengecil
    arm.group.position.set(-s * 0.09 * sq, 0.03 * sq, 0.05 * sq);
    arm.group.scale.setScalar(1 - 0.015 * sq);

    // tepukan di bahu
    const patEnv = burst(t, 5.2, 2.2, k * 2.6);
    const pat = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 2.8 - Math.PI / 2);
    const ang = 0.20 * patEnv * pat + 0.025 * Math.sin(t * 0.9 + k * 2);   // + goyang lembut
    arm.pivot.quaternion.setFromAxisAngle(arm.patAxis, ang);

    // jari mengetuk bergelombang + gerak kecil saat diam + mengerat saat dipeluk erat
    const waveEnv = burst(t, 7.0, 2.6, 1.5 + k * 3.2);
    arm.hand.fingers.forEach((f, i) => {
      const idle = 0.04 * Math.sin(t * 0.9 + i * 1.3 + k * 2.1);
      const wave = waveEnv * 0.22 * Math.sin(t * 10 - i * 0.8);
      const add = idle + wave + 0.12 * sq;
      f.base.rotation.x = -(f.curl[0] + add * 0.7);
      f.j2.rotation.x = -(f.curl[1] + add);
      f.j3.rotation.x = -(f.curl[2] + add * 0.7);
    });

    // ibu jari mengelus perlahan
    const stroke = 0.5 + 0.5 * Math.sin(t * 0.4 + k * 1.7);
    const th = arm.hand.thumb;
    th.base.rotation.z = th.rotZ + 0.14 * Math.sin(t * 1.4 + k * 1.2) * stroke;
    th.j1.rotation.x = -(0.15 + 0.08 * Math.sin(t * 1.4 + 0.6 + k));

    // tangan berputar tipis seperti rileks
    arm.hand.group.rotation.y = 0.05 * Math.sin(t * 0.7 + k * 1.3);
  }
}

// Reaksi wajah: 0 = netral, 1 = senyum lebar / mulut terbuka.
const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();
function pdist(pos, i, j) {
  _p1.fromBufferAttribute(pos, i);
  _p2.fromBufferAttribute(pos, j);
  return _p1.distanceTo(_p2);
}
function faceReaction(geometry) {
  const p = geometry.attributes.position;
  const fw = pdist(p, FACE_SIDE_R, FACE_SIDE_L) || 1;
  const open = pdist(p, LIP_TOP, LIP_BOTTOM) / fw;
  const mouth = pdist(p, MOUTH_R, MOUTH_L) / fw;
  const smile = clamp01((mouth - tune.smileBase) / 0.08);
  const o = clamp01((open - 0.02) / 0.10);
  return { value: Math.max(smile, o * 0.9), mouth, open };
}

// Hati kecil yang melayang naik dan memudar.
function makeHearts(parent) {
  const tex = makeHeartTexture();
  const pool = [];
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0 });
    const sp = new THREE.Sprite(mat);
    sp.visible = false;
    sp.renderOrder = 10;
    parent.add(sp);
    pool.push({ sp, life: 0, x0: 0, sway: 0, phase: 0 });
  }
  let last = -10;
  return {
    update(t, dt, intensity) {
      if (HEARTS_ON && intensity > 0.55 && t - last > 0.5) {
        const h = pool.find((p) => p.life <= 0);
        if (h) {
          last = t;
          h.life = 2.2;
          h.x0 = (Math.random() < 0.5 ? -1 : 1) * (0.75 + Math.random() * 0.3);
          h.sway = 0.05 + Math.random() * 0.08;
          h.phase = Math.random() * 6;
          h.sp.position.set(h.x0, -0.35 + Math.random() * 0.3, 0.3);
          h.sp.visible = true;
        }
      }
      for (const h of pool) {
        if (h.life <= 0) { h.sp.visible = false; continue; }
        h.life -= dt;
        const k = 1 - clamp01(h.life / 2.2);
        h.sp.position.y += dt * 0.38;
        h.sp.position.x = h.x0 + Math.sin(t * 2.5 + h.phase) * h.sway;
        const sc = 0.12 + 0.10 * Math.sin(Math.min(1, k * 2.2) * Math.PI / 2);
        h.sp.scale.set(sc, sc, 1);
        h.sp.material.opacity = Math.min(1, k * 6) * (1 - sstep(0.6, 1, k));
      }
    },
    hide() { for (const h of pool) { h.life = 0; h.sp.visible = false; } },
  };
}

// Lebar wajah di dunia 3D (jarak dua sisi wajah), diukur langsung dari mesh yang tampil.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _s = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
function worldFaceWidth(faceMesh) {
  faceMesh.updateWorldMatrix(true, false);
  const p = faceMesh.geometry.attributes.position;
  _a.fromBufferAttribute(p, FACE_SIDE_R).applyMatrix4(faceMesh.matrixWorld);
  _b.fromBufferAttribute(p, FACE_SIDE_L).applyMatrix4(faceMesh.matrixWorld);
  return _a.distanceTo(_b);
}
// Satuan lokal di dalam anchor yang sama dengan 1 lebar wajah.
function localUnit(anchorGroup, worldWidth) {
  anchorGroup.updateWorldMatrix(true, false);
  anchorGroup.getWorldScale(_s);
  return worldWidth / (_s.x || 1);
}

async function start() {
  await checkCameraAccess();
  if (CAMERA_HD) enableHdCamera();

  const mindarThree = new MindARThree({ container: document.getElementById('container') });
  const { renderer, scene, camera } = mindarThree;
  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, IS_MOBILE ? 1 : 1.5), MAX_PIXEL_RATIO));

  setStatus('Menyiapkan pelukan...', 'idle');
  await tick();

  // Wajah tak terlihat, hanya untuk menutupi bagian benda yang ada di belakang wajah.
  const faceMesh = mindarThree.addFaceMesh();
  faceMesh.frustumCulled = false;
  faceMesh.material = new THREE.MeshBasicMaterial({ colorWrite: false });
  faceMesh.renderOrder = -1;
  scene.add(faceMesh);

  // Pencahayaan tiga titik: utama, pengisi, dan cahaya belakang hangat.
  try { scene.environment = makeEnvironment(renderer); } catch (e) { console.warn('Lingkungan dilewati:', e); }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 0.8));
  const key = new THREE.DirectionalLight(0xfff4ea, 1.2);
  key.position.set(0.6, 1, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.45);
  fill.position.set(-2, 0.2, 1.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffc9a8, 0.7);
  rim.position.set(0, 1, -2);
  scene.add(rim);

  // Semua lengan menempel di dagu: holder = skala + putaran, content = geseran.
  const anchor = mindarThree.addAnchor(CHIN);
  const holder = new THREE.Group();
  const content = new THREE.Group();
  const hug = makeHug();
  content.add(hug.group);
  holder.add(content);
  const hearts = makeHearts(holder);
  holder.visible = false;
  anchor.group.add(holder);

  const tuner = SHOW_TUNER ? buildTuner() : null;

  setStatus('Memuat model wajah... butuh internet, bisa 10-30 detik', 'idle');
  await mindarThree.start(); // minta kamera depan, memuat model deteksi wajah
  setStatus('Mencari wajah', 'searching');

  let hadFace = false, lostCount = 0;
  let simT = 0, lastNow = performance.now(), react = 0, frame = 0;
  const smoothQ = new THREE.Quaternion();
  let smoothInit = false;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    simT += dt * tune.animSpeed;

    // Anchor wajah tidak punya event found/lost; gunakan getLatestEstimate():
    // bernilai null jika tidak ada wajah pada frame terakhir.
    const hasFace = mindarThree.getLatestEstimate() !== null;
    const W = hasFace ? worldFaceWidth(faceMesh) : 0;
    const ok = hasFace && W > 0 && isFinite(W);

    holder.visible = ok;
    if (ok) {
      const u = localUnit(anchor.group, W);
      anchor.group.getWorldQuaternion(_q);
      _qi.copy(_q).invert();
      // putaran dihaluskan supaya lengan terasa punya bobot, tidak ikut bergetar
      const target = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), _qi, 1 - tune.follow);
      if (!smoothInit) { smoothQ.copy(target); smoothInit = true; } else smoothQ.slerp(target, 1 - Math.exp(-dt * 12));
      holder.quaternion.copy(smoothQ);

      // reaksi wajah
      let reaction = { value: 0, mouth: 0, open: 0 };
      if (REACT_TO_FACE) reaction = faceReaction(faceMesh.geometry);
      react += (reaction.value - react) * Math.min(1, dt * 6);

      let sq = 0, breath = 0;
      if (ANIMATE) {
        breath = Math.sin(simT * 1.6);
        sq = Math.min(1, 0.18 * (0.5 + 0.5 * Math.sin(simT * 1.1)) + react);
        animateHug(hug, simT, sq);
      } else {
        animateHug(hug, 0, 0);
      }
      holder.scale.setScalar(u * tune.hugSize * (1 + 0.012 * breath));
      content.position.set(tune.hugX, tune.hugY + 0.012 * breath, tune.hugZ);
      hearts.update(simT, dt, react);

      if (tuner && (frame++ % 10 === 0)) {
        tuner.setLive('mulut/lebar wajah: ' + reaction.mouth.toFixed(3) + '\nbuka mulut: ' + reaction.open.toFixed(3) + '\nreaksi: ' + react.toFixed(2));
      }
    } else {
      hearts.hide();
    }

    if (hasFace !== hadFace) {
      hadFace = hasFace;
      if (hasFace) setStatus('Wajah terdeteksi', 'found');
      else { lostCount++; setStatus('Wajah tidak terdeteksi - mencari wajah', 'searching'); }
      document.getElementById('info').textContent = 'Wajah hilang ' + lostCount + ' kali.';
    }
    renderer.render(scene, camera);
  });
}

setupStartButton(start);