/* Сайт для компьютера — то же приложение, что и в Telegram.
 *
 * Раньше у монитора была своя витрина с другим дизайном и половиной
 * функций. Теперь на большом экране открывается само приложение — с
 * теми же кнопками, цветами и всеми разделами, — только разложенное под
 * монитор: меню слева, содержимое на всю ширину (App.tsx смотрит на
 * признак ПК).
 *
 * Вход — в тот же аккаунт, что в Telegram: кнопкой Telegram (Login
 * Widget, проверку делает api/telegram-auth.js) или кодом с почты,
 * привязанной в приложении. Google и Phantom остались для тех, кто
 * заводил аккаунт на сайте.
 */
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import TonLaunchApp, { текстУстройства } from "./App";
import { апи } from "./апи";

const БОТ = import.meta.env.VITE_TG_BOT || "MintlyAppbot";
// Те же цвета и шрифты, что у приложения (App.tsx, тема T).
// Светлая тема выбирается в настройках приложения; вход должен совпадать
// с ней, иначе после входа экран вспыхивает из чёрного в белый.
const СВЕТЛАЯ = (() => { try { return localStorage.getItem("mintly_theme") === "White"; } catch { return false; } })();
const Ц = СВЕТЛАЯ
  ? { фон: "#FFFFFF", поверхность: "#F5F5F5", выше: "#EEEEEE", линия: "rgba(0,0,0,0.08)", лёд: "#000000", тусклый: "#6E6E73", вниз: "#E11D2A", наЛьду: "#FFFFFF" }
  : { фон: "#000000", поверхность: "#141416", выше: "#1C1C1F", линия: "rgba(255,255,255,0.08)", лёд: "#F2F2F0", тусклый: "#8E8E93", вниз: "#FF4D5E", наЛьду: "#0B0B0F" };
const ШРИФТ = "'MintlyUI', 'Jost', system-ui, sans-serif";

/* Приветствие — первое, что видит гость на мониторе.
 *
 * Раньше гостя встречала голая форма входа: ни что это, ни зачем. Теперь
 * сначала — то же, что в промо-ролике: знак, крупные строки «белым и
 * серым», экраны приложения и плавное появление по мере прокрутки. Вход
 * открывается окном поверх, из шапки или из любого раздела меню. */
const СТИЛЬ_ПРИВЕТСТВИЯ = `
@keyframes прив-вход { from { opacity: 0; transform: translate3d(0, 26px, 0) } to { opacity: 1; transform: none } }
@keyframes прив-свет { 0% { transform: translate(-30%, -10%) rotate(-18deg) } 50% { transform: translate(10%, 6%) rotate(-12deg) } 100% { transform: translate(-30%, -10%) rotate(-18deg) } }
@keyframes прив-плыть { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-12px) } }
@keyframes прив-звезда { from { transform: rotate(-90deg) scale(.4); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes прив-окно { from { opacity: 0; transform: translateY(18px) scale(.97) } to { opacity: 1; transform: none } }
@keyframes прив-фон { from { opacity: 0 } to { opacity: 1 } }
@keyframes прив-крутись { to { transform: rotate(360deg) } }
@keyframes прив-галка { from { transform: scale(.3); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes прив-удар { 0% { transform: translateY(0) scale(1,1) } 45% { transform: translateY(14px) scale(1,1) } 52% { transform: translateY(16px) scale(1.18,.72) } 62% { transform: translateY(10px) scale(.94,1.08) } 100% { transform: translateY(0) scale(1,1) } }
@keyframes прив-строка { from { opacity: 0; transform: translate3d(0,-18px,0) } to { opacity: 1; transform: none } }
@keyframes прив-пульс { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: .45; transform: scale(.8) } }
@keyframes прив-лента { from { transform: translate3d(0,0,0) } to { transform: translate3d(-50%,0,0) } }
.прив-лента:hover > div { animation-play-state: paused }
@keyframes прив-блик { 0% { left: -70% } 55%,100% { left: 130% } }
.прив-появись { opacity: 0; transform: translate3d(0, 40px, 0); transition: opacity .9s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1) }
.прив-появись.слева { transform: translate3d(-160px, 0, 0); transition-duration: 1.2s }
.прив-появись.видно { opacity: 1; transform: none }
.прив-фон { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; contain: strict }

.прив-ссылка { background: none; border: none; cursor: pointer; padding: 8px 14px; border-radius: 10px; transition: background .15s, color .15s }
.прив-ссылка:hover { background: var(--прив-над); color: var(--прив-лёд) !important }
/* Наведение: приглушённый текст кнопок и виджетов становится белым. */
.прив-т { transition: color .2s }
/* Серый текст над светлым шёлком терялся. Мягкий тёмный ореол вокруг
   букв на чёрном незаметен, а на свечении отделяет их от фона. */
.прив-серый { text-shadow: 0 0 2px rgba(0,0,0,.55), 0 0 14px rgba(0,0,0,.85), 0 0 34px rgba(0,0,0,.7) }
.прив-виджет:hover .прив-т { color: var(--прив-лёд) !important }
.прив-ряд { transition: background .35s, color .2s }
.прив-ряд:not(.вкл):hover { color: var(--прив-лёд) !important }
.прив-стрелка svg { transition: stroke .2s }
.прив-стрелка:hover svg { stroke: var(--прив-лёд) }
@media (prefers-reduced-motion: reduce) { .прив-появись, .прив-появись.слева { opacity: 1; transform: none; transition: none } * { animation-duration: 0s !important } }
`;

function useПоявление() {
  const реф = useRef(null);
  const [видно, setВидно] = useState(false);
  useEffect(() => {
    const эл = реф.current;
    if (!эл || typeof IntersectionObserver === "undefined") { setВидно(true); return; }
    const н = new IntersectionObserver(([з]) => { if (з.isIntersecting) { setВидно(true); н.disconnect(); } }, { threshold: 0.25 });
    н.observe(эл);
    return () => н.disconnect();
  }, []);
  return [реф, видно];
}

function Появись({ children, задержка = 0, style = {}, слева = false }) {
  const [реф, видно] = useПоявление();
  return <div ref={реф} className={"прив-появись" + (слева ? " слева" : "") + (видно ? " видно" : "")} style={{ transitionDelay: `${задержка}ms`, ...style }}>{children}</div>;
}

