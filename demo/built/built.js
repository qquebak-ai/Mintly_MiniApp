// Mintly · «Сделано в Mintly» — 16:9, покадрово: знак со словом на шёлковом
// свечении → слово в плашку → панель разделов → курсор жмёт «Запуск» →
// форма создания токена → пять слайдов с преимуществами → вставка по
// второму референсу (платформа, цифра, дуги, стопка плашек, синий экран) →
// знак и «Сделано в Mintly.», буквы уезжают по дуге.
// Кадр зависит только от t — renderAt(t) можно звать в любом порядке.
"use strict";
const W = 1920, H = 1080;
const root = document.getElementById("root");
const $ = (h) => { const d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstElementChild; };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const E = {
  out: (k) => 1 - Math.pow(1 - k, 3),
  out5: (k) => 1 - Math.pow(1 - k, 5),
  io: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  inQ: (k) => k * k * k,
  back: (k) => { const c = 0.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
};
// значение по ключам [t, ...числа] с мягким переходом между ними — так
// ни один параметр сцены не прыгает на стыке
const smooth = (k) => k * k * (3 - 2 * k);
function keys(t, K) {
  if (t <= K[0][0]) return K[0].slice(1);
  for (let i = 1; i < K.length; i++) {
    if (t <= K[i][0]) { const a = K[i - 1], b = K[i], k = smooth((t - a[0]) / (b[0] - a[0])); return a.slice(1).map((v, j) => lerp(v, b[j + 1], k)); }
  }
  return K[K.length - 1].slice(1);
}
const show = (el, on) => { el.style.display = on ? "" : "none"; };
function S(el, { o = 1, x = 0, y = 0, s = 1, r = 0, b = 0 } = {}) {
  el.style.opacity = o;
  el.style.visibility = o > 0.002 ? "visible" : "hidden";
  el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${r.toFixed(2)}deg) scale(${s.toFixed(4)})`;
  el.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none";
}

const ЗВЕЗДА = window.__STAR;
const VB = "25 25 150 150";
const star = (size, fill = "#E4E2DC", extra = "") => `<svg width="${size}" height="${size}" viewBox="${VB}" style="display:block;overflow:visible${extra}"><path d="${ЗВЕЗДА}" fill="${fill}"/></svg>`;
const ИКОНКИ = {
  home: '<path d="M4 10.4 12 4l8 6.4V19a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 19z"/>',
  swap: '<path d="M4 8.6h13.2"/><path d="M14.4 5.4 17.8 8.6l-3.4 3.2"/><path d="M20 15.4H6.8"/><path d="M9.6 12.2 6.2 15.4l3.4 3.2"/>',
  rocket: '<g transform="rotate(-45 12 12)"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></g>',
  bag: '<path d="M3.8 7.8h16.4v11a1.8 1.8 0 0 1-1.8 1.8H5.6a1.8 1.8 0 0 1-1.8-1.8z"/><path d="M8.4 7.8V6.2A3.6 3.6 0 0 1 12 2.6a3.6 3.6 0 0 1 3.6 3.6v1.6"/>',
  bars: '<path d="M4.8 13.2v6"/><path d="M9.6 8.4v10.8"/><path d="M14.4 5.2v14"/><path d="M19.2 10.6v8.6"/>',
};
const ico = (k, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24">${ИКОНКИ[k]}</svg>`;
const СИНИЙ = "#A7A7A7";

// ===================== ФОН ПЕРВОГО ПРОМО =====================
// чёрный, по нему медленно плывут и дышат синие пятна, снизу голубой туман
const BG = $(`<div class="scene" style="background:#000"></div>`); root.appendChild(BG);
const bgGrad = $(`<div class="abs" style="inset:-20%;background:linear-gradient(120deg,#000 0%,#222222 18%,#000 34%,#3E3E3E 52%,#000 68%,#2D2D2D 84%,#000 100%);background-size:300% 300%"></div>`); BG.appendChild(bgGrad);
const bgBlobs = [[300, 230, 420, "#575757"], [1650, 220, 380, "#474747"], [960, 1100, 540, "#666666"], [1520, 900, 360, "#3F3F3F"], [380, 930, 380, "#4E4E4E"], [960, 380, 300, "#353535"]]
  .map(([x, y, r, c]) => { const b = $(`<div class="blob" style="left:${x - r}px;top:${y - r}px;width:${r * 2}px;height:${r * 2}px;background:${c};opacity:.55"></div>`); BG.appendChild(b); return b; });
const bgFog = $(`<div class="fog"></div>`); BG.appendChild(bgFog);
bgFog.parts = [[-2, 170, 520, "#424242"], [14, 120, 420, "#363636"], [30, 180, 560, "#545454"], [47, 110, 460, "#383838"], [63, 170, 540, "#4C4C4C"], [80, 120, 440, "#3C3C3C"], [96, 170, 520, "#505050"]]
  .map(([x, y, w, c]) => { const sp = $(`<span style="left:${x}%;top:${y}px;width:${w}px;height:${w * 0.55}px;background:${c};opacity:.45"></span>`); bgFog.appendChild(sp); return sp; });
function drawBG(t, T = t) {
  // фон — чистый чёрный: пятна и туман выключены, чтобы ничто не спорило с интерфейсом
  [bgGrad, ...bgBlobs, bgFog].forEach((e) => { e.style.display = "none"; });
  return;
  // в «тёмных» сценах референса фон приглушён, но не пропадает
  // в «тёмных» сценах фон приглушается плавно, а не щелчком
  BG.style.opacity = keys(t, [[0, 1], [2.4, 1], [2.85, 0.45], [3.45, 0.45], [3.85, 1], [9.85, 1], [10.25, 0.45], [12.7, 0.45], [13.15, 1]])[0];
  bgGrad.style.backgroundPosition = `${(50 + 50 * Math.sin(T * 0.21)).toFixed(2)}% ${(50 + 50 * Math.cos(T * 0.17)).toFixed(2)}%`;
  bgGrad.style.transform = `rotate(${(Math.sin(T * 0.09) * 8).toFixed(2)}deg)`;
  bgBlobs.forEach((b, i) => {
    b.style.transform = `translate(${(Math.sin(T * 0.33 + i * 2) * 160).toFixed(1)}px,${(Math.cos(T * 0.27 + i * 1.3) * 90).toFixed(1)}px) scale(${(1 + 0.18 * Math.sin(T * 0.5 + i)).toFixed(3)})`;
    b.style.opacity = (0.42 + 0.18 * Math.sin(T * 0.6 + i * 1.7)).toFixed(3);
  });
  bgFog.parts.forEach((p, i) => { p.style.transform = `translate(${Math.sin(T * 0.5 + i) * 40}px,${Math.cos(T * 0.4 + i * 1.7) * 18}px)`; });
}
// переливы цветами фона по заголовкам, как в первом промо
function shimmer(t) { document.querySelectorAll(".grad").forEach((e) => { e.style.backgroundPosition = `${(-t * 260) % 1800}px 0`; }); }

// ===================== ШЁЛК =====================
// Свечение из трёх размытых лент: синий край, ледяная середина, белое ядро.
const silk = $(`<svg class="abs" style="left:0;top:0" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sg1" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#222222"/><stop offset=".4" stop-color="#666666"/><stop offset=".62" stop-color="#ACACAC"/><stop offset=".8" stop-color="#575757"/><stop offset="1" stop-color="#3E3E3E"/></linearGradient>
    <linearGradient id="sg2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9F9F9F" stop-opacity="0"/><stop offset=".5" stop-color="#CECECE"/><stop offset="1" stop-color="#9F9F9F" stop-opacity="0"/></linearGradient>
    <filter id="sb" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="38"/></filter>
    <filter id="sb2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="20"/></filter>
  </defs>
  <g id="silkG">
    <path filter="url(#sb)" fill="url(#sg1)" d="M-300 1350C250 1050 520 760 860 560S1450 120 2200 -260L2300 160C1650 430 1350 760 1000 920S380 1300 -200 1600Z"/>
    <path filter="url(#sb)" fill="url(#sg1)" opacity=".75" d="M300 1400C620 1100 760 860 1060 700S1600 420 2250 360L2250 760C1700 760 1420 880 1180 1040S760 1400 520 1500Z"/>
    <path filter="url(#sb2)" fill="url(#sg2)" opacity=".9" d="M120 1250C520 980 700 760 940 620S1450 300 1950 40L1990 110C1500 380 1180 640 980 760S560 1100 220 1330Z"/>
    <path filter="url(#sb2)" fill="url(#sg2)" opacity=".7" d="M560 1300C800 1080 960 900 1180 800S1660 600 2050 560L2050 620C1680 660 1400 760 1220 880S900 1150 660 1360Z"/>
  </g>
</svg>`);
const silkWrap = $(`<div class="scene"></div>`); silkWrap.appendChild(silk); root.appendChild(silkWrap);
const silkG = silk.querySelector("#silkG");
function drawSilk(t) {
  // яркость и положение по сценам: полное свечение в начале, дальше — край
  const [o, dx, dy, sc] = keys(t, [
    [0, 1, 0, 0, 1], [2.4, 1, 0, 0, 1], [2.85, 0, -260, 130, 1.08], [3.5, 0, -520, 260, 1.15], [3.9, 0.85, -520, 260, 1.15],
    [4.4, 0.85, -560, 280, 1.17], [4.8, 0.35, -620, 320, 1.2], [5.15, 0.35, -300, 200, 1.15], [5.6, 0.6, 560, -120, 1.05],
    [6.4, 0.6, 620, -160, 1.06], [6.8, 0.55, 900, -320, 1.1], [8.2, 0.55, 860, -300, 1.1], [8.7, 0.6, -760, 0, 1.1],
    [9.8, 0.6, -800, 10, 1.1], [10.2, 0, -820, 20, 1.1]]);
  silkWrap.style.opacity = o;
  silkWrap.style.visibility = o > 0.002 ? "visible" : "hidden";
  const a = Math.sin(t * 1.3) * 5 + t * 1.5, bx = Math.sin(t * 0.9) * 60 + dx, by = Math.cos(t * 1.1) * 40 + dy;
  silkG.setAttribute("transform", `translate(${(W / 2 + bx).toFixed(1)} ${(H / 2 + by).toFixed(1)}) rotate(${a.toFixed(2)}) scale(${(sc * (1 + 0.04 * Math.sin(t * 2))).toFixed(3)}) translate(${-W / 2} ${-H / 2})`);
}

// ===================== 1. ЗНАК И СЛОВО → ПЛАШКА → ЧИПЫ =====================
const s1 = $(`<div class="scene"></div>`); root.appendChild(s1);
const logo1 = $(`<div class="abs" style="left:0;top:0;width:150px;height:150px;filter:drop-shadow(0 0 18px rgba(228,228,228,.8))">${star(150, "#F4F6FF")}</div>`); s1.appendChild(logo1);
const WORD = "Mintly";
const word1 = $(`<div class="abs" style="left:0;top:0;font:800 118px/1.1 'Nunito';letter-spacing:-.02em;white-space:nowrap;filter:drop-shadow(0 0 18px rgba(188,188,188,.55))">${[...WORD].map((c) => `<span class="ch grad">${c}</span>`).join("")}</div>`); s1.appendChild(word1);
const pill = $(`<div class="abs" style="left:0;top:0;height:96px;border-radius:30px;background:#fff;box-shadow:0 0 40px rgba(238,238,238,.95),0 0 110px rgba(167,167,167,.6)"></div>`); s1.appendChild(pill);
// Панель разделов — та же капсула, что внизу приложения: пять круглых
// кнопок, выбранная залита белым.
const CHIPS = ["home", "swap", "rocket", "bag", "bars"];
const КН = 132, ЗАЗОР_КН = 18, ПОЛЕ_КН = 20;
const row = $(`<div class="abs" style="left:0;top:0;width:${W}px;height:${КН}px"></div>`); s1.appendChild(row);
const capsule = $(`<div class="abs" style="left:0;top:${-ПОЛЕ_КН}px;height:${КН + ПОЛЕ_КН * 2}px;border-radius:999px;background:rgba(0,0,0,.22);backdrop-filter:blur(26px) saturate(1.5);-webkit-backdrop-filter:blur(26px) saturate(1.5);box-shadow:0 10px 30px rgba(0,0,0,.32)"></div>`); row.appendChild(capsule);
const chips = CHIPS.map((k) => { const c = $(`<div class="navb">${ico(k)}</div>`); row.appendChild(c); return c; });
const ЦЕЛЬ = 2;
const cursor = $(`<svg class="abs" style="left:0;top:0;filter:drop-shadow(0 6px 14px rgba(0,0,0,.6))" width="64" height="72" viewBox="0 0 32 36">
  <path d="M11 3.5c1.4 0 2.4 1 2.4 2.4V15l1-.2c1.1-.1 2 .4 2.4 1.3l.5-.1c1.2-.2 2.2.4 2.6 1.4h.6c1.4 0 2.5 1.1 2.5 2.5v6.3c0 4.4-3.2 7.8-7.6 7.8h-1.6c-2.6 0-4.4-1-6-3.2L3.6 25c-.8-1.1-.6-2.6.5-3.4 1-.7 2.4-.5 3.2.4l1.3 1.5V5.9c0-1.4 1-2.4 2.4-2.4z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M13.4 15v6M16.8 16.1v5M20.3 17.6v4" stroke="#111" stroke-width="1.4" stroke-linecap="round"/></svg>`); s1.appendChild(cursor);
let chipW = [], chipX = [];
function layoutChips() {
  const gap = ЗАЗОР_КН;
  chipW = chips.map(() => КН);
  const total = chipW.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
  let x = (W - total) / 2;
  chipX = chipW.map((w) => { const p = x; x += w + gap; return p; });
}
function drawS1(t) {
  const on = t < 2.85; show(s1, on); if (!on) return;
  // камера чуть наезжает, пока курсор идёт к чипу, и сцена растворяется
  const zoom = 1 + 0.05 * E.io(prog(t, 1.85, 2.58)) + 0.06 * E.io(prog(t, 2.45, 2.85));
  s1.style.transform = `scale(${zoom.toFixed(4)})`; s1.style.transformOrigin = "960px 540px";
  const ух = E.io(prog(t, 2.45, 2.8));
  s1.style.opacity = 1 - ух; s1.style.filter = ух > 0.01 ? `blur(${(ух * 10).toFixed(1)}px)` : "none";
  // знак: проявляется в центре вращением, затем уходит влево к слову
  const kIn = E.out(prog(t, 0.08, 0.4)), kL = E.io(prog(t, 0.38, 0.66)), kOut = prog(t, 1.12, 1.3);
  const lx = lerp(W / 2, 700, kL) - 75, ly = H / 2 - 75;
  S(logo1, { o: kIn * (1 - kOut), x: lx, y: ly, s: lerp(0.35, 1, kIn) * (1 - 0.2 * kOut), r: lerp(-120, 0, kIn), b: (1 - kIn) * 14 + kOut * 10 });
  // слово по буквам: из размытия, со сдвигом вправо
  const wx = 810, wy = H / 2 - 58;
  S(word1, { o: 1, x: wx, y: wy, b: 0 });
  [...word1.children].forEach((ch, i) => {
    const a = 0.56 + i * 0.05, k = E.out(prog(t, a, a + 0.28));
    S(ch, { o: k * (1 - prog(t, 1.16, 1.26)), x: (1 - k) * 46, b: (1 - k) * 12 + prog(t, 1.12, 1.26) * 8 });
  });
  // плашка: вырастает на месте слова, растягивается и рассыпается на чипы
  const kP = E.out(prog(t, 1.12, 1.27)), kSt = E.io(prog(t, 1.27, 1.42)), kPo = prog(t, 1.36, 1.46);
  const pw = lerp(lerp(60, 380, kP), 1440, kSt), ph = lerp(110, 96, kSt);
  pill.style.width = pw + "px"; pill.style.height = ph + "px";
  S(pill, { o: (t >= 1.12 ? kP : 0) * (1 - kPo), x: lerp(wx + 170, W / 2, kSt) - pw / 2, y: H / 2 - ph / 2, b: kSt * 6 });
  // чипы: из середины разъезжаются с отдачей и горизонтальным смазом
  row.style.transform = `translate3d(0,${H / 2 - КН / 2}px,0)`;
  const kC = prog(t, 1.36, 1.8);
  // капсула растёт из плашки до ширины всех кнопок
  const kCap = E.back(kC), full = chipX[4] + КН - chipX[0] + ПОЛЕ_КН * 2;
  const cw = lerp(Math.min(full, 380), full, kCap);
  capsule.style.width = cw + "px";
  S(capsule, { o: E.out(prog(t, 1.34, 1.46)), x: W / 2 - cw / 2 });
  chips.forEach((c, i) => {
    const kk = E.back(kC), from = W / 2 - chipW[i] / 2;
    const x = lerp(from, chipX[i], kk);
    const o = E.out(prog(t, 1.36, 1.5));
    let s = 1, glow = 0;
    if (i === ЦЕЛЬ) {
      const press = prog(t, 2.14, 2.22) - prog(t, 2.24, 2.36);
      s = 1 - 0.07 * clamp(press);
      glow = E.out(prog(t, 2.16, 2.32));
    }
    S(c, { o, x, s, b: (1 - E.out(prog(t, 1.36, 1.62))) * 9 });
    // выбранная кнопка — белый круг: сначала «Главная», после нажатия «Запуск»
    const актив = i === ЦЕЛЬ ? glow : (i === 0 ? 1 - E.out(prog(t, 2.16, 2.32)) : 0);
    c.style.background = `rgba(255,255,255,${актив.toFixed(3)})`;
    c.querySelector("svg").style.stroke = актив > 0.5 ? "#14151A" : "#9B9FA9";
    c.querySelector("svg").style.strokeWidth = актив > 0.5 ? 2 : 1.8;
  });
  // курсор: снизу к «Запуску», нажатие
  const kc = E.out(prog(t, 1.82, 2.1));
  const tx = chipX[ЦЕЛЬ] + chipW[ЦЕЛЬ] / 2 - 14, ty = H / 2 + 10;
  const press = clamp(prog(t, 2.14, 2.22) - prog(t, 2.24, 2.36));
  S(cursor, { o: prog(t, 1.82, 1.9), x: lerp(tx + 260, tx, kc), y: lerp(ty + 520, ty, kc), s: 1 - 0.12 * press });
}

// ===================== 2. СОЗДАНИЕ ТОКЕНА: поле крупно → вся форма =====================
// Форма — та же, что в разделе «Запуск»: переключатель сети, логотип и
// баннер, «Название», «Тикер» и кнопка запуска. Размеры — точки
// приложения (экран 393), камера их увеличивает.
const s2 = $(`<div class="scene"></div>`); root.appendChild(s2);
const glowTop = $(`<div class="abs" style="left:560px;top:-70px;width:800px;height:150px;border-radius:50%;background:radial-gradient(closest-side,rgba(167,167,167,.75),rgba(167,167,167,.18) 60%,rgba(167,167,167,0))"></div>`); s2.appendChild(glowTop);
const поле = (y, ph, id) => `<div class="abs" style="left:16px;top:${y}px;width:361px;height:50px;border-radius:12px;background:#14171F;border:1px solid #22262F;display:flex;align-items:center;padding:0 14px;font:400 17px/1 'Onest'">
  <span class="ph ph-${id}" style="color:#63625F">${ph}</span><span class="val val-${id}" style="color:#F2F0EB;white-space:pre"></span></div>`;
const подпись = (y, txt) => `<div class="abs" style="left:16px;top:${y}px;font:500 14px/1 'Onest';color:#97958F">${txt}</div>`;
const form = $(`<div class="abs" style="left:0;top:0;width:393px;height:540px;transform-origin:0 0">
  <div class="fbg abs" style="inset:-14px -0px;border-radius:40px;background:#0B0D12;box-shadow:0 0 0 1px rgba(255,255,255,.06),0 40px 100px rgba(0,0,0,.6)"></div>
  <div class="fui abs" style="inset:0">
    <div class="abs" style="left:16px;top:14px;width:168px;height:38px;border-radius:999px;background:#14171F">
      <div class="abs" style="left:3px;top:3px;width:81px;height:32px;border-radius:999px;background:rgba(255,255,255,.92)"></div>
      <div class="abs" style="left:3px;top:0;width:81px;height:38px;display:flex;align-items:center;justify-content:center;font:800 13.5px/1 'Nunito';color:#0B0B0F">GRAM</div>
      <div class="abs" style="left:84px;top:0;width:81px;height:38px;display:flex;align-items:center;justify-content:center;font:600 13.5px/1 'Onest';color:#63625F">SOL</div>
    </div>
    ${подпись(80, "Логотип")}
    <div class="abs" style="left:16px;top:102px;width:76px;height:76px;border-radius:50%;border:1.5px dashed #30343E;overflow:hidden">
      <img class="flogo" src="assets/coins/jimothy.png" style="width:100%;height:100%;opacity:0"/></div>
    <div class="abs" style="left:104px;top:102px;width:273px;height:76px;border-radius:16px;border:1.5px dashed #30343E;display:flex;align-items:center;justify-content:center;font:400 12px/1 'Onest';color:#97958F">Баннер 1200×400 (необязательно)</div>
    ${подпись(204, "Название")}
    ${поле(226, "Prism Cat", "name")}
    ${подпись(302, "Тикер")}
    ${поле(324, "PRSM", "tick")}
    <div class="fbtn abs" style="left:16px;top:410px;width:361px;height:52px;border-radius:12px;background:#F2F0EB;display:flex;align-items:center;justify-content:center;font:800 16px/1 'Nunito';color:#2A2C31;box-shadow:0 0 30px rgba(188,188,188,.45)">Запустить токен</div>
  </div>
</div>`);
s2.appendChild(form);
const fbg = form.querySelector(".fbg"), fui = form.querySelector(".fui"), fbtn = form.querySelector(".fbtn"), flogo = form.querySelector(".flogo");
const ИМЯ = "Jimothy", ТИКЕР = "JIM";
const valName = form.querySelector(".val-name"), phName = form.querySelector(".ph-name");
const valTick = form.querySelector(".val-tick"), phTick = form.querySelector(".ph-tick");
valName.innerHTML = [...ИМЯ].map((c) => `<span class="ch">${c}</span>`).join("");
valTick.innerHTML = [...ТИКЕР].map((c) => `<span class="ch">${c}</span>`).join("");
const charsName = [...valName.children], charsTick = [...valTick.children];
// печать: свежие буквы синие и остывают в белый
function typeChars(chars, t, a, b, accent = "#BFBFBF") {
  const n = chars.length;
  chars.forEach((ch, i) => {
    const ti = a + (b - a) * (i / n);
    ch.style.display = t >= ti ? "inline-block" : "none";
    const cool = clamp((t - ti - 0.28) / 0.25);
    ch.style.color = cool >= 1 ? "#F2F0EB" : (cool <= 0 ? accent : `color-mix(in srgb, #F2F0EB ${Math.round(cool * 100)}%, ${accent})`);
  });
}
function drawS2(t) {
  const on = t >= 2.5 && t < 4.62; show(s2, on); if (!on) return;
  S(glowTop, { o: (1 - E.out(prog(t, 3.5, 3.8))) * (0.8 + 0.2 * Math.sin(t * 6)) });
  typeChars(charsName, t, 2.7, 3.45);
  typeChars(charsTick, t, 3.92, 4.16);
  phName.style.display = t >= 2.7 ? "none" : ""; phTick.style.display = t >= 3.92 ? "none" : "";
  // крупно — одно поле «Название» во весь кадр, затем камера отъезжает к форме
  const k = E.io(prog(t, 3.48, 3.86));
  const big = { s: 4.2, x: 330 - 16 * 4.2, y: 470 - 238 * 4.2 };
  const small = { s: 2.0, x: 1000, y: 46 };
  const drift = E.out(prog(t, 3.86, 4.62));
  const s = lerp(big.s, small.s, k), x = lerp(big.x, small.x, k) - 60 * drift, y = lerp(big.y, small.y, k) + 10 * drift;
  form.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(4)}) perspective(2000px) rotateY(${(-4 * drift).toFixed(2)}deg)`;
  fbg.style.opacity = k;
  // всё, кроме поля, проявляется вместе с отъездом камеры
  [...fui.children].forEach((e) => { if (!e.contains(valName)) e.style.opacity = E.out(prog(t, 3.55, 3.9)); });
  flogo.style.opacity = E.out(prog(t, 3.75, 3.95));
  // нажатие «Запустить токен» и улёт формы в камеру
  const pr = clamp(prog(t, 4.22, 4.28) - prog(t, 4.3, 4.38));
  fbtn.style.transform = `scale(${(1 - 0.05 * pr).toFixed(3)})`;
  fbtn.style.boxShadow = `0 0 ${(30 + 40 * pr).toFixed(0)}px rgba(188,188,188,${(0.45 + 0.4 * pr).toFixed(2)})`;
  const fly = E.io(prog(t, 4.34, 4.6)), вход = E.io(prog(t, 2.55, 2.85));
  s2.style.transform = `scale(${(1 + 1.4 * fly + 0.04 * (1 - вход)).toFixed(4)})`; s2.style.transformOrigin = "960px 760px";
  const бл = fly * 16 + (1 - вход) * 8;
  s2.style.filter = бл > 0.05 ? `blur(${бл.toFixed(1)}px)` : "none";
  s2.style.opacity = (1 - fly) * вход;
}

// ===================== 3. ПРОЛЁТ СКВОЗЬ МЕМПАД =====================
// Строки ленты мемпада — те же, что в приложении: логотип, тикер, имя и
// возраст, капитализация и изменение.
const s3 = $(`<div class="scene" style="perspective:900px;perspective-origin:960px 540px"></div>`); root.appendChild(s3);
const ЛЕНТА = [
  ["frog", "$JIM", "Jimothy · 9 мин", "$30.1K", "+12.6%", 1], ["m", "$MINT", "Mintly · 2 мин", "$66.3K", "+38.2%", 1], ["pup", "$PUP", "Pixel Pup · 17 мин", "$46.8K", "+24.9%", 1],
  ["boo", "$BOO", "Boo · 26 мин", "$18.0K", "-3.1%", 0], ["fire", "$WICK", "Hot Wick · 31 мин", "$12.7K", "+6.4%", 1], ["mcat", "$MCAT", "Moon Cat · 44 мин", "$9.4K", "+2.2%", 1],
];
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rowEls = Array.from({ length: 24 }, (_, i) => {
  const [lg, tk, nm, mc, ch, up] = ЛЕНТА[i % ЛЕНТА.length];
  const el = $(`<div class="abs" style="left:0;top:0;width:620px;height:96px;display:flex;align-items:center;gap:20px;padding:0 24px;border-radius:26px;background:#0F0F13;border:1px solid rgba(255,255,255,.09)">
    <img src="assets/tok/${lg}.png" style="width:64px;height:64px;border-radius:50%;flex:none"/>
    <div style="flex:1"><div style="font:800 28px/1.1 'Nunito';color:#fff">${tk}</div><div style="font:500 19px/1.3 'Onest';color:#97958F">${nm}</div></div>
    <div style="text-align:right"><div style="font:800 28px/1.1 'Nunito';color:${up ? "#2EE87A" : "#FF5A63"}">${mc}</div><div style="font:600 19px/1.3 'Onest';color:${up ? "#2EE87A" : "#FF5A63"}">${ch}</div></div></div>`);
  s3.appendChild(el);
  return { el, x: (rnd() - 0.5) * 1300 - 610, y: (rnd() - 0.5) * 760 + 170, z0: -3300 + i * 120 + rnd() * 90 };
});
function drawS3(t) {
  const on = false; show(s3, on); if (!on) return;
  const k = prog(t, 4.4, 5.5);
  const sp = 2600 * E.io(k) + 700 * k;
  rowEls.forEach((c) => {
    const z = c.z0 + sp;
    const near = clamp((z + 260) / 420), far = clamp((z + 2700) / 500);
    const o = far * (1 - clamp((z - 120) / 200)) * (1 - smooth(prog(t, 5.2, 5.5))) * smooth(prog(t, 4.4, 4.62));
    c.el.style.opacity = o.toFixed(3);
    c.el.style.visibility = o > 0.01 ? "visible" : "hidden";
    c.el.style.transform = `translate3d(${(960 + c.x).toFixed(1)}px,${(540 + c.y).toFixed(1)}px,${z.toFixed(1)}px)`;
    c.el.style.filter = `blur(${(near * 9 + (1 - far) * 4).toFixed(1)}px)`;
  });
}

