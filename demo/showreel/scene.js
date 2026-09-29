// Шоурил Mintly: семь сцен по такту в 4 секунды (120 BPM).
// Главное — 0% комиссии и скорость сделок; остальное их подкрепляет.
// Кадр зависит только от t: renderAt(t) можно звать в любом порядке.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { TTFLoader } from "three/addons/loaders/TTFLoader.js";
import { Font } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const W = 1920, H = 1080;
// ?pr=2 — рендер в двойном разрешении (суперсэмплинг, потом уменьшаем).
const PR = Number(new URLSearchParams(location.search).get("pr") || 1);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(PR);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
document.getElementById("stage").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#06050c");
scene.fog = new THREE.Fog("#06050c", 16, 46);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 160);
scene.add(new THREE.AmbientLight("#ffffff", 0.22));
const key = new THREE.DirectionalLight("#ffffff", 1.5); key.position.set(4, 6, 9); scene.add(key);
const rimV = new THREE.PointLight("#9B3DFF", 90, 40, 1.4); rimV.position.set(-7, 3, -2); scene.add(rimV);
const rimG = new THREE.PointLight("#19FB9B", 35, 40, 1.4); rimG.position.set(7, -3, -1); scene.add(rimG);
const sweep = new THREE.PointLight("#ffffff", 0, 14, 1.2); scene.add(sweep);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(PR); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.42, 0.5, 0.97);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- помощники ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const eIO = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const eOut = (k) => (k === 1 ? 1 : 1 - Math.pow(2, -10 * k));
const eIn = (k) => k * k * k;
const eBack = (k) => { const c = 1.4; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
function rnd(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  // save/restore: иначе textAlign и тень с прошлой отрисовки портят следующую.
  tex.redraw = (...a) => { g.clearRect(0, 0, w, h); g.save(); draw(g, w, h, ...a); g.restore(); tex.needsUpdate = true; };
  tex.redraw();
  return tex;
}
function cssGrad(g, w, h, deg, stops) {
  const a = (deg * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
  const L = Math.abs(w * dx) + Math.abs(h * dy), cx = w / 2, cy = h / 2;
  const gr = g.createLinearGradient(cx - (dx * L) / 2, cy - (dy * L) / 2, cx + (dx * L) / 2, cy + (dy * L) / 2);
  stops.forEach(([c, p]) => gr.addColorStop(p, c));
  return gr;
}
// Тот же CSS-градиент, но цветами вершин: торцы карт и объёмные буквы
// окрашены продолжением лицевой заливки, а не тёмной кромкой.
function gradColors(geo, stops, deg) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, w = b.max.x - b.min.x, h = b.max.y - b.min.y;
  const a = (deg * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a), L = Math.abs(w * dx) + Math.abs(h * dy);
  const cols = stops.map(([c, p]) => [new THREE.Color(c), p]);
  const p = geo.attributes.position, out = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) - (b.min.x + w / 2), y = -(p.getY(i) - (b.min.y + h / 2));
    const k = clamp((x * dx + y * dy) / L + 0.5);
    let j = 1; while (j < cols.length - 1 && k > cols[j][1]) j++;
    const [c0, p0] = cols[j - 1], [c1, p1] = cols[j];
    c.copy(c0).lerp(c1, clamp((k - p0) / Math.max(1e-6, p1 - p0))).toArray(out, i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(out, 3));
  return geo;
}
const gradMat = () => new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06 });

// ---------- данные ----------
const MINTLY = [["#E44BC8", 0], ["#C13AE6", 0.18], ["#8E2DE2", 0.36], ["#6A17E8", 0.54], ["#4A00E0", 0.7], ["#7B1FE0", 0.84], ["#2C0A78", 1]];
const BRIGHT = [["#FF6AD5", 0], ["#C13AE6", 0.3], ["#8E2DE2", 0.55], ["#5B2CFF", 0.8], ["#19FB9B", 1]];
const UP = new THREE.Color("#00E96B"), DOWN = new THREE.Color("#FF3B47");
const OHLC = await fetch("assets/sol-ohlc.json").then((r) => r.json()); // свечи SOLUSD, Kraken, 15 мин

