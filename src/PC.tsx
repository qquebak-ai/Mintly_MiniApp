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
const Ц = { фон: "#000000", поверхность: "#141416", выше: "#1C1C1F", линия: "rgba(255,255,255,0.08)", лёд: "#F2F2F0", тусклый: "#8E8E93", вниз: "#FF4D5E" };
const ШРИФТ = "'MintlyUI', 'Jost', system-ui, sans-serif";

function Кнопка({ children, onClick, disabled = false, главная = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", height: 52, borderRadius: 14, border: "none", cursor: disabled ? "default" : "pointer",
        background: главная ? Ц.лёд : Ц.выше, color: главная ? "#0B0B0F" : Ц.лёд,
        fontFamily: ШРИФТ, fontSize: 16, fontWeight: 800, opacity: disabled ? 0.5 : 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      }}
    >
      {children}
    </button>
  );
}

function ВходПК() {
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
    <div style={{ minHeight: "100vh", background: Ц.фон, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: ШРИФТ }}>
      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 14 }}>
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
  if (вошёл === null) return <div style={{ position: "fixed", inset: 0, background: "#000" }} />;
  if (!вошёл) return <ВходПК />;
  return <TonLaunchApp />;
}