// ===================== 4. СТРАНИЦА ТОКЕНА И ПОКУПКА =====================
// Карточка — шапка страницы токена из приложения: логотип, имя, цена,
// график и кнопки. Второй ход — покупка: сумма, «Купить» и мгновенное
// подтверждение; карточка возвращается уже с позицией.
const s4 = $(`<div class="scene" style="perspective:1700px;perspective-origin:960px 540px"></div>`); root.appendChild(s4);
const CW = 1240, CH = 690;
const card = $(`<div class="abs" style="left:${(W - CW) / 2}px;top:${(H - CH) / 2}px;width:${CW}px;height:${CH}px;transform-style:preserve-3d">
  <div class="abs" style="inset:0;border-radius:64px;overflow:hidden;background:#0F0F13">
    <div class="ctint abs" style="inset:0;background:radial-gradient(70% 90% at 100% 0%, rgba(172,172,172,.22) 0%, rgba(172,172,172,.06) 45%, transparent 70%)"></div>
    <div class="abs" style="inset:0;border-radius:64px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.08),inset 0 2px 30px rgba(255,255,255,.05)"></div>
    <div class="abs" style="left:84px;top:70px;display:flex;align-items:center;gap:30px">
      <img src="assets/coins/jimothy.png" style="width:120px;height:120px;border-radius:50%;"/>
      <div><div style="font:800 84px/1 'Nunito';letter-spacing:-.02em;color:#fff">Jimothy</div>
      <div style="font:500 34px/1.3 'Onest';color:#97958F;margin-top:6px">$JIM · Gram</div></div>
    </div>
    <div class="abs" style="right:84px;top:80px;text-align:right">
      <div style="font:800 76px/1 'Nunito';color:#F2F0EB">$30.1K</div>
      <div style="font:700 34px/1.4 'Onest';color:#2EE87A">+$3.4K (+12.6%)</div>
    </div>
    <svg class="abs" style="left:84px;top:250px" width="1072" height="230" viewBox="0 0 1072 230" fill="none">
      <defs><linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2EE87A" stop-opacity=".32"/><stop offset="1" stop-color="#2EE87A" stop-opacity="0"/></linearGradient></defs>
      <path d="M0 196 L70 184 L140 190 L210 160 L280 170 L350 132 L420 146 L490 112 L560 124 L630 86 L700 100 L770 70 L840 80 L910 44 L980 56 L1072 18 L1072 230 L0 230Z" fill="url(#ar)"/>
      <path class="cline" d="M0 196 L70 184 L140 190 L210 160 L280 170 L350 132 L420 146 L490 112 L560 124 L630 86 L700 100 L770 70 L840 80 L910 44 L980 56 L1072 18" stroke="#2EE87A" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div class="cpos abs" style="left:84px;top:500px;font:500 30px/1 'Onest';color:#97958F">Ваша позиция: <span class="cposv" style="color:#F2F0EB;font-weight:600">токенов пока нет</span></div>
    <div class="abs" style="left:84px;top:560px;right:84px;height:96px;display:flex;gap:24px">
      <div class="cbuy" style="flex:1;border-radius:24px;background:#00E96B;display:flex;align-items:center;justify-content:center;font:800 38px/1 'Nunito';color:#04150B">Купить</div>
      <div style="flex:1;border-radius:24px;background:#FF3B47;display:flex;align-items:center;justify-content:center;font:800 38px/1 'Nunito';color:#fff">Продать</div>
    </div>
  </div>
</div>`);
s4.appendChild(card);
const cposv = card.querySelector(".cposv"), cposWrap = card.querySelector(".cpos");
// окно покупки: сумма, быстрые суммы и одна кнопка — как в приложении
const buy = $(`<div class="abs" style="left:0;top:0;width:393px;height:330px;transform-origin:0 0">
  <div class="abs" style="inset:0;border-radius:28px;background:#0F0F13;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 30px 80px rgba(0,0,0,.6)"></div>
  <div class="abs" style="left:20px;top:22px;font:800 20px/1 'Nunito';color:#F2F0EB">Купить $JIM</div>
  <div class="abs" style="left:20px;top:62px;font:500 13px/1 'Onest';color:#97958F">Сумма</div>
  <div class="abs" style="left:20px;top:84px;font:800 46px/1 'Nunito';color:#F2F0EB">0.5 <span style="color:#97958F;font-size:28px">GRAM</span></div>
  <div class="abs" style="left:20px;top:148px;display:flex;gap:8px">
    ${["0.1", "0.5", "1", "MAX"].map((v) => `<span style="padding:8px 14px;border-radius:999px;background:${v === "0.5" ? "#F2F0EB" : "#1B1F29"};color:${v === "0.5" ? "#14151A" : "#F2F0EB"};font:700 13px/1 'Onest'">${v}</span>`).join("")}
  </div>
  <div class="abs" style="left:20px;top:192px;font:500 13px/1.3 'Onest';color:#97958F">Получите ≈ <span style="color:#F2F0EB">12 400 JIM</span> · комиссия 0%</div>
  <div class="bbtn abs" style="left:20px;right:20px;top:240px;height:58px;border-radius:16px;background:#00E96B;display:flex;align-items:center;justify-content:center;font:800 18px/1 'Nunito';color:#04150B">Купить</div>
</div>`);
s4.appendChild(buy);
const bbtn = buy.querySelector(".bbtn");
// подтверждение — плашка, как всплывает в приложении после сделки
const toast = $(`<div class="abs" style="left:0;top:0;width:620px;height:112px;border-radius:30px;background:#17171A;border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;gap:24px;padding:0 30px;box-shadow:0 30px 80px rgba(0,0,0,.6)">
  <span style="position:absolute;left:0;top:26px;bottom:26px;width:5px;border-radius:3px;background:#2EE87A"></span>
  <span style="width:60px;height:60px;border-radius:18px;background:rgba(46,232,122,.16);display:flex;align-items:center;justify-content:center;flex:none">
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#2EE87A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span>
  <div style="flex:1"><div style="font:800 34px/1.1 'Nunito';color:#fff">Куплено</div><div style="font:500 24px/1.3 'Onest';color:#8E8E99">12 400 JIM · комиссия 0%</div></div>
  <div class="tsec" style="font:800 34px/1 'Nunito';color:#2EE87A;font-variant-numeric:tabular-nums">0,0 с</div>
</div>`);
s4.appendChild(toast);
const tsec = toast.querySelector(".tsec");
const cur4 = cursor.cloneNode(true); s4.appendChild(cur4);
function drawS4(t) {
  const on = t >= 5.2 && t < 9.99; show(s4, on); if (!on) return;
  const куплено = t >= 8.3;
  cposv.textContent = куплено ? "12 400 JIM · $15.20" : "токенов пока нет";
  cposv.style.color = куплено ? "#2EE87A" : "#F2F0EB";
  card.firstElementChild.style.boxShadow = `0 0 0 2px rgba(172,172,172,.25), 0 0 70px rgba(172,172,172,.35), 0 40px 120px rgba(0,0,0,.6)`;
  let x = 0, y = 0, ry = -8, rx = 4, s = 1, b = 0, o = 1;
  if (t < 5.66) { const k = E.out(prog(t, 5.2, 5.66)); x = lerp(1100, 40, k); y = 60; ry = lerp(-62, -20, k); rx = lerp(10, 6, k); b = (1 - k) * 16; o = smooth(prog(t, 5.2, 5.45)); }
  else if (t < 6.42) { const k = E.out(prog(t, 5.66, 6.42)); x = lerp(40, -30, k); y = 60; ry = lerp(-20, -8, k); rx = lerp(6, 3, k); s = lerp(1, 1.04, k); }
  else if (t < 8.3) {
    // камера ныряет вниз: карточка уходит вверх, под ней — окно покупки
    const k = E.io(prog(t, 6.42, 6.74)), pan = E.io(prog(t, 6.9, 8.3));
    x = -30 - 260 * pan; y = lerp(60, -880, k); ry = -8 + 4 * pan; rx = 3; s = 1.04; b = Math.sin(k * Math.PI) * 14;
  } else if (t < 9.92) {
    // и возвращается — уже с позицией
    const k = E.out(prog(t, 8.3, 8.72)), d = E.io(prog(t, 8.72, 9.92));
    x = lerp(-290, -40, k) - 40 * d; y = lerp(-880, 60, k) - 10 * d; ry = lerp(-4, -10, k) + 4 * d; rx = lerp(3, 4, k); s = lerp(1.04, 0.96, k) + 0.03 * d; b = (1 - k) * 18;
  } else { const k = E.io(prog(t, 9.92, 10.25)); x = -80; y = 50 - 70 * k; ry = -6; s = 0.99 - 0.04 * k; b = k * 12; o = 1 - k; }
  card.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${s.toFixed(4)})`;
  card.style.filter = b > 0.05 ? `blur(${b.toFixed(1)}px)` : "none";
  card.style.opacity = o;
  // позиция подсвечивается, когда карточка вернулась
  const hl = smooth(prog(t, 8.7, 9.0)) * (1 - smooth(prog(t, 9.4, 9.9)));
  cposWrap.style.textShadow = hl > 0.01 ? `0 0 ${(24 * hl).toFixed(0)}px rgba(46,232,122,${(0.8 * hl).toFixed(2)})` : "none";
  // окно покупки живёт под карточкой, пока камера внизу
  const kIn = E.io(prog(t, 6.42, 6.74)), kOut = E.io(prog(t, 8.3, 8.6));
  const pan = E.io(prog(t, 6.9, 8.3));
  const SS = 2.3;
  const py = lerp(1300, 250, kIn) + lerp(0, 1000, kOut), px = 1000 - 200 * pan;
  buy.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) scale(${SS})`;
  buy.style.opacity = t < 6.42 || t > 8.62 ? 0 : 1;
  const bl = Math.sin(kIn * Math.PI) + Math.sin(kOut * Math.PI);
  buy.style.filter = bl > 0.05 ? `blur(${(bl * 12).toFixed(1)}px)` : "none";
  // курсор к «Купить», нажатие, и сразу — «Куплено»
  const bx = px + 196 * SS, by = py + 269 * SS;
  const kc = E.out(prog(t, 7.0, 7.45));
  const pr = clamp(prog(t, 7.5, 7.58) - prog(t, 7.62, 7.72));
  S(cur4, { o: t < 6.9 || t > 8.3 ? 0 : smooth(prog(t, 7.0, 7.12)) * (1 - smooth(prog(t, 8.1, 8.26))), x: lerp(bx + 300, bx - 10, kc), y: lerp(by + 400, by, kc), s: 1 - 0.12 * pr });
  bbtn.style.transform = `scale(${(1 - 0.05 * pr).toFixed(3)})`;
  bbtn.style.boxShadow = `0 0 ${(40 * pr).toFixed(0)}px rgba(46,232,122,${(0.7 * pr).toFixed(2)})`;
  const kt = E.back(prog(t, 7.62, 7.95)), tOut = smooth(prog(t, 8.15, 8.35));
  S(toast, { o: smooth(prog(t, 7.62, 7.78)) * (1 - tOut), x: px + 393 * SS / 2 - 310, y: lerp(py - 120, py - 170, kt) - 40 * tOut, s: lerp(0.95, 1.12, kt) });
  // счётчик времени сделки бежит и встаёт
  const сек = 0.9 * smooth(prog(t, 7.62, 7.9));
  tsec.textContent = `${сек.toFixed(1).replace(".", ",")} с`;
}

// ===================== СЛАЙДЫ С ПРЕИМУЩЕСТВАМИ =====================
// Каждое преимущество — отдельный слайд на чистом фоне, без интерфейса:
// крупная фраза по словам из размытия, как в первом промо, — слева,
// а справа экран или виджет с тем, о чём она. Слайды
// вклиниваются в действие: интерфейс на это время замирает и
// растворяется, а потом продолжается с того же места.
const ui = $(`<div class="scene"></div>`);
const slides = $(`<div class="scene"></div>`);
function slide(html) {
  const box = $(`<div class="abs" style="left:0;right:0;top:0;height:${H}px;display:flex;align-items:center;justify-content:flex-start;padding-left:110px"><div class="deco abs" style="inset:0"></div><div style="position:relative;text-align:left;font:800 108px/1.12 'Nunito';letter-spacing:-.02em;color:#fff;text-shadow:0 8px 40px rgba(0,0,0,.55)">${html}</div></div>`);
  slides.appendChild(box);
  const el = box.lastElementChild; el.box = box; el.deco = box.firstElementChild;
  el.innerHTML = el.innerHTML.replace(/(<br>)|([^\s<]+)/g, (m, br) => br ? br : `<span class="w" style="display:inline-block;margin:0 .26em 0 0">${m}</span>`);
  el.spans = [...el.querySelectorAll(".w")];
  el.spans.forEach((sp) => { if (sp.textContent.startsWith("*")) { sp.textContent = sp.textContent.slice(1); sp.classList.add("grad"); } });
  return el;
}
const ДЛ = 2.4; // темп движения внутри слайда
// сколько живёт каждый слайд: прочесть фразу и рассмотреть экран
const ДЛИ = [5.123, 4.366, 3.39, 3.878, 3.831]; // подогнано: каждая смена — на удар песни
const С_ОТ = ДЛИ.map((_, i) => ДЛИ.slice(0, i).reduce((a, b) => a + b, 0));
// [где встаёт слайд, откуда действие продолжается после него]: после
// первого слайда действие сразу идёт к странице токена — пролёта сквозь
// ленту больше нет
// Слайды идут подряд сразу после запуска токена; карточек токена и
// окна покупки больше нет — после последнего слайда сразу знак
const ВСЕ_СЛАЙДЫ = [
  slide("Запуск токена<br>*за *секунды"),
  slide("Gram и Solana<br>*в *одном *месте"),
  slide("Комиссия *0%"),
  slide("Покупка<br>*за *секунду"),
  slide("Прямо<br>*в *Telegram"),
];
const С_НАЧ = 4.42, С_КОН = 10.0; // где встают слайды и откуда действие продолжается
const С_ДЛ = ДЛИ.reduce((a, b) => a + b, 0);
// реальное время → время действия, текущий слайд и место внутри блока
function разложить(T) {
  if (T < С_НАЧ) return { t: T, el: null, p: 0, блок: -1 };
  if (T < С_НАЧ + С_ДЛ) { let i = 0; while (i < 4 && T - С_НАЧ >= С_ОТ[i + 1]) i++; // под концом блока интерфейс уже на следующей сцене — форма запуска
    // не должна проступить обратно
    const t = T - С_НАЧ > С_ДЛ / 2 ? С_КОН : С_НАЧ;
    return { t, el: ВСЕ_СЛАЙДЫ[i], p: T - С_НАЧ - С_ОТ[i], блок: T - С_НАЧ }; }
  // за слайдами — вставка по второму референсу, действие стоит
  if (T < С_НАЧ + С_ДЛ + В_ДЛ) return { t: С_КОН, el: null, p: 0, блок: T - С_НАЧ, v: T - С_НАЧ - С_ДЛ };
  return { t: T - С_ДЛ - В_ДЛ + (С_КОН - С_НАЧ), el: null, p: 0, блок: -1 };
}
// ---- справа от фразы — то, о чём она: экран приложения или виджет ----
// Фраза слева только называет преимущество, а справа его видно в деле:
// телефон там, где важно действие пальцем, отдельный виджет — где важна
// одна цифра или сравнение.
// Все телефоны стоят близко к камере — крупно, низ уходит за край кадра;
// виджеты тоже крупнее, чтобы читались с телефона.
const ПX = 1180, ПY = 36, П_K = 1.32; // где стоит телефон и во сколько он крупнее
const ВИД_K = 1.22; // во сколько крупнее виджеты
// точка экрана телефона → точка кадра: от неё считаются нажатия
const наЭкране = (x, y) => [ПX + (12 + x) * П_K, ПY + (12 + y) * П_K];
function телефон(i, html, y = ПY, h = 876, x = ПX) {
  const ph = $(`<div class="abs" style="left:${x}px;top:${y}px;width:417px;height:${h}px;border-radius:66px;background:#1C1D22;box-shadow:inset 0 0 0 2px rgba(255,255,255,.14),0 50px 120px rgba(0,0,0,.65),0 0 90px rgba(167,167,167,.22)">
    <div class="scr abs" style="left:12px;top:12px;width:393px;height:${h - 24}px;border-radius:54px;overflow:hidden;background:#0B0D12">
      <div class="abs" style="left:34px;top:20px;font:700 17px/1 'Onest';color:#F2F0EB">9:41</div>
      ${html}
    </div>
    <div class="abs" style="left:146px;top:24px;width:125px;height:36px;border-radius:20px;background:#000"></div>
  </div>`);
  ВСЕ_СЛАЙДЫ[i].deco.appendChild(ph);
  return ph;
}
const виджет = (i, x, y, w, html, доп = "") => {
  const e = $(`<div class="abs" style="left:${x}px;top:${y}px;width:${w}px;border-radius:40px;background:#0F0F13;border:1.5px solid rgba(255,255,255,.09);box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 40px 110px rgba(0,0,0,.6),0 0 80px rgba(167,167,167,.16);${доп}">${html}</div>`);
  ВСЕ_СЛАЙДЫ[i].deco.appendChild(e);
  return e;
};
// Цифры крутятся барабаном, как в счётчиках: каждая колонка — лента
// 0…9,0; младшая едет непрерывно, старшая сдвигается только пока младшая
// переходит с 9 на 0. Так число не перескакивает кадрами, а катится.
// Старшие нули прячутся и схлопываются — «99» дорастает до «100» плавно.
function барабан(el, целых, дробных, разд = ",") {
  let html = "";
  for (let j = целых + дробных - 1; j >= 0; j--) {
    if (j === дробных - 1 && дробных > 0) html += `<span class="рз" style="display:inline-block">${разд}</span>`;
    html += `<span class="бк" style="display:inline-block;width:.6em;height:1.12em;overflow:hidden;vertical-align:top;text-align:center"><span style="display:block">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => `<span style="display:block;height:1.12em;line-height:1.12em">${d}</span>`).join("")}</span></span>`;
  }
  el.innerHTML = html;
  el.style.whiteSpace = "nowrap";
  const кол = [...el.querySelectorAll(".бк")].reverse(); // [0] — младшая
  return (v) => {
    const V = Math.max(0, v) * Math.pow(10, дробных);
    кол.forEach((c, j) => {
      const ш = Math.pow(10, j), x = V / ш, n = Math.floor(x + 1e-7);
      const r = j === 0 ? x - n : Math.max(0, (V % ш) - (ш - 1));
      c.firstElementChild.style.transform = `translateY(${(-((n % 10) + r) * 1.12).toFixed(4)}em)`;
      // старшие нули целой части: проявляются, когда число до них дорастает
      if (j > дробных) {
        const пор = Math.pow(10, j - дробных), вид = clamp((v - 0.995 * пор) / (0.005 * пор));
        c.style.width = `${(0.6 * вид).toFixed(3)}em`; c.style.opacity = вид;
      }
    });
  };
}
// Рынок «тикает»: значение стоит, потом коротко перекатывается к новому —
// так цифры большую часть времени читаются, а не размыты в движении.
const шум = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
function тик(p, фаза, период = 0.55) {
  const x = p / период + фаза, i = Math.floor(x), f = x - i;
  return lerp(шум(i), шум(i + 1), smooth(clamp((f - 0.55) / 0.45)));
}
// плашка-подтверждение, как всплывает в приложении после действия:
// пока действие идёт — крутится кольцо и бегут секунды, по готовности —
// галочка и зелёная обводка
const плашка = (i, x, y, заг, под) => {
  const e = виджет(i, x, y, 540, `
  <div style="height:112px;display:flex;align-items:center;gap:22px;padding:0 28px">
    <span style="position:relative;width:60px;height:60px;border-radius:18px;background:rgba(255,255,255,.07);flex:none">
      <svg class="кольцо abs" style="left:10px;top:10px" width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="15" stroke="rgba(255,255,255,.14)" stroke-width="4"/><circle class="дуга" cx="20" cy="20" r="15" stroke="#F2F0EB" stroke-width="4" stroke-linecap="round" pathLength="1" stroke-dasharray=".28 1" transform="rotate(-90 20 20)"/></svg>
      <svg class="галка abs" style="left:13px;top:13px;opacity:0" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#2EE87A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path pathLength="1" stroke-dasharray="1 1" d="M5 12.5l4.5 4.5L19 7"/></svg></span>
    <div style="flex:1"><div class="заг" style="font:800 32px/1.1 'Nunito';color:#fff">${заг[0]}</div><div style="font:500 22px/1.35 'Onest';color:#8E8E99">${под}</div></div>
    <div style="font:800 32px/1.12 'Nunito';color:#F2F0EB;display:flex;align-items:flex-start"><span class="сек"></span><span>&nbsp;с</span></div>
  </div>`, "border-radius:30px");
  e.кольцо = e.querySelector(".кольцо"); e.дуга = e.querySelector(".дуга"); e.галка = e.querySelector(".галка");
  e.заг = e.querySelector(".заг"); e.сек = барабан(e.querySelector(".сек"), 1, 1); e.секEl = e.querySelector(".сек").parentElement; e.тексты = заг;
  return e;
};
// t — секунды с начала действия, длит — сколько оно длится по-настоящему
function плашкаЖдёт(e, t, длит) {
  const готово = t >= длит;
  e.сек(clamp(t, 0, длит));
  e.дуга.style.strokeDashoffset = (-t * 1.4).toFixed(3); // кольцо крутится, пока ждём
  e.кольцо.style.opacity = 1 - smooth(prog(t, длит, длит + 0.15));
  const kг = E.out(prog(t, длит + 0.05, длит + 0.35));
  e.галка.style.opacity = smooth(prog(t, длит, длит + 0.1));
  e.галка.firstElementChild.style.strokeDashoffset = (1 - kг).toFixed(3);
  e.заг.textContent = готово ? e.тексты[1] : e.тексты[0];
  // по готовности — зелёная обводка вспыхивает и остаётся
  const kо = smooth(prog(t, длит, длит + 0.25)), всп = Math.sin(Math.PI * prog(t, длит, длит + 0.6));
  e.style.borderColor = kо > 0.01 ? `rgba(46,232,122,${(0.09 + 0.81 * kо).toFixed(3)})` : "rgba(255,255,255,.09)";
  e.style.borderWidth = "2px";
  e.style.boxShadow = `0 40px 110px rgba(0,0,0,.6),0 0 ${(20 + 40 * всп).toFixed(0)}px rgba(46,232,122,${(0.45 * kо + 0.3 * всп).toFixed(3)})`;
  e.секEl.style.color = готово ? "#2EE87A" : "#F2F0EB";
}
const палец = (i) => { const c = cursor.cloneNode(true); ВСЕ_СЛАЙДЫ[i].deco.appendChild(c); return c; };
// у каждого экрана своё появление: подъём с наклоном, поворот из глубины,
// падение сверху, переворот, приближение — ни одно не повторяется
function появление(e, p, вид, м = 1) {
  const k = E.out5(prog(p, 0.05, 0.85)), kb = E.back(prog(p, 0.05, 0.75)), o = smooth(prog(p, 0.05, 0.35));
  e.style.transformOrigin = "0 0";
  e.style.opacity = o; e.style.visibility = o > 0.002 ? "visible" : "hidden";
  let т = "";
  if (вид === "подъём") т = `translate3d(0,${((1 - k) * 420).toFixed(1)}px,0) perspective(1600px) rotateX(${((1 - k) * 28).toFixed(2)}deg)`;
  else if (вид === "поворот") т = `translate3d(${((1 - k) * 260).toFixed(1)}px,0,0) perspective(1600px) rotateY(${((1 - k) * -42).toFixed(2)}deg)`;
  else if (вид === "падение") т = `translate3d(0,${((1 - kb) * -320).toFixed(1)}px,0)`;
  else if (вид === "переворот") т = `perspective(1600px) rotateX(${((1 - kb) * -80).toFixed(2)}deg)`;
  else if (вид === "приближение") т = `translate3d(${((1 - k) * 80).toFixed(1)}px,${((1 - k) * 60).toFixed(1)}px,0) rotate(${((1 - k) * 7).toFixed(2)}deg) scale(${(0.72 + 0.28 * k).toFixed(4)})`;
  e.style.transform = `${т} scale(${м})`;
  const б = (1 - k) * 12;
  e.style.filter = б > 0.05 ? `blur(${б.toFixed(2)}px)` : "none";
}
// палец подходит снизу к точке экрана и нажимает (время — в секундах слайда)
function нажатие(c, p, x, y, a, b) {
  const kc = E.out(prog(p, a, b)), pr = clamp(prog(p, b + 0.04, b + 0.1) - prog(p, b + 0.16, b + 0.26));
  S(c, { o: smooth(prog(p, a, a + 0.12)) * (1 - smooth(prog(p, b + 0.4, b + 0.6))), x: lerp(x + 220, x, kc) - 14, y: lerp(y + 380, y, kc) - 6, s: 1 - 0.12 * pr });
  return pr;
}
const сПодписью = (y, txt) => `<div class="abs" style="left:20px;top:${y}px;font:500 15px/1 'Onest';color:#97958F">${txt}</div>`;
const сПолем = (y, ph, cls, h = 52) => `<div class="abs" style="left:20px;top:${y}px;width:353px;height:${h}px;border-radius:14px;background:#14171F;border:1px solid #22262F;display:flex;align-items:${h > 60 ? "flex-start" : "center"};padding:${h > 60 ? "16px" : "0"} 16px;font:400 18px/1 'Onest'">
  <span class="ph" style="color:#63625F">${ph}</span><span class="${cls}" style="color:#F2F0EB;white-space:pre"></span></div>`;
const буквы = (el, txt) => { el.innerHTML = [...txt].map((c) => `<span class="ch">${c}</span>`).join(""); return [...el.children]; };
const переключательСети = (w, h) => `<div class="abs" style="left:0;top:0;width:${w}px;height:${h}px;border-radius:999px;background:#14171F">
  <div class="бег abs" style="left:${h * 0.08}px;top:${h * 0.08}px;width:${w / 2 - h * 0.08}px;height:${h * 0.84}px;border-radius:999px;background:rgba(255,255,255,.92)"></div>
  <div class="сг abs" style="left:0;top:0;width:${w / 2}px;height:${h}px;display:flex;align-items:center;justify-content:center;gap:${h * 0.14}px;font:800 ${h * 0.36}px/1 'Nunito'"><img src="assets/app/gram.png" style="width:${h * 0.42}px;height:${h * 0.42}px"/>GRAM</div>
  <div class="сс abs" style="left:${w / 2}px;top:0;width:${w / 2}px;height:${h}px;display:flex;align-items:center;justify-content:center;gap:${h * 0.14}px;font:800 ${h * 0.36}px/1 'Nunito'"><img src="assets/app/sol.png" style="width:${h * 0.42}px;height:${h * 0.42}px;border-radius:50%"/>SOL</div>
