// Промо Mintly: воздушный продуктовый ролик в океанской гамме — кинетическая
// типографика, настоящий 3D-айфон с экранами, снятыми с самого приложения,
// и аккуратные UI-виджеты вокруг вместо игрушечных 3D-предметов.
// Кадр зависит только от t — renderAt(t) можно звать в любом порядке.
"use strict";
const root = document.getElementById("root");
const $ = (h) => { const d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstElementChild; };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const E = {
  out: (k) => 1 - Math.pow(1 - k, 3),
  outQ: (k) => 1 - Math.pow(1 - k, 5),
  io: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  sine: (k) => 0.5 - Math.cos(Math.PI * k) / 2,
  // мягкий перелёт без пружины: заметный, но не дёрганый
  soft: (k) => { const c = 0.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
  inQ: (k) => k * k * k,
};
function S(el, { o = 1, x = 0, y = 0, s = 1, r = 0, b = 0, sx = 1 } = {}) {
  el.style.opacity = o;
  el.style.visibility = o > 0.002 ? "visible" : "hidden";
  el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${r.toFixed(3)}deg) scale(${s.toFixed(4)})${sx !== 1 ? ` scaleX(${sx})` : ""}`;
  el.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none";
}
const scenes = [];
function scene(a, b, bg) { const el = $(`<div class="scene" style="background:${bg || "transparent"}"></div>`); root.appendChild(el); scenes.push({ el, a, b }); return el; }
// переход сцены как в референсе: растворение с размытием и лёгким наездом,
// фон под сценами общий и не обрывается
function sceneFx(el, t, a, b, fin = 0.55, fout = 0.6) {
  const k = E.out(prog(t, a, a + fin)), q = E.io(prog(t, b - fout, b));
  const o = k * (1 - q);
  el.style.opacity = o;
  el.style.transform = `scale(${(1.035 - 0.035 * k) * (1 + 0.05 * q)})`;
  const bl = (1 - k) * 12 + q * 14;
  el.style.filter = bl > 0.05 ? `blur(${bl.toFixed(2)}px)` : "none";
}

// ---- кинетическая строка: слова по одному, *слово* — акцентом ----
function line(parent, text, { size = 72, top = 470, weight = 500, color = "#FFFFFF", font = "Onest", ls = "-0.02em" } = {}) {
  const el = $(`<div class="c" style="top:${top}px;font:${weight} ${size}px '${font}';letter-spacing:${ls};color:${color};white-space:nowrap"></div>`);
  // белые заголовки переливаются синим, как фон; серые подписи остаются серыми
  const g = /^#fff(fff)?$/i.test(color);
  const spans = text.split(" ").map((w) => { const acc = w.startsWith("*"); return $(`<span class="w${acc ? " accent" : g ? " grad" : ""}">${w.replace(/\*/g, "")}</span>`); });
  spans.forEach((s, i) => { el.appendChild(s); if (i < spans.length - 1) el.appendChild(document.createTextNode(" ")); });
  parent.appendChild(el); el.spans = spans; return el;
}
function words(l, t, a, { stag = 0.1, dur = 1.05, out = null, outDur = 0.6, rise = 30 } = {}) {
  l.spans.forEach((w, i) => {
    const k = E.outQ(prog(t, a + i * stag, a + i * stag + dur));
    let o = k, y = (1 - k) * rise, b = (1 - k) * 14, s = 1;
    if (out != null) { const q = E.io(prog(t, out + i * 0.045, out + i * 0.045 + outDur)); o *= 1 - q; b += q * 16; y -= q * 18; s = 1 + q * 0.05; }
    S(w, { o, y, b, s });
  });
}

// ---- общий фон: светлые пятна и голубой туман снизу ----
// фон как в приложении — чёрный, по нему медленно плывут и дышат синие пятна
const BG = $(`<div class="abs" style="inset:0;background:#000"></div>`); root.appendChild(BG);
const bgGrad = $(`<div class="abs" style="inset:-20%;background:linear-gradient(120deg,#000 0%,#151517 18%,#000 34%,#232326 52%,#000 68%,#1A1A1D 84%,#000 100%);background-size:300% 300%"></div>`); BG.appendChild(bgGrad);
const bgBlobs = [[300, 230, 420, "#2A2A2E"], [1650, 220, 380, "#222225"], [960, 1100, 540, "#303034"], [1520, 900, 360, "#1E1E21"], [380, 930, 380, "#26262A"], [960, 380, 300, "#1B1B1E"]]
  .map(([x, y, r, c], i) => { const b = $(`<div class="blob" style="left:${x - r}px;top:${y - r}px;width:${r * 2}px;height:${r * 2}px;background:${c};opacity:.55"></div>`); b.i = i; BG.appendChild(b); return b; });
const bgFog = $(`<div class="fog"></div>`); BG.appendChild(bgFog);
bgFog.parts = [[-2, 170, 520, "#232326"], [14, 120, 420, "#1D1D20"], [30, 180, 560, "#2A2A2E"], [47, 110, 460, "#1E1E21"], [63, 170, 540, "#262629"], [80, 120, 440, "#202023"], [96, 170, 520, "#29292C"]]
  .map(([x, y, w, c]) => { const s = $(`<span style="left:${x}%;top:${y}px;width:${w}px;height:${w * 0.55}px;background:${c};opacity:.45"></span>`); bgFog.appendChild(s); return s; });

// ---- данные ----
const SOL = [118.04, 118.65, 119.93, 119.24, 119.69, 119.93, 118.83, 118.31, 118.75, 118.23, 117.68, 118.55, 118.91, 118.73, 118.09, 116.7, 117.12, 116.59, 117.84, 117.8, 117.65, 118.21, 119.0, 119.2, 119.49, 119.56, 119.13, 119.87, 119.63, 119.27, 120.11, 120.87, 121.17, 120.48];
const TON = [1.616, 1.605, 1.641, 1.651, 1.648, 1.649, 1.645, 1.616, 1.601, 1.605, 1.582, 1.568, 1.563, 1.574, 1.576, 1.565, 1.546, 1.555, 1.535, 1.54, 1.551, 1.57, 1.558, 1.55, 1.561, 1.58, 1.591, 1.597, 1.588, 1.58, 1.572, 1.58, 1.561, 1.543];
function spark(arr, w, h, col, fill = true) {
  const mn = Math.min(...arr), mx = Math.max(...arr);
  const pts = arr.map((v, i) => [i / (arr.length - 1) * w, h - (v - mn) / (mx - mn) * (h - 4) - 2]);
  const p = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const id = "g" + Math.random().toString(36).slice(2, 8);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    ${fill ? `<polygon points="0,${h} ${p} ${w},${h}" fill="url(#${id})"/>` : ""}<polyline points="${p}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="4" fill="${col}" stroke="#0F0F13" stroke-width="2"/></svg>`;
}
// Карта кошелька — как в приложении теперь: почти чёрная, тонкая кромка,
// баланс, ник держателя и маленький знак в углу.
const КАРТА = "linear-gradient(160deg,#1A1B1F 0%,#0E0F12 55%,#0A0A0C 100%)";
const ЗВЕЗДА = `<svg width="34" height="34" viewBox="0 0 24 24"><path d="M12 1.5l2.2 6.3 6.3-2.2-3.6 5.6 5.6 3.6-6.6.6.6 6.6-4.5-4.9-4.5 4.9.6-6.6-6.6-.6 5.6-3.6L3.5 5.6l6.3 2.2z" fill="rgba(255,255,255,.75)"/></svg>`;
const GRAD = "linear-gradient(115deg,#E44BC8 0%,#C13AE6 18%,#8E2DE2 36%,#6A17E8 54%,#4A00E0 70%,#7B1FE0 84%,#2C0A78 100%)";
// токены: пиксельные логотипы и скины Минти — то, что люди и правда запускают
const SKIN = { gold: "#F4B73A,#B9770E", neon: "#28D7FF,#0A5BD8", violet: "#B26BFF,#5A20C9", mint: "#4BE3A6,#0E8A64" };
function logo(k, sz) {
  if (SKIN[k]) { const [a, b] = SKIN[k].split(","); return `<div class="lg" style="width:${sz}px;height:${sz}px;background:radial-gradient(circle at 30% 25%,${a},${b});display:flex;align-items:center;justify-content:center;overflow:hidden"><img src="assets/app/${k}-preview.webp" style="width:86%;image-rendering:pixelated;margin-top:6%"/></div>`; }
  // белая M гладкая, а не пиксельная — её не надо масштабировать по пикселям
  return `<img class="lg" src="assets/tok/${k}.png" style="width:${sz}px;height:${sz}px${k === "m" ? ";image-rendering:auto;box-shadow:0 0 0 1px rgba(255,255,255,.14)" : ""}"/>`;
}
const TOK = [["m", "Mintly", "MINT"], ["frog", "Lily Frog", "LILY"], ["gold", "Gold Axo", "GAXO"], ["pup", "Pixel Pup", "PUP"], ["fire", "Hot Wick", "WICK"],
  ["neon", "Neon Axo", "NEON"], ["boo", "Boo", "BOO"], ["violet", "Violet", "VIO"], ["mint", "Minti", "MNTI"]];
