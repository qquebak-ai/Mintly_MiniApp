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
function line(parent, text, { size = 72, top = 470, weight = 500, color = "#0B1E46", font = "Onest", ls = "-0.02em" } = {}) {
  const el = $(`<div class="c" style="top:${top}px;font:${weight} ${size}px '${font}';letter-spacing:${ls};color:${color};white-space:nowrap"></div>`);
  const spans = text.split(" ").map((w) => { const acc = w.startsWith("*"); return $(`<span class="w${acc ? " accent" : ""}">${w.replace(/\*/g, "")}</span>`); });
  spans.forEach((s, i) => { el.appendChild(s); if (i < spans.length - 1) el.appendChild(document.createTextNode(" ")); });
  parent.appendChild(el); el.spans = spans; return el;
}
function words(l, t, a, { stag = 0.09, dur = 0.8, out = null, outDur = 0.6, rise = 30 } = {}) {
  l.spans.forEach((w, i) => {
    const k = E.outQ(prog(t, a + i * stag, a + i * stag + dur));
    let o = k, y = (1 - k) * rise, b = (1 - k) * 14, s = 1;
    if (out != null) { const q = E.io(prog(t, out + i * 0.045, out + i * 0.045 + outDur)); o *= 1 - q; b += q * 16; y -= q * 18; s = 1 + q * 0.05; }
    S(w, { o, y, b, s });
  });
}

// ---- общий фон: светлые пятна и голубой туман снизу ----
const BG = $(`<div class="abs" style="inset:0;background:#F6FAFF"></div>`); root.appendChild(BG);
const bgBlobs = [[300, 250, 420, "#CFE8FF"], [1650, 220, 380, "#CDF4F2"], [960, 1080, 520, "#A9D6FF"], [1500, 900, 360, "#DDF2FF"], [380, 950, 360, "#D4E9FF"]]
  .map(([x, y, r, c]) => { const b = $(`<div class="blob" style="left:${x - r}px;top:${y - r}px;width:${r * 2}px;height:${r * 2}px;background:${c}"></div>`); BG.appendChild(b); return b; });
const bgFog = $(`<div class="fog"></div>`); BG.appendChild(bgFog);
bgFog.parts = [[-2, 150, 520, "#B5DBFF"], [14, 100, 420, "#D2ECFF"], [30, 160, 560, "#A3CDFF"], [47, 90, 460, "#DDF4FF"], [63, 150, 540, "#B0D6FF"], [80, 100, 440, "#CDEFF5"], [96, 150, 520, "#A8D0FF"]]
  .map(([x, y, w, c]) => { const s = $(`<span style="left:${x}%;top:${y}px;width:${w}px;height:${w * 0.55}px;background:${c};opacity:.7"></span>`); bgFog.appendChild(s); return s; });

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
    <circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="4" fill="${col}" stroke="#fff" stroke-width="2"/></svg>`;
}
const GRAD = "linear-gradient(115deg,#E44BC8 0%,#C13AE6 18%,#8E2DE2 36%,#6A17E8 54%,#4A00E0 70%,#7B1FE0 84%,#2C0A78 100%)";
// токены: пиксельные логотипы и скины Минти — то, что люди и правда запускают
const SKIN = { gold: "#F4B73A,#B9770E", neon: "#28D7FF,#0A5BD8", violet: "#B26BFF,#5A20C9", mint: "#4BE3A6,#0E8A64" };
function logo(k, sz) {
  if (SKIN[k]) { const [a, b] = SKIN[k].split(","); return `<div class="lg" style="width:${sz}px;height:${sz}px;background:radial-gradient(circle at 30% 25%,${a},${b});display:flex;align-items:center;justify-content:center;overflow:hidden"><img src="assets/app/${k}-preview.webp" style="width:86%;image-rendering:pixelated;margin-top:6%"/></div>`; }
  return `<img class="lg" src="assets/tok/${k}.png" style="width:${sz}px;height:${sz}px"/>`;
}
const TOK = [["mcat", "Moon Cat", "MCAT"], ["frog", "Lily Frog", "LILY"], ["gold", "Gold Axo", "GAXO"], ["pup", "Pixel Pup", "PUP"], ["fire", "Hot Wick", "WICK"],
  ["neon", "Neon Axo", "NEON"], ["boo", "Boo", "BOO"], ["violet", "Violet", "VIO"], ["mint", "Minti", "MINT"]];
const ICO = {
  check: (c = "#0FA968", s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  bolt: (c, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="${c}"><path d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.6z"/></svg>`,
  minus: (c, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"><path d="M6 12h12"/></svg>`,
  clock: (c, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  tg: (s = 34) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M3 11.5 20 4.5l-3 15-5-4-3 3 .4-4.6L17 7.5 8 13z" fill="#fff"/></svg>`,
};
const fmtK = (v) => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(0));
const wg = (parent, w, h, html, pad = "16px 18px") => { const e = $(`<div class="wg" style="width:${w}px;height:${h}px;padding:${pad}">${html}</div>`); parent.appendChild(e); e.w = w; e.h = h; return e; };
// виджет ставится центром в (x, y)
const at = (e, x, y, o = {}) => S(e, { ...o, x: x - e.w / 2 + (o.x || 0), y: y - e.h / 2 + (o.y || 0) });

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