// Знак организации — тот же файл, что на иконке приложения. Цвет
// задаётся фильтром: в светлой теме знак чёрный, приглушённый — серый.
function Звезда({ size = 28, цвет = Ц.лёд }) {
  const фильтр = цвет === "#FFFFFF" ? "brightness(1.15)" : цвет === Ц.тусклый ? "grayscale(1) brightness(.62)" : СВЕТЛАЯ ? "invert(1)" : "none";
  return <img src="/logo-star.png" alt="" width={size} height={size} style={{ display: "block", filter: фильтр }} />;
}

// Две строки, как в ролике: первая — ярко, вторая — приглушённо.
function Строки({ верх, низ, размер = 64 }) {
  return (
    <h2 style={{ margin: 0, fontSize: размер, lineHeight: 1.04, fontWeight: 800, letterSpacing: "-0.035em", textWrap: "balance" }}>
      <span style={{ color: Ц.лёд }}>{верх}</span><br />
      <span className="прив-серый" style={{ color: Ц.тусклый }}>{низ}</span>
    </h2>
  );
}

/* Виден ли блок почти целиком — с этого момента запускается его сцена.
   Ушёл из кадра — сцена останавливается и при возвращении идёт заново. */
function useВКадре(порог = 0.85) {
  const реф = useRef(null);
  const [в, setВ] = useState(false);
  useEffect(() => {
    const эл = реф.current;
    if (!эл || typeof IntersectionObserver === "undefined") { setВ(true); return; }
    const н = new IntersectionObserver(([з]) => setВ(з.intersectionRatio >= порог), { threshold: [0, порог, 1] });
    н.observe(эл);
    return () => н.disconnect();
  }, [порог]);
  return [реф, в];
}

/* Часы сцены: сколько миллисекунд прошло с начала, по кругу длиной
   «цикл». Начинает, когда телефон доехал на место (задержка), и стоит,
   пока его не видно. */
function useЧасы(идёт, цикл, задержка = 1300) {
  const [мс, setМс] = useState(-1);
  useEffect(() => {
    if (!идёт) { setМс(-1); return; }
    let кадр; const старт = performance.now() + задержка;
    const шаг = (т) => { setМс(т < старт ? -1 : (т - старт) % цикл); кадр = requestAnimationFrame(шаг); };
    кадр = requestAnimationFrame(шаг);
    return () => cancelAnimationFrame(кадр);
  }, [идёт, цикл, задержка]);
  return мс;
}

