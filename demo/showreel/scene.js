// Шоурил Mintly: шесть сцен по одному такту в 4 секунды (120 BPM).
// Всё детерминировано: кадр зависит только от t, поэтому renderAt(t)
// можно вызывать в любом порядке — рендер снимает кадры по одному.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const W = 1920, H = 1080;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById("stage").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#07060d");
scene.fog = new THREE.Fog("#07060d", 14, 40);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 120);
scene.add(new THREE.AmbientLight("#ffffff", 0.25));
const key = new THREE.DirectionalLight("#ffffff", 1.3); key.position.set(4, 6, 8); scene.add(key);
const rimV = new THREE.PointLight("#8E2DE2", 60, 40, 1.4); rimV.position.set(-7, 3, -2); scene.add(rimV);
const rimG = new THREE.PointLight("#19FB9B", 25, 40, 1.4); rimG.position.set(7, -3, -1); scene.add(rimG);

// ---------- помощники ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const eIO = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const eOut = (k) => (k === 1 ? 1 : 1 - Math.pow(2, -10 * k));
const eBack = (k) => { const c = 1.5; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
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
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

// ---------- данные приложения ----------
// Заливки — ровно те, что в WALLET_SKINS приложения.
const SKINS = [
  { name: "Mintly", deg: 115, stops: [["#E44BC8", 0], ["#C13AE6", 0.18], ["#8E2DE2", 0.36], ["#6A17E8", 0.54], ["#4A00E0", 0.7], ["#7B1FE0", 0.84], ["#2C0A78", 1]], edge: "#3a1470", bal: "$1 284.50", sol: "12.4", gram: "8 420" },
  { name: "Полночь", deg: 140, stops: [["#0F2027", 0], ["#203A43", 0.45], ["#2C5364", 1]], edge: "#15303a", bal: "$96.20", sol: "0.8", gram: "120" },
  { name: "Свеча", deg: 115, stops: [["#00A34C", 0], ["#00E96B", 0.26], ["#0B2A1A", 0.58], ["#E01E37", 0.86], ["#FF3B47", 1]], edge: "#0b2a1a", bal: "$3 410.00", sol: "31.2", gram: "64 000" },
  { name: "Золото", deg: 120, stops: [["#8A5E06", 0], ["#F0B429", 0.32], ["#FFF0C2", 0.5], ["#F0B429", 0.68], ["#6A4A08", 1]], edge: "#6a4a08", bal: "$712.80", sol: "5.9", gram: "3 300", shadow: true },
  { name: "Солана", deg: 120, stops: [["#9945FF", 0], ["#7A3DF5", 0.35], ["#19FB9B", 1]], edge: "#3b1d7a", bal: "$58.40", sol: "0.5", gram: "410" },
  { name: "Магма", deg: 125, stops: [["#2B0A02", 0], ["#8E1400", 0.3], ["#FF3B00", 0.55], ["#FFD08A", 0.74], ["#7A1B00", 1]], edge: "#4a0e00", bal: "$2 205.00", sol: "18.1", gram: "12 900" },
];
// Курсы — настоящие получасовые свечи Kraken за сутки (SOLUSD, TONUSD).
const RATES = {
  SOL: [118.04, 118.21, 118.65, 119.93, 119.24, 119.63, 119.69, 119.72, 119.93, 118.83, 118.31, 118.75, 118.76, 118.23, 117.68, 117.65, 118.55, 118.91, 118.83, 118.73, 118.09, 116.7, 117.12, 116.59, 116.9, 117.84, 117.8, 117.84, 117.65, 118.02, 118.21, 119.0, 119.2, 119.31, 119.49, 119.56, 119.13, 119.26, 119.87, 119.63, 119.39, 119.27, 120.11, 120.12, 120.87, 121.17, 121.0, 120.48],
  GRAM: [1.616, 1.605, 1.607, 1.641, 1.651, 1.648, 1.64, 1.649, 1.645, 1.616, 1.601, 1.605, 1.602, 1.582, 1.568, 1.563, 1.574, 1.574, 1.573, 1.576, 1.565, 1.546, 1.555, 1.535, 1.54, 1.542, 1.551, 1.57, 1.558, 1.559, 1.55, 1.561, 1.58, 1.591, 1.59, 1.597, 1.588, 1.58, 1.588, 1.582, 1.572, 1.58, 1.58, 1.561, 1.553, 1.551, 1.553, 1.543],
};
const UP = "#00E96B", DOWN = "#FF3B47";

// ---------- карта ----------
const CW = 3.4, CH = 2.125, CD = 0.07, CR = 0.17;
function rrShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function slabGeo(w, h, d, r) {
  const g = new THREE.ExtrudeGeometry(rrShape(w, h, r), { depth: d, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 24 });
  g.translate(0, 0, -d / 2);
  return g;
}
function faceGeo(w, h, r) {
  const g = new THREE.ShapeGeometry(rrShape(w, h, r), 24);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}
const CARD_BODY = slabGeo(CW, CH, CD, CR), CARD_FACE = faceGeo(CW, CH, CR);
function faceMat(map, glow = 0.38) {
  return new THREE.MeshPhysicalMaterial({ map, emissive: "#ffffff", emissiveMap: map, emissiveIntensity: glow, roughness: 0.34, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1 });
}
function frontTex(s) {
  return canvasTex(1024, 640, (g, w, h) => {
    g.fillStyle = cssGrad(g, w, h, s.deg, s.stops); g.fillRect(0, 0, w, h);
    const hl = g.createRadialGradient(w * 0.2, -h * 0.2, 10, w * 0.2, -h * 0.2, w * 0.9);
    hl.addColorStop(0, "rgba(255,255,255,.22)"); hl.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = hl; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff"; g.textBaseline = "alphabetic";
    if (s.shadow) { g.shadowColor = "rgba(40,25,0,.7)"; g.shadowBlur = 18; g.shadowOffsetY = 3; }
    g.font = "500 42px Onest"; g.globalAlpha = 0.92; g.fillText("Баланс", 62, 104);
    g.globalAlpha = 1; g.font = "800 112px NunitoX"; g.fillText(s.bal, 56, 232);
    g.font = "800 44px NunitoX"; g.fillText(`${s.sol} SOL`, 62, 578);
    g.textAlign = "right"; g.fillText(`${s.gram} GRAM`, w - 62, 578);
    g.font = "600 28px Onest"; g.globalAlpha = 0.75; g.fillText(s.name.toUpperCase(), w - 62, 100);
  });
}
function backTex(s) {
  return canvasTex(1024, 640, (g, w, h) => {
    g.fillStyle = cssGrad(g, w, h, s.deg + 180, s.stops); g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(10,4,30,.38)"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#fff"; g.font = "800 40px NunitoX"; g.fillText("Секретная фраза", 56, 82);
    // Слова не показываем: это витрина, а не чей-то кошелёк.
    const cols = 4, rows = 6, x0 = 50, y0 = 118, cw = (w - 100) / cols, rh = 80;
    for (let i = 0; i < 24; i++) {
      const c = Math.floor(i / rows), r = i % rows, x = x0 + c * cw, y = y0 + r * rh;
      g.fillStyle = "rgba(255,255,255,.13)"; rr(g, x + 6, y, cw - 12, 64, 18); g.fill();
      g.fillStyle = "rgba(255,255,255,.6)"; g.font = "600 24px Onest"; g.fillText(String(i + 1), x + 24, y + 41);
      g.fillStyle = "#fff"; g.font = "800 30px NunitoX"; g.fillText("• • • • •", x + 66, y + 43);
    }
  });
}
function makeCard(s, withBack = false) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(CARD_BODY, new THREE.MeshPhysicalMaterial({ color: s.edge, metalness: 0.85, roughness: 0.28, clearcoat: 1 }));
  const front = new THREE.Mesh(CARD_FACE, faceMat(frontTex(s)));
  front.position.z = CD / 2 + 0.022;
  const back = new THREE.Mesh(CARD_FACE, withBack ? faceMat(backTex(s), 0.3) : new THREE.MeshPhysicalMaterial({ color: s.edge, metalness: 0.6, roughness: 0.35 }));
  back.rotation.y = Math.PI; back.position.z = -(CD / 2 + 0.022);
  grp.add(body, front, back);
  return grp;
}