// ---------- шрифт для объёмных букв ----------
const font = await new Promise((ok, fail) => new TTFLoader().load("assets/fonts/nunito-900.woff", (j) => ok(new Font(j)), undefined, fail));
function text3D(str, size, depth, stops = BRIGHT, deg = 115) {
  const g = new TextGeometry(str, { font, size, depth, curveSegments: 14, bevelEnabled: true, bevelThickness: depth * 0.16, bevelSize: size * 0.022, bevelSegments: 6 });
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -(b.max.z + b.min.z) / 2);
  const m = new THREE.Mesh(gradColors(g, stops, deg), gradMat());
  m.userData.w = b.max.x - b.min.x;
  return m;
}

// ---------- карта ----------
const CW = 3.4, CH = 2.125, CD = 0.08, CR = 0.17;
function rrShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function faceGeo(w, h, r) {
  const g = new THREE.ShapeGeometry(rrShape(w, h, r), 32);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}
const faceMat = (map, glow = 0.22) => new THREE.MeshPhysicalMaterial({ map, emissive: "#ffffff", emissiveMap: map, emissiveIntensity: glow, roughness: 0.3, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 });
function makeCard(stops, deg) {
  const grp = new THREE.Group();
  const body = new THREE.ExtrudeGeometry(rrShape(CW, CH, CR), { depth: CD, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 6, curveSegments: 32 });
  body.translate(0, 0, -CD / 2);
  const face = faceGeo(CW, CH, CR);
  const front = canvasTex(1024, 640, (g, w, h) => {
    g.fillStyle = cssGrad(g, w, h, deg, stops); g.fillRect(0, 0, w, h);
    const hl = g.createRadialGradient(w * 0.2, -h * 0.2, 10, w * 0.2, -h * 0.2, w * 0.9);
    hl.addColorStop(0, "rgba(255,255,255,.22)"); hl.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = hl; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff"; g.font = "500 42px Onest"; g.globalAlpha = 0.92; g.fillText("Баланс", 62, 104);
    g.globalAlpha = 1; g.font = "800 112px NunitoX"; g.fillText("$1 284.50", 56, 232);
    g.font = "800 44px NunitoX"; g.fillText("12.4 SOL", 62, 578);
    g.textAlign = "right"; g.fillText("8 420 GRAM", w - 62, 578);
    g.font = "600 28px Onest"; g.globalAlpha = 0.75; g.fillText("MINTLY", w - 62, 100);
  });
  const back = canvasTex(1024, 640, (g, w, h) => { g.fillStyle = cssGrad(g, w, h, deg, stops); g.fillRect(0, 0, w, h); });
  const f = new THREE.Mesh(face, faceMat(front)); f.position.z = CD / 2 + 0.027;
  // Оборот зеркалит градиент: смотрим на него с другой стороны.
  back.wrapS = THREE.RepeatWrapping; back.repeat.x = -1;
  const bk = new THREE.Mesh(face, faceMat(back, 0.3)); bk.rotation.y = Math.PI; bk.position.z = -(CD / 2 + 0.027);
  grp.add(new THREE.Mesh(gradColors(body, stops, deg), gradMat()), f, bk);
  grp.userData.front = front;
  return grp;
}
function makeCoin() {
  const tex = canvasTex(512, 512, (g, w) => {
    g.fillStyle = cssGrad(g, w, w, 115, MINTLY); g.fillRect(0, 0, w, w);
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 14; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 34, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#fff"; g.font = "800 270px NunitoX"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("M", w / 2, w / 2 + 14);
  });
  const back = tex.clone(); back.center.set(0.5, 0.5); back.rotation = Math.PI;
  const geo = gradColors(new THREE.CylinderGeometry(0.66, 0.66, 0.16, 96), MINTLY, 115);
  const m = new THREE.Mesh(geo, [gradMat(), faceMat(tex, 0.35), faceMat(back, 0.35)]);
  m.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  const grp = new THREE.Group(); grp.add(m);
  grp.userData.tex = [tex, back];
  return grp;
}