// ============ A · ИНТРО 0–5.6 ============
const A = scene(0, 5.7);
const aWord = $(`<div class="c" style="top:46px;font:800 280px/1 'Nunito';letter-spacing:-0.04em;white-space:nowrap"></div>`); A.appendChild(aWord);
const aLetters = [..."Mintly"].map((ch, i) => { const s = $(`<span class="w" style="background:linear-gradient(95deg,#0B4FD8,#1E8BFF 40%,#35D0E8 80%,#8FF3E6);background-size:600% 100%;background-position:${i * 20}% 0;padding-bottom:.14em;margin-bottom:-.14em;-webkit-background-clip:text;background-clip:text;color:transparent">${ch}</span>`); aWord.appendChild(s); return s; });
const aScr = screen(frames(["home"])); showFrame(aScr, 0);
const aPhone = new Phone3D(A, aScr);
const aW = [
  wg(A, 270, 124, `<div class="row" style="justify-content:space-between"><span style="font:800 19px Nunito">SOL</span><span class="chip up" style="background:#E3F8EE">+2.07%</span></div>
    <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:6px"><span class="num tn">$120.48</span>${spark(SOL.slice(10), 110, 38, "#0FA968")}</div>`),
  wg(A, 286, 92, `<div class="row">${logo("mcat", 56)}<div style="flex:1"><div style="font:800 19px Nunito">Moon Cat <span style="color:#5B7398;font:600 14px Onest">$MCAT</span></div>
    <div class="lb" style="font-size:14px;display:flex;align-items:center;gap:7px"><i style="width:8px;height:8px;border-radius:50%;background:#1E8BFF;display:inline-block"></i>Запущен 2 с назад</div></div></div>`),
  wg(A, 236, 132, `<div class="lb">Комиссия платформы</div><div style="font:800 58px/1.05 Nunito;letter-spacing:-.03em" class="accent">0%</div><div class="lb" style="font-size:13px">на каждую сделку</div>`),
  wg(A, 262, 92, `<div class="row"><div style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#0B4FD8,#35D0E8);display:flex;align-items:center;justify-content:center">${ICO.bolt("#fff", 26)}</div>
    <div><div class="lb" style="font-size:14px">Подтверждено за</div><div class="num tn" style="font-size:24px">0.4 с</div></div></div>`),
  wg(A, 330, 88, `<div class="row">${logo("frog", 52)}<div style="flex:1"><div style="font:800 18px Nunito">Купил 1.7M LILY</div><div class="lb" style="font-size:14px">за 5 GRAM · комиссия 0%</div></div>${ICO.check()}</div>`),
  wg(A, 260, 88, `<div class="row"><div style="display:flex">${["pup", "boo", "fire", "gold"].map((k, i) => `<div style="margin-left:${i ? -12 : 0}px;border:3px solid #fff;border-radius:50%;display:flex;background:#fff">${logo(k, 38)}</div>`).join("")}</div>
    <div><div class="num tn" style="font-size:21px">1 284</div><div class="lb" style="font-size:13px">держателя</div></div></div>`),
];
const aPos = [[430, 480, 1.25, -3], [1480, 455, 1.4, 2.5], [330, 735, 1.55, 2], [1600, 700, 1.7, -2], [560, 945, 1.85, 1.5], [1380, 950, 2.0, -1.5]];

// ============ B · ПРОБЛЕМА 5.2–15.1 ============
const B = scene(5.2, 15.15);
const b1 = line(B, "Каждый день появляется новый *мемкоин*", { top: 474, size: 72 });
const b2 = line(B, "Комиссии *не* *съедают* твою прибыль.", { top: 470, size: 78 });
const b3 = line(B, "Торгуй *доступно.*", { top: 462, size: 88 });
const b4 = line(B, "Хочешь просто торговать?", { top: 500, size: 46, color: "#5B7398" });
const b5 = line(B, "Тогда знакомься — *Mintly.*", { top: 486, size: 64 });