// ---------- пыль вокруг, для глубины ----------
const dotTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.5)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const dust = (() => {
  const R = rnd(11), N = 1400, p = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { p[i * 3] = (R() - 0.5) * 40; p[i * 3 + 1] = (R() - 0.5) * 22; p[i * 3 + 2] = -R() * 30 + 6; }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.07, map: dotTex, color: "#b9a8ff", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
})();
scene.add(dust);

// ---------- сцены ----------
const S = [0, 4, 8, 12, 16, 20, 24];
const groups = Array.from({ length: 6 }, () => { const g = new THREE.Group(); scene.add(g); return g; });

// 1 · герой: карта Mintly
const hero = makeCard(SKINS[0]); groups[0].add(hero);

// 2 · кольцо скинов
const ring = new THREE.Group(); groups[1].add(ring);
const ringCards = SKINS.map((s) => { const c = makeCard(s); ring.add(c); return c; });

// 3 · виджеты курса + сетка клеток
const WW = 3.5, WH = 2.3;
const WID_BODY = slabGeo(WW, WH, 0.08, 0.28), WID_FACE = faceGeo(WW, WH, 0.28);
function rateTex(name, arr, dec) {
  return canvasTex(1024, 672, (g, w, h, k = 1, show = 1) => {
    g.fillStyle = "#12101f"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(160,140,255,.06)"; g.lineWidth = 2;
    for (let x = 0; x < w; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    const last = arr[arr.length - 1], pct = (last / arr[0] - 1) * 100, col = pct >= 0 ? UP : DOWN;
    g.fillStyle = "#f4f2ff"; g.font = "800 60px NunitoX"; g.fillText(name, 60, 104);
    g.font = "800 104px NunitoX"; g.fillText("$" + (last * k).toFixed(dec), 56, 222);
    const mn = Math.min(...arr), mx = Math.max(...arr), x0 = 40, x1 = w - 40, yT = 290, yB = 540;
    const n = Math.max(2, Math.round(arr.length * show));
    const P = arr.slice(0, n).map((v, i) => [x0 + (i / (arr.length - 1)) * (x1 - x0), yB - ((v - mn) / (mx - mn)) * (yB - yT)]);
    const fill = g.createLinearGradient(0, yT, 0, yB + 40); fill.addColorStop(0, col + "55"); fill.addColorStop(1, col + "00");
    g.beginPath(); g.moveTo(P[0][0], yB + 40); P.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(P[P.length - 1][0], yB + 40); g.closePath(); g.fillStyle = fill; g.fill();
    g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokeStyle = col; g.lineWidth = 7; g.lineJoin = "round"; g.lineCap = "round"; g.shadowColor = col; g.shadowBlur = 22; g.stroke(); g.shadowBlur = 0;
    const [ex, ey] = P[P.length - 1]; g.fillStyle = col; g.beginPath(); g.arc(ex, ey, 11, 0, Math.PI * 2); g.fill();
    g.globalAlpha = clamp((show - 0.9) * 10); g.font = "800 52px NunitoX"; g.fillStyle = col;
    g.fillText(`${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`, 60, 630); g.globalAlpha = 1;
  });
}
const widgets = [["SOL", RATES.SOL, 2], ["GRAM", RATES.GRAM, 3]].map(([n, a, d]) => {
  const tex = rateTex(n, a, d);
  const grp = new THREE.Group();
  const body = new THREE.Mesh(WID_BODY, new THREE.MeshPhysicalMaterial({ color: "#1e1a36", metalness: 0.7, roughness: 0.3, clearcoat: 1 }));
  const face = new THREE.Mesh(WID_FACE, faceMat(tex, 0.55)); face.position.z = 0.062;
  grp.add(body, face); grp.userData = { tex, a, d }; groups[2].add(grp);
  return grp;
});
const GX = 34, GY = 18, cells = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5, metalness: 0.3 }), GX * GY);
cells.position.set(0, 0, -4.2); groups[2].add(cells);
const cellSeed = Array.from({ length: GX * GY }, (_, i) => rnd(i + 99)());
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), BASE = new THREE.Color("#16122b"), CV = new THREE.Color("#8E2DE2"), CG = new THREE.Color("#19FB9B");
for (let i = 0; i < GX * GY; i++) cells.setColorAt(i, BASE);