</div>`;

// 1. Запуск токена за секунды — телефон с формой: имя, тикер, «Запустить»;
// запуск идёт по-настоящему 2,8 с, плашка ждёт вместе с ним
const ЗАПУСК_С = 2.8, ЗАПУСК_ОТ = 1.5;
const тф1 = телефон(0, `
  <div class="abs" style="left:20px;top:70px;font:800 28px/1 'Nunito';color:#fff">Создать токен</div>
  <div class="abs" style="left:20px;top:118px;width:180px;height:42px">${переключательСети(180, 42)}</div>
  ${сПодписью(186, "Логотип")}
  <div class="abs" style="left:20px;top:210px;width:84px;height:84px;border-radius:50%;border:1.5px dashed #30343E;overflow:hidden"><img class="лого" src="assets/coins/jimothy.png" style="width:100%;height:100%;opacity:0"/></div>
  <div class="abs" style="left:116px;top:210px;width:257px;height:84px;border-radius:18px;border:1.5px dashed #30343E;display:flex;align-items:center;justify-content:center;font:400 13px/1 'Onest';color:#97958F">Баннер (необязательно)</div>
  ${сПодписью(318, "Название")}${сПолем(342, "Prism Cat", "имя")}
  ${сПодписью(418, "Тикер")}${сПолем(442, "PRSM", "тикер")}
  ${сПодписью(518, "Описание")}${сПолем(542, "Расскажите о токене", "опис", 96)}
  <div class="кн abs" style="left:20px;top:676px;width:353px;height:58px;border-radius:14px;background:#F2F0EB;overflow:hidden;box-shadow:0 0 30px rgba(188,188,188,.4)">
    <div class="пол abs" style="left:0;top:0;bottom:0;width:0;background:#CECECE"></div>
    <div class="кнт abs" style="inset:0;display:flex;align-items:center;justify-content:center;font:800 18px/1 'Nunito';color:#2A2C31">Запустить токен</div>
  </div>`);
тф1.querySelector(".сг").style.color = "#0B0B0F"; тф1.querySelector(".сс").style.color = "#63625F";
const тф1Имя = буквы(тф1.querySelector(".имя"), "Jimothy"), тф1Тик = буквы(тф1.querySelector(".тикер"), "JIM");
const тф1Пх = [...тф1.querySelectorAll(".ph")];
const тф1Кн = тф1.querySelector(".кн"), тф1Пол = тф1.querySelector(".пол"), тф1Кнт = тф1.querySelector(".кнт"), тф1Лого = тф1.querySelector(".лого");
const пл1 = плашка(0, 800, 820, ["Запускаем…", "Токен запущен"], "$JIM · Gram");
const пл1Палец = палец(0);
function слайдЗапуск(p) {
  появление(тф1, p, "подъём", П_K);
  typeChars(тф1Имя, p, 0.45, 0.8); typeChars(тф1Тик, p, 0.85, 1.0);
  тф1Пх[0].style.display = p >= 0.45 ? "none" : ""; тф1Пх[1].style.display = p >= 0.85 ? "none" : "";
  тф1Лого.style.opacity = smooth(prog(p, 1.0, 1.15));
  const pr = нажатие(пл1Палец, p, ...наЭкране(196, 705), 1.0, 1.32);
  тф1Кн.style.transform = `scale(${(1 - 0.05 * pr).toFixed(3)})`;
  // кнопка сама показывает ход запуска, ровно столько, сколько он длится
  const t = p - ЗАПУСК_ОТ, ход = clamp(t / ЗАПУСК_С), готово = t >= ЗАПУСК_С;
  тф1Пол.style.width = `${(ход * 100).toFixed(2)}%`;
  тф1Пол.style.opacity = готово ? 0 : 0.55;
  тф1Кн.style.background = готово ? "#2EE87A" : "#F2F0EB";
  тф1Кнт.textContent = готово ? "Запущен" : t >= 0 ? "Запускаем…" : "Запустить токен";
  тф1Кнт.style.color = готово ? "#04150B" : "#2A2C31";
  const kp = E.back(prog(p, ЗАПУСК_ОТ, ЗАПУСК_ОТ + 0.4));
  пл1.style.transformOrigin = "0 0";
  S(пл1, { o: smooth(prog(p, ЗАПУСК_ОТ, ЗАПУСК_ОТ + 0.2)), y: (1 - kp) * 40, s: lerp(0.94, 1, kp) * ВИД_K });
  плашкаЖдёт(пл1, t, ЗАПУСК_С);
}

// 2. Gram и Solana в одном месте — виджет мемпада: переключатель сети,
// строка фильтров и токены выбранной сети; цены и проценты живут
const МП_W = 700;
const МП_X = 1040, МП_Y = 190;
const мемпад = виджет(1, МП_X, МП_Y, МП_W, `
  <div style="padding:32px 30px 34px">
    <div class="abs" style="left:30px;top:32px;width:340px;height:76px">${переключательСети(340, 76)}</div>
    <div style="display:flex;gap:26px;padding:104px 4px 24px;font:600 22px/1 'Onest';color:#63625F;white-space:nowrap">
      <span style="color:#F2F0EB">Новые</span><span>Трендовые</span><span>Скоро на бирже</span><span>По обороту</span></div>
    <div class="мпряды" style="position:relative;height:320px;overflow:hidden"></div>
  </div>`);
const бег = мемпад.querySelector(".бег"), сг = мемпад.querySelector(".сг"), сс = мемпад.querySelector(".сс");
const мпРяды = мемпад.querySelector(".мпряды");
// [аватар, имя, цена, знаков после точки, изменение за сутки]
const ряд = ([lg, имя, цена, зн, изм], j) => {
  const e = $(`<div class="abs" style="left:0;right:0;height:96px;display:flex;align-items:center;gap:20px;padding:0 24px;border-radius:24px;background:#14171F;border:1px solid rgba(255,255,255,.06)">
  <img src="assets/coins/${lg}.png" style="width:60px;height:60px;border-radius:50%;flex:none"/>
  <div style="flex:1;min-width:0"><div style="font:800 28px/1.1 'Nunito';color:#fff">${имя}</div><div style="font:500 20px/1.35 'Onest';color:#97958F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Рыночная капитализация</div></div>
  <div style="text-align:right;font-variant-numeric:tabular-nums"><div style="font:800 28px/1.12 'Nunito';color:#fff;display:flex;justify-content:flex-end">$<span class="цн"></span></div>
    <div class="изм" style="font:700 22px/1.12 'Onest';color:#2EE87A;display:flex;justify-content:flex-end"><span class="зн">+</span><span class="пр"></span>%</div></div></div>`);
  e.цена = барабан(e.querySelector(".цн"), 1, зн, "."); e.проц = барабан(e.querySelector(".пр"), 2, 2, ".");
  e.изм = e.querySelector(".изм"); e.зн = e.querySelector(".зн"); e.база = [цена, изм]; e.фаза = j * 1.7 + цена * 3;
  return e;
};
const МП_ТОН = [["gtr", "GTR", 0.23, 3, 12.91], ["ansem", "ANSEM", 0.11, 3, 3.88], ["otc", "OTC", 0.0105, 5, 55.76]].map(ряд);
const МП_СОЛ = [["jimothy", "Jimothy", 0.00310754, 7, 9.85], ["cards", "CARDS", 0.33, 3, 10.04], ["heehaw", "HeeHaw", 0.00037973, 7, 1.88]].map(ряд);
[...МП_ТОН, ...МП_СОЛ].forEach((e) => мпРяды.appendChild(e));
function рядыСети(список, вид, сдвиг, p) {
  // вид: 0 — спрятаны, 1 — на месте; сдвиг ±1 — откуда въезжают
  список.forEach((e, j) => {
    const k = clamp(вид * 1.25 - j * 0.12);
    S(e, { o: smooth(k), x: (1 - smooth(k)) * 120 * сдвиг, y: j * 110, b: (1 - k) * 6 });
    // рынок живёт: цена и процент плавно гуляют вокруг своих значений
    const [ц, и] = e.база, в = тик(p, e.фаза);
    e.цена(ц * (1 + 0.035 * в)); e.проц(Math.abs(и + 2.4 * в));
  });
}
const мпПалец = палец(1);
function слайдСети(p) {
  const q = p / ДЛ;
  появление(мемпад, p, "падение", ВИД_K);
  // палец дважды жмёт переключатель: на SOL и обратно на GRAM
  const k = E.io(prog(q, 0.26, 0.4)) - E.io(prog(q, 0.62, 0.76));
  const цx = МП_X + (30 + lerp(255, 85, smooth(prog(q, 0.42, 0.56)))) * ВИД_K, цy = МП_Y + 50 * ВИД_K;
  const kc = E.out(prog(q, 0.12, 0.24)), pr = clamp(prog(q, 0.24, 0.27) - prog(q, 0.29, 0.33)) + clamp(prog(q, 0.58, 0.61) - prog(q, 0.63, 0.67));
  S(мпПалец, { o: smooth(prog(q, 0.12, 0.17)) * (1 - smooth(prog(q, 0.8, 0.88))), x: lerp(цx + 220, цx, kc) - 14, y: lerp(цy + 380, цy, kc), s: 1 - 0.12 * pr });
  бег.style.transform = `translateX(${(164 * k).toFixed(1)}px)`;
  сг.style.color = k < 0.5 ? "#0B0B0F" : "#63625F"; сс.style.color = k >= 0.5 ? "#0B0B0F" : "#63625F";
  const вход = smooth(prog(q, 0.08, 0.22));
  рядыСети(МП_ТОН, вход * (1 - k), k > 0.5 ? -1 : 1, p);
  рядыСети(МП_СОЛ, k, k > 0.5 ? 1 : -1, p);
}

// 3. Комиссия 0% — виджет сделки: комиссия плавно скатывается с 1% до
// нуля, и сумма к получению докатывается до всей суммы сделки
const стр = (лев, cls, прав, цвет = "#F2F0EB") => `<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 0;border-top:1px solid rgba(255,255,255,.07);font:500 26px/1 'Onest';color:#97958F"><span>${лев}</span><span class="${cls}" style="font:800 30px/1.12 'Nunito';color:${цвет};font-variant-numeric:tabular-nums;display:flex">${прав}</span></div>`;
const ком = виджет(2, 1040, 160, 660, `
  <div style="padding:40px 44px 30px">
    <div style="display:flex;align-items:center;gap:16px;font:600 26px/1 'Onest';color:#97958F"><img src="assets/coins/jimothy.png" style="width:40px;height:40px;border-radius:50%"/>Продажа $JIM</div>
    <div style="display:flex;align-items:baseline;gap:22px;margin:26px 0 8px">
      <span class="кпроц" style="font:800 150px/1.12 'Nunito';color:#fff;letter-spacing:-.03em;font-variant-numeric:tabular-nums;display:flex"><span class="кц"></span>%</span>
      <span style="font:600 26px/1.3 'Onest';color:#63625F">комиссия<br>Mintly</span></div>
    <div class="кдр" style="font:500 22px/1 'Onest';color:#63625F;margin-bottom:26px">на других площадках — <span style="text-decoration:line-through">1%</span></div>
    ${стр("Сумма сделки", "", "100,00 GRAM")}
    ${стр("Комиссия", "ксум", `<span class="кс"></span>&nbsp;GRAM`, "#FF5A63")}
    ${стр("Вы получите", "кпол", `<span class="кп"></span>&nbsp;GRAM`, "#2EE87A")}
  </div>`);
