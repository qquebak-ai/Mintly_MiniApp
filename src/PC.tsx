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
        <a href={`https://t.me/${БОТ}`} target="_blank" rel="noreferrer" style={{ color: Ц.тусклый, fontSize: 13.5, textAlign: "center", textDecoration: "none", marginTop: 6 }}>
          Нет аккаунта? Создай его в Telegram
        </a>
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
@keyframes прив-вход { from { opacity: 0; transform: translateY(26px); filter: blur(8px) } to { opacity: 1; transform: none; filter: none } }
@keyframes прив-свет { 0% { transform: translate(-30%, -10%) rotate(-18deg) } 50% { transform: translate(10%, 6%) rotate(-12deg) } 100% { transform: translate(-30%, -10%) rotate(-18deg) } }
@keyframes прив-плыть { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-12px) } }
@keyframes прив-звезда { from { transform: rotate(-90deg) scale(.4); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes прив-окно { from { opacity: 0; transform: translateY(18px) scale(.97) } to { opacity: 1; transform: none } }
@keyframes прив-фон { from { opacity: 0 } to { opacity: 1 } }
.прив-появись { opacity: 0; transform: translateY(40px); filter: blur(10px); transition: opacity .9s cubic-bezier(.2,.7,.2,1), transform .9s cubic-bezier(.2,.7,.2,1), filter .9s cubic-bezier(.2,.7,.2,1) }
.прив-появись.видно { opacity: 1; transform: none; filter: none }
.прив-ссылка { background: none; border: none; cursor: pointer; padding: 8px 14px; border-radius: 10px; transition: background .15s, color .15s }
.прив-ссылка:hover { background: var(--прив-над) }
@media (prefers-reduced-motion: reduce) { .прив-появись { opacity: 1; transform: none; filter: none; transition: none } * { animation-duration: 0s !important } }
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

function Появись({ children, задержка = 0, style = {} }) {
  const [реф, видно] = useПоявление();
  return <div ref={реф} className={"прив-появись" + (видно ? " видно" : "")} style={{ transitionDelay: `${задержка}ms`, ...style }}>{children}</div>;
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

function Телефон({ src, наклон = 0, children }) {
  return (
    <div style={{ position: "relative", animation: "прив-плыть 7s ease-in-out infinite" }}>
      <div style={{
        width: 330, aspectRatio: "1179 / 2394", borderRadius: 52, padding: 10, background: СВЕТЛАЯ ? "#E9E9EB" : "#151517",
        border: `1px solid ${Ц.линия}`, boxShadow: СВЕТЛАЯ ? "0 40px 90px rgba(0,0,0,.16)" : "0 40px 120px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.04) inset",
        transform: `perspective(1400px) rotateY(${наклон}deg)`,
      }}>
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 42, display: "block" }} />
      </div>
      {children}
    </div>
  );
}

// Плашка-уведомление, как всплывает в приложении после действия.
function Плашка({ заголовок, подпись, время, style }) {
  return (
    <div style={{
      position: "absolute", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 16,
      background: СВЕТЛАЯ ? "rgba(255,255,255,.9)" : "rgba(20,20,22,.88)", backdropFilter: "blur(16px)",
      border: `1px solid ${СВЕТЛАЯ ? "rgba(0,163,76,.35)" : "rgba(46,232,122,.35)"}`, boxShadow: "0 18px 50px rgba(0,0,0,.35)", ...style,
    }}>
      <div style={{ width: 28, height: 28, borderRadius: 999, background: "rgba(46,232,122,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2EE87A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      <div>
        <div style={{ color: Ц.лёд, fontSize: 15, fontWeight: 800 }}>{заголовок}</div>
        <div style={{ color: Ц.тусклый, fontSize: 12.5, marginTop: 2 }}>{подпись}</div>
      </div>
      <div style={{ color: "#2EE87A", fontSize: 15, fontWeight: 800, marginLeft: 14, fontVariantNumeric: "tabular-nums" }}>{время}</div>
    </div>
  );
}

// Счёт от 0,8% к 0%: в ролике комиссия «тает» на глазах.
function Комиссия() {
  const [реф, видно] = useПоявление();
  const [доля, setДоля] = useState(0.8);
  useEffect(() => {
    if (!видно) return;
    let кадр; const старт = performance.now() + 500;
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
  return (
    <div style={{ perspective: 1200 }}>
      <div style={{
        width: 420, height: 264, borderRadius: 24, padding: 26, boxSizing: "border-box", position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg,#8E8E93 0%,#3A3A3E 38%,#D9D9DE 62%,#4A4A4F 100%)",
        boxShadow: "0 50px 120px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.12) inset",
        transform: "rotateX(18deg) rotateZ(-8deg)", animation: "прив-плыть 6s ease-in-out infinite",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg,transparent 30%,rgba(255,255,255,.35) 48%,transparent 62%)" }} />
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
  );
}

function Раздел({ id, текст, картинка, обратно = false }) {
  return (
    <section id={id} style={{ minHeight: "92vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 64px", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 1180, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 80, flexDirection: обратно ? "row-reverse" : "row" }}>
        <Появись style={{ flex: 1 }}>{текст}</Появись>
        <Появись задержка={150} style={{ flexShrink: 0 }}>{картинка}</Появись>
      </div>
    </section>
  );
}

function Приветствие() {
  const [окно, setОкно] = useState(false);
  const [прокручено, setПрокручено] = useState(false);
  useEffect(() => { const ш = document.getElementById("ширма"); if (ш) ш.remove(); }, []);
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
  const кнопкаВторая = { ...кнопкаГлавная, background: "transparent", color: Ц.лёд, border: `1px solid ${Ц.линия}`, textDecoration: "none", display: "inline-flex", alignItems: "center" };

  return (
    <div style={{ background: Ц.фон, color: Ц.лёд, fontFamily: ШРИФТ, minHeight: "100vh", overflowX: "hidden", "--прив-над": СВЕТЛАЯ ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.06)" }}>
      <style>{СТИЛЬ_ПРИВЕТСТВИЯ}</style>

      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 20, height: 72, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 40px", boxSizing: "border-box", transition: "background .3s, border-color .3s",
        background: прокручено ? (СВЕТЛАЯ ? "rgba(255,255,255,.78)" : "rgba(0,0,0,.6)") : "transparent",
        backdropFilter: прокручено ? "blur(20px) saturate(1.4)" : "none", borderBottom: `1px solid ${прокручено ? Ц.линия : "transparent"}`,
      }}>
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", color: Ц.лёд, fontFamily: ШРИФТ }}>
          <Звезда size={34} />
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Mintly</span>
        </button>
        <nav style={{ display: "flex", gap: 4, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          {МЕНЮ.map(([имя, д]) => (
            <button key={имя} className="прив-ссылка" onClick={д} style={{ color: Ц.тусклый, fontFamily: ШРИФТ, fontSize: 15, fontWeight: 600 }}>{имя}</button>
          ))}
        </nav>
        <button onClick={() => setОкно(true)} style={{ ...кнопкаГлавная, height: 42, padding: "0 22px", fontSize: 15 }}>Войти</button>
      </header>

      {/* Начало — как первый кадр ролика: знак и имя, за ними медленный свет. */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <div aria-hidden style={{
          position: "absolute", width: "140%", height: 420, top: "30%", left: "-20%", filter: "blur(70px)",
          background: СВЕТЛАЯ ? "linear-gradient(90deg,transparent,rgba(0,0,0,.08),transparent)" : "linear-gradient(90deg,transparent,rgba(255,255,255,.16),transparent)",
          animation: "прив-свет 14s ease-in-out infinite",
        }} />
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
            <a href={`https://t.me/${БОТ}`} target="_blank" rel="noreferrer" style={кнопкаВторая}>Открыть в Telegram</a>
          </div>
        </div>
        <div aria-hidden style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", color: Ц.тусклый, fontSize: 13, animation: "прив-вход 1s 1.4s both" }}>Листай вниз</div>
      </section>

      <Раздел id="запуск"
        текст={<><Строки верх="Запуск токена" низ="за секунды" /><p style={{ color: Ц.тусклый, fontSize: 19, lineHeight: 1.55, maxWidth: 460, marginTop: 24 }}>Логотип, название, тикер — и монета уже торгуется на кривой. Без кода и без биржи.</p></>}
        картинка={<Телефон src="/landing/create-12.webp" наклон={-8}><Плашка заголовок="Токен запущен" подпись="$MINT · Gram" время="2,8 с" style={{ left: -150, bottom: 140 }} /></Телефон>} />

      <Раздел id="сети" обратно
        текст={<><Строки верх="Gram и Solana" низ="в одном месте" /><p style={{ color: Ц.тусклый, fontSize: 19, lineHeight: 1.55, maxWidth: 460, marginTop: 24 }}>Новые, трендовые и почти вышедшие на биржу — живая лента запусков обеих сетей.</p></>}
        картинка={<Телефон src="/landing/pad.webp" наклон={8} />} />

      <Раздел id="комиссия"
        текст={<Строки верх="Комиссия" низ="0%" размер={80} />}
        картинка={<Комиссия />} />

      <Раздел id="покупка" обратно
        текст={<><Строки верх="Покупка" низ="за секунду" /><p style={{ color: Ц.тусклый, fontSize: 19, lineHeight: 1.55, maxWidth: 460, marginTop: 24 }}>Сумма, одно нажатие — и токены в кошельке. Свечи графика двигаются вместе со сделками.</p></>}
        картинка={<Телефон src="/landing/buy.webp" наклон={8}><Плашка заголовок="Куплено" подпись="48 200 MINT · комиссия 0%" время="0,9 с" style={{ right: -140, top: 120 }} /></Телефон>} />

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
          <Строки верх="Прямо" низ="в Telegram" размер={80} />
          <p style={{ color: Ц.тусклый, fontSize: 19, marginTop: 22 }}>Тот же аккаунт на телефоне и на компьютере.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 34 }}>
            <button onClick={() => setОкно(true)} style={кнопкаГлавная}>Войти</button>
            <a href={`https://t.me/${БОТ}`} target="_blank" rel="noreferrer" style={кнопкаВторая}>Открыть @{БОТ}</a>
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
