// Mintly · Лес Браун, вертикальный ролик 9:16, 25 с — по схеме референса:
// короткий диалог двух человечков → огромное слово летит в камеру → одна большая
// гравюра, по которой ходит камера с подписями → одна фраза → экран приложения.
// Героя не показываем лицом: на гравюре он со спины (живой человек, его фото
// защищены, а лицо в рекламе выглядело бы как одобрение).
// Кадр зависит только от t — renderAt(t) можно звать в любом порядке.
"use strict";
const DUR = 25;
const root = document.getElementById("root");
const $ = (h) => { const d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstElementChild; };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const E = {
  out: (k) => 1 - Math.pow(1 - k, 3),
  io: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  inQ: (k) => k * k * k,
  soft: (k) => { const c = 0.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
};
function S(el, { o = 1, x = 0, y = 0, s = 1, b = 0 } = {}) {
  el.style.opacity = o;
  el.style.visibility = o > 0.002 ? "visible" : "hidden";
  el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${s.toFixed(4)})`;
  el.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none";
}
const scenes = [];
function scene(a, b, draw, bg = "transparent") { const el = $(`<div class="scene" style="display:none;background:${bg}"></div>`); root.appendChild(el); scenes.push({ el, a, b, draw }); return el; }
function words(el, t, a, { stag = 0.09, dur = 0.7, rise = 18 } = {}) {
  el.spans.forEach((w, i) => { const k = E.out(prog(t, a + i * stag, a + i * stag + dur)); S(w, { o: k, y: (1 - k) * rise, b: (1 - k) * 6 }); });
}
function splitWords(el) {
  const parts = el.innerHTML.split(" ");
  el.innerHTML = parts.map((p) => `<span class="w">${p}</span>`).join(" ");
  el.spans = [...el.querySelectorAll(".w")];
  return el;
}

// ===================== ДИАЛОГ ЧЕЛОВЕЧКОВ =====================
// друг стоит: лампа, рюкзак, телефон в руке
const EYES = (cx, cy, px, py, wide = false) => `<ellipse cx="${cx - 28}" cy="${cy}" rx="${wide ? 21 : 18}" ry="${wide ? 28 : 24}"/><ellipse cx="${cx + 28}" cy="${cy}" rx="${wide ? 21 : 18}" ry="${wide ? 28 : 24}"/>
  <circle class="pu" cx="${cx - 28 + px}" cy="${cy + py}" r="8"/><circle class="pu" cx="${cx + 28 + px}" cy="${cy + py}" r="8"/>`;
const ROOM = `<path d="M60 1480H1020" style="stroke-opacity:.85"/><path d="M250 1480V1010M200 1480H300"/><path d="M190 930H310L340 1010H160Z"/>`;
const FRIEND_A = `${ROOM}<circle cx="600" cy="860" r="80"/>${EYES(600, 850, -6, 6)}<path d="M582 905q18 12 36 0"/>
  <path d="M600 940V1230M600 1230 540 1480M600 1230 660 1480"/><path d="M600 1010 520 1130 548 1176"/><path d="M600 1010 690 1120"/>
  <rect x="652" y="962" width="82" height="190" rx="28"/><g transform="rotate(-12 545 1160)"><rect x="515" y="1110" width="62" height="102" rx="11" style="fill:rgba(79,134,255,.35)"/></g>`;
const FRIEND_C = `${ROOM}<circle cx="600" cy="860" r="80"/>${EYES(600, 850, -7, 2)}<path d="M584 908h32"/>
  <path d="M600 940V1230M600 1230 540 1480M600 1230 660 1480"/><path d="M600 1010 520 1110"/><path d="M600 1010 690 950 702 884"/>
  <rect x="652" y="962" width="82" height="190" rx="28"/>`;
const COUCH = `<path d="M60 1330H1020" style="stroke-opacity:.85"/><path d="M190 1160V1050q0-50 50-50H840q50 0 50 50V1160"/><rect x="160" y="1160" width="760" height="118" rx="30"/>
  <rect x="120" y="1090" width="96" height="196" rx="42"/><rect x="864" y="1090" width="96" height="196" rx="42"/><path d="M210 1286V1330M870 1286V1330"/>`;
const LAZY_B = `${COUCH}<circle cx="300" cy="1070" r="68"/>${EYES(300, 1060, 6, -9)}
  <path d="M362 1112 560 1140M560 1140 690 1028 800 1140H872"/><path d="M356 1100 420 960"/>
  <g transform="rotate(18 430 935)"><rect x="398" y="882" width="64" height="104" rx="11" style="fill:rgba(79,134,255,.45)"/></g>`;
const LAZY_D = `${COUCH}<circle cx="320" cy="1030" r="68"/>${EYES(320, 1022, 0, 0, true)}<circle cx="320" cy="1072" r="10"/>
  <path d="M372 1080 560 1140M560 1140 690 1028 800 1140H872"/><path d="M372 1092 470 1150"/>
  <g transform="rotate(-8 500 1150)"><rect x="462" y="1124" width="104" height="60" rx="11" style="fill:rgba(79,134,255,.3)"/></g>`;
function figScene(a, b, art, cap, glow = false) {
  const el = scene(a, b, draw, "#000");
  const g = glow ? $(`<div class="abs" style="left:60px;top:640px;width:760px;height:760px;border-radius:50%;background:radial-gradient(closest-side,rgba(60,110,255,.42),rgba(60,110,255,.12) 55%,rgba(60,110,255,0))"></div>`) : null;
  if (g) el.appendChild(g);
  const svg = $(`<svg class="abs fig" style="left:0;top:0" width="1080" height="1920" viewBox="0 0 1080 1920">${art}</svg>`);
  el.appendChild(svg);
  const els = [...svg.querySelectorAll("path,rect,circle,ellipse")].filter((e) => !e.classList.contains("pu"));
  els.forEach((e) => { e.setAttribute("pathLength", "1"); e.style.strokeDasharray = "1 1"; });
  const c = splitWords($(`<div class="cap">${cap}</div>`)); el.appendChild(c);
  function draw(t) {
    // рисунок быстро вычерчивается, камера чуть наезжает, подпись — по словам
    els.forEach((e, i) => { const s0 = a + (i / els.length) * 0.35; e.style.strokeDashoffset = (1 - E.out(prog(t, s0, s0 + 0.3))).toFixed(4); });
    svg.querySelectorAll(".pu").forEach((p) => { p.style.opacity = E.out(prog(t, a + 0.3, a + 0.45)); });
    const z = 1 + 0.045 * prog(t, a, b);
    svg.style.transformOrigin = "540px 1150px"; svg.style.transform = `scale(${z.toFixed(4)})`;
    if (g) g.style.opacity = (0.8 + 0.2 * Math.sin(t * 7)) * E.out(prog(t, a + 0.2, a + 0.5));
    words(c, t, a + 0.15);
  }
}
figScene(0.0, 2.15, FRIEND_A, "«Запустил свою монету?»");
figScene(2.15, 4.3, LAZY_B, "«Я же никто. Как-нибудь потом»", true);
figScene(4.3, 6.3, FRIEND_C, "«Лес Браун тоже был никем»");
figScene(6.3, 8.25, LAZY_D, "«…И чем у него кончилось?»", true);

// ===================== СЛОВО ЛЕТИТ В КАМЕРУ =====================
const ZW = scene(8.25, 9.15, drawZW, "#000");
const zword = $(`<div class="abs" style="left:0;top:0;width:1080px;height:1920px;display:flex;align-items:center;justify-content:center;font:800 270px/1 'Nunito';letter-spacing:-.02em;color:#F3F1EA">НИКТО</div>`);
ZW.appendChild(zword);
function drawZW(t) {
  // сначала слово встаёт на место, потом экспоненциально летит в камеру — экран заливает светлым
  const a = E.out(prog(t, 8.25, 8.45)), z = Math.pow(42, E.inQ(prog(t, 8.5, 9.1)));
  zword.style.opacity = a; zword.style.transformOrigin = "540px 960px";
  zword.style.transform = `scale(${(z * (0.92 + 0.08 * a)).toFixed(4)})`;
}

// ===================== ГРАВЮРА =====================
const INK = "#1C1E24", PAPER = "#F3F1EA", LITE = "#E9E6DD";
// следы: три тропинки от мусорного бака к двери — «каждый день»
function prints() {
  let s = "";
  [[0, 0], [-46, 30], [44, -18]].forEach(([ox, oy], k) => {
    const N = 11;
    for (let i = 0; i < N; i++) {
      const p = i / (N - 1), x = lerp(640 + ox, 270 + ox * 0.4, p), y = lerp(1860 + oy, 1372, Math.pow(p, 0.8)), sc = lerp(1, 0.42, p);
      const side = i % 2 ? 1 : -1, ang = Math.atan2(1372 - 1860, 270 - 640) * 180 / Math.PI + 90;
      s += `<g transform="translate(${(x + side * 16 * sc).toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${sc.toFixed(3)})" opacity="${(0.5 + 0.2 * k / 2).toFixed(2)}">
        <ellipse cx="0" cy="-10" rx="12" ry="20" fill="${INK}"/><ellipse cx="0" cy="22" rx="10" ry="11" fill="${INK}"/></g>`;
    }
  });
  return s;
}
const planks = (() => {
  let s = "";
  for (let i = -6; i <= 15; i++) { const xb = i * 110 - 200, xt = 540 + (xb - 540) * 0.431; s += `<line x1="${xb}" y1="1920" x2="${xt.toFixed(1)}" y2="1340"/>`; }
  [[1395, 0], [1470, 1], [1580, 0], [1730, 1]].forEach(([y, k]) => { for (let x = (k ? 60 : 0); x < 1080; x += 230) s += `<line x1="${x}" y1="${y}" x2="${x + 120}" y2="${y}"/>`; });
  return s;
})();
const ticks = Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<line x1="${(290 + Math.sin(a) * 56).toFixed(1)}" y1="${(230 - Math.cos(a) * 56).toFixed(1)}" x2="${(290 + Math.sin(a) * 66).toFixed(1)}" y2="${(230 - Math.cos(a) * 66).toFixed(1)}"/>`; }).join("");
const record = (x, y) => `<rect x="${x}" y="${y}" width="130" height="130" fill="${PAPER}" stroke-width="5"/><rect x="${x + 8}" y="${y + 8}" width="114" height="114" fill="url(#h1)" stroke="none"/>
  <circle cx="${x + 65}" cy="${y + 65}" r="50" fill="url(#h2)"/><circle cx="${x + 65}" cy="${y + 65}" r="38" stroke-width="2"/><circle cx="${x + 65}" cy="${y + 65}" r="26" stroke-width="2"/><circle cx="${x + 65}" cy="${y + 65}" r="11" fill="${PAPER}"/>`;
