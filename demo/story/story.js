// Mintly · история про первые монеты. Горизонтальный ролик 16:9, 48 с.
// Сюжет: монетный двор в кармане → до монет платили товаром и взвешивали металл →
// в Лидии на металл поставили печать (to mint — чеканить) → сосед лидийцев Фалес
// по звёздам предсказал урожай и заранее снял все маслодавильни → пришёл раньше
// остальных → сегодня монету чеканят за минуту, на бондинг-кривой первые
// заходят дешевле → Mintly.
// Древняя часть — гравюры (public domain) на пергаменте, современная — в стиле
// Mintly: чёрный фон, синие пятна, белые заголовки с синим переливом, лого из M.
// Кадр зависит только от t — renderAt(t) можно звать в любом порядке.
"use strict";
const DUR = 48;
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
  inQ: (k) => k * k * k,
  soft: (k) => { const c = 0.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
};
function S(el, { o = 1, x = 0, y = 0, s = 1, r = 0, b = 0 } = {}) {
  el.style.opacity = o;
  el.style.visibility = o > 0.002 ? "visible" : "hidden";
  el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${r.toFixed(3)}deg) scale(${s.toFixed(4)})`;
  el.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none";
}
// окно видимости сцены: вне [a, b] сцена не рисуется вовсе
const scenes = [];
function scene(parent, a, b, draw) { const el = $(`<div class="scene" style="visibility:visible;display:none"></div>`); parent.appendChild(el); scenes.push({ el, a, b, draw }); return el; }

// ---- кинетическая строка: слова по одному, *слово* — акцентом ----
function mkLine(parent, text, { left = null, top, size, weight = 600, color = "#FFFFFF", font = "Onest", ls = "-0.02em", paper = false }) {
  const pos = left == null ? "left:0;right:0;text-align:center" : `left:${left}px`;
  const el = $(`<div class="abs" style="${pos};top:${top}px;font:${weight} ${size}px/1.15 '${font}';letter-spacing:${ls};color:${color};white-space:nowrap"></div>`);
  const g = !paper && /^#fff(fff)?$/i.test(color);
  const spans = text.split(" ").map((w) => { const acc = w.includes("*"); const cls = acc ? (paper ? " bi" : " accent") : g ? " grad" : ""; return $(`<span class="w${cls}">${w.replace(/\*/g, "")}</span>`); });
  spans.forEach((s, i) => { el.appendChild(s); if (i < spans.length - 1) el.appendChild(document.createTextNode(" ")); });
  parent.appendChild(el); el.spans = spans; return el;
}
function words(l, t, a, { stag = 0.08, dur = 0.9, out = null, outDur = 0.5, rise = 26 } = {}) {
  l.spans.forEach((w, i) => {
    const k = E.outQ(prog(t, a + i * stag, a + i * stag + dur));
    let o = k, y = (1 - k) * rise, b = (1 - k) * 12, s = 1;
    if (out != null) { const q = E.io(prog(t, out + i * 0.035, out + i * 0.035 + outDur)); o *= 1 - q; b += q * 14; y -= q * 16; s = 1 + q * 0.04; }
    S(w, { o, y, b, s });
  });
}
// несколько строк одной репликой: каждая следующая чуть позже
function block(parent, lines, opt) { return lines.map((tx, i) => mkLine(parent, tx, { ...opt, top: opt.top + i * opt.size * 1.2 })); }
function blockAt(ls, t, a, { out = null, gap = 0.22 } = {}) { ls.forEach((l, i) => words(l, t, a + i * gap, { out: out == null ? null : out + i * 0.06 })); }

// плашка-подпись: проявляется слева направо, как вычерченная
function mkTag(parent, text, { left = null, top }) {
  const wrap = $(`<div class="abs" style="${left == null ? "left:0;right:0;text-align:center" : `left:${left}px`};top:${top}px"></div>`);
  const tg = $(`<div class="tag">${text}</div>`); wrap.appendChild(tg); parent.appendChild(wrap); return tg;
}
function tagAt(tg, t, a, out = null) {
  const k = E.io(prog(t, a, a + 0.55)), q = out == null ? 0 : E.io(prog(t, out, out + 0.4));
  tg.style.clipPath = `inset(-4px ${((1 - k) * 100).toFixed(2)}% -4px 0)`;
  tg.style.opacity = 1 - q;
}

// ================= СЛОИ =================
// 1) современный фон: чёрный, по нему плывут синие пятна (радиальные градиенты — без blur)
const BG = $(`<div class="layer" style="background:#000"></div>`); root.appendChild(BG);
const blobs = [[300, 240, 520, "18,62,156"], [1640, 230, 480, "14,52,128"], [960, 1120, 680, "20,80,184"], [1540, 900, 460, "11,47,115"], [360, 920, 480, "16,58,140"], [960, 400, 380, "10,37,96"]]
  .map(([x, y, r, c]) => { const b = $(`<div class="blob" style="left:${x - r}px;top:${y - r}px;width:${r * 2}px;height:${r * 2}px;background:radial-gradient(circle,rgba(${c},.85) 0%,rgba(${c},.45) 38%,rgba(${c},0) 70%)"></div>`); BG.appendChild(b); return b; });
const MOD = $(`<div class="layer"></div>`); root.appendChild(MOD);
// 2) пергамент поверх: открывается кругом из монеты и схлопывается в точку
const PAPER = $(`<div class="layer" style="visibility:hidden"><img src="assets/ink/paper.jpg" class="abs" style="left:0;top:0;width:1920px;height:1080px"/></div>`); root.appendChild(PAPER);

// ============ A · ХУК 0–6: монетный двор в кармане ============
const M_PATH = "M300 218 L627 660 L955 218 L1080 988 L886 988 L836 610 L627 910 L418 610 L369 988 L173 988 Z";
const A = scene(MOD, 0, 6.1, drawA);
const aL1 = mkLine(A, "У тебя в кармане —", { left: 170, top: 360, size: 80, weight: 600 });
const aL2 = mkLine(A, "*монетный двор*", { left: 166, top: 460, size: 124, weight: 800, font: "Nunito", ls: "-0.03em" });
const aL3 = mkLine(A, "Когда-то для этого", { left: 170, top: 380, size: 80, weight: 600 });
const aL4 = mkLine(A, "нужен был *царь*", { left: 170, top: 480, size: 80, weight: 600 });
// телефон линиями: контур, монета с M, кнопка «Создать монету»
const PH_X = 1160, PH_Y = 130;
const phone = $(`<svg class="abs" style="left:${PH_X}px;top:${PH_Y}px;overflow:visible" width="400" height="820" viewBox="0 0 400 820" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5A8CFF"/><stop offset="1" stop-color="#1F55E0"/></linearGradient></defs>
  <rect class="d" pathLength="1" x="4" y="4" width="392" height="812" rx="64" stroke="#fff" stroke-width="3" stroke-opacity=".9"/>
  <rect class="d" pathLength="1" x="150" y="26" width="100" height="30" rx="15" stroke="#fff" stroke-width="2.5" stroke-opacity=".6"/>
  <rect class="d" pathLength="1" x="44" y="100" width="130" height="14" rx="7" stroke="#fff" stroke-width="2" stroke-opacity=".35"/>
  <rect class="d" pathLength="1" x="300" y="96" width="56" height="22" rx="11" stroke="#fff" stroke-width="2" stroke-opacity=".35"/>
  <g id="coin"><circle id="coinFill" cx="200" cy="330" r="112" fill="url(#cg)" opacity="0"/>
    <circle class="d" pathLength="1" cx="200" cy="330" r="112" stroke="#fff" stroke-width="3"/>
    <circle class="d" pathLength="1" cx="200" cy="330" r="94" stroke="#fff" stroke-width="2" stroke-opacity=".4"/>
    <g transform="translate(140 279) scale(${(120 / 907).toFixed(5)}) translate(-173 -218)"><path id="coinM" class="d" pathLength="1" d="${M_PATH}" stroke="#fff" stroke-width="22" fill="#fff" fill-opacity="0"/></g>
    <circle id="ring" cx="200" cy="330" r="112" stroke="#8DB2FF" stroke-width="3" opacity="0"/></g>
  <rect class="d" pathLength="1" x="110" y="482" width="180" height="18" rx="9" stroke="#fff" stroke-width="2" stroke-opacity=".5"/>
  <rect class="d" pathLength="1" x="145" y="516" width="110" height="14" rx="7" stroke="#fff" stroke-width="2" stroke-opacity=".3"/>
  <rect id="btnFill" x="50" y="640" width="300" height="88" rx="44" fill="#2F6BFF" opacity="0"/>
  <rect class="d" pathLength="1" x="50" y="640" width="300" height="88" rx="44" stroke="#5A8CFF" stroke-width="3"/>
  <text id="btnTx" x="200" y="694" text-anchor="middle" fill="#fff" stroke="none" style="font:600 29px 'Onest';opacity:0">Создать монету</text>
  <circle id="tap" cx="200" cy="684" r="34" fill="#fff" fill-opacity=".35" stroke="#fff" stroke-opacity=".8" stroke-width="2" opacity="0"/>
