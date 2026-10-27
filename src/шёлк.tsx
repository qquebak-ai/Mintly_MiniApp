/* Шёлк приветствия сайта — общий для сайта и приложения: на сайте он
 * за приветствием, в приложении — за тарифами, окрашенный в цвет тарифа. */
import React, { useEffect, useRef } from "react";

const СВЕТЛАЯ = (() => { try { return localStorage.getItem("mintly_theme") === "White"; } catch { return false; } })();

// Окраска шёлка в приложении. Free — родной серый шёлк, без слоя.
const ТОНА_ШЁЛКА: Record<string, React.CSSProperties> = {
  pro: { background: "#2ED47A" },
  turbo: {
    background: "linear-gradient(115deg, #B79CFF, #5BE0C8, #FFB86B, #FF6FB5, #6C7CFF, #B79CFF)",
    backgroundSize: "300% 300%", animation: "шёлкПереливается 8s linear infinite",
  },
};
if (typeof document !== "undefined" && !document.getElementById("шёлк-стиль")) {
  const с = document.createElement("style");
  с.id = "шёлк-стиль";
  с.textContent = "@keyframes шёлкПереливается { from { background-position: 0% 50% } to { background-position: 300% 50% } }";
  document.head.appendChild(с);
}

/* Фон — «шёлк» из ролика Mintly один в один: три размытые ленты
   (серый край, светлая середина, белое ядро) по диагонали экрана, те же
   пути и градиенты, что в demo/built/built.js.
 *
 * В ролике ленты двигаются по времени, здесь — по прокрутке: каждой доле
 * страницы соответствует своё положение, поворот, масштаб и яркость, а
 * сверху лежит лёгкое «дыхание», как в ролике.
 *
 * Размытие SVG пересчитывалось бы на каждом кадре прокрутки, поэтому
 * шёлк рисуется один раз в холст (вместе с шумом против ступеней на
 * плавных переходах), а двигается уже готовая картинка — только
 * трансформацией, которую видеокарта делает бесплатно. */
const КАДР_Ш = 1920, КАДР_В = 1080, ЗАПАС = 1300;
// Холст — в половину разрешения: ленты размыты, разницы не видно, а
// полотно с продлёнными концами в полном размере весило бы 18 Мп.
const ПЛОТНОСТЬ = 0.5;
// Шёлк отодвинут вглубь: в ролике он на весь кадр, на сайте за текстом
// это слишком близко. Края лент гасит маска холста.
const ДАЛЬ = 0.58;
const ШЁЛК_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${(КАДР_Ш + 2 * ЗАПАС) * ПЛОТНОСТЬ}" height="${(КАДР_В + 2 * ЗАПАС) * ПЛОТНОСТЬ}" viewBox="${-ЗАПАС} ${-ЗАПАС} ${КАДР_Ш + 2 * ЗАПАС} ${КАДР_В + 2 * ЗАПАС}">
  <defs>
    <linearGradient id="sg1" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#222222"/><stop offset=".4" stop-color="#666666"/><stop offset=".62" stop-color="#ACACAC"/><stop offset=".8" stop-color="#575757"/><stop offset="1" stop-color="#3E3E3E"/></linearGradient>
    <linearGradient id="sg2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9F9F9F" stop-opacity="0"/><stop offset=".5" stop-color="#CECECE"/><stop offset="1" stop-color="#9F9F9F" stop-opacity="0"/></linearGradient>
    <filter id="sb" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="38"/></filter>
    <filter id="sb2" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="20"/></filter>
  </defs>
  <path filter="url(#sb)" fill="url(#sg1)" d="M-1500 2120L-300 1350C250 1050 520 760 860 560S1450 120 2200 -260L3400 -1030L3500 -610L2300 160C1650 430 1350 760 1000 920S380 1300 -200 1600L-1400 2370Z"/>
  <path filter="url(#sb)" fill="url(#sg1)" opacity=".75" d="M-900 2040L300 1400C620 1100 760 860 1060 700S1600 420 2250 360L3450 -280L3450 120L2250 760C1700 760 1420 880 1180 1040S760 1400 520 1500L-680 2140Z"/>
  <path filter="url(#sb2)" fill="url(#sg2)" opacity=".9" d="M-1080 2040L120 1250C520 980 700 760 940 620S1450 300 1950 40L3150 -750L3190 -680L1990 110C1500 380 1180 640 980 760S560 1100 220 1330L-980 2120Z"/>
  <path filter="url(#sb2)" fill="url(#sg2)" opacity=".7" d="M-640 1900L560 1300C800 1080 960 900 1180 800S1660 600 2050 560L3250 -40L3250 20L2050 620C1680 660 1400 760 1220 880S900 1150 660 1360L-540 1960Z"/>