const кПроц = ком.querySelector(".кпроц"), кСум = ком.querySelector(".ксум"), кДр = ком.querySelector(".кдр");
// «1,0%» катится к «0,0%», а на нуле запятая с десятыми схлопываются — остаётся «0%»
const кПр = барабан(ком.querySelector(".кц"), 1, 1);
const кХвост = [ком.querySelector(".кц .рз"), ...[...ком.querySelectorAll(".кц .бк")].slice(-1)];
const кСумБ = барабан(ком.querySelector(".кс"), 1, 2), кПолБ = барабан(ком.querySelector(".кп"), 3, 2);
function слайдКомиссия(p) {
  const q = p / ДЛ;
  появление(ком, p, "переворот", ВИД_K);
  const k = E.io(prog(q, 0.3, 0.7)), ноль = k >= 1;
  const v = 1 - k; // комиссия, %
  кПр(v);
  const сх = smooth(prog(q, 0.72, 0.84));
  кХвост.forEach((e, j) => { e.style.overflow = "hidden"; e.style.width = `${((1 - сх) * (j ? 0.6 : 0.28)).toFixed(3)}em`; e.style.opacity = 1 - сх; });
  // на нуле цифра коротко вспыхивает — тут вся мысль слайда
  const всп = Math.sin(Math.PI * prog(q, 0.7, 0.9));
  кПроц.style.transform = `scale(${(1 + 0.08 * всп).toFixed(3)})`; кПроц.style.transformOrigin = "0 70%";
  кПроц.style.color = ноль ? "#2EE87A" : "#fff";
  кПроц.style.textShadow = всп > 0.01 ? `0 0 ${(50 * всп).toFixed(0)}px rgba(46,232,122,${(0.7 * всп).toFixed(2)})` : "none";
  кСумБ(v); кСум.style.color = ноль ? "#2EE87A" : "#FF5A63";
  кПолБ(99 + k);
  кДр.style.opacity = smooth(prog(q, 0.6, 0.75));
}