</svg>`);
A.appendChild(phone);
const phD = [...phone.querySelectorAll(".d")];
phD.forEach((p) => { p.style.strokeDasharray = "1 1"; });
const toast = $(`<div class="abs" style="left:${PH_X + 200 - 190}px;top:0;width:380px;height:74px;border-radius:24px;background:#111318;border:1px solid rgba(255,255,255,.14);display:flex;align-items:center;gap:16px;padding:0 22px;font:600 27px 'Onest'">
  <span style="width:38px;height:38px;border-radius:12px;background:rgba(63,120,255,.2);display:flex;align-items:center;justify-content:center"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8DB2FF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>Монета создана</div>`);
A.appendChild(toast);
function drawA(t) {
  // контур рисуется линией, детали — с небольшой задержкой
  phD.forEach((p, i) => { const k = E.io(prog(t, 0.25 + i * 0.09, 1.25 + i * 0.09)); p.style.strokeDashoffset = (1 - k).toFixed(4); });
  const tx = E.out(prog(t, 1.3, 1.7)); phone.querySelector("#btnTx").style.opacity = tx;
  // касание кнопки и «чеканка»: монета заливается синим, M — белой, круг расходится
  const tp = prog(t, 2.2, 2.65); const tap = phone.querySelector("#tap");
  tap.setAttribute("opacity", tp > 0 && tp < 1 ? ((1 - tp) * 0.9).toFixed(3) : 0); tap.setAttribute("r", (24 + 22 * E.out(tp)).toFixed(1));
  phone.querySelector("#btnFill").setAttribute("opacity", (E.out(prog(t, 2.25, 2.5)) * 0.95).toFixed(3));
  const st = prog(t, 2.45, 2.9);
  phone.querySelector("#coinFill").setAttribute("opacity", E.out(st).toFixed(3));
  phone.querySelector("#coinM").setAttribute("fill-opacity", E.out(st).toFixed(3));
  const sc = 1 + 0.16 * Math.sin(Math.PI * clamp(st * 1.4)) * (1 - st);
  phone.querySelector("#coin").setAttribute("transform", `translate(200 330) scale(${sc.toFixed(4)}) translate(-200 -330)`);
  const rg = prog(t, 2.5, 3.2), ring = phone.querySelector("#ring");
  ring.setAttribute("opacity", rg > 0 && rg < 1 ? (1 - rg).toFixed(3) : 0); ring.setAttribute("r", (112 + 80 * E.out(rg)).toFixed(1));
  const tk = E.outQ(prog(t, 2.75, 3.25)), tq = E.io(prog(t, 4.3, 4.7));
  S(toast, { o: tk * (1 - tq), y: lerp(14, 40, tk) });
  // телефон чуть парит; перед переходом камера наезжает на монету
  const zoom = E.inQ(prog(t, 4.9, 6.0));
  S(phone, { o: 1, y: Math.sin(t * 1.3) * 6, s: 1 + zoom * 0.5 });
  phone.style.transformOrigin = "200px 330px";
  words(aL1, t, 0.3, { out: 3.2 }); words(aL2, t, 0.75, { out: 3.3, stag: 0.12 });
  words(aL3, t, 3.6, { out: 5.3 }); words(aL4, t, 3.9, { out: 5.4 });
}

// ============ B · ПЕРГАМЕНТ 5.2–32.3 ============
// гравюра + плашка + реплика; стороны чередуются, чтобы кадры не повторялись
const IMG = { thales: [688, 1100], market: [1184, 1100], goldweigher: [915, 1100], astro1: [637, 1100], press_nova: [1482, 1100], press_robert: [1391, 1100] };
function engr({ a, b, img, side, h, top, tag, says, sayAt, size = 66, kb = [0, 0] }) {
  const [iw, ih] = IMG[img], w = Math.round(h * iw / ih);
  const x = side === "L" ? (side === "L" ? 150 : 0) : 1920 - 150 - w;
  const y = top == null ? (1080 - h) / 2 : top;
  const colX = side === "L" ? x + w + 110 : 160;
  const el = scene(PAPER, a, b, draw);
  const pic = $(`<div class="abs" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><img src="assets/ink/${img}.png" style="width:100%;height:100%;display:block"/></div>`);
  el.appendChild(pic);
  const tg = mkTag(el, tag, { left: colX, top: 318 });
  const groups = says.map((ls) => block(el, ls, { left: colX, top: 420, size, weight: 600, color: "#221B13", paper: true }));
  function draw(t) {
    // наплыв: проявляется из бумаги, уходит в бумагу; лёгкий наезд камеры
    const k = E.out(prog(t, a, a + 0.8)), q = E.io(prog(t, b - 0.6, b));
    el.style.opacity = k * (1 - q);
    const kk = prog(t, a, b);
    S(pic, { o: 1, s: 1.0 + 0.055 * kk, x: kb[0] * kk, y: kb[1] * kk });
    tagAt(tg, t, a + 0.3);
    groups.forEach((g, i) => { const nx = sayAt[i + 1]; blockAt(g, t, sayAt[i], { out: nx == null ? null : nx - 0.55 }); });
  }
  return el;
}
engr({ a: 5.4, b: 8.9, img: "market", side: "L", h: 860, tag: "До появления монет", says: [["Платили зерном,", "скотом и кусками", "*металла*"]], sayAt: [6.0], kb: [10, -6] });
engr({ a: 8.5, b: 11.9, img: "goldweigher", side: "R", h: 900, tag: "Каждый кусок взвешивали", says: [["Сделка тянулась часами —", "и всё равно могли", "*обмануть*"]], sayAt: [9.1], kb: [-12, 0] });

// ---- B3 · монеты Лидии 11.5–15.3 ----
const B3 = scene(PAPER, 11.5, 15.3, drawB3);
const b3tag = mkTag(B3, "Лидия · около 600 г. до н. э.", { top: 96 });
const coins = [["coin_dog", 700], ["coin_punch", 1220]].map(([n, cx]) => {
  const sh = $(`<div class="abs" style="left:${cx - 200}px;top:640px;width:400px;height:70px;border-radius:50%;background:radial-gradient(closest-side,rgba(60,40,15,.35),rgba(60,40,15,0))"></div>`);
  const im = $(`<img class="abs" src="assets/ink/${n}.png" style="left:${cx - 230}px;top:190px;width:460px;height:460px"/>`);
  B3.append(sh, im); return { im, sh };
});
const b3cap = mkLine(B3, "электрум — природный сплав золота и серебра", { top: 718, size: 32, weight: 500, color: "#6B5A43", paper: true, ls: "0.01em" });
const b3say = block(B3, ["Лидийцы поставили на металл *печать* —", "так появились первые монеты"], { top: 790, size: 62, weight: 600, color: "#221B13", paper: true });
function drawB3(t) {
  const k = E.out(prog(t, 11.5, 12.2)), q = E.io(prog(t, 14.8, 15.3));
  B3.style.opacity = k * (1 - q);
  tagAt(b3tag, t, 11.8);
  coins.forEach(({ im, sh }, i) => {
    // монета «падает» на бумагу с лёгким перелётом, потом медленно покачивается
    const c = E.soft(prog(t, 11.75 + i * 0.28, 12.55 + i * 0.28));
    const fl = Math.sin((t - 12) * 1.6 + i * 1.7);
    S(im, { o: clamp(c * 1.5), s: lerp(1.35, 1, c), y: lerp(-60, 0, c) + fl * 5, r: lerp(i ? 14 : -14, 0, c) + fl * 1.6 });
    S(sh, { o: clamp(c * 1.5) * 0.9, s: 0.9 + 0.1 * c });
  });
  words(b3cap, t, 12.9, { stag: 0.03 });
  blockAt(b3say, t, 13.15, { gap: 0.3 });
}

// ---- B4 · слово MINT печатается штампом 14.9–18.0 ----
const B4 = scene(PAPER, 14.9, 18.0, drawB4);
const b4tag = mkTag(B4, "Запомни это слово", { top: 180 });
const b4l = mkLine(B4, "Чеканить по-английски —", { top: 300, size: 70, weight: 600, color: "#221B13", paper: true });
const stamp = $(`<div class="abs" style="left:0;right:0;top:430px;text-align:center"><div style="display:inline-block;position:relative;padding:6px 64px 26px;border:9px solid #2347C4;border-radius:38px;color:#2347C4;font:800 300px/1 'Nunito';letter-spacing:.04em">MINT</div></div>`);
B4.appendChild(stamp);
const stampIn = stamp.firstElementChild;
function drawB4(t) {
  const k = E.out(prog(t, 14.9, 15.5)), q = E.io(prog(t, 17.5, 18.0));
  B4.style.opacity = k * (1 - q);
  tagAt(b4tag, t, 15.1); words(b4l, t, 15.35);
  // удар штампа: падает сверху крупным и размытым, на касании — короткая дрожь
  const T0 = 16.05, d = prog(t, T0, T0 + 0.2), sh = prog(t, T0 + 0.2, T0 + 0.6);
  const jit = sh > 0 && sh < 1 ? Math.sin(sh * 44) * 7 * (1 - sh) : 0;
  S(stamp, { o: clamp(d * 3), s: lerp(2.1, 1, E.inQ(d)), b: (1 - d) * 16, x: jit, y: jit * 0.4 });
  stampIn.style.opacity = (0.9 + 0.1 * Math.sin(t * 9) * (1 - clamp(sh * 2))).toFixed(3);
}

engr({ a: 17.6, b: 21.4, img: "thales", side: "L", h: 940, tag: "Фалес Милетский", says: [["Сосед лидийцев", "и первый философ", "Греции"], ["Его упрекали:", "«мудрый, а *бедный*»"]], sayAt: [18.2, 19.75], size: 72, kb: [6, -8] });
engr({ a: 21.0, b: 24.3, img: "astro1", side: "R", h: 940, tag: "Он читал звёзды", says: [["Ещё зимой понял:", "летом будет небывалый", "урожай *олив*"]], sayAt: [21.6], size: 68, kb: [0, -10] });
engr({ a: 23.9, b: 27.2, img: "press_nova", side: "L", h: 760, tag: "Зима · всё за бесценок", says: [["Заранее снял", "все *маслодавильни*", "Милета и Хиоса"]], sayAt: [24.5], size: 64, kb: [-14, 0] });
engr({ a: 26.8, b: 30.0, img: "press_robert", side: "R", h: 760, tag: "Пришёл урожай", says: [["Давильни нужны", "были всем —", "и цену назначал", "уже *он*"]], sayAt: [27.4], size: 64, kb: [12, 0] });

// ---- B9 · мораль 29.6–32.4, потом пергамент схлопывается в точку ----
const B9 = scene(PAPER, 29.6, 32.4, drawB9);
const b9tag = mkTag(B9, "Аристотель · «Политика»", { top: 250 });
const b9a = mkLine(B9, "Так философ разбогател.", { top: 360, size: 66, weight: 600, color: "#221B13", paper: true });
const b9b = mkLine(B9, "Он просто пришёл", { top: 470, size: 92, weight: 700, color: "#221B13", paper: true });
const b9c = mkLine(B9, "*раньше остальных*", { top: 580, size: 128, weight: 800, font: "Nunito", color: "#221B13", paper: true, ls: "-0.03em" });
function drawB9(t) {
  const k = E.out(prog(t, 29.6, 30.3)); B9.style.opacity = k;
  tagAt(b9tag, t, 29.8); words(b9a, t, 30.0); words(b9b, t, 30.55); words(b9c, t, 30.95, { stag: 0.14 });
}

// ============ C · СЕГОДНЯ 31.8–42.6 ============
// C1 · чеканка за минуту: четыре шага линиями
const C1 = scene(MOD, 31.8, 36.1, drawC1);
const c1t = mkLine(C1, "Сегодня монету чеканят *за минуту*", { top: 250, size: 92, weight: 700 });
const ICONS = [
  ["Название", `<path d="M5 6h14M12 6v13"/><path d="M8 19h8"/>`],
  ["Тикер", `<circle cx="12" cy="12" r="9"/><path d="M15 8.6c-.6-.9-1.7-1.4-3-1.4-1.8 0-3 .9-3 2.3 0 3.1 6.2 1.7 6.2 4.9 0 1.4-1.3 2.4-3.2 2.4-1.4 0-2.6-.6-3.2-1.6M12 5.5v1.7M12 16.7v1.8"/>`],
  ["Картинка", `<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>`],
  ["Запуск", `<path d="M12 3c3 2 4.6 5.6 4.2 9.6L14 15h-4l-2.2-2.4C7.4 8.6 9 5 12 3z"/><circle cx="12" cy="9.5" r="1.6"/><path d="M9.6 15.2 8 19l2.6-1.2M14.4 15.2 16 19l-2.6-1.2M12 17v4"/>`],
];
const c1i = ICONS.map(([lb, d], i) => {
  const cx = 540 + i * 280, last = i === ICONS.length - 1, col = last ? "#5A8CFF" : "#FFFFFF";
  const box = $(`<div class="abs" style="left:${cx - 115}px;top:450px;width:230px;height:330px;text-align:center">
    <svg width="230" height="230" viewBox="0 0 170 170" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <circle class="ring" pathLength="1" cx="85" cy="85" r="80" stroke="${col}" stroke-opacity="${last ? 0.9 : 0.3}" stroke-width="2.5"/>
      <g transform="translate(43 43) scale(3.5)" stroke="${col}" stroke-width=".72">${d.replace(/<(path|circle|rect)/g, '<$1 pathLength="1" class="ic"')}</g></svg>
    <div style="margin-top:24px;font:600 38px 'Onest';color:${last ? "#8DB2FF" : "#C4C8D2"}">${lb}</div></div>`);
  C1.appendChild(box); box.querySelectorAll(".ring,.ic").forEach((p) => { p.style.strokeDasharray = "1 1"; });
  return box;
});
function drawC1(t) {
  const q = E.io(prog(t, 35.6, 36.1)); C1.style.opacity = 1 - q;
  words(c1t, t, 32.2);
  c1i.forEach((box, i) => {
    const a = 32.9 + i * 0.32, k = E.outQ(prog(t, a, a + 0.7));
    S(box, { o: clamp(k * 2), y: (1 - k) * 30 });
    box.querySelectorAll(".ring,.ic").forEach((p, j) => { p.style.strokeDashoffset = (1 - E.io(prog(t, a + j * 0.06, a + 0.8 + j * 0.06))).toFixed(4); });
  });
}