// Строка статуса iPhone: время слева, связь, Wi-Fi и батарея справа.
function СтрокаСтатуса() {
  return (
    <div style={{ height: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 30px 0 34px", boxSizing: "border-box", color: "#fff", fontFamily: "-apple-system, 'SF Pro Text', " + ШРИФТ, fontSize: 15.5, fontWeight: 600 }}>
      <span style={{ letterSpacing: "-0.01em" }}>9:41</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="18" height="12" viewBox="0 0 18 12" fill="#fff"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="#fff"><path d="M8 2.4c2.3 0 4.4.9 6 2.4l1.2-1.3A10.2 10.2 0 0 0 8 .6 10.2 10.2 0 0 0 .8 3.5L2 4.8a8.4 8.4 0 0 1 6-2.4zm0 3.5c1.4 0 2.6.5 3.6 1.4l1.2-1.3A7 7 0 0 0 8 4.1 7 7 0 0 0 3.2 6l1.2 1.3c1-.9 2.2-1.4 3.6-1.4zm0 3.4c.6 0 1.1.2 1.5.6L8 11.5 6.5 9.9c.4-.4.9-.6 1.5-.6z" /></svg>
        <span style={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <span style={{ width: 25, height: 12, borderRadius: 4, border: "1.2px solid rgba(255,255,255,.45)", padding: 1.5, boxSizing: "border-box", display: "flex" }}><span style={{ width: "86%", background: "#fff", borderRadius: 2 }} /></span>
          <span style={{ width: 1.5, height: 4, background: "rgba(255,255,255,.45)", borderRadius: 1 }} />
        </span>
      </span>
    </div>
  );
}

/* Касание пальца по экрану: светлое пятно расходится и гаснет. Координаты —
   в долях экрана приложения (без строки статуса). */
function Касание({ x, y, мс, когда }) {
  const т = мс - когда;
  if (мс < 0 || т < 0 || т > 600) return null;
  const п = т / 600;
  return <div style={{ position: "absolute", left: `${x * 100}%`, top: `${y * 100}%`, width: 44, height: 44, marginLeft: -22, marginTop: -22, borderRadius: 999, background: "rgba(255,255,255,.55)", transform: `scale(${0.5 + п * 1.2})`, opacity: 1 - п, pointerEvents: "none" }} />;
}

/* Телефон — последний iPhone: узкие рамки, титановый корпус, Dynamic
   Island и кнопки по бокам. Экран по пропорциям ровно как снимок
   приложения плюс строка статуса — ничего не обрезается. */
const ШИРИНА_ЭКРАНА = 326;
function Телефон({ src, children, наЭкране = null }) {
  const рамка = 3, ободок = 5;
  const высотаСнимка = Math.round(ШИРИНА_ЭКРАНА * 2394 / 1179);
  const кнопка = (стиль) => <div style={{ position: "absolute", width: 3, borderRadius: 2, background: "linear-gradient(90deg,#3a3a3e,#8d8d92,#3a3a3e)", ...стиль }} />;
  return (
    <div style={{ position: "relative", animation: "прив-плыть 7s ease-in-out infinite", willChange: "transform" }}>
      <div style={{ position: "relative" }}>
        {кнопка({ left: -2, top: 120, height: 30 })}
        {кнопка({ left: -2, top: 170, height: 56 })}
        {кнопка({ left: -2, top: 236, height: 56 })}
        {кнопка({ right: -2, top: 196, height: 88 })}
        <div style={{
          padding: рамка, borderRadius: 62,
          background: "linear-gradient(145deg,#9a9aa0 0%,#4b4b50 18%,#2b2b2f 50%,#57575c 82%,#a3a3a8 100%)",
          boxShadow: СВЕТЛАЯ ? "0 50px 100px rgba(0,0,0,.22), 0 10px 30px rgba(0,0,0,.12)" : "0 60px 140px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.06)",
        }}>
          <div style={{ padding: ободок, borderRadius: 59, background: "#050505", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)" }}>
            <div style={{ position: "relative", width: ШИРИНА_ЭКРАНА, borderRadius: 54, overflow: "hidden", background: "#000", transform: "translateZ(0)" }}>
              <СтрокаСтатуса />
              <div style={{ position: "relative" }}>
                <img src={src} alt="" width={1179} height={2394} decoding="async" loading="eager" style={{ width: ШИРИНА_ЭКРАНА, height: высотаСнимка, display: "block" }} />
                {наЭкране}
              </div>
              <div style={{ position: "absolute", top: 11, left: "50%", width: 104, height: 31, marginLeft: -52, borderRadius: 999, background: "#000" }}>
                <div style={{ position: "absolute", right: 12, top: 10, width: 11, height: 11, borderRadius: 999, background: "radial-gradient(circle at 35% 35%,#2a3550,#0a0c12 70%)" }} />
              </div>
              {/* Блик стекла — едва заметный, по диагонали. */}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(125deg,rgba(255,255,255,.07) 0%,rgba(255,255,255,0) 32%)", pointerEvents: "none" }} />
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

// Колёсико ожидания для плашек.
function Колесо() {
  return <div style={{ width: 18, height: 18, borderRadius: 999, border: "2.2px solid rgba(255,255,255,.18)", borderTopColor: Ц.лёд, animation: "прив-крутись .8s linear infinite" }} />;
}

/* Плашка-уведомление, как всплывает в приложении после действия: пока
   идёт — колесо и бегущие секунды, по готовности — зелёная галочка. */
function Плашка({ заголовок, подпись, время, style, ждём = false, видна = true }) {
  return (
    <div className="прив-виджет" style={{
      position: "absolute", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 16, minWidth: 250,
      background: СВЕТЛАЯ ? "rgba(255,255,255,.94)" : "rgba(20,20,22,.94)",
      border: `1px solid ${ждём ? Ц.линия : СВЕТЛАЯ ? "rgba(0,163,76,.35)" : "rgba(46,232,122,.35)"}`, boxShadow: "0 18px 50px rgba(0,0,0,.35)",
      transition: "opacity .35s ease, transform .45s cubic-bezier(.2,.8,.2,1), border-color .3s",
      opacity: видна ? 1 : 0, transform: видна ? "none" : "translate3d(0,14px,0) scale(.96)", ...style,
    }}>
      <div style={{ width: 28, height: 28, borderRadius: 999, background: ждём ? "transparent" : "rgba(46,232,122,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {ждём ? <Колесо /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2EE87A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "прив-галка .4s cubic-bezier(.2,.8,.2,1) both" }}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: Ц.лёд, fontSize: 15, fontWeight: 800 }}>{заголовок}</div>
        <div className="прив-т" style={{ color: Ц.тусклый, fontSize: 12.5, marginTop: 2 }}>{подпись}</div>
      </div>
      <div style={{ color: ждём ? Ц.лёд : "#2EE87A", fontSize: 15, fontWeight: 800, marginLeft: 14, fontVariantNumeric: "tabular-nums", minWidth: 44, textAlign: "right" }}>{время}</div>
    </div>
  );
}

const сек = (мс) => (мс / 1000).toFixed(1).replace(".", ",") + " с";

/* Запуск: палец жмёт «Далее», всплывает «Запускаем…», секунды бегут от
   нуля до 2,8 — и плашка становится «Токен запущен». */
function СценаЗапуска() {
  const [реф, в] = useВКадре();
  const мс = useЧасы(в, 7000);
  const нажал = 400, длится = 2800;
  const т = мс - нажал;
  const идёт = мс >= 0 && т >= 0 && т < длится;
  const готово = мс >= 0 && т >= длится;
  return (
    <div ref={реф}>
      <Телефон src="/landing/create-sol.webp" наЭкране={<Касание x={0.5} y={0.642} мс={мс} когда={нажал} />}>
        <Плашка видна={идёт || готово} ждём={!готово} заголовок={готово ? "Токен запущен" : "Запускаем…"} подпись="$WIF · Solana"
          время={сек(готово ? длится : Math.max(0, т))} style={{ left: -170, bottom: 150 }} />
      </Телефон>
    </div>
  );
}

/* Сети: рядом с телефоном — все сети приложения столбиком. На экране
   мемпад Solana, поэтому выбрана она, и всплывают её же мемкоины — те,
   что в ленте на экране. */
const СЕТИ_ПРИВЕТСТВИЯ = [
  { имя: "Gram", лого: "/coins/gram.png" },
  { имя: "Solana", лого: "/coins/sol.png" },
  { имя: "BNB Chain", лого: "/coins/bnb.svg" },
  { имя: "Base", лого: "/coins/base.svg" },
  { имя: "Ethereum", лого: "/coins/eth.svg" },
];
const ЗАПУСКИ_SOL = [
  { т: "$BONK", лого: "/landing/tok/bonk.webp", рост: "+18,2%" },
  { т: "$POPCAT", лого: "/landing/tok/popcat.webp", рост: "+27,5%" },
  { т: "$BOME", лого: "/landing/tok/bome.webp", рост: "+63,9%" },
  { т: "$MEW", лого: "/landing/tok/mew.webp", рост: "−4,6%" },
  { т: "$WIF", лого: "/landing/tok/wif.webp", рост: "+41,7%" },
];
const ШАГ_СЕТИ = 2400;
function СценаСетей() {
  const [реф, в] = useВКадре();
  const мс = useЧасы(в, ШАГ_СЕТИ * ЗАПУСКИ_SOL.length);
  const номер = мс < 0 ? 0 : Math.floor(мс / ШАГ_СЕТИ);
  const фаза = мс < 0 ? -1 : мс % ШАГ_СЕТИ;
  const з = ЗАПУСКИ_SOL[номер];
  const видна = фаза > 450 && фаза < ШАГ_СЕТИ - 250;
  return (
    <div ref={реф}>
      <Телефон src="/landing/pad-sol.webp">
        <div style={{ position: "absolute", left: -250, top: 70, width: 210, padding: 6, borderRadius: 18, background: Ц.поверхность, border: `1px solid ${Ц.линия}`, boxShadow: "0 18px 50px rgba(0,0,0,.35)", display: "flex", flexDirection: "column", gap: 2 }}>
          {СЕТИ_ПРИВЕТСТВИЯ.map((н) => {
            const вкл = н.имя === "Solana";
            return (
              <div key={н.имя} className={"прив-ряд" + (вкл ? " вкл" : "")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 13, fontSize: 14.5, fontWeight: 700, cursor: "default", background: вкл ? Ц.лёд : "transparent", color: вкл ? Ц.наЛьду : Ц.тусклый }}>
                <img src={н.лого} alt="" width={22} height={22} style={{ borderRadius: 999, display: "block" }} />{н.имя}
              </div>
            );
          })}
        </div>
        <div className="прив-виджет" style={{
          position: "absolute", left: -290, top: 330, width: 260, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16,
          background: Ц.поверхность, border: `1px solid ${Ц.линия}`, boxShadow: "0 18px 50px rgba(0,0,0,.35)",
          transition: "opacity .35s, transform .45s cubic-bezier(.2,.8,.2,1)", opacity: видна ? 1 : 0, transform: видна ? "none" : "translate3d(0,12px,0)",
        }}>
          <img src={з.лого} alt="" width={36} height={36} style={{ borderRadius: 999, display: "block", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: Ц.лёд, fontSize: 14.5, fontWeight: 800 }}>Покупка {з.т}</div>
            <div className="прив-т" style={{ color: Ц.тусклый, fontSize: 12.5, marginTop: 2 }}>Solana · только что</div>
          </div>
          <div style={{ color: з.рост.startsWith("−") ? Ц.вниз : "#2EE87A", fontSize: 13.5, fontWeight: 800 }}>{з.рост}</div>
        </div>
      </Телефон>
    </div>
  );
}

/* Покупка: касание «Купить», «Покупаем…» с секундами до 0,9 — «Куплено». */
function СценаПокупки() {
  const [реф, в] = useВКадре();
  const мс = useЧасы(в, 5200);
  const нажал = 500, длится = 900;
  const т = мс - нажал;
  const готово = мс >= 0 && т >= длится;
  const видна = мс >= 0 && т >= 0 && мс < 4600;
  return (
    <div ref={реф}>
      <Телефон src="/landing/buy-sol.webp" наЭкране={<Касание x={0.5} y={0.874} мс={мс} когда={нажал} />}>
        <Плашка видна={видна} ждём={!готово} заголовок={готово ? "Куплено" : "Покупаем…"} подпись="3 151 118 WIF · комиссия 0%"
          время={сек(готово ? длится : Math.max(0, т))} style={{ left: -200, top: 130 }} />
      </Телефон>
    </div>
  );
}

// Счёт от 0,8% к 0%: в ролике комиссия «тает» на глазах.
function Комиссия() {
  const [реф, видно] = useВКадре(0.9);
  const [доля, setДоля] = useState(0.8);
  useEffect(() => {
    if (!видно) { setДоля(0.8); return; }
    let кадр; const старт = performance.now() + 1100;
    const шаг = (т) => {
      const п = Math.min(1, Math.max(0, (т - старт) / 1200));
      setДоля(0.8 * (1 - (1 - Math.pow(1 - п, 3))));
      if (п < 1) кадр = requestAnimationFrame(шаг);
    };
    кадр = requestAnimationFrame(шаг);
    return () => cancelAnimationFrame(кадр);
  }, [видно]);
  const ноль = доля < 0.005;
  const комиссия = (100 * доля / 100).toFixed(2).replace(".", ",");
  const ряд = (а, б, цвет) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: `1px solid ${Ц.линия}`, fontSize: 15 }}>
      <span className="прив-т" style={{ color: Ц.тусклый }}>{а}</span><span style={{ color: цвет || Ц.лёд, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{б}</span>
    </div>
  );
  return (
    <div ref={реф} className="прив-виджет" style={{ width: 420, padding: 28, borderRadius: 24, background: Ц.поверхность, border: `1px solid ${Ц.линия}` }}>
      <div className="прив-т" style={{ display: "flex", alignItems: "center", gap: 8, color: Ц.тусклый, fontSize: 14 }}><Звезда size={16} цвет={Ц.тусклый} /> Продажа $MINT</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, margin: "14px 0 18px" }}>
        <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.04em", color: ноль ? "#2EE87A" : Ц.лёд, fontVariantNumeric: "tabular-nums", transition: "color .4s" }}>
          {ноль ? "0" : доля.toFixed(1).replace(".", ",")}%
        </div>
        <div className="прив-т" style={{ color: Ц.тусклый, fontSize: 13, paddingBottom: 12, lineHeight: 1.3 }}>комиссия<br />Mintly</div>
      </div>
      {ряд("Сумма сделки", "100,00 GRAM")}
      {ряд("Комиссия", `${комиссия} GRAM`, ноль ? "#2EE87A" : Ц.вниз)}
      {ряд("Вы получите", `${(100 - Number(комиссия.replace(",", "."))).toFixed(2).replace(".", ",")} GRAM`, "#2EE87A")}
    </div>
  );
}

const ТОЛЩИНА_КАРТЫ = 9;
function КартаDEX() {
  /* Карту можно взять курсором и повернуть: до 40° вбок и 28° по
     вертикали. Отпустил — плавно встаёт на место. Без захвата она
     чуть наклоняется за мышью, как раньше. */
  const [наклон, setНаклон] = useState({ x: 0, y: 0 });
  const [держу, setДержу] = useState(false);
  const старт = useRef(null);
  const двигать = (e) => {
    if (старт.current) {
      const с = старт.current;
      setНаклон({ x: Math.max(-28, Math.min(28, с.x - (e.clientY - с.my) * 0.25)), y: Math.max(-40, Math.min(40, с.y + (e.clientX - с.mx) * 0.3)) });
      return;
    }
    const р = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - р.left) / р.width - 0.5, dy = (e.clientY - р.top) / р.height - 0.5;
    setНаклон({ x: -dy * 14, y: dx * 18 });
  };
  const взять = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    старт.current = { mx: e.clientX, my: e.clientY, x: наклон.x, y: наклон.y };
    setДержу(true);
  };
  const отпустить = () => { старт.current = null; setДержу(false); setНаклон({ x: 0, y: 0 }); };
  return (
    <div style={{ padding: 40, cursor: держу ? "grabbing" : "grab", touchAction: "none" }}
      onPointerMove={двигать} onPointerDown={взять} onPointerUp={отпустить} onPointerCancel={отпустить}
      onPointerLeave={() => { if (!старт.current) setНаклон({ x: 0, y: 0 }); }}>
      {/* Перспектива — у прямого родителя карты: на деде она не
          действовала, и поворот выглядел плоским сжатием. */}
      {/* Без плавания: слой с текстом, который сдвигается на доли
          пикселя каждый кадр, браузер рисовал неровно — буквы и знак
          выглядели сжатыми. */}
      <div style={{ perspective: 1100 }}>
        <div style={{
          width: 420, height: 264, position: "relative", transformStyle: "preserve-3d",
          transform: `rotateX(${наклон.x}deg) rotateY(${наклон.y}deg)`,
          transition: держу ? "transform .06s linear" : "transform .7s cubic-bezier(.2,1.4,.4,1)",
        }}>
          {/* Толщина: слои металла один за другим вглубь — на повороте
              виден торец, и карта читается пластиной, а не картинкой. */}
          {Array.from({ length: ТОЛЩИНА_КАРТЫ }, (_, i) => (
            <div key={i} style={{
              position: "absolute", inset: 0, borderRadius: 24,
              background: i === ТОЛЩИНА_КАРТЫ - 1 ? "linear-gradient(135deg,#55555A,#2C2C30 50%,#606065)" : "linear-gradient(135deg,#B9B9BE,#5E5E63 45%,#C9C9CE 70%,#6A6A6F)",
              transform: `translateZ(${-(i + 1) * 0.9}px)`,
              boxShadow: i === ТОЛЩИНА_КАРТЫ - 1 ? "0 50px 120px rgba(0,0,0,.6)" : "none",
            }} />
          ))}
          <div style={{
            position: "absolute", inset: 0, borderRadius: 24, padding: 26, boxSizing: "border-box", overflow: "hidden",
            background: "linear-gradient(135deg,#8E8E93 0%,#3A3A3E 38%,#D9D9DE 62%,#4A4A4F 100%)",
            boxShadow: "0 0 0 1px rgba(255,255,255,.18) inset, 0 1px 0 rgba(255,255,255,.35) inset",
            backfaceVisibility: "hidden", WebkitFontSmoothing: "antialiased",
          }}>
            <div style={{ position: "absolute", top: 0, bottom: 0, width: "60%", background: "linear-gradient(105deg,transparent 0%,rgba(255,255,255,.45) 50%,transparent 100%)", animation: "прив-блик 4.5s ease-in-out infinite" }} />
            <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
              <div style={{ flexShrink: 0 }}><Звезда size={34} цвет="#FFFFFF" /></div>
              <div style={{ textAlign: "right", color: "#fff" }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Mintly</div>
                <div style={{ fontSize: 10, letterSpacing: ".18em", opacity: .8, marginTop: 4 }}>LIMITED · DEX</div>
              </div>
            </div>
            <div style={{ position: "absolute", left: 26, bottom: 24, color: "#fff" }}>
              <div style={{ fontSize: 34, fontWeight: 800 }}>$MINT</div>
              <div style={{ fontSize: 13, opacity: .8 }}>Mintly</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Бегущая строка под шапкой — настоящие токены площадки: логотип,
   тикер, капитализация и изменение за сутки. Берутся из той же таблицы,
   что лента приложения (tokens + curve_cache), курс монет — с сервера.
   Нет ни одного токена с ценой — строки нет вовсе. */
function БегущаяСтрока({ сверху }) {
  const [токены, setТокены] = useState([]);
  useEffect(() => {
    let жив = true;
    const загрузить = async () => {
      try {
        const [{ data }, курсы] = await Promise.all([
          supabase.from("tokens")
            .select("id, ticker, name, logo_url, chain, created_at, curve_cache(price_ton, change24, supply, logo_url)")
            .order("created_at", { ascending: false }).limit(40),
          fetch(апи("/api/market-rates")).then((r) => r.json()).catch(() => null),
        ]);
        const курсSol = (курсы && курсы.sol && курсы.sol.price) || 0;
        const курсTon = (курсы && курсы.gram && курсы.gram.price) || 0;
        const строки = (data || []).map((т) => {
          const к = Array.isArray(т.curve_cache) ? т.curve_cache[0] : т.curve_cache;
          const курс = т.chain === "solana" ? курсSol : курсTon;
          const кап = к && к.price_ton > 0 && курс > 0 ? к.price_ton * курс * (Number(к.supply) || 1e9) : 0;
          return { id: т.id, тикер: т.ticker, лого: т.logo_url || (к && к.logo_url) || null, кап, рост: Number(к && к.change24) || 0 };
        }).filter((т) => т.тикер && т.кап > 0);
        // Пока своих токенов с ценой нет — в строке демо-токен площадки
        // с живой ценой с сервера, чтобы лента не пропадала.
        if (!строки.length) {
          const д = await fetch(апи("/api/live?demo=1")).then((r) => r.json()).catch(() => null);
          const к = д && д.curves && Object.values(д.curves)[0];
          if (к && к.price > 0 && курсTon > 0) строки.push({ id: "demo", тикер: "DEMO", лого: null, кап: к.price * курсTon * 1e9, рост: 0, демо: true });
        }
        if (жив) setТокены(строки);
      } catch { /* строки не будет — приветствие и без неё целое */ }
    };
    загрузить();
    const и = setInterval(загрузить, 30000);
    return () => { жив = false; clearInterval(и); };
  }, []);
  if (!токены.length) return null;
  // Повторяем ряд, пока он не станет шире экрана, и ещё раз целиком —
  // сдвиг на половину ленты незаметно замыкает её в кольцо.
  const раз = Math.max(1, Math.ceil(16 / токены.length));
  const ряд = Array.from({ length: раз }, () => токены).flat();
  const кап = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;
  const элемент = (т, i) => (
    <span key={`${т.id}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "0 26px", whiteSpace: "nowrap" }}>
      {т.лого
        ? <img src={т.лого} alt="" width={22} height={22} style={{ borderRadius: 999, objectFit: "cover" }} />
        : <span style={{ width: 22, height: 22, borderRadius: 999, background: Ц.выше, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{т.тикер[0]}</span>}
      <span style={{ fontWeight: 800, color: Ц.лёд, fontSize: 14 }}>${т.тикер}</span>
      <span style={{ color: Ц.тусклый, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>{кап(т.кап)}</span>
      {т.демо
        ? <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", color: Ц.тусклый, border: `1px solid ${Ц.линия}`, borderRadius: 6, padding: "1px 5px" }}>ДЕМО</span>
        : <span style={{ color: т.рост >= 0 ? "#2EE87A" : Ц.вниз, fontSize: 13.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{т.рост >= 0 ? "+" : ""}{т.рост.toFixed(1)}%</span>}
    </span>
  );
  return (
    <div className="прив-лента" style={{
      position: "fixed", top: сверху, left: 0, right: 0, zIndex: 19, height: 42, overflow: "hidden",
      display: "flex", alignItems: "center", borderBottom: `1px solid ${Ц.линия}`, background: Ц.фон,
      WebkitMaskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)", maskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
    }}>
      <div style={{ display: "flex", width: "max-content", animation: `прив-лента ${Math.max(30, ряд.length * 3.2)}s linear infinite` }}>
        {ряд.map(элемент)}{ряд.map((т, i) => элемент(т, i + ряд.length))}
      </div>
    </div>
  );
}

function Раздел({ id, текст, картинка, обратно = false }) {
  return (
    <section id={id} style={{ minHeight: "92vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 64px", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 1180, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 80, flexDirection: обратно ? "row-reverse" : "row" }}>
        <Выезд откуда={обратно ? "right" : "left"} style={{ flex: 1 }}>{текст}</Выезд>
        <Выезд откуда={обратно ? "left" : "right"} style={{ flexShrink: 0 }}>{картинка}</Выезд>
      </div>
    </section>
  );
}

/* Приветствие не ждёт картинок: раньше страница стояла пустой до 2,5 с,
   пока не догрузятся экраны телефонов, хотя на первом экране их нет
   вовсе. Ждём только шрифт, и то не дольше трети секунды (он заранее
   подгружается из index.html, так что обычно уже на месте), — иначе
   заголовок на глазах перескакивал бы с запасного шрифта. Картинки
   разделов грузятся следом, фоном: к прокрутке они уже готовы. */
const КАРТИНКИ_ПРИВЕТСТВИЯ = ["/landing/create-sol.webp", "/landing/pad-sol.webp", "/landing/buy-sol.webp", "/landing/tok/bonk.webp", "/landing/tok/popcat.webp", "/landing/tok/mew.webp", "/landing/tok/bome.webp", "/landing/tok/wif.webp", "/logo-star.png", "/coins/gram.png", "/coins/sol.png", "/coins/bnb.svg", "/coins/base.svg", "/coins/eth.svg"];
function useГотовоПриветствие() {
  const [готово, setГотово] = useState(false);
  useEffect(() => {
    let жив = true;
    const шрифты = document.fonts ? ["400", "600", "800"].flatMap((в) => [
      document.fonts.load(`${в} 20px MintlyUI`, "Мintly"), document.fonts.load(`${в} 20px MintlyUI`, "Ая"),
    ]) : [];
    КАРТИНКИ_ПРИВЕТСТВИЯ.forEach((src) => { const и = new Image(); и.decoding = "async"; и.src = src; });
    const стоп = new Promise((r) => setTimeout(r, 300));
    Promise.race([Promise.all(шрифты).catch(() => {}), стоп]).then(() => { if (жив) setГотово(true); });
    return () => { жив = false; };
  }, []);
  useEffect(() => { if (!готово) return; const ш = document.getElementById("ширма"); if (ш) ш.remove(); }, [готово]);
  return готово;
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

function ФонШёлк() {
  const холст = useRef(null);
  useEffect(() => {
    const к = холст.current;
    if (!к) return;
    let жив = true, кадр = 0;
    const и = new Image();
    и.onload = () => {
      if (!жив) return;
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
      к.style.visibility = "visible";
    };
    и.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ШЁЛК_SVG);
    const начало = performance.now();
    const шаг = () => {
      // Кадр ролика 1920×1080 вписывается в окно «с обрезкой», как фон.
      const вш = window.innerWidth, вв = window.innerHeight;
      const м = Math.max(вш / КАДР_Ш, вв / КАДР_В);
      const ох = (вш - КАДР_Ш * м) / 2, оу = (вв - КАДР_В * м) / 2;
      const всего = Math.max(1, document.documentElement.scrollHeight - вв);
      const [я, dx, dy, sc, поворот] = поКлючам(Math.min(1, window.scrollY / всего), ШЁЛК_КЛЮЧИ);
      const t = (performance.now() - начало) / 1000;
      // «Дыхание» из ролика — медленное покачивание поверх положения.
      const а = Math.sin(t * 0.5) * 3 + поворот, bx = Math.sin(t * 0.35) * 40 + dx, by = Math.cos(t * 0.42) * 26 + dy;
      к.style.width = `${(КАДР_Ш + 2 * ЗАПАС) * м}px`;
      к.style.height = `${(КАДР_В + 2 * ЗАПАС) * м}px`;
      к.style.left = `${ох - ЗАПАС * м}px`;
      к.style.top = `${оу - ЗАПАС * м}px`;
      к.style.transformOrigin = `${(ЗАПАС + КАДР_Ш / 2) * м}px ${(ЗАПАС + КАДР_В / 2) * м}px`;
      к.style.transform = `translate3d(${bx * м * ДАЛЬ}px, ${by * м * ДАЛЬ}px, 0) rotate(${а}deg) scale(${ДАЛЬ * sc * (1 + 0.03 * Math.sin(t * 0.8))})`;
      к.style.opacity = String((СВЕТЛАЯ ? я * 0.35 : я) * 0.85);
      кадр = requestAnimationFrame(шаг);
    };
    кадр = requestAnimationFrame(шаг);
    return () => { жив = false; cancelAnimationFrame(кадр); };
  }, []);
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, overflow: "hidden", pointerEvents: "none" }}>
      <canvas ref={холст} style={{ position: "absolute", visibility: "hidden", willChange: "transform, opacity",
        WebkitMaskImage: "radial-gradient(closest-side, #000 78%, transparent 100%)", maskImage: "radial-gradient(closest-side, #000 78%, transparent 100%)", ...(СВЕТЛАЯ ? { filter: "invert(1)" } : null) }} />
    </div>
  );
}

/* Выезд по прокрутке: блок едет сбоку и проявляется ровно настолько,
   насколько страница докручена до него, — и обратно при прокрутке назад.
   Стиль пишется прямо в элемент в кадре прокрутки, без перерисовки React.
   В покое трансформации нет совсем: текст в слое с transform браузер
   рисует мутнее, и заголовки выглядели размытыми. */
function Выезд({ откуда = "left", children, style = {} }) {
  const реф = useRef(null);
  useEffect(() => {
    const эл = реф.current;
    if (!эл) return;
    const знак = откуда === "left" ? -1 : 1;
    let кадр = 0;
    const обновить = () => {
      кадр = 0;
      const р = эл.getBoundingClientRect(), вх = window.innerHeight;
      const п = Math.max(0, Math.min(1, (вх - р.top) / (вх * 0.6)));
      const е = 1 - Math.pow(1 - п, 3);
      эл.style.opacity = String(е);
      эл.style.transform = е >= 0.999 ? "none" : `translate3d(${(1 - е) * знак * 240}px, 0, 0)`;
    };
    const запрос = () => { if (!кадр) кадр = requestAnimationFrame(обновить); };
    обновить();
    window.addEventListener("scroll", запрос, { passive: true });
    window.addEventListener("resize", запрос);
    return () => { window.removeEventListener("scroll", запрос); window.removeEventListener("resize", запрос); cancelAnimationFrame(кадр); };
  }, [откуда]);
  return <div ref={реф} style={{ opacity: 0, ...style }}>{children}</div>;
}

// Стрелка вниз: падает, ударяется о невидимый пол и отскакивает.
// Видна только в самом начале: стоит сдвинуть страницу — гаснет, вернул
// наверх — проявляется снова.
function СтрелкаВниз({ onClick, видна = true }) {
  return (
    <div style={{ position: "absolute", bottom: 34, left: "50%", marginLeft: -22, transition: "opacity .35s ease, transform .35s ease", opacity: видна ? 1 : 0, transform: видна ? "none" : "translateY(10px)", pointerEvents: видна ? "auto" : "none" }}>
    <button onClick={onClick} aria-label="Дальше" className="прив-стрелка" style={{ width: 44, height: 56, background: "none", border: "none", cursor: "pointer", animation: "прив-вход 1s 1.4s both" }}>
      <span style={{ display: "block", animation: "прив-удар 1.6s cubic-bezier(.45,0,.55,1) infinite", transformOrigin: "50% 100%" }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={Ц.тусклый} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto" }}><path d="M6 9.5l6 6 6-6" /></svg>
      </span>
      <span style={{ display: "block", width: 18, height: 2, borderRadius: 2, margin: "6px auto 0", background: Ц.линия }} />
    </button>
    </div>
  );
}

/* Пояснение под заголовком раздела — текст из «Как устроено» в
   приложении (archCurveBody и соседи). Раньше здесь стояли свои короткие
   подписи, и они говорили о площадке меньше, чем тот раздел. */
function Пояснение({ ключ, поЦентру = false }) {
  return (
    <p className="прив-серый" style={{ color: Ц.тусклый, fontSize: 19, lineHeight: 1.6, maxWidth: поЦентру ? 660 : 480, margin: поЦентру ? "24px auto 0" : "24px 0 0", textWrap: "pretty" }}>
      {текстУстройства(ключ)}
    </p>
  );
}

/* Разделы шапки — те же, что в приложении. Открыть любой можно только
   с аккаунтом: приложение само встречает гостя своим окном регистрации и
   входа, а после него открывает тот раздел, на который нажали. */
function Приветствие({ onРаздел }) {
  const готово = useГотовоПриветствие();
  const setОкно = () => onРаздел("home");
  const [прокручено, setПрокручено] = useState(false);
  useEffect(() => {
    const н = () => setПрокручено(window.scrollY > 20);
    window.addEventListener("scroll", н, { passive: true });
    return () => window.removeEventListener("scroll", н);
  }, []);
  const МЕНЮ = [["Мемпад", "mempad"], ["Создать", "create"], ["Кошелёк", "wallet"], ["Профиль", "profile"]].map(([имя, р]) => [имя, () => onРаздел(р)]);
  const кнопкаГлавная = { height: 48, padding: "0 26px", borderRadius: 14, border: "none", cursor: "pointer", background: Ц.лёд, color: Ц.наЛьду, fontFamily: ШРИФТ, fontSize: 16, fontWeight: 800 };

  if (!готово) return null;
  return (
    <div style={{ background: Ц.фон, color: Ц.лёд, fontFamily: ШРИФТ, minHeight: "100vh", overflowX: "hidden", isolation: "isolate", position: "relative", "--прив-над": СВЕТЛАЯ ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.06)", "--прив-лёд": СВЕТЛАЯ ? "#000000" : "#FFFFFF" }}>
      <style>{СТИЛЬ_ПРИВЕТСТВИЯ}</style>
      <ФонШёлк />

      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 20, height: 84, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 40px", boxSizing: "border-box", transition: "background .3s, border-color .3s",
        // Сплошная, без размытия: полупрозрачная шапка мутила заголовки,
        // проезжающие под ней, — текст выглядел наполовину размытым.
        background: прокручено ? Ц.фон : "transparent", borderBottom: `1px solid ${прокручено ? Ц.линия : "transparent"}`,
      }}>
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", color: Ц.лёд, fontFamily: ШРИФТ }}>
          <Звезда size={44} />
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em" }}>Mintly</span>
        </button>
        <nav style={{ display: "flex", gap: 10, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          {МЕНЮ.map(([имя, д]) => (
            <button key={имя} className="прив-ссылка" onClick={д} style={{ color: Ц.тусклый, fontFamily: ШРИФТ, fontSize: 19, fontWeight: 600, padding: "10px 20px" }}>{имя}</button>
          ))}
        </nav>
        <button onClick={() => setОкно(true)} style={{ ...кнопкаГлавная, height: 42, padding: "0 22px", fontSize: 15 }}>Войти</button>
      </header>
      <БегущаяСтрока сверху={84} />

      {/* Начало — как первый кадр ролика: знак и имя, за ними медленный свет. */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <div style={{ position: "relative", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div style={{ animation: "прив-звезда 1.1s cubic-bezier(.2,.8,.2,1) both" }}><Звезда size={92} /></div>
            <div style={{ fontSize: 128, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1, animation: "прив-вход 1s .25s cubic-bezier(.2,.7,.2,1) both" }}>Mintly</div>
          </div>
          <div className="прив-серый" style={{ fontSize: 26, color: Ц.тусклый, marginTop: 26, fontWeight: 600, animation: "прив-вход 1s .55s cubic-bezier(.2,.7,.2,1) both" }}>
            Почувствуй <span style={{ color: Ц.лёд }}>лёгкость</span> мемкоинов.
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 40, animation: "прив-вход 1s .8s cubic-bezier(.2,.7,.2,1) both" }}>
            <button onClick={() => setОкно(true)} style={кнопкаГлавная}>Войти</button>
          </div>
        </div>
        <СтрелкаВниз видна={!прокручено} onClick={() => document.getElementById("запуск")?.scrollIntoView({ behavior: "smooth" })} />
      </section>

      <Раздел id="запуск"
        текст={<><Строки верх="Запуск токена" низ="за секунды" /><Пояснение ключ="archCurveBody" /></>}
        картинка={<СценаЗапуска />} />

      <Раздел id="сети" обратно
        текст={<><Строки верх="Все сети" низ="в одном месте" /><Пояснение ключ="archDataBody" /></>}
        картинка={<СценаСетей />} />

      <Раздел id="комиссия"
        текст={<><Строки верх="Комиссия" низ="0%" размер={80} /><Пояснение ключ="archFeeBody" /></>}
        картинка={<Комиссия />} />

      <Раздел id="покупка" обратно
        текст={<><Строки верх="Покупка" низ="за секунду" /><Пояснение ключ="archKeysBody" /></>}
        картинка={<СценаПокупки />} />

      <section style={{ minHeight: "92vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 70, padding: "80px 40px" }}>
        <Появись style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
            Доведи токен до <span className="прив-серый" style={{ color: Ц.тусклый }}>DEX</span> —<br />получи <span className="прив-серый" style={{ color: Ц.тусклый }}>лимитированную</span> карту
          </div>
          <Пояснение ключ="archSupplyBody" поЦентру />
        </Появись>
        <Появись задержка={150}><КартаDEX /></Появись>
      </section>

      <section style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 40px" }}>
        <Появись style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Строки верх="Один аккаунт" низ="на телефоне и ПК" размер={80} />
          <Пояснение ключ="archRiskBody" поЦентру />
          <button onClick={() => setОкно(true)} style={{ ...кнопкаГлавная, height: 66, padding: "0 64px", fontSize: 20, borderRadius: 18, marginTop: 38 }}>Начать</button>
        </Появись>
      </section>

    </div>
  );
}

/* Возврат с X. Сервер кладёт в адрес либо одноразовый вход в аккаунт,
   к которому X уже привязан (x_token), либо заготовку регистрации (x) —
   её подхватывает окно регистрации приложения. Адрес сразу чистим:
   ссылка с входом не должна остаться в истории. */
function разобратьВозвратX() {
  const п = new URLSearchParams(window.location.search);
  const итог = { токен: п.get("x_token"), заготовка: п.get("x"), беда: п.get("x_error") };
  if (итог.токен || итог.заготовка || итог.беда) {
    ["x_token", "x", "x_error"].forEach((к) => п.delete(к));
    const хвост = п.toString();
    window.history.replaceState(null, "", window.location.pathname + (хвост ? `?${хвост}` : "") + window.location.hash);
  }
  if (итог.заготовка) { try { sessionStorage.setItem("mintly_x_web", итог.заготовка); } catch (e) { /* приватный режим */ } }
  return итог;
}
const ВОЗВРАТ_X = typeof window !== "undefined" ? разобратьВозвратX() : {};

/* Вошёл ли человек — сперва по памяти браузера, без сети. Раньше сайт
   ничего не показывал, пока база не подтвердит сессию и профиль: два
   сетевых круга пустого экрана на каждом открытии. Теперь страница
   рисуется сразу по сохранённой сессии, а проверка идёт следом. */
function сессияВПамяти() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const к = localStorage.key(i);
      if (к && /^sb-.+-auth-token$/.test(к) && localStorage.getItem(к)) return true;
    }
  } catch (e) { /* хранилище закрыто */ }
  return false;
}

export default function PC() {
  // null — ещё проверяем; false — нужен вход; true — можно в приложение.
  // Возврат из X со ссылкой входа — единственный случай, когда ждём:
  // сессия появится только после обмена ссылки, и приветствие мигнуло бы.
  const [вошёл, setВошёл] = useState(() => (ВОЗВРАТ_X.токен ? null : сессияВПамяти()));
  // Раздел, который гость открыл из шапки, — с ним показывается приложение.
  const [раздел, setРаздел] = useState(ВОЗВРАТ_X.заготовка || ВОЗВРАТ_X.беда ? "home" : null);
  useEffect(() => {
    if (!ВОЗВРАТ_X.токен) return;
    // Вход через X — тоже вход руками: отметка «вышел сам» иначе
    // закрывала бы сессию при первом же обновлении страницы.
    try { localStorage.removeItem("mintly_signed_out"); } catch (e) { /* приватный режим */ }
    supabase.auth.verifyOtp({ token_hash: ВОЗВРАТ_X.токен, type: "magiclink" }).catch(() => {});
  }, []);
  useEffect(() => {
    let жив = true;
    const проверить = async () => {
      const { data } = await supabase.auth.getSession();
      const сессия = data && data.session;
      if (!сессия) { window.__ПК_ПРОФИЛЬ_ЕСТЬ = false; if (жив) setВошёл(false); return; }
      const { data: строка, error } = await supabase.from("profiles").select("id").eq("id", сессия.user.id).maybeSingle();
      // Сбой связи — это «не узнали», а не «нет»: уже открытый сайт из-за
      // него не закрываем.
      if (error) { if (жив) setВошёл((было) => (было === null ? true : было)); return; }
      window.__ПК_ПРОФИЛЬ_ЕСТЬ = !!строка;
      if (жив) setВошёл(!!строка);
    };
    проверить();
    const { data: подписка } = supabase.auth.onAuthStateChange(() => { проверить(); });
    return () => { жив = false; подписка && подписка.subscription && подписка.subscription.unsubscribe(); };
  }, []);
  if (вошёл === null) return null;
  if (!вошёл && !раздел) return <Приветствие onРаздел={(р) => { window.__ПК_РАЗДЕЛ = р; setРаздел(р); }} />;
  return (
    <>
      <TonLaunchApp />
    </>
  );
}