// ряды виджетов: по четыре над и под фразой, каждый слот всё время меняет
// карточку — новая въезжает снизу, старая уходит вверх
const SLOT_W = 312, SLOT_H = 96;
const SLOT_X = [[444, 788, 1132, 1476], [444, 788, 1132, 1476]], SLOT_Y = [262, 818];
function makeSlots(builders) {
  return Array.from({ length: 8 }, (_, i) => {
    const holder = $(`<div class="slot" style="width:${SLOT_W}px;height:${SLOT_H}px;box-shadow:0 22px 48px rgba(18,64,150,.13);border-radius:26px"></div>`); B.appendChild(holder);
    holder.cards = builders(i).map((html) => { const c = $(`<div class="wg" style="width:${SLOT_W}px;height:${SLOT_H}px;padding:0 18px;display:flex;align-items:center;box-shadow:none">${html}</div>`); holder.appendChild(c); return c; });
    holder.x = SLOT_X[i < 4 ? 0 : 1][i % 4]; holder.y = SLOT_Y[i < 4 ? 0 : 1];
    return holder;
  });
}
// слоты живут в окне [a, b]: вход россыпью, смена карточек по кругу, мягкий уход
function runSlots(slots, t, a, b, period, tick) {
  slots.forEach((h, i) => {
    const d = (i % 4) * 0.07 + (i < 4 ? 0 : 0.12);
    const k = E.outQ(prog(t, a + d, a + d + 0.75)), q = E.io(prog(t, b + d * 0.6, b + d * 0.6 + 0.6));
    const fl = Math.sin(t * 1.3 + i * 1.7) * 5;
    S(h, { o: k * (1 - q), x: h.x - SLOT_W / 2, y: h.y - SLOT_H / 2 + (1 - k) * (i < 4 ? -26 : 26) + fl - q * (i < 4 ? 18 : -18), b: (1 - k) * 12 + q * 14, s: 0.94 + 0.06 * k });
    if (k <= 0 || q >= 1) return;
    const local = Math.max(0, t - (a + 0.7 + i * 0.13));
    const n = Math.floor(local / period), f = local / period - n;
    const sw = E.io(clamp((f - (1 - 0.32)) / 0.32));
    h.cards.forEach((c, j) => {
      const cur = n % h.cards.length, nxt = (n + 1) % h.cards.length;
      if (j === cur) S(c, { o: 1 - sw, y: -sw * SLOT_H * 0.7, b: sw * 6 });
      else if (j === nxt) S(c, { o: sw, y: (1 - sw) * SLOT_H * 0.7, b: (1 - sw) * 6 });
      else S(c, { o: 0 });
      if (j === cur || j === nxt) tick(c, t, i, j);
    });
  });
}
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
// B1 — новые токены каждую секунду, капитализация растёт рывками, у каждого по-своему
const b1Slots = makeSlots((i) => [0, 1, 2].map((r) => {
  const [k, name, tick] = TOK[(i + r * 3) % TOK.length];
  return `${logo(k, 56)}<div style="flex:1;margin-left:14px;min-width:0"><div style="font:800 19px Nunito;white-space:nowrap">${name}</div><div class="lb" style="font-size:14px">$${tick} · <span class="ago tn"></span></div></div>
    <div style="text-align:right"><span class="chip" style="background:#E6F1FF;color:#1565D8">НОВЫЙ</span><div class="mc tn up" style="font:800 17px Nunito;margin-top:6px"></div></div>`;
}));
// B2 — комиссии в копейках: крошечный минус, который изредка прибавляет цент
const FEEROW = [["mcat", "Покупка MCAT"], ["frog", "Продажа LILY"], ["gold", "Покупка GAXO"], ["pup", "Покупка PUP"], ["fire", "Продажа WICK"], ["neon", "Покупка NEON"], ["boo", "Покупка BOO"], ["violet", "Продажа VIO"], ["mint", "Покупка MINT"]];
const b2Slots = makeSlots((i) => [0, 1, 2].map((r) => {
  const [k, n] = FEEROW[(i + r * 3) % FEEROW.length];
  return `${logo(k, 52)}<div style="flex:1;margin-left:14px"><div style="font:700 17px Onest;white-space:nowrap">${n}</div><div class="lb" style="font-size:13px">сеть · Mintly 0%</div></div>
    <div class="fee tn" style="font:800 20px Nunito;color:#C2464B"></div>`;
}));
// B3 — быстрые сделки: суммы всё время меняются, каждая подтверждена за доли секунды
const b3Slots = makeSlots((i) => [0, 1, 2].map((r) => {
  const [k, , tick] = TOK[(i * 2 + r * 5 + 1) % TOK.length], sell = (i + r) % 3 === 2;
  return `${logo(k, 52)}<div style="flex:1;margin-left:14px;min-width:0"><div style="font:800 18px Nunito;white-space:nowrap">${sell ? "Продал" : "Купил"} <span class="qty tn"></span> ${tick}</div><div class="lb" style="font-size:13px">за <span class="amt tn"></span> GRAM · <span class="spd tn"></span></div></div>
    <div style="width:34px;height:34px;border-radius:50%;background:#E3F8EE;display:flex;align-items:center;justify-content:center;flex:none">${ICO.check("#0FA968", 19)}</div>`;
}));
function tickB1(c, t, i, j) {
  const seed = i * 31 + j * 7 + 1, base = 2000 + rnd(seed, 99) * 9000;
  c.querySelector(".mc").textContent = fmtK(base + walk(seed, t, 5.4, 0.06, 0.32, 20, 520, 0.2));
  c.querySelector(".ago").textContent = ago(Math.floor(Math.max(0, t - 6 - i * 0.2 - j * 0.6) * (0.8 + rnd(seed, 5))));
}
function tickB2(c, t, i, j) {
  const seed = i * 17 + j * 5 + 3, cents = (rnd(seed, 1) < 0.5 ? 1 : 0) + Math.round(walk(seed, t, 8.3, 0.35, 0.9, 1, 1, 0.55));
  c.querySelector(".fee").textContent = "−$0." + String(Math.min(cents, 9)).padStart(2, "0");
}
function tickB3(c, t, i, j) {
  const seed = i * 23 + j * 11 + 5, n = Math.floor((t - 10) / (0.22 + rnd(seed, 3) * 0.2));
  const amt = [0.1, 0.25, 0.5, 0.8, 1, 1.5, 2, 3, 5][Math.floor(rnd(seed, n) * 9)];
  c.querySelector(".amt").textContent = String(amt).replace(".", ",");
  c.querySelector(".qty").textContent = (amt * (180 + rnd(seed, n + 50) * 260) / 1000).toFixed(2).replace(".", ",") + "M";
  c.querySelector(".spd").textContent = (0.3 + rnd(seed, n + 9) * 0.2).toFixed(1).replace(".", ",") + " с";
}

// коллаж «Хочешь просто торговать?»: восемь цельных виджетов на орбите — без
// обрезков баннеров, все одного стиля и целиком в кадре
const ORB = [
  wg(B, 260, 112, `<div class="row" style="justify-content:space-between"><span style="font:800 18px Nunito">SOL</span><span class="chip up" style="background:#E3F8EE">+2.07%</span></div><div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:4px"><span class="num tn" style="font-size:24px">$120.48</span>${spark(SOL.slice(12), 100, 34, "#0FA968")}</div>`),
  wg(B, 320, 92, `<div class="row">${logo("mcat", 56)}<div style="flex:1"><div style="font:800 19px Nunito">Moon Cat</div><div class="lb" style="font-size:14px">$MCAT · 61% до биржи</div></div><span class="up" style="font:800 17px Nunito">+38%</span></div>`),
  wg(B, 270, 120, `<div style="position:absolute;inset:0;border-radius:26px;background:${GRAD}"></div><div style="position:relative;color:#fff"><div style="font:500 14px Onest;opacity:.85">Баланс</div><div style="font:800 32px Nunito" class="tn">$1 284.50</div><div style="font:600 13px Onest;opacity:.9;margin-top:4px">12.4 SOL · 8 420 GRAM</div></div>`),
  wg(B, 236, 92, `<div class="row"><div style="width:50px;height:50px;border-radius:16px;background:linear-gradient(135deg,#0B4FD8,#35D0E8);display:flex;align-items:center;justify-content:center">${ICO.bolt("#fff", 24)}</div><div><div class="lb" style="font-size:14px">Подтверждено за</div><div class="num tn" style="font-size:23px">0.4 с</div></div></div>`),
  wg(B, 320, 88, `<div class="row">${logo("pup", 50)}<div style="flex:1"><div style="font:800 17px Nunito">Купил 2.1M PUP</div><div class="lb" style="font-size:13px">за 3 GRAM · комиссия 0%</div></div>${ICO.check()}</div>`),
  wg(B, 230, 112, `<div class="lb">Комиссия платформы</div><div style="font:800 50px/1.05 Nunito;letter-spacing:-.03em" class="accent">0%</div>`),
  wg(B, 290, 112, `<div class="row"><div style="width:76px;height:76px;border-radius:20px;background:#0B0A12;display:flex;align-items:center;justify-content:center"><img src="assets/app/gold-preview.webp" style="width:64px;image-rendering:pixelated"/></div><div><div style="font:800 18px Nunito">Золотой скин</div><div class="lb" style="font-size:13px">магазин Минти</div><span class="chip" style="background:#FFF4D6;color:#A86A00;margin-top:6px">300 монет</span></div></div>`),
  wg(B, 260, 112, `<div class="row" style="justify-content:space-between"><span style="font:800 18px Nunito">GRAM</span><span class="chip dn" style="background:#FDECEC">−4.52%</span></div><div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:4px"><span class="num tn" style="font-size:24px">$1.54</span>${spark(TON.slice(12), 100, 34, "#E5484D")}</div>`),
];