// C2 · бондинг-кривая: цена растёт с каждой покупкой
const C2 = scene(MOD, 35.7, 39.6, drawC2);
const c2t = mkLine(C2, "Каждая покупка *поднимает цену*", { top: 96, size: 86, weight: 700 });
const c2s = mkLine(C2, "кто заходит первым — платит меньше всех", { top: 212, size: 46, weight: 500, color: "#9AA1AE" });
const CX0 = 430, CY0 = 330, CW = 1060, CH = 580;
const price = (x) => 0.06 + 0.9 * Math.pow(x, 2.2);
const cpts = Array.from({ length: 81 }, (_, i) => { const x = i / 80; return [x * CW, CH - price(x) * CH]; });
const cpath = "M" + cpts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L");
const chart = $(`<svg class="abs" style="left:${CX0}px;top:${CY0}px;overflow:visible" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}" fill="none">
  <defs><linearGradient id="cl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8DB2FF"/><stop offset="1" stop-color="#2F6BFF"/></linearGradient>
  <linearGradient id="ca" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F6BFF" stop-opacity=".35"/><stop offset="1" stop-color="#2F6BFF" stop-opacity="0"/></linearGradient>
  <clipPath id="cc"><rect id="ccr" x="0" y="-40" width="0" height="${CH + 80}"/></clipPath></defs>
  <path class="ax" pathLength="1" d="M0 0 V${CH} H${CW}" stroke="#fff" stroke-opacity=".28" stroke-width="2.5"/>
  <g clip-path="url(#cc)"><path d="${cpath} L${CW} ${CH} L0 ${CH} Z" fill="url(#ca)"/></g>
  <path id="cglow" d="${cpath}" stroke="#2F6BFF" stroke-opacity=".35" stroke-width="16" stroke-linecap="round" pathLength="1"/>
  <path id="cline" d="${cpath}" stroke="url(#cl)" stroke-width="6" stroke-linecap="round" pathLength="1"/>
  <g id="pulses"></g>
  <circle id="cdot" r="13" fill="#fff" stroke="#2F6BFF" stroke-width="5"/>
  <text x="-14" y="-18" fill="#9AA1AE" style="font:500 32px 'Onest'" id="lbP">цена</text>
  <text x="${CW}" y="${CH + 46}" text-anchor="end" fill="#9AA1AE" style="font:500 32px 'Onest'" id="lbB">покупки →</text>
</svg>`);
C2.appendChild(chart);
const BUYS = [0.12, 0.3, 0.48, 0.64, 0.79, 0.92];
const pulseG = chart.querySelector("#pulses");
const pulses = BUYS.map(() => { const c = document.createElementNS("http://www.w3.org/2000/svg", "circle"); c.setAttribute("fill", "none"); c.setAttribute("stroke", "#8DB2FF"); c.setAttribute("stroke-width", "3"); pulseG.appendChild(c); return c; });
const early = $(`<div class="abs" style="left:${CX0 + 40}px;top:${CY0 + CH - 170}px;font:600 36px 'Onest';color:#8DB2FF;white-space:nowrap">← первые здесь</div>`);
C2.appendChild(early);
const ax = chart.querySelector(".ax"); ax.style.strokeDasharray = "1 1";
["#cline", "#cglow"].forEach((s) => { chart.querySelector(s).style.strokeDasharray = "1 1"; });
const ptOn = (p) => { const x = p, y = price(x); return [x * CW, CH - y * CH]; };
function drawC2(t) {
  const k = E.out(prog(t, 35.7, 36.2)), q = E.io(prog(t, 39.1, 39.6)); C2.style.opacity = k * (1 - q);
  words(c2t, t, 35.9); words(c2s, t, 36.35, { stag: 0.04 });
  ax.style.strokeDashoffset = 1 - E.io(prog(t, 36.0, 36.7));
  const dr = E.io(prog(t, 36.4, 38.6));
  chart.querySelector("#cline").style.strokeDashoffset = (1 - dr).toFixed(4);
  chart.querySelector("#cglow").style.strokeDashoffset = (1 - dr).toFixed(4);
  chart.querySelector("#ccr").setAttribute("width", (dr * CW).toFixed(1));
  const [dx, dy] = ptOn(dr), dot = chart.querySelector("#cdot");
  dot.setAttribute("cx", dx.toFixed(1)); dot.setAttribute("cy", dy.toFixed(1)); dot.setAttribute("opacity", clamp(dr * 20).toFixed(2));
  // на каждой «покупке» точка оставляет расходящееся кольцо
  BUYS.forEach((b, i) => {
    const tb = 36.4 + 2.2 * b, pk = prog(t, tb, tb + 0.7), [px, py] = ptOn(b), c = pulses[i];
    c.setAttribute("cx", px.toFixed(1)); c.setAttribute("cy", py.toFixed(1)); c.setAttribute("r", (10 + 34 * E.out(pk)).toFixed(1));
    c.setAttribute("opacity", pk > 0 && pk < 1 ? ((1 - pk) * 0.9).toFixed(3) : 0);
  });
  ["#lbP", "#lbB"].forEach((s) => { chart.querySelector(s).style.opacity = E.out(prog(t, 36.5, 37.0)); });
  const ek = E.outQ(prog(t, 37.0, 37.6)); S(early, { o: ek, x: (1 - ek) * -20 });
}

