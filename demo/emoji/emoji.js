// 3D-эмодзи Mintly для Telegram (премиум-чаты). Единый набор: премиальный
// 3D-UI, насыщенный синий, глянцевый металл, объёмные скруглённые грани,
// мягкое свечение и честные отражения окружения. Без зелёного/красного/жёлтого.
// window.renderEmoji(name,t) ставит кадр анимации (t — нормализованная фаза 0..1
// одного цикла); тем же кодом снимаем референс и крутим финал.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

const SIZE = 512;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 0, 9);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
document.getElementById("stage").appendChild(renderer.domElement);

// окружение: студийные отражения + направленный свет (ключ тёплый-нейтральный,
// контровой — холодный синий, чтобы грани металла красиво вспыхивали)
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(4, 7, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0x9ec6ff, 2.0); rim.position.set(-6, 3, -3); scene.add(rim);
const fill = new THREE.DirectionalLight(0xbcd4ff, 0.8); fill.position.set(0, -4, 4); scene.add(fill);
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

// ——— материалы (единая палитра: насыщенный синий металл + белый) ———
const mPhys = (o) => new THREE.MeshPhysicalMaterial({ clearcoat: 1, clearcoatRoughness: 0.06, ...o });
const BLUE = mPhys({ color: 0x2f6bff, metalness: 0.6, roughness: 0.14, envMapIntensity: 1.9, emissive: 0x0b2f8a, emissiveIntensity: 0.22 });
const BLUE_DK = mPhys({ color: 0x1746c4, metalness: 0.8, roughness: 0.2, envMapIntensity: 1.6 });
const WHITE = mPhys({ color: 0xffffff, metalness: 0.15, roughness: 0.13, envMapIntensity: 1.5, emissive: 0xcfe0ff, emissiveIntensity: 0.18 });

// мягкое свечение — аддитивный радиальный спрайт позади объекта
const glowTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d"); const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(90,150,255,0.9)"); g.addColorStop(0.35, "rgba(60,120,255,0.45)");
  g.addColorStop(1, "rgba(40,90,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();
function glow(size, opacity = 0.55) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity, transparent: true }));
  s.scale.setScalar(size); s.position.z = -0.6; return s;
}

// буква M (логотип Mintly) — экструд с фаской
const M_SHAPE = (() => {
  const p = [[300,218],[627,660],[955,218],[1080,988],[886,988],[836,610],[627,910],[418,610],[369,988],[173,988]];
  const s = new THREE.Shape();
  const sc = 1 / 1080, cx = 626 * sc, cy = 603 * sc;
  p.forEach(([x, y], i) => { const X = x * sc - cx, Y = -(y * sc - cy); i ? s.lineTo(X, Y) : s.moveTo(X, Y); });
  s.closePath(); return s;
})();
function mLetter(mat, depth, scale) {
  const g = new THREE.ExtrudeGeometry(M_SHAPE, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 });
  const m = new THREE.Mesh(g, mat); m.scale.setScalar(scale); return m;
}

// стрелка-тренд: экструд формы с крупной фаской для объёма
function arrowShape() {
  const s = new THREE.Shape();
  const pts = [[-0.28,-1.2],[0.28,-1.2],[0.28,0.22],[0.66,0.22],[0,1.3],[-0.66,0.22],[-0.28,0.22]];
  pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y));
  s.closePath(); return s;
}
function arrowMesh() {
  const geo = new THREE.ExtrudeGeometry(arrowShape(), { depth: 0.6, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.16, bevelSegments: 5, curveSegments: 10 });
  geo.center();
  return new THREE.Mesh(geo, [BLUE, BLUE_DK]); // лицо яркое, грани темнее
}