// ---------- общие объекты ----------
const dotTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.5)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const dust = (() => {
  const R = rnd(11), N = 1600, p = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { p[i * 3] = (R() - 0.5) * 44; p[i * 3 + 1] = (R() - 0.5) * 26; p[i * 3 + 2] = -R() * 34 + 6; }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.06, map: dotTex, color: "#c7b8ff", transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
})();
scene.add(dust);
const floor = new THREE.GridHelper(80, 160, "#2c2356", "#191430"); floor.position.y = -2.6; scene.add(floor);

// «0%» — главное сообщение, живёт в первой и шестой сценах.
const zeroGrp = new THREE.Group(); scene.add(zeroGrp);
const zero = text3D("0", 3.2, 1.1), pct = text3D("%", 3.2, 1.1);
const gap = 0.25, total = zero.userData.w + gap + pct.userData.w;
zero.userData.x = -total / 2 + zero.userData.w / 2; pct.userData.x = total / 2 - pct.userData.w / 2;
zeroGrp.add(zero, pct);

// Лучи скорости.
const STREAKS = 1500;
const streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 1), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), STREAKS);
const streakSeed = [];
{
  const R = rnd(21), pal = [new THREE.Color("#B06CFF").multiplyScalar(2.2), new THREE.Color("#19FB9B").multiplyScalar(1.8), new THREE.Color("#ffffff").multiplyScalar(1.6), new THREE.Color("#FF6AD5").multiplyScalar(2)];
  for (let i = 0; i < STREAKS; i++) {
    const th = R() * Math.PI * 2, r = 1.8 + Math.pow(R(), 0.7) * 11;
    streakSeed.push({ x: Math.cos(th) * r, y: Math.sin(th) * r, z: R() * 90 });
    const c = pal[R() < 0.5 ? 0 : R() < 0.5 ? 2 : R() < 0.6 ? 1 : 3];
    streaks.setColorAt(i, c);
  }
}
scene.add(streaks);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
// Пройденный путь при разгоне — интеграл скорости, чтобы кадр зависел только от t.
function travelled(lt, speed) { let d = 0; const dt = 1 / 120; for (let x = 0; x < lt; x += dt) d += speed(x) * dt; return d; }
function placeStreaks(dist, stretch, camZ) {
  for (let i = 0; i < STREAKS; i++) {
    const s = streakSeed[i];
    const z = camZ - 90 + ((s.z + dist) % 90);
    tmpP.set(s.x, s.y, z); tmpS.set(1, 1, stretch); tmpM.compose(tmpP, tmpQ, tmpS);
    streaks.setMatrixAt(i, tmpM);
  }
  streaks.instanceMatrix.needsUpdate = true;
}

// ---------- сцена 2: свечи и панель «0%» ----------
const candleGrp = new THREE.Group(); scene.add(candleGrp);
const NC = OHLC.length, lo = Math.min(...OHLC.map((c) => c[2])), hi = Math.max(...OHLC.map((c) => c[1]));
const py = (v) => -1.6 + ((v - lo) / (hi - lo)) * 4.6, cx = (i) => (i - (NC - 1) / 2) * 0.24;
const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1, 0.16), new THREE.MeshBasicMaterial({ toneMapped: false }), NC);
const wicks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 1, 0.035), new THREE.MeshBasicMaterial({ toneMapped: false }), NC);
OHLC.forEach(([o, , , c], i) => { const edge = Math.min(1, Math.min(i, NC - 1 - i) / 9); const col = (c >= o ? UP : DOWN).clone().multiplyScalar(1.5 * (0.08 + 0.92 * edge * edge)); bodies.setColorAt(i, col); wicks.setColorAt(i, col.clone().multiplyScalar(0.7)); });
candleGrp.add(bodies, wicks);
const feePanel = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(1260, 780, (g, w, h) => {
  g.fillStyle = "rgba(20,14,40,.93)"; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 64); g.fill();
  g.strokeStyle = "rgba(190,160,255,.55)"; g.lineWidth = 5; g.stroke();
  g.fillStyle = "#cfc3f5"; g.font = "500 56px Onest"; g.fillText("Комиссия площадки", 80, 150);
  g.fillStyle = "#19FB9B"; g.shadowColor = "#19FB9B"; g.shadowBlur = 50; g.font = "800 330px NunitoX"; g.fillText("0%", 64, 520); g.shadowBlur = 0;
  g.fillStyle = "#e9e3ff"; g.font = "500 50px Onest"; g.fillText("на покупку и продажу", 80, 660);
}) }));
candleGrp.add(feePanel);

