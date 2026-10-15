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
  back: (k) => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
};
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
  const тёмно = (t >= 2.58 && t < 3.55) || (t >= 10.0 && t < 13.0);
  BG.style.opacity = тёмно ? 0.45 : 1;
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
  let o = 0, dx = 0, dy = 0, sc = 1;
  if (t < 2.58) { o = 1; }
  else if (t < 3.55) { o = 0; }
  else if (t < 4.45) { o = 0.85 * E.out(prog(t, 3.55, 3.85)); dx = -520; dy = 260; sc = 1.15; }
  else if (t < 5.3) { o = 0.35; dx = -620; dy = 320; sc = 1.2; }
  else if (t < 6.5) { o = 0.6; dx = 560; dy = -120; sc = 1.05; }
  else if (t < 8.3) { o = 0.55; dx = 900; dy = -320; sc = 1.1; }
  else if (t < 10.0) { o = 0.6 * (1 - prog(t, 9.75, 10.0)); dx = -760; dy = 0; sc = 1.1; }
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
const CHIPS = [["home", "Главная"], ["swap", "Мемпад"], ["rocket", "Запуск"], ["bag", "Магазин"], ["bars", "Кошелёк"]];
const row = $(`<div class="abs" style="left:0;top:0;width:${W}px;height:80px"></div>`); s1.appendChild(row);
const chips = CHIPS.map(([k, л]) => { const c = $(`<div class="chip">${ico(k)}<span>${л}</span></div>`); row.appendChild(c); return c; });
const ЦЕЛЬ = 2;
const cursor = $(`<svg class="abs" style="left:0;top:0;filter:drop-shadow(0 6px 14px rgba(0,0,0,.6))" width="64" height="72" viewBox="0 0 32 36">
  <path d="M11 3.5c1.4 0 2.4 1 2.4 2.4V15l1-.2c1.1-.1 2 .4 2.4 1.3l.5-.1c1.2-.2 2.2.4 2.6 1.4h.6c1.4 0 2.5 1.1 2.5 2.5v6.3c0 4.4-3.2 7.8-7.6 7.8h-1.6c-2.6 0-4.4-1-6-3.2L3.6 25c-.8-1.1-.6-2.6.5-3.4 1-.7 2.4-.5 3.2.4l1.3 1.5V5.9c0-1.4 1-2.4 2.4-2.4z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M13.4 15v6M16.8 16.1v5M20.3 17.6v4" stroke="#111" stroke-width="1.4" stroke-linecap="round"/></svg>`); s1.appendChild(cursor);
let chipW = [], chipX = [];
function layoutChips() {
  const gap = 18;
  chipW = chips.map((c) => c.offsetWidth);
  const total = chipW.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
  let x = (W - total) / 2;
  chipX = chipW.map((w) => { const p = x; x += w + gap; return p; });
}
function drawS1(t) {
  const on = t < 2.58; show(s1, on); if (!on) return;
  // камера чуть наезжает, пока курсор идёт к чипу
  const zoom = 1 + 0.05 * E.io(prog(t, 1.85, 2.58));
  s1.style.transform = `scale(${zoom.toFixed(4)})`; s1.style.transformOrigin = "960px 540px";
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
  row.style.transform = `translate3d(0,${H / 2 - 48}px,0)`;
  const kC = prog(t, 1.36, 1.8);
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
    if (i === ЦЕЛЬ) {
      c.style.background = `rgba(79,134,255,${(0.38 * glow + 0.0).toFixed(3)})`;
      c.querySelector("span").style.color = glow > 0.5 ? "#DCE8FF" : "#fff";
    }
  });
  // курсор: снизу к «Запуску», нажатие
  const kc = E.out(prog(t, 1.82, 2.1));
  const tx = chipX[ЦЕЛЬ] + chipW[ЦЕЛЬ] / 2 - 14, ty = H / 2 + 6;
  const press = clamp(prog(t, 2.14, 2.22) - prog(t, 2.24, 2.36));
  S(cursor, { o: prog(t, 1.82, 1.9), x: lerp(tx + 260, tx, kc), y: lerp(ty + 520, ty, kc), s: 1 - 0.12 * press });
}