const ENGR = `
<defs>
  <pattern id="h1" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" stroke="${INK}" stroke-width="1.3"/></pattern>
  <pattern id="h2" width="5.5" height="5.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5.5" stroke="${INK}" stroke-width="1.5"/></pattern>
  <pattern id="h2b" width="5.5" height="5.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="5.5" stroke="${INK}" stroke-width="1.4"/></pattern>
  <pattern id="hv" width="6" height="6" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="6" stroke="${INK}" stroke-width="1.1"/></pattern>
  <pattern id="wall" width="26" height="40" patternUnits="userSpaceOnUse"><line x1="1" y1="0" x2="1" y2="40" stroke="${INK}" stroke-width="1.2" opacity=".55"/><line x1="13" y1="6" x2="13" y2="14" stroke="${INK}" stroke-width="1.6" opacity=".5"/><line x1="13" y1="26" x2="13" y2="34" stroke="${INK}" stroke-width="1.6" opacity=".5"/></pattern>
  <pattern id="lite" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="${PAPER}"/></pattern>
</defs>
<g fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <rect x="0" y="0" width="1080" height="1340" fill="url(#wall)" stroke="none"/>
  <rect x="0" y="0" width="1080" height="150" fill="url(#h1)" stroke="none" opacity=".7"/>
  <path d="M0 150H1080M0 166H1080"/>
  <rect x="0" y="1286" width="1080" height="54" fill="url(#h2)" stroke="none" opacity=".75"/><path d="M0 1286H1080M0 1340H1080" stroke-width="5"/>
  <g stroke-width="2.2" opacity=".75">${planks}</g>
  <rect x="0" y="1340" width="1080" height="150" fill="url(#h1)" stroke="none" opacity=".55"/>
  <!-- часы -->
  <circle cx="290" cy="230" r="74" fill="${PAPER}" stroke-width="6"/><g stroke-width="3">${ticks}</g><path d="M290 230V182M290 230 322 248" stroke-width="5"/>
  <!-- золотые пластинки в рамках -->
  ${record(690, 186)}${record(860, 186)}
  <!-- дверь радиостанции -->
  <rect x="80" y="500" width="360" height="840" fill="url(#h2)" stroke-width="6"/>
  <rect x="112" y="532" width="296" height="808" fill="${LITE}" stroke-width="4"/><rect x="112" y="532" width="296" height="808" fill="url(#h1)" stroke="none" opacity=".75"/>
  <rect x="150" y="580" width="220" height="300" stroke-width="4"/><path d="M160 590H360M160 590V870" stroke-width="2" opacity=".6"/>
  <rect x="150" y="930" width="220" height="330" stroke-width="4"/><path d="M160 940H360M160 940V1250" stroke-width="2" opacity=".6"/>
  <circle cx="378" cy="962" r="13" fill="${INK}"/>
  <rect x="128" y="392" width="264" height="84" fill="${PAPER}" stroke-width="5"/><circle cx="146" cy="434" r="5" fill="${INK}"/><circle cx="374" cy="434" r="5" fill="${INK}"/>
  <text x="260" y="452" text-anchor="middle" fill="${INK}" stroke="none" style="font:800 48px 'Onest';letter-spacing:8px">РАДИО</text>
  <!-- мусорный бак и метла -->
  <path d="M470 1132H612L598 1338H484Z" fill="url(#h1)"/><path d="M578 1132H612L598 1338H570Z" fill="url(#h2)" stroke="none"/>
  <path d="M500 1138V1332M526 1138V1334M552 1138V1334M578 1138V1334" stroke-width="2.5"/>
  <ellipse cx="541" cy="1126" rx="82" ry="17" fill="${PAPER}" stroke-width="5"/><path d="M524 1112q17-24 34 0" stroke-width="5"/>
  <path d="M662 1338 708 1004" stroke-width="8"/><path d="M630 1340H704L692 1248H654Z" fill="url(#h2)" stroke-width="4"/><path d="M652 1262H696M650 1276H698" stroke-width="3"/>
  <g stroke="none">${prints()}</g>
  <!-- окно студии: тёмная комната, у микрофона человек со спины в наушниках -->
  <rect x="556" y="356" width="468" height="568" fill="url(#h1)" stroke-width="7"/>
  <rect x="584" y="384" width="412" height="512" fill="#2A2C33" stroke-width="5"/><rect x="584" y="384" width="412" height="512" fill="url(#h2b)" stroke="none" opacity=".6"/>
  <rect x="584" y="800" width="412" height="96" fill="#C9C4B8" stroke-width="4"/><rect x="584" y="800" width="412" height="96" fill="url(#h1)" stroke="none"/>
  <path d="M620 900Q628 724 720 704Q812 724 822 900Z" fill="#17181C" stroke="#E9E6DD" stroke-width="3"/>
  <circle cx="720" cy="646" r="52" fill="#17181C" stroke="#E9E6DD" stroke-width="3"/>
  <path d="M666 642a54 54 0 0 1 108 0" stroke="#E9E6DD" stroke-width="8"/><rect x="654" y="630" width="22" height="42" rx="8" fill="#E9E6DD" stroke="none"/><rect x="764" y="630" width="22" height="42" rx="8" fill="#E9E6DD" stroke="none"/>
  <path d="M870 800V706" stroke="#E9E6DD" stroke-width="6"/><path d="M826 650q0 70 44 70q44 0 44-70" stroke="#E9E6DD" stroke-width="5"/>
  <rect x="836" y="584" width="68" height="112" rx="34" fill="#E9E6DD" stroke="${INK}" stroke-width="3"/><path d="M842 612H898M840 634H900M840 656H900M842 678H898" stroke-width="2.5"/>
  <path d="M604 878 760 404M648 892 804 418" stroke="#fff" stroke-width="7" opacity=".16"/>
  <!-- табличка «В ЭФИРЕ» — единственный цветной акцент, загорается синим -->
  <rect id="airBg" x="690" y="270" width="200" height="66" rx="10" fill="${PAPER}" stroke-width="5"/>
  <text id="airTx" x="790" y="315" text-anchor="middle" fill="${INK}" stroke="none" style="font:800 34px 'Onest';letter-spacing:3px">В ЭФИРЕ</text>
  <g id="waves" stroke="#4F86FF" stroke-width="7"></g>
</g>`;
const EN = scene(9.0, 17.6, drawEN, LITE);
const cam = $(`<div class="abs" style="left:0;top:0;width:1080px;height:1920px;transform-origin:0 0"></div>`);
const paperImg = $(`<img class="abs" src="assets/paper.jpg" style="left:-270px;top:-480px;width:1620px;height:2880px"/>`);
const eng = $(`<svg class="abs" style="left:0;top:0;overflow:visible" width="1080" height="1920" viewBox="0 0 1080 1920">${ENGR}</svg>`);
cam.append(paperImg, eng); EN.appendChild(cam);
const airBg = eng.querySelector("#airBg"), airTx = eng.querySelector("#airTx"), wavesG = eng.querySelector("#waves");
const waves = Array.from({ length: 6 }, () => { const c = document.createElementNS("http://www.w3.org/2000/svg", "circle"); c.setAttribute("cx", "790"); c.setAttribute("cy", "640"); wavesG.appendChild(c); return c; });
const lblWrap = $(`<div class="abs" style="left:0;right:0;top:64px;text-align:center"></div>`); EN.appendChild(lblWrap);
const SHOTS = [
  // время начала, центр кадра (x, y), масштаб, подпись
  [9.0, 540, 960, 1.0, "Лес Браун"],
  [10.75, 560, 1240, 2.05, "Мусорщик из Майами"],
  [12.45, 300, 1120, 1.42, "Каждый день просился на радио"],
  [14.15, 790, 610, 2.0, "Однажды взял микрофон"],
  [15.85, 540, 900, 0.9, "Теперь его слушают миллионы"],
];
const lbls = SHOTS.map((s) => { const l = $(`<div class="lbl" style="position:absolute;left:50%;top:0;transform:translateX(-50%)">${s[4]}</div>`); lblWrap.appendChild(l); return l; });
function drawEN(t) {
  // камера: плавные переезды между кадрами
  let cx = SHOTS[0][1], cy = SHOTS[0][2], s = SHOTS[0][3];
  for (let i = 1; i < SHOTS.length; i++) { const k = E.io(prog(t, SHOTS[i][0] - 0.25, SHOTS[i][0] + 0.55)); cx = lerp(cx, SHOTS[i][1], k); cy = lerp(cy, SHOTS[i][2], k); s = lerp(s, SHOTS[i][3], k); }
  s *= 1 + 0.03 * Math.sin((t - 9) * 0.6);
  cam.style.transform = `translate(${(540 - cx * s).toFixed(2)}px,${(960 - cy * s).toFixed(2)}px) scale(${s.toFixed(4)})`;
  lbls.forEach((l, i) => {
    const a = SHOTS[i][0] + 0.35, b = i + 1 < SHOTS.length ? SHOTS[i + 1][0] - 0.1 : 17.3;
    const k = E.out(prog(t, a, a + 0.45)), q = E.io(prog(t, b - 0.35, b));
    l.style.opacity = k * (1 - q); l.style.clipPath = `inset(-20px ${((1 - k) * 100).toFixed(1)}% -20px 0)`;
  });
  // «В ЭФИРЕ» вспыхивает, когда он берёт микрофон, и горит до конца
  const on = E.out(prog(t, 14.9, 15.2));
  airBg.setAttribute("fill", on > 0.5 ? "#2F6BFF" : PAPER); airTx.setAttribute("fill", on > 0.5 ? "#FFFFFF" : INK);
  airBg.style.filter = on > 0.5 ? `drop-shadow(0 0 ${(18 + 8 * Math.sin(t * 8)).toFixed(1)}px rgba(79,134,255,.95))` : "none";
  // волны эфира расходятся по стене и дальше — «слушают миллионы»
  waves.forEach((c, i) => {
    const ph = ((t - 15.2) * 0.75 - i / waves.length);
    const k = ph - Math.floor(ph), live = t > 15.2 + (i / waves.length) / 0.75;
    c.setAttribute("r", (70 + k * 1100).toFixed(1)); c.setAttribute("opacity", live ? ((1 - k) * 0.85).toFixed(3) : 0);
  });
}

