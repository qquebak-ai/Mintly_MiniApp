// Mintly · «Сделано в Mintly» — 16:9, 17 с, покадрово по схеме референса:
// знак со словом на шёлковом свечении → слово в плашку → чипы разделов →
// курсор жмёт «Запуск» → запрос печатается крупно и ложится в поле ввода →
// пролёт сквозь код контракта → карточка токена в 3D → новый запрос →
// карточка перекрашивается → знак и надпись, буквы въезжают по дуге →
// концовка: знак, имя и строка поиска с ботом.
// Кадр зависит только от t — renderAt(t) можно звать в любом порядке.
"use strict";
const W = 1920, H = 1080, DUR = 17;
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
const СИНИЙ = "#4F86FF";

// ===================== ФОН ПЕРВОГО ПРОМО =====================
// чёрный, по нему медленно плывут и дышат синие пятна, снизу голубой туман
const BG = $(`<div class="scene" style="background:#000"></div>`); root.appendChild(BG);
const bgGrad = $(`<div class="abs" style="inset:-20%;background:linear-gradient(120deg,#000 0%,#06163D 18%,#000 34%,#0B2C70 52%,#000 68%,#081E52 84%,#000 100%);background-size:300% 300%"></div>`); BG.appendChild(bgGrad);
const bgBlobs = [[300, 230, 420, "#123E9C"], [1650, 220, 380, "#0E3480"], [960, 1100, 540, "#1450B8"], [1520, 900, 360, "#0B2F73"], [380, 930, 380, "#103A8C"], [960, 380, 300, "#0A2560"]]
  .map(([x, y, r, c]) => { const b = $(`<div class="blob" style="left:${x - r}px;top:${y - r}px;width:${r * 2}px;height:${r * 2}px;background:${c};opacity:.55"></div>`); BG.appendChild(b); return b; });
const bgFog = $(`<div class="fog"></div>`); BG.appendChild(bgFog);
bgFog.parts = [[-2, 170, 520, "#0D3277"], [14, 120, 420, "#0A2862"], [30, 180, 560, "#123E95"], [47, 110, 460, "#0A2A66"], [63, 170, 540, "#103889"], [80, 120, 440, "#0B2C6C"], [96, 170, 520, "#123B8E"]]
  .map(([x, y, w, c]) => { const sp = $(`<span style="left:${x}%;top:${y}px;width:${w}px;height:${w * 0.55}px;background:${c};opacity:.45"></span>`); bgFog.appendChild(sp); return sp; });
function drawBG(t) {
  // в «тёмных» сценах референса фон приглушён, но не пропадает
  // в «тёмных» сценах фон приглушается плавно, а не щелчком
  BG.style.opacity = keys(t, [[0, 1], [2.4, 1], [2.85, 0.45], [3.45, 0.45], [3.85, 1], [9.85, 1], [10.25, 0.45], [12.7, 0.45], [13.15, 1]])[0];
  bgGrad.style.backgroundPosition = `${(50 + 50 * Math.sin(t * 0.21)).toFixed(2)}% ${(50 + 50 * Math.cos(t * 0.17)).toFixed(2)}%`;
  bgGrad.style.transform = `rotate(${(Math.sin(t * 0.09) * 8).toFixed(2)}deg)`;
  bgBlobs.forEach((b, i) => {
    b.style.transform = `translate(${(Math.sin(t * 0.33 + i * 2) * 160).toFixed(1)}px,${(Math.cos(t * 0.27 + i * 1.3) * 90).toFixed(1)}px) scale(${(1 + 0.18 * Math.sin(t * 0.5 + i)).toFixed(3)})`;
    b.style.opacity = (0.42 + 0.18 * Math.sin(t * 0.6 + i * 1.7)).toFixed(3);
  });
  bgFog.parts.forEach((p, i) => { p.style.transform = `translate(${Math.sin(t * 0.5 + i) * 40}px,${Math.cos(t * 0.4 + i * 1.7) * 18}px)`; });
}
// переливы цветами фона по заголовкам, как в первом промо
function shimmer(t) { document.querySelectorAll(".grad").forEach((e) => { e.style.backgroundPosition = `${(-t * 260) % 1800}px 0`; }); }