// 4. Покупка за секунду — телефон со страницей токена: палец жмёт
// «Купить», и плашка честно ждёт 0,9 с сделки
const ПОКУПКА_С = 0.9, ПОКУПКА_ОТ = 1.3;
const тф4 = телефон(3, `
  <div class="abs" style="left:20px;top:70px;display:flex;align-items:center;gap:16px">
    <img src="assets/coins/jimothy.png" style="width:72px;height:72px;border-radius:50%"/>
    <div><div style="font:800 28px/1 'Nunito';color:#fff">Jimothy</div><div style="font:500 16px/1.5 'Onest';color:#97958F">$JIM · Gram</div></div></div>
  <div class="abs" style="left:20px;top:168px;font:800 44px/1.12 'Nunito';color:#F2F0EB;display:flex;font-variant-numeric:tabular-nums">$<span class="цн"></span></div>
  <div class="abs" style="left:20px;top:222px;font:700 18px/1.12 'Onest';color:#2EE87A;display:flex">+<span class="пр"></span>%</div>
  <svg class="abs" style="left:20px;top:258px" width="353" height="150" viewBox="0 0 353 150" fill="none">
    <defs><linearGradient id="тф4г" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2EE87A" stop-opacity=".3"/><stop offset="1" stop-color="#2EE87A" stop-opacity="0"/></linearGradient></defs>
    <path class="зал" d="M0 128 L30 120 L60 124 L90 104 L120 110 L150 86 L180 94 L210 72 L240 80 L270 54 L300 62 L330 34 L353 22 L353 150 L0 150Z" fill="url(#тф4г)"/>
    <path class="лин" d="M0 128 L30 120 L60 124 L90 104 L120 110 L150 86 L180 94 L210 72 L240 80 L270 54 L300 62 L330 34 L353 22" stroke="#2EE87A" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1"/>
  </svg>
  <div class="abs" style="left:12px;right:12px;top:430px;bottom:12px;border-radius:40px;background:#14171F">
    <div class="abs" style="left:20px;top:24px;font:800 22px/1 'Nunito';color:#F2F0EB">Купить $JIM</div>
    <div class="abs" style="left:20px;top:66px;font:500 14px/1 'Onest';color:#97958F">Сумма</div>
    <div class="abs" style="left:20px;top:88px;font:800 48px/1 'Nunito';color:#F2F0EB">0.5 <span style="color:#97958F;font-size:28px">GRAM</span></div>
    <div class="abs" style="left:20px;top:154px;display:flex;gap:8px">
      ${["0.1", "0.5", "1", "MAX"].map((v) => `<span style="padding:9px 16px;border-radius:999px;background:${v === "0.5" ? "#F2F0EB" : "#1F2430"};color:${v === "0.5" ? "#14151A" : "#F2F0EB"};font:700 14px/1 'Onest'">${v}</span>`).join("")}</div>
    <div class="abs" style="left:20px;top:204px;font:500 14px/1.3 'Onest';color:#97958F">Получите ≈ <span style="color:#F2F0EB">48 200 JIM</span></div>
    <div class="кн abs" style="left:20px;right:20px;top:250px;height:62px;border-radius:16px;background:#00E96B;display:flex;align-items:center;justify-content:center;font:800 20px/1 'Nunito';color:#04150B">Купить</div>
  </div>`);
const тф4Лин = тф4.querySelector(".лин"), тф4Зал = тф4.querySelector(".зал"), тф4Кн = тф4.querySelector(".кн");
const тф4Цена = барабан(тф4.querySelector(".цн"), 1, 5, "."), тф4Проц = барабан(тф4.querySelector(".пр"), 1, 2, ".");
const пл4 = плашка(3, 800, 190, ["Покупаем…", "Куплено"], "48 200 JIM · комиссия 0%");
const пл4Палец = палец(3);
function слайдПокупка(p) {
  появление(тф4, p, "поворот", П_K);
  const кл = E.out(prog(p, 0.25, 1.0));
  тф4Лин.style.strokeDashoffset = (1 - кл).toFixed(4); тф4Зал.style.opacity = кл;
  const в = тик(p, 0.3, 0.6);
  тф4Цена(0.00310754 * (1 + 0.02 * в)); тф4Проц(9.85 + 0.9 * в);
  const pr = нажатие(пл4Палец, p, ...наЭкране(196, 430 + 281), 0.8, 1.12);
  тф4Кн.style.transform = `scale(${(1 - 0.05 * pr).toFixed(3)})`;
  тф4Кн.style.boxShadow = `0 0 ${(40 * pr).toFixed(0)}px rgba(46,232,122,${(0.7 * pr).toFixed(2)})`;
  const кп = E.back(prog(p, ПОКУПКА_ОТ, ПОКУПКА_ОТ + 0.35));
  пл4.style.transformOrigin = "0 0";
  S(пл4, { o: smooth(prog(p, ПОКУПКА_ОТ, ПОКУПКА_ОТ + 0.15)), y: (1 - кп) * -40, s: lerp(0.94, 1, кп) * ВИД_K });
  плашкаЖдёт(пл4, p - ПОКУПКА_ОТ, ПОКУПКА_С);
}

// 5. Прямо в Telegram — телефон с чатом бота: палец жмёт «Открыть Mintly»,
// и приложение поднимается прямо поверх чата
const тф5 = телефон(4, `
  <div class="abs" style="left:0;right:0;top:0;bottom:0;background:#181818"></div>
  <div class="abs" style="left:0;right:0;top:0;height:120px;background:#212121;border-bottom:1px solid rgba(0,0,0,.4)"></div>
  <div class="abs" style="left:20px;top:20px;font:700 17px/1 'Onest';color:#F2F0EB">9:41</div>
  <div class="abs" style="left:18px;top:62px;font:400 34px/1 'Onest';color:#AEAEAE">‹</div>
  <div class="abs" style="left:56px;top:58px;width:48px;height:48px;border-radius:50%;background:#0F0F13;display:flex;align-items:center;justify-content:center">${star(30, "#E4E2DC")}</div>
  <div class="abs" style="left:116px;top:62px"><div style="font:700 19px/1.1 'Onest';color:#fff">Mintly</div><div style="font:400 15px/1.5 'Onest';color:#929292">бот</div></div>
  <div class="сооб abs" style="left:14px;top:168px;width:300px;border-radius:20px 20px 20px 6px;background:#262626;padding:16px 18px;font:400 18px/1.4 'Onest';color:#F2F0EB">Запускай и покупай мемкоины прямо здесь — Gram и Solana в одном приложении.<div style="text-align:right;font-size:13px;color:#7E7E7E;margin-top:4px">9:41</div></div>
  <div class="ткн abs" style="left:14px;top:330px;width:300px;height:52px;border-radius:14px;background:#525252;display:flex;align-items:center;justify-content:center;font:600 18px/1 'Onest';color:#fff">Открыть Mintly</div>
  <div class="abs" style="left:0;right:0;bottom:0;height:92px;background:#212121;display:flex;align-items:flex-start;gap:12px;padding:14px 14px 0">
    <div style="height:44px;padding:0 16px;border-radius:12px;background:#525252;display:flex;align-items:center;font:600 16px/1 'Onest';color:#fff">Открыть</div>
    <div style="flex:1;height:44px;border-radius:22px;background:#181818;display:flex;align-items:center;padding:0 16px;font:400 17px/1 'Onest';color:#7E7E7E">Сообщение</div></div>
  <div class="лист abs" style="left:0;right:0;top:70px;bottom:0;border-radius:28px 28px 0 0;background:#0B0D12;box-shadow:0 -20px 60px rgba(0,0,0,.6)">
    <div class="лвр abs" style="left:34px;top:20px;font:700 17px/1 'Onest';color:#F2F0EB;opacity:0">9:41</div>
    <div class="лшап abs" style="left:0;right:0;top:0;height:56px;display:flex;align-items:center;justify-content:center;font:700 17px/1 'Onest';color:#F2F0EB">Mintly <span style="color:#63625F;font-weight:500;margin-left:6px">мини-приложение</span></div>
    <div class="знак abs" style="left:126px;top:280px">${star(140, "#E4E2DC")}</div>
    <div class="имяп abs" style="left:0;right:0;top:450px;text-align:center;font:800 44px/1 'Nunito';color:#fff">Mintly</div>
  </div>`);
const тф5Врм = тф5.querySelector(".лвр"), тф5Шап = тф5.querySelector(".лшап");
const тф5Соо = тф5.querySelector(".сооб"), тф5Ткн = тф5.querySelector(".ткн"), тф5Лист = тф5.querySelector(".лист"), тф5Знак = тф5.querySelector(".знак"), тф5Имя = тф5.querySelector(".имяп");
const тф5Палец = палец(4);
function слайдТелеграм(p) {
  const q = p / ДЛ;
  появление(тф5, p, "приближение", П_K);
  // сообщение бота приходит, под ним — кнопка
  const kс = E.back(prog(q, 0.14, 0.26)), kк = E.back(prog(q, 0.22, 0.34));
  S(тф5Соо, { o: smooth(prog(q, 0.14, 0.2)), y: (1 - kс) * 24, s: lerp(0.92, 1, kс) });
  S(тф5Ткн, { o: smooth(prog(q, 0.22, 0.28)), y: (1 - kк) * 24 });
  тф5Соо.style.transformOrigin = "0 100%";
  const pr = нажатие(тф5Палец, p, ...наЭкране(164, 356), 0.8, 1.05);
  тф5Ткн.style.transform += ` scale(${(1 - 0.05 * pr).toFixed(3)})`;
  // мини-приложение выезжает снизу поверх чата
  const kл = E.out5(prog(q, 0.52, 0.7));
  S(тф5Лист, { o: q >= 0.52 ? 1 : 0, y: (1 - kл) * 800 });
  // и раскрывается на весь экран: шторка доходит до верха, углы выпрямляются,
  // шапка уходит под строку состояния
  const kф = E.io(prog(q, 0.68, 0.8));
  тф5Лист.style.top = `${lerp(70, 0, kф).toFixed(1)}px`;
  тф5Лист.style.borderRadius = `${lerp(28, 0, kф).toFixed(1)}px ${lerp(28, 0, kф).toFixed(1)}px 0 0`;
  тф5Шап.style.top = `${lerp(0, 52, kф).toFixed(1)}px`;
  тф5Врм.style.opacity = kф;
  const kз = E.back(prog(q, 0.64, 0.8));
  S(тф5Знак, { o: smooth(prog(q, 0.64, 0.72)), s: lerp(0.6, 1, kз), r: lerp(-90, 0, kз) });
  S(тф5Имя, { o: smooth(prog(q, 0.72, 0.82)), y: (1 - E.out(prog(q, 0.72, 0.86))) * 20 });
}

const СЛАЙД_ДВИЖ = [слайдЗапуск, слайдСети, слайдКомиссия, слайдПокупка, слайдТелеграм];
function drawDeco(i, p) {
  const жизнь = smooth(prog(p, 0, 0.3)) * (1 - smooth(prog(p, ДЛИ[i] - 0.35, ДЛИ[i])));
  ВСЕ_СЛАЙДЫ[i].deco.style.opacity = жизнь;
  СЛАЙД_ДВИЖ[i](p);
}

function drawSlides(р) {
  ВСЕ_СЛАЙДЫ.forEach((el) => { el.box.style.display = el === р.el ? "flex" : "none"; });
  // интерфейс растворяется на входе в блок слайдов и проявляется на выходе,
  // между слайдами не мигает
  const вход = р.блок >= 0 ? smooth(prog(р.блок, 0, 0.28)) * (1 - smooth(prog(р.блок, С_ДЛ + В_ДЛ - 0.28, С_ДЛ + В_ДЛ))) : 0;
  ui.style.opacity = 1 - вход;
  ui.style.filter = вход > 0.01 ? `blur(${(вход * 14).toFixed(1)}px)` : "none";
  ui.style.transform = `scale(${(1 + 0.04 * вход).toFixed(4)})`;
  if (!р.el) return;
  drawDeco(ВСЕ_СЛАЙДЫ.indexOf(р.el), р.p);
  const дл = ДЛИ[ВСЕ_СЛАЙДЫ.indexOf(р.el)];
  const out = smooth(prog(р.p, дл - 0.32, дл - 0.04));
  р.el.style.transform = `scale(${(1.03 - 0.03 * smooth(prog(р.p, 0, дл))).toFixed(4)})`;
  р.el.style.transformOrigin = "0 50%";
  р.el.spans.forEach((w, i) => {
    const k = E.out(prog(р.p, 0.16 + i * 0.08, 0.16 + i * 0.08 + 0.5));
    S(w, { o: k * (1 - out), y: (1 - k) * 34 - out * 14, b: (1 - k) * 12 + out * 8 });
  });
}

// ===================== ВСТАВКА ПО ВТОРОМУ РЕФЕРЕНСУ =====================
// Приёмы из второго референса, переложенные на Mintly и тёмный фон:
// карточка токена опускается на светящуюся платформу → она же
// превращается в карточку с цифрой, через кадр проходит синяя дуга →
// фраза по словам, наклоняется и улетает, на её место — вторая →
// «Всегда.» становится плашкой, на неё сверху ложатся ещё две →
// синий экран с именем в белой плашке.
// [где во внутреннем времени вставки встать, на сколько] — пока стоим,
// фразу дочитывают; фон и покачивание при этом живут дальше
const В_ПАУЗЫ = [[1.4, 1.665], [3.1, 1.063], [4.5, 1.154], [5.05, 0.333], [6.05, 0.811], [6.9, 0.683]]; // конец каждой паузы — на удар
const В_ДЛ = 7.1 + В_ПАУЗЫ.reduce((a, [, d]) => a + d, 0);
function вВнутр(v) {
  for (const [т, d] of В_ПАУЗЫ) { if (v < т) return v; if (v < т + d) return т; v -= d; }
  return v;
}
const vb = $(`<div class="scene"></div>`);
const словаВ = (html, size, extra = "") => {
  const e = $(`<div class="abs" style="left:0;width:${W}px;text-align:center;font:800 ${size}px/1.15 'Nunito';letter-spacing:-.01em;color:#fff;white-space:nowrap;${extra}">${html}</div>`);
  e.innerHTML = e.innerHTML.replace(/(<br>)|([^\s<]+)/g, (m, br) => br ? br : `<span class="w" style="display:inline-block;margin:0 .13em">${m}</span>`);
  e.spans = [...e.querySelectorAll(".w")];
  e.spans.forEach((sp) => { if (sp.textContent.startsWith("*")) { sp.textContent = sp.textContent.slice(1); sp.style.color = "#ACACAC"; } });
  vb.appendChild(e);
  return e;
};
// слова проявляются по одному: из размытия, снизу вверх
function поСловам(e, v, a, шаг, длит = 0.4) {
  e.spans.forEach((w, i) => { const k = E.out(prog(v, a + i * шаг, a + i * шаг + длит)); S(w, { o: k, y: (1 - k) * 26, b: (1 - k) * 10 }); });
}
// --- платформа: три слоя в перспективе, верхний со светящейся кромкой
const луч = $(`<div class="abs" style="left:560px;top:-120px;width:800px;height:620px;background:radial-gradient(closest-side,rgba(255,80,160,.5),rgba(255,140,70,.12) 55%,rgba(255,140,70,0))"></div>`); vb.appendChild(луч);
const платф = $(`<div class="abs" style="left:0;top:0;width:${W}px;height:${H}px;perspective:1300px;perspective-origin:960px 300px">
  <div class="пл abs" style="left:560px;top:520px;width:800px;height:480px;transform-style:preserve-3d;transform:rotateX(64deg)">
    <div class="abs" style="inset:-90px;border-radius:120px;background:radial-gradient(closest-side,rgba(255,70,150,.75),rgba(255,120,60,0));filter:blur(30px)"></div>
    <div class="abs" style="inset:0;border-radius:70px;background:linear-gradient(180deg,#7A1550,#3A0A2A);box-shadow:0 0 0 2px rgba(255,120,180,.5)"></div>
    <div class="абр abs" style="inset:70px;border-radius:52px;background:linear-gradient(180deg,#FF4FA3,#C2185B);box-shadow:0 0 0 4px rgba(255,236,245,.95),0 0 40px rgba(255,140,200,.95),0 0 120px rgba(255,80,160,.8),inset 0 0 80px rgba(255,200,150,.45)"></div>
  </div>
</div>`); vb.appendChild(платф);
const абр = платф.querySelector(".абр");
const текстКарты = словаВ("Доведи токен до *DEX —<br>получи *лимитированную *карту", 60);
// --- карточка токена
const карта = $(`<div class="abs" style="left:0;top:0;transform-origin:50% 50%">
  <div class="кфон abs" style="inset:0;background:linear-gradient(125deg,#FF3CAC 0%,#FF6B6B 38%,#FF9F43 68%,#FFD93D 100%);box-shadow:inset 0 2px 0 rgba(255,255,255,.5),0 0 60px rgba(255,90,150,.55),0 40px 90px rgba(0,0,0,.55)"></div>
  <div class="ктк abs" style="inset:0">
    <img src="assets/coins/jimothy.png" style="position:absolute;left:40px;top:40px;width:84px;height:84px;border-radius:50%;box-shadow:0 0 0 3px rgba(255,255,255,.35)"/>
    <div style="position:absolute;left:40px;bottom:40px"><div style="font:800 54px/1 'Nunito';color:#fff">$JIM</div><div style="font:600 24px/1.5 'Onest';color:rgba(255,255,255,.75)">Jimothy</div></div>
    <img src="assets/app/gram.png" style="position:absolute;right:40px;bottom:44px;width:64px;height:64px"/>
    <div style="position:absolute;right:40px;top:40px;text-align:right"><div style="font:800 28px/1 'Nunito';color:rgba(255,255,255,.85)">Mintly</div><div style="margin-top:10px;padding:7px 14px;border-radius:999px;background:rgba(255,255,255,.18);font:700 17px/1 'Onest';color:#fff;letter-spacing:.06em">LIMITED · DEX</div></div>
  </div>
</div>`); vb.appendChild(карта);
// --- синие дуги через кадр: светящийся отрезок бежит по кривой
const дуги = $(`<svg class="abs" style="left:0;top:0;overflow:visible;filter:drop-shadow(0 0 10px rgba(167,167,167,.8))" width="${W}" height="${H}">
  <path class="д1" d="M-200 420 C 300 130, 760 120, 1060 360 S 1520 980, 2100 640" fill="none" stroke="#9F9F9F" stroke-width="12" stroke-linecap="round" pathLength="1"/>
  <path class="д2" d="M2100 900 C 1500 1000, 1300 560, 1000 380 S 420 60, -200 300" fill="none" stroke="#9F9F9F" stroke-width="10" stroke-linecap="round" pathLength="1"/>
</svg>`); vb.appendChild(дуги);
const д1 = дуги.querySelector(".д1"), д2 = дуги.querySelector(".д2");
function дуга(e, k) {
  // отрезок длиной в треть кривой: входит с одного края и уходит за другой
  const L = 0.38;
  e.style.strokeDasharray = `${L} 2`; e.style.strokeDashoffset = (L - k * (1 + L)).toFixed(4);
  e.style.opacity = k > 0 && k < 1 ? 1 : 0;
}
const фразаА = словаВ("Почувствуй лёгкость *мемкоинов.", 76);
const фразаБ = словаВ("С *Mintly твои токены — *в *Telegram.", 76);
// --- плашки: «Всегда.» → «Запускай», сверху ложатся «Покупай» и «Продавай»
const ПЛ_W = 460, ПЛ_H = 118;
const плашкаВ = (txt, фон) => { const e = $(`<div class="abs" style="left:${W / 2 - ПЛ_W / 2}px;top:${H / 2 - ПЛ_H / 2}px;width:${ПЛ_W}px;height:${ПЛ_H}px;border-radius:26px;background:${фон};display:flex;align-items:center;justify-content:center;font:800 56px/1 'Nunito';color:#fff;box-shadow:inset 0 2px 0 rgba(255,255,255,.25),0 24px 60px rgba(0,0,0,.5);transform-origin:50% 100%;backface-visibility:hidden">${txt}</div>`); vb.appendChild(e); return e; };
const стопка = $(`<div class="abs" style="left:0;top:0;width:${W}px;height:${H}px;perspective:1100px;perspective-origin:960px 540px"></div>`); vb.appendChild(стопка);
const пл3 = плашкаВ("Продавай", "linear-gradient(180deg,#383838,#565656)");
const пл2 = плашкаВ("Покупай", "linear-gradient(180deg,#494949,#777777)");
const пл1В = плашкаВ("", "linear-gradient(180deg,#878787,#9F9F9F)");
[пл3, пл2].forEach((e) => стопка.appendChild(e)); стопка.appendChild(пл1В);
const всегда = словаВ("Всегда.", 76);
const запускай = $(`<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">Запускай</span>`); пл1В.appendChild(запускай);
// --- синий экран с именем в белой плашке
const синий = $(`<div class="abs" style="inset:0;background:linear-gradient(180deg,#FFFFFF 0%,#E9E9E9 55%,#D2D2D2 100%)"></div>`); vb.appendChild(синий);
const имяПл = $(`<div class="abs" style="left:${W / 2 - 220}px;top:${H / 2 - 64}px;width:440px;height:128px;border-radius:30px;background:#0F0F13;box-shadow:0 30px 80px rgba(0,0,0,.35)"></div>`); vb.appendChild(имяПл);
const имяВ = $(`<div class="abs" style="left:0;width:${W}px;top:${H / 2 - 42}px;text-align:center;font:800 76px/1.1 'Nunito';letter-spacing:-.01em">Mintly</div>`); vb.appendChild(имяВ);

function drawV(v) {
  const on = v >= 0 && v < В_ДЛ; show(vb, on); if (!on) return;
  // весь блок проявляется из слайдов и в конце уходит в знак
  const вх = smooth(prog(v, 0, 0.3)), вых = smooth(prog(v, В_ДЛ - 0.3, В_ДЛ));
  vb.style.opacity = вх * (1 - вых);
  const ж = v; v = вВнутр(v);
  // 1. платформа и карточка токена
  const kP = smooth(prog(v, 0.05, 0.5)) * (1 - smooth(prog(v, 1.9, 2.25)));
  платф.style.opacity = kP; луч.style.opacity = kP * (0.85 + 0.15 * Math.sin(ж * 5));
  платф.firstElementChild.style.transform = `translateY(${(140 * smooth(prog(v, 1.9, 2.25))).toFixed(1)}px) rotateX(64deg)`;
  абр.style.filter = `brightness(${(1 + 0.25 * Math.sin(ж * 4)).toFixed(3)})`;
  поСловам(текстКарты, v, 0.2, 0.09, 0.4);
  S(текстКарты, { o: 1 - smooth(prog(v, 1.85, 2.1)), y: 90 - 30 * smooth(prog(v, 1.85, 2.1)) });
  // карточка опускается на платформу, покачивается и уходит влево вместе с дугой
  const kD = E.out(prog(v, 0.1, 1.0));
  const cw = 600, ch = 370;
  карта.style.width = cw + "px"; карта.style.height = ch + "px";
  карта.querySelector(".кфон").style.borderRadius = "34px";
  const кач = Math.sin(ж * 2.2);
  const cy = lerp(-480, 500, kD) + кач * 10 - ch / 2;
  const kL = E.io(prog(v, 1.85, 2.3));
  const cx = W / 2 - cw / 2 - 1300 * kL;
  карта.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0) perspective(1400px) rotateX(26deg) rotateZ(${(-5 + кач * 1.5 - 6 * kL).toFixed(2)}deg)`;
  карта.style.opacity = smooth(prog(v, 0.1, 0.35)) * (1 - smooth(prog(v, 2.1, 2.3)));
  карта.style.filter = kL > 0.01 ? `blur(${(kL * 14).toFixed(1)}px)` : "none";
  // дальше всё идёт на 1,3 с раньше: сцены с цифрой больше нет
  const u = v + 1.3;
  // 2. дуги
  дуга(д1, E.io(prog(u, 2.75, 3.75)));
  дуга(д2, E.io(prog(u, 4.45, 5.4)));
  // 3. фраза А по словам, наклоняется и улетает вниз вправо; за ней фраза Б
  поСловам(фразаА, u, 3.6, 0.16);
  const kA = E.io(prog(u, 4.75, 5.35));
  фразаА.style.opacity = 1 - smooth(prog(u, 5.05, 5.35));
  фразаА.style.transform = `translate3d(${(520 * kA).toFixed(1)}px,${(500 + 380 * kA).toFixed(1)}px,0) rotate(${(-8 * kA).toFixed(2)}deg) scale(${(1 + 0.9 * kA).toFixed(3)})`;
  фразаА.style.filter = kA > 0.01 ? `blur(${(kA * 12).toFixed(1)}px)` : "none";
  поСловам(фразаБ, u, 4.95, 0.07, 0.32);
  const kБ = smooth(prog(u, 5.8, 6.05));
  S(фразаБ, { o: 1 - kБ, y: 470 - 30 * kБ, b: kБ * 10 });
  // 4. «Всегда.» → плашка «Запускай» → стопка
  поСловам(всегда, u, 6.0, 0, 0.3);
  const kПл = E.back(prog(u, 6.4, 6.65));
  S(всегда, { o: 1 - smooth(prog(u, 6.45, 6.6)), y: H / 2 - 44 });
  S(пл1В, { o: smooth(prog(u, 6.4, 6.5)), s: lerp(0.3, 1, kПл) });
  запускай.style.opacity = smooth(prog(u, 6.5, 6.65));
  const лечь = (e, a, ур) => {
    const k = E.out(prog(u, a, a + 0.32));
    e.style.opacity = smooth(prog(u, a, a + 0.08));
    e.style.transform = `translateY(${(-ур * 92 * k).toFixed(1)}px) rotateX(${lerp(-100, 14, k).toFixed(2)}deg) scale(${lerp(0.96, 0.98 - ур * 0.02, k).toFixed(3)})`;
  };
  лечь(пл2, 6.75, 1); лечь(пл3, 7.0, 2);
  // 5. синий экран раскрывается кругом из плашки; на нём — имя
  const kС = E.io(prog(u, 7.35, 7.7));
  синий.style.clipPath = `circle(${(kС * 1200).toFixed(1)}px at 960px 540px)`;
  синий.style.opacity = u >= 7.35 ? 1 : 0;
  const kИ = E.back(prog(u, 7.55, 7.8)), kСх = E.io(prog(u, 7.95, 8.15));
  const iw = lerp(440, 300, kСх);
  имяПл.style.width = iw + "px"; имяПл.style.left = W / 2 - iw / 2 + "px";
  S(имяПл, { o: smooth(prog(u, 7.55, 7.62)) * (1 - kСх), s: lerp(0.5, 1, kИ) });
  S(имяВ, { o: smooth(prog(u, 7.6, 7.72)), s: lerp(0.6, 1, kИ) });
  имяВ.style.color = kСх > 0.5 ? "#0F0F13" : "#FFFFFF";
}

// ===================== 5. ЗНАК И «СДЕЛАНО В MINTLY.» =====================
const s5 = $(`<div class="scene"></div>`); root.appendChild(s5);
const logo5 = $(`<div class="abs" style="left:0;top:0;width:128px;height:128px;filter:drop-shadow(0 0 16px rgba(222,222,222,.85)) drop-shadow(0 0 40px rgba(167,167,167,.45))">${star(128, "#F4F6FF")}</div>`); s5.appendChild(logo5);
const LINE = "Сделано в Mintly.";
const line5 = $(`<div class="abs" style="left:0;top:0;font:800 70px/1 'Nunito';letter-spacing:-.01em;color:#fff;white-space:nowrap;text-shadow:0 0 16px rgba(222,222,222,.45)">${[...LINE].map((c, i) => `<span class="ch" style="position:absolute;left:0;top:0;color:${i >= 10 ? "#BFBFBF" : "#fff"}">${c === " " ? " " : c}</span>`).join("")}</div>`); s5.appendChild(line5);
const lineChars = [...line5.children];
let charX = [], lineW = 0;
function layoutLine() {
  const m = document.createElement("span"); m.style.cssText = "font:800 70px/1 'Nunito';letter-spacing:-.01em;position:absolute;visibility:hidden;white-space:pre"; document.body.appendChild(m);
  charX = []; let acc = 0;
  for (let i = 0; i < LINE.length; i++) { m.textContent = LINE.slice(0, i); charX.push(m.getBoundingClientRect().width); }
  m.textContent = LINE; lineW = m.getBoundingClientRect().width; m.remove();
}
// путь: прямая строки, за правым краем загибается вниз по дуге и уходит отвесно
function onPath(u, L, R) {
  if (u <= L) return [u, 0, 0];
  const d = u - L, q = (Math.PI / 2) * R;
  if (d <= q) { const th = d / R; return [L + R * Math.sin(th), R * (1 - Math.cos(th)), th * 180 / Math.PI]; }
  return [L + R, R + (d - q), 90];
}
function drawS5(t) {
  const on = t >= 10.0; show(s5, on); if (!on) return;
  const fade = 1 - smooth(prog(t, 11.4, 11.72));
  const rise = E.io(prog(t, 10.1, 11.6));
  const ly = lerp(380, 330, rise);
  const kL = E.out(prog(t, 10.05, 10.45));
  S(logo5, { o: kL * fade, x: W / 2 - 64, y: ly, s: lerp(0.7, 1, kL), b: (1 - kL) * 10 });
  const x0 = W / 2 - lineW / 2, y0 = ly + 188;
  const L = lineW, R = 200;
  const slide = lerp(lineW + 900, 0, E.out5(prog(t, 10.3, 11.18)));
  S(line5, { o: fade, x: x0, y: y0 });
  lineChars.forEach((ch, i) => {
    const [px, py, rot] = onPath(charX[i] + slide, L, R);
    ch.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) rotate(${rot.toFixed(1)}deg)`;
    ch.style.transformOrigin = "0 70%";
    ch.style.opacity = py > 700 ? 0 : 1;
  });
}

// интерфейс — в своём слое, чтобы на слайдах растворять его целиком
[silkWrap, s1, s2, s3, s4, s5].forEach((e) => ui.appendChild(e));
root.appendChild(ui); root.appendChild(slides); root.appendChild(vb);
window.renderAt = (T) => {
  const р = разложить(T), t = р.t;
  drawBG(t, T); shimmer(T); drawSilk(t); drawS1(t); drawS2(t); drawS3(t); drawS4(t); drawS5(t);
  drawSlides(р); drawV(р.v ?? -1);
};
(async () => {
  await document.fonts.ready;
  await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
  layoutChips(); layoutLine();
  window.renderAt(0);
  window.ready = true;
})();