let FONT = null;
// ——— модели ———
const builders = {
  // МОНЕТА M: скруглённый по краю синий диск (лате), белая рельефная M, свечение
  coin() {
    const g = new THREE.Group();
    g.add(glow(5.2, 0.5));
    const inner = new THREE.Group();
    const R = 1.68, h = 0.22, er = 0.14;
    const prof = [[0, h], [R - er, h]];
    for (let i = 1; i <= 6; i++) { const a = (Math.PI / 2) * (i / 6); prof.push([R - er + Math.sin(a) * er, h - er + Math.cos(a) * er]); }
    prof.push([R, -h + er]);
    for (let i = 1; i <= 6; i++) { const a = (Math.PI / 2) * (i / 6); prof.push([R - er + Math.cos(a) * er, -h + er - Math.sin(a) * er]); }
    prof.push([R - er, -h], [0, -h]);
    const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 80), BLUE);
    inner.add(body);
    // двойной тёмно-синий ободок для «монетности»
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.055, 24, 80), BLUE_DK);
    ring.position.y = h - 0.02; ring.rotation.x = Math.PI / 2; inner.add(ring);
    const ring2 = ring.clone(); ring2.position.y = -(h - 0.02); inner.add(ring2);
    const mF = mLetter(WHITE, 0.16, 1.5); mF.rotation.x = -Math.PI / 2; mF.position.y = h + 0.0; inner.add(mF);
    const mB = mLetter(WHITE, 0.16, 1.5); mB.rotation.x = Math.PI / 2; mB.position.y = -(h); inner.add(mB);
    inner.rotation.x = Math.PI / 2; // грани монеты смотрят в камеру
    g.add(inner); g.name = "coin"; return g;
  },
  // РОСТ: синяя объёмная стрелка, остриё в правый-верх
  up() {
    const g = new THREE.Group(); g.add(glow(4.4, 0.5));
    const a = arrowMesh(); a.rotation.z = -Math.PI / 4; g.add(a);
    g.name = "up"; return g;
  },
  // ПАДЕНИЕ: та же синяя стрелка, остриё в правый-низ (единый стиль)
  down() {
    const g = new THREE.Group(); g.add(glow(4.4, 0.5));
    const a = arrowMesh(); a.rotation.z = -Math.PI * 0.75; g.add(a);
    g.name = "down"; return g;
  },
  // +100 / +1: объёмные синие цифры
  plus100() { return textEmoji("+100", 1.0, 4.8); },
  plus1() { return textEmoji("+1", 1.7, 3.8); },
};

function textEmoji(str, scale, glowSize) {
  const g = new THREE.Group(); g.add(glow(glowSize, 0.5));
  if (FONT) {
    const geo = new TextGeometry(str, { font: FONT, size: 1, height: 0.5, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.07, bevelSegments: 4 });
    geo.center();
    const m = new THREE.Mesh(geo, [BLUE, BLUE_DK]);
    m.scale.setScalar(scale); g.add(m);
  }
  g.name = str; return g;
}

// easeOutBack для «поп-ина» с лёгким перелётом
const back = (p, s = 1.7) => { p = Math.min(1, Math.max(0, p)); const c = p - 1; return 1 + (c * c * ((s + 1) * c + s)); };
const easeInOut = (p) => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

let current = null, currentName = null;
function show(name) { if (current) scene.remove(current); current = builders[name](); currentName = name; scene.add(current); }

window.renderEmoji = (name, t = 0) => {
  if (name !== currentName || (current && !current.children.some((c) => c.isMesh))) show(name);
  const g = current;
  g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(1);
  const tau = t * Math.PI * 2;
  if (name === "coin") {                       // плавный оборот + лёгкий подскок
    g.rotation.y = tau;
    g.position.y = Math.sin(tau) * 0.14;
  } else if (name === "up") {                   // поднимается вверх + слегка растёт
    g.position.y = Math.sin(tau) * 0.22 + 0.04;
    g.scale.setScalar(1 + Math.sin(tau) * 0.07);
    g.rotation.y = Math.sin(tau) * 0.22;
  } else if (name === "down") {                 // движение вниз с лёгким bounce
    g.position.y = -Math.abs(Math.sin(tau)) * 0.26;
    g.scale.setScalar(1 + Math.abs(Math.sin(tau)) * 0.04);
    g.rotation.y = Math.sin(tau) * 0.22;
  } else if (name === "plus100" || name === "+100") {  // поп-ин с перелётом, затем держим
    const s = t < 0.34 ? 0.2 + back(t / 0.34) * 0.8 : 1;
    g.scale.setScalar(s);
    g.position.y = t < 0.34 ? 0 : Math.sin((t - 0.34) * Math.PI * 2) * 0.05;
    g.rotation.y = Math.sin(tau) * 0.18;
  } else if (name === "plus1" || name === "+1") {      // тот же поп-ин, легче и быстрее
    const s = t < 0.24 ? 0.25 + back(t / 0.24, 2.0) * 0.75 : 1;
    g.scale.setScalar(s);
    g.rotation.y = Math.sin(tau) * 0.22;
  }
  renderer.render(scene, camera);
};

const NAMES = Object.keys(builders);
window.__names = NAMES;
let auto = true;
(function loop(ts) { if (auto && FONT) { const t = (ts % 2500) / 2500, i = Math.floor(ts / 2500) % NAMES.length; window.renderEmoji(NAMES[i], t); } requestAnimationFrame(loop); })(0);
window.stopAuto = () => { auto = false; };

new FontLoader().load("../showreel/node_modules/three/examples/fonts/helvetiker_bold.typeface.json", (f) => { FONT = f; window.ready = true; });