// C3 · три строки без повторов, последняя заканчивается буквой M
const C3 = scene(MOD, 39.4, 42.9, drawC3);
const C3X = 470;
const c3a = mkLine(C3, "Лидийцам нужен был царь.", { left: C3X, top: 330, size: 84, weight: 700 });
const c3b = mkLine(C3, "Фалесу — звёзды.", { left: C3X, top: 450, size: 84, weight: 700 });
const c3c = mkLine(C3, "А тебе —", { left: C3X, top: 570, size: 84, weight: 700 });
function drawC3(t) {
  words(c3a, t, 39.6, { out: 41.75 }); words(c3b, t, 40.15, { out: 41.8 }); words(c3c, t, 40.7, { out: 41.85 });
}

// ============ D · ЛОГОТИП И ПРИЗЫВ 41.0–48 ============
// лого: M сначала стоит в конце строки «А тебе —», потом едет в центр и растёт,
// а «intly» выходит из-под неё — тот же приём, что в прошлом промо
let mLogoN = 0;
function mLogo(parent, { F, base, fill, text, glow = "none", tail = "intly" }) {
  const id = "mg" + mLogoN++, capH = 0.705 * F, mW = capH * 907 / 770;
  const grad = fill.split(",");
  const m = $(`<svg class="abs" style="left:0;top:0;width:${mW.toFixed(1)}px;height:${capH.toFixed(1)}px;overflow:visible;transform-origin:50% 50%;filter:${glow}" viewBox="173 218 907 770">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${grad.map((c, i) => `<stop offset="${i / Math.max(1, grad.length - 1)}" stop-color="${c}"/>`).join("")}</linearGradient></defs>
    <path d="${M_PATH}" fill="url(#${id})"/></svg>`);
  const row = $(`<div class="abs" style="left:0;top:${(base - 0.829 * F).toFixed(1)}px;font:800 ${F}px/1 'Nunito';letter-spacing:-0.04em;white-space:nowrap;clip-path:inset(-40% -10% -40% 0)"></div>`);
  const inner = $(`<div style="display:inline-block"></div>`); row.appendChild(inner);
  const sp = [...tail].map((ch) => { const e = $(`<span style="display:inline-block;${text}">${ch}</span>`); inner.appendChild(e); return e; });
  const box = $(`<div class="abs" style="left:0;top:0;width:1920px;height:1080px"></div>`);
  box.append(row, m); parent.appendChild(box);
  const o = { m, row, sp, F, base, capH, mW, box };
  const slide = (t, t1, dur) => {
    const q = E.io(prog(t, t1, t1 + dur)), rv = q * (o.w + 0.1 * F);
    row.style.clipPath = `inset(-40% ${Math.max(0, o.w - rv).toFixed(1)}px -40% 0)`;
    sp.forEach((e, i) => { const lk = E.out(clamp((rv - o.offs[i]) / (o.ws[i] * 1.4))); S(e, { o: clamp(lk * 1.6), x: -(1 - lk) * o.ws[i] * 0.7, b: (1 - lk) * 4 }); });
  };
  o.measure = () => {
    if (o.w) return;
    const rw = row.offsetWidth; if (!rw) return;
    o.w = rw; o.offs = sp.map((e) => e.offsetLeft - inner.offsetLeft); o.ws = sp.map((e) => e.offsetWidth);
    o.gap = 0.035 * F; o.total = mW + o.gap + rw;
  };
  o.atFrom = (t, t0, tMove, { fromX, fromY, fromS }) => {
    o.measure(); if (!o.w) return;
    const L = 960 - o.total / 2, mx = L + mW / 2, my = base - capH / 2;
    const a = E.outQ(prog(t, t0, t0 + 0.45));
    S(m, { o: a, x: mx - mW / 2, y: my - capH / 2, s: 0.88 + 0.12 * a, b: (1 - a) * 10 });
    row.style.left = (L + mW + o.gap).toFixed(1) + "px"; row.style.opacity = 1; row.style.filter = "none";
    const mv = E.io(prog(t, tMove, tMove + 0.8)), sc = lerp(fromS, 1, mv);
    box.style.transformOrigin = `${mx.toFixed(1)}px ${my.toFixed(1)}px`;
    box.style.transform = `translate(${((fromX - mx) * (1 - mv)).toFixed(2)}px,${((fromY - my) * (1 - mv)).toFixed(2)}px) scale(${sc.toFixed(4)})`;
    slide(t, tMove + 0.1, 0.5 + 0.045 * sp.length);
  };
  return o;
}
const D = scene(MOD, 40.9, 48, drawD);
const LF = 176, LBASE = 380 + 0.705 * LF / 2;
const LTXT = "background:linear-gradient(95deg,#FFFFFF,#E9ECF1 50%,#A7AFBA);-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:.14em;margin-bottom:-.14em";
const logo = mLogo(D, { F: LF, base: LBASE, fill: "#FFFFFF,#E3E7ED,#A7AFBA", text: LTXT, glow: "drop-shadow(0 10px 44px rgba(120,165,255,.35))" });
const dSub = mkLine(D, "мемкоины на TON — прямо в Telegram", { top: 505, size: 56, weight: 500, color: "#C9CDD6" });
const pills = $(`<div class="abs" style="left:0;right:0;top:622px;display:flex;justify-content:center;gap:24px"></div>`);
const pl = ["Создай свою монету", "Торгуй в пару касаний", "0% комиссии"].map((tx, i) => { const p = $(`<div class="pill${i === 2 ? " blue" : ""}">${tx}</div>`); pills.appendChild(p); return p; });
D.appendChild(pills);
const dC1 = mkLine(D, "Первую монету отчеканили 2600 лет назад.", { top: 520, size: 54, weight: 500, color: "#C9CDD6" });
const dC2 = mkLine(D, "*Следующую — отчеканишь ты.*", { top: 604, size: 96, weight: 800, font: "Nunito", ls: "-0.02em" });
const bot = $(`<div class="abs" style="left:0;right:0;top:780px;text-align:center"><div style="display:inline-flex;align-items:center;gap:14px;padding:22px 44px;border-radius:999px;background:#2F6BFF;font:700 44px/1 'Onest';color:#fff;box-shadow:0 18px 50px rgba(47,107,255,.35)">
  <svg width="42" height="42" viewBox="0 0 24 24"><path d="M3 11.5 20 4.5l-3 15-5-4-3 3 .4-4.6L17 7.5 8 13z" fill="#fff"/></svg>@MintlyAppbot</div></div>`);
