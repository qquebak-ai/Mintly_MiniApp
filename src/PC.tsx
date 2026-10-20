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
import { профильЕсть, войтиФантомом } from "./DesktopAuth";
import { запомнитьСтраницу } from "./oauthВозврат";
import TonLaunchApp from "./App";
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

function Кнопка({ children, onClick, disabled = false, главная = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", height: 52, borderRadius: 14, border: "none", cursor: disabled ? "default" : "pointer",
        background: главная ? Ц.лёд : Ц.выше, color: главная ? Ц.наЛьду : Ц.лёд,
        fontFamily: ШРИФТ, fontSize: 16, fontWeight: 800, opacity: disabled ? 0.5 : 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      }}
    >
      {children}
    </button>
  );
}

function ВходПК({ вОкне = false }) {
  const [способ, setСпособ] = useState(null); // null | "почта"
  const [почта, setПочта] = useState("");
  const [код, setКод] = useState("");
  const [шаг, setШаг] = useState("адрес"); // адрес | код
  const [идёт, setИдёт] = useState(false);
  const [беда, setБеда] = useState("");
  const виджет = useRef(null);
  // Заставку из index.html убирает само приложение; до него при входе
  // дело не доходит, поэтому снимаем её здесь.
  useEffect(() => { const ш = document.getElementById("ширма"); if (ш) ш.remove(); }, []);

  /* Кнопка Telegram. Виджет рисует её сам в своём окне и отдаёт данные
     в onTelegramAuth — сервер сверяет подпись и открывает сессию того же
     аккаунта, что в мини-приложении. */
  useEffect(() => {
    window.onTelegramAuth = async (данные) => {
      setБеда("");
      setИдёт(true);
      try {
        const r = await fetch(апи("/api/telegram-auth?action=widget"), {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(данные),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(j.error === "no_account" ? "Аккаунта ещё нет — создай его в Telegram, потом войди здесь" : "Не получилось войти через Telegram. Попробуй ещё раз");
        }
        const { error } = await supabase.auth.verifyOtp({ token_hash: j.token_hash, type: "magiclink" });
        if (error) throw new Error("Не получилось войти. Попробуй ещё раз");
      } catch (e) {
        setБеда(String((e && e.message) || e));
      } finally {
        setИдёт(false);
      }
    };
    const место = виджет.current;
    if (место && !место.firstChild) {
      const с = document.createElement("script");
      с.async = true;
      с.src = "https://telegram.org/js/telegram-widget.js?22";
      с.setAttribute("data-telegram-login", БОТ);
      с.setAttribute("data-size", "large");
      с.setAttribute("data-radius", "14");
      с.setAttribute("data-onauth", "onTelegramAuth(user)");
      с.setAttribute("data-request-access", "write");
      место.appendChild(с);
    }
    return () => { delete window.onTelegramAuth; };
  }, []);

  async function прислатьКод() {
    setБеда("");
    setИдёт(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: почта.trim().toLowerCase(), options: { shouldCreateUser: false } });
      if (error) throw error;
      setШаг("код");
    } catch (e) {
      const т = String((e && e.message) || "");
      setБеда(/signups not allowed|not found|user/i.test(т) ? "Такой почты нет ни у одного аккаунта. Привяжи её в приложении: Настройки → Безопасность → Почта для 2ФА"
        : /rate|seconds/i.test(т) ? "Слишком часто. Подожди минуту и попробуй снова" : "Письмо не ушло. Попробуй ещё раз");
    } finally {
      setИдёт(false);
    }
  }
  async function войтиКодом() {
    setБеда("");
    setИдёт(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: почта.trim().toLowerCase(), token: код.trim(), type: "email" });
      if (error) throw error;
    } catch {
      setБеда("Код не подошёл или устарел. Запроси новый");
    } finally {
      setИдёт(false);
    }
  }
  async function google() {
    setБеда("");
    запомнитьСтраницу();
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } });
    if (error) setБеда("Не получилось открыть вход Google");
  }
  async function фантом() {
    setБеда("");
    setИдёт(true);
    try { await войтиФантомом(); } catch (e) { setБеда(String((e && e.message) || "Не получилось войти через Phantom")); } finally { setИдёт(false); }
  }

  const поле = {
    width: "100%", height: 52, padding: "0 16px", borderRadius: 14, boxSizing: "border-box", outline: "none",
    background: Ц.выше, border: `1px solid ${Ц.линия}`, color: Ц.лёд, fontFamily: ШРИФТ, fontSize: 16,
  };
  return (
    <div style={вОкне ? { fontFamily: ШРИФТ } : { minHeight: "100vh", background: Ц.фон, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: ШРИФТ }}>
      <div style={{ width: "100%", maxWidth: 420, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 40, fontWeight: 900, color: Ц.лёд, letterSpacing: "-0.03em" }}>Mintly</div>
          <div style={{ fontSize: 15, color: Ц.тусклый, marginTop: 6 }}>Войди в тот же аккаунт, что в Telegram</div>
        </div>
        <div ref={виджет} style={{ display: "flex", justifyContent: "center", minHeight: 48 }} />
        {способ !== "почта" ? (
          <Кнопка onClick={() => setСпособ("почта")} disabled={идёт}>Войти кодом с почты</Кнопка>
        ) : шаг === "адрес" ? (
          <>
            <input id="pc-mail" value={почта} onChange={(e) => setПочта(e.target.value)} placeholder="Почта из приложения" type="email" style={поле} />
            <Кнопка главная onClick={прислатьКод} disabled={идёт || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(почта.trim())}>{идёт ? "Отправляем…" : "Прислать код"}</Кнопка>
          </>
        ) : (
          <>
            <div style={{ color: Ц.тусклый, fontSize: 14, textAlign: "center" }}>Код отправлен на {почта.trim()}</div>
            <input id="pc-code" value={код} onChange={(e) => setКод(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Код из письма" inputMode="numeric" style={{ ...поле, textAlign: "center", letterSpacing: "0.3em", fontSize: 20 }} />
            <Кнопка главная onClick={войтиКодом} disabled={идёт || код.length < 6}>{идёт ? "Проверяем…" : "Войти"}</Кнопка>
          </>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <Кнопка onClick={google} disabled={идёт}>Google</Кнопка>
          <Кнопка onClick={фантом} disabled={идёт}>Phantom</Кнопка>
        </div>
        {беда && <div style={{ color: Ц.вниз, fontSize: 14, textAlign: "center", lineHeight: 1.45 }}>{беда}</div>}
        <div style={{ color: Ц.тусклый, fontSize: 13.5, textAlign: "center", marginTop: 6 }}>
          Аккаунт создаётся в приложении Mintly
        </div>
      </div>
    </div>
  );
}


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
@keyframes прив-блик { 0% { left: -70% } 55%,100% { left: 130% } }
.прив-появись { opacity: 0; transform: translate3d(0, 40px, 0); transition: opacity .9s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1) }
.прив-появись.слева { transform: translate3d(-160px, 0, 0); transition-duration: 1.2s }
.прив-появись.видно { opacity: 1; transform: none }
.прив-фон { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; contain: strict }

.прив-ссылка { background: none; border: none; cursor: pointer; padding: 8px 14px; border-radius: 10px; transition: background .15s, color .15s }
.прив-ссылка:hover { background: var(--прив-над) }
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
      <span style={{ color: Ц.тусклый }}>{низ}</span>
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
    <div style={{
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
        <div style={{ color: Ц.тусклый, fontSize: 12.5, marginTop: 2 }}>{подпись}</div>
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
      <Телефон src="/landing/create-12.webp" наЭкране={<Касание x={0.5} y={0.641} мс={мс} когда={нажал} />}>
        <Плашка видна={идёт || готово} ждём={!готово} заголовок={готово ? "Токен запущен" : "Запускаем…"} подпись="$MINT · Gram"
          время={сек(готово ? длится : Math.max(0, т))} style={{ left: -170, bottom: 150 }} />
      </Телефон>
    </div>
  );
}

/* Сети: рядом с телефоном — все сети приложения столбиком. Выбор сам
   идёт по кругу, и под ним всплывает свежий запуск в выбранной сети. */
const СЕТИ_ПРИВЕТСТВИЯ = [
  { имя: "Gram", лого: "/coins/gram.png", токен: "$LILY", цвет: "linear-gradient(135deg,#2AABEE,#1B6FB0)", рост: "+12,6%" },
  { имя: "Solana", лого: "/coins/sol.png", токен: "$PEPE", цвет: "linear-gradient(135deg,#14F195,#9945FF)", рост: "+18,4%" },
  { имя: "BNB Chain", лого: "/coins/bnb.svg", токен: "$BOO", цвет: "linear-gradient(135deg,#F3BA2F,#B8860B)", рост: "+9,1%" },
  { имя: "Base", лого: "/coins/base.svg", токен: "$PUP", цвет: "linear-gradient(135deg,#0052FF,#0A2D8F)", рост: "+24,9%" },
  { имя: "Ethereum", лого: "/coins/eth.svg", токен: "$WICK", цвет: "linear-gradient(135deg,#8C8CF7,#454A75)", рост: "+71,4%" },
];
const ШАГ_СЕТИ = 2200;
function СценаСетей() {
  const [реф, в] = useВКадре();
  const мс = useЧасы(в, ШАГ_СЕТИ * СЕТИ_ПРИВЕТСТВИЯ.length);
  const номер = мс < 0 ? 0 : Math.floor(мс / ШАГ_СЕТИ);
  const фаза = мс < 0 ? -1 : мс % ШАГ_СЕТИ;
  const с = СЕТИ_ПРИВЕТСТВИЯ[номер];
  const видна = фаза > 450 && фаза < ШАГ_СЕТИ - 250;
  return (
    <div ref={реф}>
      <Телефон src="/landing/pad.webp">
        <div style={{ position: "absolute", left: -250, top: 70, width: 210, padding: 6, borderRadius: 18, background: Ц.поверхность, border: `1px solid ${Ц.линия}`, boxShadow: "0 18px 50px rgba(0,0,0,.35)", display: "flex", flexDirection: "column", gap: 2 }}>
          {СЕТИ_ПРИВЕТСТВИЯ.map((н, i) => {
            const вкл = мс >= 0 && i === номер;
            return (
              <div key={н.имя} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 13, fontSize: 14.5, fontWeight: 700, transition: "background .35s, color .35s", background: вкл ? Ц.лёд : "transparent", color: вкл ? Ц.наЛьду : Ц.тусклый }}>
                <img src={н.лого} alt="" width={22} height={22} style={{ borderRadius: 999, display: "block" }} />{н.имя}
              </div>
            );
          })}
        </div>
        <div style={{
          position: "absolute", left: -290, top: 330, width: 260, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16,
          background: Ц.поверхность, border: `1px solid ${Ц.линия}`, boxShadow: "0 18px 50px rgba(0,0,0,.35)",
          transition: "opacity .35s, transform .45s cubic-bezier(.2,.8,.2,1)", opacity: видна ? 1 : 0, transform: видна ? "none" : "translate3d(0,12px,0)",
        }}>
          <div style={{ width: 36, height: 36, borderRadius: 999, background: с.цвет, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{с.токен[1]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: Ц.лёд, fontSize: 14.5, fontWeight: 800 }}>Новый запуск {с.токен}</div>
            <div style={{ color: Ц.тусклый, fontSize: 12.5, marginTop: 2 }}>{с.имя} · 1 с назад</div>
          </div>
          <div style={{ color: "#2EE87A", fontSize: 13.5, fontWeight: 800 }}>{с.рост}</div>
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
      <Телефон src="/landing/buy.webp" наЭкране={<Касание x={0.27} y={0.335} мс={мс} когда={нажал} />}>
        <Плашка видна={видна} ждём={!готово} заголовок={готово ? "Куплено" : "Покупаем…"} подпись="48 200 MINT · комиссия 0%"
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
      <span style={{ color: Ц.тусклый }}>{а}</span><span style={{ color: цвет || Ц.лёд, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{б}</span>
    </div>
  );
  return (
    <div ref={реф} style={{ width: 420, padding: 28, borderRadius: 24, background: Ц.поверхность, border: `1px solid ${Ц.линия}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: Ц.тусклый, fontSize: 14 }}><Звезда size={16} цвет={Ц.тусклый} /> Продажа $MINT</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, margin: "14px 0 18px" }}>
        <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.04em", color: ноль ? "#2EE87A" : Ц.лёд, fontVariantNumeric: "tabular-nums", transition: "color .4s" }}>
          {ноль ? "0" : доля.toFixed(1).replace(".", ",")}%
        </div>
        <div style={{ color: Ц.тусклый, fontSize: 13, paddingBottom: 12, lineHeight: 1.3 }}>комиссия<br />Mintly</div>
      </div>
      {ряд("Сумма сделки", "100,00 GRAM")}
      {ряд("Комиссия", `${комиссия} GRAM`, ноль ? "#2EE87A" : Ц.вниз)}
      {ряд("Вы получите", `${(100 - Number(комиссия.replace(",", "."))).toFixed(2).replace(".", ",")} GRAM`, "#2EE87A")}
    </div>
  );
}

function КартаDEX() {
  const [наклон, setНаклон] = useState({ x: 0, y: 0 });
  const двигать = (e) => {
    const р = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - р.left) / р.width - 0.5, dy = (e.clientY - р.top) / р.height - 0.5;
    setНаклон({ x: -dy * 14, y: dx * 18 });
  };
  return (
    <div style={{ perspective: 1200, padding: 40 }} onMouseMove={двигать} onMouseLeave={() => setНаклон({ x: 0, y: 0 })}>
      <div style={{ animation: "прив-плыть 6s ease-in-out infinite" }}>
        <div style={{
          width: 420, height: 264, borderRadius: 24, padding: 26, boxSizing: "border-box", position: "relative", overflow: "hidden",
          background: "linear-gradient(135deg,#8E8E93 0%,#3A3A3E 38%,#D9D9DE 62%,#4A4A4F 100%)",
          boxShadow: "0 50px 120px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.12) inset",
          transform: `rotateX(${наклон.x}deg) rotateY(${наклон.y}deg)`, transition: "transform .25s ease-out",
        }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, width: "60%", background: "linear-gradient(105deg,transparent 0%,rgba(255,255,255,.45) 50%,transparent 100%)", animation: "прив-блик 4.5s ease-in-out infinite" }} />
          <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
            <Звезда size={34} цвет="#FFFFFF" />
            <div style={{ textAlign: "right", color: "#fff" }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Mintly</div>
              <div style={{ fontSize: 10, letterSpacing: ".18em", opacity: .8, marginTop: 4 }}>LIMITED · DEX</div>
            </div>
          </div>
          <div style={{ position: "absolute", left: 26, bottom: 24, color: "#fff" }}>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em" }}>$MINT</div>
            <div style={{ fontSize: 13, opacity: .8 }}>Mintly</div>
          </div>
        </div>
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

/* Всё, что приветствие показывает, — заранее: шрифты и экраны телефонов.
   С font-display: swap текст сначала рисовался запасным шрифтом и на
   глазах перескакивал, а телефоны догружались уже на прокрутке. Заставка
   из index.html держится, пока это не готово (не дольше 2,5 с). */
const КАРТИНКИ_ПРИВЕТСТВИЯ = ["/landing/create-12.webp", "/landing/pad.webp", "/landing/buy.webp", "/logo-star.png", "/coins/gram.png", "/coins/sol.png", "/coins/bnb.svg", "/coins/base.svg", "/coins/eth.svg"];
function useГотовоПриветствие() {
  const [готово, setГотово] = useState(false);
  useEffect(() => {
    let жив = true;
    const шрифты = document.fonts ? ["400", "600", "800"].flatMap((в) => [
      document.fonts.load(`${в} 20px MintlyUI`, "Мintly"), document.fonts.load(`${в} 20px MintlyUI`, "Ая"),
    ]) : [];
    const картинки = КАРТИНКИ_ПРИВЕТСТВИЯ.map((src) => { const и = new Image(); и.src = src; return и.decode ? и.decode().catch(() => {}) : Promise.resolve(); });
    const стоп = new Promise((r) => setTimeout(r, 2500));
    Promise.race([Promise.all([...шрифты, ...картинки]).catch(() => {}), стоп]).then(() => { if (жив) setГотово(true); });
    return () => { жив = false; };
  }, []);
  useEffect(() => { if (!готово) return; const ш = document.getElementById("ширма"); if (ш) ш.remove(); }, [готово]);
  return готово;
}

/* Луч света за знаком в начале — как первый кадр ролика.
   Раньше это был div с blur(70px), который двигался: браузер заново
   размывал полосу шириной в полтора экрана каждый кадр, на мониторе это
   и давало рывки, а сам переход шёл ступенями. Теперь полоса рисуется
   один раз на холсте — размытие, плавный спад и шум в пикселях против
   ступеней, — а движется уже готовая картинка, только сдвигом. */
function ЛучПриветствия() {
  const холст = useRef(null);
  useEffect(() => {
    const к = холст.current;
    if (!к) return;
    const ш = 1800, в = 900;
    к.width = ш; к.height = в;
    const г = к.getContext("2d");
    const цвет = СВЕТЛАЯ ? "0,0,0" : "255,255,255";
    const сила = СВЕТЛАЯ ? 0.1 : 0.22;
    г.filter = "blur(90px)";
    const гр = г.createLinearGradient(0, 0, ш, 0);
    for (let i = 0; i <= 20; i++) { const t = i / 20; гр.addColorStop(t, `rgba(${цвет},${сила * Math.pow(Math.sin(Math.PI * t), 1.6)})`); }
    г.fillStyle = гр;
    г.beginPath(); г.ellipse(ш / 2, в / 2, ш * 0.42, в * 0.2, 0, 0, Math.PI * 2); г.fill();
    г.filter = "none";
    const д = г.getImageData(0, 0, ш, в), п = д.data;
    for (let i = 0; i < п.length; i += 4) {
      if (!п[i + 3]) continue;
      const н = (Math.random() + Math.random() - 1) * 6;
      п[i] = Math.max(0, Math.min(255, п[i] + н)); п[i + 1] = Math.max(0, Math.min(255, п[i + 1] + н)); п[i + 2] = Math.max(0, Math.min(255, п[i + 2] + н));
    }
    г.putImageData(д, 0, 0);
  }, []);
  // Низ начала уходит в чёрный плавно: иначе край раздела резал луч линией.
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", WebkitMaskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)", maskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)" }}>
      <canvas ref={холст} style={{
        position: "absolute", width: "130vw", height: "65vw", left: "-15vw", top: "50%", marginTop: "-32.5vw",
        animation: "прив-свет 16s ease-in-out infinite", willChange: "transform",
      }} />
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
function СтрелкаВниз({ onClick }) {
  return (
    <button onClick={onClick} aria-label="Дальше" style={{ position: "absolute", bottom: 34, left: "50%", marginLeft: -22, width: 44, height: 56, background: "none", border: "none", cursor: "pointer", animation: "прив-вход 1s 1.4s both" }}>
      <span style={{ display: "block", animation: "прив-удар 1.6s cubic-bezier(.45,0,.55,1) infinite", transformOrigin: "50% 100%" }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={Ц.тусклый} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto" }}><path d="M6 9.5l6 6 6-6" /></svg>
      </span>
      <span style={{ display: "block", width: 18, height: 2, borderRadius: 2, margin: "6px auto 0", background: Ц.линия }} />
    </button>
  );
}

function Приветствие() {
  const готово = useГотовоПриветствие();
  const [окно, setОкно] = useState(false);
  const [прокручено, setПрокручено] = useState(false);
  useEffect(() => {
    const н = () => setПрокручено(window.scrollY > 20);
    window.addEventListener("scroll", н, { passive: true });
    return () => window.removeEventListener("scroll", н);
  }, []);
  useEffect(() => {
    if (!окно) return;
    const к = (e) => { if (e.key === "Escape") setОкно(false); };
    window.addEventListener("keydown", к);
    return () => window.removeEventListener("keydown", к);
  }, [окно]);
  const кМемпаду = () => document.getElementById("сети")?.scrollIntoView({ behavior: "smooth" });
  // Остальные разделы — личные: без входа в них нечего показать.
  const МЕНЮ = [["Мемпад", кМемпаду], ["Создать", () => setОкно(true)], ["Кошелёк", () => setОкно(true)], ["Профиль", () => setОкно(true)]];
  const кнопкаГлавная = { height: 48, padding: "0 26px", borderRadius: 14, border: "none", cursor: "pointer", background: Ц.лёд, color: Ц.наЛьду, fontFamily: ШРИФТ, fontSize: 16, fontWeight: 800 };

  if (!готово) return null;
  return (
    <div style={{ background: Ц.фон, color: Ц.лёд, fontFamily: ШРИФТ, minHeight: "100vh", overflowX: "hidden", isolation: "isolate", position: "relative", "--прив-над": СВЕТЛАЯ ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.06)" }}>
      <style>{СТИЛЬ_ПРИВЕТСТВИЯ}</style>

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

      {/* Начало — как первый кадр ролика: знак и имя, за ними медленный свет. */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <ЛучПриветствия />
        <div style={{ position: "relative", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div style={{ animation: "прив-звезда 1.1s cubic-bezier(.2,.8,.2,1) both" }}><Звезда size={92} /></div>
            <div style={{ fontSize: 128, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1, animation: "прив-вход 1s .25s cubic-bezier(.2,.7,.2,1) both" }}>Mintly</div>
          </div>
          <div style={{ fontSize: 26, color: Ц.тусклый, marginTop: 26, fontWeight: 600, animation: "прив-вход 1s .55s cubic-bezier(.2,.7,.2,1) both" }}>
            Почувствуй <span style={{ color: Ц.лёд }}>лёгкость</span> мемкоинов.
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 40, animation: "прив-вход 1s .8s cubic-bezier(.2,.7,.2,1) both" }}>
            <button onClick={() => setОкно(true)} style={кнопкаГлавная}>Войти</button>
          </div>
        </div>
        <СтрелкаВниз onClick={() => document.getElementById("запуск")?.scrollIntoView({ behavior: "smooth" })} />
      </section>

      <Раздел id="запуск"
        текст={<><Строки верх="Запуск токена" низ="за секунды" /><p style={{ color: Ц.тусклый, fontSize: 19, lineHeight: 1.55, maxWidth: 460, marginTop: 24 }}>Логотип, название, тикер — и монета уже торгуется на кривой. Без кода и без биржи.</p></>}
        картинка={<СценаЗапуска />} />

      <Раздел id="сети" обратно
        текст={<><Строки верх="Все сети" низ="в одном месте" /><p style={{ color: Ц.тусклый, fontSize: 19, lineHeight: 1.55, maxWidth: 460, marginTop: 24 }}>Gram, Solana, BNB Chain, Base и Ethereum — живая лента запусков всех сетей.</p></>}
        картинка={<СценаСетей />} />

      <Раздел id="комиссия"
        текст={<Строки верх="Комиссия" низ="0%" размер={80} />}
        картинка={<Комиссия />} />

      <Раздел id="покупка" обратно
        текст={<><Строки верх="Покупка" низ="за секунду" /><p style={{ color: Ц.тусклый, fontSize: 19, lineHeight: 1.55, maxWidth: 460, marginTop: 24 }}>Сумма, одно нажатие — и токены в кошельке. Свечи графика двигаются вместе со сделками.</p></>}
        картинка={<СценаПокупки />} />

      <section style={{ minHeight: "92vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 70, padding: "80px 40px" }}>
        <Появись style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2 }}>
            Доведи токен до <span style={{ color: Ц.тусклый }}>DEX</span> —<br />получи <span style={{ color: Ц.тусклый }}>лимитированную</span> карту
          </div>
        </Появись>
        <Появись задержка={150}><КартаDEX /></Появись>
      </section>

      <section style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 40px" }}>
        <Появись style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Строки верх="Один аккаунт" низ="на телефоне и ПК" размер={80} />
          <p style={{ color: Ц.тусклый, fontSize: 19, marginTop: 22 }}>Токены, кошелёк и история — те же, что в приложении.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 34 }}>
            <button onClick={() => setОкно(true)} style={кнопкаГлавная}>Войти</button>
          </div>
        </Появись>
      </section>

      <footer style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "60px 0 70px", borderTop: `1px solid ${Ц.линия}` }}>
        <Звезда size={30} />
        <div style={{ fontSize: 17, fontWeight: 800 }}>Сделано в <span style={{ color: Ц.тусклый }}>Mintly.</span></div>
      </footer>

      {окно && (
        <div onClick={() => setОкно(false)} style={{
          position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
          background: СВЕТЛАЯ ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.6)", backdropFilter: "blur(18px)", animation: "прив-фон .25s ease both",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: 480, maxWidth: "calc(100vw - 32px)", padding: "36px 30px 28px", boxSizing: "border-box", borderRadius: 26, position: "relative",
            background: Ц.поверхность, border: `1px solid ${Ц.линия}`, boxShadow: "0 40px 120px rgba(0,0,0,.5)", animation: "прив-окно .35s cubic-bezier(.2,.8,.2,1) both",
          }}>
            <button onClick={() => setОкно(false)} aria-label="Закрыть" style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: 999, border: "none", background: Ц.выше, color: Ц.тусклый, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
            <ВходПК вОкне />
          </div>
        </div>
      )}
    </div>
  );
}

export default function PC() {
  // null — ещё проверяем; false — нужен вход; true — можно в приложение.
  const [вошёл, setВошёл] = useState(null);
  useEffect(() => {
    let жив = true;
    const проверить = async () => {
      const { data } = await supabase.auth.getSession();
      const есть = !!(data && data.session) && (await профильЕсть());
      if (жив) setВошёл(есть);
    };
    проверить();
    const { data: подписка } = supabase.auth.onAuthStateChange(() => { проверить(); });
    return () => { жив = false; подписка && подписка.subscription && подписка.subscription.unsubscribe(); };
  }, []);
  if (вошёл === null) return <div style={{ position: "fixed", inset: 0, background: Ц.фон }} />;
  if (!вошёл) return <Приветствие />;
  return <TonLaunchApp />;
}