// ===================== ШЁЛК =====================
// Свечение из трёх размытых лент: синий край, ледяная середина, белое ядро.
const silk = $(`<svg class="abs" style="left:0;top:0" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sg1" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#06163D"/><stop offset=".4" stop-color="#1450B8"/><stop offset=".62" stop-color="#5A8CFF"/><stop offset=".8" stop-color="#123E9C"/><stop offset="1" stop-color="#0B2C70"/></linearGradient>
    <linearGradient id="sg2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3F78FF" stop-opacity="0"/><stop offset=".5" stop-color="#9CC0FF"/><stop offset="1" stop-color="#3F78FF" stop-opacity="0"/></linearGradient>
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
const logo1 = $(`<div class="abs" style="left:0;top:0;width:150px;height:150px;filter:drop-shadow(0 0 18px rgba(200,220,255,.8))">${star(150, "#F4F6FF")}</div>`); s1.appendChild(logo1);
const WORD = "Mintly";
const word1 = $(`<div class="abs" style="left:0;top:0;font:800 118px/1.1 'Nunito';letter-spacing:-.02em;white-space:nowrap;filter:drop-shadow(0 0 18px rgba(120,165,255,.55))">${[...WORD].map((c) => `<span class="ch grad">${c}</span>`).join("")}</div>`); s1.appendChild(word1);
const pill = $(`<div class="abs" style="left:0;top:0;height:96px;border-radius:30px;background:#fff;box-shadow:0 0 40px rgba(220,232,255,.95),0 0 110px rgba(79,134,255,.6)"></div>`); s1.appendChild(pill);
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
const glowTop = $(`<div class="abs" style="left:560px;top:-70px;width:800px;height:150px;border-radius:50%;background:radial-gradient(closest-side,rgba(79,134,255,.75),rgba(79,134,255,.18) 60%,rgba(79,134,255,0))"></div>`); s2.appendChild(glowTop);
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
      <img class="flogo" src="assets/tok/frog.png" style="width:100%;height:100%;image-rendering:pixelated;opacity:0"/></div>
    <div class="abs" style="left:104px;top:102px;width:273px;height:76px;border-radius:16px;border:1.5px dashed #30343E;display:flex;align-items:center;justify-content:center;font:400 12px/1 'Onest';color:#97958F">Баннер 1200×400 (необязательно)</div>
    ${подпись(204, "Название")}
    ${поле(226, "Prism Cat", "name")}
    ${подпись(302, "Тикер")}
    ${поле(324, "PRSM", "tick")}
    <div class="fbtn abs" style="left:16px;top:410px;width:361px;height:52px;border-radius:12px;background:#F2F0EB;display:flex;align-items:center;justify-content:center;font:800 16px/1 'Nunito';color:#2A2C31;box-shadow:0 0 30px rgba(120,165,255,.45)">Запустить токен</div>
  </div>
</div>`);
s2.appendChild(form);
const fbg = form.querySelector(".fbg"), fui = form.querySelector(".fui"), fbtn = form.querySelector(".fbtn"), flogo = form.querySelector(".flogo");
const ИМЯ = "Lily Frog", ТИКЕР = "LILY";
const valName = form.querySelector(".val-name"), phName = form.querySelector(".ph-name");
const valTick = form.querySelector(".val-tick"), phTick = form.querySelector(".ph-tick");
valName.innerHTML = [...ИМЯ].map((c) => `<span class="ch">${c}</span>`).join("");
valTick.innerHTML = [...ТИКЕР].map((c) => `<span class="ch">${c}</span>`).join("");
const charsName = [...valName.children], charsTick = [...valTick.children];
// печать: свежие буквы синие и остывают в белый
function typeChars(chars, t, a, b, accent = "#7FA9FF") {
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
  fbtn.style.boxShadow = `0 0 ${(30 + 40 * pr).toFixed(0)}px rgba(120,165,255,${(0.45 + 0.4 * pr).toFixed(2)})`;
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
  ["frog", "$LILY", "Lily Frog · 9 мин", "$30.1K", "+12.6%", 1], ["m", "$MINT", "Mintly · 2 мин", "$66.3K", "+38.2%", 1], ["pup", "$PUP", "Pixel Pup · 17 мин", "$46.8K", "+24.9%", 1],
  ["boo", "$BOO", "Boo · 26 мин", "$18.0K", "-3.1%", 0], ["fire", "$WICK", "Hot Wick · 31 мин", "$12.7K", "+6.4%", 1], ["mcat", "$MCAT", "Moon Cat · 44 мин", "$9.4K", "+2.2%", 1],
];
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rowEls = Array.from({ length: 24 }, (_, i) => {
  const [lg, tk, nm, mc, ch, up] = ЛЕНТА[i % ЛЕНТА.length];
  const el = $(`<div class="abs" style="left:0;top:0;width:620px;height:96px;display:flex;align-items:center;gap:20px;padding:0 24px;border-radius:26px;background:#0F0F13;border:1px solid rgba(255,255,255,.09)">
    <img src="assets/tok/${lg}.png" style="width:64px;height:64px;border-radius:50%;image-rendering:pixelated;flex:none"/>
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
    <div class="ctint abs" style="inset:0;background:radial-gradient(70% 90% at 100% 0%, rgba(90,140,255,.22) 0%, rgba(90,140,255,.06) 45%, transparent 70%)"></div>
    <div class="abs" style="inset:0;border-radius:64px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.08),inset 0 2px 30px rgba(255,255,255,.05)"></div>
    <div class="abs" style="left:84px;top:70px;display:flex;align-items:center;gap:30px">
      <img src="assets/tok/frog.png" style="width:120px;height:120px;border-radius:50%;image-rendering:pixelated"/>
      <div><div style="font:800 84px/1 'Nunito';letter-spacing:-.02em;color:#fff">Lily Frog</div>
      <div style="font:500 34px/1.3 'Onest';color:#97958F;margin-top:6px">$LILY · Gram</div></div>
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
  <div class="abs" style="left:20px;top:22px;font:800 20px/1 'Nunito';color:#F2F0EB">Купить $LILY</div>
  <div class="abs" style="left:20px;top:62px;font:500 13px/1 'Onest';color:#97958F">Сумма</div>
  <div class="abs" style="left:20px;top:84px;font:800 46px/1 'Nunito';color:#F2F0EB">0.5 <span style="color:#97958F;font-size:28px">GRAM</span></div>
  <div class="abs" style="left:20px;top:148px;display:flex;gap:8px">
    ${["0.1", "0.5", "1", "MAX"].map((v) => `<span style="padding:8px 14px;border-radius:999px;background:${v === "0.5" ? "#F2F0EB" : "#1B1F29"};color:${v === "0.5" ? "#14151A" : "#F2F0EB"};font:700 13px/1 'Onest'">${v}</span>`).join("")}
  </div>
  <div class="abs" style="left:20px;top:192px;font:500 13px/1.3 'Onest';color:#97958F">Получите ≈ <span style="color:#F2F0EB">12 400 LILY</span> · комиссия 0%</div>
  <div class="bbtn abs" style="left:20px;right:20px;top:240px;height:58px;border-radius:16px;background:#00E96B;display:flex;align-items:center;justify-content:center;font:800 18px/1 'Nunito';color:#04150B">Купить</div>
</div>`);
s4.appendChild(buy);
const bbtn = buy.querySelector(".bbtn");
// подтверждение — плашка, как всплывает в приложении после сделки
const toast = $(`<div class="abs" style="left:0;top:0;width:620px;height:112px;border-radius:30px;background:#17171A;border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;gap:24px;padding:0 30px;box-shadow:0 30px 80px rgba(0,0,0,.6)">
  <span style="position:absolute;left:0;top:26px;bottom:26px;width:5px;border-radius:3px;background:#2EE87A"></span>
  <span style="width:60px;height:60px;border-radius:18px;background:rgba(46,232,122,.16);display:flex;align-items:center;justify-content:center;flex:none">
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#2EE87A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span>
  <div style="flex:1"><div style="font:800 34px/1.1 'Nunito';color:#fff">Куплено</div><div style="font:500 24px/1.3 'Onest';color:#8E8E99">12 400 LILY · комиссия 0%</div></div>
  <div class="tsec" style="font:800 34px/1 'Nunito';color:#2EE87A;font-variant-numeric:tabular-nums">0,0 с</div>
</div>`);
s4.appendChild(toast);
const tsec = toast.querySelector(".tsec");
const cur4 = cursor.cloneNode(true); s4.appendChild(cur4);
function drawS4(t) {
  const on = t >= 5.2 && t < 9.99; show(s4, on); if (!on) return;
  const куплено = t >= 8.3;
  cposv.textContent = куплено ? "12 400 LILY · $15.20" : "токенов пока нет";
  cposv.style.color = куплено ? "#2EE87A" : "#F2F0EB";
  card.firstElementChild.style.boxShadow = `0 0 0 2px rgba(90,140,255,.25), 0 0 70px rgba(90,140,255,.35), 0 40px 120px rgba(0,0,0,.6)`;
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
// крупная фраза по словам из размытия, как в первом промо. Слайды
// вклиниваются в действие: интерфейс на это время замирает и
// растворяется, а потом продолжается с того же места.
const ui = $(`<div class="scene"></div>`);
const slides = $(`<div class="scene"></div>`);
function slide(html) {
  const box = $(`<div class="abs" style="left:0;right:0;top:0;height:${H}px;display:flex;align-items:center;justify-content:center"><div class="deco abs" style="inset:0"></div><div style="position:relative;text-align:center;font:800 132px/1.12 'Nunito';letter-spacing:-.02em;color:#fff;text-shadow:0 8px 40px rgba(0,0,0,.55)">${html}</div></div>`);
  slides.appendChild(box);
  const el = box.lastElementChild; el.box = box; el.deco = box.firstElementChild;
  el.innerHTML = el.innerHTML.replace(/(<br>)|([^\s<]+)/g, (m, br) => br ? br : `<span class="w" style="display:inline-block;margin:0 .14em">${m}</span>`);
  el.spans = [...el.querySelectorAll(".w")];
  el.spans.forEach((sp) => { if (sp.textContent.startsWith("*")) { sp.textContent = sp.textContent.slice(1); sp.classList.add("grad"); } });
  return el;
}
const ДЛ = 2.4; // сколько живёт слайд: фразу успевают прочесть
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
  slide("Прямо *в *Telegram"),
];
const С_НАЧ = 4.42, С_КОН = 10.0; // где встают слайды и откуда действие продолжается
const С_ДЛ = ДЛ * ВСЕ_СЛАЙДЫ.length;
// реальное время → время действия, текущий слайд и место внутри блока
function разложить(T) {
  if (T < С_НАЧ) return { t: T, el: null, p: 0, блок: -1 };
  if (T < С_НАЧ + С_ДЛ) { const i = Math.floor((T - С_НАЧ) / ДЛ); // под концом блока интерфейс уже на следующей сцене — форма запуска
    // не должна проступить обратно
    const t = T - С_НАЧ > С_ДЛ / 2 ? С_КОН : С_НАЧ;
    return { t, el: ВСЕ_СЛАЙДЫ[i], p: T - С_НАЧ - i * ДЛ, блок: T - С_НАЧ }; }
  return { t: T - С_ДЛ + (С_КОН - С_НАЧ), el: null, p: 0, блок: -1 };
}
// ---- своё движение под каждой фразой: ни одно не повторяется ----
// Летун по дуге с пунктирным следом — самолётик понравился, поэтому так
// же летают ракета (запуск) и молния (покупка), каждый по своей кривой.
const мер = (d) => { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); return p; };
function летун(i, путь, иконка, размер, поворот, тень) {
  const след = $(`<svg class="abs" style="left:0;top:0" width="${W}" height="${H}"><path d="${путь}" fill="none" stroke="rgba(156,192,255,.45)" stroke-width="4" stroke-dasharray="2 22" stroke-linecap="round"/></svg>`);
  const тело = $(`<svg class="abs" style="left:0;top:0;filter:drop-shadow(0 10px 30px ${тень})" width="${размер}" height="${размер}" viewBox="0 0 24 24">${иконка}</svg>`);
  ВСЕ_СЛАЙДЫ[i].deco.appendChild(след); ВСЕ_СЛАЙДЫ[i].deco.appendChild(тело);
  return { линия: след.querySelector("path"), тело, м: мер(путь), размер, поворот };
}
function вести(л, k) {
  const L = л.м.getTotalLength(), a = л.м.getPointAtLength(L * k), b = л.м.getPointAtLength(Math.min(L, L * k + 4));
  const ug = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  л.тело.style.transform = `translate3d(${(a.x - л.размер / 2).toFixed(1)}px,${(a.y - л.размер / 2).toFixed(1)}px,0) rotate(${(ug + л.поворот).toFixed(1)}deg)`;
  // пунктир дорисовывается ровно до летуна
  л.линия.style.strokeDasharray = "2 22";
  л.линия.style.clipPath = "none";
  л.линия.setAttribute("pathLength", "1");
  л.линия.style.strokeDasharray = `${(k * 1).toFixed(4)} 1`;
}
// 1. Запуск — ракета из приложения уходит вверх по дуге
const РАКЕТА = '<g transform="rotate(-45 12 12)" fill="none" stroke="#E4E2DC" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" fill="#5A8CFF" stroke="#5A8CFF"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" fill="#E4E2DC"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></g>';
// Ракета летит по прямой наискосок — снизу слева вверх направо, мимо
// фразы: корпус с бликом, иллюминатор, синие стабилизаторы, живое
// пламя и дымный след, который отстаёт и тает.
const Р_ОТ = [-260, 1060], Р_ДО = [1180, -380];
const РУГОЛ = Math.atan2(Р_ДО[1] - Р_ОТ[1], Р_ДО[0] - Р_ОТ[0]) * 180 / Math.PI;
const дым = Array.from({ length: 34 }, () => { const e = $(`<div class="abs" style="left:0;top:0;width:80px;height:80px;border-radius:50%;background:radial-gradient(circle,rgba(210,225,255,.55),rgba(150,180,255,.18) 55%,rgba(150,180,255,0) 72%)"></div>`); ВСЕ_СЛАЙДЫ[0].deco.appendChild(e); return e; });
const ракетаВсё = $(`<div class="abs" style="left:0;top:0;width:360px;height:360px">
  <svg class="abs" style="left:0;top:0;overflow:visible;filter:drop-shadow(0 18px 40px rgba(79,134,255,.55))" width="360" height="360" viewBox="-180 -180 360 360">
    <defs>
      <linearGradient id="рк" x1="-1" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9AA4B8"/><stop offset=".35" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#E4E2DC"/><stop offset="1" stop-color="#7C869A"/></linearGradient>
      <linearGradient id="рс" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FA6FF"/><stop offset="1" stop-color="#1F4FD1"/></linearGradient>
      <radialGradient id="ри" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#E8F0FF"/><stop offset=".35" stop-color="#5A8CFF"/><stop offset="1" stop-color="#0B2C70"/></radialGradient>
      <radialGradient id="рп" cx=".5" cy=".15" r=".9"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".25" stop-color="#FFF3B0"/><stop offset=".55" stop-color="#FFB13B"/><stop offset="1" stop-color="#FF5A1F" stop-opacity="0"/></radialGradient>
      <radialGradient id="рп2" cx=".5" cy=".1" r=".9"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".4" stop-color="#BFD6FF"/><stop offset="1" stop-color="#5A8CFF" stop-opacity="0"/></radialGradient>
    </defs>
    <g class="пламя"><path class="п1" d="M-26 62 Q-34 120 0 190 Q34 120 26 62 Z" fill="url(#рп)"/><path class="п2" d="M-14 62 Q-18 104 0 146 Q18 104 14 62 Z" fill="url(#рп2)"/></g>
    <path d="M-34 30 L-70 78 L-66 92 L-30 70 Z" fill="url(#рс)"/><path d="M34 30 L70 78 L66 92 L30 70 Z" fill="url(#рс)"/>
    <path d="M-30 58 L30 58 L22 72 L-22 72 Z" fill="#3A4152"/>
    <path d="M0 -150 C 36 -112 44 -40 36 58 L-36 58 C -44 -40 -36 -112 0 -150 Z" fill="url(#рк)"/>
    <path d="M0 -150 C 18 -132 28 -110 32 -88 L-32 -88 C -28 -110 -18 -132 0 -150 Z" fill="url(#рс)"/>
    <path d="M-36 30 L36 30 L36 42 L-36 42 Z" fill="#5A8CFF" opacity=".9"/>
    <circle cx="0" cy="-38" r="22" fill="#3A4152"/><circle cx="0" cy="-38" r="16" fill="url(#ри)"/>
    <path d="M-6 -48 a10 10 0 0 1 10 -4" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" fill="none" opacity=".85"/>
    <path d="M-20 -110 C -26 -60 -26 0 -22 50" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" fill="none" opacity=".55"/>
    <path d="M0 58 L0 72" stroke="#0F0F13" stroke-width="40" opacity="0"/>
  </svg>
</div>`);
ВСЕ_СЛАЙДЫ[0].deco.appendChild(ракетаВсё);
const п1 = ракетаВсё.querySelector(".п1"), п2 = ракетаВсё.querySelector(".п2");
function drawRocket(q) {
  // лёгкий разгон в начале и ровный ход дальше
  const k = q < 0.12 ? 0.12 * E.inQ(q / 0.12) : 0.12 + (q - 0.12) * 1.05;
  const x = lerp(Р_ОТ[0], Р_ДО[0], k), y = lerp(Р_ОТ[1], Р_ДО[1], k);
  const дрожь = Math.sin(q * 140) * 1.6;
  ракетаВсё.style.transform = `translate3d(${(x - 180 + дрожь).toFixed(1)}px,${(y - 180).toFixed(1)}px,0) rotate(${(РУГОЛ + 90).toFixed(2)}deg)`;
  // пламя дрожит и меняет длину
  const f = 1 + 0.18 * Math.sin(q * 90) + 0.1 * Math.sin(q * 230);
  п1.setAttribute("transform", `translate(0 62) scale(${(1 + 0.06 * Math.sin(q * 170)).toFixed(3)} ${f.toFixed(3)}) translate(0 -62)`);
  п2.setAttribute("transform", `translate(0 62) scale(1 ${(0.9 + 0.2 * Math.sin(q * 120 + 1)).toFixed(3)}) translate(0 -62)`);
  // дым: клубы рождаются у сопла, отстают, растут и тают
  const ux = Math.cos(РУГОЛ * Math.PI / 180), uy = Math.sin(РУГОЛ * Math.PI / 180);
  дым.forEach((e, j) => {
    const рожд = j / дым.length * 0.95, возр = q - рожд;
    if (возр < 0 || k > 1.3) { e.style.opacity = 0; return; }
    const kk = рожд < 0.12 ? 0.12 * E.inQ(рожд / 0.12) : 0.12 + (рожд - 0.12) * 1.05;
    const bx = lerp(Р_ОТ[0], Р_ДО[0], kk) - ux * 130, by = lerp(Р_ОТ[1], Р_ДО[1], kk) - uy * 130;
    const рост = 0.6 + возр * 6, сдув = возр * 60;
    e.style.transform = `translate3d(${(bx - 40 + Math.sin(j * 2.3) * сдув * 0.4).toFixed(1)}px,${(by - 40 + сдув * 0.5).toFixed(1)}px,0) scale(${рост.toFixed(3)})`;
    e.style.opacity = Math.max(0, 0.9 - возр * 1.6).toFixed(3);
  });
}
// 2. Две сети — тот самый переключатель GRAM / SOL из приложения
const сети = $(`<div class="abs" style="left:${W / 2 - 230}px;top:70px;width:460px;height:104px;border-radius:999px;background:#14171F;box-shadow:0 20px 60px rgba(0,0,0,.45)">
  <div class="бег abs" style="left:8px;top:8px;width:218px;height:88px;border-radius:999px;background:rgba(255,255,255,.92)"></div>
  <div class="сг abs" style="left:8px;top:0;width:218px;height:104px;display:flex;align-items:center;justify-content:center;gap:14px;font:800 36px/1 'Nunito'"><img src="assets/app/gram.png" style="width:40px;height:40px"/>GRAM</div>
  <div class="сс abs" style="left:234px;top:0;width:218px;height:104px;display:flex;align-items:center;justify-content:center;gap:14px;font:800 36px/1 'Nunito'"><img src="assets/app/sol.png" style="width:40px;height:40px;border-radius:50%"/>SOL</div>
</div>`);
ВСЕ_СЛАЙДЫ[1].deco.appendChild(сети);
const бег = сети.querySelector(".бег"), сг = сети.querySelector(".сг"), сс = сети.querySelector(".сс");
// под фразой — сам мемпад: строка фильтров и токены выбранной сети;
// переключатель меняет список, как в приложении
const МП_Y = 640, МП_W = 1000;
const мемпад = $(`<div class="abs" style="left:${W / 2 - МП_W / 2}px;top:${МП_Y}px;width:${МП_W}px">
  <div style="display:flex;gap:44px;padding:0 8px 22px;font:600 30px/1 'Onest';color:#63625F">
    <span style="color:#F2F0EB">Новые</span><span>Трендовые</span><span>Скоро на бирже</span><span>По обороту</span></div>
  <div class="мпряды" style="position:relative;height:330px;overflow:hidden"></div>
</div>`);
ВСЕ_СЛАЙДЫ[1].deco.appendChild(мемпад);
const мпРяды = мемпад.querySelector(".мпряды");
const ряд = ([lg, tk, nm, mc, ch, up]) => $(`<div class="abs" style="left:0;right:0;height:96px;display:flex;align-items:center;gap:22px;padding:0 26px;border-radius:24px;background:#0F0F13;border:1px solid rgba(255,255,255,.08)">
  <img src="assets/tok/${lg}.png" style="width:62px;height:62px;border-radius:50%;image-rendering:pixelated;flex:none"/>
  <div style="flex:1"><div style="font:800 30px/1.1 'Nunito';color:#fff">${tk}</div><div style="font:500 21px/1.35 'Onest';color:#97958F">${nm}</div></div>
  <div style="text-align:right"><div style="font:800 30px/1.1 'Nunito';color:${up ? "#2EE87A" : "#FF5A63"}">${mc}</div><div style="font:600 21px/1.35 'Onest';color:${up ? "#2EE87A" : "#FF5A63"}">${ch}</div></div></div>`);
const МП_ТОН = [["frog", "$LILY", "Lily Frog · 9 мин", "$30.1K", "+12.6%", 1], ["m", "$MINT", "Mintly · 2 мин", "$66.3K", "+38.2%", 1], ["pup", "$PUP", "Pixel Pup · 17 мин", "$46.8K", "+24.9%", 1]].map(ряд);
const МП_СОЛ = [["boo", "$BOO", "Boo · 26 мин", "$18.0K", "-3.1%", 0], ["fire", "$WICK", "Hot Wick · 31 мин", "$12.7K", "+6.4%", 1], ["mcat", "$MCAT", "Moon Cat · 44 мин", "$9.4K", "+2.2%", 1]].map(ряд);
[...МП_ТОН, ...МП_СОЛ].forEach((e) => мпРяды.appendChild(e));
function рядыСети(список, вид, сдвиг) {
  // вид: 0 — спрятаны, 1 — на месте; сдвиг ±1 — откуда въезжают
  список.forEach((e, j) => {
    const k = clamp(вид * 1.25 - j * 0.12);
    S(e, { o: smooth(k), x: (1 - smooth(k)) * 140 * сдвиг, y: j * 112, b: (1 - k) * 6 });
  });
}
// 3. Комиссия 0% — монета падает в кошелёк целиком, ничего не отщипывается
const кошелёк = $(`<svg class="abs" style="left:${W / 2 - 150}px;top:740px" width="300" height="272" viewBox="0 0 24 22" fill="none" stroke="#E4E2DC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 6.5h16.5a1.5 1.5 0 0 1 1.5 1.5v10.5a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 18.5z" fill="#14171F"/><path d="M3 6.5V5a1.5 1.5 0 0 1 1.5-1.5h12"/><path d="M21 11h-4a1.75 1.75 0 0 0 0 3.5h4" fill="#1B1F29"/></svg>`);
const монета = $(`<img class="abs" src="assets/app/gram.png" style="left:0;top:0;width:150px;height:150px;filter:drop-shadow(0 12px 30px rgba(79,134,255,.6))"/>`);
ВСЕ_СЛАЙДЫ[2].deco.appendChild(монета); ВСЕ_СЛАЙДЫ[2].deco.appendChild(кошелёк);
// 4. Покупка за секунду — молния пролетает по своей дуге
const МОЛНИЯ = '<path d="M13.2 2 4.8 13.4h6l-1.2 8.6L19.2 10h-6.2z" fill="#2EE87A" stroke="#2EE87A" stroke-width="1" stroke-linejoin="round"/>';
const молния = летун(3, "M-140 880 C 400 1000, 700 780, 980 840 S 1600 1000, 2080 720", МОЛНИЯ, 120, 0, "rgba(46,232,122,.55)");
// 5. Прямо в Telegram — бумажный самолётик (как было)
const САМОЛЁТ = '<path d="M21.5 3.2 2.8 10.6c-.8.3-.8 1.4 0 1.7l4.6 1.6 1.8 5.6c.2.7 1.1.9 1.6.4l2.6-2.5 4.7 3.5c.6.4 1.4.1 1.6-.6l3.1-15.6c.2-.9-.6-1.6-1.3-1.5z" fill="#E4E2DC"/><path d="M7.4 13.9 18 6.4l-8.1 8.6" fill="none" stroke="#0B0D12" stroke-width="1.1" stroke-linejoin="round"/>';
const самолёт = летун(4, "M-120 820 C 380 980, 620 300, 980 330 S 1640 120, 2060 260", САМОЛЁТ, 120, 40, "rgba(79,134,255,.55)");
function drawDeco(i, p) {
  const жизнь = smooth(prog(p, 0, 0.3)) * (1 - smooth(prog(p, ДЛ - 0.35, ДЛ)));
  ВСЕ_СЛАЙДЫ[i].deco.style.opacity = жизнь;
  if (i === 0) drawRocket(p / ДЛ);
  else if (i === 1) {
    // бегунок едет на SOL и возвращается на GRAM — как пальцем
    const q = p / ДЛ, k = E.io(prog(q, 0.2, 0.42)) - E.io(prog(q, 0.6, 0.82));
    бег.style.transform = `translateX(${(226 * k).toFixed(1)}px)`;
    сг.style.color = k < 0.5 ? "#0B0B0F" : "#63625F"; сс.style.color = k >= 0.5 ? "#0B0B0F" : "#63625F";
    // список: Gram-токены уезжают влево, Solana-токены въезжают справа, и обратно
    const вход = smooth(prog(q, 0.04, 0.16));
    рядыСети(МП_ТОН, вход * (1 - k), k > 0.5 ? -1 : 1);
    рядыСети(МП_СОЛ, k, k > 0.5 ? 1 : -1);
    // фраза поднимается, освобождая место мемпаду
    ВСЕ_СЛАЙДЫ[1].style.marginTop = "-300px";
  } else if (i === 2) {
    // падение с ускорением, лёгкий отскок кошелька при попадании
    const q = p / ДЛ, k = E.inQ(prog(q, 0.12, 0.55)), y = lerp(-170, 770, k), сжатие = Math.sin(Math.PI * prog(q, 0.55, 0.72));
    монета.style.transform = `translate3d(${W / 2 - 75}px,${y.toFixed(1)}px,0) rotate(${(k * 200).toFixed(1)}deg)`;
    монета.style.opacity = q < 0.58 ? 1 : 1 - smooth(prog(q, 0.58, 0.64));
    кошелёк.style.transform = `translateY(${(10 * сжатие).toFixed(1)}px) scale(${(1 + 0.08 * сжатие).toFixed(3)},${(1 - 0.06 * сжатие).toFixed(3)})`;
  } else if (i === 3) вести(молния, E.io(prog(p / ДЛ, 0.05, 0.85)));
  else if (i === 4) вести(самолёт, E.io(prog(p / ДЛ, 0.05, 0.88)));
}

function drawSlides(р) {
  ВСЕ_СЛАЙДЫ.forEach((el) => { el.box.style.display = el === р.el ? "flex" : "none"; });
  // интерфейс растворяется на входе в блок слайдов и проявляется на выходе,
  // между слайдами не мигает
  const вход = р.el ? smooth(prog(р.блок, 0, 0.28)) * (1 - smooth(prog(р.блок, С_ДЛ - 0.28, С_ДЛ))) : 0;
  ui.style.opacity = 1 - вход;
  ui.style.filter = вход > 0.01 ? `blur(${(вход * 14).toFixed(1)}px)` : "none";
  ui.style.transform = `scale(${(1 + 0.04 * вход).toFixed(4)})`;
  if (!р.el) return;
  drawDeco(ВСЕ_СЛАЙДЫ.indexOf(р.el), р.p);
  const out = smooth(prog(р.p, ДЛ - 0.32, ДЛ - 0.04));
  р.el.style.transform = `scale(${(1.03 - 0.03 * smooth(prog(р.p, 0, ДЛ))).toFixed(4)})`;
  р.el.spans.forEach((w, i) => {
    const k = E.out(prog(р.p, 0.16 + i * 0.08, 0.16 + i * 0.08 + 0.5));
    S(w, { o: k * (1 - out), y: (1 - k) * 34 - out * 14, b: (1 - k) * 12 + out * 8 });
  });
}

// ===================== 5. ЗНАК И «СДЕЛАНО В MINTLY.» =====================
const s5 = $(`<div class="scene"></div>`); root.appendChild(s5);
const logo5 = $(`<div class="abs" style="left:0;top:0;width:128px;height:128px;filter:drop-shadow(0 0 16px rgba(190,215,255,.85)) drop-shadow(0 0 40px rgba(79,134,255,.45))">${star(128, "#F4F6FF")}</div>`); s5.appendChild(logo5);
const LINE = "Сделано в Mintly.";
const line5 = $(`<div class="abs" style="left:0;top:0;font:800 70px/1 'Nunito';letter-spacing:-.01em;color:#fff;white-space:nowrap;text-shadow:0 0 16px rgba(190,215,255,.45)">${[...LINE].map((c, i) => `<span class="ch" style="position:absolute;left:0;top:0;color:${i >= 10 ? "#7FA6FF" : "#fff"}">${c === " " ? " " : c}</span>`).join("")}</div>`); s5.appendChild(line5);
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
  const on = t >= 10.0 && t < 11.75; show(s5, on); if (!on) return;
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

// ===================== 6. КОНЦОВКА =====================
const s6 = $(`<div class="scene"></div>`); root.appendChild(s6);
const endLogo = $(`<div class="abs" style="left:${W / 2 - 80}px;top:200px">${star(160, "#F4F6FF")}</div>`); s6.appendChild(endLogo);
const endName = $(`<div class="abs" style="left:0;width:${W}px;top:390px;text-align:center;font:800 72px/1.1 'Nunito';color:#fff;letter-spacing:-.01em">Mintly</div>`); s6.appendChild(endName);
const BW = 640, BH = 70, BY = 610;
const streak = $(`<div class="abs" style="left:${W / 2}px;top:${BY + 8}px;height:54px;border-radius:8px;background:linear-gradient(90deg,#4F86FF 0%,#9EC1FF 35%,#fff 50%,#9EC1FF 65%,#4F86FF 100%)"></div>`); s6.appendChild(streak);
const offA = $(`<div class="abs" style="left:0;top:0;width:${BW}px;height:${BH}px;border-radius:12px;background:${СИНИЙ}"></div>`); s6.appendChild(offA);
const offB = $(`<div class="abs" style="left:0;top:0;width:${BW}px;height:${BH}px;border-radius:12px;background:#CFE0FF"></div>`); s6.appendChild(offB);
const bar = $(`<div class="abs" style="left:${W / 2 - BW / 2}px;top:${BY}px;width:${BW}px;height:${BH}px;border-radius:14px;background:#fff;box-shadow:-6px 0 0 ${СИНИЙ},6px 0 0 #9EC1FF">
  <div class="abs" style="left:7px;top:7px;right:80px;bottom:7px;border-radius:9px;background:#0F0F13"></div>
  <div class="bin abs" style="left:30px;top:0;height:${BH}px;display:flex;align-items:center;gap:22px;font:500 27px/1 'Onest';color:rgba(242,240,235,.92)">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
    <span>@MintlyAppbot</span>
  </div>
  <div class="bin abs" style="right:0;top:0;width:80px;height:${BH}px;display:flex;align-items:center;justify-content:center">${star(40, "#0F0F13")}</div>
</div>`); s6.appendChild(bar);
const barIn = [...bar.querySelectorAll(".bin")];
function drawS6(t) {
  const on = t >= 12.75; show(s6, on); if (!on) return;
  const kE = smooth(prog(t, 12.75, 13.1));
  s6.style.opacity = kE; s6.style.transform = `scale(${(1.04 - 0.04 * kE).toFixed(4)})`;
  s6.style.filter = kE < 0.99 ? `blur(${((1 - kE) * 8).toFixed(1)}px)` : "none";
  // полоса: вспышка-штрих → два сдвинутых слоя → строка поиска
  const k1 = E.out(prog(t, 13.06, 13.24));
  const sw = BW * 0.95 * k1;
  streak.style.width = sw + "px"; streak.style.transform = `translateX(${-sw / 2}px)`;
  streak.style.opacity = t < 13.24 ? k1 : 0; streak.style.filter = `blur(${(1 - k1) * 6 + 1.5}px)`;
  const g = t >= 13.24 && t < 13.5;
  const j = 10 * (1 - smooth(prog(t, 13.24, 13.5)));
  show(offA, g); show(offB, g);
  if (g) {
    const k = prog(t, 13.24, 13.5);
    offA.style.transform = `translate3d(${W / 2 - BW / 2 - 14 + j}px,${BY - 16 * (1 - k)}px,0)`;
    offB.style.transform = `translate3d(${W / 2 - BW / 2 + 16 - j}px,${BY + 18 * (1 - k)}px,0)`;
    offA.style.opacity = offB.style.opacity = 1 - k * 0.6;
  }
  const kb = E.out(prog(t, 13.38, 13.6));
  bar.style.opacity = t >= 13.38 ? 1 : 0;
  bar.style.transform = `scaleX(${lerp(1.08, 1, kb).toFixed(3)})`;
  const kin = E.out(prog(t, 13.6, 13.9));
  barIn.forEach((e) => { e.style.opacity = kin; e.style.transform = `translateX(${((1 - kin) * -16).toFixed(1)}px)`; });
}

// интерфейс — в своём слое, чтобы на слайдах растворять его целиком
[silkWrap, s1, s2, s3, s4, s5, s6].forEach((e) => ui.appendChild(e));
root.appendChild(ui); root.appendChild(slides);
window.renderAt = (T) => {
  const р = разложить(T), t = р.t;
  drawBG(t); shimmer(T); drawSilk(t); drawS1(t); drawS2(t); drawS3(t); drawS4(t); drawS5(t); drawS6(t);
  drawSlides(р);
};
(async () => {
  await document.fonts.ready;
  await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
  layoutChips(); layoutLine();
  window.renderAt(0);
  window.ready = true;
})();