D.appendChild(bot);
let fromPos = null;
function drawD(t) {
  // точка старта M — сразу за «А тебе —», по высоте строки
  // меряем строку, даже если её сцена уже скрыта (рендер кусками начинается с любого кадра)
  if (!fromPos) { const d0 = C3.style.display; C3.style.display = "block"; const w = c3c.offsetWidth; C3.style.display = d0; if (w) fromPos = { x: C3X + w + 34, y: 570 + 84 * 0.6 }; }
  const fs = 84 / LF;
  if (fromPos) logo.atFrom(t, 41.0, 41.9, { fromX: fromPos.x + logo.mW * fs / 2, fromY: fromPos.y, fromS: fs });
  words(dSub, t, 43.1, { out: 45.15 });
  pl.forEach((p, i) => { const k = E.outQ(prog(t, 43.6 + i * 0.16, 44.4 + i * 0.16)), q = E.io(prog(t, 45.2 + i * 0.04, 45.6 + i * 0.04)); S(p, { o: k * (1 - q), y: (1 - k) * 24 - q * 14, b: (1 - k) * 8 + q * 10 }); });
  words(dC1, t, 45.6, { stag: 0.05 }); words(dC2, t, 46.05, { stag: 0.1 });
  const bk = E.soft(prog(t, 46.6, 47.2)); S(bot, { o: clamp(bk * 1.4), y: (1 - bk) * 30, s: 0.94 + 0.06 * bk });
}