</svg>`;

/* Положение шёлка по прокрутке: [доля страницы, яркость, сдвиг x, сдвиг y,
   масштаб, поворот]. Те же точки, что сцены ролика: полное свечение в
   начале, дальше лента уходит к краю за каждым разделом по очереди. */
const ШЁЛК_КЛЮЧИ = [
  // За разделами яркость ниже, как в «тёмных» сценах ролика: серый
  // текст на полном свечении не читался.
  [0, 1, 0, 0, 1, 0], [0.1, 0.42, -620, 300, 1.15, 4], [0.27, 0.38, 680, -160, 1.05, -3],
  [0.45, 0.36, 940, -340, 1.1, 2], [0.62, 0.4, -820, 0, 1.1, -4], [0.8, 0.36, -560, 260, 1.15, 3], [1, 0.5, 0, 160, 1.02, 0],
];
const плавно = (x) => x * x * (3 - 2 * x);
function поКлючам(т, К) {
  if (т <= К[0][0]) return К[0].slice(1);
  for (let i = 1; i < К.length; i++) {
    if (т <= К[i][0]) { const а = К[i - 1], б = К[i], к = плавно((т - а[0]) / (б[0] - а[0])); return а.slice(1).map((v, j) => v + (б[j + 1] - v) * к); }
  }
  return К[К.length - 1].slice(1);
}

/* тон — окраска для приложения: тот же шёлк, но цветной. Ленты всегда
   рисуются серыми, а цвет кладётся сверху слоем в режиме «цвет»: он
   берёт у шёлка яркость, а свой оттенок — так форма и свет остаются
   один в один, меняется только цвет. На чёрном слой ничего не красит.
   вОкне — шёлк внутри страницы приложения, без привязки к прокрутке. */
/* Шёлк рисуется один раз на всё приложение и хранится готовым холстом.
   Раньше каждое открытие тарифа заново собирало SVG, размывало его и
   сыпало шум по четырём миллионам точек — фон не успевал появиться.
   Теперь приложение готовит его заранее, в простое, а экран только
   копирует готовую картинку. */
let ждёмШёлк: Promise<HTMLCanvasElement> | null = null;
export function подготовитьШёлк(): Promise<HTMLCanvasElement> {
  if (ждёмШёлк) return ждёмШёлк;
  ждёмШёлк = new Promise((готово, отказ) => {
    const и = new Image();
    и.onload = () => {
      const к = document.createElement("canvas");
      к.width = и.width; к.height = и.height;
      const г = к.getContext("2d");
      г.drawImage(и, 0, 0);
      const д = г.getImageData(0, 0, к.width, к.height), п = д.data;
      for (let i = 0; i < п.length; i += 4) {
        if (!п[i + 3]) continue;
        const н = (Math.random() + Math.random() - 1) * 5;
        п[i] = Math.max(0, Math.min(255, п[i] + н)); п[i + 1] = Math.max(0, Math.min(255, п[i + 1] + н)); п[i + 2] = Math.max(0, Math.min(255, п[i + 2] + н));
      }
      г.putImageData(д, 0, 0);
      готово(к);
    };
    и.onerror = () => { ждёмШёлк = null; отказ(new Error("шёлк")); };
    и.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ШЁЛК_SVG);
  });
  return ждёмШёлк;
}

export function ФонШёлк({ тон = null, вОкне = false }: { тон?: string | null; вОкне?: boolean }) {
  const место = useRef<HTMLDivElement | null>(null);
  const обёртка = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let жив = true, кадр = 0, к: HTMLCanvasElement | null = null, м = 1;
    /* Размер и место холста зависят только от окна — их пишем при смене
       размера, а не в каждом кадре. Раньше ширина, высота и отступы
       огромного холста менялись шестьдесят раз в секунду, и браузер
       каждый раз пересчитывал раскладку — страница открывалась рывком. */
    const разместить = () => {
      if (!к) return;
      const вш = window.innerWidth, вв = window.innerHeight;
      /* В приложении экран узкий и высокий: «с обрезкой» кадр раздувался
         по высоте, и на экране оставался кусок одной ленты. Там шёлк
         отодвинут — кадр вписан по высоте вполовину, ленты видны целиком
         на чёрном. На сайте кадр 1920×1080 вписан «с обрезкой», как фон. */
      м = вОкне ? (вв / КАДР_В) * 0.55 : Math.max(вш / КАДР_Ш, вв / КАДР_В);
      const ох = (вш - КАДР_Ш * м) / 2, оу = (вв - КАДР_В * м) / 2;
      к.style.width = `${(КАДР_Ш + 2 * ЗАПАС) * м}px`;
      к.style.height = `${(КАДР_В + 2 * ЗАПАС) * м}px`;
      к.style.left = `${ох - ЗАПАС * м}px`;
      к.style.top = `${оу - ЗАПАС * м}px`;
      к.style.transformOrigin = `${(ЗАПАС + КАДР_Ш / 2) * м}px ${(ЗАПАС + КАДР_В / 2) * м}px`;
    };
    const начало = performance.now();
    const шаг = () => {
      if (к) {
        const вв = window.innerHeight;
        const всего = Math.max(1, document.documentElement.scrollHeight - вв);
        const [я, dx, dy, sc, поворот] = поКлючам(вОкне ? 0 : Math.min(1, window.scrollY / всего), ШЁЛК_КЛЮЧИ);
        const t = (performance.now() - начало) / 1000;
        // «Дыхание» из ролика — медленное покачивание поверх положения.
        const а = Math.sin(t * 0.5) * 3 + поворот, bx = Math.sin(t * 0.35) * 40 + dx, by = Math.cos(t * 0.42) * 26 + dy;
        к.style.transform = `translate3d(${bx * м * ДАЛЬ}px, ${by * м * ДАЛЬ}px, 0) rotate(${а}deg) scale(${ДАЛЬ * sc * (1 + 0.03 * Math.sin(t * 0.8))})`;
        к.style.opacity = String((СВЕТЛАЯ ? я * 0.35 : я) * 0.85);
      }
      кадр = requestAnimationFrame(шаг);
    };
    подготовитьШёлк().then((готовый) => {
      if (!жив || !место.current) return;
      /* Готовый холст переносим в страницу целиком, без копирования
         четырёх миллионов точек. Если он уже стоит в другом месте —
         тогда копия. */
      if (готовый.isConnected) {
        к = document.createElement("canvas");
        к.width = готовый.width; к.height = готовый.height;
        к.getContext("2d")!.drawImage(готовый, 0, 0);
      } else к = готовый;
      Object.assign(к.style, {
        position: "absolute", willChange: "transform, opacity",
        WebkitMaskImage: "radial-gradient(closest-side, #000 78%, transparent 100%)", maskImage: "radial-gradient(closest-side, #000 78%, transparent 100%)",
        filter: СВЕТЛАЯ ? "invert(1)" : "none",
      });
      разместить();
      место.current.appendChild(к);
      кадр = requestAnimationFrame(шаг);
      // В приложении шёлк проявляется, когда страница уже въехала: иначе
      // его первый кадр совпадал с анимацией входа и сбивал её.
      if (обёртка.current) {
        const о = обёртка.current;
        setTimeout(() => { if (жив) о.style.opacity = "1"; }, вОкне ? 280 : 0);
      }
    }).catch(() => {});
    window.addEventListener("resize", разместить);
    return () => {
      жив = false; cancelAnimationFrame(кадр);
      window.removeEventListener("resize", разместить);
      if (к && к.parentNode) к.parentNode.removeChild(к);
    };
  }, []);
  return (
    <div ref={обёртка} aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, overflow: "hidden", pointerEvents: "none", isolation: "isolate",
      opacity: 0, transition: "opacity 600ms ease",
      // Слой «цвет» смешивается только с тем, что под ним внутри обёртки: без
      // своей заливки он красил пустоту целиком, и экран становился сплошным цветом.
      ...(тон ? { background: СВЕТЛАЯ ? "#FFFFFF" : "#000000" } : null) }}>
      <div ref={место} style={{ position: "absolute", inset: 0 }} />
      {тон && ТОНА_ШЁЛКА[тон] && (
        <div style={{ position: "absolute", inset: 0, mixBlendMode: "color", ...ТОНА_ШЁЛКА[тон] }} />
      )}
    </div>
  );
}
