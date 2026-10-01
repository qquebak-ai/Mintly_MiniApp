// Промо Mintly в духе воздушного продуктового ролика: белый и сиреневый
// воздух, кинетическая типографика по словам, глянцевые 3D-предметы,
// экраны приложения в телефоне, логотип и финал в облаках.
// Кадр зависит только от t — renderAt(t) можно звать в любом порядке.
"use strict";
const W = 1920, H = 1080, DUR = 45;
const root = document.getElementById("root");
const $ = (h) => { const d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstElementChild; };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const E = {
  out: (k) => 1 - Math.pow(1 - k, 3),
  outQ: (k) => 1 - Math.pow(1 - k, 5),
  io: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  back: (k) => { const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
  expo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  inQ: (k) => k * k * k,
};
function S(el, { o = 1, x = 0, y = 0, s = 1, r = 0, rx = 0, ry = 0, b = 0, sx = 1 } = {}) {
  el.style.opacity = o;
  el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotateX(${rx}deg) rotateY(${ry}deg) rotate(${r}deg) scale(${s})${sx !== 1 ? ` scaleX(${sx})` : ""}`;
  el.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none";
}
const scenes = [];
function scene(a, b, bg) { const el = $(`<div class="scene" style="background:${bg || "#fff"}"></div>`); root.appendChild(el); scenes.push({ el, a, b }); return el; }

// ---- кинетическая строка: слова по одному, *слово* — акцентом ----
function line(parent, text, { size = 72, top = 470, weight = 500, color = "#24104F", font = "Onest", ls = "-0.02em" } = {}) {
  const el = $(`<div class="c" style="top:${top}px;font:${weight} ${size}px '${font}';letter-spacing:${ls};color:${color};white-space:nowrap"></div>`);
  const spans = text.split(" ").map((w) => {
    const acc = w.startsWith("*"); w = w.replace(/\*/g, "");
    const s = $(`<span class="w${acc ? " accent" : ""}">${w}</span>`);
    return s;
  });
  spans.forEach((s, i) => { el.appendChild(s); if (i < spans.length - 1) el.appendChild(document.createTextNode(" ")); });
  parent.appendChild(el);
  el.spans = spans; return el;
}
function words(l, t, a, { stag = 0.11, dur = 0.75, out = null, outDur = 0.55, rise = 34 } = {}) {
  l.spans.forEach((w, i) => {
    const k = E.outQ(prog(t, a + i * stag, a + i * stag + dur));
    let o = k, y = (1 - k) * rise, b = (1 - k) * 16, s = 1;
    if (out != null) { const q = E.io(prog(t, out + i * 0.05, out + i * 0.05 + outDur)); o *= 1 - q; b += q * 18; y -= q * 26; s = 1 + q * 0.06; }
    S(w, { o, y, b, s });
  });
}
const img = (src, css = "") => $(`<img src="${src}" style="position:absolute;${css}" />`);

// ---- фон: мягкие сиреневые пятна и туман снизу ----
function blobs(parent, list) {
  return list.map(([x, y, r, c]) => { const b = $(`<div class="blob" style="left:${x - r}px;top:${y - r}px;width:${r * 2}px;height:${r * 2}px;background:${c}"></div>`); parent.appendChild(b); return b; });
}
function fog(parent) {
  const f = $(`<div class="fog"></div>`);
  const parts = [[-2, 120, 520, "#C9A8FF"], [14, 70, 420, "#E7C6FF"], [30, 130, 560, "#B48CFF"], [47, 60, 460, "#F1D2FF"], [63, 120, 540, "#C29BFF"], [80, 70, 440, "#E9C9FF"], [96, 120, 520, "#BC94FF"]];
  f.parts = parts.map(([x, y, w, c]) => { const s = $(`<span style="left:${x}%;top:${y}px;width:${w}px;height:${w * 0.55}px;background:${c};opacity:.75"></span>`); f.appendChild(s); return s; });
  parent.appendChild(f); return f;
}
function fogMove(f, t) { f.parts.forEach((p, i) => { p.style.transform = `translate(${Math.sin(t * 0.5 + i) * 40}px,${Math.cos(t * 0.4 + i * 1.7) * 18}px)`; }); }

// ---- данные приложения ----
const SOL = [118.04, 118.65, 119.93, 119.24, 119.69, 119.93, 118.83, 118.31, 118.75, 118.23, 117.68, 118.55, 118.91, 118.73, 118.09, 116.7, 117.12, 116.59, 117.84, 117.8, 117.65, 118.21, 119.0, 119.2, 119.49, 119.56, 119.13, 119.87, 119.63, 119.27, 120.11, 120.87, 121.17, 120.48];
const TON = [1.616, 1.605, 1.641, 1.651, 1.648, 1.649, 1.645, 1.616, 1.601, 1.605, 1.582, 1.568, 1.563, 1.574, 1.576, 1.565, 1.546, 1.555, 1.535, 1.54, 1.551, 1.57, 1.558, 1.55, 1.561, 1.58, 1.591, 1.597, 1.588, 1.58, 1.572, 1.58, 1.561, 1.543];
function spark(arr, w, h, col) {
  const mn = Math.min(...arr), mx = Math.max(...arr);
  const p = arr.map((v, i) => `${(i / (arr.length - 1) * w).toFixed(1)},${(h - (v - mn) / (mx - mn) * h).toFixed(1)}`).join(" ");
  return `<svg width="${w}" height="${h + 4}" viewBox="0 -2 ${w} ${h + 4}"><polyline points="${p}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
const GRAD = "linear-gradient(115deg,#E44BC8 0%,#C13AE6 18%,#8E2DE2 36%,#6A17E8 54%,#4A00E0 70%,#7B1FE0 84%,#2C0A78 100%)";
const ICON = {
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
  swap: '<path d="M5 8h13l-3-3M19 16H6l3 3"/>',
  rocket: '<path d="M12 3c4 3 5 8 3 12H9C7 11 8 6 12 3zM9 15l-3 4M15 15l3 4"/>',
  bag: '<path d="M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0"/>',
  bars: '<path d="M6 19V11M12 19V5M18 19v-6"/>',
};
const icon = (n, c = "#fff", s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;
function navBar(active) {
  return `<div style="position:absolute;left:50%;bottom:22px;transform:translateX(-50%);display:flex;gap:8px;padding:8px;border-radius:999px;background:rgba(255,255,255,.07)">
    ${["home", "swap", "rocket", "bag", "bars"].map((n) => `<div style="width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${n === active ? "#fff" : "transparent"}">${icon(n, n === active ? "#0B0A12" : "#8F8AA8", 22)}</div>`).join("")}
    <div style="position:absolute;right:20px;bottom:calc(100% - 14px);width:62px;height:68px;background:url(assets/app/nav-breath.webp) 0 0/1200% 100% no-repeat;image-rendering:pixelated"></div>
  </div>`;
}
function phone(content) {
  return $(`<div class="phone"><div class="btn" style="left:-4px;top:200px;height:70px"></div><div class="btn" style="left:-4px;top:290px;height:70px"></div><div class="btn" style="right:-4px;top:250px;height:110px"></div>
    <div class="scr"><div class="island"></div><div class="sb"><span>9:41</span><span style="letter-spacing:2px">▮▮▮</span></div>${content}</div></div>`);
}
const homeScreen = `<div class="app">
  <div style="display:flex;align-items:center;gap:12px;margin:6px 4px 18px">
    <div style="width:44px;height:44px;border-radius:50%;background:${GRAD}"></div>
    <div style="font:800 20px 'Nunito'">@moonboy</div><div style="margin-left:auto;width:40px;height:40px;border-radius:50%;background:#15131F"></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    ${[["SOL", "$120.48", "+2.07%", "#00E96B", SOL], ["GRAM", "$1.543", "−4.52%", "#FF3B47", TON]].map(([n, p, c, col, a]) => `<div class="card" style="height:150px;padding:14px">
      <div style="display:flex;justify-content:space-between;font:800 17px 'Nunito'"><span>${n}</span><span style="color:${col};font-size:14px">${c}</span></div>
      <div style="font:800 22px 'Nunito';margin-top:4px">${p}</div><div style="position:absolute;left:12px;right:12px;bottom:18px">${spark(a, 150, 40, col)}</div></div>`).join("")}
  </div>
  <div class="card" style="height:156px;margin-top:22px;background:#000">
    <div style="position:absolute;right:0;bottom:0;height:100%;aspect-ratio:120/50">
      <img src="assets/app/banner-mx-trade.webp" style="position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated"/>
      <img src="assets/app/mintie-trade.webp" style="position:absolute;left:${92 / 1.2}%;top:${2.5 * 2}%;width:${28 / 1.2}%;height:${25.2 * 2}%;image-rendering:pixelated"/></div>
    <div style="position:absolute;left:18px;top:14px;font:800 22px/1.15 'Nunito'">Trade memecoins<br/><span class="accent">Gram &amp; Solana</span></div>
    <div style="position:absolute;left:18px;bottom:16px;padding:9px 14px;border-radius:12px;background:#8E2DE2;font:800 13px 'Nunito'">Open mempad</div></div>
  <div class="card" style="height:156px;margin-top:12px;background:#000">
    <img src="assets/app/banner-mountain.webp" style="position:absolute;right:-6%;bottom:-14%;width:52%;image-rendering:pixelated"/>
    <div style="position:absolute;left:18px;top:14px;font:800 22px/1.15 'Nunito'">Launch a memecoin<br/><span class="accent">in seconds</span></div></div>
  ${navBar("home")}
</div>`;
const createScreen = `<div class="app">
  <div style="font:800 30px 'Nunito';margin:8px 4px 18px">Launch token</div>
  <div style="display:flex;gap:14px;align-items:center">
    <div id="cLogo" style="width:96px;height:96px;border-radius:26px;background:#15131F;border:2px dashed #3A3555;position:relative;overflow:hidden"><img src="assets/coin.png" style="position:absolute;inset:8px;width:80px;height:80px;object-fit:contain;opacity:0" /></div>
    <div style="color:#8F8AA8;font:500 15px 'Onest'">Logo<br/>tap to upload</div></div>
  ${[["Name", "cName"], ["Ticker", "cTick"]].map(([l, id]) => `<div style="margin-top:16px;color:#8F8AA8;font:500 14px 'Onest'">${l}</div>
    <div class="card" style="height:56px;margin-top:6px;padding:0 16px;display:flex;align-items:center;font:700 19px 'Onest'"><span id="${id}"></span><span id="${id}C" style="width:2px;height:24px;background:#B45CFF;margin-left:2px"></span></div>`).join("")}
  <div style="margin-top:16px;display:flex;gap:8px"><div class="pill" style="padding:10px 18px;background:#fff;color:#0B0A12;font:800 15px 'Nunito'">GRAM</div><div class="pill" style="padding:10px 18px;background:#15131F;color:#8F8AA8;font:800 15px 'Nunito'">SOL</div></div>
  <div style="margin-top:16px;color:#8F8AA8;font:500 14px 'Onest'">First buy</div>
  <div class="card" style="height:56px;margin-top:6px;padding:0 16px;display:flex;align-items:center;font:700 19px 'Onest'">1.5 GRAM</div>
  <div id="cBtn" style="margin-top:22px;height:62px;border-radius:22px;background:${GRAD};display:flex;align-items:center;justify-content:center;font:800 20px 'Nunito'">Launch</div>
  <div id="cDone" style="position:absolute;inset:0;background:rgba(7,6,12,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;opacity:0">
    <img src="assets/coin.png" style="width:150px" /><div style="font:800 30px 'Nunito'">Moon Cat is live</div><div style="color:#2EE87A;font:700 17px 'Onest'">MCAT · on-chain in 1.2s</div></div>
</div>`;
// свечи графика токена: растут вверх с откатами
const CANDLES = (() => { let v = 40, s = 7; const out = []; for (let i = 0; i < 26; i++) { s = (s * 16807) % 2147483647; const r = s / 2147483647; const o = v; v = v + (r - 0.32) * 9 + i * 0.25; out.push([o, v, Math.max(o, v) + r * 4, Math.min(o, v) - (1 - r) * 4]); } return out; })();
function chartSVG(n, w = 352, h = 300) {
  const all = CANDLES.flat(), mn = Math.min(...all), mx = Math.max(...all), py = (v) => h - 10 - (v - mn) / (mx - mn) * (h - 20);
  const cw = w / CANDLES.length;
  return `<svg width="${w}" height="${h}">${CANDLES.slice(0, n).map(([o, c, hi, lo], i) => { const up = c >= o, col = up ? "#2EE87A" : "#FF3B47", x = i * cw + cw / 2; return `<line x1="${x}" x2="${x}" y1="${py(hi)}" y2="${py(lo)}" stroke="${col}" stroke-width="2"/><rect x="${x - cw * 0.32}" y="${Math.min(py(o), py(c))}" width="${cw * 0.64}" height="${Math.max(3, Math.abs(py(o) - py(c)))}" rx="2" fill="${col}"/>`; }).join("")}</svg>`;
}
const tokenScreen = `<div class="app">
  <div style="display:flex;align-items:center;gap:12px;margin:8px 4px 14px"><img src="assets/coin.png" style="width:52px" />
    <div><div style="font:800 22px 'Nunito'">Moon Cat</div><div style="color:#8F8AA8;font:600 14px 'Onest'">MCAT · GRAM</div></div></div>
  <div style="font:800 36px 'Nunito';margin:0 4px"><span id="tPrice">$0.000214</span> <span id="tChg" style="font-size:18px;color:#2EE87A">+38.2%</span></div>
  <div class="card" style="height:310px;margin-top:14px;background:#0F0D18"><div id="tChart" style="position:absolute;left:0;top:4px"></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
    <div id="tBuy" style="height:62px;border-radius:20px;background:#00C853;display:flex;align-items:center;justify-content:center;font:800 20px 'Nunito';color:#04210F">Buy</div>
    <div style="height:62px;border-radius:20px;background:#FF3B47;display:flex;align-items:center;justify-content:center;font:800 20px 'Nunito'">Sell</div></div>
  <div class="card" style="margin-top:12px;height:52px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;font:600 15px 'Onest'"><span style="color:#8F8AA8">Platform fee</span><span style="color:#2EE87A;font:800 17px 'Nunito'">0%</span></div>
  <div id="tToast" style="position:absolute;left:18px;right:18px;top:70px;height:64px;border-radius:20px;background:#fff;color:#0B0A12;display:flex;align-items:center;gap:12px;padding:0 16px;font:700 16px 'Onest';opacity:0">
    <div style="width:30px;height:30px;border-radius:50%;background:#00C853;color:#fff;display:flex;align-items:center;justify-content:center;font:800 18px 'Nunito'">✓</div>Bought 1.2M MCAT · fee 0%</div>
</div>`;

// ============ A · ИНТРО 0–5.2 ============
const A = scene(0, 5.4, "#F6F0FF");
const aBlobs = blobs(A, [[300, 250, 420, "#D9C2FF"], [1650, 220, 380, "#FFD3EF"], [960, 1050, 520, "#C7A6FF"], [1500, 900, 360, "#FFE1C7"], [400, 950, 360, "#E8D6FF"]]);
const aWord = $(`<div class="c" style="top:40px;font:800 300px/1 'Nunito';letter-spacing:-0.04em;white-space:nowrap"></div>`); A.appendChild(aWord);
const aLetters = [..."Mintly"].map((ch, i) => { const s = $(`<span class="w" style="background:linear-gradient(95deg,#6D28FF,#A855F7 40%,#FF7AD9 80%,#FFB36B);background-size:600% 100%;background-position:${i * 20}% 0;-webkit-background-clip:text;background-clip:text;color:transparent">${ch}</span>`); aWord.appendChild(s); return s; });
const aPhoneWrap = $(`<div class="abs" style="left:750px;top:345px;width:420px;height:868px;perspective:1600px"></div>`); A.appendChild(aPhoneWrap);
const aPhone = phone(homeScreen); aPhoneWrap.appendChild(aPhone);
const OBJS = [
  ["coin", 520, 300, 200, 1.2, -12], ["candleUp", 1330, 330, 150, 1.35, 14], ["gem", 470, 640, 150, 1.5, 8], ["star", 1420, 640, 150, 1.6, -10],
  ["bolt", 640, 830, 140, 1.75, 6], ["rocket", 1250, 820, 190, 1.85, -6], ["zero", 300, 470, 190, 2.0, -8], ["leaf", 1600, 450, 150, 2.1, 12],
];
const aObjs = OBJS.map(([n, x, y, w, d, r]) => { const o = img(`assets/${n}.png`, `left:${x - w / 2}px;top:${y - w / 2}px;width:${w}px;height:${w}px;object-fit:contain`); A.appendChild(o); o.d = d; o.r = r; o.x0 = x; o.y0 = y; return o; });

// ============ B · ПРОБЛЕМА 5.2–15 ============
const B = scene(5.2, 15.1, "#ffffff");
const bFog = fog(B);
const b1 = line(B, "Every day, there's a new *memecoin*", { top: 470 });
const b1Icons = ["coin", "candleUp", "gem", "star", "rocket", "candleDown"].map((n, i) => { const o = img(`assets/${n}.png`, `left:0;top:0;width:64px;height:64px;object-fit:contain`); B.appendChild(o); return o; });
const b2 = line(B, "Fees eat your *gains.*", { top: 470, size: 84 });
const b2Icon = img("assets/candleDown.png", "left:1340px;top:380px;width:150px;height:200px;object-fit:contain"); B.appendChild(b2Icon);
const b3 = $(`<div class="c" style="top:462px;font:500 88px 'Onest';letter-spacing:-0.02em">Trades take <span class="accent" id="fev" style="display:inline-block">forever.</span></div>`); B.appendChild(b3);
const b4 = line(B, "You just want to trade?", { top: 500, size: 44, color: "#8A7BB0" });
const b5 = line(B, "Then meet *Mintly.*", { top: 488, size: 60 });
// коллаж карточек на орбите
const CARDS = [];
function addCard(html, w, h) { const c = $(`<div class="abs" style="left:${-w / 2}px;top:${-h / 2}px;width:${w}px;height:${h}px;border-radius:22px;overflow:hidden;box-shadow:0 24px 50px rgba(80,30,160,.18)">${html}</div>`); B.appendChild(c); CARDS.push(c); }
addCard(`<img src="assets/app/banner-mx-trade.webp" style="width:100%;height:100%;object-fit:cover;object-position:right;image-rendering:pixelated"/>`, 300, 130);
addCard(`<div style="width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center"><img src="assets/app/gold-preview.webp" style="height:85%;image-rendering:pixelated"/></div>`, 150, 150);
addCard(`<div style="width:100%;height:100%;background:${GRAD};padding:16px;color:#fff"><div style="font:500 14px Onest;opacity:.85">Balance</div><div style="font:800 34px Nunito">$1 284.50</div><div style="position:absolute;left:16px;bottom:14px;font:700 13px Onest">12.4 SOL · 8 420 GRAM</div></div>`, 290, 170);
addCard(`<div style="width:100%;height:100%;background:#fff;padding:12px">${chartSVG(26, 236, 120)}</div>`, 260, 150);
addCard(`<div style="width:100%;height:100%;background:#15131F;padding:14px;color:#fff;display:flex;gap:12px;align-items:center"><img src="assets/coin.png" style="width:56px"/><div><div style="font:800 20px Nunito">Moon Cat</div><div style="color:#2EE87A;font:700 15px Onest">+38.2%</div></div></div>`, 250, 90);
addCard(`<div style="width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center"><img src="assets/app/violet-preview.webp" style="height:85%;image-rendering:pixelated"/></div>`, 140, 140);
addCard(`<img src="assets/app/banner-mx-shop.webp" style="width:100%;height:100%;object-fit:cover;object-position:right;image-rendering:pixelated"/>`, 280, 120);
addCard(`<div style="width:100%;height:100%;background:#fff;display:flex;align-items:center;justify-content:center"><img src="assets/zero.png" style="width:78%"/></div>`, 170, 130);
addCard(`<div style="width:100%;height:100%;background:#15131F;padding:16px;color:#fff"><div style="font:800 17px Nunito;display:flex;justify-content:space-between">SOL<span style="color:#00E96B;font-size:14px">+2.07%</span></div><div style="font:800 24px Nunito">$120.48</div><div style="margin-top:8px">${spark(SOL, 180, 34, "#00E96B")}</div></div>`, 210, 130);
addCard(`<img src="assets/app/banner-mx-fast.webp" style="width:100%;height:100%;object-fit:cover;object-position:right;image-rendering:pixelated"/>`, 280, 120);
addCard(`<div style="width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center"><img src="assets/app/neon-preview.webp" style="height:85%;image-rendering:pixelated"/></div>`, 140, 140);
addCard(`<div style="width:100%;height:100%;background:#fff;display:flex;align-items:center;justify-content:center"><img src="assets/rocket.png" style="height:84%"/></div>`, 150, 150);

// ============ C · SIMPLE + ЛОГОТИП 15–19.6 ============
const C = scene(15, 19.7, "#ffffff");
const cBlobs = blobs(C, [[400, 900, 420, "#E3D0FF"], [1550, 200, 380, "#FFDDF3"], [1600, 950, 340, "#D9C2FF"]]);
const cGuides = [];
for (let i = 0; i < 9; i++) { const g = $(`<div class="guide" style="left:${330 + i * 160}px;top:0;width:1px;height:1080px"></div>`); C.appendChild(g); cGuides.push(g); }
[[420], [640]].forEach(([y]) => { const g = $(`<div class="guide" style="left:0;top:${y}px;width:1920px;height:1px"></div>`); C.appendChild(g); cGuides.push(g); });
const cWord = $(`<div class="c" style="top:390px;font:800 230px/1 'Nunito';letter-spacing:-0.03em;color:#24104F;white-space:nowrap"></div>`); C.appendChild(cWord);
const cLetters = [..."Simple."].map((ch) => { const s = $(`<span class="w">${ch}</span>`); cWord.appendChild(s); return s; });
const LOGO = `<svg viewBox="0 0 64 64" width="100%" height="100%"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C3AED"/><stop offset=".6" stop-color="#C13AE6"/><stop offset="1" stop-color="#FF6AD5"/></linearGradient></defs>
  <path d="M12 56 V28 L32 45 L52 28 V56" fill="none" stroke="url(#lg)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  <g transform="translate(52,26) rotate(34)"><path d="M0 0 C -8 -7 -8 -19 0 -26 C 8 -19 8 -7 0 0 Z" fill="#3FD9A0"/></g></svg>`;
const cRing = $(`<svg class="abs" style="left:900px;top:480px;width:120px;height:120px;overflow:visible" viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" fill="none" stroke="url(#rg)" stroke-width="14" stroke-linecap="round" stroke-dasharray="302" stroke-dashoffset="302" transform="rotate(-90 60 60)"/>
  <defs><linearGradient id="rg"><stop offset="0" stop-color="#7C3AED"/><stop offset="1" stop-color="#FF6AD5"/></linearGradient></defs></svg>`); C.appendChild(cRing);
const cLogo = $(`<div class="abs" style="left:880px;top:450px;width:160px;height:160px">${LOGO}</div>`); C.appendChild(cLogo);
const cName = $(`<div class="abs" style="left:1060px;top:452px;font:800 150px/1 'Nunito';letter-spacing:-0.04em;color:#24104F;clip-path:inset(0 100% 0 0)">Mintly</div>`); C.appendChild(cName);

// ============ D · ВОЗМОЖНОСТИ 19.6–37 ============
const D = scene(19.5, 37.1, "#ffffff");
const dFog = fog(D);
const dBlobs = blobs(D, [[1500, 250, 420, "#EBDDFF"], [350, 300, 360, "#FFE3F4"]]);
// D1 — запуск
const d1Wrap = $(`<div class="abs" style="left:300px;top:150px;width:420px;height:868px;perspective:1800px"></div>`); D.appendChild(d1Wrap);
const d1Phone = phone(createScreen); d1Wrap.appendChild(d1Phone);
const d1T1 = line(D, "Launch a *memecoin*", { top: 400, size: 92, weight: 600 }); d1T1.style.left = "860px"; d1T1.style.textAlign = "left";
const d1T2 = line(D, "in seconds.", { top: 520, size: 92, weight: 600, color: "#8A7BB0" }); d1T2.style.left = "860px"; d1T2.style.textAlign = "left";
const d1Rocket = img("assets/rocket.png", "left:0;top:0;width:230px"); D.appendChild(d1Rocket);
// D2 — торговля
const d2Wrap = $(`<div class="abs" style="left:1200px;top:150px;width:420px;height:868px;perspective:1800px"></div>`); D.appendChild(d2Wrap);
const d2Phone = phone(tokenScreen); d2Wrap.appendChild(d2Phone);
const d2T1 = line(D, "Trade with", { top: 330, size: 92, weight: 600 }); d2T1.style.right = "900px"; d2T1.style.left = "auto"; d2T1.style.textAlign = "right"; d2T1.style.width = "900px";
const d2Zero = img("assets/zero.png", "left:330px;top:450px;width:420px"); D.appendChild(d2Zero);
const d2T2 = line(D, "*fees.*", { top: 470, size: 92, weight: 600 }); d2T2.style.left = "780px"; d2T2.style.right = "auto"; d2T2.style.textAlign = "left";
const d2Objs = [["candleUp", 230, 760, 130], ["coin", 760, 760, 120]].map(([n, x, y, w]) => { const o = img(`assets/${n}.png`, `left:${x}px;top:${y}px;width:${w}px`); D.appendChild(o); return o; });
// D3 — скорость
const d3 = $(`<div class="c" style="top:400px;font:700 120px/1.05 'Nunito';letter-spacing:-0.035em;color:#24104F"><div id="d3a" style="display:inline-block">Fastest transactions</div><br/><div id="d3b" style="display:inline-block" class="accent">in the world.</div></div>`); D.appendChild(d3);
const d3Bolt = img("assets/bolt.png", "left:1460px;top:200px;width:300px"); D.appendChild(d3Bolt);
const d3Trails = [0, 1, 2, 3].map((i) => { const tr = $(`<div class="c" style="top:400px;font:700 120px/1.05 'Nunito';letter-spacing:-0.035em;color:#B48CFF;opacity:0">Fastest transactions</div>`); D.appendChild(tr); return tr; });
// D4 — кошелёк
const d4Wrap = $(`<div class="abs" style="left:420px;top:330px;width:620px;height:390px;perspective:1600px"></div>`); D.appendChild(d4Wrap);
const d4Card = $(`<div style="position:relative;width:100%;height:100%;transform-style:preserve-3d"></div>`); d4Wrap.appendChild(d4Card);
for (let i = 0; i < 14; i++) d4Card.appendChild($(`<div style="position:absolute;inset:0;border-radius:40px;background:linear-gradient(rgba(0,0,0,.3),rgba(0,0,0,.3)),${GRAD};transform:translateZ(${(-7 + i).toFixed(1)}px)"></div>`));
d4Card.appendChild($(`<div style="position:absolute;inset:0;border-radius:40px;background:${GRAD};background-size:160% 160%;transform:translateZ(7.5px);backface-visibility:hidden;padding:34px 40px;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.3)">
  <div style="font:600 30px 'Onest';opacity:.9">Balance</div><div style="font:800 96px/1.1 'Nunito';letter-spacing:-0.03em">$1 284.50</div>
  <div class="pill" style="position:absolute;left:40px;bottom:34px;padding:12px 22px;background:rgba(255,255,255,.18);font:700 24px 'Onest'">12.4 SOL · 8 420 GRAM</div></div>`));
d4Card.appendChild($(`<div style="position:absolute;inset:0;border-radius:40px;background:${GRAD};transform:rotateY(180deg) translateZ(7.5px);backface-visibility:hidden"></div>`));
const d4Mintie = $(`<div class="abs" style="left:430px;top:-118px;width:140px;height:153px;background:url(assets/app/nav-breath.webp) 0 0/1200% 100% no-repeat;image-rendering:pixelated"></div>`); d4Card.appendChild(d4Mintie);
const d4T1 = line(D, "Your wallet.", { top: 410, size: 96, weight: 600 }); d4T1.style.left = "1130px"; d4T1.style.textAlign = "left";
const d4T2 = line(D, "Right inside *Telegram.*", { top: 530, size: 64, weight: 500, color: "#8A7BB0" }); d4T2.style.left = "1134px"; d4T2.style.textAlign = "left";
// D5 — печать
const d5 = $(`<div class="c" style="top:450px;font:600 120px/1 'Onest';letter-spacing:-0.035em;color:#24104F"><span id="d5t"></span><span id="d5c" style="display:inline-block;width:6px;height:110px;background:#8E2DE2;margin-left:6px;vertical-align:-12px"></span></div>`); D.appendChild(d5);

// ============ E · ФИНАЛ 37–45 ============
const Esc = scene(37, 45, "#9FC0EA");
const eSky = img("assets/clouds.jpg", "left:-60px;top:-40px;width:2040px;height:1190px;object-fit:cover"); Esc.appendChild(eSky);
const eRing = $(`<svg class="abs" style="left:780px;top:330px;width:160px;height:160px;overflow:visible" viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-dasharray="302" stroke-dashoffset="302" transform="rotate(-90 60 60)"/></svg>`); Esc.appendChild(eRing);
const eLogo = $(`<div class="abs" style="left:770px;top:320px;width:180px;height:180px;filter:drop-shadow(0 10px 30px rgba(60,40,140,.35))">${LOGO.replace('fill="#3FD9A0"', 'fill="#ffffff"').replace(/url\(#lg\)/, "#ffffff")}</div>`); Esc.appendChild(eLogo);
const eName = $(`<div class="abs" style="left:975px;top:330px;font:800 160px/1 'Nunito';letter-spacing:-0.04em;color:#fff;text-shadow:0 10px 40px rgba(60,40,140,.35);clip-path:inset(0 100% 0 0)">Mintly</div>`); Esc.appendChild(eName);
const ePill = $(`<div class="abs" style="left:50%;top:600px;transform:translateX(-50%);display:flex;align-items:center;gap:18px;padding:22px 38px 22px 26px;border-radius:999px;background:rgba(255,255,255,.88);box-shadow:0 20px 60px rgba(60,40,140,.25);white-space:nowrap">
  <div style="width:62px;height:62px;border-radius:50%;background:#2AABEE;display:flex;align-items:center;justify-content:center"><svg width="34" height="34" viewBox="0 0 24 24"><path d="M3 11.5 20 4.5l-3 15-5-4-3 3 .4-4.6L17 7.5 8 13z" fill="#fff"/></svg></div>
  <div><div style="font:500 26px 'Onest';color:#5B4E80">Open in Telegram</div><div style="font:800 40px 'Nunito';color:#24104F">@MintlyTrading_bot</div></div></div>`); Esc.appendChild(ePill);
const eTag = line(Esc, "Launch. Trade. *Moon.*", { top: 820, size: 46, weight: 600, color: "#2E2160" });

const flash = document.getElementById("flash"), fade = document.getElementById("fade");
function typeText(el, str, t, a, cps = 14) { const n = Math.floor(clamp((t - a) * cps, 0, str.length)); el.textContent = str.slice(0, n); return n; }

window.renderAt = (t) => {
  scenes.forEach(({ el, a, b }) => { el.style.visibility = t >= a && t < b ? "visible" : "hidden"; });

  // ---- A ----
  if (t < 5.4) {
    aBlobs.forEach((b, i) => { b.style.transform = `translate(${Math.sin(t * 0.6 + i * 2) * 60}px,${Math.cos(t * 0.5 + i) * 40}px)`; });
    aLetters.forEach((l, i) => { const k = prog(t, 0.7 + i * 0.07, 1.5 + i * 0.07); S(l, { o: E.out(k), y: (1 - E.back(k)) * 120, s: 0.7 + 0.3 * E.back(k), b: (1 - k) * 20 }); });
    const pk = E.expo(prog(t, 0.1, 1.9));
    const out = E.inQ(prog(t, 4.75, 5.4));
    S(aPhone, { y: lerp(520, 0, pk) + Math.sin(t * 1.1) * 8, rx: lerp(28, 8, pk), ry: lerp(-22, -9, pk) + Math.sin(t * 0.7) * 2, r: lerp(-6, -2, pk) });
    aObjs.forEach((o) => { const k = prog(t, o.d, o.d + 0.6); const f = Math.sin(t * 1.3 + o.d * 3); S(o, { o: clamp(k * 3), s: E.back(k) * (1 + out * 0.4), r: o.r + f * 4, y: f * 14 + (o.y0 - 540) * out * 0.6, x: (o.x0 - 960) * out * 0.6, b: out * 14 }); });
    aWord.style.transform = `scale(${1 + out * 0.25})`; aWord.style.filter = out > 0 ? `blur(${out * 18}px)` : "none";
    aPhoneWrap.style.transform = `scale(${1 + out * 0.5}) translateY(${out * 200}px)`; aPhoneWrap.style.filter = out > 0 ? `blur(${out * 14}px)` : "none";
    A.style.opacity = 1 - prog(t, 5.15, 5.4);
  }
  // ---- B ----
  if (t >= 5.2 && t < 15.1) {
    fogMove(bFog, t);
    words(b1, t, 5.35, { out: 7.9 });
    const sp = b1.spans;
    // значки разлетаются из слов, когда строка рассыпается
    b1Icons.forEach((ic, i) => {
      const k = E.out(prog(t, 7.75 + i * 0.05, 8.5 + i * 0.05)), app = E.back(prog(t, 6.6 + i * 0.12, 7.1 + i * 0.12));
      const bx = 520 + i * 160, by = 380 + (i % 2) * 220;
      const fx = bx + Math.cos(i * 1.7) * 260 * k, fy = by + Math.sin(i * 2.3) * 160 * k - k * 40;
      S(ic, { o: clamp(app * 2) * (1 - prog(t, 8.3, 8.7)), x: fx, y: fy, s: app * (1 - 0.3 * k), r: i * 20 + k * 60 });
    });
    words(b2, t, 8.6, { out: 10.25 });
    const k2 = E.back(prog(t, 9.3, 9.9)); S(b2Icon, { o: clamp(k2 * 2) * (1 - prog(t, 10.2, 10.55)), y: (1 - k2) * -200 + prog(t, 9.9, 10.5) * 60, r: 18 * k2 });
    { const k = E.outQ(prog(t, 10.55, 11.2)), q = E.io(prog(t, 11.9, 12.3)); S(b3, { o: k * (1 - q), y: (1 - k) * 30, b: (1 - k) * 14 + q * 16 });
      const fev = document.getElementById("fev"); fev.style.letterSpacing = `${lerp(-0.02, 0.32, E.io(prog(t, 11.0, 11.9)))}em`; }
    words(b4, t, 12.25, { out: 13.65, stag: 0.06 });
    words(b5, t, 13.85, { out: 14.75, stag: 0.1 });
    // орбита карточек вокруг текста
    const ok = E.expo(prog(t, 12.2, 13.3)), oq = E.inQ(prog(t, 14.4, 15.05));
    CARDS.forEach((c, i) => {
      const a = (i / CARDS.length) * Math.PI * 2 + t * 0.32;
      const rr = lerp(1500, 1, ok) * (1 - oq) + 1 - (1 - oq);
      const R = lerp(1500, 690, ok) * (1 - oq * 0.95);
      const x = 960 + Math.cos(a) * R, y = 540 + Math.sin(a) * R * 0.42, dz = (Math.sin(a) + 1) / 2;
      c.style.zIndex = Math.round(dz * 10);
      S(c, { o: clamp(ok * 1.6) * (1 - oq), x, y, s: (0.72 + dz * 0.4) * (1 - oq * 0.6), r: Math.cos(a) * 6, b: (1 - dz) * 2.5 + oq * 10 });
      void rr;
    });
    B.style.opacity = 1 - prog(t, 14.9, 15.1);
  }
  // ---- C ----
  if (t >= 15 && t < 19.7) {
    cBlobs.forEach((b, i) => { b.style.transform = `translate(${Math.sin(t * 0.6 + i) * 50}px,${Math.cos(t * 0.5 + i) * 30}px)`; });
    const sp = E.io(prog(t, 15.4, 16.5)), inK = E.outQ(prog(t, 15.0, 15.5)), coll = E.inQ(prog(t, 16.75, 17.25));
    cLetters.forEach((l, i) => { const off = (i - 3) * 150 * (1 - sp); const cx = (i - 3) * -110 * coll; S(l, { o: inK * (1 - coll), x: off + cx, y: (1 - inK) * 40, b: (1 - inK) * 12 + coll * 10, s: 1 - coll * 0.7 }); });
    cGuides.forEach((g, i) => { g.style.opacity = clamp(prog(t, 15.0 + i * 0.03, 15.4 + i * 0.03)) * (1 - prog(t, 16.3, 16.8)); });
    const ring = prog(t, 17.1, 17.9); cRing.firstElementChild.setAttribute("stroke-dashoffset", (302 * (1 - E.io(ring))).toFixed(1));
    const rOut = E.io(prog(t, 17.9, 18.3)); S(cRing, { o: (ring > 0 ? 1 : 0) * (1 - rOut), s: 1 + rOut * 0.4 });
    const lk = E.back(prog(t, 18.0, 18.6)); S(cLogo, { o: clamp(lk * 2), s: lk, r: (1 - lk) * -30, x: -140 * E.io(prog(t, 18.6, 19.2)) });
    const nk = E.io(prog(t, 18.65, 19.3)); cName.style.clipPath = `inset(0 ${(100 - nk * 100).toFixed(1)}% 0 0)`; S(cName, { x: -140 * nk + (1 - nk) * -40 });
    C.style.opacity = 1 - prog(t, 19.5, 19.7);
  }
  // ---- D ----
  if (t >= 19.5 && t < 37.1) {
    fogMove(dFog, t);
    dBlobs.forEach((b, i) => { b.style.transform = `translate(${Math.sin(t * 0.5 + i) * 60}px,${Math.cos(t * 0.4 + i) * 40}px)`; });
    // каждая часть видна только в своём окне — иначе края телефонов и карты торчат в соседних
    d1Wrap.style.visibility = t < 24.4 ? "visible" : "hidden";
    d2Wrap.style.visibility = t >= 24.1 && t < 28.8 ? "visible" : "hidden";
    d4Wrap.style.visibility = t >= 31.5 && t < 34.8 ? "visible" : "hidden";
    d3.style.visibility = t >= 28.6 && t < 31.7 ? "visible" : "hidden";
    // D1 19.6–24.2
    const p1 = E.expo(prog(t, 19.6, 20.6)), o1 = E.inQ(prog(t, 23.8, 24.3));
    S(d1Phone, { y: lerp(700, 0, p1) + Math.sin(t) * 6, ry: lerp(30, 14, p1) + o1 * 40, rx: 4, o: 1 - o1, x: -o1 * 300 });
    words(d1T1, t, 20.2, { out: 23.8 }); words(d1T2, t, 20.55, { out: 23.85 });
    typeText(document.getElementById("cName"), "Moon Cat", t, 20.9, 12); typeText(document.getElementById("cTick"), "MCAT", t, 21.8, 10);
    document.getElementById("cNameC").style.opacity = t > 20.9 && t < 21.8 && Math.floor(t * 4) % 2 ? 1 : 0;
    document.getElementById("cTickC").style.opacity = t > 21.8 && t < 22.4 && Math.floor(t * 4) % 2 ? 1 : 0;
    const lg = document.querySelector("#cLogo img"); lg.style.opacity = prog(t, 20.6, 20.9); lg.style.transform = `scale(${E.back(prog(t, 20.6, 21.0))})`;
    const press = prog(t, 22.55, 22.75); document.getElementById("cBtn").style.transform = `scale(${1 - Math.sin(press * Math.PI) * 0.06})`;
    const dn = E.out(prog(t, 22.8, 23.15)); const cd = document.getElementById("cDone"); cd.style.opacity = dn; cd.style.transform = `scale(${0.9 + 0.1 * dn})`;
    { const k = prog(t, 22.75, 24.0); S(d1Rocket, { o: k > 0 && k < 1 ? 1 : 0, x: lerp(200, 1500, E.inQ(k)), y: lerp(850, -300, E.inQ(k)), r: 40, s: 1 }); }
    // D2 24.2–28.6
    const p2 = E.expo(prog(t, 24.2, 25.2)), o2 = E.inQ(prog(t, 28.2, 28.7));
    S(d2Phone, { y: lerp(700, 0, p2) + Math.sin(t) * 6, ry: lerp(-30, -14, p2) - o2 * 40, rx: 4, o: 1 - o2, x: o2 * 300 });
    document.getElementById("tChart").innerHTML = chartSVG(Math.round(lerp(8, 26, prog(t, 24.6, 26.4))));
    const pr = lerp(0.000155, 0.000214, prog(t, 24.6, 26.4)); document.getElementById("tPrice").textContent = "$" + pr.toFixed(6);
    document.getElementById("tChg").textContent = "+" + lerp(9.4, 38.2, prog(t, 24.6, 26.4)).toFixed(1) + "%";
    const bp = prog(t, 26.5, 26.7); document.getElementById("tBuy").style.transform = `scale(${1 - Math.sin(bp * Math.PI) * 0.07})`;
    const tt = E.back(prog(t, 26.75, 27.15)) * (1 - prog(t, 28.0, 28.3)); const toast = document.getElementById("tToast"); toast.style.opacity = clamp(tt * 1.5); toast.style.transform = `translateY(${(1 - tt) * -30}px)`;
    words(d2T1, t, 24.6, { out: 28.15 });
    { const k = E.back(prog(t, 25.0, 25.6)), q = E.inQ(prog(t, 28.1, 28.6)); S(d2Zero, { o: clamp(k * 2) * (1 - q), s: k * (1 + Math.sin(t * 2) * 0.02), r: -4 + Math.sin(t * 1.4) * 3, b: q * 14 }); }
    words(d2T2, t, 25.5, { out: 28.2 });
    d2Objs.forEach((o, i) => { const k = E.back(prog(t, 25.6 + i * 0.15, 26.1 + i * 0.15)), q = prog(t, 28.0, 28.4); S(o, { o: clamp(k * 2) * (1 - q), s: k, y: Math.sin(t * 1.5 + i) * 12, r: Math.sin(t + i) * 8 }); });
    // D3 28.6–31.6 — скорость: строка влетает со шлейфом
    { const k = E.expo(prog(t, 28.7, 29.25)), q = E.inQ(prog(t, 31.1, 31.6));
      const a = document.getElementById("d3a"), b = document.getElementById("d3b");
      S(a, { x: lerp(-1400, 0, k) + q * 1400, o: 1 - q, sx: 1 + (1 - k) * 0.5, b: (1 - k) * 6 });
      d3Trails.forEach((tr, i) => { S(tr, { o: t > 28.7 && k < 1 ? (1 - k) * (0.5 - i * 0.1) : 0, x: lerp(-1400, 0, k) - (i + 1) * 90 * (1 - k) }); });
      const k2 = E.outQ(prog(t, 29.5, 30.1)); S(b, { o: k2 * (1 - q), y: (1 - k2) * 40, b: (1 - k2) * 14 });
      const bk = E.back(prog(t, 29.15, 29.55)); S(d3Bolt, { o: clamp(bk * 2) * (1 - q), s: bk * (1 + Math.sin(t * 9) * 0.03), r: 8 + Math.sin(t * 7) * 3 });
      const fl = prog(t, 29.15, 29.45); flash.style.opacity = t > 29.15 && t < 29.45 ? (1 - fl) * 0.6 : 0; }
    // D4 31.6–34.6 — кошелёк
    { const k = E.expo(prog(t, 31.6, 32.4)), q = E.inQ(prog(t, 34.2, 34.7)), flip = E.io(prog(t, 32.6, 33.6));
      d4Card.style.transform = `translateY(${lerp(600, 0, k) + q * 500}px) rotateX(${lerp(40, 10, k)}deg) rotateY(${-18 + flip * 360}deg)`;
      d4Wrap.style.opacity = 1 - q;
      d4Mintie.style.opacity = prog(t, 33.6, 33.8); d4Mintie.style.backgroundPosition = `${Math.floor(clamp((t - 33.6) * 12, 0, 11)) / 11 * 100}% 0`;
      words(d4T1, t, 32.0, { out: 34.2 }); words(d4T2, t, 32.35, { out: 34.25, stag: 0.08 }); }
    // D5 34.7–37 — Launch it / Trade it / Moon it|
    { const el = document.getElementById("d5t"), c = document.getElementById("d5c");
      const seq = [["Launch it", 34.75, 35.5], ["Trade it", 35.55, 36.3], ["Moon it", 36.35, 37.1]];
      const cur = seq.find(([, a, b]) => t >= a && t < b);
      d5.style.opacity = t >= 34.75 && t < 37.1 ? 1 : 0;
      if (cur) { const n = Math.floor(clamp((t - cur[1]) * 22, 0, cur[0].length)); el.textContent = cur[0].slice(0, n); el.className = cur[0] === "Moon it" ? "accent" : ""; }
      c.style.opacity = Math.floor(t * 3) % 2 ? 1 : 0.15; }
    D.style.opacity = 1 - prog(t, 36.9, 37.1);
  }
  // ---- E ----
  if (t >= 37) {
    const z = prog(t, 37, 45); eSky.style.transform = `scale(${1.02 + z * 0.08}) translate(${-z * 30}px,${-z * 12}px)`;
    Esc.style.opacity = E.out(prog(t, 37, 37.6));
    const ring = prog(t, 37.6, 38.5); eRing.firstElementChild.setAttribute("stroke-dashoffset", (302 * (1 - E.io(ring))).toFixed(1));
    const rOut = E.io(prog(t, 38.4, 38.8)); S(eRing, { o: (ring > 0 ? 1 : 0) * (1 - rOut), s: 1 + rOut * 0.4 });
    const lk = E.back(prog(t, 38.5, 39.1)); S(eLogo, { o: clamp(lk * 2), s: lk });
    const nk = E.io(prog(t, 39.0, 39.7)); eName.style.clipPath = `inset(0 ${(100 - nk * 100).toFixed(1)}% 0 0)`;
    const pk = E.back(prog(t, 39.9, 40.5)); ePill.style.opacity = clamp(pk * 2); ePill.style.transform = `translateX(-50%) translateY(${(1 - pk) * 40}px) scale(${0.9 + 0.1 * pk})`;
    words(eTag, t, 40.8, { stag: 0.14 });
  }
  if (!(t > 29.15 && t < 29.45)) flash.style.opacity = t < 5.6 && t > 5.2 ? (1 - prog(t, 5.2, 5.6)) * 0.8 : 0;
  fade.style.opacity = Math.max(prog(t, 44.0, 45), 1 - prog(t, 0, 0.35));
};

document.fonts.ready.then(() => Promise.all([...document.images].map((i) => (i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; }))))).then(() => { window.renderAt(0); window.ready = true; });
