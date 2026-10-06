// Mintly · история Эдисона. Горизонтальный ролик 16:9, 62 с.
// Сюжет: первые большие деньги Эдисону принесла не лампочка → 1869, Нью-Йорк,
// телеграфист без гроша → на Золотой бирже ломается аппарат с ценами, он чинит →
// делает свой тикер лучше всех → $40 000 вместо ожидаемых $5 000 → коронная фраза
// «Гений — это 1% вдохновения и 99% пота» → Mintly делает так же: 1% — твоя
// идея, 99% берём на себя → живые цены, как тикер, только в Telegram →
// всё остальное готово → «Хватит ждать — начни сегодня» → логотип.
// История — гравюры из газет 1869–1878 (public domain) на газетной бумаге;
// сегодняшняя часть — тёмный фон с перспективной сеткой и лучами света.
// Кадр зависит только от t — renderAt(t) можно звать в любом порядке.
"use strict";
const DUR = 62;
const root = document.getElementById("root");
const $ = (h) => { const d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstElementChild; };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const E = {
  out: (k) => 1 - Math.pow(1 - k, 3),
  outQ: (k) => 1 - Math.pow(1 - k, 5),
  io: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  inQ: (k) => k * k * k,
  soft: (k) => { const c = 0.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
};
function S(el, { o = 1, x = 0, y = 0, s = 1, r = 0, b = 0 } = {}) {
  el.style.opacity = o;
  el.style.visibility = o > 0.002 ? "visible" : "hidden";
  el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${r.toFixed(3)}deg) scale(${s.toFixed(4)})`;
  el.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none";
}
// окно сцены: вне [a, b] — display:none (visibility детей не просвечивает)
const scenes = [];
function scene(parent, a, b, draw) { const el = $(`<div class="scene" style="visibility:visible;display:none"></div>`); parent.appendChild(el); scenes.push({ el, a, b, draw }); return el; }

// ---- кинетическая строка: слова по одному, *слово* — акцентом ----
const gradSpans = [];
function mkLine(parent, text, { left = null, top, size, weight = 600, color = "#FFFFFF", font = "Onest", ls = "-0.02em", paper = false }) {
  const pos = left == null ? "left:0;right:0;text-align:center" : `left:${left}px`;
  const el = $(`<div class="abs" style="${pos};top:${top}px;font:${weight} ${size}px/1.15 '${font}';letter-spacing:${ls};color:${color};white-space:nowrap"></div>`);
  const g = !paper && /^#fff(fff)?$/i.test(color);
  const spans = text.split(" ").map((w) => {
    const acc = w.includes("*"), cls = acc ? (paper ? " bi" : " accent") : g ? " grad" : "";
    const s = $(`<span class="w${cls}">${w.replace(/\*/g, "")}</span>`);
    if (cls === " grad" || cls === " accent") { s.line = el; gradSpans.push(s); }
    return s;
  });
  spans.forEach((s, i) => { el.appendChild(s); if (i < spans.length - 1) el.appendChild(document.createTextNode(" ")); });
  parent.appendChild(el); el.spans = spans; return el;
}
// слова проявляются мягко и не спеша: успеваешь прочитать, нет рывка в начале
function words(l, t, a, { stag = 0.11, dur = 1.1, out = null, outDur = 0.6, rise = 22 } = {}) {
  l.spans.forEach((w, i) => {
    const k = E.out(prog(t, a + i * stag, a + i * stag + dur));
    let o = k, y = (1 - k) * rise, b = (1 - k) * 7, s = 1;
    if (out != null) { const q = E.io(prog(t, out + i * 0.03, out + i * 0.03 + outDur)); o *= 1 - q; b += q * 9; y -= q * 12; s = 1 + q * 0.03; }
    S(w, { o, y, b, s });
  });
}
function block(parent, lines, opt) { return lines.map((tx, i) => mkLine(parent, tx, { ...opt, top: opt.top + i * Math.round(opt.size * 1.2) })); }
function blockAt(ls, t, a, { out = null, gap = 0.3 } = {}) { ls.forEach((l, i) => words(l, t, a + i * gap, { out })); }

// плашка-подпись: проявляется слева направо
function mkTag(parent, text, { left = null, top }) {
  const wrap = $(`<div class="abs" style="${left == null ? "left:0;right:0;text-align:center" : `left:${left}px`};top:${top}px"></div>`);
  const tg = $(`<div class="tag">${text}</div>`); wrap.appendChild(tg); parent.appendChild(wrap); return tg;
}
function tagAt(tg, t, a, out = null) {
  const k = E.io(prog(t, a, a + 0.7)), q = out == null ? 0 : E.io(prog(t, out, out + 0.5));
  tg.style.clipPath = `inset(-4px ${((1 - k) * 100).toFixed(2)}% -4px 0)`;
  tg.style.opacity = 1 - q;
}

// ================= ФОН СЕГОДНЯШНЕЙ ЧАСТИ: сетка и лучи =================
// перспективный пол-сетка уходит к горизонту и медленно едет на зрителя,
// сверху падают мягкие лучи; всё на градиентах, без blur — быстро в рендере
const BG = $(`<div class="layer" style="background:radial-gradient(120% 80% at 50% 0%,#0A1430 0%,#050913 55%,#02040A 100%)"></div>`); root.appendChild(BG);
const rays = $(`<div class="abs" style="left:-560px;top:-900px;width:3040px;height:2200px;transform-origin:1520px 400px;
  background:repeating-conic-gradient(from 168deg at 1520px 400px,rgba(110,160,255,0) 0deg,rgba(110,160,255,.075) 2.2deg,rgba(110,160,255,0) 4.6deg,rgba(110,160,255,0) 9deg);
  -webkit-mask-image:radial-gradient(60% 62% at 50% 18%,#000 0%,rgba(0,0,0,.55) 42%,transparent 75%);mask-image:radial-gradient(60% 62% at 50% 18%,#000 0%,rgba(0,0,0,.55) 42%,transparent 75%)"></div>`);
const rays2 = rays.cloneNode(); rays2.style.background = "repeating-conic-gradient(from 171deg at 1520px 400px,rgba(150,190,255,0) 0deg,rgba(150,190,255,.05) 1.4deg,rgba(150,190,255,0) 3deg,rgba(150,190,255,0) 13deg)";
const glowTop = $(`<div class="abs" style="left:360px;top:-380px;width:1200px;height:760px;border-radius:50%;background:radial-gradient(closest-side,rgba(90,140,255,.32),rgba(90,140,255,0))"></div>`);
const floorWrap = $(`<div class="abs" style="left:0;top:560px;width:1920px;height:520px;overflow:hidden;perspective:620px;perspective-origin:50% 0%;
  -webkit-mask-image:linear-gradient(to bottom,transparent 0%,#000 38%,#000 100%);mask-image:linear-gradient(to bottom,transparent 0%,#000 38%,#000 100%)"></div>`);
const floor = $(`<div class="abs" style="left:-1600px;top:0;width:5120px;height:2600px;transform-origin:50% 0%;transform:rotateX(76deg);
  background-image:linear-gradient(rgba(90,140,255,.55) 2px,transparent 2px),linear-gradient(90deg,rgba(90,140,255,.55) 2px,transparent 2px);background-size:160px 160px"></div>`);
floorWrap.appendChild(floor);
const horizon = $(`<div class="abs" style="left:0;top:520px;width:1920px;height:90px;background:radial-gradient(50% 50% at 50% 50%,rgba(110,160,255,.38),rgba(110,160,255,0))"></div>`);
BG.append(rays, rays2, glowTop, floorWrap, horizon);
const MOD = $(`<div class="layer"></div>`); root.appendChild(MOD);
// газетная страница поверх: въезжает снизу и уезжает влево
const PAGE = $(`<div class="layer" style="display:none;box-shadow:0 -30px 80px rgba(0,0,0,.55)"><img src="assets/ed/newsprint.jpg" class="abs" style="left:0;top:0;width:1920px;height:1080px"/></div>`); root.appendChild(PAGE);

// ============ A · ХУК 0–6 ============
const A = scene(MOD, 0, 6.2, drawA);
const bulb = $(`<svg class="abs" style="left:880px;top:150px;overflow:visible" width="160" height="200" viewBox="0 0 64 80" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <circle id="bglow" cx="32" cy="28" r="30" fill="#8DB2FF" opacity="0"/>
  <path class="d" pathLength="1" d="M22 50c0-6-10-11-10-24a20 20 0 0 1 40 0c0 13-10 18-10 24z" stroke="#fff" stroke-width="2.4"/>
  <path class="d" pathLength="1" d="M23 57h18M24 63h16M28 69h8" stroke="#fff" stroke-width="2.4"/>
  <path id="fil" class="d" pathLength="1" d="M26 48V34l3-4 3 4 3-4 3 4v14" stroke="#8DB2FF" stroke-width="2.2"/>
  <path id="cross" pathLength="1" d="M6 74 58 6" stroke="#5A8CFF" stroke-width="4"/></svg>`);
A.appendChild(bulb);
const bD = [...bulb.querySelectorAll(".d")]; bD.forEach((p) => { p.style.strokeDasharray = "1 1"; });
const bCross = bulb.querySelector("#cross"); bCross.style.strokeDasharray = "1 1";
const aL1 = mkLine(A, "Первые большие деньги Эдисона", { top: 430, size: 86, weight: 700 });
const aL2 = mkLine(A, "принесла *не лампочка*", { top: 548, size: 112, weight: 800, font: "Nunito", ls: "-0.03em" });
function drawA(t) {
  bD.forEach((p, i) => { p.style.strokeDashoffset = (1 - E.io(prog(t, 0.3 + i * 0.25, 1.4 + i * 0.25))).toFixed(4); });
  // нить вспыхивает, а на «не лампочка» лампу перечёркивает линия
  const on = E.out(prog(t, 1.5, 1.9)) * (1 - E.io(prog(t, 2.6, 3.1)));
  bulb.querySelector("#bglow").setAttribute("opacity", (on * 0.35).toFixed(3));
  bCross.style.strokeDashoffset = (1 - E.io(prog(t, 2.6, 3.2))).toFixed(4);
  const q = E.io(prog(t, 5.0, 5.6)); S(bulb, { o: 1 - q, y: -q * 20 });
  words(aL1, t, 0.5, { out: 5.0 }); words(aL2, t, 1.5, { out: 5.05, stag: 0.14 });
}

// ============ B · ГАЗЕТА 5.3–39.6 ============
const IMG = { edison78: [731, 1100], edphono: [807, 1100], goldroom: [1423, 1000], tickers: [718, 1100] };
const INK = "#1A1D26";
// гравюра сбоку + плашка + реплика; текст уходит раньше картинки — наплывы не смешивают строки
function engr({ a, b, img, side, h, tag, says, sayAt, size = 66, kb = [0, 0] }) {
  const [iw, ih] = IMG[img], w = Math.round(h * iw / ih);
  const x = side === "L" ? 150 : 1920 - 150 - w, y = (1080 - h) / 2;
  const colX = side === "L" ? x + w + 110 : 170;
  const el = scene(PAGE, a, b, draw);
  const pic = $(`<div class="abs" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><img src="assets/ed/${img}.png" style="width:100%;height:100%;display:block"/></div>`);
  el.appendChild(pic);
  const nLines = Math.max(...says.map((s) => s.length));
  const top0 = Math.round(540 - (nLines * size * 1.2) / 2 + 40);
  const tg = mkTag(el, tag, { left: colX, top: top0 - 90 });
  const groups = says.map((ls) => block(el, ls, { left: colX, top: top0, size, weight: 600, color: INK, paper: true }));
  function draw(t) {
    const k = E.out(prog(t, a, a + 1.0)), q = E.io(prog(t, b - 0.9, b));
    S(pic, { o: k * (1 - q), s: 1.0 + 0.05 * prog(t, a, b), x: kb[0] * prog(t, a, b), y: kb[1] * prog(t, a, b) });
    tagAt(tg, t, a + 0.6, b - 1.0);
    groups.forEach((g, i) => { const nx = sayAt[i + 1]; blockAt(g, t, sayAt[i], { out: nx == null ? b - 1.05 : nx - 0.65 }); });
  }
}
engr({ a: 6.0, b: 12.5, img: "edison78", side: "L", h: 920, tag: "Томас Эдисон · 1869", says: [["22 года, телеграфист", "без гроша в кармане", "приезжает в *Нью-Йорк*"]], sayAt: [6.8], size: 70, kb: [0, -10] });

// B2 · Золотая биржа: гравюра сверху во всю ширину, реплики под ней
const B2a = 12.0, B2b = 18.7;
const B2 = scene(PAGE, B2a, B2b, drawB2);
const gW = 900, gH = Math.round(gW * 1000 / 1423);
const gPic = $(`<div class="abs" style="left:${960 - gW / 2}px;top:50px;width:${gW}px;height:${gH}px"><img src="assets/ed/goldroom.png" style="width:100%;height:100%;display:block"/></div>`);
B2.appendChild(gPic);
const b2tag = mkTag(B2, "Золотая биржа · Нью-Йорк, 1869", { top: 712 });
const b2s = block(B2, ["Сломался аппарат, показывавший *цены* —", "брокеры в панике. Эдисон чинит его", "и получает *работу*"], { top: 790, size: 58, weight: 600, color: INK, paper: true });
function drawB2(t) {
  const k = E.out(prog(t, B2a, B2a + 1.0)), q = E.io(prog(t, B2b - 0.9, B2b));
  S(gPic, { o: k * (1 - q), s: 1 + 0.04 * prog(t, B2a, B2b) });
  tagAt(b2tag, t, B2a + 0.6, B2b - 1.0);
  blockAt(b2s, t, 13.1, { out: B2b - 1.05, gap: 0.35 });
}

// B3 · тикер: рисунок брокеров у ленты + бегущая лента цен внизу
engr({ a: 18.2, b: 25.0, img: "tickers", side: "L", h: 900, tag: "Биржевой тикер", says: [["Потом он делает свой —", "быстрее и надёжнее", "*всех остальных*"]], sayAt: [19.4], size: 68, kb: [8, -6] });
const B3t = scene(PAGE, 18.2, 25.0, drawTape);
const tape = $(`<div class="abs" style="left:0;top:880px;width:1920px;height:78px;overflow:hidden"></div>`);
const tapeStrip = $(`<div class="abs" style="left:780px;top:8px;width:1200px;height:62px;background:#F4F1E6;box-shadow:0 6px 14px rgba(40,30,10,.18),inset 0 0 0 1px rgba(40,30,10,.12);overflow:hidden"></div>`);
const PRICES = [140.25, 140.5, 141.0, 141.75, 142.5, 143.0, 143.25, 144.5, 145.0, 145.75, 146.5, 147.25, 148.0, 149.5, 150.25, 151.0];
const tapeText = $(`<div class="abs" style="left:0;top:12px;white-space:nowrap;font:600 34px/1 'Onest';letter-spacing:.06em;color:${INK}">${PRICES.map((p) => `GOLD&nbsp;${p.toFixed(2)}`).join("&nbsp;&nbsp;·&nbsp;&nbsp;")}</div>`);
tapeStrip.appendChild(tapeText); tape.appendChild(tapeStrip); B3t.appendChild(tape);
function drawTape(t) {
  const k = E.out(prog(t, 20.4, 21.1)), q = E.io(prog(t, 24.4, 24.95));
  S(tape, { o: k * (1 - q), y: (1 - k) * 20 });
  // лента ползёт влево с постоянной скоростью — «цены в реальном времени»
  tapeText.style.transform = `translateX(${(-(t - 20.4) * 120).toFixed(1)}px)`;
}

// B4 · $5 000 → $40 000: счётчик крутится, в конце — короткий толчок
const B4a = 24.9, B4b = 31.8;
const B4 = scene(PAGE, B4a, B4b, drawB4);
const b4tag = mkTag(B4, "Первое состояние", { top: 200 });
const b4l = mkLine(B4, "Он надеялся получить $5 000", { top: 300, size: 64, weight: 600, color: INK, paper: true });
const b4n = $(`<div class="abs" style="left:0;right:0;top:420px;text-align:center;font:800 250px/1 'Nunito';letter-spacing:-0.02em;color:#2347C4;font-variant-numeric:tabular-nums">$5 000</div>`);
B4.appendChild(b4n);
const b4s = mkLine(B4, "столько ему *заплатили* за тикер", { top: 740, size: 68, weight: 700, color: INK, paper: true });
function drawB4(t) {
  const q = E.io(prog(t, B4b - 0.55, B4b));
  B4.style.opacity = 1 - q;
  tagAt(b4tag, t, B4a + 0.3); words(b4l, t, B4a + 0.6);
  const ap = E.out(prog(t, 26.2, 26.9)), run = E.io(prog(t, 27.0, 28.3));
  const v = Math.round(lerp(5000, 40000, run) / 50) * 50;
  b4n.textContent = "$" + v.toLocaleString("ru-RU").replace(/ /g, " ");
  const bump = Math.sin(Math.PI * prog(t, 28.3, 28.75)) * 0.07;
  S(b4n, { o: ap, s: 0.92 + 0.08 * ap + bump, y: (1 - ap) * 20 });
  words(b4s, t, 28.6);
}

// B5 · коронная фраза
engr({ a: 31.3, b: 39.6, img: "edphono", side: "R", h: 920, tag: "Его коронная фраза", says: [["«Гений — это", "1% вдохновения", "и *99% пота*»"]], sayAt: [32.5], size: 92, kb: [-8, -6] });
const B5s = scene(PAGE, 31.3, 39.6, (t) => words(sig, t, 34.7, { out: 38.55 }));
const sig = mkLine(B5s, "— Томас Эдисон", { left: 172, top: 760, size: 44, weight: 500, color: "#5A5F6E", paper: true });

// ============ C · СЕГОДНЯ 39.2–56.4 ============
// C1 · мостик: Mintly делает так же
const C1 = scene(MOD, 39.2, 45.6, drawC1);
const c1a = mkLine(C1, "*Mintly* делает так же:", { top: 250, size: 92, weight: 700 });
const c1b = mkLine(C1, "*1%* — твоя идея,", { top: 420, size: 116, weight: 800, font: "Nunito", ls: "-0.02em" });
const c1c = mkLine(C1, "*99%* — берём на себя", { top: 570, size: 116, weight: 800, font: "Nunito", ls: "-0.02em" });
function drawC1(t) { words(c1a, t, 39.7, { out: 44.9 }); words(c1b, t, 40.6, { out: 44.95, stag: 0.14 }); words(c1c, t, 41.5, { out: 45.0, stag: 0.14 }); }

// C2 · живые цены: график растёт в реальном времени, как лента тикера
const C2 = scene(MOD, 45.3, 51.0, drawC2);
const c2t = mkLine(C2, "Цены в реальном времени —", { top: 96, size: 84, weight: 700 });
const c2s = mkLine(C2, "как тикер Эдисона, только *в твоём Telegram*", { top: 206, size: 50, weight: 500, color: "#B4BAC6" });
const GX = 330, GY = 330, GW = 1260, GH = 520;
const series = (() => { let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const a = [0.18]; for (let i = 1; i < 120; i++) a.push(clamp(a[i - 1] + (r() - 0.43) * 0.05 + 0.004, 0.06, 0.95)); return a; })();
const gcard = $(`<div class="abs" style="left:${GX - 40}px;top:${GY - 40}px;width:${GW + 80}px;height:${GH + 90}px;border-radius:34px;background:rgba(10,16,34,.72);border:1.5px solid rgba(120,160,255,.22);box-shadow:0 30px 80px rgba(0,0,0,.5)"></div>`);
const live = $(`<div class="abs" style="left:${GX}px;top:${GY - 8}px;display:flex;align-items:center;gap:14px;font:700 34px/1 'Onest';color:#fff"><span id="ldot" style="width:16px;height:16px;border-radius:50%;background:#5A8CFF;box-shadow:0 0 18px #5A8CFF"></span>LIVE <span style="color:#8E96A6;font-weight:500">· MINT / TON</span></div>`);
const priceEl = $(`<div class="abs" style="left:${GX + GW - 420}px;width:420px;top:${GY - 14}px;text-align:right;font:800 52px/1 'Nunito';color:#fff;font-variant-numeric:tabular-nums">0.0000</div>`);
const gsvg = $(`<svg class="abs" style="left:${GX}px;top:${GY + 70}px;overflow:visible" width="${GW}" height="${GH - 70}" viewBox="0 0 ${GW} ${GH - 70}" fill="none">
  <defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3F78FF" stop-opacity=".38"/><stop offset="1" stop-color="#3F78FF" stop-opacity="0"/></linearGradient>
  <linearGradient id="gL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8DB2FF"/><stop offset="1" stop-color="#3F78FF"/></linearGradient></defs>
  ${[0, 1, 2, 3].map((i) => `<line x1="0" x2="${GW}" y1="${(i * (GH - 70) / 3).toFixed(1)}" y2="${(i * (GH - 70) / 3).toFixed(1)}" stroke="#fff" stroke-opacity=".07" stroke-width="2"/>`).join("")}
  <path id="ga" fill="url(#gA)"/><path id="gl" stroke="url(#gL)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle id="gp" r="22" fill="#5A8CFF" opacity=".25"/><circle id="gd" r="10" fill="#fff" stroke="#3F78FF" stroke-width="5"/></svg>`);
C2.append(gcard, live, priceEl, gsvg);
function drawC2(t) {
  const k = E.out(prog(t, 45.3, 46.0)), q = E.io(prog(t, 50.4, 51.0));
  C2.style.opacity = k * (1 - q);
  words(c2t, t, 45.6); words(c2s, t, 46.2, { stag: 0.07 });
  const ck = E.out(prog(t, 45.9, 46.7)); [gcard, live, priceEl, gsvg].forEach((e) => S(e, { o: ck, y: (1 - ck) * 30 }));
  // сколько точек уже «пришло»: график дописывается справа, как живой
  const n = Math.max(2, Math.floor(lerp(30, series.length, prog(t, 46.3, 50.2))));
  const H2 = GH - 70, step = GW / (series.length - 1);
  const pts = series.slice(0, n).map((v, i) => [i * step, H2 - v * H2]);
  const d = "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L");
  gsvg.querySelector("#gl").setAttribute("d", d);
  gsvg.querySelector("#ga").setAttribute("d", `${d} L${pts[pts.length - 1][0].toFixed(1)} ${H2} L0 ${H2} Z`);
  const [lx, ly] = pts[pts.length - 1];
  ["#gd", "#gp"].forEach((s) => { const c = gsvg.querySelector(s); c.setAttribute("cx", lx.toFixed(1)); c.setAttribute("cy", ly.toFixed(1)); });
  gsvg.querySelector("#gp").setAttribute("r", (16 + 10 * Math.abs(Math.sin(t * 3.2))).toFixed(1));
  live.querySelector("#ldot").style.opacity = (0.55 + 0.45 * Math.abs(Math.sin(t * 3.2))).toFixed(2);
  priceEl.textContent = (0.0021 + series[n - 1] * 0.006).toFixed(5) + " TON";
}

// C3 · рекомендации приложения: четыре карточки 2×2
const C3 = scene(MOD, 50.7, 56.4, drawC3);
const c3t = mkLine(C3, "Всё остальное — *уже готово*", { top: 150, size: 88, weight: 700 });
const CARDS = [
  ["Монета за минуту", `<circle cx="12" cy="12" r="8.5"/><path d="M8.6 15.4V8.6l3.4 4 3.4-4v6.8"/>`],
  ["Сделка в пару касаний", `<path d="M9 11V5.5a1.6 1.6 0 0 1 3.2 0V10M12.2 9.6V8.4a1.6 1.6 0 0 1 3.2 0V11M15.4 10.2a1.6 1.6 0 0 1 3.2 0V15c0 3.3-2.4 6-5.8 6h-1c-2 0-3.3-.8-4.4-2.3L5 15.4a1.6 1.6 0 0 1 2.6-1.8L9 15"/>`],
  ["0% комиссии", `<circle cx="7.5" cy="7.5" r="2.6"/><circle cx="16.5" cy="16.5" r="2.6"/><path d="M18 6 6 18"/>`],
  ["Всё — в Telegram", `<path d="M3.5 11.4 20 4.6l-2.9 14.8-5.1-3.9-2.9 2.8.3-4.4L16.6 7.4 7.9 12.9z"/>`],
];
const cards = CARDS.map(([lb, d], i) => {
  const cx = i % 2 ? 1010 : 290, cy = i < 2 ? 360 : 600;
  const c = $(`<div class="abs" style="left:${cx}px;top:${cy}px;width:620px;height:190px;border-radius:32px;background:rgba(14,22,46,.78);border:1.5px solid rgba(120,160,255,.24);display:flex;align-items:center;gap:30px;padding:0 36px;box-shadow:0 24px 60px rgba(0,0,0,.45)">
    <div style="width:118px;height:118px;border-radius:30px;background:rgba(63,120,255,.16);display:flex;align-items:center;justify-content:center;flex:none">
      <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="#8DB2FF" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg></div>
    <div style="font:700 44px/1.1 'Onest';color:#fff;letter-spacing:-.01em">${lb}</div></div>`);
  C3.appendChild(c); return c;
});
function drawC3(t) {
  const q = E.io(prog(t, 55.8, 56.4)); C3.style.opacity = 1 - q;
  words(c3t, t, 51.0);
  cards.forEach((c, i) => { const a = 51.6 + i * 0.4, k = E.soft(prog(t, a, a + 0.85)); S(c, { o: clamp(k * 1.4), y: (1 - k) * 40, s: 0.94 + 0.06 * k }); });
}

// ============ D · ПРИЗЫВ И ЛОГОТИП 56–62 ============
const M_PATH = "M300 218 L627 660 L955 218 L1080 988 L886 988 L836 610 L627 910 L418 610 L369 988 L173 988 Z";
let mLogoN = 0;
// большая M появляется в центре, уменьшается на место, из-под неё выходит «intly»
function mLogo(parent, { F, base, fill, text, glow = "none", tail = "intly" }) {
  const id = "mg" + mLogoN++, capH = 0.705 * F, mW = capH * 907 / 770, grad = fill.split(",");
  const m = $(`<svg class="abs" style="left:0;top:0;width:${mW.toFixed(1)}px;height:${capH.toFixed(1)}px;overflow:visible;transform-origin:50% 50%;filter:${glow}" viewBox="173 218 907 770">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${grad.map((c, i) => `<stop offset="${i / Math.max(1, grad.length - 1)}" stop-color="${c}"/>`).join("")}</linearGradient></defs>
    <path d="${M_PATH}" fill="url(#${id})"/></svg>`);
  const row = $(`<div class="abs" style="left:0;top:${(base - 0.829 * F).toFixed(1)}px;font:800 ${F}px/1 'Nunito';letter-spacing:-0.04em;white-space:nowrap;clip-path:inset(-40% 100% -40% 0)"></div>`);
  const inner = $(`<div style="display:inline-block"></div>`); row.appendChild(inner);
  const sp = [...tail].map((ch) => { const e = $(`<span style="display:inline-block;${text}">${ch}</span>`); inner.appendChild(e); return e; });
  parent.append(row, m);
  const o = { m, row, sp, mW, capH };
  o.at = (t, t0) => {
    if (!o.w) { const rw = row.offsetWidth; if (!rw) return; o.w = rw; o.offs = sp.map((e) => e.offsetLeft - inner.offsetLeft); o.ws = sp.map((e) => e.offsetWidth); }
    const gap = 0.035 * F, total = mW + gap + o.w, L = 960 - total / 2, mx = L + mW / 2, my = base - capH / 2;
    const a = E.outQ(prog(t, t0, t0 + 0.6)), mv = E.io(prog(t, t0 + 0.65, t0 + 1.4));
    const sc = lerp(2.3, 1, mv) * (0.86 + 0.14 * a);
    S(m, { o: a, x: lerp(960, mx, mv) - mW / 2, y: my - capH / 2, s: sc, b: (1 - a) * 12 });
    row.style.left = (L + mW + gap).toFixed(1) + "px";
    const rq = E.io(prog(t, t0 + 1.2, t0 + 1.2 + 0.5 + 0.045 * sp.length)), rv = rq * (o.w + 0.1 * F);
    row.style.clipPath = `inset(-40% ${Math.max(0, o.w - rv).toFixed(1)}px -40% 0)`;
    sp.forEach((e, i) => { const lk = E.out(clamp((rv - o.offs[i]) / (o.ws[i] * 1.4))); S(e, { o: clamp(lk * 1.6), x: -(1 - lk) * o.ws[i] * 0.7, b: (1 - lk) * 4 }); });
  };
  return o;
}
const D = scene(MOD, 56.1, 62, drawD);
const d1 = mkLine(D, "Хватит ждать —", { top: 150, size: 96, weight: 700 });
const d2 = mkLine(D, "*начни сегодня*", { top: 268, size: 150, weight: 800, font: "Nunito", ls: "-0.03em" });
const LF = 150, LBASE = 520 + 0.705 * LF;
const LTXT = "background:linear-gradient(95deg,#FFFFFF,#E9ECF1 50%,#A7AFBA);-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:.14em;margin-bottom:-.14em";
const logo = mLogo(D, { F: LF, base: LBASE, fill: "#FFFFFF,#E3E7ED,#A7AFBA", text: LTXT, glow: "drop-shadow(0 10px 44px rgba(120,165,255,.35))" });
const bot = $(`<div class="abs" style="left:0;right:0;top:${Math.round(LBASE + 70)}px;text-align:center"><div style="display:inline-flex;align-items:center;gap:16px;padding:24px 48px;border-radius:999px;background:#2F6BFF;font:700 48px/1 'Onest';color:#fff;box-shadow:0 18px 50px rgba(47,107,255,.4)">
  <svg width="46" height="46" viewBox="0 0 24 24"><path d="M3 11.5 20 4.5l-3 15-5-4-3 3 .4-4.6L17 7.5 8 13z" fill="#fff"/></svg>@MintlyAppbot</div></div>`);
D.appendChild(bot);
function drawD(t) {
  words(d1, t, 56.4); words(d2, t, 57.0, { stag: 0.16 });
  logo.at(t, 58.6);
  const bk = E.soft(prog(t, 59.8, 60.5)); S(bot, { o: clamp(bk * 1.4), y: (1 - bk) * 30, s: 0.94 + 0.06 * bk });
}

// ================= КАДР =================
window.renderAt = (t) => {
  for (const sc of scenes) {
    const on = t >= sc.a - 0.001 && t <= sc.b + 0.001;
    sc.el.style.display = on ? "block" : "none";
    if (on) sc.draw(t);
  }
  // фон: лучи медленно покачиваются, сетка едет на зрителя
  rays.style.transform = `rotate(${(Math.sin(t * 0.23) * 3).toFixed(3)}deg)`; rays.style.opacity = (0.8 + 0.2 * Math.sin(t * 0.9)).toFixed(3);
  rays2.style.transform = `rotate(${(-Math.sin(t * 0.17) * 4).toFixed(3)}deg)`; rays2.style.opacity = (0.7 + 0.3 * Math.sin(t * 0.6 + 1)).toFixed(3);
  floor.style.backgroundPosition = `0 ${((t * 70) % 160).toFixed(2)}px`;
  glowTop.style.opacity = (0.85 + 0.15 * Math.sin(t * 0.7)).toFixed(3);
  // перелив градиентного текста непрерывен по всей строке: сдвиг учитывает место слова
  for (const s of gradSpans) { if (s.ox == null && s.offsetWidth) s.ox = s.offsetLeft; s.style.backgroundPosition = `${(-t * 150 - (s.ox || 0)).toFixed(1)}px 0`; }
  // газетная страница: въезжает снизу (5.3–6.1), уезжает влево (38.8–39.6)
  const pin = E.io(prog(t, 5.3, 6.1)), pout = E.io(prog(t, 38.8, 39.6));
  if (t < 5.3 || t > 39.6) PAGE.style.display = "none";
  else { PAGE.style.display = "block"; PAGE.style.transform = `translate3d(${(-pout * 1960).toFixed(1)}px,${((1 - pin) * 1100).toFixed(1)}px,0)`; }
  document.getElementById("fade").style.opacity = Math.max(1 - E.out(prog(t, 0, 0.45)), E.io(prog(t, 61.35, 62)));
};

Promise.all([document.fonts.ready, ...[...document.images].map((im) => im.decode().catch(() => {}))]).then(() => { window.renderAt(0); window.ready = true; });