// 4 · переворот: лицевая сторона и оборот с сид-фразой
const flip = makeCard(SKINS[0], true); groups[3].add(flip);
const finger = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: "#ffffff", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
finger.scale.set(0.55, 0.55, 1); groups[3].add(finger);

// 5 · бондинг-кривая и монета
const curvePts = []; for (let i = 0; i <= 120; i++) { const u = i / 120, x = lerp(-5.2, 5.2, u); curvePts.push(new THREE.Vector3(x, -2.3 + 4.8 * Math.pow(u, 2.3), 0)); }
const bCurve = new THREE.CatmullRomCurve3(curvePts);
function colorTube(r, op) {
  const g = new THREE.TubeGeometry(bCurve, 240, r, 16, false);
  const col = new Float32Array(g.attributes.position.count * 3), a = new THREE.Color("#8E2DE2"), b = new THREE.Color("#19FB9B"), c = new THREE.Color();
  for (let i = 0; i < g.attributes.position.count; i++) { c.copy(a).lerp(b, clamp((g.attributes.position.getX(i) + 5.2) / 10.4)); c.toArray(col, i * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: op < 1, opacity: op, depthWrite: op === 1, blending: op < 1 ? THREE.AdditiveBlending : THREE.NormalBlending }));
}
const tube = colorTube(0.045, 1), tubeGlow = colorTube(0.2, 0.16);
groups[4].add(tube, tubeGlow);
const axisMat = new THREE.LineBasicMaterial({ color: "#3a3366" });
groups[4].add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-5.6, -2.6, 0), new THREE.Vector3(5.8, -2.6, 0)]), axisMat));
groups[4].add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-5.6, -2.6, 0), new THREE.Vector3(-5.6, 3.0, 0)]), axisMat));
const coinTex = canvasTex(512, 512, (g, w) => {
  g.fillStyle = cssGrad(g, w, w, 115, SKINS[0].stops); g.fillRect(0, 0, w, w);
  g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 14; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 34, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#fff"; g.font = "800 270px NunitoX"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("M", w / 2, w / 2 + 14);
});
// Обратная сторона видна перевёрнутой — та же текстура, повёрнутая на 180°.
const coinBack = coinTex.clone(); coinBack.center.set(0.5, 0.5); coinBack.rotation = Math.PI;
const coin = new THREE.Group();
const coinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.14, 72), [
  new THREE.MeshPhysicalMaterial({ color: "#c9b0ff", metalness: 1, roughness: 0.22 }),
  faceMat(coinTex, 0.35), faceMat(coinBack, 0.35),
]);
coinMesh.rotation.set(Math.PI / 2, Math.PI / 2, 0); coin.add(coinMesh); groups[4].add(coin);
const TRAIL = 46, trailPos = new Float32Array(TRAIL * 3), trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ size: 0.22, map: dotTex, color: "#19FB9B", transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
groups[4].add(trail);
const BURST = 220, burstDir = [], burstPos = new Float32Array(BURST * 3), burstGeo = new THREE.BufferGeometry();
{ const R = rnd(5); for (let i = 0; i < BURST; i++) { const th = R() * Math.PI * 2, ph = Math.acos(2 * R() - 1), sp = 1.5 + R() * 3.2; burstDir.push(new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)).multiplyScalar(sp)); } }
burstGeo.setAttribute("position", new THREE.BufferAttribute(burstPos, 3));
const burstMat = new THREE.PointsMaterial({ size: 0.16, map: dotTex, color: "#d9c8ff", transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
const burst = new THREE.Points(burstGeo, burstMat); groups[4].add(burst);

// 6 · финал: веер из всех скинов
const fan = new THREE.Group(); groups[5].add(fan);
const fanCards = SKINS.map((s) => { const c = makeCard(s); fan.add(c); return c; });

// ---------- интерфейс поверх ----------
const $ = (id) => document.getElementById(id);
$("title").innerHTML = [..."Mintly"].map((c) => `<span>${c}</span>`).join("");
const letters = [...$("title").children];
const CHIPS = [null, ["Магазин", "шесть скинов для карты кошелька"], ["Главная", "курс SOL и GRAM вживую"], ["Кошелёк", "свайп — и сид-фраза на обороте"], ["Мемпад", "своя бондинг-кривая, TON и Solana"], null];

function cam(px, py, pz, lx, ly, lz) { camera.position.set(px, py, pz); camera.lookAt(lx, ly, lz); }

window.renderAt = (t) => {
  const si = Math.min(5, S.findIndex((s, i) => t >= s && t < S[i + 1]) < 0 ? 5 : S.findIndex((s, i) => t >= s && t < S[i + 1]));
  const lt = t - S[si];
  groups.forEach((g, i) => (g.visible = i === si));
  dust.rotation.y = t * 0.025; dust.position.y = Math.sin(t * 0.3) * 0.3;

  if (si === 0) {
    const k = eOut(prog(lt, 0, 1.7));
    hero.position.set(lerp(0.4, 1.95, k), lerp(-0.6, 0.05, k) + Math.sin(lt * 1.6) * 0.05, lerp(-22, 0, k));
    hero.rotation.set(lerp(0.9, 0.1, k) + Math.sin(lt) * 0.02, lerp(-Math.PI * 3.3, -0.42, k) + lt * 0.04, lerp(0.5, -0.05, k));
    const push = eIO(prog(lt, 3.1, 4));
    cam(lerp(0, 0.9, push), lerp(0.25, 0.1, push), lerp(8.2, 5.2, push) - lt * 0.15, lerp(0.8, 1.5, push), 0, 0);
  } else if (si === 1) {
    const enter = 1 - eOut(prog(lt, 0, 1.4));
    ring.rotation.y = -2.2 * enter + lt * 0.42;
    ringCards.forEach((c, i) => { const a = (i / 6) * Math.PI * 2, R = 4.3 + enter * 3; c.position.set(Math.sin(a) * R, Math.sin(lt * 1.3 + i) * 0.12, Math.cos(a) * R); c.rotation.set(0, a, Math.sin(lt + i) * 0.05); });
    const out = eIO(prog(lt, 3.4, 4));
    cam(Math.sin(lt * 0.2) * 1.2, lerp(3.4, 1.5, eIO(prog(lt, 0, 4))), lerp(15.5, 13, eIO(prog(lt, 0, 3.4))) - out * 3.5, 0, -0.2, 0);
  } else if (si === 2) {
    widgets.forEach((w, i) => {
      const k = eBack(prog(lt, 0.1 + i * 0.18, 1.1 + i * 0.18));
      const side = i ? 1 : -1;
      w.position.set(side * 2.02, lerp(-6, 0, k) + Math.sin(lt * 1.4 + i) * 0.05, 0.3);
      w.rotation.set(lerp(0.9, 0.04, k), -side * 0.2 + Math.sin(lt * 0.8 + i) * 0.03, 0);
      const { tex, a } = w.userData;
      tex.redraw(eOut(prog(lt, 0.4 + i * 0.18, 1.9 + i * 0.18)), eIO(prog(lt, 0.7 + i * 0.18, 2.6 + i * 0.18)));
    });
    for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) {
      const i = y * GX + x, sd = cellSeed[i];
      const wave = Math.sin(x * 0.35 + y * 0.25 - lt * 2.2) * 0.5 + 0.5;
      const on = Math.max(0, Math.sin(lt * (1.1 + sd * 1.7) + sd * 40)) ** 12 * (sd > 0.55 ? 1 : 0);
      tmpM.makeTranslation((x - GX / 2 + 0.5) * 0.5, (y - GY / 2 + 0.5) * 0.5, wave * 0.35 + on * 0.6);
      cells.setMatrixAt(i, tmpM);
      tmpC.copy(BASE).lerp(sd > 0.8 ? CG : CV, clamp(on * 0.9 + wave * 0.08)); cells.setColorAt(i, tmpC);
    }
    cells.instanceMatrix.needsUpdate = true; cells.instanceColor.needsUpdate = true;
    const k = eIO(prog(lt, 0, 4));
    cam(lerp(-2.2, 1.6, k), lerp(-1.2, 0.6, k), lerp(10.5, 8.6, k), lerp(-0.4, 0.3, k), 0, 0);
  } else if (si === 3) {
    const inK = eOut(prog(lt, 0, 0.8));
    const f = eIO(prog(lt, 1.15, 2.2));
    flip.position.set(lerp(5, 0, inK), Math.sin(lt * 1.5) * 0.05, Math.sin(f * Math.PI) * 0.9);
    flip.rotation.set(0.06 + Math.sin(f * Math.PI) * 0.18, lerp(-0.45, 0, inK) + f * Math.PI + Math.sin(lt * 0.9) * 0.05, Math.sin(f * Math.PI) * -0.08);
    const sw = prog(lt, 0.55, 1.15);
    finger.visible = sw > 0 && sw < 1;
    finger.position.set(lerp(-1.3, 1.4, eIO(sw)), -0.15, 0.4);
    finger.material.opacity = Math.sin(sw * Math.PI);
    const push = eIO(prog(lt, 2.4, 4));
    cam(lerp(-0.6, 0.3, push), lerp(0.35, 0.05, push), lerp(7.4, 5.3, push), 0, 0, 0);
  } else if (si === 4) {
    const draw = eIO(prog(lt, 0, 1.4));
    const idx = tube.geometry.index.count, idx2 = tubeGlow.geometry.index.count;
    tube.geometry.setDrawRange(0, Math.floor((idx * draw) / 6) * 6);
    tubeGlow.geometry.setDrawRange(0, Math.floor((idx2 * draw) / 6) * 6);
    const s = lerp(0.03, 0.985, eIO(prog(lt, 0.7, 3.3)));
    const p = bCurve.getPointAt(s);
    coin.visible = lt > 0.55;
    coin.position.set(p.x, p.y + 0.85, p.z);
    coin.scale.setScalar(eBack(prog(lt, 0.55, 0.95)));
    coin.rotation.set(0, eIO(prog(lt, 0.55, 3.3)) * Math.PI * 6, 0);
    for (let i = 0; i < TRAIL; i++) { const q = bCurve.getPointAt(clamp(s - i * 0.006)); trailPos.set([q.x, q.y + 0.85 + Math.sin(i * 1.7 + lt * 6) * 0.03 * i * 0.2, q.z], i * 3); }
    trailGeo.attributes.position.needsUpdate = true; trail.visible = coin.visible;
    const b = prog(lt, 3.3, 4), end = bCurve.getPointAt(0.985);
    burst.visible = b > 0; burstMat.opacity = 1 - b;
    for (let i = 0; i < BURST; i++) burstPos.set([end.x + burstDir[i].x * eOut(b), end.y + 0.85 + burstDir[i].y * eOut(b), end.z + burstDir[i].z * eOut(b)], i * 3);
    burstGeo.attributes.position.needsUpdate = true;
    cam(lerp(-2.5, p.x * 0.45 + 0.6, eIO(prog(lt, 0, 1.2))), p.y * 0.45 + 0.9, 12.5 - lt * 0.5, p.x * 0.55, p.y * 0.5 + 0.2, 0);
  } else {
    const k = eBack(prog(lt, 0.1, 1.1));
    fanCards.forEach((c, i) => { const o = i - 2.5; c.position.set(o * 0.62 * k, 1.4 + Math.abs(o) * -0.09 * k, i * 0.06); c.rotation.set(0.05, 0, -o * 0.13 * k); });
    fan.rotation.y = lerp(-0.35, 0.25, eIO(prog(lt, 0, 4)));
    fan.position.y = lerp(-3, 0, eOut(prog(lt, 0, 0.9)));
    cam(0, 0.2, lerp(11, 9.8, eIO(prog(lt, 0, 4))), 0, 0.2, 0);
  }

  // интерфейс
  const tIn = (a, b) => eOut(prog(lt, a, b));
  const titleOn = si === 0;
  letters.forEach((el, i) => { const k = titleOn ? tIn(1.05 + i * 0.06, 1.75 + i * 0.06) : 0; el.style.opacity = k; el.style.transform = `translateY(${(1 - k) * 70}px)`; });
  const out0 = si === 0 ? 1 - eIO(prog(lt, 3.2, 3.8)) : 0;
  $("title").style.opacity = out0;
  $("sub").style.opacity = si === 0 ? tIn(1.6, 2.3) * out0 : 0;
  $("sub").style.transform = `translateY(${(1 - (si === 0 ? tIn(1.6, 2.3) : 0)) * 24}px)`;
  const ch = CHIPS[si];
  const chipK = ch ? tIn(0.35, 0.9) * (1 - eIO(prog(lt, 3.5, 3.9))) : 0;
  if (ch) { $("chipTag").textContent = ch[0]; $("chipText").textContent = ch[1]; }
  $("chip").style.opacity = chipK; $("chip").style.transform = `translateX(${(1 - chipK) * -30}px)`;
  const endK = si === 5 ? tIn(0.7, 1.5) : 0;
  $("end").style.opacity = endK; $("end").style.transform = `translateY(${(1 - endK) * 40}px)`;
  const cut = [4, 8, 12, 16, 20].find((c) => t >= c && t < c + 0.3);
  $("flash").style.opacity = cut ? (1 - (t - cut) / 0.3) * 0.5 : 0;
  $("fade").style.opacity = Math.max(prog(t, 23.1, 24), 1 - prog(t, 0, 0.5));

  renderer.render(scene, camera);
};

document.fonts.load("800 40px NunitoX"); document.fonts.load("500 40px Onest"); document.fonts.load("500 40px Onest", "Баланс"); document.fonts.load("800 40px NunitoX", "Секрет");
document.fonts.ready.then(() => {
  // Текстуры рисовались до загрузки шрифтов — перерисовываем.
  [hero, flip, ...ringCards, ...fanCards].forEach((c) => c.children.forEach((m) => m.material.map && m.material.map.redraw && m.material.map.redraw()));
  coinTex.redraw(); coinBack.needsUpdate = true;
  window.renderAt(0);
  window.ready = true;
});
