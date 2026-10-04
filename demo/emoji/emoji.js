// 3D-эмодзи Mintly для кастомного набора Telegram (премиум-чаты).
// Набор вдохновлён паком Blum, но полностью в бренде Mintly: глянцевый объём,
// фирменный синий, буква M вместо биткойн-B. Сцена одна, свет общий,
// window.renderEmoji(name,t) ставит кадр анимации (t в секундах) — тем же
// кодом снимаем референс и крутим финал.
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
renderer.toneMappingExposure = 1.15;
document.getElementById("stage").appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 6, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0x9ec3ff, 1.3); rim.position.set(-5, 2, -4); scene.add(rim);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// ——— материалы (фирменная палитра Mintly: синий / белый / чёрный) ———
const mPhys = (o) => new THREE.MeshPhysicalMaterial({ clearcoat: 1, clearcoatRoughness: 0.12, ...o });
const BLUE = mPhys({ color: 0x2e7bff, metalness: 0.45, roughness: 0.17, envMapIntensity: 1.4 });     // фирменный синий
const BLUE_DK = mPhys({ color: 0x1856d6, metalness: 0.6, roughness: 0.25 });                          // грани/ободок
const WHITE = mPhys({ color: 0xffffff, metalness: 0.1, roughness: 0.22 });
const RED = mPhys({ color: 0xff4d57, metalness: 0.4, roughness: 0.2, envMapIntensity: 1.4 });         // падение
const RED_DK = mPhys({ color: 0xd62f3c, metalness: 0.6, roughness: 0.28 });

// буква M (логотип Mintly) — плоский экструд
const M_SHAPE = (() => {
  const p = [[300,218],[627,660],[955,218],[1080,988],[886,988],[836,610],[627,910],[418,610],[369,988],[173,988]];
  const s = new THREE.Shape();
  const sc = 1 / 1080, cx = 626 * sc, cy = 603 * sc;
  p.forEach(([x, y], i) => { const X = x * sc - cx, Y = -(y * sc - cy); i ? s.lineTo(X, Y) : s.moveTo(X, Y); });
  s.closePath();
  return s;
})();
function mLetter(mat, depth, scale) {
  const g = new THREE.ExtrudeGeometry(M_SHAPE, { depth, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
  const m = new THREE.Mesh(g, mat); m.scale.setScalar(scale); return m;
}

// стрелка-тренд: экструд формы, остриё вверх; группу потом поворачиваем
function arrowShape() {
  const s = new THREE.Shape();
  const pts = [[-0.26,-1.25],[0.26,-1.25],[0.26,0.25],[0.62,0.25],[0,1.3],[-0.62,0.25],[-0.26,0.25]];
  pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y));
  s.closePath();
  return s;
}
function arrow(matFace, matSide) {
  const geo = new THREE.ExtrudeGeometry(arrowShape(), { depth: 0.5, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 4, curveSegments: 8 });
  geo.center();
  // грани — тёмный вариант, лицо — яркий; через групповые материалы экструда
  return new THREE.Mesh(geo, [matFace, matSide]);
}

let FONT = null;
// ——— модели ———
const builders = {
  // МОНЕТА MINT: синий диск с белой рельефной M, тёмно-синий ободок
  coin() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.34, 64), BLUE);
    body.rotation.x = Math.PI / 2; g.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 24, 64), BLUE_DK);
    ring.position.z = 0.175; g.add(ring);
    const ring2 = ring.clone(); ring2.position.z = -0.175; g.add(ring2);
    const mF = mLetter(WHITE, 0.12, 1.9); mF.position.z = 0.17; g.add(mF);
    const mB = mLetter(WHITE, 0.12, 1.9); mB.rotation.y = Math.PI; mB.position.z = -0.17; g.add(mB);
    g.name = "coin"; return g;
  },
  // СТРЕЛКА РОСТА: синяя, остриё в правый-верх (тренд вверх)
  up() {
    const g = new THREE.Group();
    const a = arrow(BLUE, BLUE_DK); a.rotation.z = -Math.PI / 4; g.add(a);
    g.name = "up"; return g;
  },
  // СТРЕЛКА ПАДЕНИЯ: красная, остриё в правый-низ (тренд вниз)
  down() {
    const g = new THREE.Group();
    const a = arrow(RED, RED_DK); a.rotation.z = -Math.PI * 0.75; g.add(a);
    g.name = "down"; return g;
  },
  // +100: объёмный синий текст профита
  plus100() { return textEmoji("+100", 1.0); },
  // +1: объёмный синий текст
  plus1() { return textEmoji("+1", 1.7); },
};

function textEmoji(str, scale) {
  const g = new THREE.Group();
  if (FONT) {
    const geo = new TextGeometry(str, { font: FONT, size: 1, height: 0.42, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 });
    geo.computeBoundingBox(); geo.center();
    const m = new THREE.Mesh(geo, [BLUE, BLUE_DK]);
    m.scale.setScalar(scale); g.add(m);
  }
  g.name = str; return g;
}

let current = null, currentName = null;
function show(name) {
  if (current) scene.remove(current);
  current = builders[name](); currentName = name; scene.add(current);
}

window.renderEmoji = (name, t = 0) => {
  if (name !== currentName || (current && current.children.length === 0)) show(name);
  const g = current;
  g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(1);
  const bob = Math.sin(t * Math.PI * 2) * 0.1;
  g.position.y = bob;
  if (name === "coin") g.rotation.y = t * Math.PI * 2;                 // оборот монеты
  else if (name === "up") { g.position.y = bob + 0.05; g.rotation.y = Math.sin(t * Math.PI * 2) * 0.25; const s = 1 + Math.sin(t * Math.PI * 2) * 0.04; g.scale.setScalar(s); }
  else if (name === "down") { g.position.y = -Math.abs(bob) * 1.2; g.rotation.y = Math.sin(t * Math.PI * 2) * 0.25; }
  else if (name === "plus100" || name === "+100") { g.rotation.y = Math.sin(t * Math.PI * 2) * 0.3; const s = 1 + Math.sin(t * Math.PI * 2) * 0.05; g.scale.setScalar(s); }
  else if (name === "plus1" || name === "+1") { g.rotation.y = Math.sin(t * Math.PI * 2) * 0.35; }
  renderer.render(scene, camera);
};

const NAMES = Object.keys(builders);
window.__names = NAMES;
let auto = true;
(function loop(ts) { if (auto && FONT) { const t = (ts % 2500) / 2500, i = Math.floor(ts / 2500) % NAMES.length; window.renderEmoji(NAMES[i], t); } requestAnimationFrame(loop); })(0);
window.stopAuto = () => { auto = false; };

// загрузка шрифта для +100/+1, только потом ready
new FontLoader().load("../showreel/node_modules/three/examples/fonts/helvetiker_bold.typeface.json", (f) => { FONT = f; window.ready = true; });