// ===================== ОДНА ФРАЗА =====================
const PH = scene(17.55, 20.2, drawPH, "#000");
const p1 = splitWords($(`<div class="abs" style="left:0;right:0;top:820px;text-align:center;font:800 86px/1.1 'Onest';letter-spacing:-.02em">Не нужно быть великим,</div>`));
const p2 = splitWords($(`<div class="abs accent" style="left:0;right:0;top:930px;text-align:center;font:800 86px/1.1 'Onest';letter-spacing:-.02em">чтобы начать</div>`));
PH.append(p1, p2);
function drawPH(t) { words(p1, t, 17.75, { stag: 0.12 }); words(p2, t, 18.55, { stag: 0.16, dur: 0.6 }); }

// ===================== ПРИЛОЖЕНИЕ =====================
const AP = scene(20.2, 25, drawAP, "#000");
const M_PATH = "M300 218 L627 660 L955 218 L1080 988 L886 988 L836 610 L627 910 L418 610 L369 988 L173 988 Z";
const icon = $(`<div class="abs" style="left:430px;top:690px;width:220px;height:220px;border-radius:54px;background:linear-gradient(160deg,#1A1C22,#0B0C10);box-shadow:0 0 0 1.5px rgba(255,255,255,.12),0 24px 60px rgba(47,107,255,.25);display:flex;align-items:center;justify-content:center">
  <svg width="128" height="109" viewBox="173 218 907 770"><defs><linearGradient id="mi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#B9C2D2"/></linearGradient></defs><path d="${M_PATH}" fill="url(#mi)"/></svg></div>`);