// ============ C · SIMPLE + ЛОГОТИП 15–19.7 ============
const C = scene(15, 19.75);
// «Просто.» как в референсе: буквы группами между линиями сетки, у каждой
// группы свои края и свои зазоры; сетка едет за буквами, пока слово собирается
const C_GROUPS = ["П", "ро", "ст", "о."], C_GAPS = [96, 170, 70], C_TOP = 386, C_SIZE = 230;
// линии по высоте капители и базовой линии Nunito при line-height 1
const C_CAP = C_TOP + 0.124 * C_SIZE, C_BASE = C_TOP + 0.829 * C_SIZE;
const cGroups = C_GROUPS.map((g) => { const e = $(`<div class="abs" style="left:0;top:${C_TOP}px;font:800 ${C_SIZE}px/1 'Nunito';letter-spacing:-0.03em;color:#0B1E46;white-space:nowrap">${g}</div>`); C.appendChild(e); return e; });
const cH = [C_CAP, C_BASE].map((y) => { const g = $(`<div class="guide" style="background:rgba(30,110,220,.32);left:0;top:${y}px;width:1920px;height:1px;transform-origin:50% 50%"></div>`); C.appendChild(g); return g; });
// у каждой группы два края; у части краёв — вторая линия рядом, как в референсе
const cV = [];
C_GROUPS.forEach((_, gi) => [0, 1].forEach((side) => {
  const offs = (gi + side) % 2 ? [0, side ? 12 : -12] : [0];
  offs.forEach((off) => { const g = $(`<div class="guide" style="background:rgba(30,110,220,.32);left:0;top:0;width:1px;height:1080px;transform-origin:50% ${((C_CAP + C_BASE) / 2 / 10.8).toFixed(1)}%"></div>`); g.gi = gi; g.side = side; g.off = off; C.appendChild(g); cV.push(g); });
}));
const cDots = [];
C_GROUPS.forEach((_, gi) => [0, 1].forEach((side) => [C_CAP, C_BASE].forEach((y) => { const d = $(`<div class="abs" style="left:0;top:0;width:7px;height:7px;background:#0B1E46"></div>`); d.gi = gi; d.side = side; d.y = y; C.appendChild(d); cDots.push(d); })));
const LOGO = `<svg viewBox="0 0 64 64" width="100%" height="100%"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B4FD8"/><stop offset=".6" stop-color="#1E8BFF"/><stop offset="1" stop-color="#35D0E8"/></linearGradient></defs>
  <path d="M12 56 V28 L32 45 L52 28 V56" fill="none" stroke="url(#lg)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  <g transform="translate(52,26) rotate(34)"><path d="M0 0 C -8 -7 -8 -19 0 -26 C 8 -19 8 -7 0 0 Z" fill="#3FD9A0"/></g></svg>`;
const cRing = $(`<svg class="abs" style="left:900px;top:480px;width:120px;height:120px;overflow:visible" viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" fill="none" stroke="url(#rg)" stroke-width="14" stroke-linecap="round" stroke-dasharray="302" stroke-dashoffset="302" transform="rotate(-90 60 60)"/>
  <defs><linearGradient id="rg"><stop offset="0" stop-color="#0B5ED7"/><stop offset="1" stop-color="#35D0E8"/></linearGradient></defs></svg>`); C.appendChild(cRing);
const cLogo = $(`<div class="abs" style="left:880px;top:450px;width:160px;height:160px">${LOGO}</div>`); C.appendChild(cLogo);
const cName = $(`<div class="abs" style="left:1060px;top:452px;font:800 150px/1 'Nunito';letter-spacing:-0.04em;color:#0B1E46;clip-path:inset(0 100% 0 0)">Mintly</div>`); C.appendChild(cName);

// ============ D · ВОЗМОЖНОСТИ 19.5–37.1 ============
const D = scene(19.5, 37.15);
// D1 — запуск: настоящий экран создания токена, по буквам
const CREATE = Array.from({ length: 20 }, (_, i) => "create-" + String(i).padStart(2, "0"));
const d1Scr = screen(frames(CREATE) + toast("Moon Cat запущен", "MCAT · в сети за 1.2 с") + `<div class="tap"></div>`);
const d1Wrap = $(`<div class="abs" style="inset:0"></div>`); D.appendChild(d1Wrap);
const d1Phone = new Phone3D(d1Wrap, d1Scr);
const d1T1 = line(D, "Запусти *мемкоин*", { top: 372, size: 92, weight: 600 }); d1T1.style.left = "1010px"; d1T1.style.textAlign = "left";
const d1T2 = line(D, "за секунды.", { top: 490, size: 92, weight: 600, color: "#5B7398" }); d1T2.style.left = "1010px"; d1T2.style.textAlign = "left";
const d1Card = wg(D, 440, 150, `<div class="row">${logo("mcat", 62)}<div style="flex:1"><div style="font:800 22px Nunito">Moon Cat запущен</div><div class="lb" style="font-size:14px">$MCAT · в сети за 1.2 с</div></div><span class="chip up" style="background:#E3F8EE">В СЕТИ</span></div>
  <div style="display:flex;justify-content:space-between;margin-top:16px" class="lb"><span style="font-size:13px">Кривая бондинга</span><span class="tn d1pct" style="font:800 14px Nunito;color:#0B1E46">0%</span></div>
  <div style="height:8px;border-radius:4px;background:#E8EEF7;margin-top:7px;overflow:hidden"><div class="d1bar" style="height:100%;width:0;border-radius:4px;background:linear-gradient(90deg,#0B4FD8,#1E8BFF,#35D0E8)"></div></div>`);