// ================= КАДР =================
window.renderAt = (t) => {
  for (const sc of scenes) {
    const on = t >= sc.a - 0.001 && t <= sc.b + 0.001;
    // display, а не visibility: дети с visibility:visible просвечивали бы сквозь скрытую сцену
    sc.el.style.display = on ? "block" : "none";
    if (on) sc.draw(t);
  }
  // пятна дышат и плывут
  blobs.forEach((b, i) => { S(b, { o: 0.75 + 0.25 * Math.sin(t * 0.5 + i), x: Math.sin(t * 0.21 + i * 1.3) * 70, y: Math.cos(t * 0.17 + i) * 50, s: 1 + 0.08 * Math.sin(t * 0.33 + i * 2) }); });
  // перелив градиентного текста едет по всем строкам одинаково
  const gp = `${(-t * 160).toFixed(1)}px 0`;
  document.querySelectorAll(".grad,.accent").forEach((e) => { e.style.backgroundPosition = gp; });
  // пергамент: круг раскрывается из монеты телефона и схлопывается в центр
  const op = E.io(prog(t, 5.0, 5.9)), cl = E.io(prog(t, 31.55, 32.35));
  let clip = null;
  if (t < 5.0 || t > 32.35) PAPER.style.visibility = "hidden";
  else {
    PAPER.style.visibility = "visible";
    if (op < 1) clip = `circle(${(op * 2300).toFixed(1)}px at ${PH_X + 200}px ${PH_Y + 330}px)`;
    else if (cl > 0) clip = `circle(${((1 - cl) * 1250).toFixed(1)}px at 960px 540px)`;
  }
  PAPER.style.clipPath = clip || "none";
  // общий вход из черноты и выход в черноту
  document.getElementById("fade").style.opacity = Math.max(1 - E.out(prog(t, 0, 0.45)), E.io(prog(t, 47.35, 48)));
};

// готовность: шрифты и все картинки загружены
Promise.all([document.fonts.ready, ...[...document.images].map((im) => im.decode().catch(() => {}))]).then(() => { window.renderAt(0); window.ready = true; });