// ===================== 2. ЗАПРОС: крупно → в поле ввода =====================
const s2 = $(`<div class="scene"></div>`); root.appendChild(s2);
const glowTop = $(`<div class="abs" style="left:560px;top:-70px;width:800px;height:150px;border-radius:50%;background:radial-gradient(closest-side,rgba(79,134,255,.75),rgba(79,134,255,.18) 60%,rgba(79,134,255,0))"></div>`); s2.appendChild(glowTop);
const BOX_W = 1460, BOX_H = 330;
function promptBox(text) {
  const g = $(`<div class="abs" style="left:0;top:0;width:${BOX_W}px;height:${BOX_H}px;transform-origin:0 0"></div>`);
  const bg = $(`<div class="box" style="inset:0"></div>`); g.appendChild(bg);
  const tx = $(`<div class="abs" style="left:64px;top:70px;font:500 46px/1.2 'Onest';white-space:nowrap">${[...text].map((c) => `<span class="ch">${c === " " ? " " : c}</span>`).join("")}</div>`); g.appendChild(tx);
  const plus = $(`<svg class="abs" style="left:58px;top:228px" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"><path d="M12 4v16M4 12h16"/></svg>`); g.appendChild(plus);
  const ctr = $(`<div class="abs" style="right:52px;top:226px;height:60px;display:flex;align-items:center;gap:30px;font:500 30px/1 'Onest';color:rgba(242,240,235,.85)">
    <span>GRAM <span style="opacity:.6;font-size:24px">⌄</span></span>
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3" fill="#fff"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>
    <svg width="40" height="34" viewBox="0 0 30 24" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2.2" stroke-linecap="round"><path d="M3 10v4M7.5 6v12M12 9v6M16.5 4v16M21 8v8M25.5 11v2"/></svg>
    <span class="send" style="width:60px;height:60px;border-radius:16px;background:${СИНИЙ};display:flex;align-items:center;justify-content:center;box-shadow:0 0 24px rgba(79,134,255,.6)"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg></span>
  </div>`); g.appendChild(ctr);
  return { g, bg, tx, plus, ctr, send: ctr.querySelector(".send"), chars: [...tx.children] };
}
const P1 = promptBox("Хочу запустить мемкоин Lily Frog.");
s2.appendChild(P1.g);
// печать: свежие буквы синие и остывают в белый
function typeChars(chars, t, a, b, accent = "#7FA9FF") {
  const n = chars.length;
  chars.forEach((ch, i) => {
    const ti = a + (b - a) * (i / n);
    const vis = t >= ti;
    ch.style.visibility = vis ? "visible" : "hidden";
    const cool = clamp((t - ti - 0.28) / 0.25);
    ch.style.color = cool >= 1 ? "#F2F0EB" : (cool <= 0 ? accent : `color-mix(in srgb, #F2F0EB ${Math.round(cool * 100)}%, ${accent})`);
  });
}
function drawS2(t) {
  const on = t >= 2.58 && t < 4.62; show(s2, on); if (!on) return;
  S(glowTop, { o: (1 - E.out(prog(t, 3.5, 3.8))) * (0.8 + 0.2 * Math.sin(t * 6)) });
  typeChars(P1.chars, t, 2.68, 4.18);
  // крупно, без рамки → сжимается в поле ввода → поле дрейфует
  const k = E.io(prog(t, 3.48, 3.86));
  const big = { s: 1.95, x: 440 - 64 * 1.95, y: 440 - 70 * 1.95 };
  const small = { s: 1.12, x: 260, y: 330 };
  const drift = E.out(prog(t, 3.86, 4.62));
  const s = lerp(big.s, small.s, k), x = lerp(big.x, small.x, k) - 110 * drift, y = lerp(big.y, small.y, k) + 40 * drift;
  // кнопка «+» в крупном виде — в углу экрана: поле больше кадра
  const gs = s;
  P1.g.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${gs.toFixed(4)}) perspective(2000px) rotateY(${(-4 * drift).toFixed(2)}deg)`;
  P1.bg.style.opacity = k;
  P1.ctr.style.opacity = E.out(prog(t, 3.6, 3.9));
  // «+» в крупном состоянии стоит у нижнего края экрана
  P1.plus.style.top = (k < 1 ? lerp((960 - big.y) / big.s - 28, 228, k) : 228) + "px";
  P1.plus.style.left = (k < 1 ? lerp((110 - big.x) / big.s - 28, 58, k) : 58) + "px";
  // нажатие «отправить» и улёт поля в камеру
  const pr = clamp(prog(t, 4.24, 4.3) - prog(t, 4.32, 4.4));
  P1.send.style.transform = `scale(${(1 - 0.12 * pr).toFixed(3)})`;
  const fly = E.inQ(prog(t, 4.38, 4.56));
  s2.style.transform = `scale(${(1 + 1.6 * fly).toFixed(4)})`; s2.style.transformOrigin = "960px 520px";
  s2.style.filter = fly > 0.01 ? `blur(${(fly * 16).toFixed(1)}px)` : "none";
  s2.style.opacity = 1 - fly;
}

// ===================== 3. ПРОЛЁТ СКВОЗЬ КОД =====================
const s3 = $(`<div class="scene" style="perspective:900px;perspective-origin:960px 540px"></div>`); root.appendChild(s3);
const CODE = [
  ["#FF7AB6", "contract BondingCurve with Deployable {"], ["#F2F0EB", "  supply: Int as coins = 0;"], ["#7FA9FF", "  reserve: Int as coins = 0;"],
  ["#00E96B", "  receive(msg: Buy) {"], ["#F2F0EB", "    let price = self.priceAt(self.supply);"], ["#FFC233", "    require(context().value >= price, \"low\");"],
  ["#7FA9FF", "    self.supply += msg.amount;"], ["#00E96B", "    send(SendParameters{ to: sender(), value: 0 });"], ["#F2F0EB", "  }"],
  ["#FF3B47", "  get fun priceAt(s: Int): Int {"], ["#F2F0EB", "    return BASE + s * s / K;"], ["#7FA9FF", "import { Mintly } from \"@mintly/sdk\";"],
  ["#00E96B", "const token = await mintly.launch({"], ["#F2F0EB", "  name: \"Lily Frog\", ticker: \"LILY\","], ["#FFC233", "  chain: \"gram\", curve: \"bonding\","],
  ["#7FA9FF", "});"], ["#FF7AB6", "<TokenCard token={token} />"], ["#00E96B", "listing.at(1000 * GRAM)"], ["#F2F0EB", "emit(Launched{ id: token.id })"],
  ["#7FA9FF", "  receive(msg: Sell) {"], ["#FF3B47", "    self.reserve -= payout;"], ["#00E96B", "mempad.push(token)"], ["#F2F0EB", "holders.add(sender())"],
  ["#FFC233", "chart.candle(\"1m\").update(price)"], ["#7FA9FF", "const curve = new BondingCurve(K, BASE);"], ["#00E96B", "export default token;"],
];
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const codeEls = CODE.map(([c, txt], i) => {
  const el = $(`<div class="code" style="left:0;top:0;color:${c};text-shadow:0 0 12px ${c}66">${txt.replace(/</g, "&lt;")}</div>`); s3.appendChild(el);
  return { el, x: (rnd() - 0.5) * 1100 - 820, y: (rnd() - 0.5) * 700 - 40, z0: -3300 + i * 112 + rnd() * 100 };
});
function drawS3(t) {
  const on = t >= 4.44 && t < 5.5; show(s3, on); if (!on) return;
  const k = prog(t, 4.44, 5.5);
  const sp = 2600 * E.io(k) + 700 * k;
  codeEls.forEach((c) => {
    const z = c.z0 + sp;
    const near = clamp((z + 260) / 420), far = clamp((z + 2700) / 500);
    const o = far * (1 - clamp((z - 120) / 200)) * (1 - prog(t, 5.32, 5.5)) * prog(t, 4.44, 4.56);
    c.el.style.opacity = o.toFixed(3);
    c.el.style.visibility = o > 0.01 ? "visible" : "hidden";
    c.el.style.transform = `translate3d(${(960 + c.x).toFixed(1)}px,${(540 + c.y).toFixed(1)}px,${z.toFixed(1)}px)`;
    c.el.style.filter = `blur(${(near * 9 + (1 - far) * 4).toFixed(1)}px)`;
  });
}

// ===================== 4. КАРТОЧКА ТОКЕНА И ВТОРОЙ ЗАПРОС =====================
const s4 = $(`<div class="scene" style="perspective:1700px;perspective-origin:960px 540px"></div>`); root.appendChild(s4);
const CW = 1240, CH = 720;
const card = $(`<div class="abs" style="left:${(W - CW) / 2}px;top:${(H - CH) / 2}px;width:${CW}px;height:${CH}px;border-radius:52px;overflow:hidden;transform-style:preserve-3d">
  <div class="cbg abs" style="inset:0"></div>
  <div class="abs" style="inset:0;border-radius:52px;box-shadow:inset 0 0 0 2.5px rgba(255,255,255,.28),inset 0 2px 24px rgba(255,255,255,.18)"></div>
  <div class="abs" style="left:64px;top:52px;display:flex;align-items:center;gap:40px;font:500 26px/1 'Onest';color:rgba(255,255,255,.9)">
    <span style="width:66px;height:66px;border-radius:50%;background:#0F0F13;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1.5px rgba(255,255,255,.18)">${star(40)}</span>
    <span>Мемпад</span><span>Запуск</span><span>Магазин</span><span style="margin-left:150px">Кошелёк</span>
  </div>
  <div class="abs" style="left:70px;top:226px;display:flex;align-items:center;gap:26px">
    <img src="assets/tok/frog.png" style="width:120px;height:120px;border-radius:50%;image-rendering:pixelated;box-shadow:0 0 0 3px rgba(255,255,255,.25)"/>
    <div><div style="font:800 92px/1 'Nunito';letter-spacing:-.02em;color:#fff">Lily Frog</div>
    <div style="font:600 34px/1.3 'Onest';color:rgba(255,255,255,.82);margin-top:8px">$LILY · $30.1K <span style="color:#2EE87A">+12.6%</span></div></div>
  </div>
  <svg class="abs" style="left:640px;top:420px" width="540" height="150" viewBox="0 0 540 150" fill="none"><path d="M0 120 L40 112 L80 118 L120 96 L160 104 L200 80 L240 88 L280 62 L320 70 L360 48 L400 58 L440 34 L480 40 L540 14" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/></svg>
  <div class="abs" style="left:70px;top:588px;height:62px;padding:0 34px;border-radius:18px;background:#fff;color:#14151A;font:800 28px/62px 'Nunito'">Купить</div>
