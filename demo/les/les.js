// Mintly · история Леса Брауна. Горизонтальный ролик 16:9, 64 с.
// Сюжет: родился на полу заброшенного дома → в школе записали в «отсталые» →
// мусорщик, который мечтал о радио → каждый день просился на станцию, взяли на
// побегушки → однажды взял микрофон → сцена, миллионы слушателей, честное
// богатство → «он начал буквально с пола» → монеты в Mintly устроены так же:
// стартуют с самого низа и растут с каждым, кто в них поверил → рекомендации →
// его фраза → «Хватит ждать — начни сегодня» → логотип.
// Героя не показываем лицом: только линейные рисунки сцен (его фото защищены
// и реклама с лицом выглядела бы как одобрение). Фон — тёмная сцена с лучом
// прожектора, который следует за рисунком, пылинками и звуковой волной.
// Кадр зависит только от t — renderAt(t) можно звать в любом порядке.
"use strict";
const DUR = 64;
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
const scenes = [];
function scene(a, b, draw) { const el = $(`<div class="scene" style="visibility:visible;display:none"></div>`); TOP.appendChild(el); scenes.push({ el, a, b, draw }); return el; }

// ---- кинетическая строка: слова по одному, *слово* — синим акцентом ----
const gradSpans = [];
function mkLine(parent, text, { left = null, top, size, weight = 600, color = "#FFFFFF", font = "Onest", ls = "-0.02em" }) {
  const pos = left == null ? "left:0;right:0;text-align:center" : `left:${left}px`;
  const el = $(`<div class="abs" style="${pos};top:${top}px;font:${weight} ${size}px/1.15 '${font}';letter-spacing:${ls};color:${color};white-space:nowrap"></div>`);
  const g = /^#fff(fff)?$/i.test(color);
  const spans = text.split(" ").map((w) => {
    const acc = w.includes("*"), cls = acc ? " accent" : g ? " grad" : "";
    const s = $(`<span class="w${cls}">${w.replace(/\*/g, "")}</span>`);
    if (cls) gradSpans.push(s);
    return s;
  });
  spans.forEach((s, i) => { el.appendChild(s); if (i < spans.length - 1) el.appendChild(document.createTextNode(" ")); });
  parent.appendChild(el); el.spans = spans; return el;
}
function words(l, t, a, { stag = 0.11, dur = 1.1, out = null, outDur = 0.6, rise = 22 } = {}) {
  l.spans.forEach((w, i) => {
    const k = E.out(prog(t, a + i * stag, a + i * stag + dur));
    let o = k, y = (1 - k) * rise, b = (1 - k) * 7, s = 1;
    if (out != null) { const q = E.io(prog(t, out + i * 0.03, out + i * 0.03 + outDur)); o *= 1 - q; b += q * 9; y -= q * 12; s = 1 + q * 0.03; }
    S(w, { o, y, b, s });
  });
}
function block(parent, lines, opt) { return lines.map((tx, i) => mkLine(parent, tx, { ...opt, top: opt.top + i * Math.round(opt.size * 1.2) })); }
function blockAt(ls, t, a, { out = null, gap = 0.32 } = {}) { ls.forEach((l, i) => words(l, t, a + i * gap, { out })); }
function mkTag(parent, text, { left = null, top }) {
  const wrap = $(`<div class="abs" style="${left == null ? "left:0;right:0;text-align:center" : `left:${left}px`};top:${top}px"></div>`);
  const tg = $(`<div class="tag">${text}</div>`); wrap.appendChild(tg); parent.appendChild(wrap); return tg;
}
function tagAt(tg, t, a, out = null) {
  const k = E.out(prog(t, a, a + 0.7)), q = out == null ? 0 : E.io(prog(t, out, out + 0.5));
  S(tg, { o: k * (1 - q), y: (1 - k) * 14 - q * 8, b: (1 - k) * 5 + q * 6 });
}