const brk = $(`<svg class="abs" style="left:0;top:0;overflow:visible" width="1080" height="1920" viewBox="0 0 1080 1920" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"><path id="bk" d=""/></svg>`);
const at1 = $(`<div class="abs" style="left:0;right:0;top:996px;text-align:center;font:400 58px/1 'Onest';color:#fff;letter-spacing:-.01em">Приложение в Telegram</div>`);
const at2 = $(`<div class="abs" style="left:0;right:0;top:1086px;text-align:center;font:700 52px/1 'Onest';color:#4F86FF">@MintlyAppbot</div>`);
AP.append(icon, brk, at1, at2);
function drawAP(t) {
  // уголки рамки сжимаются к иконке и «защёлкиваются», иконка выплывает изнутри
  const k = E.soft(prog(t, 20.35, 20.95)), h = lerp(260, 170, k), L = 62, cx = 540, cy = 800;
  const c = (sx, sy) => `M${cx + sx * h} ${cy + sy * (h - L)}V${cy + sy * h}H${cx + sx * (h - L)}`;
  brk.querySelector("#bk").setAttribute("d", [c(-1, -1), c(1, -1), c(-1, 1), c(1, 1)].join(""));
  brk.style.opacity = E.out(prog(t, 20.25, 20.5));
  const ik = E.out(prog(t, 20.6, 21.1)); S(icon, { o: ik, s: 0.82 + 0.18 * ik });
  const a1 = E.out(prog(t, 21.1, 21.6)); S(at1, { o: a1, y: (1 - a1) * 16, b: (1 - a1) * 6 });
  const a2 = E.out(prog(t, 21.8, 22.3)); S(at2, { o: a2, y: (1 - a2) * 16, b: (1 - a2) * 6 });
}

window.renderAt = (t) => {
  for (const sc of scenes) { const on = t >= sc.a - 0.001 && t < sc.b; sc.el.style.display = on ? "block" : "none"; if (on) sc.draw(t); }
  // светлая вспышка: слово заливает экран → проступает гравюра
  document.getElementById("flash").style.opacity = Math.max(0, E.io(prog(t, 8.85, 9.05)) - E.io(prog(t, 9.1, 9.6)));
  document.getElementById("fade").style.opacity = Math.max(1 - E.out(prog(t, 0, 0.3)), E.io(prog(t, 24.3, 25)), Math.sin(Math.PI * prog(t, 17.35, 17.75)));
};
Promise.all([document.fonts.ready, ...[...document.images].map((im) => im.decode().catch(() => {}))]).then(() => { window.renderAt(0); window.ready = true; });
