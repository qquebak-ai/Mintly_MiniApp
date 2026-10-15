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
// Панель разделов — та же капсула, что внизу приложения: пять круглых
// кнопок, выбранная залита белым, на краю сидит Минти.
const CHIPS = ["home", "swap", "rocket", "bag", "bars"];
const КН = 132, ЗАЗОР_КН = 18, ПОЛЕ_КН = 20;
const row = $(`<div class="abs" style="left:0;top:0;width:${W}px;height:${КН}px"></div>`); s1.appendChild(row);
const capsule = $(`<div class="abs" style="left:0;top:${-ПОЛЕ_КН}px;height:${КН + ПОЛЕ_КН * 2}px;border-radius:999px;background:rgba(0,0,0,.22);backdrop-filter:blur(26px) saturate(1.5);-webkit-backdrop-filter:blur(26px) saturate(1.5);box-shadow:0 10px 30px rgba(0,0,0,.32)"></div>`); row.appendChild(capsule);
const navMintie = $(`<div class="abs" style="left:0;top:0;width:150px;height:164px;background:url(assets/app/nav-mint.webp) 0 0/1200% 100% no-repeat;image-rendering:pixelated"></div>`); row.appendChild(navMintie);
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
  row.style.transform = `translate3d(0,${H / 2 - КН / 2}px,0)`;
  const kC = prog(t, 1.36, 1.8);
  // капсула растёт из плашки до ширины всех кнопок
  const kCap = E.back(kC), full = chipX[4] + КН - chipX[0] + ПОЛЕ_КН * 2;
  const cw = lerp(Math.min(full, 380), full, kCap);
  capsule.style.width = cw + "px";
  S(capsule, { o: E.out(prog(t, 1.34, 1.46)), x: W / 2 - cw / 2 });
  // Минти на правом краю — дышит, как в приложении
  const кадр = Math.floor(((t * 12) % 12));
  navMintie.style.backgroundPosition = `${(кадр / 11) * 100}% 0`;
  S(navMintie, { o: E.out(prog(t, 1.6, 1.75)), x: W / 2 + cw / 2 - 190, y: -ПОЛЕ_КН - 164 + 40 });
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
  const on = t >= 2.58 && t < 4.62; show(s2, on); if (!on) return;
  S(glowTop, { o: (1 - E.out(prog(t, 3.5, 3.8))) * (0.8 + 0.2 * Math.sin(t * 6)) });
  typeChars(charsName, t, 2.7, 3.45);
  typeChars(charsTick, t, 3.92, 4.16);
  phName.style.display = t >= 2.7 ? "none" : ""; phTick.style.display = t >= 3.92 ? "none" : "";
  // крупно — одно поле «Название» во весь кадр, затем камера отъезжает к форме
  const k = E.io(prog(t, 3.48, 3.86));
  const big = { s: 4.2, x: 330 - 16 * 4.2, y: 470 - 238 * 4.2 };
  const small = { s: 2.0, x: (W - 393 * 2.0) / 2, y: 46 };
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
  const fly = E.inQ(prog(t, 4.38, 4.56));
  s2.style.transform = `scale(${(1 + 1.6 * fly).toFixed(4)})`; s2.style.transformOrigin = "960px 760px";
  s2.style.filter = fly > 0.01 ? `blur(${(fly * 16).toFixed(1)}px)` : "none";
  s2.style.opacity = 1 - fly;
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
  const on = t >= 4.44 && t < 5.5; show(s3, on); if (!on) return;
  const k = prog(t, 4.44, 5.5);
  const sp = 2600 * E.io(k) + 700 * k;
  rowEls.forEach((c) => {
    const z = c.z0 + sp;
    const near = clamp((z + 260) / 420), far = clamp((z + 2700) / 500);
    const o = far * (1 - clamp((z - 120) / 200)) * (1 - prog(t, 5.32, 5.5)) * prog(t, 4.44, 4.56);
    c.el.style.opacity = o.toFixed(3);
    c.el.style.visibility = o > 0.01 ? "visible" : "hidden";
    c.el.style.transform = `translate3d(${(960 + c.x).toFixed(1)}px,${(540 + c.y).toFixed(1)}px,${z.toFixed(1)}px)`;
    c.el.style.filter = `blur(${(near * 9 + (1 - far) * 4).toFixed(1)}px)`;
  });
}