// ================= ФОН: тёмная сцена =================
const BG = $(`<div class="layer" style="background:#030407"></div>`); root.appendChild(BG);
// луч прожектора: трапеция с мягким градиентом, поворачивается к рисунку
const beam = $(`<div class="abs" style="left:260px;top:-160px;width:1400px;height:1320px;transform-origin:50% 0;clip-path:polygon(44% 0,56% 0,100% 100%,0 100%);
  background:linear-gradient(to bottom,rgba(176,204,255,.26) 0%,rgba(150,186,255,.12) 45%,rgba(120,160,255,.04) 80%,rgba(120,160,255,0) 100%)"></div>`);
const beamCore = $(`<div class="abs" style="left:560px;top:-160px;width:800px;height:1320px;transform-origin:50% 0;clip-path:polygon(46% 0,54% 0,90% 100%,10% 100%);
  background:linear-gradient(to bottom,rgba(210,226,255,.18),rgba(190,212,255,.05) 70%,rgba(190,212,255,0))"></div>`);
const lamp = $(`<div class="abs" style="left:810px;top:-170px;width:300px;height:300px;border-radius:50%;background:radial-gradient(closest-side,rgba(220,232,255,.55),rgba(160,190,255,.15) 55%,rgba(160,190,255,0))"></div>`);
const pool = $(`<div class="abs" style="left:0;top:0;width:1100px;height:190px;border-radius:50%;background:radial-gradient(closest-side,rgba(150,186,255,.20),rgba(150,186,255,.06) 60%,rgba(150,186,255,0))"></div>`);
const floorLine = $(`<div class="abs" style="left:0;top:905px;width:1920px;height:2px;background:linear-gradient(90deg,rgba(120,160,255,0),rgba(120,160,255,.28) 50%,rgba(120,160,255,0))"></div>`);
BG.append(beam, beamCore, lamp, pool, floorLine);
// пылинки в луче: детерминированные траектории
const dust = Array.from({ length: 46 }, (_, i) => {
  const r = (k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  const d = $(`<div class="abs" style="left:0;top:0;width:${(2 + r(1) * 3).toFixed(1)}px;height:${(2 + r(1) * 3).toFixed(1)}px;border-radius:50%;background:#DCE6FF"></div>`);
  d.p = [r(2), r(3), r(4), r(5)]; BG.appendChild(d); return d;
});
// звуковая волна внизу — как в радиоэфире
const WN = 160;
const wave = $(`<svg class="abs" style="left:0;top:960px;overflow:visible" width="1920" height="80" viewBox="0 0 1920 80" fill="none"><defs><linearGradient id="wg" x1="0" x2="1"><stop offset="0" stop-color="#5A8CFF" stop-opacity="0"/><stop offset=".5" stop-color="#8DB2FF" stop-opacity=".75"/><stop offset="1" stop-color="#5A8CFF" stop-opacity="0"/></linearGradient></defs><polyline id="wl" stroke="url(#wg)" stroke-width="3" stroke-linejoin="round"/></svg>`);
BG.appendChild(wave);
const TOP = $(`<div class="layer"></div>`); root.appendChild(TOP);

// куда смотрит прожектор: x центра рисунка по времени (R — справа, L — слева, C — центр)
const AIM = [[0, 1450], [7.0, 470], [13.2, 1450], [19.4, 470], [26.4, 1450], [32.6, 470], [38.7, 960]];
function aimAt(t) {
  let x = AIM[0][1];
  for (let i = 1; i < AIM.length; i++) { const [tb, v] = AIM[i]; x = lerp(x, v, E.io(prog(t, tb - 0.7, tb + 0.5))); }
  return x;
}

// ================= ЛИНЕЙНЫЕ РИСУНКИ =================
// каждый элемент рисуется линией по очереди и стирается в обратном порядке
const ART = {
  birth: `<path d="M30 520H570"/><path d="M70 520V170H210V520"/><path d="M212 182 268 204V520"/>
    <path d="M320 140H520V360H320Z"/><path d="M420 140V360M320 250H520"/><path class="b" d="M310 168 532 322M330 334 512 156"/>
    <path d="M110 92l22 38-16 30 26 36"/><path d="M548 78l-18 30 14 22"/>
    <path class="b" d="M366 364 304 504M434 364 404 504M500 364 488 504" style="stroke-opacity:.6"/>
    <ellipse cx="338" cy="498" rx="76" ry="24"/><circle cx="272" cy="486" r="19"/><path d="M304 484c22 10 44 12 74 6"/>`,
  school: `<rect x="120" y="70" width="360" height="160" rx="10"/><path d="M160 120h70M160 160h120M300 120h60"/>
    <path d="M80 360H520"/><path d="M80 360 62 384H538L520 360"/><path d="M104 384V530M496 384V530"/>
    <path d="M200 282 404 262 432 352 180 360Z"/>
    <g transform="rotate(-9 318 314)"><rect class="b" x="238" y="288" width="160" height="52" rx="8"/></g>`,
  trash: `<path d="M30 520H570"/><path d="M108 300H272L256 510H124Z"/><path d="M98 288H282"/><path d="M168 288c0-24 44-24 44 0"/>
    <path d="M132 344H248M136 394H244M140 444H240"/><path d="M302 520 372 252"/><path d="M276 520H334L318 468H292Z"/>
    <path d="M470 520 505 232 540 520M482 420H528M492 330H518"/><circle cx="505" cy="216" r="10"/>
    <path class="b" d="M474 192a46 46 0 0 1 62 0M458 170a72 72 0 0 1 94 0M442 148a98 98 0 0 1 126 0"/>`,
  door: `<path d="M30 520H570"/><path d="M226 520V170H406V520"/><path d="M242 520V186H390V520"/><circle cx="366" cy="362" r="9"/>
    <rect x="248" y="96" width="136" height="48" rx="9"/><path d="M262 240H370M262 300H370"/>
    <path class="b knock" d="M196 330a24 24 0 0 0 0 48"/><path class="b knock" d="M176 316a44 44 0 0 0 0 76"/><path class="b knock" d="M156 302a64 64 0 0 0 0 104"/>`,
  mic: `<rect x="250" y="120" width="100" height="172" rx="50"/><path d="M262 170H338M258 210H342M262 250H338"/>
    <path d="M216 236c0 74 168 74 168 0"/><path d="M300 312V470"/><path d="M226 482H374"/>
    <rect class="b air" x="392" y="52" width="176" height="62" rx="12"/>
    <path class="b" d="M200 170a70 70 0 0 0 0 110M170 150a110 110 0 0 0 0 150M400 170a70 70 0 0 1 0 110M430 150a110 110 0 0 1 0 150"/>`,
  stage: `<path d="M50 420H550"/><path d="M50 420 24 466H576L550 420"/>
    <circle cx="300" cy="150" r="34"/><path d="M300 186V306"/><path d="M300 212 352 196 356 164"/><rect class="b" x="346" y="136" width="20" height="32" rx="10"/>
    <path d="M300 214 236 252"/><path d="M300 306 272 414M300 306 330 414"/>
    <path class="b crowd" d="M60 600a34 34 0 0 1 68 0M140 600a34 34 0 0 1 68 0M220 600a34 34 0 0 1 68 0M300 600a34 34 0 0 1 68 0M380 600a34 34 0 0 1 68 0M460 600a34 34 0 0 1 68 0"/>
    <path class="b crowd" d="M100 560a30 30 0 0 1 60 0M180 560a30 30 0 0 1 60 0M260 560a30 30 0 0 1 60 0M340 560a30 30 0 0 1 60 0M420 560a30 30 0 0 1 60 0"/>`,
};
// подписи внутри рисунков (текстом, а не линией)
const ART_TEXT = {
  school: `<text class="stampTx" x="318" y="326" text-anchor="middle" transform="rotate(-9 318 314)" style="font:800 30px 'Onest';letter-spacing:.08em;fill:#8DB2FF">ОТСТАЛЫЙ</text>`,
  door: `<text x="316" y="129" text-anchor="middle" style="font:700 26px 'Onest';letter-spacing:.14em">РАДИО</text>`,
  mic: `<text class="airTx" x="480" y="93" text-anchor="middle" style="font:800 26px 'Onest';letter-spacing:.12em;fill:#8DB2FF">В ЭФИРЕ</text>`,
};
function mkArt(parent, key, x, y, size = 660) {
  const svg = $(`<svg class="art" style="left:${x}px;top:${y}px" width="${size}" height="${size}" viewBox="0 0 600 600">${ART[key]}${ART_TEXT[key] || ""}</svg>`);
  parent.appendChild(svg);
  const els = [...svg.querySelectorAll("path,rect,circle,ellipse,line")];
  els.forEach((e) => { e.setAttribute("pathLength", "1"); e.style.strokeDasharray = "1 1"; });
  svg.els = els; svg.txt = [...svg.querySelectorAll("text")];
  return svg;
}
function artAt(svg, t, a, b, { span = 1.7 } = {}) {
  const n = svg.els.length;
  svg.els.forEach((e, i) => {
    const s0 = a + (i / n) * span, k = E.io(prog(t, s0, s0 + 0.75));
    const j = n - 1 - i, u0 = b - 1.0 + (j / n) * 0.5, q = E.io(prog(t, u0, u0 + 0.45));
    e.style.strokeDashoffset = (1 - k + q).toFixed(4);
  });
  svg.txt.forEach((e) => { e.style.opacity = (E.out(prog(t, a + span * 0.7, a + span * 0.7 + 0.5)) * (1 - E.io(prog(t, b - 1.0, b - 0.6)))).toFixed(3); });
}

// сцена «рисунок + плашка + реплики»: рисунок со стороны прожектора, текст напротив
function artScene({ a, b, key, side, tag, says, sayAt, size = 70, extra }) {
  const ax = side === "R" ? 1120 : 140, colX = side === "R" ? 150 : 880;
  const el = scene(a, b, draw);
  const art = mkArt(el, key, ax, 196);
  const nL = Math.max(...says.map((s) => s.length));
  const top0 = Math.round(560 - (nL * size * 1.2) / 2);
  const tg = mkTag(el, tag, { left: colX, top: top0 - 96 });
  const groups = says.map((ls) => block(el, ls, { left: colX, top: top0, size, weight: 700 }));
  function draw(t) {
    artAt(art, t, a, b);
    tagAt(tg, t, a + 0.6, b - 1.05);
    groups.forEach((g, i) => { const nx = sayAt[i + 1]; blockAt(g, t, sayAt[i], { out: nx == null ? b - 1.1 : nx - 0.65 }); });
    if (extra) extra(t, art);
  }
  return el;
}

artScene({ a: 0, b: 7.0, key: "birth", side: "R", tag: "Майами · 1945", says: [["Он родился", "на полу", "*заброшенного дома*"]], sayAt: [1.2], size: 92 });
artScene({ a: 6.35, b: 13.2, key: "school", side: "L", tag: "Пятый класс", says: [["В школе его записали", "в *«отсталые»* и вернули", "на класс назад"]], sayAt: [7.8], size: 74,
  extra: (t, art) => {
    // штамп «шлёпается» на листок: увеличен и прозрачен → на место с толчком
    const st = art.querySelector(".stampTx"), k = E.soft(prog(t, 9.0, 9.45));
    st.setAttribute("transform", `rotate(-9 318 314) translate(318 314) scale(${lerp(1.8, 1, k).toFixed(3)}) translate(-318 -314)`);
  } });
artScene({ a: 12.6, b: 19.4, key: "trash", side: "R", tag: "Майами-Бич", says: [["Работал мусорщиком", "и мечтал вести", "*радиоэфир*"]], sayAt: [14.0], size: 82 });
artScene({ a: 18.8, b: 26.4, key: "door", side: "L", tag: "Радиостанция", says: [["Каждый день приходил", "и спрашивал:", "«Работа есть?» — *«Нет»*"], ["Пока его не взяли", "*на побегушки*"]], sayAt: [20.2, 23.4], size: 74,
  extra: (t, art) => {
    // стук в дверь: дуги расходятся волной, трижды за реплику
    art.querySelectorAll(".knock").forEach((e, i) => {
      const ph = ((t - 20.6) * 1.4 - i * 0.18) % 1, on = t > 20.6 && t < 23.2;
      e.style.opacity = on ? (0.25 + 0.75 * Math.max(0, 1 - Math.abs(ph - 0.25) * 3)).toFixed(3) : "1";
    });
  } });
artScene({ a: 25.8, b: 32.6, key: "mic", side: "R", tag: "Однажды", says: [["Ведущий не смог", "выйти в эфир —", "и Лес взял *микрофон*"]], sayAt: [27.2], size: 78,
  extra: (t, art) => {
    // табличка «В ЭФИРЕ» загорается, когда звучит его имя
    const on = E.out(prog(t, 29.4, 29.8)) * (1 - E.io(prog(t, 31.6, 32.0)));
    const air = art.querySelector(".air"); air.style.fill = `rgba(63,120,255,${(on * 0.35).toFixed(3)})`;
    art.querySelector(".airTx").style.fill = on > 0.5 ? "#FFFFFF" : "#8DB2FF";
    air.style.filter = on > 0.02 ? `drop-shadow(0 0 ${(on * 18).toFixed(1)}px rgba(90,140,255,.9))` : "none";
  } });
artScene({ a: 32.0, b: 38.8, key: "stage", side: "L", tag: "Потом", says: [["Стал спикером,", "которого слушают миллионы,", "и честно *разбогател*"]], sayAt: [33.4], size: 70 });

// ============ МОСТИК: старт с пола → так устроены монеты Mintly ============
const BR = scene(38.2, 45.9, drawBR);
const br1 = mkLine(BR, "Он начал буквально *с пола*.", { top: 120, size: 84, weight: 700 });
const br2 = mkLine(BR, "Монеты в *Mintly* устроены так же:", { top: 232, size: 66, weight: 600, color: "#C9D6F2" });
const CX = 460, CY = 380, CW = 1000, CH = 420;
const price = (x) => 0.02 + 0.92 * Math.pow(x, 2.1);
const cpts = Array.from({ length: 81 }, (_, i) => { const x = i / 80; return [x * CW, CH - price(x) * CH]; });
const cpath = "M" + cpts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L");
const chart = $(`<svg class="art" style="left:${CX}px;top:${CY}px" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}">
  <path class="ax" d="M0 ${CH}H${CW}" style="stroke-opacity:.35"/>
  <path class="b cl" d="${cpath}" style="stroke-width:7"/>
  <g id="pul"></g><circle id="cd" r="13" style="fill:#fff;stroke:#3F78FF;stroke-width:5"/></svg>`);
BR.appendChild(chart);
const start = $(`<div class="abs" style="left:${CX - 20}px;top:${CY + CH + 18}px;font:600 40px 'Onest';color:#8DB2FF;white-space:nowrap">старт с самого низа</div>`);
BR.appendChild(start);
const br3 = block(BR, ["и растут с каждым,", "кто в них *поверил*"], { left: 1010, top: 836, size: 56, weight: 700, color: "#C9D6F2" });
const BUY = [0.16, 0.34, 0.5, 0.64, 0.77, 0.89];
const pul = chart.querySelector("#pul");
const rings = BUY.map(() => { const c = document.createElementNS("http://www.w3.org/2000/svg", "circle"); c.setAttribute("class", "b"); c.style.strokeWidth = "3"; pul.appendChild(c); return c; });
[chart.querySelector(".ax"), chart.querySelector(".cl")].forEach((e) => { e.setAttribute("pathLength", "1"); e.style.strokeDasharray = "1 1"; });
const onCurve = (p) => [p * CW, CH - price(p) * CH];
function drawBR(t) {
  const q = E.io(prog(t, 45.3, 45.85)); BR.style.opacity = 1 - q;
  words(br1, t, 38.5); words(br2, t, 40.2, { stag: 0.09 });
  chart.querySelector(".ax").style.strokeDashoffset = 1 - E.io(prog(t, 40.9, 41.5));
  const dr = E.io(prog(t, 41.3, 43.9));
  chart.querySelector(".cl").style.strokeDashoffset = (1 - dr).toFixed(4);
  const [dx, dy] = onCurve(dr), cd = chart.querySelector("#cd");
  cd.setAttribute("cx", dx.toFixed(1)); cd.setAttribute("cy", dy.toFixed(1)); cd.style.opacity = clamp(dr * 25);
  BUY.forEach((b, i) => {
    const tb = 41.3 + 2.6 * b, pk = prog(t, tb, tb + 0.8), [px, py] = onCurve(b), c = rings[i];
    c.setAttribute("cx", px.toFixed(1)); c.setAttribute("cy", py.toFixed(1)); c.setAttribute("r", (10 + 36 * E.out(pk)).toFixed(1));
    c.style.opacity = pk > 0 && pk < 1 ? ((1 - pk) * 0.9).toFixed(3) : 0;
  });
  const sk = E.out(prog(t, 41.0, 41.7)); S(start, { o: sk, y: (1 - sk) * 16 });
  blockAt(br3, t, 42.4, { gap: 0.35 });
}

// ============ РЕКОМЕНДАЦИИ ============
const RC = scene(45.7, 52.1, drawRC);
const rct = mkLine(RC, "Чтобы начать, хватит *минуты*", { top: 140, size: 88, weight: 700 });
const CARDS = [
  ["Своя монета за минуту", `<circle cx="12" cy="12" r="8.5"/><path d="M8.6 15.4V8.6l3.4 4 3.4-4v6.8"/>`],
  ["Сделка в пару касаний", `<path d="M9 11V5.5a1.6 1.6 0 0 1 3.2 0V10M12.2 9.6V8.4a1.6 1.6 0 0 1 3.2 0V11M15.4 10.2a1.6 1.6 0 0 1 3.2 0V15c0 3.3-2.4 6-5.8 6h-1c-2 0-3.3-.8-4.4-2.3L5 15.4a1.6 1.6 0 0 1 2.6-1.8L9 15"/>`],
  ["0% комиссии", `<circle cx="7.5" cy="7.5" r="2.6"/><circle cx="16.5" cy="16.5" r="2.6"/><path d="M18 6 6 18"/>`],
  ["Всё внутри Telegram", `<path d="M3.5 11.4 20 4.6l-2.9 14.8-5.1-3.9-2.9 2.8.3-4.4L16.6 7.4 7.9 12.9z"/>`],
];
const cards = CARDS.map(([lb, d], i) => {
  const c = $(`<div class="card" style="left:${i % 2 ? 1000 : 280}px;top:${i < 2 ? 340 : 590}px">
    <div style="width:120px;height:120px;border-radius:30px;background:rgba(63,120,255,.16);display:flex;align-items:center;justify-content:center;flex:none">
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#8DB2FF" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg></div>
    <div style="font:700 44px/1.1 'Onest';color:#fff;letter-spacing:-.01em">${lb}</div></div>`);
  RC.appendChild(c); return c;
});
function drawRC(t) {
  const q = E.io(prog(t, 51.5, 52.1)); RC.style.opacity = 1 - q;
  words(rct, t, 45.85);
  cards.forEach((c, i) => { const a = 46.9 + i * 0.42, k = E.soft(prog(t, a, a + 0.85)); S(c, { o: clamp(k * 1.4), y: (1 - k) * 40, s: 0.94 + 0.06 * k }); });
}

// ============ ЕГО ФРАЗА ============
const QT = scene(51.8, 58.1, drawQT);
const qmark = $(`<div class="abs" style="left:0;right:0;top:96px;text-align:center;font:800 220px/1 'Nunito';color:#3F78FF;opacity:.0">«</div>`);
QT.appendChild(qmark);
const qL = block(QT, ["Не нужно быть великим,", "чтобы начать, — но нужно начать,", "чтобы стать *великим*"], { top: 330, size: 82, weight: 700 });
const qS = mkLine(QT, "— Лес Браун", { top: 650, size: 46, weight: 500, color: "#9AA3B4" });
function drawQT(t) {
  const q = E.io(prog(t, 57.5, 58.1)); QT.style.opacity = 1 - q;
  const mk = E.out(prog(t, 52.0, 52.7)); S(qmark, { o: mk * 0.9, y: (1 - mk) * 30 });
  blockAt(qL, t, 52.3, { gap: 0.5 }); words(qS, t, 55.3);
}

// ============ ПРИЗЫВ И ЛОГОТИП ============
const M_PATH = "M300 218 L627 660 L955 218 L1080 988 L886 988 L836 610 L627 910 L418 610 L369 988 L173 988 Z";
function mLogo(parent, { F, base, fill, text, glow = "none", tail = "intly" }) {
  const capH = 0.705 * F, mW = capH * 907 / 770, grad = fill.split(",");
  const m = $(`<svg class="abs" style="left:0;top:0;width:${mW.toFixed(1)}px;height:${capH.toFixed(1)}px;overflow:visible;transform-origin:50% 50%;filter:${glow}" viewBox="173 218 907 770">
    <defs><linearGradient id="mg0" x1="0" y1="0" x2="1" y2="1">${grad.map((c, i) => `<stop offset="${i / Math.max(1, grad.length - 1)}" stop-color="${c}"/>`).join("")}</linearGradient></defs>
    <path d="${M_PATH}" fill="url(#mg0)"/></svg>`);
  const row = $(`<div class="abs" style="left:0;top:${(base - 0.829 * F).toFixed(1)}px;font:800 ${F}px/1 'Nunito';letter-spacing:-0.04em;white-space:nowrap;clip-path:inset(-40% 100% -40% 0)"></div>`);
  const inner = $(`<div style="display:inline-block"></div>`); row.appendChild(inner);
  const sp = [...tail].map((ch) => { const e = $(`<span style="display:inline-block;${text}">${ch}</span>`); inner.appendChild(e); return e; });
  parent.append(row, m);
  const o = { m, row, sp, mW, capH };
  o.at = (t, t0) => {
    if (!o.w) { const rw = row.offsetWidth; if (!rw) return; o.w = rw; o.offs = sp.map((e) => e.offsetLeft - inner.offsetLeft); o.ws = sp.map((e) => e.offsetWidth); }
    const gap = 0.035 * F, total = mW + gap + o.w, L = 960 - total / 2, mx = L + mW / 2, my = base - capH / 2;
    const a = E.outQ(prog(t, t0, t0 + 0.6)), mv = E.io(prog(t, t0 + 0.65, t0 + 1.4));
    S(m, { o: a, x: lerp(960, mx, mv) - mW / 2, y: my - capH / 2, s: lerp(2.3, 1, mv) * (0.86 + 0.14 * a), b: (1 - a) * 12 });
    row.style.left = (L + mW + gap).toFixed(1) + "px";
    const rq = E.io(prog(t, t0 + 1.2, t0 + 1.2 + 0.5 + 0.045 * sp.length)), rv = rq * (o.w + 0.1 * F);
    row.style.clipPath = `inset(-40% ${Math.max(0, o.w - rv).toFixed(1)}px -40% 0)`;
    sp.forEach((e, i) => { const lk = E.out(clamp((rv - o.offs[i]) / (o.ws[i] * 1.4))); S(e, { o: clamp(lk * 1.6), x: -(1 - lk) * o.ws[i] * 0.7, b: (1 - lk) * 4 }); });
  };
  return o;
}
const CT = scene(57.7, 64, drawCT);
const ct1 = mkLine(CT, "Хватит ждать —", { top: 150, size: 96, weight: 700 });
const ct2 = mkLine(CT, "*начни сегодня*", { top: 268, size: 150, weight: 800, font: "Nunito", ls: "-0.03em" });
const LF = 150, LBASE = 520 + 0.705 * LF;
const LTXT = "background:linear-gradient(95deg,#FFFFFF,#E9ECF1 50%,#A7AFBA);-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:.14em;margin-bottom:-.14em";
const logo = mLogo(CT, { F: LF, base: LBASE, fill: "#FFFFFF,#E3E7ED,#A7AFBA", text: LTXT, glow: "drop-shadow(0 10px 44px rgba(120,165,255,.35))" });
const bot = $(`<div class="abs" style="left:0;right:0;top:${Math.round(LBASE + 70)}px;text-align:center"><div style="display:inline-flex;align-items:center;gap:16px;padding:24px 48px;border-radius:999px;background:#2F6BFF;font:700 48px/1 'Onest';color:#fff;box-shadow:0 18px 50px rgba(47,107,255,.4)">
  <svg width="46" height="46" viewBox="0 0 24 24"><path d="M3 11.5 20 4.5l-3 15-5-4-3 3 .4-4.6L17 7.5 8 13z" fill="#fff"/></svg>@MintlyAppbot</div></div>`);
CT.appendChild(bot);
function drawCT(t) {
  words(ct1, t, 58.0); words(ct2, t, 58.6, { stag: 0.16 });
  logo.at(t, 60.2);
  const bk = E.soft(prog(t, 61.4, 62.1)); S(bot, { o: clamp(bk * 1.4), y: (1 - bk) * 30, s: 0.94 + 0.06 * bk });
}

// ================= КАДР =================
window.renderAt = (t) => {
  for (const sc of scenes) {
    const on = t >= sc.a - 0.001 && t <= sc.b + 0.001;
    sc.el.style.display = on ? "block" : "none";
    if (on) sc.draw(t);
  }
  // прожектор: поворот к рисунку + лёгкое «дыхание» яркости
  const ax = aimAt(t), ang = Math.atan2(ax - 960, 1180) * 180 / Math.PI;
  beam.style.transform = `rotate(${(-ang).toFixed(3)}deg)`; beamCore.style.transform = `rotate(${(-ang * 0.96).toFixed(3)}deg)`;
  beam.style.opacity = (0.88 + 0.12 * Math.sin(t * 1.1)).toFixed(3);
  pool.style.transform = `translate(${(ax - 550).toFixed(1)}px,815px)`;
  // пылинки плывут вверх внутри луча
  dust.forEach((d) => {
    const [a, b, c, e] = d.p, life = (t * (0.035 + 0.04 * c) + a) % 1, y = 1000 - life * 980;
    const spread = (y + 160) / 1320 * 620, x = ax + (b - 0.5) * 2 * spread * 0.9 + Math.sin(t * 0.6 + e * 9) * 18;
    d.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    d.style.opacity = (Math.sin(life * Math.PI) * (0.25 + 0.5 * e)).toFixed(3);
  });
  // волна: амплитуда «дышит» в такт, к краям затухает
  const amp = 14 + 10 * Math.abs(Math.sin(t * 1.9)) + 6 * Math.sin(t * 5.3);
  let pts = "";
  for (let i = 0; i <= WN; i++) { const x = i / WN, env = Math.sin(Math.PI * x); pts += `${(x * 1920).toFixed(0)},${(40 + Math.sin(x * 60 + t * 7) * Math.sin(x * 23 - t * 3) * amp * env).toFixed(1)} `; }
  wave.querySelector("#wl").setAttribute("points", pts);
  // перелив градиентного текста непрерывен по строке
  for (const s of gradSpans) { if (s.ox == null && s.offsetWidth) s.ox = s.offsetLeft; s.style.backgroundPosition = `${(-t * 150 - (s.ox || 0)).toFixed(1)}px 0`; }
  document.getElementById("fade").style.opacity = Math.max(1 - E.out(prog(t, 0, 0.5)), E.io(prog(t, 63.35, 64)));
};
Promise.all([document.fonts.ready]).then(() => { window.renderAt(0); window.ready = true; });