// ---------- сцена 4: кошелёк → монета ----------
const walletGrp = new THREE.Group(); scene.add(walletGrp);
const card = makeCard(MINTLY, 115); walletGrp.add(card);
const coinB = makeCoin(); walletGrp.add(coinB);
const beamCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.4, 0.1, 0.3), new THREE.Vector3(0, 0.75, 0.9), new THREE.Vector3(1.9, 0.1, 0.3)]);
const beam = new THREE.Mesh(new THREE.TubeGeometry(beamCurve, 80, 0.035, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color("#B06CFF").multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
walletGrp.add(beam);
const PULSES = [0.55, 1.2, 1.72, 2.14, 2.48, 2.76, 2.99, 3.18, 3.34, 3.47];
const pulseSprites = PULSES.map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: new THREE.Color("#19FB9B").multiplyScalar(3), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(0.7, 0.7, 1); walletGrp.add(s); return s; });

// ---------- сцена 5: бондинг-кривая ----------
const curveGrp = new THREE.Group(); scene.add(curveGrp);
const curvePts = []; for (let i = 0; i <= 120; i++) { const u = i / 120; curvePts.push(new THREE.Vector3(lerp(-5.2, 5.2, u), -2.3 + 4.8 * Math.pow(u, 2.3), 0)); }
const bCurve = new THREE.CatmullRomCurve3(curvePts);
function colorTube(r, op) {
  const g = new THREE.TubeGeometry(bCurve, 240, r, 16, false);
  const col = new Float32Array(g.attributes.position.count * 3), a = new THREE.Color("#9B3DFF").multiplyScalar(1.6), b = new THREE.Color("#19FB9B").multiplyScalar(1.6), c = new THREE.Color();
  for (let i = 0; i < g.attributes.position.count; i++) { c.copy(a).lerp(b, clamp((g.attributes.position.getX(i) + 5.2) / 10.4)); c.toArray(col, i * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: op < 1, opacity: op, depthWrite: op === 1, blending: op < 1 ? THREE.AdditiveBlending : THREE.NormalBlending }));
}
const tube = colorTube(0.05, 1), tubeGlow = colorTube(0.22, 0.14);
curveGrp.add(tube, tubeGlow);
const coinC = makeCoin(); curveGrp.add(coinC);
const TRAIL = 46, trailPos = new Float32Array(TRAIL * 3), trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ size: 0.22, map: dotTex, color: new THREE.Color("#19FB9B").multiplyScalar(1.5), toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
curveGrp.add(trail);
const BURST = 260, burstDir = [], burstPos = new Float32Array(BURST * 3), burstGeo = new THREE.BufferGeometry();
{ const R = rnd(5); for (let i = 0; i < BURST; i++) { const th = R() * Math.PI * 2, ph = Math.acos(2 * R() - 1), sp = 1.4 + R() * 3; burstDir.push(new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)).multiplyScalar(sp)); } }
burstGeo.setAttribute("position", new THREE.BufferAttribute(burstPos, 3));
const burstMat = new THREE.PointsMaterial({ size: 0.15, map: dotTex, color: new THREE.Color("#e2d4ff").multiplyScalar(1.6), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const burst = new THREE.Points(burstGeo, burstMat); curveGrp.add(burst);

// ---------- сцена 3: монета сквозь тоннель ----------
const coinA = makeCoin(); scene.add(coinA);
const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 12, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color("#d8c4ff").multiplyScalar(2), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(ring);

// ---------- финал ----------
const word = text3D("Mintly", 1.9, 0.6, MINTLY, 100); scene.add(word);

// ---------- интерфейс ----------
const $ = (id) => document.getElementById(id);
const show = (id, k, dy = 0, dx = 0) => { const e = $(id); e.style.opacity = k; e.style.transform = `translate(${(1 - k) * dx}px,${(1 - k) * dy}px)`; };
const S = [0, 4, 8, 12, 16, 20, 24, 28];
const CHIPS = { 1: ["Трейдинг", "покупай и продавай мемкоины без комиссии площадки"], 3: ["Кошелёк", "уже внутри Telegram — ничего подключать не надо"], 4: ["Запуск", "свой мемкоин на TON и Solana"] };
const cam = (px, py, pz, lx, ly, lz) => { camera.position.set(px, py, pz); camera.lookAt(lx, ly, lz); };
const all = [zeroGrp, candleGrp, floor, streaks, walletGrp, curveGrp, coinA, ring, word];

window.renderAt = (t) => {
  let si = S.findIndex((s, i) => t >= s && t < S[i + 1]); if (si < 0) si = 6;
  const lt = t - S[si];
  all.forEach((o) => (o.visible = false));
  camera.rotation.z = 0;
  dust.rotation.y = t * 0.02; dust.position.y = Math.sin(t * 0.3) * 0.3;
  sweep.intensity = 0;

  if (si === 0) {
    zeroGrp.visible = true;
    [zero, pct].forEach((m, i) => {
      const k = eOut(prog(lt, 0.1 + i * 0.16, 1.5 + i * 0.16));
      m.position.set(m.userData.x, lerp(-1.5, 0, k), lerp(-16, 0, k));
      m.rotation.set(lerp(-0.9, 0, k), lerp(i ? 1.6 : -1.6, 0, k), 0);
    });
    zeroGrp.position.set(0, 0.95, 0);
    zeroGrp.rotation.set(Math.sin(lt * 0.9) * 0.04, Math.sin(lt * 0.7) * 0.2, 0);
    zeroGrp.scale.setScalar(1);
    sweep.intensity = 60 * Math.sin(Math.PI * prog(lt, 0.9, 2.9)); sweep.position.set(lerp(-7, 7, prog(lt, 0.9, 2.9)), 2, 3.2);
    const push = eIn(prog(lt, 3.3, 4));
    cam(0, 0.5, lerp(14, 12.6, eIO(prog(lt, 0, 3.3))) - push * 7, 0, 0.5, 0);
  } else if (si === 1) {
    candleGrp.visible = floor.visible = true;
    OHLC.forEach(([o, h, l, c], i) => {
      const k = eOut(prog(lt, 0.15 + i * 0.03, 0.45 + i * 0.03));
      const y0 = py(Math.min(o, c)), y1 = py(Math.max(o, c)), bh = Math.max(0.04, y1 - y0);
      tmpS.set(1, bh * k + 1e-4, 1); tmpP.set(cx(i), y0 + (bh * k) / 2, 0); tmpM.compose(tmpP, tmpQ, tmpS); bodies.setMatrixAt(i, tmpM);
      const wl = py(l), wh = py(h);
      tmpS.set(1, (wh - wl) * k + 1e-4, 1); tmpP.set(cx(i), wl + ((wh - wl) * k) / 2, 0); tmpM.compose(tmpP, tmpQ, tmpS); wicks.setMatrixAt(i, tmpM);
    });
    bodies.instanceMatrix.needsUpdate = wicks.instanceMatrix.needsUpdate = true;
    const k = eIO(prog(lt, 0, 4));
    const pk = eBack(prog(lt, 1.5, 2.3));
    feePanel.position.set(lerp(-3.5, 1.6, k) + 1.5, lerp(-5, 1.35, pk), 3.2); feePanel.rotation.set(0, -0.22, 0);
    feePanel.visible = lt > 1.5;
    cam(lerp(-6, 1.2, k), lerp(0.4, 1.6, k), lerp(8.5, 11.5, k), lerp(-3.5, 1.6, k), 0.2, 0);
  } else if (si === 2) {
    streaks.visible = true;
    const speed = (x) => 22 + 95 * eIO(prog(x, 0, 1.6)) - 70 * eIO(prog(x, 2.2, 3.8));
    const v = speed(lt);
    placeStreaks(travelled(lt, speed), 0.6 + v * 0.1, 6);
    streaks.material.opacity = 1 - 0.6 * eIO(prog(lt, 1.7, 2.3));
    const f = prog(lt, 0.9, 1.72);
    coinA.visible = f > 0 && f < 1;
    coinA.position.set(lerp(0.2, 0.9, f), lerp(-0.1, -0.5, f), lerp(-80, 9, eIn(f)));
    coinA.rotation.set(0, f * 9, 0);
    coinA.scale.setScalar(1.3);
    const r = prog(lt, 1.72, 2.6);
    ring.visible = r > 0 && r < 1; ring.scale.setScalar(lerp(0.5, 9, eOut(r))); ring.material.opacity = 1 - r; ring.position.set(0, 0, -2);
    camera.position.set(0, 0, 6); camera.lookAt(0, 0, -10); camera.rotation.z = Math.sin(lt * 1.3) * 0.06;
  } else if (si === 3) {
    walletGrp.visible = true;
    const inK = eOut(prog(lt, 0, 0.9));
    card.position.set(lerp(-7, -3.1, inK), Math.sin(lt * 1.4) * 0.06, 0); card.rotation.set(0.1, lerp(1.2, 0.42, inK) + Math.sin(lt * 0.8) * 0.04, 0.03);
    let pop = 0;
    PULSES.forEach((p0, i) => {
      const k = prog(lt, p0, p0 + 0.3), s = pulseSprites[i];
      s.visible = k > 0 && k < 1; beamCurve.getPointAt(eIO(k), s.position);
      if (lt > p0 + 0.3) pop = Math.max(pop, Math.exp(-(lt - p0 - 0.3) * 9));
    });
    coinB.position.set(lerp(7, 3.2, eOut(prog(lt, 0.1, 1.0))), Math.sin(lt * 1.6 + 1) * 0.08, 0);
    coinB.scale.setScalar(1.35 * (1 + pop * 0.18)); coinB.rotation.set(0, -0.45 + lt * 0.25, 0);
    beam.material.opacity = 0.35 + pop * 0.4;
    cam(lerp(-0.4, 0.4, eIO(prog(lt, 0, 4))), 0.5, lerp(12, 10.2, eIO(prog(lt, 0, 4))), 0, 0.1, 0);
  } else if (si === 4) {
    curveGrp.visible = floor.visible = true;
    const draw = eIO(prog(lt, 0, 1.4));
    [tube, tubeGlow].forEach((m) => m.geometry.setDrawRange(0, Math.floor((m.geometry.index.count * draw) / 6) * 6));
    const s = lerp(0.03, 0.985, eIO(prog(lt, 0.7, 3.3))), p = bCurve.getPointAt(s);
    coinC.visible = lt > 0.55;
    coinC.position.set(p.x, p.y + 0.85, p.z); coinC.scale.setScalar(eBack(prog(lt, 0.55, 0.95)));
    coinC.rotation.set(0, eIO(prog(lt, 0.55, 3.3)) * Math.PI * 6, 0);
    for (let i = 0; i < TRAIL; i++) { const q = bCurve.getPointAt(clamp(s - i * 0.006)); trailPos.set([q.x, q.y + 0.85, q.z], i * 3); }
    trailGeo.attributes.position.needsUpdate = true; trail.visible = coinC.visible;
    const b = prog(lt, 3.3, 4), end = bCurve.getPointAt(0.985);
    burst.visible = b > 0; burstMat.opacity = 1 - b;
    for (let i = 0; i < BURST; i++) burstPos.set([end.x + burstDir[i].x * eOut(b), end.y + 0.85 + burstDir[i].y * eOut(b), end.z + burstDir[i].z * eOut(b)], i * 3);
    burstGeo.attributes.position.needsUpdate = true;
    // Кривая целиком в кадре: камера только слегка тянется за монетой.
    cam(p.x * 0.12, p.y * 0.1 + 0.6, 14.5 - lt * 0.35, p.x * 0.18, p.y * 0.12 + 0.3, 0);
  } else if (si === 5) {
    zeroGrp.visible = streaks.visible = true;
    placeStreaks(lt * 9, 1.2, 4); streaks.material.opacity = 0.7;
    const k = eOut(prog(lt, 0, 1.0));
    [zero, pct].forEach((m) => { m.position.set(m.userData.x, 0, 0); m.rotation.set(0, 0, 0); });
    zeroGrp.position.set(-3.3, 0.3, lerp(-14, 0, k));
    zeroGrp.rotation.set(0.05, lerp(1.2, 0.32, k) + Math.sin(lt * 0.8) * 0.06, 0);
    zeroGrp.scale.setScalar(0.6);
    sweep.intensity = 50 * Math.sin(Math.PI * prog(lt, 1.0, 3.2)); sweep.position.set(lerp(-8, 1, prog(lt, 1.0, 3.2)), 1.5, 3);
    cam(0, 0.3, 12.5 - lt * 0.2, 0, 0.2, 0);
  } else {
    word.visible = true;
    const k = eOut(prog(lt, 0.05, 1.3));
    word.position.set(0, lerp(-0.6, 0.85, k), lerp(-10, 0, k));
    word.rotation.set(lerp(0.6, 0.05, k), lerp(-0.8, 0, k) + Math.sin(lt * 0.7) * 0.08, 0);
    sweep.intensity = 50 * Math.sin(Math.PI * prog(lt, 1.0, 3.0)); sweep.position.set(lerp(-6, 6, prog(lt, 1.0, 3.0)), 2, 3);
    cam(0, 0.4, 11.5 - lt * 0.25, 0, 0.3, 0);
  }

  // интерфейс
  const io = (a, b, c, d) => eOut(prog(lt, a, b)) * (1 - eIO(prog(lt, c, d)));
  show("cap1", si === 0 ? io(1.35, 2.0, 3.2, 3.7) : 0, 30);
  const ch = CHIPS[si];
  if (ch) { $("chipTag").textContent = ch[0]; $("chipText").textContent = ch[1]; }
  show("chip", ch ? io(0.4, 1.0, 3.5, 3.9) : 0, 0, -40);
  show("fast", si === 2 ? io(1.75, 2.3, 3.6, 3.95) : 0, 40);
  show("fastBg", si === 2 ? io(1.6, 2.2, 3.6, 3.95) : 0);
  show("lock", si === 5 ? io(0.7, 1.4, 3.5, 3.95) : 0, 0, 60);
  show("end", si === 6 ? eOut(prog(lt, 0.8, 1.6)) : 0, 36);
  const flashes = [[4, 0.3], [8, 0.3], [9.72, 0.45], [12, 0.3], [16, 0.3], [20, 0.3], [24, 0.3]];
  let fl = 0; flashes.forEach(([c, d]) => { if (t >= c && t < c + d) fl = Math.max(fl, (1 - (t - c) / d) * (c === 9.72 ? 0.85 : 0.45)); });
  $("flash").style.opacity = fl;
  $("fade").style.opacity = Math.max(prog(t, 26.8, 28), 1 - prog(t, 0, 0.45));

  composer.render();
};

await document.fonts.load("800 40px NunitoX", "Баланс0%"); await document.fonts.load("500 40px Onest", "Баланс"); await document.fonts.ready;
// Текстуры рисовались до загрузки шрифтов — перерисовываем все.
scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; ms.forEach((m) => m.map && m.map.redraw && m.map.redraw()); });
[coinA, coinB, coinC].forEach((c) => { c.userData.tex[0].redraw(); c.userData.tex[1].needsUpdate = true; });
window.renderAt(0.01);
window.ready = true;