// ===================== 4. КАРТА БАЛАНСА И МАГАЗИН =====================
// Карта — та, что открывает «Кошелёк»: баланс, монеты и Минти на краю.
// Второй ход — магазин: нажатие на «Лёд» перекрашивает Минти, а с ним и
// свечение карты.
const s4 = $(`<div class="scene" style="perspective:1700px;perspective-origin:960px 540px"></div>`); root.appendChild(s4);
const CW = 1240, CH = 690;
const card = $(`<div class="abs" style="left:${(W - CW) / 2}px;top:${(H - CH) / 2}px;width:${CW}px;height:${CH}px;transform-style:preserve-3d">
  <div class="abs" style="inset:0;border-radius:72px;overflow:hidden;background:linear-gradient(135deg, #22262F 0%, #181B23 55%, #12141A 100%)">
    <div class="ctint abs" style="inset:0"></div>
    <div class="abs" style="inset:0;border-radius:72px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.08),inset 0 2px 30px rgba(255,255,255,.06)"></div>
    <div class="abs" style="left:96px;top:84px;font:600 46px/1 'Onest';color:rgba(242,240,235,.82)">Баланс</div>
    <div class="abs" style="left:92px;top:150px;font:800 138px/1 'Nunito';letter-spacing:-.02em;color:#F2F0EB">$1 520<span style="color:rgba(242,240,235,.4)">,00</span></div>
    <div class="abs" style="left:96px;top:322px;display:flex;gap:22px;align-items:center">
      <img src="assets/tok/frog.png" style="width:84px;height:84px;border-radius:50%;image-rendering:pixelated"/>
      <div><div style="font:800 46px/1.1 'Nunito';color:#fff">Lily Frog</div><div style="font:500 32px/1.3 'Onest';color:#97958F">$LILY · 12 400 шт.</div></div>
      <div style="margin-left:40px;font:800 40px/1 'Nunito';color:#2EE87A">+12.6%</div>
    </div>
    <div class="abs" style="left:96px;top:530px;height:84px;padding:0 40px;border-radius:999px;background:rgba(255,255,255,.12);display:flex;align-items:center;font:600 36px/1 'Onest';color:#F2F0EB">4.9 SOL · 190 GRAM</div>
  </div>
  <div class="cmintie abs" style="right:90px;top:-232px;width:264px;height:288px;background:url(assets/app/nav-mint.webp) 0 0/1200% 100% no-repeat;image-rendering:pixelated"></div>
</div>`);
s4.appendChild(card);
const ctint = card.querySelector(".ctint"), cmintie = card.querySelector(".cmintie");
// магазин: плитки окрасов Минти, как в приложении
const ПЛИТКИ = [["gold", "Золотой", "260"], ["ice", "Лёд", "260"], ["albino", "Альбинос", "180"], ["wild", "Дикий", "200"]];
const shop = $(`<div class="abs" style="left:0;top:0;width:393px;height:300px;transform-origin:0 0">
  ${ПЛИТКИ.map(([id, имя, цена], i) => `<div class="tile abs" style="left:${16 + (i % 2) * 185}px;top:${Math.floor(i / 2) * 200}px;width:176px">
    <div class="tbox" style="height:128px;border-radius:18px;background:#000;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 0 #fff">
      <img src="assets/app/mintie-${id}.webp" style="width:118px;image-rendering:pixelated"/></div>
    <div style="text-align:center;font:800 14.5px/1 'Nunito';color:#F2F0EB;margin-top:14px">${имя}</div>
    <div style="text-align:center;font:700 12.5px/1 'Onest';color:#F2F0EB;margin-top:10px;opacity:.85">Ⓜ ${цена}</div></div>`).join("")}
</div>`);
s4.appendChild(shop);
const iceTile = shop.querySelectorAll(".tbox")[1];
const cur4 = cursor.cloneNode(true); s4.appendChild(cur4);
function cardGlow(c) { card.firstElementChild.style.boxShadow = `0 0 0 2px ${c}44, 0 0 70px ${c}66, 0 40px 120px rgba(0,0,0,.6)`; }
function drawS4(t) {
  const on = t >= 5.25 && t < 10.08; show(s4, on); if (!on) return;
  const лёд = t >= 8.36;
  const цвет = лёд ? "#7FD8FF" : "#2EE87A";
  ctint.style.background = `radial-gradient(70% 90% at 100% 0%, ${цвет}38 0%, ${цвет}10 45%, transparent 70%)`;
  cardGlow(цвет);
  cmintie.style.backgroundImage = `url(assets/app/nav-${лёд ? "ice" : "mint"}.webp)`;
  cmintie.style.backgroundPosition = `${((Math.floor(t * 12) % 12) / 11) * 100}% 0`;
  let x = 0, y = 0, ry = -8, rx = 4, s = 1, b = 0, o = 1;
  if (t < 5.66) { const k = E.out(prog(t, 5.25, 5.66)); x = lerp(1100, 40, k); ry = lerp(-62, -20, k); rx = lerp(10, 6, k); b = (1 - k) * 16; o = E.out(prog(t, 5.25, 5.4)); }
  else if (t < 6.42) { const k = E.out(prog(t, 5.66, 6.42)); x = lerp(40, -30, k); ry = lerp(-20, -8, k); rx = lerp(6, 3, k); s = lerp(1, 1.04, k); }
  else if (t < 8.3) {
    // камера ныряет вниз: карта уходит вверх, под ней — магазин
    const k = E.io(prog(t, 6.42, 6.74)), pan = E.io(prog(t, 6.9, 8.3));
    x = -30 - 260 * pan; y = lerp(0, -760, k); ry = -8 + 4 * pan; rx = 3; s = 1.04; b = Math.sin(k * Math.PI) * 14;
  } else if (t < 9.92) {
    // и возвращается — Минти уже ледяной
    const k = E.out(prog(t, 8.3, 8.72)), d = E.io(prog(t, 8.72, 9.92));
    x = lerp(-290, -40, k) - 40 * d; y = lerp(-900, 60, k) - 10 * d; ry = lerp(-4, -10, k) + 4 * d; rx = lerp(3, 4, k); s = lerp(1.04, 0.96, k) + 0.03 * d; b = (1 - k) * 18;
  } else { const k = E.inQ(prog(t, 9.92, 10.08)); x = -80; y = 60 - 60 * k; ry = -6; s = 0.99; b = k * 12; o = 1 - k; }
  if (t >= 5.66 && t < 6.42) y = 60;
  card.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${s.toFixed(4)})`;
  card.style.filter = b > 0.05 ? `blur(${b.toFixed(1)}px)` : "none";
  card.style.opacity = o;
  // магазин живёт под картой, пока камера внизу
  const kIn = E.io(prog(t, 6.42, 6.74)), kOut = E.io(prog(t, 8.3, 8.6));
  const pan = E.io(prog(t, 6.9, 8.3));
  const SS = 2.3;
  const py = lerp(1300, 300, kIn) + lerp(0, 1000, kOut), px = 360 - 200 * pan;
  shop.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) scale(${SS})`;
  shop.style.opacity = t < 6.42 || t > 8.62 ? 0 : 1;
  const bl = Math.sin(kIn * Math.PI) + Math.sin(kOut * Math.PI);
  shop.style.filter = bl > 0.05 ? `blur(${(bl * 12).toFixed(1)}px)` : "none";
  // курсор приходит к «Лёд» и нажимает
  const tileX = px + (16 + 185 + 88) * SS, tileY = py + 64 * SS;
  const kc = E.out(prog(t, 7.2, 7.75));
  const pr = clamp(prog(t, 7.9, 7.98) - prog(t, 8.02, 8.12));
  S(cur4, { o: t < 6.9 || t > 8.3 ? 0 : prog(t, 7.2, 7.3), x: lerp(tileX + 300, tileX - 10, kc), y: lerp(tileY + 500, tileY, kc), s: 1 - 0.12 * pr });
  const sel = E.out(prog(t, 7.95, 8.1));
  iceTile.style.boxShadow = `0 0 0 ${(3 * sel).toFixed(1)}px #fff, 0 0 ${(30 * sel).toFixed(0)}px rgba(127,216,255,${(0.7 * sel).toFixed(2)})`;
  iceTile.style.transform = `scale(${(1 - 0.05 * pr).toFixed(3)})`;
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
