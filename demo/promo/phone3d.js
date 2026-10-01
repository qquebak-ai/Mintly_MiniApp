// Настоящий 3D-айфон для промо: корпус из титана со скруглёнными гранями,
// стеклом и кнопками рисует Three.js, а экран — живой HTML поверх, натянутый
// на проекцию стекла через matrix3d. Так экран остаётся чётким и может
// анимироваться покадрово, а корпус честно отражает свет при повороте.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const VW = 1920, VH = 1080;
// размеры в миллиметрах, экран — 393×852 точки, как у iPhone 15 Pro
const SW = 66, SH = SW * 852 / 393, BEZ = 1.45;
const W = SW + BEZ * 2, H = SH + BEZ * 2, D = 8.25, R = 9.24 + BEZ;
// камера длиннофокусная: меньше искажений, как в продуктовой съёмке
const FOV = 20, DIST = 556;
const MM_PER_PX = (2 * DIST * Math.tan((FOV / 2) * Math.PI / 180)) / VH;

function rrect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// гомография прямоугольника w×h в четырёхугольник — для CSS matrix3d
function homography(w, h, q) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]], A = [], bv = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = q[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); bv.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); bv.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [bv[c], bv[p]] = [bv[p], bv[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; bv[r] -= f * bv[c]; }
  }
  const m = bv.map((v, i) => v / A[i][i]);
  return `matrix3d(${m[0]},${m[3]},0,${m[6]},${m[1]},${m[4]},0,${m[7]},0,0,1,0,${m[2]},${m[5]},0,1)`;
}

class Phone {
  constructor(parent, screenEl, { color = "#3B4658" } = {}) {
    this.box = document.createElement("div");
    this.box.style.cssText = "position:absolute;left:0;top:0;width:1920px;height:1080px;pointer-events:none";
    this.shadow = document.createElement("div");
    this.shadow.style.cssText = "position:absolute;left:0;top:0;width:393px;height:852px;border-radius:70px;transform-origin:0 0;background:rgba(12,52,130,.30);filter:blur(34px)";
    const r = (this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(window.devicePixelRatio); r.setSize(VW, VH); r.setClearColor(0, 0);
    r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.05;
    r.domElement.style.cssText = "position:absolute;left:0;top:0;width:1920px;height:1080px";
    this.scr = screenEl;
    screenEl.style.position = "absolute"; screenEl.style.left = "0"; screenEl.style.top = "0"; screenEl.style.transformOrigin = "0 0";
    this.box.append(this.shadow, r.domElement, screenEl);
    parent.appendChild(this.box);

    const sc = (this.sc = new THREE.Scene());
    sc.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.03).texture;
    sc.environmentIntensity = 0.9;
    const key = new THREE.DirectionalLight("#ffffff", 2.2); key.position.set(-300, 500, 600); sc.add(key);
    const rim = new THREE.DirectionalLight("#d8ecff", 1.8); rim.position.set(500, 120, -200); sc.add(rim);
    sc.add(new THREE.AmbientLight("#ffffff", 0.25));
    this.cam = new THREE.PerspectiveCamera(FOV, VW / VH, 10, 3000); this.cam.position.set(0, 0, DIST); this.cam.lookAt(0, 0, 0);

    const g = (this.g = new THREE.Group()); sc.add(g);
    // титановая рамка: шлифованный металл, скругление по ребру
    const ti = new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.25 });
    const bev = 1.25;
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(rrect(W - bev * 2, H - bev * 2, R - bev), { depth: D - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 10, curveSegments: 40 }), ti);
    frame.position.z = -D / 2 + bev; g.add(frame);
    // антенные вставки — тонкие полоски на рёбрах, по ним глаз узнаёт айфон
    const band = new THREE.MeshStandardMaterial({ color: "#20252d", roughness: 0.6 });
    for (const [x, y, w, h] of [[-W / 2 + 0.2, H / 2 - 14, 0.6, 1.2], [W / 2 - 0.2, H / 2 - 14, 0.6, 1.2], [-W / 2 + 0.2, -H / 2 + 14, 0.6, 1.2], [W / 2 - 0.2, -H / 2 + 14, 0.6, 1.2], [W / 2 - 16, -H / 2 + 0.2, 1.2, 0.6]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, D * 0.62), band); m.position.set(x, y, 0); g.add(m);
    }
    // кнопки: действие и громкость слева, питание справа
    const btn = (x, y, len) => { const m = new THREE.Mesh(new RoundedBoxGeometry(1.2, len, 2.2, 4, 0.5), ti); m.position.set(x, y, 0); g.add(m); };
    // кнопки выступают из рамки примерно на полмиллиметра, как у настоящего айфона
    btn(-W / 2 - 0.0, H / 2 - 30, 7.5); btn(-W / 2 - 0.0, H / 2 - 44, 11.5); btn(-W / 2 - 0.0, H / 2 - 58, 11.5); btn(W / 2 + 0.0, H / 2 - 50, 17);
    // фронтальное стекло: чёрное, с лаком — даёт блик по краю рамки
    const glassMat = new THREE.MeshPhysicalMaterial({ color: "#030305", metalness: 0, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03 });
    const glass = new THREE.Mesh(new THREE.ExtrudeGeometry(rrect(W - 1.1, H - 1.1, R - 0.55), { depth: 0.25, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.3, bevelSegments: 4, curveSegments: 40 }), glassMat);
    glass.position.z = D / 2 - 0.3; g.add(glass);
    this.zFront = D / 2 + 0.2;
    // задняя матовая крышка в цвет рамки
    const back = new THREE.Mesh(new THREE.ShapeGeometry(rrect(W - 1.5, H - 1.5, R - 0.75), 40), new THREE.MeshPhysicalMaterial({ color, metalness: 0.2, roughness: 0.55 }));
    back.position.z = -D / 2 - 0.05; back.rotation.y = Math.PI; g.add(back);
    this.v = new THREE.Vector3();
  }
  project(x, y, z) {
    this.v.set(x, y, z).applyMatrix4(this.g.matrixWorld).project(this.cam);
    return [(this.v.x + 1) / 2 * VW, (1 - this.v.y) / 2 * VH];
  }
  // x, y — центр телефона в пикселях кадра; s — масштаб; углы в градусах,
  // rx > 0 — верх телефона заваливается назад
  pose({ x = 960, y = 540, s = 1, rx = 0, ry = 0, rz = 0, o = 1 } = {}) {
    this.box.style.opacity = o;
    this.box.style.visibility = o > 0.001 ? "visible" : "hidden";
    if (o <= 0.001) return;
    const g = this.g, k = Math.PI / 180;
    g.position.set((x - VW / 2) * MM_PER_PX, -(y - VH / 2) * MM_PER_PX, 0);
    g.rotation.set(-rx * k, ry * k, rz * k, "YXZ"); g.scale.setScalar(s);
    g.updateMatrixWorld(true);
    this.r.render(this.sc, this.cam);
    const z = this.zFront, q = [this.project(-SW / 2, SH / 2, z), this.project(SW / 2, SH / 2, z), this.project(SW / 2, -SH / 2, z), this.project(-SW / 2, -SH / 2, z)];
    this.scr.style.transform = homography(393, 852, q);
    // тень мягко отстаёт вниз и чуть в сторону от света
    this.shadow.style.transform = `translate(${30 * s}px,${70 * s}px) ` + homography(393, 852, q);
    // блик на стекле ползёт вслед за поворотом
    const sh = this.scr.querySelector(".sheen");
    if (sh) sh.style.backgroundPosition = `${50 + ry * 2.4}% 0`;
  }
}
window.Phone3D = Phone;