// D2 — торговля: страница токена, лист покупки, нажатие
const d2Scr = screen(frames(["token", "buy", "buy5"]) + toast("Куплено 1 733 708 MCAT", "за 5 GRAM · комиссия платформы 0%") + `<div class="tap"></div>`);
const d2Wrap = $(`<div class="abs" style="inset:0"></div>`); D.appendChild(d2Wrap);
const d2Phone = new Phone3D(d2Wrap, d2Scr);
const d2T1 = line(D, "Торгуй с", { top: 236, size: 92, weight: 600 }); d2T1.style.left = "250px"; d2T1.style.textAlign = "left";
const d2Zero = $(`<div class="abs accent" style="left:240px;top:330px;font:800 290px/1 'Nunito';letter-spacing:-0.05em;padding-right:20px">0%</div>`); D.appendChild(d2Zero);
const d2T2 = line(D, "комиссией.", { top: 616, size: 92, weight: 600, color: "#5B7398" }); d2T2.style.left = "250px"; d2T2.style.textAlign = "left";
const d2Card = wg(D, 470, 150, `<div class="lb" style="font-size:14px;display:flex;justify-content:space-between"><span>Чек · MCAT</span><span>только что</span></div>
  ${[["Ты заплатил", "5 GRAM"], ["Комиссия платформы", "0.00 GRAM"]].map(([a, b], i) => `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:${i ? 8 : 12}px;font:600 17px Onest"><span style="color:#5B7398">${a}</span><span style="font:800 19px Nunito;${i ? "color:#0FA968" : ""}" class="tn">${b}${i ? ` <span style="vertical-align:-3px">${ICO.check("#0FA968", 17)}</span>` : ""}</span></div>`).join("")}`);
// D3 — скорость
const d3 = $(`<div class="c" style="top:340px;font:700 108px/1.08 'Nunito';letter-spacing:-0.035em;color:#0B1E46"><div id="d3a" style="display:inline-block">Самые быстрые транзакции</div><br/><div id="d3b" style="display:inline-block" class="accent">в мире.</div></div>`); D.appendChild(d3);
const d3Trails = [0, 1, 2].map(() => { const tr = $(`<div class="c" style="top:340px;font:700 108px/1.08 'Nunito';letter-spacing:-0.035em;color:#8CC4FF;opacity:0">Самые быстрые транзакции</div>`); D.appendChild(tr); return tr; });
const d3Lines = Array.from({ length: 7 }, (_, i) => { const l = $(`<div class="abs" style="left:0;top:${300 + i * 46}px;width:${260 + (i % 3) * 140}px;height:3px;border-radius:2px;background:linear-gradient(90deg,rgba(30,139,255,0),rgba(30,139,255,.55),rgba(53,208,232,0))"></div>`); D.appendChild(l); return l; });
const d3Card = wg(D, 520, 104, `<div class="row"><div style="width:62px;height:62px;border-radius:19px;background:linear-gradient(135deg,#0B4FD8,#35D0E8);display:flex;align-items:center;justify-content:center;flex:none">${ICO.bolt("#fff", 30)}</div>
  <div style="flex:1"><div style="font:800 21px Nunito" class="d3st">Отправка…</div><div class="lb" style="font-size:14px">Покупка $MCAT на 5 GRAM</div></div>
  <div class="row" style="gap:10px"><div class="d3ok" style="opacity:0;width:34px;height:34px;border-radius:50%;background:#E3F8EE;display:flex;align-items:center;justify-content:center">${ICO.check("#0FA968", 20)}</div><div class="num tn d3tm" style="font-size:30px;min-width:96px;text-align:right">0.00 с</div></div></div>`, "0 24px");
d3Card.style.display = "flex"; d3Card.style.alignItems = "center";
// D4 — кошелёк
const d4Wrap = $(`<div class="abs" style="left:380px;top:330px;width:620px;height:390px;perspective:1800px"></div>`); D.appendChild(d4Wrap);
const d4Card = $(`<div style="position:relative;width:100%;height:100%;transform-style:preserve-3d"></div>`); d4Wrap.appendChild(d4Card);
for (let i = 0; i < 10; i++) d4Card.appendChild($(`<div style="position:absolute;inset:0;border-radius:40px;background:linear-gradient(rgba(0,0,0,.3),rgba(0,0,0,.3)),${GRAD};transform:translateZ(${(-5 + i).toFixed(1)}px)"></div>`));
d4Card.appendChild($(`<div style="position:absolute;inset:0;border-radius:40px;background:${GRAD};transform:translateZ(5.5px);padding:34px 40px;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 40px 80px rgba(60,20,160,.25)">
  <div style="font:600 30px 'Onest';opacity:.9">Баланс</div><div style="font:800 96px/1.1 'Nunito';letter-spacing:-0.03em" class="tn d4bal">$1 284.50</div>
  <div style="position:absolute;left:40px;bottom:34px;display:inline-flex;padding:12px 22px;border-radius:999px;background:rgba(255,255,255,.18);font:700 24px 'Onest'">12.4 SOL · 8 420 GRAM</div></div>`));
const d4Mintie = $(`<div class="abs" style="left:430px;top:-118px;width:140px;height:153px;background:url(assets/app/nav-breath.webp) 0 0/1200% 100% no-repeat;image-rendering:pixelated;transform:translateZ(6px)"></div>`); d4Card.appendChild(d4Mintie);
const d4T1 = line(D, "Твой кошелёк.", { top: 410, size: 96, weight: 600 }); d4T1.style.left = "1130px"; d4T1.style.textAlign = "left";
const d4T2 = line(D, "Прямо в *Telegram.*", { top: 530, size: 64, weight: 500, color: "#5B7398" }); d4T2.style.left = "1134px"; d4T2.style.textAlign = "left";
// D5 — печать
const d5 = $(`<div class="c" style="top:450px;font:600 120px/1 'Onest';letter-spacing:-0.035em;color:#0B1E46"><span id="d5t"></span><span id="d5c" style="display:inline-block;width:6px;height:110px;background:#1E8BFF;margin-left:6px;vertical-align:-12px"></span></div>`); D.appendChild(d5);

// ============ E · ФИНАЛ 37–45 ============
const Esc = scene(37, 45, "radial-gradient(120% 90% at 50% 18%,#3FA9FF 0%,#1565C0 38%,#0A2A5E 78%,#061A3D 100%)");
const eRays = [-28, -14, -3, 9, 20, 33].map((a, i) => { const r = $(`<div class="abs" style="left:${700 + i * 90}px;top:-200px;width:${120 + (i % 3) * 60}px;height:1500px;transform-origin:50% 0;background:linear-gradient(180deg,rgba(210,240,255,.42),rgba(210,240,255,0) 75%);filter:blur(28px);mix-blend-mode:screen"></div>`); r.a = a; Esc.appendChild(r); return r; });
// фон финала — стена мелких стеклянных пузырей, по которой идёт 3D-волна
const eBubbles = [];
for (let r = 0; r < 30; r++) for (let c = 0; c < 52; c++) {
  const sd = r * 52 + c, sz = 6 + rnd(sd, 1) * 9;
  const b = $(`<div class="abs" style="left:0;top:0;width:${sz.toFixed(1)}px;height:${sz.toFixed(1)}px;border-radius:50%;border:1px solid rgba(225,246,255,.7);background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.95) 0 14%,rgba(255,255,255,.18) 34%,rgba(160,215,255,.10) 62%,rgba(225,246,255,.45) 100%);box-shadow:0 0 6px rgba(170,225,255,.25)"></div>`);
  b.bx = -300 + c * 49 + (rnd(sd, 2) - 0.5) * 30 + (r % 2) * 24; b.by = r * 50 + (rnd(sd, 3) - 0.5) * 28; b.sz = sz;
  Esc.appendChild(b); eBubbles.push(b);
}
// логотип и имя одной строкой по общей оси — раньше имя сидело ниже знака
const eLock = $(`<div class="abs" style="left:0;right:0;top:300px;height:180px;display:flex;justify-content:center;align-items:center;gap:26px"></div>`); Esc.appendChild(eLock);
const eLogoBox = $(`<div style="position:relative;width:170px;height:170px;flex:none"></div>`); eLock.appendChild(eLogoBox);
const eRing = $(`<svg class="abs" style="left:5px;top:5px;width:160px;height:160px;overflow:visible" viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-dasharray="302" stroke-dashoffset="302" transform="rotate(-90 60 60)"/></svg>`); eLogoBox.appendChild(eRing);
const eLogo = $(`<div class="abs" style="inset:0;filter:drop-shadow(0 8px 24px rgba(0,40,110,.28))">${LOGO.replace('fill="#3FD9A0"', 'fill="#ffffff"').replace(/url\(#lg\)/, "#ffffff")}</div>`); eLogoBox.appendChild(eLogo);
const eName = $(`<div style="font:800 160px/1 'Nunito';letter-spacing:-0.04em;color:#fff;margin-top:-14px;clip-path:inset(0 100% 0 0)">Mintly</div>`); eLock.appendChild(eName);
const ePill = $(`<div class="abs" style="left:50%;top:600px;transform:translateX(-50%);display:flex;align-items:center;gap:18px;padding:22px 38px 22px 26px;border-radius:999px;background:rgba(255,255,255,.9);box-shadow:0 20px 60px rgba(0,20,60,.35);white-space:nowrap">
  <div style="width:62px;height:62px;border-radius:50%;background:#2AABEE;display:flex;align-items:center;justify-content:center">${ICO.tg()}</div>
  <div><div style="font:500 26px 'Onest';color:#4A6488">Открыть в Telegram</div><div style="font:800 40px 'Nunito';color:#0B1E46">@MintlyTrading_bot</div></div></div>`); Esc.appendChild(ePill);
const eTag = line(Esc, "Запускай. Торгуй. *Взлетай.*", { top: 820, size: 46, weight: 600, color: "#ffffff" });
// на синем финале акцент светлее — иначе «Взлетай.» тонет в фоне
eTag.spans.forEach((w) => { if (w.classList.contains("accent")) w.style.backgroundImage = "linear-gradient(95deg,#8FF3E6,#E6FDFF)"; });

const fade = document.getElementById("fade");
const q1 = (el, s) => el.querySelector(s);

window.renderAt = (t) => {
  // display, а не visibility: дети с visibility:visible просвечивали бы сквозь скрытую сцену
  scenes.forEach(({ el, a, b }) => { el.style.display = t >= a && t < b ? "block" : "none"; el.style.visibility = "visible"; });
  BG.style.display = t < 37.8 ? "block" : "none";
  bgBlobs.forEach((b, i) => { b.style.transform = `translate(${Math.sin(t * 0.45 + i * 2) * 60}px,${Math.cos(t * 0.38 + i) * 40}px)`; });
  bgFog.parts.forEach((p, i) => { p.style.transform = `translate(${Math.sin(t * 0.5 + i) * 40}px,${Math.cos(t * 0.4 + i * 1.7) * 18}px)`; });

  // ---- A ----
  if (t < 5.7) {
    sceneFx(A, t, -1, 5.7, 0.5, 0.75);
    aLetters.forEach((l, i) => { const k = prog(t, 0.5 + i * 0.07, 1.4 + i * 0.07); S(l, { o: E.out(k), y: (1 - E.soft(k)) * 90, s: 0.86 + 0.14 * E.soft(k), b: (1 - E.out(k)) * 16 }); });
    const pk = E.out(prog(t, 0.15, 2.4));
    aPhone.pose({ x: 960, y: lerp(1500, 810, pk) + Math.sin(t * 0.9) * 6, s: 1.02, rx: lerp(30, 12, pk), ry: lerp(-18, -5, pk) + Math.sin(t * 0.6) * 3, rz: lerp(-4, -1, pk) });
    aW.forEach((w, i) => {
      const [x, y, d, r] = aPos[i], k = E.outQ(prog(t, d, d + 0.9)), f = Math.sin(t * 1.1 + i * 1.9);
      at(w, x, y, { o: k, y: (1 - k) * 40 + f * 8, s: 0.9 + 0.1 * k, b: (1 - k) * 12, r: r + f * 0.8 });
    });
  }
  // ---- B ----
  if (t >= 5.2 && t < 15.15) {
    sceneFx(B, t, 5.2, 15.15, 0.5, 0.55);
    words(b1, t, 5.5, { out: 7.85 });
    runSlots(b1Slots, t, 5.55, 7.8, 0.95, tickB1);
    words(b2, t, 8.4, { out: 10.15 });
    runSlots(b2Slots, t, 8.45, 10.1, 0.85, tickB2);
    words(b3, t, 10.5, { out: 12.05 });
    runSlots(b3Slots, t, 10.55, 12.0, 0.9, tickB3);
    words(b4, t, 12.3, { out: 13.6, stag: 0.06 });
    words(b5, t, 13.8, { out: 14.75, stag: 0.1 });
    const ok = E.out(prog(t, 12.15, 13.4)), oq = E.io(prog(t, 14.45, 15.1));
    ORB.forEach((c, i) => {
      const a = (i / ORB.length) * Math.PI * 2 + t * 0.26 + 0.4;
      const R = lerp(1.6, 1, ok) * (1 + oq * 0.35), x = 960 + Math.cos(a) * 700 * R, y = 545 + Math.sin(a) * 300 * R, dz = (Math.sin(a) + 1) / 2;
      c.style.zIndex = Math.round(dz * 10);
      at(c, x, y, { o: clamp(ok * 1.4) * (1 - oq), s: (0.84 + dz * 0.18), r: Math.cos(a) * 3, b: oq * 10 });
    });
  }
  // ---- C ----
  if (t >= 15 && t < 19.75) {
    sceneFx(C, t, 15, 19.75, 0.45, 0.6);
    const sp = E.io(prog(t, 15.3, 16.5)), inK = E.outQ(prog(t, 15.0, 15.6)), coll = E.io(prog(t, 16.7, 17.3));
    if (!cGroups.w || !cGroups.w[0]) cGroups.w = cGroups.map((e) => e.offsetWidth);
    const ws = cGroups.w, tot = ws.reduce((a, b) => a + b, 0);
    // зазоры дышат, пока слово разобрано, и схлопываются при сборке
    const join = E.io(prog(t, 16.3, 16.95)), mb = Math.sin(prog(t, 16.3, 16.95) * Math.PI) * 5;
    const gaps = C_GAPS.map((g, gi) => g * (1 + 0.16 * Math.sin(t * 1.4 + gi * 2.1)) * (1 - join));
    const out = E.io(prog(t, 16.95, 17.35));
    let x = 960 - (tot + gaps.reduce((a, b) => a + b, 0)) / 2;
    const xs = ws.map((w, gi) => { const at0 = x; x += w + (gaps[gi] || 0); return at0; });
    cGroups.forEach((e, gi) => {
      const k = E.outQ(prog(t, 15.05 + gi * 0.07, 15.8 + gi * 0.07));
      // в конце слово сжимается к центру и тает — на его месте рисуется кольцо
      const cx = 960 + (xs[gi] + ws[gi] / 2 - 960) * (1 - out * 0.6) - ws[gi] / 2;
      S(e, { o: k * (1 - out), x: cx, y: (1 - k) * 36, s: 1 - out * 0.35, b: (1 - k) * 12 + mb + out * 12 });
    });
    const gl = (1 - E.io(prog(t, 16.95, 17.3)));
    cH.forEach((g, hi) => { const k = E.out(prog(t, 15.0 + hi * 0.1, 15.9 + hi * 0.1)); g.style.opacity = gl; g.style.transform = `scaleX(${k.toFixed(4)})`; });
    cV.forEach((g, vi) => {
      const k = E.out(prog(t, 15.05 + vi * 0.035, 15.85 + vi * 0.035));
      const lx = xs[g.gi] + (g.side ? ws[g.gi] : 0) + g.off;
      g.style.opacity = gl; g.style.transform = `translateX(${lx.toFixed(2)}px) scaleY(${k.toFixed(4)})`;
    });
    cDots.forEach((d, di) => {
      const k = E.outQ(prog(t, 15.5 + di * 0.02, 15.9 + di * 0.02));
      const lx = xs[d.gi] + (d.side ? ws[d.gi] : 0);
      S(d, { o: k * gl, x: lx - 3, y: d.y - 3, s: k });
    });
    const ring = prog(t, 17.05, 17.95); cRing.firstElementChild.setAttribute("stroke-dashoffset", (302 * (1 - E.io(ring))).toFixed(1));
    const rOut = E.io(prog(t, 17.9, 18.35)); S(cRing, { o: (ring > 0 ? 1 : 0) * (1 - rOut), s: 1 + rOut * 0.3 });
    const lk = E.soft(prog(t, 17.95, 18.65)); S(cLogo, { o: clamp(prog(t, 17.95, 18.3)), s: lk, r: (1 - lk) * -20, x: -140 * E.io(prog(t, 18.6, 19.25)) });
    const nk = E.io(prog(t, 18.65, 19.35)); cName.style.clipPath = `inset(0 ${(100 - nk * 100).toFixed(1)}% 0 0)`; S(cName, { x: -140 * nk + (1 - nk) * -40 });
  }
  // ---- D ----
  if (t >= 19.5 && t < 37.15) {
    sceneFx(D, t, 19.5, 37.15, 0.4, 0.6);
    // D1 19.6–24.4 — телефон заезжает снизу, экран печатает по-настоящему
    { const p1 = E.out(prog(t, 19.55, 21.0)), o1 = E.io(prog(t, 23.7, 24.45));
      d1Phone.pose({ x: lerp(640, 470, o1), y: lerp(1450, 560, p1) + Math.sin(t * 0.9) * 6 + o1 * 120, s: 0.92, rx: lerp(18, 4, p1), ry: lerp(30, 17, p1) + Math.sin(t * 0.55) * 2.5 + o1 * 14, rz: lerp(4, 1, p1), o: 1 - o1 });
      d1Wrap.style.filter = o1 > 0.01 ? `blur(${(o1 * 12).toFixed(1)}px)` : "none";
      // кадры набора сменяются через короткое растворение, а прокрутка к кнопке —
      // настоящим сдвигом снимка: раньше кадры прыгали без перехода
      const sc = E.io(prog(t, 22.35, 22.8));
      if (t < 22.35) {
        let fi = 0, ft = 0, fd = 0.25;
        if (t >= 20.75) { fi = 1; ft = 20.75; }
        if (t >= 21.05) { const n = Math.min(7, Math.floor((t - 21.05) / 0.1)); fi = 2 + n; ft = 21.05 + n * 0.1; fd = 0.06; }
        if (t >= 21.95) { const n = Math.min(3, Math.floor((t - 21.95) / 0.11)); fi = 10 + n; ft = 21.95 + n * 0.11; fd = 0.06; }
        blendFrame(d1Scr, fi, prog(t, ft, ft + fd));
      } else {
        const im = d1Scr.querySelectorAll("img.f");
        im.forEach((x, j) => { x.style.opacity = j === 13 || j === 19 ? 1 : 0; x.style.transform = "none"; x.style.zIndex = j === 13 ? 2 : 1; });
        im[13].style.transform = `translateY(${(-128 * sc).toFixed(2)}px)`; im[19].style.transform = `translateY(${(128 * (1 - sc)).toFixed(2)}px)`;
      }
      const tp = q1(d1Scr, ".tap"); tp.style.left = "196px"; tp.style.top = "671px"; tap(tp, t, 22.85);
      const ts = q1(d1Scr, ".toastA"), tk = E.outQ(prog(t, 23.1, 23.5)); ts.style.opacity = tk; ts.style.transform = `translateY(${(1 - tk) * -24}px)`;
      words(d1T1, t, 20.1, { out: 23.75 }); words(d1T2, t, 20.4, { out: 23.8 });
      const ck = E.outQ(prog(t, 23.15, 23.9)), cq = E.io(prog(t, 23.85, 24.45));
      at(d1Card, 1230, 760, { o: ck * (1 - cq), y: (1 - ck) * 50, s: 0.92 + 0.08 * ck, b: (1 - ck) * 12 + cq * 12 });
      const pc = Math.round(61 * E.out(prog(t, 23.35, 24.2))); q1(d1Card, ".d1pct").textContent = pc + "%"; q1(d1Card, ".d1bar").style.width = pc + "%"; }
    // D2 24.2–28.7 — график, лист покупки, нажатие, тост
    { const p2 = E.out(prog(t, 24.15, 25.5)), o2 = E.io(prog(t, 28.0, 28.7));
      d2Phone.pose({ x: lerp(1330, 1480, o2), y: lerp(1450, 560, p2) + Math.sin(t * 0.9 + 1) * 6 + o2 * 120, s: 0.92, rx: lerp(18, 4, p2), ry: lerp(-30, -17, p2) + Math.sin(t * 0.55 + 1) * 2.5 - o2 * 14, rz: lerp(-4, -1, p2), o: (t > 24.1 ? 1 : 0) * (1 - o2) });
      d2Wrap.style.filter = o2 > 0.01 ? `blur(${(o2 * 12).toFixed(1)}px)` : "none";
      const imgs = d2Scr.querySelectorAll("img.f");
      const sheet = E.out(prog(t, 25.9, 26.35)), back = E.io(prog(t, 27.65, 28.05));
      imgs[0].style.opacity = 1;
      // сумма «5» появляется растворением, а не скачком
      const five = E.sine(prog(t, 26.66, 26.84));
      imgs[1].style.opacity = t < 26.84 ? sheet : 0; imgs[2].style.opacity = five * (1 - back);
      [imgs[1], imgs[2]].forEach((im) => { const k = im === imgs[1] ? sheet : 1 - back; im.style.clipPath = `inset(${((1 - k) * 60).toFixed(1)}% 0 0 0)`; im.style.transform = `translateY(${(1 - k) * 60}px)`; });
      const tp = q1(d2Scr, ".tap"); if (t < 26.9) { tp.style.left = "153px"; tp.style.top = "462px"; tap(tp, t, 26.5); } else { tp.style.left = "196px"; tp.style.top = "742px"; tap(tp, t, 27.0); }
      const ts = q1(d2Scr, ".toastA"), tk = E.outQ(prog(t, 27.25, 27.65)) * (1 - E.io(prog(t, 28.1, 28.5))); ts.style.opacity = tk; ts.style.transform = `translateY(${(1 - tk) * -24}px)`;
      words(d2T1, t, 24.55, { out: 28.0 }); words(d2T2, t, 25.35, { out: 28.05 });
      const zk = E.outQ(prog(t, 24.9, 25.8)), zq = E.io(prog(t, 28.0, 28.6));
      S(d2Zero, { o: zk * (1 - zq), y: (1 - zk) * 40, s: 0.94 + 0.06 * zk + zq * 0.05, b: (1 - zk) * 16 + zq * 14 });
      d2Zero.style.backgroundPosition = `${(t * 30) % 200}% 0`;
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
      const done = t >= 30.65; q1(d3Card, ".d3st").textContent = done ? "Подтверждено" : "Отправка…"; q1(d3Card, ".d3st").style.color = done ? "#0FA968" : "#0B1E46";
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
      if (cur) { const n = Math.floor(clamp((t - cur[1]) * 20, 0, cur[0].length)); el.textContent = cur[0].slice(0, n); el.className = cur[0] === "Взлетай" ? "accent" : ""; }
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
    const ring = prog(t, 37.6, 38.5); eRing.firstElementChild.setAttribute("stroke-dashoffset", (302 * (1 - E.io(ring))).toFixed(1));
    const rOut = E.io(prog(t, 38.4, 38.85)); S(eRing, { o: (ring > 0 ? 1 : 0) * (1 - rOut), s: 1 + rOut * 0.3 });
    const lk = E.soft(prog(t, 38.5, 39.2)); S(eLogo, { o: clamp(prog(t, 38.5, 38.8)), s: lk });
    const nk = E.io(prog(t, 39.0, 39.7)); eName.style.clipPath = `inset(0 ${(100 - nk * 100).toFixed(1)}% 0 0)`;
    // пока имени нет, знак стоит по центру кадра и уезжает влево вместе с проявлением
    eLogoBox.style.transform = `translateX(${((1 - nk) * (eName.offsetWidth + 26) / 2).toFixed(1)}px)`;
    const pk = E.outQ(prog(t, 39.9, 40.7)); ePill.style.opacity = pk; ePill.style.transform = `translateX(-50%) translateY(${(1 - pk) * 36}px) scale(${0.94 + 0.06 * pk})`; ePill.style.filter = pk < 1 ? `blur(${((1 - pk) * 10).toFixed(1)}px)` : "none";
    words(eTag, t, 40.8, { stag: 0.14 });
  }
  fade.style.opacity = Math.max(E.sine(prog(t, 44.0, 45)), 1 - prog(t, 0, 0.4));
};

document.fonts.ready.then(() => Promise.all([...document.images].map((i) => (i.complete ? 1 : new Promise((r) => { i.onload = i.onerror = r; }))))).then(() => { window.renderAt(0); window.ready = true; });