const ICO = {
  check: (c = "#2EE87A", s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  bolt: (c, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="${c}"><path d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.6z"/></svg>`,
  minus: (c, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"><path d="M6 12h12"/></svg>`,
  clock: (c, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  tg: (s = 34) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M3 11.5 20 4.5l-3 15-5-4-3 3 .4-4.6L17 7.5 8 13z" fill="#fff"/></svg>`,
};
const fmtK = (v) => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(0));
const wg = (parent, w, h, html, pad = "16px 18px") => { const e = $(`<div class="wg" style="width:${w}px;height:${h}px;padding:${pad}">${html}</div>`); parent.appendChild(e); e.w = w; e.h = h; return e; };
// виджет ставится центром в (x, y)
// все живые виджеты крупнее на 20 %: масштаб от центра, раскладка считает их уже крупными
const WGS = 1.5;
const at = (e, x, y, o = {}) => S(e, { ...o, s: (o.s == null ? 1 : o.s) * (o.ws == null ? WGS : o.ws), x: x - e.w / 2 + (o.x || 0), y: y - e.h / 2 + (o.y || 0) });

// ---- экран айфона: статус-бар iOS + снимки настоящего приложения ----
const SBI = `<span style="display:flex;gap:6px;align-items:center"><svg width="18" height="12" viewBox="0 0 18 12" fill="#fff"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
  <svg width="16" height="12" viewBox="0 0 16 12" fill="#fff"><path d="M8 2.2c2.4 0 4.6.9 6.3 2.5l1.2-1.3C13.4 1.4 10.8.4 8 .4S2.6 1.4.5 3.4l1.2 1.3C3.4 3.1 5.6 2.2 8 2.2zm0 3.6c1.4 0 2.7.5 3.7 1.4l1.2-1.3C11.6 4.7 9.9 4 8 4s-3.6.7-4.9 1.9l1.2 1.3c1-.9 2.3-1.4 3.7-1.4zM8 9.4c-.5 0-1 .2-1.4.6L8 11.6l1.4-1.6c-.4-.4-.9-.6-1.4-.6z"/></svg>
  <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="#fff" stroke-opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.5" fill="#fff"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" fill="#fff" fill-opacity=".45"/></svg></span>`;
function screen(inner) {
  return $(`<div class="scr3"><div class="sbar"><span>9:41</span>${SBI}</div><div class="appv">${inner}</div><div class="island"></div><div class="sheen"></div></div>`);
}
const frames = (names) => names.map((n) => `<img class="f" src="assets/scr/${n}.png"/>`).join("");
function showFrame(scr, i) { scr.querySelectorAll("img.f").forEach((im, j) => { im.style.opacity = j === i ? 1 : 0; }); }
// i — текущий кадр, k — сколько он уже проявился поверх предыдущего
function blendFrame(scr, i, k) { scr.querySelectorAll("img.f").forEach((im, j) => { im.style.transform = "none"; im.style.zIndex = j === i ? 2 : 1; im.style.opacity = j === i ? E.sine(k) : j === i - 1 && k < 1 ? 1 : 0; }); }
const toast = (title, sub) => `<div class="toastA"><i>${ICO.check("#2EE87A", 17)}</i><div>${title}${sub ? `<small>${sub}</small>` : ""}</div></div>`;
// касание пальцем: круг сжимается и гаснет
function tap(el, t, a) { const k = prog(t, a, a + 0.45); el.style.opacity = k > 0 && k < 1 ? (1 - k) * 0.9 : 0; el.style.transform = `scale(${0.6 + 0.6 * E.out(k)})`; }

// ---- логотип: большая M уменьшается, уходит влево, из неё по букве выезжает «intly» ----
/* Знак — звезда Mintly, как в приложении и на сайте; прежняя «M»
   осталась от старого логотипа. Слово рядом — «Mintly» целиком. */
const M_PATH = "M40.12 101.31 L41.10 101.94 L42.79 102.74 L44.01 103.20 L46.57 104.02 L49.71 104.86 L55.52 106.18 L60.15 107.11 L68.37 108.61 L68.68 108.75 L68.95 108.99 L69.11 109.28 L69.19 109.65 L69.08 110.15 L68.78 110.53 L67.71 111.14 L62.39 115.31 L55.52 120.85 L51.64 124.09 L46.93 128.25 L43.48 131.62 L41.95 133.37 L41.32 134.22 L40.71 135.23 L40.30 136.24 L40.13 137.22 L40.17 137.98 L40.47 138.99 L40.99 139.78 L41.64 140.36 L42.11 140.65 L42.66 140.86 L43.57 141.06 L44.51 141.08 L45.43 140.98 L46.53 140.75 L47.79 140.39 L50.36 139.49 L53.46 138.22 L59.15 135.61 L67.89 131.26 L68.27 131.16 L68.69 131.21 L69.03 131.40 L69.30 131.72 L69.44 132.13 L69.42 132.52 L67.37 137.23 L66.33 139.94 L65.67 142.04 L65.43 143.02 L65.26 144.09 L65.20 145.10 L65.32 146.14 L65.64 147.05 L66.03 147.70 L66.65 148.34 L67.32 148.77 L68.19 149.08 L68.78 149.16 L69.74 149.11 L70.96 148.74 L72.38 147.97 L73.40 147.26 L75.17 145.79 L77.22 143.88 L80.83 140.17 L85.13 135.43 L89.02 130.95 L89.27 130.76 L89.59 130.65 L89.91 130.64 L90.26 130.74 L90.64 131.05 L90.86 131.52 L92.25 140.80 L93.57 148.62 L94.82 154.97 L96.02 159.89 L96.77 162.31 L97.16 163.34 L97.59 164.27 L98.05 165.09 L98.61 165.86 L99.02 166.27 L99.76 166.82 L100.46 167.11 L101.34 167.28 L102.11 167.25 L103.01 166.97 L103.66 166.61 L104.45 165.87 L104.97 165.10 L105.45 164.11 L105.80 163.09 L106.41 160.61 L107.11 156.10 L107.72 150.18 L108.22 143.09 L108.40 142.64 L108.75 142.31 L109.09 142.18 L109.46 142.17 L109.82 142.28 L110.12 142.51 L113.39 147.16 L116.18 150.74 L117.08 151.78 L118.51 153.24 L119.34 153.96 L120.15 154.51 L121.15 154.97 L122.07 155.17 L122.72 155.19 L123.59 155.02 L124.39 154.66 L125.08 154.10 L125.49 153.61 L125.94 152.78 L126.25 151.55 L126.32 150.40 L126.16 148.44 L125.74 146.07 L124.63 141.69 L123.55 138.05 L121.46 131.70 L118.80 124.18 L118.77 123.85 L118.85 123.49 L119.04 123.17 L119.33 122.94 L119.79 122.81 L120.27 122.88 L121.85 124.05 L122.40 124.34 L131.83 128.13 L139.80 131.18 L144.36 132.82 L148.23 134.11 L152.95 135.46 L154.36 135.78 L156.43 136.10 L157.61 136.13 L158.72 135.99 L159.79 135.59 L160.42 135.15 L161.14 134.33 L161.53 133.44 L161.65 132.73 L161.66 132.15 L161.46 131.23 L161.26 130.69 L160.80 129.88 L160.23 129.13 L159.47 128.29 L158.50 127.36 L156.37 125.56 L152.09 122.35 L146.32 118.38 L138.85 113.52 L138.58 113.25 L138.43 112.95 L138.38 112.53 L138.50 112.12 L138.77 111.78 L139.15 111.57 L143.25 111.06 L147.06 110.39 L149.26 109.76 L150.19 109.38 L151.13 108.85 L151.78 108.34 L152.39 107.61 L152.73 106.97 L152.99 106.07 L153.01 105.32 L152.85 104.43 L152.55 103.75 L152.02 102.98 L151.20 102.21 L149.85 101.37 L148.74 100.84 L146.63 100.04 L144.01 99.22 L139.11 97.95 L133.00 96.62 L127.96 95.62 L127.66 95.49 L127.42 95.27 L127.25 94.99 L127.17 94.68 L127.24 94.15 L127.53 93.74 L128.13 93.33 L133.28 89.27 L141.90 82.23 L145.35 79.26 L148.22 76.68 L151.54 73.40 L152.47 72.36 L153.69 70.79 L154.28 69.79 L154.64 68.92 L154.82 67.97 L154.82 67.23 L154.56 66.23 L154.23 65.59 L153.85 65.13 L153.17 64.57 L152.56 64.26 L151.79 64.03 L151.24 63.96 L150.29 63.96 L149.36 64.08 L148.33 64.30 L146.06 64.98 L141.79 66.65 L136.19 69.19 L128.86 72.79 L128.40 72.88 L127.97 72.79 L127.63 72.56 L127.42 72.25 L127.32 71.88 L127.35 71.51 L129.28 67.24 L130.96 63.04 L131.66 60.89 L131.90 59.90 L132.09 58.83 L132.15 57.84 L132.04 56.76 L131.75 55.88 L131.44 55.32 L130.84 54.63 L130.18 54.16 L129.31 53.82 L128.57 53.71 L127.62 53.77 L126.37 54.16 L124.94 54.95 L123.92 55.67 L122.12 57.18 L118.93 60.25 L116.36 62.94 L111.99 67.81 L107.42 73.11 L107.15 73.31 L106.80 73.42 L106.43 73.41 L106.12 73.29 L105.76 72.98 L105.56 72.50 L105.69 71.19 L105.67 70.58 L103.79 57.76 L102.90 52.41 L102.05 47.75 L101.23 43.78 L100.44 40.55 L100.02 39.05 L99.27 36.83 L98.86 35.86 L98.32 34.86 L97.74 34.09 L97.32 33.69 L96.57 33.15 L95.85 32.87 L94.98 32.72 L94.23 32.77 L93.36 33.06 L92.70 33.45 L91.92 34.23 L91.41 35.02 L90.95 36.05 L90.59 37.12 L90.01 39.68 L89.33 44.40 L88.74 50.74 L88.13 60.80 L88.01 61.21 L87.74 61.54 L87.41 61.73 L86.99 61.80 L86.59 61.70 L86.27 61.48 L83.01 57.05 L81.17 54.77 L79.67 53.12 L78.94 52.42 L78.10 51.72 L77.26 51.17 L76.29 50.75 L75.34 50.56 L74.58 50.57 L73.71 50.78 L72.99 51.16 L72.30 51.75 L71.92 52.24 L71.50 53.07 L71.21 54.34 L71.17 55.97 L71.29 57.21 L71.68 59.50 L72.32 62.25 L73.75 67.29 L75.75 73.44 L77.85 79.50 L77.88 79.82 L77.82 80.13 L77.67 80.43 L77.44 80.65 L76.95 80.86 L76.44 80.81 L65.90 76.73 L59.05 74.26 L53.43 72.43 L49.13 71.29 L46.66 70.86 L45.59 70.78 L44.48 70.82 L43.60 70.99 L42.70 71.37 L42.17 71.73 L41.55 72.38 L41.21 72.91 L40.95 73.64 L40.83 74.39 L40.90 75.20 L41.10 75.97 L41.57 76.93 L42.09 77.67 L42.78 78.49 L44.58 80.23 L48.06 83.06 L52.78 86.49 L57.74 89.88 L58.05 90.26 L58.15 90.79 L58.07 91.14 L57.91 91.43 L57.63 91.67 L57.29 91.81 L50.59 92.37 L45.96 92.98 L44.59 93.24 L42.57 93.74 L41.52 94.10 L40.61 94.53 L39.70 95.16 L38.96 96.01 L38.58 96.76 L38.34 97.78 L38.43 98.83 L38.69 99.62 L39.32 100.57Z";
let mLogoN = 0;
// F — кегль слова, base — базовая линия; fill — заливка M, text — CSS цвета/градиента букв
function mLogo(parent, { F, base, fill, text, glow = "none", tail = "Mintly", left = null }) {
  // звезда чуть выше строчных: как в шапке сайта, знак крупнее букв
  const id = "mg" + mLogoN++, capH = 0.705 * F * 1.25, mW = capH * 126 / 137;
  const grad = fill.split(",");
  const m = $(`<svg class="abs" style="left:0;top:0;width:${mW.toFixed(1)}px;height:${capH.toFixed(1)}px;overflow:visible;transform-origin:50% 50%;filter:${glow}" viewBox="37 31 126 137">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${grad.map((c, i) => `<stop offset="${i / Math.max(1, grad.length - 1)}" stop-color="${c}"/>`).join("")}</linearGradient></defs>
    <path d="${M_PATH}" fill="url(#${id})"/></svg>`);
  const row = $(`<div class="abs" style="left:0;top:${(base - 0.829 * F).toFixed(1)}px;font:800 ${F}px/1 'Nunito';letter-spacing:-0.04em;white-space:nowrap;clip-path:inset(-40% -10% -40% 0)"></div>`);
  const inner = $(`<div style="display:inline-block"></div>`); row.appendChild(inner);
  const sp = [...tail].map((ch) => { const e = $(`<span style="display:inline-block;${text}">${ch}</span>`); inner.appendChild(e); return e; });
  // контейнер нужен для режима «M из строки текста»: целиком едет и растёт к центру
  const box = $(`<div class="abs" style="left:0;top:0;width:1920px;height:1080px"></div>`);
  box.append(row, m); parent.appendChild(box);
  const o = { m, row, sp, F, base, capH, mW, left, box };
  // буквы выходят из-под правого края M слева направо: граница показа бежит
  // по строке, и каждая буква коротко выдвигается из-за неё — без наложений
  const slide = (t, t1, dur) => {
    const q = E.io(prog(t, t1, t1 + dur)), rv = q * (o.w + 0.1 * F);
    row.style.clipPath = `inset(-40% ${Math.max(0, o.w - rv).toFixed(1)}px -40% 0)`;
    inner.style.transform = "none";
    sp.forEach((e, i) => {
      const lk = E.out(clamp((rv - o.offs[i]) / (o.ws[i] * 1.4)));
      S(e, { o: clamp(lk * 1.6), x: -(1 - lk) * o.ws[i] * 0.7, b: (1 - lk) * 4 });
    });
  };
  o.measure = () => {
    if (o.w) return;
    const rw = row.offsetWidth; if (!rw) return;
    o.w = rw; o.offs = sp.map((e) => e.offsetLeft - inner.offsetLeft); o.ws = sp.map((e) => e.offsetWidth);
    o.gap = 0.2 * F; o.total = mW + o.gap + rw;
    // градиент букв тянется на всё слово, а не на каждую букву отдельно
    sp.forEach((e, i) => { if (/gradient/.test(text)) { e.style.backgroundSize = `${rw}px 100%`; e.style.backgroundPosition = `${-o.offs[i]}px 0`; } });
  };
  // t0 — начало; big — во сколько раз M крупнее в начале; sp — темп; out — исчезновение 0…1
  o.at = (t, t0, { big = 2.4, cx = 960, cy = null, k = 1, out = 0 } = {}) => {
    o.measure(); if (!o.w) return;
    box.style.transform = "none";
    const L = o.left != null ? o.left : 960 - o.total / 2, mx = L + mW / 2, my = base - 0.705 * F / 2;
    const a = E.outQ(prog(t, t0, t0 + 0.55 * k)), mv = E.io(prog(t, t0 + 0.6 * k, t0 + 1.3 * k));
    const sc = lerp(big, 1, mv) * (0.86 + 0.14 * a);
    const x = lerp(cx, mx, mv), y = lerp(cy == null ? my : cy, my, mv);
    S(m, { o: a * (1 - out), x: x - mW / 2, y: y - capH / 2, s: sc * (1 - out * 0.1), b: (1 - a) * 14 + out * 12 });
    row.style.left = (L + mW + o.gap).toFixed(1) + "px";
    row.style.opacity = 1 - out; row.style.filter = out > 0.01 ? `blur(${(out * 12).toFixed(1)}px)` : "none";
    slide(t, t0 + 1.15 * k, (0.5 + 0.045 * sp.length) * k);
  };
  // M появляется маленькой в строке (fromX, fromY, fromS), потом вместе со всем
  // логотипом едет в центр и растёт, а буквы в это же время выходят из неё
  o.atFrom = (t, t0, tMove, { fromX, fromY, fromS }) => {
    o.measure(); if (!o.w) return;
    const L = 960 - o.total / 2, mx = L + mW / 2, my = base - 0.705 * F / 2;
    const a = E.outQ(prog(t, t0, t0 + 0.45));
    S(m, { o: a, x: mx - mW / 2, y: my - capH / 2, s: 0.88 + 0.12 * a, b: (1 - a) * 10 });
    row.style.left = (L + mW + o.gap).toFixed(1) + "px"; row.style.opacity = 1; row.style.filter = "none";
    const mv = E.io(prog(t, tMove, tMove + 0.75)), sc = lerp(fromS, 1, mv);
    box.style.transformOrigin = `${mx.toFixed(1)}px ${my.toFixed(1)}px`;
    box.style.transform = `translate(${((fromX - mx) * (1 - mv)).toFixed(2)}px,${((fromY - my) * (1 - mv)).toFixed(2)}px) scale(${sc.toFixed(4)})`;
    slide(t, tMove + 0.08, 0.5 + 0.045 * sp.length);
  };
  return o;
}

// ============ A · ИНТРО 0–5.6 ============
const A = scene(0, 5.7);
const OCEAN_TXT = "background:linear-gradient(95deg,#FFFFFF,#E9ECF1 50%,#A7AFBA);-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:.14em;margin-bottom:-.14em";
const aLogo = mLogo(A, { F: 270, base: 268, fill: "#FFFFFF,#E3E7ED,#A7AFBA", text: OCEAN_TXT, glow: "drop-shadow(0 10px 40px rgba(255,255,255,.18))" });
const aScr = screen(frames(["home"])); showFrame(aScr, 0);
const aPhone = new Phone3D(A, aScr);
const aW = [
  wg(A, 270, 124, `<div class="row" style="justify-content:space-between"><span style="font:800 19px Nunito">SOL</span><span class="chip up" style="background:rgba(46,232,122,.14)">+2.07%</span></div>
    <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:6px"><span class="num tn">$120.48</span>${spark(SOL.slice(10), 110, 38, "#2EE87A")}</div>`),
  wg(A, 286, 92, `<div class="row">${logo("m", 56)}<div style="flex:1"><div style="font:800 19px Nunito">Mintly <span style="color:#8E8E99;font:600 14px Onest">$MINT</span></div>
    <div class="lb" style="font-size:14px;display:flex;align-items:center;gap:7px"><i style="width:8px;height:8px;border-radius:50%;background:#fff;display:inline-block"></i>Запущен 2 с назад</div></div></div>`),
  wg(A, 236, 132, `<div class="lb">Комиссия платформы</div><div style="font:800 58px/1.05 Nunito;letter-spacing:-.03em" class="accent">0%</div><div class="lb" style="font-size:13px">на каждую сделку</div>`),
  wg(A, 262, 92, `<div class="row"><div style="width:52px;height:52px;border-radius:16px;background:#fff;display:flex;align-items:center;justify-content:center">${ICO.bolt("#0A0A0F", 26)}</div>
    <div><div class="lb" style="font-size:14px">Подтверждено за</div><div class="num tn" style="font-size:24px">0.4 с</div></div></div>`),
  wg(A, 330, 88, `<div class="row">${logo("frog", 52)}<div style="flex:1"><div style="font:800 18px Nunito">Купил 1.7M LILY</div><div class="lb" style="font-size:14px">за 5 GRAM · комиссия 0%</div></div>${ICO.check()}</div>`),
  wg(A, 260, 88, `<div class="row"><div style="display:flex">${["pup", "boo", "fire", "gold"].map((k, i) => `<div style="margin-left:${i ? -12 : 0}px;border:3px solid #0F0F13;border-radius:50%;display:flex;background:#0F0F13">${logo(k, 38)}</div>`).join("")}</div>
    <div><div class="num tn" style="font-size:21px">1 284</div><div class="lb" style="font-size:13px">держателя</div></div></div>`),
];
const aPos = [[430, 480, 2.0, -3], [1480, 455, 2.15, 2.5], [330, 735, 2.3, 2], [1600, 700, 2.45, -2], [560, 945, 2.6, 1.5], [1380, 950, 2.75, -1.5]];

// ============ B · ПРОБЛЕМА 5.2–15.1 ============
const B = scene(5.2, 15.6);
const b1 = line(B, "Новые *мемкоины.*", { top: 404, size: 88, weight: 600 });
const b1b = line(B, "Каждый день — новые возможности.", { top: 522, size: 54, color: "#8E8E99" });
const b2 = line(B, "Комиссии *не* *съедают* твою прибыль.", { top: 470, size: 78 });
const b3 = line(B, "Торгуй *быстро* и *просто.*", { top: 462, size: 88 });
const b4 = line(B, "Хочешь просто торговать?", { top: 482, size: 76 });
// «просто» сменяется на «удобно»: старое уходит вниз, новое приходит сверху, одним темпом
const b4w = b4.spans[1]; b4w.classList.remove("accent");
b4w.innerHTML = `<span class="accent" style="display:inline-block">просто</span><span class="accent" style="display:inline-block;position:absolute;left:0;top:0;white-space:nowrap">удобно</span>`;
b4w.style.position = "relative"; b4w.style.textAlign = "left";
const [b4a, b4b] = b4w.children;
const b5 = line(B, "Тогда знакомься —", { top: 486, size: 64 });
const B5F = 124, B5_BASE = 486 + 0.829 * 64 + 0.105 * 64;
const b5Logo = mLogo(B, { F: B5F, base: 540 + 0.705 * B5F / 2, fill: "#FFFFFF,#E3E7ED,#A7AFBA", text: OCEAN_TXT, glow: "drop-shadow(0 0 30px rgba(255,255,255,.18))" });

// ряды виджетов над и под фразой: на каждом слайде своя механика —
// B1 бегущая лента, B2 перелистывание карточек, B3 лента сделок с толчком
// карточки рядов намного крупнее: меньше в ряду, шире шаг — текст большой, без наложений
const SLOT_W = 470, SLOT_H = 132, STEP = 560, ROW_Y = [242, 838], ROWS = 1;
const card = (html) => { const c = $(`<div class="wg" style="width:${SLOT_W}px;height:${SLOT_H}px;padding:0 26px;display:flex;align-items:center">${html}</div>`); B.appendChild(c); c.w = SLOT_W; c.h = SLOT_H; return c; };
// детерминированный «случай»: одно и то же t даёт один и тот же кадр
const rnd = (a, b = 0) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
// накопленная сумма случайных шагов: у каждой карточки свой ритм и свой размер шага
function walk(seed, t, t0, dtMin, dtMax, stepMin, stepMax, pZero = 0.25) {
  let tt = t0, v = 0;
  for (let n = 0; n < 80; n++) {
    tt += dtMin + rnd(seed, n * 2) * (dtMax - dtMin);
    if (tt > t) break;
    if (rnd(seed, n * 2 + 1) > pZero) v += stepMin + rnd(seed + 7, n) * (stepMax - stepMin);
  }
  return v;
}
const ago = (s) => (s < 1 ? "только что" : `${s} с назад`);
// вход и уход ряда целиком: россыпью, с размытием
const rowIn = (t, a, b, d) => [E.out(prog(t, a + d, a + d + 1.1)), E.io(prog(t, b + d * 0.5, b + d * 0.5 + 0.6))];

// B1 — бегущая лента новых токенов: верх едет влево, низ вправо, капитализация растёт рывками
const B1N = 7;
const b1Rows = [0, 1].map((row) => Array.from({ length: B1N }, (_, i) => {
  const [k, name, tick] = TOK[(i * 2 + row * 5) % TOK.length];
  const c = card(`${logo(k, 76)}<div style="flex:1;margin-left:18px;min-width:0"><div style="font:800 26px Nunito;white-space:nowrap">${name}</div><div class="lb" style="font-size:18px">$${tick} · <span class="ago tn"></span></div></div>
    <div style="text-align:right"><span class="chip" style="background:rgba(255,255,255,.1);color:#fff;font-size:15px;padding:6px 13px">НОВЫЙ</span><div class="mc tn up" style="font:800 23px Nunito;margin-top:8px"></div></div>`);
  c.seed = row * 31 + i * 7 + 1; return c;
}));
function runB1(t, a, b) {
  b1Rows.forEach((cards, row) => cards.forEach((c, i) => {
    const [k, q] = rowIn(t, a, b, row * 0.12 + i * 0.04), dir = row ? 1 : -1;
    const span = B1N * STEP, off = ((i * STEP + dir * 48 * (t - a)) % span + span) % span - 420;
    at(c, off + SLOT_W / 2, ROW_Y[row], { ws: ROWS, o: k * (1 - q), y: (1 - k) * (row ? 30 : -30) + Math.sin(t * 1.6 + i) * 4, b: (1 - k) * 12 + q * 14, s: 0.94 + 0.06 * k });
    if (k > 0 && q < 1) {
      c.querySelector(".mc").textContent = fmtK(2000 + rnd(c.seed, 99) * 9000 + walk(c.seed, t, 5.4, 0.06, 0.32, 20, 520, 0.2));
      c.querySelector(".ago").textContent = ago(Math.floor(Math.max(0, t - 6 - i * 0.3) * (0.8 + rnd(c.seed, 5))));
    }
  }));
}

// B2 — комиссии в копейках; карточки перелистываются по горизонтальной оси, как табло
const FEEROW = [["m", "Покупка MINT"], ["frog", "Продажа LILY"], ["gold", "Покупка GAXO"], ["pup", "Покупка PUP"], ["fire", "Продажа WICK"], ["neon", "Покупка NEON"], ["boo", "Покупка BOO"], ["violet", "Продажа VIO"], ["mint", "Покупка MINT"]];
// три крупные карточки в ряду (было четыре мелких) — текст больше
const SLOT_X = [480, 960, 1440];
const b2Slots = Array.from({ length: 6 }, (_, i) => [0, 1, 2].map((r) => {
  const [k, n] = FEEROW[(i + r * 3) % FEEROW.length];
  const c = card(`${logo(k, 70)}<div style="flex:1;margin-left:18px"><div style="font:700 23px Onest;white-space:nowrap">${n}</div><div class="lb" style="font-size:17px;white-space:nowrap">комиссия сети блокчейна</div></div>
    <div style="text-align:right"><div class="fee tn" style="font:800 27px Nunito;color:#FF5A63"></div><div class="lb" style="font-size:16px;white-space:nowrap">Mintly 0%</div></div>`);
  c.style.backfaceVisibility = "hidden"; c.seed = i * 17 + r * 5 + 3; return c;
}));
function runB2(t, a, b) {
  b2Slots.forEach((cards, i) => {
    const row = i < 3 ? 0 : 1, x = SLOT_X[i % 3], y = ROW_Y[row];
    const [k, q] = rowIn(t, a, b, (i % 3) * 0.08 + row * 0.1);
    // перелистывание неспешное: полный оборот 0.9 с, синусная кривая без рывка
    const per = 1.7 + rnd(i, 4) * 0.4, FL = 0.9, local = Math.max(0, t - a - 0.2 - rnd(i, 8) * 0.6);
    const n = Math.floor(local / per), f = E.sine(clamp((local - n * per - (per - FL)) / FL));
    cards.forEach((c, j) => {
      const cur = n % 3, nxt = (n + 1) % 3;
      // первая половина — текущая уходит вверх ребром, вторая — следующая встаёт из-под низа
      let ang = 200, o = 0;
      if (j === cur) { ang = f < 0.5 ? f * 180 : 200; o = 1; }
      if (j === nxt && f >= 0.5) { ang = (f - 1) * 180; o = 1; }
      const enter = (1 - k) * -90, leave = q * 90;
      if (j === cur && f < 0.5) ang += enter + leave;
      const vis = o * clamp(k * 2) * (1 - q) * (Math.abs(ang) < 90 ? 1 : 0);
      c.style.opacity = vis; c.style.visibility = vis > 0 ? "visible" : "hidden";
      c.style.transform = `translate3d(${(x - SLOT_W / 2).toFixed(1)}px,${(y - SLOT_H / 2 + Math.sin(t * 1.3 + i * 1.7) * 4).toFixed(1)}px,0) perspective(900px) rotateX(${ang.toFixed(2)}deg) scale(${ROWS})`;
      c.style.filter = q > 0.01 ? `blur(${(q * 12).toFixed(1)}px)` : "none";
      if (vis > 0) { const cents = (rnd(c.seed, 1) < 0.5 ? 1 : 0) + Math.round(walk(c.seed, t, 8.3, 0.35, 0.9, 1, 1, 0.55)); c.querySelector(".fee").textContent = "−$0." + String(Math.min(cents, 9)).padStart(2, "0"); }
    });
  });
}

// B3 — лента быстрых сделок: новая сделка влетает в начало ряда и толкает остальные
const B3POOL = 6;
const b3Rows = [0, 1].map(() => Array.from({ length: B3POOL }, () => card(`<div class="lgs" style="width:70px;height:70px;flex:none;position:relative">${TOK.map(([k], ti) => `<div class="lgi" data-i="${ti}" style="position:absolute;inset:0;display:none">${logo(k, 70)}</div>`).join("")}</div>
  <div style="flex:1;margin-left:18px;min-width:0"><div style="font:800 25px Nunito;white-space:nowrap"><span class="act"></span> <span class="qty tn"></span> <span class="tk"></span></div><div class="lb" style="font-size:17px">за <span class="amt tn"></span> GRAM · <span class="spd tn"></span></div></div>
  <div style="width:44px;height:44px;border-radius:50%;background:rgba(46,232,122,.14);display:flex;align-items:center;justify-content:center;flex:none">${ICO.check("#2EE87A", 25)}</div>`)));
function fillTrade(c, m, row) {
  if (c.m === m) return; c.m = m;
  const sd = m * 13 + row * 101, ti = Math.floor(rnd(sd, 1) * TOK.length), amt = [0.1, 0.25, 0.5, 0.8, 1, 1.5, 2, 3, 5][Math.floor(rnd(sd, 2) * 9)];
  c.querySelectorAll(".lgi").forEach((e) => { e.style.display = +e.dataset.i === ti ? "block" : "none"; });
  c.querySelector(".act").textContent = rnd(sd, 3) < 0.3 ? "Продал" : "Купил";
  c.querySelector(".tk").textContent = TOK[ti][2];
  c.querySelector(".amt").textContent = String(amt).replace(".", ",");
  c.querySelector(".qty").textContent = (amt * (180 + rnd(sd, 4) * 260) / 1000).toFixed(2).replace(".", ",") + "M";
  c.querySelector(".spd").textContent = (0.3 + rnd(sd, 5) * 0.2).toFixed(1).replace(".", ",") + " с";
}
const B3_L = 300, B3_R = 1620; // крайние точки: верх течёт вправо, низ влево
function runB3(t, a, b) {
  b3Rows.forEach((pool, row) => {
    const per = row ? 0.75 : 0.62, u = Math.max(0, t - a - 0.4 - row * 0.2) / per, n = 3 + Math.floor(u), sh = E.io(clamp((u - Math.floor(u)) / 0.5));
    const [k, q] = rowIn(t, a, b, row * 0.12);
    pool.forEach((c) => S(c, { o: 0 }));
    for (let m = n - 3; m <= n; m++) {
      const c = pool[((m % B3POOL) + B3POOL) % B3POOL]; fillTrade(c, m, row);
      const pos = n - m - 1 + sh; // −1 → 0: влетает; 2 → 3: уходит
      const x = row ? B3_R - pos * STEP : B3_L + pos * STEP;
      const enter = pos < 0 ? 1 + pos : 1, leave = pos > 2 ? 1 - (pos - 2) : 1;
      const pop = m === n ? E.soft(clamp(sh * 1.1)) : 1;
      at(c, x, ROW_Y[row], { ws: ROWS, o: k * (1 - q) * clamp(enter * 1.4) * leave, s: (0.94 + 0.06 * k) * (0.78 + 0.22 * pop), b: (1 - k) * 12 + q * 14 + (1 - leave) * 8, y: (1 - k) * (row ? 30 : -30) });
    }
  });
}

// коллаж «Хочешь просто торговать?»: восемь цельных виджетов на орбите — без
// обрезков баннеров, все одного стиля и целиком в кадре
const ORB = [
  wg(B, 260, 112, `<div class="row" style="justify-content:space-between"><span style="font:800 18px Nunito">SOL</span><span class="chip up" style="background:rgba(46,232,122,.14)">+2.07%</span></div><div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:4px"><span class="num tn" style="font-size:24px">$120.48</span>${spark(SOL.slice(12), 100, 34, "#2EE87A")}</div>`),
  wg(B, 320, 92, `<div class="row">${logo("m", 56)}<div style="flex:1"><div style="font:800 19px Nunito">Mintly</div><div class="lb" style="font-size:14px">$MINT · 61% до биржи</div></div><span class="up" style="font:800 17px Nunito">+38%</span></div>`),
  wg(B, 270, 120, `<div style="position:absolute;inset:0;border-radius:26px;background:${КАРТА};box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)"></div><div style="position:relative;color:#fff"><div style="font:500 14px Onest;opacity:.85">Баланс</div><div style="font:800 32px Nunito" class="tn">$1 284.50</div><div style="font:900 12px Nunito;letter-spacing:.16em;opacity:.8;margin-top:6px">LEO_BUILDS</div></div>`),
  wg(B, 236, 92, `<div class="row"><div style="width:50px;height:50px;border-radius:16px;background:#fff;display:flex;align-items:center;justify-content:center">${ICO.bolt("#0A0A0F", 24)}</div><div><div class="lb" style="font-size:14px">Подтверждено за</div><div class="num tn" style="font-size:23px">0.4 с</div></div></div>`),
  wg(B, 320, 88, `<div class="row">${logo("pup", 50)}<div style="flex:1"><div style="font:800 17px Nunito">Купил 2.1M PUP</div><div class="lb" style="font-size:13px">за 3 GRAM · комиссия 0%</div></div>${ICO.check()}</div>`),
  wg(B, 230, 112, `<div class="lb">Комиссия платформы</div><div style="font:800 50px/1.05 Nunito;letter-spacing:-.03em" class="accent">0%</div>`),
  wg(B, 290, 112, `<div class="row"><div style="width:64px;height:64px;border-radius:20px;background:#fff;display:flex;align-items:center;justify-content:center;font:900 30px Nunito;color:#000">𝕏</div><div><div style="font:800 18px Nunito">@leo_builds</div><div class="lb" style="font-size:13px">автор токена в ленте</div><span class="chip" style="background:rgba(255,255,255,.1);color:#fff;margin-top:6px">X привязан</span></div></div>`),
  wg(B, 260, 112, `<div class="row" style="justify-content:space-between"><span style="font:800 18px Nunito">GRAM</span><span class="chip dn" style="background:rgba(255,90,99,.16)">−4.52%</span></div><div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:4px"><span class="num tn" style="font-size:24px">$1.54</span>${spark(TON.slice(12), 100, 34, "#E5484D")}</div>`),
];

// ============ C · SIMPLE + ЛОГОТИП 15–19.7 ============
const C = scene(15.45, 19.75);
// «Просто.» как в референсе: буквы группами между линиями сетки, у каждой
// группы свои края и свои зазоры; сетка едет за буквами, пока слово собирается
const C_GROUPS = ["П", "ро", "ст", "о."], C_GAPS = [96, 170, 70], C_TOP = 386, C_SIZE = 230;
// линии по высоте капители и базовой линии Nunito при line-height 1
const C_CAP = C_TOP + 0.124 * C_SIZE, C_BASE = C_TOP + 0.829 * C_SIZE;
const cBand = $(`<div class="abs" style="left:0;top:${C_TOP - 40}px;width:1920px;height:${C_SIZE + 90}px;overflow:hidden"></div>`); C.appendChild(cBand);
const cGroups = C_GROUPS.map((g) => { const e = $(`<div class="abs grad" style="left:0;top:40px;font:800 ${C_SIZE}px/1 'Nunito';letter-spacing:-0.03em;color:#FFFFFF;white-space:nowrap">${g}</div>`); cBand.appendChild(e); return e; });
const cH = [C_CAP, C_BASE].map((y) => { const g = $(`<div class="guide" style="background:rgba(255,255,255,.2);left:0;top:${y}px;width:1920px;height:1px;transform-origin:50% 50%"></div>`); C.appendChild(g); return g; });
// у каждой группы два края; у части краёв — вторая линия рядом, как в референсе
const cV = [];
C_GROUPS.forEach((_, gi) => [0, 1].forEach((side) => {
  const offs = (gi + side) % 2 ? [0, side ? 12 : -12] : [0];
  offs.forEach((off) => { const g = $(`<div class="guide" style="background:rgba(255,255,255,.2);left:0;top:0;width:1px;height:1080px;transform-origin:50% ${((C_CAP + C_BASE) / 2 / 10.8).toFixed(1)}%"></div>`); g.gi = gi; g.side = side; g.off = off; C.appendChild(g); cV.push(g); });
}));
const cDots = [];
C_GROUPS.forEach((_, gi) => [0, 1].forEach((side) => [C_CAP, C_BASE].forEach((y) => { const d = $(`<div class="abs" style="left:0;top:0;width:7px;height:7px;background:#FFFFFF"></div>`); d.gi = gi; d.side = side; d.y = y; C.appendChild(d); cDots.push(d); })));
const cAlt = $(`<div class="c" style="top:40px;font:800 ${C_SIZE}px/1 'Nunito';letter-spacing:-0.03em;color:#FFFFFF;white-space:nowrap"><span class="grad" style="display:inline-block">Быстро.</span></div>`); cBand.appendChild(cAlt);
const cLogo = mLogo(C, { F: 132, tail: "Mintly.company", base: 540 + 0.705 * 150 / 2, fill: "#FFFFFF,#E3E7ED,#A7AFBA", text: "color:#FFFFFF", glow: "drop-shadow(0 12px 36px rgba(255,255,255,.18))" });

// ============ D · ВОЗМОЖНОСТИ 19.5–37.1 ============
const D = scene(19.5, 37.15);
// D1 — запуск: настоящий экран создания токена, по буквам
const CREATE = Array.from({ length: 18 }, (_, i) => "create-" + String(i).padStart(2, "0"));
const d1Scr = screen(frames(CREATE) + toast("Mintly запущен", "MINT · в сети за 1.2 с") + `<div class="tap"></div>`);
const d1Wrap = $(`<div class="abs" style="inset:0"></div>`); D.appendChild(d1Wrap);
const d1Phone = new Phone3D(d1Wrap, d1Scr);
const d1T1 = line(D, "Создай свой *мемкоин*", { top: 364, size: 80, weight: 600 }); d1T1.style.left = "930px"; d1T1.style.textAlign = "left";
const d1T2 = line(D, "за несколько секунд.", { top: 468, size: 80, weight: 600, color: "#8E8E99" }); d1T2.style.left = "930px"; d1T2.style.textAlign = "left";
const d1Card = wg(D, 440, 150, `<div class="row">${logo("m", 62)}<div style="flex:1"><div style="font:800 22px Nunito">Mintly запущен</div><div class="lb" style="font-size:14px">$MINT · в сети за 1.2 с</div></div><span class="chip up" style="background:rgba(46,232,122,.14)">В СЕТИ</span></div>
  <div style="display:flex;justify-content:space-between;margin-top:16px" class="lb"><span style="font-size:13px">Кривая бондинга</span><span class="tn d1pct" style="font:800 14px Nunito;color:#FFFFFF">0%</span></div>
  <div style="height:8px;border-radius:4px;background:rgba(255,255,255,.1);margin-top:7px;overflow:hidden"><div class="d1bar" style="height:100%;width:0;border-radius:4px;background:linear-gradient(90deg,#8E8E99,#fff)"></div></div>`);
// D2 — торговля: страница токена, лист покупки, нажатие
const d2Scr = screen(frames(["token"]) + `<div class="chartA" style="position:absolute;left:0;top:264px;width:393px;height:360px"></div>` + frames(["buy", "buy5"]) + toast("Куплено 7 291 338 MINT", "за 5 GRAM · комиссия платформы 0%") + `<div class="tap"></div>`);
const d2Wrap = $(`<div class="abs" style="inset:0"></div>`); D.appendChild(d2Wrap);
const d2Phone = new Phone3D(d2Wrap, d2Scr);
const d2T1 = line(D, "Торгуй с", { top: 236, size: 92, weight: 600 }); d2T1.style.left = "250px"; d2T1.style.textAlign = "left";
const d2Zero = $(`<div class="abs accent" style="left:240px;top:330px;font:800 290px/1 'Nunito';letter-spacing:-0.05em;padding-right:20px">0%</div>`); D.appendChild(d2Zero);
const d2T2 = line(D, "комиссией.", { top: 616, size: 92, weight: 600, color: "#8E8E99" }); d2T2.style.left = "250px"; d2T2.style.textAlign = "left";
const d2Card = wg(D, 470, 150, `<div class="lb" style="font-size:14px;display:flex;justify-content:space-between"><span>Чек · MINT</span><span>только что</span></div>
  ${[["Ты заплатил", "5 GRAM"], ["Комиссия платформы", "0.00 GRAM"]].map(([a, b], i) => `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:${i ? 8 : 12}px;font:600 17px Onest"><span style="color:#8E8E99">${a}</span><span style="font:800 19px Nunito;${i ? "color:#2EE87A" : ""}" class="tn">${b}${i ? ` <span style="vertical-align:-3px">${ICO.check("#2EE87A", 17)}</span>` : ""}</span></div>`).join("")}`);
// свечи нового токена (в единицах 1e-8 $): все зелёные, разной длины и с разными тенями
const CND = [[60, 70, 74, 57], [70, 86, 89, 68], [86, 90, 97, 83], [90, 108, 110, 87], [108, 117, 125, 106]];
const CH_W = 393, CH_H = 360, PLOT_R = 312, PY0 = 18, PY1 = 318, VMIN = 50, VMAX = 178, UP = "#00E96B";
const cy = (v) => PY1 - (v - VMIN) / (VMAX - VMIN) * (PY1 - PY0);
// g — рост шестой свечи 0…1: тело тянется вверх, тень обгоняет его, цена-метка едет следом
function chartSVG(g) {
  const cw = 26, x0 = 138, bw = 13;
  let h = "";
  for (let v = 60; v <= 170; v += 20) h += `<line x1="0" x2="${PLOT_R}" y1="${cy(v).toFixed(1)}" y2="${cy(v).toFixed(1)}" stroke="rgba(255,255,255,.06)"/><text x="${PLOT_R + 6}" y="${(cy(v) + 4).toFixed(1)}" fill="#8E8E99" font-family="Onest" font-size="10">$0.00000${String(v).padStart(3, "0").slice(0, 3).replace(/^0/, "0")}</text>`;
  [40, 118, 196, 274].forEach((x) => { h += `<line x1="${x}" x2="${x}" y1="0" y2="${PY1 + 10}" stroke="rgba(255,255,255,.05)"/>`; });
  ["12:41", "12:43", "12:45"].forEach((tx, i) => { h += `<text x="${118 + i * 78}" y="${PY1 + 30}" fill="#8E8E99" font-family="Onest" font-size="11" text-anchor="middle">${tx}</text>`; });
  const all = g > 0 ? [...CND, [117, 117 + 46 * g, 117 + 52 * E.out(Math.min(1, g * 1.15)), 115]] : CND;
  all.forEach(([o, c, hi, lo], i) => {
    const x = x0 + i * cw, yt = cy(Math.max(o, c)), yb = cy(Math.min(o, c));
    h += `<line x1="${x}" x2="${x}" y1="${cy(hi).toFixed(1)}" y2="${cy(lo).toFixed(1)}" stroke="${UP}" stroke-width="1.6"/><rect x="${x - bw / 2}" y="${yt.toFixed(1)}" width="${bw}" height="${Math.max(2, yb - yt).toFixed(1)}" rx="1.5" fill="${UP}"/>`;
  });
  const last = all[all.length - 1][1], ly = cy(last);
  h += `<line x1="0" x2="${PLOT_R}" y1="${ly.toFixed(1)}" y2="${ly.toFixed(1)}" stroke="${UP}" stroke-width="1" stroke-dasharray="4 4" opacity=".8"/>
    <rect x="${PLOT_R + 2}" y="${(ly - 10).toFixed(1)}" width="${CH_W - PLOT_R - 4}" height="20" rx="5" fill="${UP}"/><text x="${PLOT_R + 6}" y="${(ly + 4).toFixed(1)}" fill="#04210F" font-family="Onest" font-weight="700" font-size="10">$0.00000${Math.round(last).toString().padStart(3, "0")}</text>`;
  return `<svg width="${CH_W}" height="${CH_H}" viewBox="0 0 ${CH_W} ${CH_H}">${h}</svg>`;
}
// D3 — скорость
const d3 = $(`<div class="c" style="top:340px;font:700 108px/1.08 'Nunito';letter-spacing:-0.035em;color:#FFFFFF"><div id="d3a" class="grad" style="display:inline-block">Самые быстрые транзакции</div><br/><div id="d3b" style="display:inline-block" class="accent">в мире.</div></div>`); D.appendChild(d3);
const d3Trails = [0, 1, 2].map(() => { const tr = $(`<div class="c" style="top:340px;font:700 108px/1.08 'Nunito';letter-spacing:-0.035em;color:#55585F;opacity:0">Самые быстрые транзакции</div>`); D.appendChild(tr); return tr; });
const d3Lines = Array.from({ length: 7 }, (_, i) => { const l = $(`<div class="abs" style="left:0;top:${300 + i * 46}px;width:${260 + (i % 3) * 140}px;height:3px;border-radius:2px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.5),rgba(255,255,255,0))"></div>`); D.appendChild(l); return l; });
const d3Card = wg(D, 520, 104, `<div class="row"><div style="width:62px;height:62px;border-radius:19px;background:#fff;display:flex;align-items:center;justify-content:center;flex:none">${ICO.bolt("#0A0A0F", 30)}</div>
  <div style="flex:1"><div style="font:800 21px Nunito" class="d3st">Отправка…</div><div class="lb" style="font-size:14px">Покупка $MINT на 5 GRAM</div></div>
  <div class="row" style="gap:10px"><div class="d3ok" style="opacity:0;width:34px;height:34px;border-radius:50%;background:rgba(46,232,122,.14);display:flex;align-items:center;justify-content:center">${ICO.check("#2EE87A", 20)}</div><div class="num tn d3tm" style="font-size:30px;min-width:96px;text-align:right">0.00 с</div></div></div>`, "0 24px");
d3Card.style.display = "flex"; d3Card.style.alignItems = "center";
// D4 — кошелёк
const d4Wrap = $(`<div class="abs" style="left:380px;top:330px;width:620px;height:390px;perspective:1800px"></div>`); D.appendChild(d4Wrap);
const d4Card = $(`<div style="position:relative;width:100%;height:100%;transform-style:preserve-3d"></div>`); d4Wrap.appendChild(d4Card);
for (let i = 0; i < 10; i++) d4Card.appendChild($(`<div style="position:absolute;inset:0;border-radius:40px;background:linear-gradient(rgba(0,0,0,.3),rgba(0,0,0,.3)),${КАРТА};transform:translateZ(${(-5 + i).toFixed(1)}px)"></div>`));
d4Card.appendChild($(`<div style="position:absolute;inset:0;border-radius:40px;background:${КАРТА};transform:translateZ(5.5px);padding:34px 40px;color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.09),0 40px 80px rgba(0,0,0,.5)"><div style="position:absolute;top:34px;right:40px">${ЗВЕЗДА}</div>
  <div style="font:600 30px 'Onest';opacity:.9">Баланс</div><div style="font:800 96px/1.1 'Nunito';letter-spacing:-0.03em" class="tn d4bal">$1 284.50</div>
  <div style="position:absolute;left:44px;bottom:40px;font:900 26px Nunito;letter-spacing:.16em;color:rgba(255,255,255,.82)">LEO_BUILDS</div></div>`));
const d4Mintie = $(`<div class="abs" style="display:none;left:430px;top:-118px;width:140px;height:153px;background:url(assets/app/nav-breath.webp) 0 0/1200% 100% no-repeat;image-rendering:pixelated;transform:translateZ(6px)"></div>`); d4Card.appendChild(d4Mintie);
const d4T1 = line(D, "Твой кошелёк.", { top: 410, size: 96, weight: 600 }); d4T1.style.left = "1130px"; d4T1.style.textAlign = "left";
const d4T2 = line(D, "Прямо в *Telegram.*", { top: 530, size: 64, weight: 500, color: "#8E8E99" }); d4T2.style.left = "1134px"; d4T2.style.textAlign = "left";
// D5 — печать
const d5 = $(`<div class="c" style="top:450px;font:600 120px/1 'Onest';letter-spacing:-0.035em;color:#FFFFFF"><span id="d5t" class="grad"></span><span id="d5c" style="display:inline-block;width:6px;height:110px;background:#fff;margin-left:6px;vertical-align:-12px"></span></div>`); D.appendChild(d5);

// ============ E · ФИНАЛ 37–45 ============
const Esc = scene(37, 45);
const eRays = [-28, -14, -3, 9, 20, 33].map((a, i) => { const r = $(`<div class="abs" style="left:${700 + i * 90}px;top:-200px;width:${120 + (i % 3) * 60}px;height:1500px;transform-origin:50% 0;background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,0) 75%);filter:blur(28px);mix-blend-mode:screen"></div>`); r.a = a; Esc.appendChild(r); return r; });
// фон финала — стена мелких стеклянных пузырей, по которой идёт 3D-волна
const eBubbles = [];
// поле мелких пузырей: сетка разрежена и без box-shadow — 1560 теней роняли swiftshader,
// плотность сохраняется чаще расставленными ячейками, визуально так же «много мелких»
for (let r = 0; r < 20; r++) for (let c = 0; c < 34; c++) {
  const sd = r * 34 + c, sz = 6 + rnd(sd, 1) * 9;
  const b = $(`<div class="abs" style="left:0;top:0;width:${sz.toFixed(1)}px;height:${sz.toFixed(1)}px;border-radius:50%;border:1px solid rgba(225,246,255,.7);background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.95) 0 14%,rgba(255,255,255,.18) 34%,rgba(160,215,255,.10) 62%,rgba(225,246,255,.45) 100%)"></div>`);
  b.bx = -300 + c * 75 + (rnd(sd, 2) - 0.5) * 46 + (r % 2) * 36; b.by = r * 75 + (rnd(sd, 3) - 0.5) * 42; b.sz = sz;
  Esc.appendChild(b); eBubbles.push(b);
}
// логотип и имя одной строкой по общей оси — раньше имя сидело ниже знака
const eLogo = mLogo(Esc, { F: 160, base: 390 + 0.705 * 160 / 2, fill: "#FFFFFF,#E3E7ED,#A7AFBA", text: "color:#fff", glow: "drop-shadow(0 0 30px rgba(255,255,255,.35))" });
const ePill = $(`<div class="abs" style="left:50%;top:600px;transform:translateX(-50%);display:flex;align-items:center;gap:18px;padding:22px 38px 22px 26px;border-radius:999px;background:rgba(255,255,255,.9);box-shadow:0 20px 60px rgba(0,20,60,.35);white-space:nowrap">
  <div style="width:62px;height:62px;border-radius:50%;background:#2AABEE;display:flex;align-items:center;justify-content:center">${ICO.tg()}</div>
  <div><div style="font:500 26px 'Onest';color:#5C5F68">Открыть в Telegram</div><div style="font:800 40px 'Nunito';color:#0A0A0F">@MintlyAppbot</div></div></div>`); Esc.appendChild(ePill);
const eTag = line(Esc, "Запускай. Торгуй. *Взлетай.*", { top: 820, size: 46, weight: 600, color: "#ffffff" });
// на синем финале акцент светлее — иначе «Взлетай.» тонет в фоне
eTag.spans.forEach((w) => { if (w.classList.contains("accent")) w.style.backgroundImage = "linear-gradient(95deg,#FFFFFF,#A7AFBA)"; });

const fade = document.getElementById("fade");
const q1 = (el, s) => el.querySelector(s);

// ролик длится 55 с, а разметка ниже — в прежних 45 с: всё идёт в 55/45 раза медленнее
const STRETCH = 55 / 45;
window.renderAt = (tReal) => renderScene(tReal / STRETCH);
const absX = (el) => { let x = 0; for (let e = el; e && e !== root; e = e.offsetParent) x += e.offsetLeft; return x; };
function renderScene(t) {
  bgGrad.style.backgroundPosition = `${(50 + 50 * Math.sin(t * 0.21)).toFixed(2)}% ${(50 + 50 * Math.cos(t * 0.17)).toFixed(2)}%`;
  bgGrad.style.transform = `rotate(${(Math.sin(t * 0.09) * 8).toFixed(2)}deg)`;
  // display, а не visibility: дети с visibility:visible просвечивали бы сквозь скрытую сцену
  scenes.forEach(({ el, a, b }) => { el.style.display = t >= a && t < b ? "block" : "none"; el.style.visibility = "visible"; });
  bgBlobs.forEach((b, i) => {
    b.style.transform = `translate(${(Math.sin(t * 0.33 + i * 2) * 160).toFixed(1)}px,${(Math.cos(t * 0.27 + i * 1.3) * 90).toFixed(1)}px) scale(${(1 + 0.18 * Math.sin(t * 0.5 + i)).toFixed(3)})`;
    b.style.opacity = (0.42 + 0.18 * Math.sin(t * 0.6 + i * 1.7)).toFixed(3);
  });
  bgFog.parts.forEach((p, i) => { p.style.transform = `translate(${Math.sin(t * 0.5 + i) * 40}px,${Math.cos(t * 0.4 + i * 1.7) * 18}px)`; });

  // ---- A ----
  if (t < 5.7) {
    sceneFx(A, t, -1, 5.7, 0.5, 0.75);
    aLogo.at(t, 0.3, { big: 1.9, cy: 470 });
    const pk = E.out(prog(t, 1.1, 3.0));
    aPhone.pose({ x: 960, y: lerp(1600, 880, pk) + Math.sin(t * 0.9) * 6, s: 1.32, rx: lerp(30, 12, pk), ry: lerp(-18, -5, pk) + Math.sin(t * 0.6) * 3, rz: lerp(-4, -1, pk) });
    aW.forEach((w, i) => {
      const [x, y, d, r] = aPos[i], k = E.outQ(prog(t, d, d + 0.9)), f = Math.sin(t * 1.1 + i * 1.9);
      at(w, x, y, { o: k, y: (1 - k) * 40 + f * 8, s: 0.9 + 0.1 * k, b: (1 - k) * 12, r: r + f * 0.8 });
    });
  }
  // ---- B ----
  if (t >= 5.2 && t < 15.6) {
    sceneFx(B, t, 5.2, 15.6, 0.5, 0.35);
    words(b1, t, 5.5, { out: 7.85 }); words(b1b, t, 5.8, { out: 7.9, stag: 0.06 });
    runB1(t, 5.55, 7.8);
    words(b2, t, 8.4, { out: 10.15 });
    runB2(t, 8.45, 10.1);
    words(b3, t, 10.5, { out: 11.85 });
    runB3(t, 10.55, 11.8);
    // «Хочешь просто торговать?» → «просто» уезжает вниз, «удобно» приходит сверху
    if (!b4w.ws) { const w1 = b4a.offsetWidth, w2 = b4b.offsetWidth; if (w1) b4w.ws = [w1, w2]; }
    words(b4, t, 11.95, { out: 13.55, stag: 0.06 });
    { const q = E.io(prog(t, 12.7, 13.25)), d = 0.42 * 76;
      if (b4w.ws) b4w.style.width = lerp(b4w.ws[0], b4w.ws[1], q).toFixed(1) + "px";
      S(b4a, { o: 1 - q, y: q * d, b: q * 8 }); S(b4b, { o: q, y: -(1 - q) * d, b: (1 - q) * 8 }); }
    // «Тогда знакомься — M»: текст уходит, M едет в центр и выпускает буквы
    if (!b5.tw && b5.spans[0].offsetWidth) { b5.tw = b5.spans.reduce((a, e) => a + e.offsetWidth, 0) + 16 * (b5.spans.length - 1); }
    b5Logo.measure();
    if (b5.tw && b5Logo.w) {
      const fs = 64 / B5F, mws = b5Logo.mW * fs, tot = b5.tw + 22 + mws;
      b5.style.transform = `translateX(${(-(tot / 2) + b5.tw / 2).toFixed(1)}px)`;
      words(b5, t, 13.65, { out: 14.1, stag: 0.05, outDur: 0.4 });
      b5Logo.atFrom(t, 13.85, 14.35, { fromX: 960 - tot / 2 + b5.tw + 22 + mws / 2, fromY: B5_BASE - 0.705 * 64 / 2, fromS: fs });
    }
    const ok = E.out(prog(t, 11.85, 13.1)), oq = E.io(prog(t, 14.1, 14.7));
    ORB.forEach((c, i) => {
      const a = (i / ORB.length) * Math.PI * 2 + t * 0.26 + 0.4;
      const R = lerp(1.6, 1, ok) * (1 + oq * 0.35), x = 960 + Math.cos(a) * 700 * R, y = 545 + Math.sin(a) * 300 * R, dz = (Math.sin(a) + 1) / 2;
      c.style.zIndex = Math.round(dz * 10);
      at(c, x, y, { o: clamp(ok * 1.4) * (1 - oq), s: (0.84 + dz * 0.18), r: Math.cos(a) * 3, b: oq * 10 });
    });
  }
  // ---- C ----
  if (t >= 15.45 && t < 19.75) {
    sceneFx(C, t, 15.45, 19.75, 0.45, 0.45);
    if (!cGroups.w || !cGroups.w[0]) cGroups.w = cGroups.map((e) => e.offsetWidth);
    const ws = cGroups.w, tot = ws.reduce((a, b) => a + b, 0);
    // зазоры дышат, пока слово разобрано, и схлопываются при сборке
    const join = E.io(prog(t, 16.3, 16.85)), mb = Math.sin(prog(t, 16.3, 16.85) * Math.PI) * 5;
    const gaps = C_GAPS.map((g, gi) => g * (1 + 0.16 * Math.sin(t * 1.4 + gi * 2.1)) * (1 - join));
    // собранное «Просто.» уходит вниз, «Быстро.» приходит сверху — одним темпом
    const sw = E.io(prog(t, 16.95, 17.5)), d = 1.05 * C_SIZE;
    let x = 960 - (tot + gaps.reduce((a, b) => a + b, 0)) / 2;
    const xs = ws.map((w, gi) => { const at0 = x; x += w + (gaps[gi] || 0); return at0; });
    cGroups.forEach((e, gi) => {
      const k = E.outQ(prog(t, 15.5 + gi * 0.07, 16.25 + gi * 0.07));
      S(e, { o: k * (1 - sw), x: xs[gi], y: (1 - k) * 36 + sw * d, b: (1 - k) * 12 + mb + sw * 10 });
    });
    const bo = E.io(prog(t, 17.6, 17.95));
    S(cAlt, { o: sw * (1 - bo), y: -(1 - sw) * d, b: (1 - sw) * 10 + bo * 12, s: 1 - bo * 0.3 });
    const gl = (1 - E.io(prog(t, 16.95, 17.35)));
    cH.forEach((g, hi) => { const k = E.out(prog(t, 15.45 + hi * 0.1, 16.35 + hi * 0.1)); g.style.opacity = gl; g.style.transform = `scaleX(${k.toFixed(4)})`; });
    cV.forEach((g, vi) => {
      const k = E.out(prog(t, 15.5 + vi * 0.035, 16.3 + vi * 0.035));
      const lx = xs[g.gi] + (g.side ? ws[g.gi] : 0) + g.off;
      g.style.opacity = gl; g.style.transform = `translateX(${lx.toFixed(2)}px) scaleY(${k.toFixed(4)})`;
    });
    cDots.forEach((dd, di) => {
      const k = E.outQ(prog(t, 15.95 + di * 0.02, 16.35 + di * 0.02));
      const lx = xs[dd.gi] + (dd.side ? ws[dd.gi] : 0);
      S(dd, { o: k * gl, x: lx - 3, y: dd.y - 3, s: k });
    });
    cLogo.at(t, 17.7, { big: 2.2, cy: 540, k: 0.72 });
  }
  // ---- D ----
  if (t >= 19.5 && t < 37.15) {
    sceneFx(D, t, 19.5, 37.15, 0.4, 0.6);
    // D1 19.6–24.4 — телефон заезжает снизу, экран печатает по-настоящему
    { const p1 = E.out(prog(t, 19.55, 21.0)), o1 = E.io(prog(t, 23.7, 24.45));
      d1Phone.pose({ x: lerp(560, 400, o1), y: lerp(1500, 545, p1) + Math.sin(t * 0.9) * 6 + o1 * 120, s: 1.13, rx: lerp(18, 4, p1), ry: lerp(30, 17, p1) + Math.sin(t * 0.55) * 2.5 + o1 * 14, rz: lerp(4, 1, p1), o: 1 - o1 });
      d1Wrap.style.filter = o1 > 0.01 ? `blur(${(o1 * 12).toFixed(1)}px)` : "none";
      // кадры набора сменяются через короткое растворение, а прокрутка к кнопке —
      // настоящим сдвигом снимка: раньше кадры прыгали без перехода
      const sc = E.io(prog(t, 22.35, 22.8));
      if (t < 22.35) {
        let fi = 0, ft = 0, fd = 0.25;
        if (t >= 20.75) { fi = 1; ft = 20.75; }
        if (t >= 21.05) { const n = Math.min(5, Math.floor((t - 21.05) / 0.12)); fi = 2 + n; ft = 21.05 + n * 0.12; fd = 0.07; }
        if (t >= 21.95) { const n = Math.min(3, Math.floor((t - 21.95) / 0.11)); fi = 8 + n; ft = 21.95 + n * 0.11; fd = 0.06; }
        blendFrame(d1Scr, fi, prog(t, ft, ft + fd));
      } else {
        const im = d1Scr.querySelectorAll("img.f");
        im.forEach((x, j) => { x.style.opacity = j === 11 || j === 17 ? 1 : 0; x.style.transform = "none"; x.style.zIndex = j === 11 ? 2 : 1; });
        im[11].style.transform = `translateY(${(-128 * sc).toFixed(2)}px)`; im[17].style.transform = `translateY(${(128 * (1 - sc)).toFixed(2)}px)`;
      }
      const tp = q1(d1Scr, ".tap"); tp.style.left = "196px"; tp.style.top = "671px"; tap(tp, t, 22.85);
      const ts = q1(d1Scr, ".toastA"), tk = E.outQ(prog(t, 23.1, 23.5)); ts.style.opacity = tk; ts.style.transform = `translateY(${(1 - tk) * -24}px)`;
      words(d1T1, t, 20.1, { out: 23.75 }); words(d1T2, t, 20.4, { out: 23.8 });
      const ck = E.outQ(prog(t, 23.15, 23.9)), cq = E.io(prog(t, 23.85, 24.45));
      at(d1Card, 1150, 712, { o: ck * (1 - cq), y: (1 - ck) * 50, s: 0.92 + 0.08 * ck, b: (1 - ck) * 12 + cq * 12 });
      const pc = Math.round(61 * E.out(prog(t, 23.35, 24.2))); q1(d1Card, ".d1pct").textContent = pc + "%"; q1(d1Card, ".d1bar").style.width = pc + "%"; }
    // D2 24.2–28.7 — график, лист покупки, нажатие, тост
    { const p2 = E.out(prog(t, 24.15, 25.5)), o2 = E.io(prog(t, 28.3, 28.85));
      d2Phone.pose({ x: lerp(1360, 1520, o2), y: lerp(1500, 545, p2) + Math.sin(t * 0.9 + 1) * 6 + o2 * 120, s: 1.13, rx: lerp(18, 4, p2), ry: lerp(-30, -17, p2) + Math.sin(t * 0.55 + 1) * 2.5 - o2 * 14, rz: lerp(-4, -1, p2), o: (t > 24.1 ? 1 : 0) * (1 - o2) });
      d2Wrap.style.filter = o2 > 0.01 ? `blur(${(o2 * 12).toFixed(1)}px)` : "none";
      const imgs = d2Scr.querySelectorAll("img.f");
      const sheet = E.out(prog(t, 25.9, 26.35)), back = E.io(prog(t, 27.4, 27.75));
      imgs[0].style.opacity = 1;
      // после покупки свеча растёт плавно, как живая свеча в приложении
      const grow = E.io(prog(t, 27.6, 28.3)), chEl = q1(d2Scr, ".chartA");
      if (chEl.g !== grow) { chEl.g = grow; chEl.innerHTML = chartSVG(grow); }
      // сумма «5» появляется растворением, а не скачком
      const five = E.sine(prog(t, 26.66, 26.84));
      imgs[1].style.opacity = t < 26.84 ? sheet : 0; imgs[2].style.opacity = five * (1 - back);
      [imgs[1], imgs[2]].forEach((im) => { const k = im === imgs[1] ? sheet : 1 - back; im.style.clipPath = `inset(${((1 - k) * 60).toFixed(1)}% 0 0 0)`; im.style.transform = `translateY(${(1 - k) * 60}px)`; });
      const tp = q1(d2Scr, ".tap"); if (t < 26.9) { tp.style.left = "153px"; tp.style.top = "462px"; tap(tp, t, 26.5); } else { tp.style.left = "196px"; tp.style.top = "742px"; tap(tp, t, 27.0); }
      const ts = q1(d2Scr, ".toastA"), tk = E.outQ(prog(t, 27.25, 27.65)) * (1 - E.io(prog(t, 28.15, 28.5))); ts.style.opacity = tk; ts.style.transform = `translateY(${(1 - tk) * -24}px)`;
      words(d2T1, t, 24.55, { out: 28.15 }); words(d2T2, t, 25.35, { out: 28.2 });
      const zk = E.outQ(prog(t, 24.9, 25.8)), zq = E.io(prog(t, 28.0, 28.6));
      S(d2Zero, { o: zk * (1 - zq), y: (1 - zk) * 40, s: 0.94 + 0.06 * zk + zq * 0.05, b: (1 - zk) * 16 + zq * 14 });
            const ck = E.outQ(prog(t, 27.3, 28.0)), cq = E.io(prog(t, 28.0, 28.6));
      at(d2Card, 485, 862, { o: ck * (1 - cq), y: (1 - ck) * 40, b: (1 - ck) * 12 + cq * 12, s: 0.94 + 0.06 * ck }); }
    // D3 28.6–31.7 — строка влетает со шлейфом, ниже — сделка за 0.4 с
    { const k = E.outQ(prog(t, 28.65, 29.55)), q = E.io(prog(t, 31.1, 31.7));
      d3.style.display = t >= 28.6 && t < 31.75 ? "block" : "none";
      const a = document.getElementById("d3a"), b = document.getElementById("d3b");
      S(a, { x: lerp(-700, 0, k), o: clamp(k * 1.6) * (1 - q), b: (1 - k) * 10 + q * 14, s: 1 + q * 0.04 });
      d3Trails.forEach((tr, i) => { S(tr, { o: t > 28.65 && t < 29.6 ? (1 - k) * (0.45 - i * 0.12) : 0, x: lerp(-700, 0, k) - (i + 1) * 70 * (1 - k), b: 4 + i * 3 }); });
      const k2 = E.outQ(prog(t, 29.25, 30.0)); S(b, { o: k2 * (1 - q), y: (1 - k2) * 30, b: (1 - k2) * 12 + q * 14 });
      d3Lines.forEach((l, i) => { const lk = prog(t, 28.6 + i * 0.05, 29.5 + i * 0.05); S(l, { o: Math.sin(lk * Math.PI) * 0.9, x: lerp(-500, 2000, E.io(lk)) }); });
      const ck = E.outQ(prog(t, 29.6, 30.3));
      at(d3Card, 960, 720, { o: ck * (1 - q), y: (1 - ck) * 40, s: 0.94 + 0.06 * ck, b: (1 - ck) * 12 + q * 12 });
      const run = prog(t, 30.25, 30.65); q1(d3Card, ".d3tm").textContent = (0.4 * run).toFixed(2) + " с";
      const done = t >= 30.65; q1(d3Card, ".d3st").textContent = done ? "Подтверждено" : "Отправка…"; q1(d3Card, ".d3st").style.color = done ? "#2EE87A" : "#FFFFFF";
      const okk = E.soft(prog(t, 30.65, 31.0)); const okEl = q1(d3Card, ".d3ok"); okEl.style.opacity = clamp(okk); okEl.style.transform = `scale(${okk})`; }
    // D4 31.6–34.8 — кошелёк: карта мягко покачивается, сверху садится Минти
    { const k = E.out(prog(t, 31.55, 32.7)), q = E.io(prog(t, 34.15, 34.8));
      d4Wrap.style.display = t >= 31.5 && t < 34.85 ? "block" : "none";
      d4Card.style.transform = `translateY(${lerp(420, 0, k) - q * 60}px) rotateX(${lerp(34, 8, k) + Math.sin(t * 0.8) * 2}deg) rotateY(${lerp(-38, -14, k) + Math.sin(t * 0.6) * 5}deg)`;
      d4Wrap.style.opacity = clamp(k * 1.5) * (1 - q); d4Wrap.style.filter = q > 0.01 ? `blur(${(q * 12).toFixed(1)}px)` : "none";
      const bal = 1284.5 * E.out(prog(t, 32.0, 33.0)); q1(d4Card, ".d4bal").textContent = "$" + Math.floor(bal).toLocaleString("en-US").replace(",", " ") + "." + String(Math.round((bal % 1) * 100)).padStart(2, "0").slice(0, 2);
      d4Mintie.style.opacity = E.out(prog(t, 33.0, 33.35)); d4Mintie.style.backgroundPosition = `${Math.floor(clamp((t - 33.0) * 10, 0, 11)) / 11 * 100}% 0`;
      words(d4T1, t, 32.0, { out: 34.15 }); words(d4T2, t, 32.35, { out: 34.2, stag: 0.08 }); }
    // D5 34.7–37 — Запускай / Торгуй / Взлетай|
    { const el = document.getElementById("d5t"), c = document.getElementById("d5c");
      const seq = [["Запускай", 34.8, 35.55], ["Торгуй", 35.6, 36.3], ["Взлетай", 36.35, 37.15]];
      const cur = seq.find(([, a, b]) => t >= a && t < b);
      d5.style.opacity = t >= 34.8 ? 1 : 0;
      if (cur) { const n = Math.floor(clamp((t - cur[1]) * 20, 0, cur[0].length)); el.textContent = cur[0].slice(0, n); el.className = cur[0] === "Взлетай" ? "accent" : "grad"; }
      c.style.opacity = Math.floor(t * 3) % 2 ? 1 : 0.15; }
  }
  // ---- E ----
  if (t >= 37) {
    eRays.forEach((r, i) => { r.style.transform = `rotate(${r.a + Math.sin(t * 0.6 + i * 1.3) * 4}deg)`; r.style.opacity = 0.6 + Math.sin(t * 0.9 + i) * 0.3; });
    eBubbles.forEach((b) => {
      // волна бежит по диагонали; ближе к зрителю пузырь крупнее и ярче
      const z = 170 * Math.sin(b.bx * 0.0055 + t * 1.5) * Math.cos(b.by * 0.0065 - t * 1.05) + 90 * Math.sin((b.bx + b.by) * 0.0042 + t * 2.0);
      const sc = 900 / (900 - z), yy = ((b.by - (t - 37) * 14) % 1500 + 1500) % 1500 - 220;
      S(b, { x: 960 + (b.bx - 960) * sc - b.sz / 2, y: 540 + (yy - 540) * sc - b.sz / 2, s: sc * (0.9 + 0.2 * (z + 260) / 520), o: clamp(0.35 + 0.55 * (z + 260) / 520) });
    });
    const ek = E.out(prog(t, 37, 37.8)); Esc.style.opacity = ek; Esc.style.filter = ek < 1 ? `blur(${((1 - ek) * 10).toFixed(1)}px)` : "none";
    eLogo.at(t, 37.7, { big: 2.3, cy: 470 });
    const pk = E.outQ(prog(t, 39.9, 40.7)); ePill.style.opacity = pk; ePill.style.transform = `translateX(-50%) translateY(${(1 - pk) * 36}px) scale(${0.94 + 0.06 * pk})`; ePill.style.filter = pk < 1 ? `blur(${((1 - pk) * 10).toFixed(1)}px)` : "none";
    words(eTag, t, 40.8, { stag: 0.14 });
  }
  fade.style.opacity = Math.max(E.sine(prog(t, 44.0, 45)), 1 - prog(t, 0, 0.4));
  // градиент букв бежит по всей строке, а не начинается заново в каждом слове
  const gp = (t * 140) % 1800;
  document.querySelectorAll(".grad,.accent").forEach((el) => {
    if (el.offsetParent === null) return;
    if (el.gx == null || el.gt !== el.textContent) { el.gx = absX(el); el.gt = el.textContent; }
    el.style.backgroundPosition = `${(gp - el.gx).toFixed(1)}px 0`;
  });
}

Promise.all(["800 20px Nunito", "700 20px Nunito", "500 20px Onest", "600 20px Onest", "700 20px Onest"].map((f) => document.fonts.load(f, "AБВabcабв0123$%"))).then(() => document.fonts.ready).then(() => Promise.all([...document.images].map((i) => (i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; }))))).then(() => { window.renderAt(0); window.ready = true; });