</div>`);
s4.appendChild(card);
const cbg = card.querySelector(".cbg");
const ЦВЕТ_1 = "linear-gradient(115deg,#E44BC8 0%,#C13AE6 18%,#8E2DE2 36%,#6A17E8 54%,#4A00E0 70%,#7B1FE0 84%,#2C0A78 100%)";
const ЦВЕТ_2 = "linear-gradient(115deg,#7FE6FF 0%,#28D7FF 18%,#1A9BF0 38%,#0A5BD8 62%,#0A3AA8 84%,#061E66 100%)";
const P2 = promptBox("Хочу синий фон.");
P2.bg.style.background = "#0F0F13";
s4.appendChild(P2.g);
function cardGlow(c) { card.style.boxShadow = `0 0 0 2px ${c}55, 0 0 60px ${c}88, 0 40px 120px rgba(0,0,0,.6)`; }
function drawS4(t) {
  const on = t >= 5.25 && t < 10.08; show(s4, on); if (!on) return;
  const синий = t >= 8.36;
  cbg.style.background = синий ? ЦВЕТ_2 : ЦВЕТ_1;
  cardGlow(синий ? "#28D7FF" : "#C13AE6");
  let x = 0, y = 0, ry = -8, rx = 4, s = 1, b = 0, o = 1;
  if (t < 5.66) { const k = E.out(prog(t, 5.25, 5.66)); x = lerp(1100, 40, k); ry = lerp(-62, -20, k); rx = lerp(10, 6, k); b = (1 - k) * 16; o = E.out(prog(t, 5.25, 5.4)); }
  else if (t < 6.42) { const k = E.out(prog(t, 5.66, 6.42)); x = lerp(40, -30, k); ry = lerp(-20, -8, k); rx = lerp(6, 3, k); s = lerp(1, 1.04, k); }
  else if (t < 8.3) {
    // камера ныряет вниз: карточка уходит вверх, остаётся её нижний край
    const k = E.io(prog(t, 6.42, 6.74)), pan = E.io(prog(t, 6.9, 8.3));
    x = -30 - 260 * pan; y = lerp(0, -720, k); ry = -8 + 4 * pan; rx = 3; s = 1.04; b = Math.sin(k * Math.PI) * 14;
  } else if (t < 9.92) {
    // и возвращается обратно — уже перекрашенная
    const k = E.out(prog(t, 8.3, 8.72)), d = E.io(prog(t, 8.72, 9.92));
    x = lerp(-290, -40, k) - 40 * d; y = lerp(-900, 0, k) + 10 * d; ry = lerp(-4, -10, k) + 4 * d; rx = lerp(3, 4, k); s = lerp(1.04, 1, k) + 0.03 * d; b = (1 - k) * 18;
  } else { const k = E.inQ(prog(t, 9.92, 10.08)); x = -80; y = -60 * k; ry = -6; s = 1.03; b = k * 12; o = 1 - k; }
  card.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${s.toFixed(4)})`;
  card.style.filter = b > 0.05 ? `blur(${b.toFixed(1)}px)` : "none";
  card.style.opacity = o;
  // второй запрос: живёт под карточкой, пока камера внизу
  const kIn = E.io(prog(t, 6.42, 6.74)), kOut = E.io(prog(t, 8.3, 8.6));
  const pan = E.io(prog(t, 6.9, 8.3));
  const py = lerp(1300, 400, kIn) + lerp(0, 1000, kOut), px = 30 - 240 * pan;
  P2.g.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) scale(1.3)`;
  P2.g.style.opacity = t < 6.42 || t > 8.62 ? 0 : 1;
  P2.g.style.filter = (Math.sin(kIn * Math.PI) + Math.sin(kOut * Math.PI)) > 0.05 ? `blur(${((Math.sin(kIn * Math.PI) + Math.sin(kOut * Math.PI)) * 12).toFixed(1)}px)` : "none";
  P2.bg.style.opacity = 0.9; P2.ctr.style.opacity = 1;
  typeChars(P2.chars, t, 6.78, 7.62);
  const pr = clamp(prog(t, 7.94, 8.0) - prog(t, 8.04, 8.12));
  P2.send.style.transform = `scale(${(1 - 0.12 * pr).toFixed(3)})`;
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
  const on = t >= 10.05 && t < 11.75; show(s5, on); if (!on) return;
  const fade = 1 - prog(t, 11.52, 11.7);
  const rise = E.io(prog(t, 10.1, 11.6));
  const ly = lerp(380, 330, rise);
  const kL = E.out(prog(t, 10.08, 10.32));
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
  const on = t >= 13.0; show(s6, on); if (!on) return;
  // полоса: вспышка-штрих → два сдвинутых слоя → строка поиска
  const k1 = E.out(prog(t, 13.06, 13.24));
  const sw = BW * 0.95 * k1;
  streak.style.width = sw + "px"; streak.style.transform = `translateX(${-sw / 2}px)`;
  streak.style.opacity = t < 13.24 ? k1 : 0; streak.style.filter = `blur(${(1 - k1) * 6 + 1.5}px)`;
  const g = t >= 13.24 && t < 13.5;
  const j = Math.sin(t * 90) * 10;
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

window.renderAt = (t) => {
  drawBG(t); shimmer(t); drawSilk(t); drawS1(t); drawS2(t); drawS3(t); drawS4(t); drawS5(t); drawS6(t);
};
(async () => {
  await document.fonts.ready;
  await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
  layoutChips(); layoutLine();
  window.renderAt(0);
  window.ready = true;
})();
